// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: POST /api/admin/dedup/hide
//
// 중복으로 판정된 매물을 status='중복정리' 로 소프트-삭제.
// 30일 동안 복구 가능. 30일 경과 시 cron 이 하드삭제.
//
// Body:
//   { ids: number[], group_id: string, kept_id: number, reason: string }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as any));
    const ids: unknown = body.ids;
    const group_id: string = typeof body.group_id === 'string' ? body.group_id : '';
    const kept_id: number | null =
      typeof body.kept_id === 'number' && Number.isInteger(body.kept_id) ? body.kept_id : null;
    const reason: string = typeof body.reason === 'string' ? body.reason.slice(0, 1000) : '';

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids (number[]) required' }, { status: 400 });
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
    if (kept_id !== null && cleanIds.includes(kept_id)) {
      return NextResponse.json(
        { error: '대표 매물(kept_id) 은 숨김 대상에서 제외해야 합니다.' },
        { status: 400 },
      );
    }

    const supabase = createServerClient();
    const nowIso = new Date().toISOString();

    const payload: Record<string, any> = {
      status: '중복정리',
      dedup_requested_at: nowIso,
      dedup_reason: reason || null,
      dedup_group_id: group_id || null,
      dedup_kept_id: kept_id,
    };
    const { data, error } = await (supabase as any)
      .from('listings')
      .update(payload)
      .in('id', cleanIds)
      .select('id');

    if (error) {
      console.error('dedup hide error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      hidden: data?.length || 0,
      requested: cleanIds.length,
      group_id,
      kept_id,
      expires_at_hint: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (e: any) {
    console.error('dedup hide error:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
