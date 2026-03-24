// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings - 매물 목록 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

/**
 * 매물 목록 조회
 * @query deal - 거래 유형 (전세/월세/매매)
 * @query type - 매물 유형 (원룸/투룸/쓰리룸/오피스텔/아파트/상가/사무실)
 * @query dong - 동 이름
 * @query minDeposit - 최소 보증금 (만원)
 * @query maxDeposit - 최대 보증금 (만원)
 * @query limit - 페이지당 결과 수 (기본값: 20)
 * @query offset - 오프셋 (기본값: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const deal = searchParams.get('deal');
    const type = searchParams.get('type');
    const dong = searchParams.get('dong');
    const minDeposit = searchParams.get('minDeposit');
    const maxDeposit = searchParams.get('maxDeposit');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createClient();

    // 기본 쿼리 (status = '가용'읁 RLS에서 자동 적용)
    let query = supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false });

    // 필터 조건 적용
    if (deal) {
      query = query.eq('deal', deal);
    }
    if (type) {
      query = query.eq('type', type);
    }
    if (dong) {
      query = query.eq('dong', dong);
    }
    if (minDeposit) {
      query = query.gte('deposit', parseInt(minDeposit));
    }
    if (maxDeposit) {
      query = query.lte('deposit', parseInt(maxDeposit));
    }

    // 페이지네이션
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

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
      total: count || 0,
    });
  } catch (error) {
    console.error('매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
