// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/push/subscribe — PR-N-1
//
// Web Push 구독 등록. 사용자 동의 후만 호출 가능 (RLS 보호).
// 헌법 §54 / 사장님 명시: 동의 후만 / 1인당 월 ≤ 4회 / 22~08시 차단
//
// Body: { endpoint, keys: { p256dh, auth }, userAgent? }
// Auth: Authorization: Bearer <Supabase JWT> 필요
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
}

export async function POST(request: NextRequest) {
  // Rate limit — 분당 5회/IP (스팸 방지)
  const ip = getClientIp(request);
  const rl = checkRateLimit({ key: `push:subscribe:${ip}`, limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
  }

  // 인증 — Supabase JWT 필수
  const authHdr = request.headers.get('authorization') || '';
  const token = authHdr.startsWith('Bearer ') ? authHdr.slice(7) : '';
  if (!token) {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 });
  }

  const sb = createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ success: false, error: 'invalid_token' }, { status: 401 });
  }

  // Body 검증
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  if (
    !body.endpoint ||
    typeof body.endpoint !== 'string' ||
    !body.keys ||
    !body.keys.p256dh ||
    !body.keys.auth ||
    body.endpoint.length > 2000
  ) {
    return NextResponse.json({ success: false, error: 'invalid_payload' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error: upsertErr } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 500) : null,
        is_blocked: false,
      },
      { onConflict: 'endpoint' },
    );

  if (upsertErr) {
    return NextResponse.json(
      { success: false, error: 'db_error', detail: upsertErr.message?.slice(0, 100) },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
