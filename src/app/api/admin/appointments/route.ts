// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: /api/admin/appointments — 방문 예약 관리 (#47)
//
//   GET  /api/admin/appointments         → 미래 예약 + 지난 14일
//   PATCH /api/admin/appointments        → status / agent_memo / visit_date / visit_slot 변경
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { dateStringSchema } from '@/lib/schemas'; // L-hub2
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAuth(request))) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    const supabase = createServerClient() as any;

    // 지난 14일 ~ 미래 전부
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceIso = since.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('appointments')
      .select(
        `
        id,
        listing_id,
        contact_id,
        name,
        phone,
        email,
        visit_date,
        visit_slot,
        note,
        status,
        agent_memo,
        source,
        created_at,
        updated_at,
        listings(title, dong, type, deal)
      `
      )
      .gte('visit_date', sinceIso)
      .order('visit_date', { ascending: true });

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[admin/appointments] fetch error', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const formatted = (data || []).map((a: any) => ({
      id: a.id,
      listingId: a.listing_id,
      contactId: a.contact_id,
      name: a.name,
      phone: a.phone,
      email: a.email,
      visitDate: a.visit_date,
      visitSlot: a.visit_slot,
      note: a.note,
      status: a.status,
      agentMemo: a.agent_memo,
      source: a.source,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      listingTitle: a.listings?.title || null,
      listingMeta: a.listings
        ? [a.listings.dong, a.listings.type, a.listings.deal].filter(Boolean).join(' · ')
        : null,
    }));

    return NextResponse.json({ success: true, appointments: formatted });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'server error' },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  id: z.number(),
  status: z.enum(['requested', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  agentMemo: z.string().max(1000).optional().nullable(),
  visitDate: dateStringSchema.optional(), // L-hub2
  visitSlot: z.string().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    if (!(await verifyAuth(request))) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { id, status, agentMemo, visitDate, visitSlot } = parsed.data;
    const patch: Record<string, any> = {};
    if (status !== undefined) patch.status = status;
    if (agentMemo !== undefined) patch.agent_memo = agentMemo;
    if (visitDate !== undefined) patch.visit_date = visitDate;
    if (visitSlot !== undefined) patch.visit_slot = visitSlot;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: '변경 항목 없음' }, { status: 400 });
    }

    const supabase = createServerClient() as any;
    const { error } = await supabase.from('appointments').update(patch).eq('id', id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'server error' },
      { status: 500 }
    );
  }
}
