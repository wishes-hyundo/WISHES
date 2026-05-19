import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { computeFunnel, sendFunnelEmail } from '@/lib/funnel-email';

/**
 * R104 — 사장님 즉시 호출: 이탈률 이메일 발송
 * GET /api/admin/send-funnel-email?days=7
 */
export async function GET(request: NextRequest) {
  try {
    const _auth = await requireAdmin(request);
    if (!_auth.ok) {
      return NextResponse.json({ success: false, message: _auth.message || 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10) || 7, 1), 30);

    const stats = await computeFunnel(days);
    const result = await sendFunnelEmail(stats, `손님 이탈률 (테스트 발송)`);

    return NextResponse.json({
      success: result.ok,
      reason: result.reason || null,
      stats,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
