import { NextRequest, NextResponse } from 'next/server';
import { sendFunnelToNaverWorks } from '@/lib/funnel-naverworks';

/**
 * R106 — Vercel cron 매주 월요일 오전 8시 KST (= 0 23 * * 0 UTC)
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
    const result = await sendFunnelToNaverWorks(7);
    return NextResponse.json({ success: result.ok, postId: result.postId || null, reason: result.reason || null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
