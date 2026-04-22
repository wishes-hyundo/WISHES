// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/contacts - 상담 문의 등록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { z } from 'zod';

// L-sec18 (2026-04-22): 공개 POST 엔드포인트. 스팸 봇이 대용량 페이로드로
//   contacts 테이블을 채우지 못하도록 각 문자열 필드에 max() 강제.
const contactSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요').max(100),
  phone: z.string().min(1, '연락처를 입력해주세요').max(30),
  email: z
    .string()
    .email('올바른 이메일 형식이 아닙니다')
    .max(200)
    .optional()
    .or(z.literal('')),
  message: z.string().max(2000).optional(),
  listingId: z.number().int().nonnegative().max(2_000_000_000).nullable().optional(),
  inquiry_type: z.string().max(40).optional().default('consultation'),
  property_type: z.string().max(40).optional().nullable(),
  preferred_area: z.string().max(200).optional().nullable(),
  budget_range: z.string().max(100).optional().nullable(),
  move_date: z.string().max(40).optional().nullable(),
  business_category: z.string().max(100).optional().nullable(),
  preferred_floor: z.string().max(40).optional().nullable(),
  additional_requirements: z.string().max(2000).optional().nullable(),
});

/**
 * 상담 문의 등록
 * @body name - 이름 (필수)
 * @body phone - 연락처 (필수)
 * @body email - 이메일 (선택)
 * @body message - 문의 내용 (선택)
 * @body listingId - 매물 ID (선택)
 * @body inquiry_type - 문의 유형 (consultation / listing)
 * @body property_type - 매물 유형 (선택)
 * @body preferred_area - 희망 지역 (선택)
 * @body budget_range - 예산 범위 (선택)
 * @body move_date - 입주 예정일 (선택)
 * @body business_category - 업종 (선택)
 * @body preferred_floor - 희망 층수 (선택)
 * @body additional_requirements - 추가 요청사항 (선택)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const {
      name,
      phone,
      email,
      message,
      listingId,
      inquiry_type,
      property_type,
      preferred_area,
      budget_range,
      move_date,
      business_category,
      preferred_floor,
      additional_requirements,
    } = parsed.data;

    const supabase = createClient();

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        name,
        phone,
        email: email || null,
        message: message || null,
        listing_id: listingId || null,
        status: '접수',
        inquiry_type: inquiry_type || 'consultation',
        property_type: property_type || null,
        preferred_area: preferred_area || null,
        budget_range: budget_range || null,
        move_date: move_date || null,
        business_category: business_category || null,
        preferred_floor: preferred_floor || null,
        additional_requirements: additional_requirements || null,
      })
      .select()
      .single();

    if (error) {
      console.error('문의 등록 오류:', error);
      return NextResponse.json(
        { success: false, error: '문의 등록에 실패했습니다' },
        { status: 500 }
      );
    }

    return NextResponse.json(

      {
        success: true,
        data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('문의 등록 오류:', error);
    return NextResponse.json(
      { success: false, error: '문의 등록에 실패했습니다' },
      { status: 500 }
    );
  }
}
