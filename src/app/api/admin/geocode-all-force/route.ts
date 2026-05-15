// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/geocode-all-force
// 모든 매물의 좌표를 강제 재계산 (kakao geocoder)
// 사장님 명령 2026-05-14: DB 좌표 100% 정확하게
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const maxDuration = 60; // Vercel pro: 60s, hobby: 10s — batch size 조정

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

async function kakaoLookup(addr: string): Promise<{ lat: number; lng: number; road: string | null } | null> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const doc = d?.documents?.[0];
    if (doc) {
      return {
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        road: doc.road_address?.address_name || null,
      };
    }
    // keyword fallback
    const r2 = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(addr)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (!r2.ok) return null;
    const d2 = await r2.json();
    const doc2 = d2?.documents?.[0];
    if (doc2) {
      return { lat: parseFloat(doc2.y), lng: parseFloat(doc2.x), road: null };
    }
    return null;
  } catch { return null; }
}

function cleanAddress(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/\s*\d+층\s*\d*$/, '');
  s = s.replace(/\s*\d+호\s*$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
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
    const offset = parseInt(body.offset || '0', 10);
    const limit = Math.min(parseInt(body.limit || '100', 10), 200);
    const dryRun = body.dryRun === true;

    const supabase = createServerClient();

    // 모든 매물 fetch (address 있는 것만)
    const { data: listings, error, count } = await supabase
      .from('listings')
      .select('id, address, lat, lng, road_address, building_info', { count: 'exact' })
      .not('address', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let processed = 0;
    let updated = 0;
    let geocodeFailed = 0;
    let unchanged = 0;

    for (const l of listings || []) {
      processed++;
      const cleanAddr = cleanAddress(l.address || '');
      if (!cleanAddr) continue;

      const result = await kakaoLookup(cleanAddr);
      if (!result) {
        geocodeFailed++;
        continue;
      }

      // 기존 좌표와 다르면 update
      const latDiff = !l.lat || Math.abs(result.lat - l.lat) > 0.00001;
      const lngDiff = !l.lng || Math.abs(result.lng - l.lng) > 0.00001;
      const roadDiff = result.road && l.road_address !== result.road;

      if (latDiff || lngDiff || roadDiff) {
        if (!dryRun) {
          const updates: any = { lat: result.lat, lng: result.lng };
          if (result.road) {
            updates.road_address = result.road;
            updates.building_info = { ...((l.building_info as any) || {}), '도로명주소': result.road };
          }
          const { error: upErr } = await supabase
            .from('listings')
            .update(updates)
            .eq('id', l.id);
          if (!upErr) updated++;
        } else {
          updated++; // dryRun count
        }
      } else {
        unchanged++;
      }

      // rate limit (kakao 30 req/sec)
      await new Promise((r) => setTimeout(r, 40));
    }

    return NextResponse.json({
      success: true,
      stats: {
        offset,
        processed,
        updated,
        unchanged,
        geocodeFailed,
        totalListings: count || 0,
        nextOffset: offset + limit,
        hasMore: (offset + limit) < (count || 0),
      },
      dryRun,
    });
  } catch (e: any) {
    console.error('[geocode-all-force] error:', e);
    return NextResponse.json({ success: false, error: e.message || 'unknown' }, { status: 500 });
  }
}
