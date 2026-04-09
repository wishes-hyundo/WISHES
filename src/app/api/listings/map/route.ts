// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/map - 지도 범위 기반 매물 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sortWithPhotoPriority } from '@/lib/utils';

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

      // 바운드 유효성 검사
      if (swLat === 0 && swLng === 0 && neLat === 0 && neLng === 0) {
              return NextResponse.json(
                { success: false, error: '지도 범위가 필요합니다' },
                { status: 400 }
                      );
      }

      const deal = searchParams.get('deal');
          const type = searchParams.get('type');
          const minDeposit = searchParams.get('minDeposit');
          const maxDeposit = searchParams.get('maxDeposit');

      const supabase = createServerClient();

      // 페이지네이션으로 전체 매물 조회 (Supabase 기본 1000행 제한 우회)
      const BATCH_SIZE = 1000;
          const MAX_TOTAL = 5000;
          let allData: any[] = [];
          let offset = 0;

      while (offset < MAX_TOTAL) {
              let query = supabase
                .from('listings')
                .select('id, title, type, deal, deposit, monthly, price, area_m2, floor_current, lat, lng, status, dong, address, created_at, listing_images(url, sort_order)')
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

            const { data: batch, error } = await query.range(offset, offset + BATCH_SIZE - 1);

            if (error) {
                      console.error('지도 매물 조회 오류:', error);
                      return NextResponse.json(
                        { success: false, error: '매물 조회에 실패했습니다' },
                        { status: 500 }
                                );
            }

            if (!batch || batch.length === 0) break;
              allData = allData.concat(batch);
              if (batch.length < BATCH_SIZE) break;
              offset += BATCH_SIZE;
      }

      // 사진 있는 매물 우선 정렬
    const sortedData = sortWithPhotoPriority(allData);

    return NextResponse.json({
      success: true,
      data: sortedData,
      total: sortedData.length,
    });
    } catch (error) {
          console.error('지도 매물 API 오류:', error);
          return NextResponse.json(
            { success: false, error: '서버 오류가 발생했습니다' },
            { status: 500 }
                );
    }
}
