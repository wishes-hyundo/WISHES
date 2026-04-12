// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/geocode-batch
// 좌표 없는 매물을 일괄 지오코딩 (카카오 REST API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY || '';

// 인증 검증
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  if (password === 'wishes2026') return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get('token') === 'wishes2026';
}

// 카카오 주소 → 좌표 변환
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    );
    const json = await res.json();
    if (json.documents && json.documents.length > 0) {
      const doc = json.documents[0];
      return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
    }
    // 주소 검색 실패 시 키워드 검색으로 폴백
    const res2 = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    );
    const json2 = await res2.json();
    if (json2.documents && json2.documents.length > 0) {
      const doc = json2.documents[0];
      return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    if (!KAKAO_REST_KEY) {
      return NextResponse.json(
        { success: false, error: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 50, 200); // 한 번에 최대 200개

    const supabase = createServerClient();

    // 좌표 없는 매물 조회
    const { data: listings, error } = await supabase
      .from('listings')
      .select('id, address, dong, gu, building_name')
      .or('lat.is.null,lng.is.null')
      .limit(batchSize);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json({ success: true, message: '지오코딩할 매물이 없습니다', updated: 0, remaining: 0 });
    }

    let updated = 0;
    let failed = 0;
    const results: { id: string; address: string; status: string; lat?: number; lng?: number }[] = [];

    // 순차적으로 지오코딩 (API 레이트 리밋 고려)
    for (const listing of listings) {
      // 주소 구성: address > dong+gu > building_name 순으로 시도
      const searchAddr = listing.address ||
        [listing.gu, listing.dong, listing.building_name].filter(Boolean).join(' ') ||
        '';

      if (!searchAddr) {
        failed++;
        results.push({ id: listing.id, address: '(주소 없음)', status: 'no_address' });
        continue;
      }

      const coords = await geocodeAddress(searchAddr);

      if (coords) {
        const { error: updateErr } = await supabase
          .from('listings')
          .update({ lat: coords.lat, lng: coords.lng })
          .eq('id', listing.id);

        if (!updateErr) {
          updated++;
          results.push({ id: listing.id, address: searchAddr, status: 'ok', ...coords });
        } else {
          failed++;
          results.push({ id: listing.id, address: searchAddr, status: 'update_failed' });
        }
      } else {
        failed++;
        results.push({ id: listing.id, address: searchAddr, status: 'geocode_failed' });
      }

      // API 호출 간격 (초당 10건 제한)
      await new Promise(r => setTimeout(r, 120));
    }

    // 남은 미지오코딩 매물 수 조회
    const { count } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .or('lat.is.null,lng.is.null');

    return NextResponse.json({
      success: true,
      updated,
      failed,
      remaining: count ?? 0,
      results: results.slice(0, 20), // 상위 20개만 반환
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// GET: 미지오코딩 매물 현황 조회
export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }

  const supabase = createServerClient();

  const { count: noCoords } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .or('lat.is.null,lng.is.null');

  const { count: total } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true });

  return NextResponse.json({
    success: true,
    total: total ?? 0,
    withCoords: (total ?? 0) - (noCoords ?? 0),
    withoutCoords: noCoords ?? 0,
    kakaoKeySet: !!KAKAO_REST_KEY,
  });
}
