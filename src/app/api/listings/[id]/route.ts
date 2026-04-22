// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/[id] - 매물 상세 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { filterSelfHosted } from '@/lib/image-policy';

/**
 * 매물 상세 조회 (이미지, 특징 포함)
 * @param id - 매물 ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id, 10);

    // L-sec33 (2026-04-22): isNaN 만 체크하면 Infinity/음수/거대 수 통과. 정수 범위 검증.
    if (!Number.isFinite(listingId) || listingId < 0 || listingId > 2_000_000_000) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 매물 조회
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (listingError || !listing) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // ※ 저작권 보호 + 자체 업로드 통과
    //   - 크롤링 매물의 외부 원본 이미지는 차단
    //   - 중개사가 직접 올린 자체 업로드 이미지(wishes.co.kr, supabase, R2)는 통과 → 광고 노출
    const isCrawled = !!(listing as any).source_site;
    const { data: rawImages = [] } = await supabase
      .from('listing_images')
      .select('*')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true });
    const images = isCrawled ? filterSelfHosted(rawImages || []) : (rawImages || []);

    // 특징 조회
    const { data: features = [] } = await supabase
      .from('listing_features')
      .select('feature')
      .eq('listing_id', listingId);

    // 고객용 응답: 크롤링 원본 description 제외, ai_description만 노출
    const { description: _rawDesc, ...publicListing } = listing;

    return NextResponse.json({
      success: true,
      data: {
        ...publicListing,
        images: images || [],
        features: features?.map((f: any) => f.feature) || [],
      },
    });
  } catch (error) {
    console.error('매물 상세 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
