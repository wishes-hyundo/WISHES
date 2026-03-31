// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET, PATCH /api/admin/contacts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
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
 * GET /api/admin/contacts - 모든 상담 조회 (관리자용)
 */
export async function GET(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // 상담과 매물 정보를 함께 조회
    const { data, error } = await supabase
      .from('contacts')
      .select(
        `
        id,
        name,
        phone,
        email,
        message,
        listing_id,
        status,
        created_at,
        listings(title)
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error('상담 조회 오류:', error);
      return NextResponse.json(
        { success: false, error: '상담 조회에 실패했습니다' },
        { status: 500 }
      );
    }

    // 응답 형식 변환 (snake_case → camelCase)
    const formattedData = data?.map((contact: any) => ({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      message: contact.message,
      listingId: contact.listing_id,
      listingTitle: contact.listings?.title || null,
      status: contact.status,
      createdAt: contact.created_at,
    })) || [];

    return NextResponse.json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    console.error('상담 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '상담 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/contacts - 상담 상태 변경
 */
export async function PATCH(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const updateSchema = z.object({
      id: z.number().int().positive(),
      status: z.enum(['접수', '처리중', '완료']),
    });

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('contacts')
      .update({
        status: parsed.data.status,
      })
      .eq('id', parsed.data.id)
      .select()
      .single();

    if (error) {
      console.error('상담 상태 변경 오류:', error);
      return NextResponse.json(
        { success: false, error: '상태 변경에 실패했습니다' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '상담을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('상담 상태 변경 오류:', error);
    return NextResponse.json(
      { success: false, error: '상태 변경에 실패했습니다' },
      { status: 500 }
    );
  }
}


