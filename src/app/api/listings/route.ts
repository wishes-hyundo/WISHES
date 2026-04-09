// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings - 매물 목록 조회 (최적화)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

/**
 * 매물 목록 조회
 * @query ids - 매물 ID 목록 (콤마 구분, 비교 페이지용)
 * @query deal - 거래 유형 (전세/월세/맠매)
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
    const supabase = createClient();

    // ━━━ ID 기반 조회 (비교 페이지용) ━━━
    const ids = searchParams.get('ids');
    if (ids) {
      const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

      if (idList.length === 0) {
        return NextResponse.json({ success: true, data: [], listings: [] });
      }

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

    // ━━━ 일반 필터 조회 (경량화) ━━━
    const deal = searchParams.get('deal');
    const type = searchParams.get('type');
    const dong = searchParams.get('dong');
    const minDeposit = searchParams.get('minDeposit');
    const maxDeposit = searchParams.get('maxDeposit');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // 필요한 필드만 선택 + count 통합
    let query = supabase
      .from('listings')
      .select(
        'id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, floor_total, status, created_at, views, maintenance_fee, listing_images(url, sort_order)',
        { count: 'exact' }
      )
      .eq('status', '가용')
      .order('created_at', { ascending: false });

    if (deal) query = query.eq('deal', deal);
    if (type) query = query.eq('type', type);
    if (dong) query = query.eq('dong', dong);
    if (minDeposit) query = query.gte('deposit', parseInt(minDeposit));
    if (maxDeposit) query = query.lte('deposit', parseInt(maxDeposit));

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase 쿼리 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 조회에 실패했습니다' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: data || [],
        total: count || 0,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
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
