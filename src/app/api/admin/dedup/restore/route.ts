// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: POST /api/admin/dedup/restore
//
// 숨김 처리된 매물을 다시 '공개' 로 복구.
// GET  ?queue=1 — 현재 중복정리 대기열(30일 내 복구 가능) 조회.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('listings')
      .select(`
        id, title, type, deal, deposit, monthly, price,
        address, address_detail, area_m2, floor_current,
        source_site, source_id, status,
        dedup_requested_at, dedup_reason, dedup_group_id, dedup_kept_id,
        listing_images(url, is_thumbnail)
      `)
      .eq('status', '중복정리')
      .order('dedup_requested_at', { ascending: false })
      .limit(1000);
    if (error) {
      // L-sec114 (2026-04-22): admin-gated defense-in-depth.
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ success: false, error: '목록 조회 실패', ...(isDev && { detail: error.message }) }, { status: 500 });
    }
    const rows = (data || []).map((r: any) => {
      const ts = r.dedup_requested_at ? new Date(r.dedup_requested_at).getTime() : 0;
      const ageDays = ts ? Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)) : 0;
      const remainDays = Math.max(0, 30 - ageDays);
      return {
        ...r,
        age_days: ageDays,
        remain_days: remainDays,
        will_hard_delete_soon: remainDays <= 3,
        image_count: r.listing_images?.length ?? 0,
        thumbnail: r.listing_images?.[0]?.url ?? null,
      };
    });
    return NextResponse.json({ success: true, total: rows.length, rows });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as any));
    const ids: unknown = body.ids;
    const group_id: string = typeof body.group_id === 'string' ? body.group_id : '';

    const supabase = createServerClient();

    const restorePayload: Record<string, any> = {
      status: '공개',
      dedup_requested_at: null,
      dedup_reason: null,
      dedup_group_id: null,
      dedup_kept_id: null,
    };

    // group_id 단독 복구 지원
    if (group_id && (!Array.isArray(ids) || ids.length === 0)) {
      const { data, error } = await (supabase as any)
        .from('listings')
        .update(restorePayload)
        .eq('dedup_group_id', group_id)
        .eq('status', '중복정리')
        .select('id');
      if (error) {
        // L-sec114 (2026-04-22): admin-gated defense-in-depth.
        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json({ success: false, error: '복원 실패', ...(isDev && { detail: error.message }) }, { status: 500 });
      }
      return NextResponse.json({ success: true, restored: data?.length || 0, group_id });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids or group_id required' }, { status: 400 });
    }
    if (ids.length > 500) {
      return NextResponse.json({ error: 'Max 500 IDs per request' }, { status: 400 });
    }
    const cleanIds = (ids as any[]).filter(
      (n) => typeof n === 'number' && Number.isInteger(n),
    );
    if (cleanIds.length === 0) {
      return NextResponse.json({ error: 'No valid IDs' }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from('listings')
      .update(restorePayload)
      .in('id', cleanIds)
      .eq('status', '중복정리')
      .select('id');

    if (error) {
      // L-sec114 (2026-04-22): admin-gated defense-in-depth.
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ success: false, error: '복원 실패', ...(isDev && { detail: error.message }) }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      restored: data?.length || 0,
      requested: cleanIds.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
