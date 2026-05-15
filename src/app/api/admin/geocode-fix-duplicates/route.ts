// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/geocode-fix-duplicates
// 같은 lat/lng 좌표를 가진 매물 그룹을 찾아 재계산
// 사장님 명령 2026-05-14: 100% 정확한 위치 보장
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

async function kakaoAddress(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const doc = d?.documents?.[0];
    if (!doc) return null;
    return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
  } catch { return null; }
}

async function kakaoKeyword(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const doc = d?.documents?.[0];
    if (!doc) return null;
    return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
  } catch { return null; }
}

// 주소 정규화 — 호수/층 제거
function normalizeAddress(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  // 층/호 제거 (예: "...4층 102" → "...")
  s = s.replace(/\s*\d+층\s*\d*$/, '');
  s = s.replace(/\s*\d+호\s*$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

async function geocodeOne(addr: string): Promise<{ lat: number; lng: number } | null> {
  if (!addr) return null;
  const cleaned = normalizeAddress(addr);
  // 1) 정확한 주소 검색
  let result = await kakaoAddress(cleaned);
  if (result) return result;
  // 2) 키워드 fallback
  result = await kakaoKeyword(cleaned);
  if (result) return result;
  // 3) 원본 주소 시도
  return await kakaoAddress(addr);
}

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }
    if (!KAKAO_REST_API_KEY) {
      return NextResponse.json({ success: false, error: 'KAKAO_REST_API_KEY 미설정' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const limit = Math.min(parseInt(body.limit || '100', 10), 500);

    const supabase = createServerClient();

    // 같은 lat/lng 그룹 찾기 (3개 이상 같은 좌표)
    const { data: dupGroups, error: groupErr } = await supabase
      .rpc('find_duplicate_coordinates', { min_count: 2 });

    // RPC 가 없으면 raw query
    let groups: { lat: number; lng: number; ids: number[]; addresses: string[] }[] = [];
    if (groupErr || !dupGroups) {
      // fallback: 전체 매물 fetch + client side group
      const { data: all, error: allErr } = await supabase
        .from('listings')
        .select('id, lat, lng, address')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .eq('status', '공개')
        .limit(50000);
      if (allErr) {
        return NextResponse.json({ success: false, error: allErr.message }, { status: 500 });
      }
      const map = new Map<string, { lat: number; lng: number; ids: number[]; addresses: string[] }>();
      (all || []).forEach((l: any) => {
        const key = `${l.lat.toFixed(8)},${l.lng.toFixed(8)}`;
        if (!map.has(key)) {
          map.set(key, { lat: l.lat, lng: l.lng, ids: [], addresses: [] });
        }
        const g = map.get(key)!;
        g.ids.push(l.id);
        g.addresses.push(l.address || '');
      });
      groups = Array.from(map.values()).filter((g) => g.ids.length >= 2);
    } else {
      groups = (dupGroups as any[]) || [];
    }

    // 통계
    const totalGroups = groups.length;
    const totalListings = groups.reduce((s, g) => s + g.ids.length, 0);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        totalGroups,
        totalListings,
        sampleGroups: groups.slice(0, 5).map((g) => ({
          lat: g.lat, lng: g.lng, count: g.ids.length, sampleIds: g.ids.slice(0, 3),
          sampleAddrs: g.addresses.slice(0, 3),
        })),
      });
    }

    // 재계산 — 그룹의 각 매물별 (첫 번째 매물은 그대로 유지, 나머지 재계산)
    const updates: { id: number; lat: number; lng: number; addr: string }[] = [];
    let processed = 0;
    let updated = 0;
    let skipped = 0;

    for (const g of groups.slice(0, limit)) {
      // 그룹 안 첫 번째 매물은 keep, 나머지 재계산
      for (let i = 0; i < g.ids.length; i++) {
        if (i === 0) continue; // 대표 매물 keep
        const id = g.ids[i];
        const addr = g.addresses[i];
        if (!addr) { skipped++; continue; }
        processed++;
        const result = await geocodeOne(addr);
        if (!result) { skipped++; continue; }
        // 결과가 그룹의 lat/lng 와 다르면 update
        if (Math.abs(result.lat - g.lat) > 0.00001 || Math.abs(result.lng - g.lng) > 0.00001) {
          updates.push({ id, lat: result.lat, lng: result.lng, addr });
          updated++;
        } else {
          skipped++;
        }
        // rate limit (kakao 30 req/sec free tier)
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    // DB update batch
    let dbUpdated = 0;
    for (const u of updates) {
      const { error } = await supabase
        .from('listings')
        .update({ lat: u.lat, lng: u.lng })
        .eq('id', u.id);
      if (!error) dbUpdated++;
    }

    return NextResponse.json({
      success: true,
      stats: {
        duplicateGroups: totalGroups,
        duplicateListings: totalListings,
        processed,
        geocoded: updated,
        skipped,
        dbUpdated,
      },
      message: `${dbUpdated}건 매물의 좌표를 정확한 위치로 재계산 완료`,
    });
  } catch (e: any) {
    console.error('[geocode-fix-duplicates] error:', e);
    return NextResponse.json({ success: false, error: e.message || 'unknown' }, { status: 500 });
  }
}
