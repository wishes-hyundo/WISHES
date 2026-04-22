// POST /api/admin/send-newsletter — 어드민 뉴스레터 대량 발송 (T5-7)
//   body: { subject: string, body: string (html), targetIds?: number[] }
//   targetIds 미지정 시 전체 활성 구독자에게 발송
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendAdminNewsletter } from '@/lib/email';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // L-sec84 (2026-04-22): 이메일 대량 발송 비용 보호. 1h 5회/IP.
  const _ip = getClientIp(request);
  const _rl = checkRateLimit({ key: `newsletter:ip:${_ip}`, limit: 5, windowMs: 60 * 60_000 });
  if (!_rl.ok) {
    return NextResponse.json(
      { success: false, error: '요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
    );
  }
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.subject || !body.body) {
      return NextResponse.json({ success: false, error: '제목과 본문은 필수입니다' }, { status: 400 });
    }
    const subject = String(body.subject).slice(0, 120);
    const htmlBody = String(body.body).slice(0, 30000);
    // L-sec47 (2026-04-22): targetIds 배열 길이 cap (PostgREST URL 폭주 + 의도치 않은 대량발송 방지)
    const rawIds: unknown[] = Array.isArray(body.targetIds) ? body.targetIds : [];
    const targetIds: number[] | undefined = rawIds.length > 0
      ? rawIds
          .slice(0, 5000)
          .filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0)
      : undefined;

    const supabase = createServerClient();
    let query = supabase
      .from('saved_searches')
      .select('id, name, email, unsub_token')
      .eq('active', true);
    if (targetIds && targetIds.length > 0) query = query.in('id', targetIds);
    const { data: subs, error } = await query;
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return NextResponse.json({ success: true, sent: 0, total: 0 });
    }

    // 직렬 발송 (Resend rate limit 안전)
    let sent = 0;
    const failed: string[] = [];
    for (const sub of subs) {
      try {
        const res = await sendAdminNewsletter({
          to: sub.email,
          name: sub.name,
          subject,
          body: htmlBody,
          unsubToken: sub.unsub_token,
        });
        if (res) sent++;
        else failed.push(sub.email);
        // 소프트 스로틀 (초당 2건 수준)
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        failed.push(sub.email);
      }
    }

    return NextResponse.json({
      success: true,
      total: subs.length,
      sent,
      failedCount: failed.length,
      failedSample: failed.slice(0, 5),
    });
  } catch (e: any) {
    // L-sec47: prod 에서는 에러 세부 숨김 (DB 스키마·스택 누출 방지)
    console.error('send-newsletter error:', e);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: isDev ? (e?.message || '서버 오류') : '서버 오류' },
      { status: 500 }
    );
  }
}
