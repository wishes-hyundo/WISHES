// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/map - 지도 범위 기반 매물 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { applyImagePolicy } from '@/lib/image-policy';

/**
 * 지도 바운드 범위 내 매물 조회
 * @query swLat - 남서쪽 위도
 * @query swLng - 남서쪽 경도
 * @query neLat - 북동쪽 위도
 * @query neLng - 북동쪽 경도
 * @query deal - 거래 유형 (선택사항)
 * @query type - 매물 유형 (선택사항)
 * @query minDeposit - 최소 보증금 (선택사항)
 * @query maxDeposit - 최대 보증금 (선택사항)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const swLat = parseFloat(searchParams.get('swLat') || '0');
    const swLng = parseFloat(searchParams.get('swLng') || '0');
    const neLat = parseFloat(searchParams.get('neLat') || '0');
    const neLng = parseFloat(searchParams.get('neLng') || '0');

    if (!swLat || !swLng || !neLat || !neLng) {
      return NextResponse.json(
        {
          success: false,
          error: 'bounds 파라미터가 필요합니다 (swLat, swLng, neLat, neLng)',
        },
        { status: 400 }
      );
    }

    const deal = searchParams.get('deal');
    const type = searchParams.get('type');
    const minDeposit = searchParams.get('minDeposit');
    const maxDeposit = searchParams.get('maxDeposit');

    const supabase = createServerClient();

    // 지도 바운드 내 매물 조회 (경량화: 이미지 조인 제거로 응답 속도 대폭 향상)
    // ※ 저작권 보호: 외부 크롤링(공실클럽/온하우스 등) 매물은 "사진만" 차단.
    //   정보(주소·가격·면적 등)는 광고 목적으로 노출. source_site NOT NULL → listing_images 빈 배열 처리
    //
    // ⚠️ PostgREST 기본 max-rows=1000 제한 우회: 페이지 단위 루프로 전체 조회
    //    (매물 수 1,000건 초과 시 기존 .limit(10000)는 서버에서 1000에 잘림)
    const priceColumn = deal === '매매' ? 'price' : deal === '월세' ? 'monthly' : 'deposit';

    const buildQuery = () => {
      let q = supabase
        .from('listings')
        .select(
          // building_name + AI 제목/설명 + 세일즈 훅 필드 전량 (실제 DB 컬럼명: station_name / station_distance)
          'id, title, ai_title, ai_description, building_name, type, deal, deposit, monthly, price, area_m2, area_pyeong, rooms, bathrooms, floor_current, floor_total, lat, lng, status, dong, address, maintenance_fee, business_type, goodwill_fee, vat_included, source_site, created_at, updated_at, views, parking, elevator, full_option, pet, balcony, built_year, direction, description, station_name, station_distance, features, listing_images(url)'
        )
        .eq('status', '공개')
        .gte('lat', swLat)
        .lte('lat', neLat)
        .gte('lng', swLng)
        .lte('lng', neLng);
      if (deal) q = q.eq('deal', deal);
      if (type) q = q.eq('type', type);
      if (minDeposit) q = q.gte(priceColumn, parseInt(minDeposit));
      if (maxDeposit) q = q.lte(priceColumn, parseInt(maxDeposit));
      return q.order('updated_at', { ascending: false, nullsFirst: false });
    };

    // 페이지 단위(1000건씩) 루프로 전체 조회. 최대 10,000건까지 안전장치.
    const PAGE = 1000;
    const MAX_TOTAL = 10000;
    const chunks: any[][] = [];
    let pageError: any = null;
    for (let from = 0; from < MAX_TOTAL; from += PAGE) {
      const { data: chunk, error: chunkErr } = await buildQuery().range(from, from + PAGE - 1);
      if (chunkErr) { pageError = chunkErr; break; }
      if (!chunk || chunk.length === 0) break;
      chunks.push(chunk);
      if (chunk.length < PAGE) break;
    }
    const data = ([] as any[]).concat(...chunks);
    const count = data.length;
    const error = pageError;

    if (error) {
      console.error('지도 매물 조회 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 조회 실패' },
        { status: 500 }
      );
    }

    // ※ 저작권 보호 + 자체 업로드 통과
    //   - 크롤링 매물의 외부 원본 이미지는 차단
    //   - 중개사가 직접 올린 자체 업로드 이미지(wishes.co.kr, supabase, R2)는 통과 → 광고 노출
    let sorted = (data || []).map((r: any) => applyImagePolicy(r));

    // 사진 유무 정렬: 1순위 사진 있는 매물(자체 매물 + 직접 업로드한 크롤링 매물 포함), 2순위 수정일
    // ※ applyImagePolicy 이후 listing_images에는 "노출 허용된" 이미지만 남아 있으므로
    //   source_site 체크 없이 length 만 보면 된다 (크롤링 매물에 직접 업로드한 사진 있는 경우 자연스럽게 상위)
    if (sorted.length > 0) {
      sorted = [...sorted].sort((a: any, b: any) => {
        const ah = Array.isArray(a.listing_images) && a.listing_images.length > 0 ? 1 : 0;
        const bh = Array.isArray(b.listing_images) && b.listing_images.length > 0 ? 1 : 0;
        if (ah !== bh) return bh - ah;
        const ad = new Date(a.updated_at || a.created_at || 0).getTime();
        const bd = new Date(b.updated_at || b.created_at || 0).getTime();
        return bd - ad;
      });
    }

    // 우답에 캐시 헤더 추가 (10초간 캐시)
    return NextResponse.json(
      {
        success: true,
        data: sorted,
        total: count ?? (sorted.length || 0),

      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    console.error('지도 매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
