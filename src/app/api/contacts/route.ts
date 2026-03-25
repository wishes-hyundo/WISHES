import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  email: z.string().email('올바른 이메일 형식이 아닙니다').optional().or(z.literal('')),
  message: z.string().optional(),
  listingId: z.number().nullable().optional(),
});

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

    const { name, phone, email, message, listingId } = parsed.data;
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
      })
      .select()
      .single();

    if (error) {
      console.error('contacts insert error:', error);
      return NextResponse.json(
        { success: false, error: '문의 등록에 실패했습니다', detail: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('contacts error:', error);
    return NextResponse.json(
      { success: false, error: '문의 등록에 실패했습니다', detail: String(error) },
      { status: 500 }
    );
  }
}
