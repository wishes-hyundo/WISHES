// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings - 매물 목록 조회 (캐시 최적화)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServerClient } from '@/lib/supabase';
import { cached, invalidateCache } from '@/lib/cache';

/**
 * 매물 목록 조회
 * @query ids - 매물 ID 목록 (콤마 구분, 비교 페이지용)
 * @query deal - 거래 유형 (전세/월세/매매)
 * @query type - 매물 유형
 * @query dong - 동 이름
 * @query minDeposit - 최소 보증금 (만원)
 * @query maxDeposit - 최대 보증금 (만원)
 * @query limit - 페이지당 결과 수 (기본값: 20)
 * @query offset - 오프셋 (기본값: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // ━━━ ID 기반 조회 (비교 페이지용) — 캐시 없이 직접 조회 ━━━
    const ids = searchParams.get('ids');
    if (ids) {
      const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (idList.length === 0) {
        return NextResponse.json({ success: true, data: [], listings: [] });
      }

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('listings')
        .select('*, listing_images(*)')
        .in('id', idList);

      if (error) {
        console.error('Supabase 쿼리 오류:', error);
        return NextResponse.json(
          { success: false, error: '매물 조회에 실패했습니다' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: data || [],
        listings: data || [],
      });
    }

    // ━━━ 일반 필터 조회 (인메모리 캐시 적용) ━━━
    const deal = searchParams.get('deal') || '';
    const type = searchParams.get('type') || '';
    const dong = searchParams.get('dong') || '';
    const minDeposit = searchParams.get('minDeposit') || '';
    const maxDeposit = searchParams.get('maxDeposit') || '';
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // 캐시 키: 필터 조합별로 고유 키 생성
    const cacheKey = `listings:${deal}:${type}:${dong}:${minDeposit}:${maxDeposit}:${limit}:${offset}`;

    const result = await cached(
      cacheKey,
      async () => {
        const supabase = createServerClient();

        let query = supabase
          .from('listings')
          .select(
            // [fix 2026-04-14] 상가 전용 필드 누락 이슈 해결 — 목록에서도 상세 필드 전량 반환
            //   (이전엔 최소 필드만 반환해서 상세모달 렌더 시 lease_period/entrance_type/
            //    previous_business/recommended_business/restricted_business/rights_fee/
            //    commission_note/building_listings/options/raw_fields 등이 undefined 였음)
            '*, listing_images(url, sort_order)',
            { count: 'exact' }
          )
          .eq('status', '공개')
          .order('created_at', { ascending: false });

        if (deal) query = query.eq('deal', deal);
        if (type) query = query.eq('type', type);
        if (dong) query = query.eq('dong', dong);
        if (minDeposit) query = query.gte('deposit', parseInt(minDeposit));
        if (maxDeposit) query = query.lte('deposit', parseInt(maxDeposit));

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        return { data: data || [], total: count || 0 };
      },
      30_000,    // 30초 fresh
      300_000,   // 5분 stale 허용
      5_000,     // 5초 타임아웃
    );

    if (!result) {
      // 캐시도 없고 DB도 실패 → 빈 결과 반환 (사이트는 즉시 로드)
      return NextResponse.json(
        { success: true, data: [], total: 0 },
        { headers: { 'Cache-Control': 'no-cache' } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        total: result.total,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
