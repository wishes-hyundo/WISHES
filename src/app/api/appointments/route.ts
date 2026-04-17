// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/appointments — 방문 예약 생성 (#45)
// GET  /api/appointments — 본인 조회용 (phone + visit_date)
//
//   설계 원칙
//   - contacts 와 appointments 를 동시에 생성해 리드 퍼널과 예약 관리 양쪽에 기록
//   - source 는 pathname 정규화 (쿼리/해시 제거)
//   - visit_date 는 오늘~60일 이내로 제한
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { z } from 'zod';

const appointmentSchema = z.object({
  name: z.string().min(2, '이름을 입력해주세요'),
  phone: z.string().min(9, '휴대폰 번호를 입력해주세요'),
  email: z.string().email('올바른 이메일 형식이 아닙니다').optional().or(z.literal('')),
  listingId: z.number().nullable().optional(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식'),
  visitSlot: z.string().min(1),
  note: z.string().max(500).optional().nullable(),
  source: z.string().max(200).optional().nullable(),
});

function normalizeSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    // 절대 URL이면 pathname만
    if (raw.startsWith('http')) {
      const u = new URL(raw);
      return u.pathname;
    }
    // 상대경로에서 쿼리/해시 제거
    return raw.split('?')[0].split('#')[0];
  } catch {
    return raw.slice(0, 200);
  }
}

function isWithinNextDays(dateStr: string, maxDays: number): boolean {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const max = new Date(today);
  max.setDate(max.getDate() + maxDays);
  return target >= today && target <= max;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = appointmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, phone, email, listingId, visitDate, visitSlot, note, source } = parsed.data;

    if (!isWithinNextDays(visitDate, 60)) {
      return NextResponse.json(
        { success: false, error: '방문 희망일은 오늘부터 60일 이내로 선택해주세요' },
        { status: 400 }
      );
    }

    const supabase = createClient() as any;
    const normalizedSource = normalizeSource(source);

    // 1) contacts 테이블에 리드로 기록 (어드민 상담 관리 파이프라인에 편입)
    const contactMessage = [
      note?.trim() || '',
      `[방문 예약] ${visitDate} · ${visitSlot}`,
      listingId ? `[매물] #${listingId}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const { data: contactRow, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        name,
        phone,
        email: email || null,
        message: contactMessage,
        listing_id: listingId ?? null,
        inquiry_type: 'visit_booking',
        pipeline_status: 'visit_booked', // #22 파이프라인 자동 전환
        source: normalizedSource,
      })
      .select('id')
      .single();

    if (contactErr) {
      // eslint-disable-next-line no-console
      console.error('[appointments] contact insert failed', contactErr);
    }

    // 2) appointments 테이블에 예약 기록
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        name,
        phone,
        email: email || null,
        listing_id: listingId ?? null,
        contact_id: contactRow?.id ?? null,
        visit_date: visitDate,
        visit_slot: visitSlot,
        note: note || null,
        status: 'requested',
        source: normalizedSource,
      })
      .select('id, visit_date, visit_slot, status')
      .single();

    if (apptErr) {
      return NextResponse.json(
        { success: false, error: apptErr.message || '예약 저장 실패' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, appointment: appt });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error' },
      { status: 500 }
    );
  }
}

// GET: 본인 확인용 (관리자 조회는 /api/admin/appointments 로 분리)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ success: false, error: 'phone 필요' }, { status: 400 });
  }

  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('appointments')
    .select('id, listing_id, visit_date, visit_slot, status, note, created_at')
    .eq('phone', phone)
    .order('visit_date', { ascending: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, appointments: data || [] });
}
