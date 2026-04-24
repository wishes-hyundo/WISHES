// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET, PATCH /api/admin/contacts
// L-sec136 (2026-04-23): A-crit-1 IDOR 수정 — PATCH 는 상담이 달린 listing 을
//   본인이 소유했을 때만 상태 변경 가능. 기존에는 verifyAdminAuth 만 통과하면
//   임의 상담 id 의 status 를 바꿀 수 있었음 (다른 중개사 상담까지).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { verifyAdminAuth as verifyAuth, verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { authorizeListingMutation } from '@/lib/adminAuthz';
import { audit } from '@/lib/auditLog';
import { getClientIp } from '@/lib/rateLimit';
// L-hub3 (2026-04-22): Zod 공용 스키마 허브 이관.
import { listingIdSchema } from '@/lib/schemas';

/**
 * GET /api/admin/contacts - 모든 상담 조회 (관리자용)
 *
 * L-sec137 (2026-04-23): agent scope 필터링 추가.
 *   이전엔 verifyAuth 만 통과하면 전체 상담 목록 노출 → read-side IDOR.
 *   agent 는 본인이 created_by 인 매물에 달린 상담만 조회.
 *   master/superadmin/crawler_bridge 는 전체 조회 유지.
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // ── L-sec137 agent scope ──
    const ctx = await verifyAdminAuthWithContext(request);
    const UNLIMITED_ROLES = new Set(['master', 'superadmin', 'crawler_bridge']);
    const role = ctx.ok ? ctx.role : undefined;
    const uid = ctx.ok ? ctx.uid : undefined;
    const unlimited = !!(role && UNLIMITED_ROLES.has(role));

    let scopedListingIds: number[] | null = null;
    if (!unlimited) {
      if (!uid) {
        return NextResponse.json({ success: true, data: [] });
      }
      const { data: myListings, error: myErr } = await supabase
        .from('listings')
        .select('id')
        .eq('created_by', uid);
      if (myErr) {
        console.error('listing scope 조회 오류:', myErr);
        return NextResponse.json(
          { success: false, error: '상담 조회에 실패했습니다' },
          { status: 500 }
        );
      }
      scopedListingIds = ((myListings || []) as Array<{ id: number }>).map((r) => r.id);
      if (scopedListingIds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    // 상담과 매물 정보를 함께 조회
    let query = supabase
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

    if (scopedListingIds) {
      query = query.in('listing_id', scopedListingIds);
    }

    const { data, error } = await query;

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
 *
 * L-sec136: 상담의 listing_id 를 먼저 조회 → authorizeListingMutation 으로
 *   해당 매물의 소유자만 상태 변경 허용. unlimited role (master/superadmin/
 *   crawler_bridge) 은 모든 상담 수정 가능.
 */
export async function PATCH(request: NextRequest) {
  const ip = getClientIp(request);
  try {
    if (!(await verifyAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const body = await request.json();
    // L-hub3: contact id 는 listingId 와 동일한 bigint 제약 재사용.
    const updateSchema = z.object({
      id: listingIdSchema,
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

    // ── L-sec136 IDOR 가드 ──
    // 1) contact 의 listing_id 를 조회
    const { data: contactRow, error: contactErr } = await supabase
      .from('contacts')
      .select('id, listing_id')
      .eq('id', parsed.data.id)
      .maybeSingle();

    if (contactErr) {
      console.error('contact 조회 오류:', contactErr);
      audit({ action: 'contact.status_update.error', ip, target: { type: 'contact', id: parsed.data.id }, status: 500, meta: { stage: 'lookup' } });
      return NextResponse.json(
        { success: false, error: '상담 조회에 실패했습니다' },
        { status: 500 }
      );
    }
    if (!contactRow) {
      audit({ action: 'contact.status_update.denied', ip, target: { type: 'contact', id: parsed.data.id }, status: 404, meta: { reason: 'not_found' } });
      return NextResponse.json(
        { success: false, error: '상담을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    const listingId = (contactRow as { listing_id: number | null }).listing_id;
    const UNLIMITED_ROLES = new Set(['master', 'superadmin', 'crawler_bridge']);

    if (typeof listingId !== 'number' || !Number.isInteger(listingId)) {
      // 상담이 매물과 분리된 경우 (null listing_id 또는 비정상값) → unlimited role 만 처리 허용
      const ctx = await verifyAdminAuthWithContext(request);
      const role = ctx.ok ? ctx.role : undefined;
      if (!role || !UNLIMITED_ROLES.has(role)) {
        audit({ action: 'contact.status_update.denied', actor: { email: ctx.email, role: ctx.role, uid: ctx.uid }, ip, target: { type: 'contact', id: parsed.data.id }, status: 403, meta: { reason: 'orphan_contact_requires_unlimited' } });
        return NextResponse.json(
          { success: false, error: '해당 상담의 매물 권한을 확인할 수 없습니다' },
          { status: 403 }
        );
      }
    } else {
      // 2) listing 소유 권한 확인 (agent 는 본인 매물만)
      const authz = await authorizeListingMutation(request, listingId, supabase);
      if (!authz.ok) {
        audit({ action: 'contact.status_update.denied', actor: authz.actor, ip, target: { type: 'contact', id: parsed.data.id }, status: authz.status, meta: { reason: authz.reason, listingId } });
        return NextResponse.json(
          { success: false, error: authz.reason },
          { status: authz.status }
        );
      }
    }

    // 3) 실제 업데이트
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
      audit({ action: 'contact.status_update.error', ip, target: { type: 'contact', id: parsed.data.id }, status: 500, meta: { stage: 'update' } });
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

    audit({
      action: 'contact.status_update.ok',
      ip,
      target: { type: 'contact', id: parsed.data.id },
      status: 200,
      meta: { listingId, newStatus: parsed.data.status },
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('상담 상태 변경 오류:', error);
    audit({ action: 'contact.status_update.error', ip, status: 500, meta: { reason: 'exception' } });
    return NextResponse.json(
      { success: false, error: '상태 변경에 실패했습니다' },
      { status: 500 }
    );
  }
}
