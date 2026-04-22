// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/geocode-batch
// 좌표 없는 매물을 일괄 지오코딩 (카카오 REST API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';

const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY || '';

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
    if (!(await verifyAuth(request))) {
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
      // L-sec115 (2026-04-22): admin-gated defense-in-depth.
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ success: false, error: '조회 실패', ...(isDev && { detail: error.message }) }, { status: 500 });
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

// 한글 동/구 이름인지 검증 (크롤링 쓰레기 필터)
function isValidKoreanName(name: string | null): boolean {
  if (!name) return false;
  // 한글 2자 이상으로 시작하고, 동/구/읍/면/리/로/길 등으로 끝나거나 한글+숫자 조합
  return /^[가-힣]{2,}/.test(name.trim());
}

// ━━━ gu 기반 평균 좌표 일괄 할당 ━━━
async function handleDongAverageMode(request: NextRequest) {
  const supabase = createServerClient();

  // 1. 좌표 있는 매물에서 gu별 평균 lat/lng (페이지네이션으로 전체 조회)
  const allWithCoords: { gu: string; dong: string; lat: number; lng: number }[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select('gu, dong, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .neq('lat', 0)
      .neq('lng', 0)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    // L-sec115 (2026-04-22): admin-gated defense-in-depth.
    if (error) {
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ success: false, error: '조회 실패', ...(isDev && { detail: error.message }) }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    allWithCoords.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  // gu별, dong별 평균 좌표 계산 (한글 이름만 유효)
  const guAvg: Record<string, { sumLat: number; sumLng: number; count: number }> = {};
  const dongAvg: Record<string, { sumLat: number; sumLng: number; count: number }> = {};

  for (const row of allWithCoords) {
    if (isValidKoreanName(row.gu)) {
      const key = row.gu.trim();
      if (!guAvg[key]) guAvg[key] = { sumLat: 0, sumLng: 0, count: 0 };
      guAvg[key].sumLat += row.lat;
      guAvg[key].sumLng += row.lng;
      guAvg[key].count++;
    }
    if (isValidKoreanName(row.dong)) {
      const key = row.dong.trim();
      if (!dongAvg[key]) dongAvg[key] = { sumLat: 0, sumLng: 0, count: 0 };
      dongAvg[key].sumLat += row.lat;
      dongAvg[key].sumLng += row.lng;
      dongAvg[key].count++;
    }
  }

  const guCoords: Record<string, { lat: number; lng: number }> = {};
  for (const [gu, val] of Object.entries(guAvg)) {
    guCoords[gu] = { lat: val.sumLat / val.count, lng: val.sumLng / val.count };
  }
  const dongCoords: Record<string, { lat: number; lng: number }> = {};
  for (const [dong, val] of Object.entries(dongAvg)) {
    dongCoords[dong] = { lat: val.sumLat / val.count, lng: val.sumLng / val.count };
  }

  // 2. 좌표 없는 매물 전체 조회 (페이지네이션)
  const allNoCoords: { id: string; gu: string; dong: string }[] = [];
  page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, gu, dong')
      .or('lat.is.null,lng.is.null,lat.eq.0,lng.eq.0')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    // L-sec115 (2026-04-22): admin-gated defense-in-depth.
    if (error) {
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ success: false, error: '조회 실패', ...(isDev && { detail: error.message }) }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    allNoCoords.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  let updated = 0;
  let skipped = 0;

  // 3. 매칭: dong 우선 → gu 폴백
  const grouped: Record<string, { ids: string[]; lat: number; lng: number }> = {};
  for (const row of allNoCoords) {
    let coords: { lat: number; lng: number } | null = null;
    let key = '';

    // 1순위: 유효한 dong 매칭
    if (isValidKoreanName(row.dong) && dongCoords[row.dong.trim()]) {
      coords = dongCoords[row.dong.trim()];
      key = `dong:${row.dong.trim()}`;
    }
    // 2순위: 유효한 gu 매칭
    else if (isValidKoreanName(row.gu) && guCoords[row.gu.trim()]) {
      coords = guCoords[row.gu.trim()];
      key = `gu:${row.gu.trim()}`;
    }

    if (coords) {
      if (!grouped[key]) grouped[key] = { ids: [], lat: coords.lat, lng: coords.lng };
      grouped[key].ids.push(row.id);
    } else {
      skipped++;
    }
  }

  // 4. 배치 업데이트
  for (const [, group] of Object.entries(grouped)) {
    for (let i = 0; i < group.ids.length; i += 300) {
      const chunk = group.ids.slice(i, i + 300);
      const { error: updateErr } = await supabase
        .from('listings')
        .update({ lat: group.lat, lng: group.lng })
        .in('id', chunk);
      if (!updateErr) updated += chunk.length;
    }
  }

  // 5. 남은 미지오코딩 매물 수
  const { count: remaining } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .or('lat.is.null,lng.is.null,lat.eq.0,lng.eq.0');

  return NextResponse.json({
    success: true,
    mode: 'dong-average',
    withCoordsTotal: allWithCoords.length,
    noCoordsTotal: allNoCoords.length,
    guCount: Object.keys(guCoords).length,
    dongCount: Object.keys(dongCoords).length,
    groupsUsed: Object.keys(grouped).length,
    updated,
    skipped,
    remaining: remaining ?? 0,
  });
}

// GET: 미지오코딩 매물 현황 조회
export async function GET(request: NextRequest) {
  if (!(await verifyAuth(request))) {
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
