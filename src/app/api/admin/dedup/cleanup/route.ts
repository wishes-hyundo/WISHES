// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: POST /api/admin/dedup/cleanup
//
// 30일 경과한 중복정리 매물을 하드 삭제.
// CASCADE 로 listing_images/listing_videos 도 같이 제거.
// Vercel Cron 또는 수동 관리자 호출 모두 지원.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { timingSafeEqualStr } from '@/lib/timingSafe';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    // Vercel Cron 은 x-vercel-cron 헤더를 싣거나 Authorization: Bearer <CRON_SECRET>
    const cronSecret = request.headers.get('x-cron-secret');
    // L-sec61 (2026-04-22): === → constant-time 비교 (타이밍 사이드채널 차단)
    const isCron = !!request.headers.get('x-vercel-cron')
      || (!!process.env.CRON_SECRET && timingSafeEqualStr(cronSecret, process.env.CRON_SECRET));
    if (!isCron && !(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as any));
    const dryRun = !!body.dryRun;
    const cutoffIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    const supabase = createServerClient();

    // 1) 하드삭제 대상 조회
    const { data: targets, error: selErr } = await supabase
      .from('listings')
      .select('id, dedup_group_id, dedup_requested_at, title, address')
      .eq('status', '중복정리')
      .lt('dedup_requested_at', cutoffIso)
      .limit(1000);
    if (selErr) {
      return NextResponse.json({ success: false, error: selErr.message }, { status: 500 });
    }
    const ids = (targets || []).map((r: any) => r.id);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        cutoff: cutoffIso,
        total: ids.length,
        targets,
      });
    }

    if (ids.length === 0) {
      return NextResponse.json({ success: true, deleted: 0, cutoff: cutoffIso });
    }

    // 2) 하드삭제 (listing_images/videos 는 CASCADE)
    const { data: deleted, error: delErr } = await supabase
      .from('listings')
      .delete()
      .in('id', ids)
      .select('id');
    if (delErr) {
      return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: deleted?.length || 0,
      cutoff: cutoffIso,
      ids,
    });
  } catch (e: any) {
    console.error('dedup cleanup error:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

// Vercel Cron 은 GET 만 지원하는 경우도 있어 동�