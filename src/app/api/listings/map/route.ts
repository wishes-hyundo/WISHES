// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/map - 지도 범위 기반 매물 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

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

    const supabase = createClient();

    // 지도 바운드 내 매물 조회
    let query = supabase
      .from('listings')
      .select('id, title, type, deal, deposit, monthly, price, lat, lng, status')
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
    if (minDeposit) {
      query = query.gte('deposit', parseInt(minDeposit));
    }
    if (maxDeposit) {
      query = query.lte('deposit', parseInt(maxDeposit));
    }

    // 성능을 위해 최대 100건 제한
    query = query.limit(100);

    const { data, error, count } = await query;

    if (error) {
      console.error('지도 매물 조회 오류:', error);
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
    console.error('지도 매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
