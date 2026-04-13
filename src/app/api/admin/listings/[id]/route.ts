// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET, DELETE, PATCH /api/admin/listings/[id]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';

/**
 * 인증 검증 헬퍼 함수
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  return password === 'wishes2026';
}

/**
 * GET /api/admin/listings/[id] - 매물 상세 조회 (관리자용)
 * 수정 페이지에서 매물 데이터 + 이미지를 불러올 때 사용
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // 매물 조회 (모든 필드 포함 — 관리자용)
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

    // 이미지 조회
    const { data: images = [] } = await supabase
      .from('listing_images')
      .select('*')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true });

    // 특징 조회
    const { data: features = [] } = await supabase
      .from('listing_features')
      .select('feature')
      .eq('listing_id', listingId);

    return NextResponse.json({
      success: true,
      data: {
        ...listing,
        listing_images: images || [],
        features: features?.map((f: { feature: string }) => f.feature) || [],
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

/**
 * DELETE /api/admin/listings/[id] - 매물 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', listingId);

    if (error) {
      console.error('매물 삭제 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 삭제에 실패했습니다' },
        { status: 500 }
      );
    }

    // 캐시 즉시 무효화
    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidatePath(`/listings/${listingId}`, 'page');

    return NextResponse.json({
      success: true,
      message: '매물이 삭제되었습니다',
    });
  } catch (error) {
    console.error('매물 삭제 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 삭제에 실패했습니다' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/listings/[id] - 매물 상태 변경
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const statusSchema = z.object({
      status: z.enum(['가용', '계약중', '계약완료']),
    });

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 상태입니다' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('listings')
      .update({
        status: parsed.data.status,
      })
      .eq('id', listingId)
      .select()
      .single();

    if (error) {
      console.error('매물 상태 변경 오류:', error);
      return NextResponse.json(
        { success: false, error: '상태 변경에 실패했습니다' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // 캐시 즉시 무효화
    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidatePath(`/listings/${listingId}`, 'page');

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('매물 상태 변경 오류:', error);
    return NextResponse.json(
      { success: false, error: '상태 변경에 실패했습니다' },
      { status: 500 }
    );
  }
}
