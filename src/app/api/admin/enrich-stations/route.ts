// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/enrich-stations
// 좌표 기반으로 가장 가까운 지하철역(SW8) 을 카카오 카테고리 검색으로 찾아
// station_name / station_distance 를 일괄 백필한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

export const maxDuration = 300;

interface StationHit {
  place_name: string;
  distance: string; // meters as string
}

async function findNearestStation(
  lat: number,
  lng: number
): Promise<{ name: string; distance: number } | null> {
  if (!KAKAO_REST_API_KEY) return null;
  try {
    // 반경 1500m 내 지하철역 카테고리 검색, 거리순 정렬
    const url =
      `https://dapi.kakao.com/v2/local/search/category.json` +
      `?category_group_code=SW8&x=${lng}&y=${lat}&radius=1500&sort=distance&size=1`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const doc: StationHit | undefined = data?.documents?.[0];
    if (!doc) return null;
    const distance = parseInt(doc.distance || '0', 10);
    // place_name 예: "서울지하철 2호선 신림역" → "신림역 2호선" 정도로 정돈
    const name = doc.place_name.replace(/^서울지하철\s*/, '').replace(/^수도권전철\s*/, '');
    return { name, distance };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // L-sec3 (2026-04-22): 박제 'Bearer wishes2026' + x-admin-key + 무인증 허용 블록 제거
  // → verifyAdminAuth 로 완전 차단
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '150', 10), 400);
    const force = searchParams.get('force') === '1';

    // 좌표가 있고 station_name 이 비어있는 매물 조회
    let query = supabase
      .from('listings')
      .select('id, lat, lng, station_name, station_distance')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id', { ascending: false })
      .limit(limit);

    if (!force) {
      query = query.or('station_name.is.null,station_name.eq.');
    }

    const { data: listings, error } = await query;

    if (error) {
      // L-sec115 (2026-04-22): admin-gated defense-in-depth.
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ success: false, error: '조회 실패', ...(isDev && { detail: error.message }) }, { status: 500 });
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json({
        success: true,
        message: '보강 대상이 없습니다',
        updated: 0,
      });
    }

    let updated = 0;
    let failed = 0;

    for (const l of listings) {
      const hit = await findNearestStation(l.lat as number, l.lng as number);
      if (hit) {
        const { error: upErr } = await supabase
          .from('listings')
          .update({
            station_name: hit.name,
            station_distance: hit.distance,
          })
          .eq('id', l.id);
        if (upErr) failed++;
        else updated++;
      } else {
        failed++;
      }
      // 카카오 Local API rate limit 완화
      await new Promise((r) => setTimeout(r, 80));
    }

    return NextResponse.json({
      success: true,
      message: `${listings.length}건 중 ${updated}건 지하철 정보 업데이트`,
      total: listings.length,
      updated,
      failed,
    });
  } catch (e) {
    console.error('enrich-stations 오류:', e);
    return NextResponse.json(
      { success: false, error: '지하철 정보 보강 실패' },
      { status: 500 }
    );
  }
}

// GET: 보강 필요 건수 확인
export async function GET(request: NextRequest) {
  // L-sec3 (2026-04-22): 인증 미보호 → verifyAdminAuth 추가
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const supabase = createServerClient();
    const { count, error } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .or('station_name.is.null,station_name.eq.');

    if (error) {
      // L-sec115 (2026-04-22): admin-gated defense-in-depth.
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ success: false, error: '조회 실패', ...(isDev && { detail: error.message }) }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pendingCount: count || 0,
      message: count
        ? `${count}개 매물의 지하철 정보가 누락되어 있습니다`
        : '모든 매물에 지하철 정보가 설정되어 있습니다',
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: '확인 실패' }, { status: 500 });
  }
}
