// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/map - 지도 범위 기반 매물 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

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
    let query = supabase
      .from('listings')
      .select(
        'id, title, type, deal, deposit, monthly, price, area_m2, floor_current, floor_total, lat, lng, status, dong, address, maintenance_fee, business_type, goodwill_fee, vat_included, source_site, created_at, updated_at, views, listing_images(url)',
        { count: 'exact' }
      )
      .neq('status', '계약완료')
      .gte('lat', swLat)
      .lte('lat', neLat)
      .gte('lng', swLng)
      .lte('lng', neLng);

    // 추가 필터 적용
    if (deal) {
      query = query.eq('deal', deal);
    }
    if (type) {
      query = query.eq('type', type);
    }
    // 가격 범위 필터: 거래유형에 따라 다른 컬럼 대상
    //   매매 → price, 월세 → monthly, 전세 → deposit
    const priceColumn = deal === '매매' ? 'price' : deal === '월세' ? 'monthly' : 'deposit';
    if (minDeposit) {
      query = query.gte(priceColumn, parseInt(minDeposit));
    }
    if (maxDeposit) {
      query = query.lte(priceColumn, parseInt(maxDeposit));
    }

        // 1차 정렼: updated_at 내림��� 순 (post-sort로 사진 우선 적용)
    query = query.order('updated_at', { ascending: false, nullsFirst: false });

    // 전체 매물 노출
    query = query.limit(10000);

    const { data, error, count } = await query;

    if (error) {
      console.error('지도 매물 조회 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 조회 실패' },
        { status: 500 }
      );
    }

    // ※ 크롤링 매물(source_site NOT NULL) → listing_images 빈 배열로 치환 (사진 차단)
    //   그 외 정보는 그대로 노출 (광고 목적)
    let sorted = (data || []).map((r: any) => {
      if (r.source_site) {
        return { ...r, listing_images: [] };
      }
      return r;
    });

    // 사진 유무 조회 → 1순위 사진, 2순위 수정일 (자체 매물만 카운트)
    if (sorted.length > 0) {
      const ownIds = sorted
        .filter((r: any) => !r.source_site)
        .map((r: any) => r.id);
      let hasImg = new Set<string>();
      if (ownIds.length > 0) {
        const { data: imgs } = await supabase
          .from('listing_images')
          .select('listing_id')
          .in('listing_id', ownIds);
        hasImg = new Set<string>((imgs || []).map((r: any) => r.listing_id));
      }
      sorted = [...sorted].sort((a: any, b: any) => {
        const ah = !a.source_site && hasImg.has(a.id) ? 1 : 0;
        const bh = !b.source_site && hasImg.has(b.id) ? 1 : 0;
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
