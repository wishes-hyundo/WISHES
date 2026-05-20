import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';

/**
 * R102 (2026-05-19) — checklist 이탈률 측정 silent tracking
 * 손님 페이지에서 silent fetch (사장님 명령: 손님 보이지 X)
 * POST /api/checklist-funnel { sessionId, event, deal?, meta? }
 *
 * Rate limit: 30 events / IP / 5분 (도배 방지)
 */

const ALLOWED_EVENTS = new Set([
  'visit', 'step1_done', 'step2_done', 'step3_done',
  'sent', 'review_open', 'review_cancel', 'review_confirm',
  // R175 — 클라이언트 세부 분석 이벤트 (누락 → 400 콘솔 에러 유발하던 것)
  'field_time', 'paste', 'prop_change', 'helpline_call', 'helpline_sms'
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `funnel:${ip}`, limit: 30, windowMs: 5 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ success: false }, { status: 429, headers: corsHeaders });
    }

    let input: { sessionId?: string; event?: string; deal?: string; meta?: unknown } = {};
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
    }

    const sessionId = String(input.sessionId || '').slice(0, 64);
    const event = String(input.event || '').slice(0, 32);
    if (!sessionId || !event || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ success: false, message: 'Invalid event' }, { status: 400, headers: corsHeaders });
    }

    const ua = (request.headers.get('user-agent') || '').slice(0, 300);
    const deal = typeof input.deal === 'string' ? input.deal.slice(0, 20) : null;

    const sb = createServerClient();
    await sb.from('checklist_funnel_events').insert({
      session_id: sessionId,
      event,
      client_ip: ip,
      user_agent: ua,
      deal,
      meta: input.meta && typeof input.meta === 'object' ? input.meta : null,
    });

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (e: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[R102] funnel error', e);
    }
    return NextResponse.json({ success: false }, { status: 500, headers: corsHeaders });
  }
}
