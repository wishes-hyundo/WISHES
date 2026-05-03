// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/contacts - 상담 문의 등록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { createClient } from '@/lib/supabase';
import { z } from 'zod';
import { optionalEmailSchema, listingIdSchema } from '@/lib/schemas'; // L-hub2

// G-49 (2026-05-03): name/message XSS sanitize.
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').trim();
}

// L-sec18 (2026-04-22): 공개 POST 엔드포인트. 스팸 봇이 대용량 페이로드로
//   contacts 테이블을 채우지 못하도록 각 문자열 필드에 max() 강제.
// G-49: name/message 에 stripHtml transform 적용 → XSS 사전 차단.
const contactSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요').max(100).transform(stripHtml).pipe(z.string().min(1)),
  // L-fix-phone (2026-04-28): 전화번호 형식 검증 (스팸 봇 + 잘못된 번호 차단)
  //   허용: 숫자/하이픈/공백/괄호/+. 7-15자리 숫자 (한국 010 + 국제번호 모두)
  phone: z.string()
    .min(1, '연락처를 입력해주세요')
    .max(30)
    .regex(/^[\d\-+()x. ]{7,30}$/, '유효한 전화번호 형식 (숫자/하이픈)을 입력해주세요')
    .refine((p) => {
      const digits = p.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    }, '전화번호는 7-15자리 숫자여야 합니다'),
  email: optionalEmailSchema, // L-hub2
  message: z.string().max(2000).optional().transform((s) => s ? stripHtml(s) : s),
  listingId: listingIdSchema.nullable().optional(), // L-hub2
  inquiry_type: z.string().max(40).optional().default('consultation'),
  property_type: z.string().max(40).optional().nullable(),
  preferred_area: z.string().max(200).optional().nullable(),
  budget_range: z.string().max(100).optional().nullable(),
  move_date: z.string().max(40).optional().nullable(),
  business_category: z.string().max(100).optional().nullable(),
  preferred_floor: z.string().max(40).optional().nullable(),
  additional_requirements: z.string().max(2000).optional().nullable().transform((s) => s ? stripHtml(s) : s),
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
    // L-sec65 (2026-04-22):  공개 POST 엔드포인트 스팸 방지
    //   1시간 10회/IP cap. checkRateLimit 인프라(L-sec62) 재사용.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `contacts:ip:${_ip}`, limit: 10, windowMs: 60 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }
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
