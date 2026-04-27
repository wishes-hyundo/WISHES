/**
 * /api/cron/auto-fix-problematic
 * 
 * 사장님 명령 (2026-04-28): 자동화 — 사장님께 일 시키지 마.
 * Phase 1-6 마이그레이션의 auto_fix_problematic_listings() SQL 함수 호출.
 * 
 * 자동 처리:
 *   - 원룸 + rooms > 1 → rooms = 1
 *   - 투룸 + rooms != 2 → rooms = 2
 *   - area_m2 invalid → status = '비공개' (사장님 명령상 보존, 화면만 안 보임)
 * 
 * 모든 변경 admin_audit_log 자동 기록.
 * Vercel Cron: 매일 03:00 KST (UTC 18:00 전일).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Vercel Cron 인증 (CRON_SECRET env)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    const expected = `Bearer ${cronSecret}`;
    if (authHeader !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('auto_fix_problematic_listings');

    if (error) {
      console.error('[cron/auto-fix-problematic] RPC error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      result: data,
      ts: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[cron/auto-fix-problematic] fatal:', e);
    return NextResponse.json(
      { success: false, error: e?.message || '서버 오류' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
