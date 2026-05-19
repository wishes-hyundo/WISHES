import { NextRequest, NextResponse } from 'next/server';
import { computeFunnel, sendFunnelEmail } from '@/lib/funnel-email';

/**
 * R104 — Vercel cron 매주 월요일 오전 8시 KST (= 0 23 * * 0 UTC)
 * vercel.json 에 등록 필요.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false }, { status: 401 });
    }
  }
  try {
    const stats = await computeFunnel(7);
    const result = await sendFunnelEmail(stats, `손님 이탈률 (주간 보고)`);
    return NextResponse.json({ success: result.ok, reason: result.reason || null, stats });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
