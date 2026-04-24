// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: /api/admin/appointments — 방문 예약 관리 (#47)
//
//   GET  /api/admin/appointments         → 미래 예약 + 지난 14일
//   PATCH /api/admin/appointments        → status / agent_memo / visit_date / visit_slot 변경
//
// L-sec138 (2026-04-23): PATCH 에 IDOR 가드 추가. 이전엔 verifyAuth 만 통과하면
//   임의 appointment id 의 필드를 수정할 수 있었음 (다른 중개사 방문 예약 포함).
//   appointment 의 listing_id 를 조회 → authorizeListingMutation 으로 해당 매물
//   소유자만 수정 허용. unlimited role (master/superadmin/crawler_bridge) 은 전체
//   수정 가능. 모든 경로에 audit log.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { dateStringSchema } from '@/lib/schemas'; // L-hub2
import { verifyAdminAuth as verifyAuth, verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { authorizeListingMutation } from '@/lib/adminAuthz';
import { audit } from '@/lib/auditLog';
import { getClientIp } from '@/lib/rateLimit';

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
  const ip = getClientIp(request);
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

    // ── L-sec138 IDOR 가드 ──
    // 1) appointment 의 listing_id 조회
    const { data: apptRow, error: apptErr } = await supabase
      .from('appointments')
      .select('id, listing_id')
      .eq('id', id)
      .maybeSingle();

    if (apptErr) {
      console.error('appointment 조회 오류:', apptErr);
      audit({ action: 'appointment.update.error', ip, target: { type: 'appointment', id }, status: 500, meta: { stage: 'lookup' } });
      return NextResponse.json({ success: false, error: '예약 조회에 실패했습니다' }, { status: 500 });
    }
    if (!apptRow) {
      audit({ action: 'appointment.update.denied', ip, target: { type: 'appointment', id }, status: 404, meta: { reason: 'not_found' } });
      return NextResponse.json({ success: false, error: '예약을 찾을 수 없습니다' }, { status: 404 });
    }

    const listingId = (apptRow as { listing_id: number | null }).listing_id;
    const UNLIMITED_ROLES = new Set(['master', 'superadmin', 'crawler_bridge']);

    if (typeof listingId !== 'number' || !Number.isInteger(listingId)) {
      // orphan appointment (listing_id null/invalid) → unlimited role 만 허용
      const ctx = await verifyAdminAuthWithContext(request);
      const role = ctx.ok ? ctx.role : undefined;
      if (!role || !UNLIMITED_ROLES.has(role)) {
        audit({
          action: 'appointment.update.denied',
          actor: { email: ctx.ok ? ctx.email : undefined, role: ctx.ok ? ctx.role : undefined, uid: ctx.ok ? ctx.uid : undefined },
          ip,
          target: { type: 'appointment', id },
          status: 403,
          meta: { reason: 'orphan_appointment_requires_unlimited' },
        });
        return NextResponse.json(
          { success: false, error: '해당 예약의 매물 권한을 확인할 수 없습니다' },
          { status: 403 }
        );
      }
    } else {
      // 2) listing 소유 권한 확인
      const authz = await authorizeListingMutation(request, listingId, supabase);
      if (!authz.ok) {
        audit({
          action: 'appointment.update.denied',
          actor: authz.actor,
          ip,
          target: { type: 'appointment', id },
          status: authz.status,
          meta: { reason: authz.reason, listingId },
        });
        return NextResponse.json({ success: false, error: authz.reason }, { status: authz.status });
      }
    }

    const { error } = await supabase.from('appointments').update(patch).eq('id', id);
    if (error) {
      audit({ action: 'appointment.update.error', ip, target: { type: 'appointment', id }, status: 500, meta: { stage: 'update' } });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    audit({
      action: 'appointment.update.ok',
      ip,
      target: { type: 'appointment', id },
      status: 200,
      meta: { listingId, changed: Object.keys(patch) },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    audit({ action: 'appointment.update.error', ip, status: 500, meta: { reason: 'exception' } });
    return NextResponse.json(
      { success: false, error: err?.message || 'server error' },
      { status: 500 }
    );
  }
}
