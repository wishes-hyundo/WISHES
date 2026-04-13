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

    const body = await request.json().catch(() => ({}));
    const mode = body.mode || 'kakao'; // 'kakao' | 'dong-average'

    // ━━━ 모드: dong-average (동별 평균 좌표 일괄 할당) ━━━
    if (mode === 'dong-average') {
      return await handleDongAverageMode(request);
    }

    if (!KAKAO_REST_KEY) {
      return NextResponse.json(
        { success: false, error: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    const batchSize = Math.min(body.batchSize || 50, 200); // 한 번에 최대 200개

    const supabase = createServerClient();

    // 좌표 없는 매물 조회
    const { data: listings, error } = await supabase
      .from('listings')
      .select('id, address, dong, gu, building_name')
      .or('lat.is.null,lng.is.null,lat.eq.0,lng.eq.0')
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
      // 주소 구성: dong+gu 최우선 (address 필드는 크롤링 원시 데이터로 지저분함)
      // 1순위: gu + dong + building_name (깨끗한 구조화 데이터)
      // 2순위: address에서 한국 주소 패턴 추출
      // 3순위: address 원본 (최후의 수단)
      let searchAddr = '';

      if (listing.dong) {
        searchAddr = [listing.gu, listing.dong, listing.building_name].filter(Boolean).join(' ');
      }

      if (!searchAddr && listing.address) {
        // address에서 "XX구 XX동" 패턴 추출 (크롤링 데이터 정제)
        const addrMatch = listing.address.match(/([가-힣]+(?:시|도)\s+)?[가-힣]+(?:구|군)\s+[가-힣]+(?:동|읍|면|리|로|길)\s*[\d\-\s가-힣]*/);
        searchAddr = addrMatch ? addrMatch[0].trim() : listing.address.replace(/[\t\n\r]+/g, ' ').trim();
      }

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
      .or('lat.is.null,lng.is.null,lat.eq.0,lng.eq.0');

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

// ━━━ 동별 평균 좌표 일괄 할당 ━━━
async function handleDongAverageMode(request: NextRequest) {
  const supabase = createServerClient();

  // 1. 이미 좌표가 있는 매물에서 dong별 평균 lat/lng 계산
  // Supabase 기본 limit=1000이므로 충분히 큰 값 설정
  const { data: withCoords, error: err1 } = await supabase
    .from('listings')
    .select('dong, lat, lng')
    .not('dong', 'is', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .neq('lat', 0)
    .neq('lng', 0)
    .limit(20000);

  if (err1) {
    return NextResponse.json({ success: false, error: err1.message }, { status: 500 });
  }

  // dong별 평균 좌표 계산
  const dongAvg: Record<string, { sumLat: number; sumLng: number; count: number }> = {};
  for (const row of (withCoords || [])) {
    if (!row.dong) continue;
    if (!dongAvg[row.dong]) dongAvg[row.dong] = { sumLat: 0, sumLng: 0, count: 0 };
    dongAvg[row.dong].sumLat += row.lat;
    dongAvg[row.dong].sumLng += row.lng;
    dongAvg[row.dong].count++;
  }

  const dongCoords: Record<string, { lat: number; lng: number }> = {};
  for (const [dong, val] of Object.entries(dongAvg)) {
    dongCoords[dong] = {
      lat: val.sumLat / val.count,
      lng: val.sumLng / val.count,
    };
  }

  // 2. 좌표 없고 dong이 있는 매물 조회
  const { data: noCoords, error: err2 } = await supabase
    .from('listings')
    .select('id, dong')
    .not('dong', 'is', null)
    .or('lat.is.null,lng.is.null,lat.eq.0,lng.eq.0')
    .limit(20000);

  if (err2) {
    return NextResponse.json({ success: false, error: err2.message }, { status: 500 });
  }

  let updated = 0;
  let skipped = 0;

  // 3. 배치 업데이트 (dong 매칭되는 것만)
  // 같은 dong끼리 그룹화하여 한 번에 업데이트
  const grouped: Record<string, string[]> = {};
  for (const row of (noCoords || [])) {
    if (!row.dong || !dongCoords[row.dong]) {
      skipped++;
      continue;
    }
    if (!grouped[row.dong]) grouped[row.dong] = [];
    grouped[row.dong].push(row.id);
  }

  for (const [dong, ids] of Object.entries(grouped)) {
    const coords = dongCoords[dong];
    // 배치 크기 제한 (Supabase .in() 최대 ~300개)
    for (let i = 0; i < ids.length; i += 300) {
      const chunk = ids.slice(i, i + 300);
      // 동일 동 내에서 약간의 랜덤 오프셋 추가 (마커 겹침 방지)
      // 개별 업데이트 대신 일괄로 동 중심점 할당
      const { error: updateErr } = await supabase
        .from('listings')
        .update({ lat: coords.lat, lng: coords.lng })
        .in('id', chunk);

      if (!updateErr) {
        updated += chunk.length;
      }
    }
  }

  // 4. 남은 미지오코딩 매물 수
  const { count: remaining } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .or('lat.is.null,lng.is.null,lat.eq.0,lng.eq.0');

  // 디버그: 양쪽 dong 값 샘플
  const withCoordDongs = Object.keys(dongCoords).slice(0, 10);
  const noCoordsample = (noCoords || []).slice(0, 10).map(r => r.dong);

  return NextResponse.json({
    success: true,
    mode: 'dong-average',
    dongsUsed: Object.keys(grouped).length,
    totalDongsWithCoords: Object.keys(dongCoords).length,
    totalNoCoordsRows: (noCoords || []).length,
    updated,
    skipped,
    remaining: remaining ?? 0,
    debug: {
      withCoordDongs,
      noCoordDongSample: noCoordsample,
      withCoordsCount: (withCoords || []).length,
    },
  });
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
    .or('lat.is.null,lng.is.null,lat.eq.0,lng.eq.0');

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
