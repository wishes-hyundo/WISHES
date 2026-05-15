// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/verify-road-address
// 매물의 지번 주소 → kakao geocoder → 도로명 주소 검증/수정
// 사장님 명령 2026-05-14: 도로명 주소도 100% 정확
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

interface KakaoAddrResult {
  road_address?: { address_name: string };
  address?: { address_name: string };
  documents?: any[];
}

async function kakaoLookup(addr: string): Promise<{ road: string | null; jibun: string | null; lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const doc = d?.documents?.[0];
    if (!doc) return null;
    const road = doc.road_address?.address_name || null;
    const jibun = doc.address?.address_name || null;
    const lat = parseFloat(doc.y);
    const lng = parseFloat(doc.x);
    return { road, jibun, lat, lng };
  } catch { return null; }
}

function normalize(s: string): string {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
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
    const limit = Math.min(parseInt(body.limit || '50', 10), 200);
    const offset = parseInt(body.offset || '0', 10);

    const supabase = createServerClient();

    // address 있는 매물 fetch
    const { data: listings, error } = await supabase
      .from('listings')
      .select('id, address, road_address, building_info')
      .not('address', 'is', null)
      .eq('status', '공개')
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let checked = 0;
    let mismatched = 0;
    let updated = 0;
    let geocodeFailed = 0;
    const samples: any[] = [];

    for (const l of listings || []) {
      checked++;
      // 호수/층 제거
      const cleanAddr = (l.address || '').replace(/\s*\d+층\s*\d*$/, '').replace(/\s+/g, ' ').trim();
      if (!cleanAddr) continue;

      const result = await kakaoLookup(cleanAddr);
      if (!result || !result.road) {
        geocodeFailed++;
        continue;
      }

      // building_info 의 도로명주소도 비교
      const dbRoad = (l.road_address || '').trim() ||
                     ((l.building_info as any)?.['도로명주소'] || '').trim();

      if (dbRoad && normalize(dbRoad) !== normalize(result.road)) {
        mismatched++;
        if (samples.length < 10) {
          samples.push({
            id: l.id,
            address: l.address,
            db_road: dbRoad,
            kakao_road: result.road,
          });
        }

        if (!dryRun) {
          // road_address 컬럼 update + building_info.도로명주소 update
          const newBI = { ...((l.building_info as any) || {}), '도로명주소': result.road };
          const { error: upErr } = await supabase
            .from('listings')
            .update({ road_address: result.road, building_info: newBI })
            .eq('id', l.id);
          if (!upErr) updated++;
        }
      }

      // rate limit
      await new Promise((r) => setTimeout(r, 50));
    }

    return NextResponse.json({
      success: true,
      stats: {
        checked,
        mismatched,
        geocodeFailed,
        updated: dryRun ? 0 : updated,
        offset,
        nextOffset: offset + limit,
      },
      samples,
      dryRun,
    });
  } catch (e: any) {
    console.error('[verify-road-address] error:', e);
    return NextResponse.json({ success: false, error: e.message || 'unknown' }, { status: 500 });
  }
}
