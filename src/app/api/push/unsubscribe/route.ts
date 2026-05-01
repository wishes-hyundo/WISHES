// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/push/unsubscribe — PR-N-1
//
// Web Push 구독 해제 (사용자 본인만 RLS 보호).
// Body: { endpoint }
// Auth: Bearer JWT 필수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authHdr = request.headers.get('authorization') || '';
  const token = authHdr.startsWith('Bearer ') ? authHdr.slice(7) : '';
  if (!token) return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 });

  const sb = createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ success: false, error: 'invalid_token' }, { status: 401 });

  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  if (!body.endpoint || typeof body.endpoint !== 'string') {
    return NextResponse.json({ success: false, error: 'invalid_payload' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error: delErr } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', body.endpoint);

  if (delErr) {
    return NextResponse.json({ success: false, error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
