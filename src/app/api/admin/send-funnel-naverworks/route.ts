import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { sendFunnelToNaverWorks } from '@/lib/funnel-naverworks';
import { computeFunnel } from '@/lib/funnel-email';

/**
 * R106 — 사장님 즉시 호출: NaverWorks 게시판에 이탈률 글 자동 등록
 * GET /api/admin/send-funnel-naverworks?days=7
 */
export async function GET(request: NextRequest) {
  try {
    const _auth = await verifyAdminAuthWithContext(request);
    if (!_auth.ok) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10) || 7, 1), 30);

    const result = await sendFunnelToNaverWorks(days);
    const stats = await computeFunnel(days);
    return NextResponse.json({ success: result.ok, postId: result.postId || null, reason: result.reason || null, stats });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
