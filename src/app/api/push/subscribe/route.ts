// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/push/subscribe — Push 구독 등록 (A3, 2026-05-02)
//
// Body:
//   {
//     endpoint: string (PushSubscription.endpoint),
//     keys: { p256dh: string, auth: string },
//     savedSearchId?: number,  // saved_searches FK
//     email?: string           // 게스트 식별자
//   }
//
// 인증:
//   - Authorization: Bearer <Supabase JWT> 가 있으면 user_id 자동 주입
//   - 없으면 email 필수 (게스트 saved_search 구독)
//
// upsert(onConflict: endpoint) — 같은 endpoint 가 같은 사용자/이메일로
// 다시 등록되면 active=true 갱신. RLS 우회 위해 service-role 사용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(10).max(500),
    auth: z.string().min(8).max(500),
  }),
  savedSearchId: z.number().int().nonnegative().optional().nullable(),
  email: z.string().email().max(320).optional().nullable(),
});

export async function POST(request: NextRequest) {
  // L-sec170 (PR-A3): 신규 구독 endpoint 스팸 방지 — 30회/분/IP
  const ip = getClientIp(request);
  const rl = checkRateLimit({ key: `push-subscribe:ip:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { endpoint, keys, savedSearchId, email } = parsed.data;

  const supabase = createServerClient();

  // Authorization 헤더 → user_id 추출 (있으면)
  let userId: string | null = null;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { data } = await supabase.auth.getUser(token);
      userId = data?.user?.id || null;
    } catch {
      /* invalid token — guest 폴백 */
    }
  }

  if (!userId && !email) {
    return NextResponse.json(
      { error: 'auth_required', message: '로그인 또는 이메일 필요' },
      { status: 401 },
    );
  }

  const userAgent = request.headers.get('user-agent')?.slice(0, 200) || null;

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_id: userId,
        email: email || null,
        saved_search_id: savedSearchId || null,
        user_agent: userAgent,
        active: true,
        last_used_at: new Date().toISOString(),
        fail_count: 0,
      },
      { onConflict: 'endpoint' },
    );

  if (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: 'db_error', detail: isDev ? error.message : undefined },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
