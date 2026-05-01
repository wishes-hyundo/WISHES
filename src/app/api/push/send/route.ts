// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/push/send — 서버 내부 푸시 발송 (A3, 2026-05-02)
//
// 인증: Authorization: Bearer <CRON_SECRET>
//   notify-matches cron / admin 알림 등 서버 측에서만 호출.
//
// Body:
//   {
//     target: 'saved_search' | 'user' | 'email',
//     value:  number | string,
//     payload: { title, body, url?, icon?, tag? }
//   }
//
// 410/404 응답 endpoint 자동 비활성화.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendPushBatch, type PushPayload, type PushSubscriptionRow } from '@/lib/push';
import { timingSafeEqualStr } from '@/lib/timingSafe';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PayloadSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  url: z.string().max(512).optional(),
  icon: z.string().max(512).optional(),
  tag: z.string().max(60).optional(),
});

const BodySchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('saved_search'), value: z.number().int().positive(), payload: PayloadSchema }),
  z.object({ target: z.literal('user'), value: z.string().uuid(), payload: PayloadSchema }),
  z.object({ target: z.literal('email'), value: z.string().email().max(320), payload: PayloadSchema }),
]);

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return timingSafeEqualStr(token, cronSecret);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { target, value, payload } = parsed.data;

  const supabase = createServerClient();
  let q = supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('active', true);
  if (target === 'saved_search') q = q.eq('saved_search_id', value);
  else if (target === 'user') q = q.eq('user_id', value);
  else q = q.eq('email', value);

  const { data: subs, error } = await q;
  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ success: true, sent: 0, expired: 0 });
  }

  const result = await sendPushBatch(subs as PushSubscriptionRow[], payload as PushPayload);

  // 만료된 endpoint 일괄 비활성화
  if (result.expiredEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ active: false, last_failed_at: new Date().toISOString() })
      .in('endpoint', result.expiredEndpoints);
  }

  return NextResponse.json({
    success: true,
    sent: result.sent,
    expired: result.expiredEndpoints.length,
    total: subs.length,
  });
}
