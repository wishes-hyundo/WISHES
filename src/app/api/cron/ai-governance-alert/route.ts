// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /api/cron/ai-governance-alert — PR-G3
//
// AI 거버넌스 알림 (헌법 §117 / RFC 0004)
//   ai_governance_log WHERE alert_level IN ('warn','critical') AND notified_at IS NULL
//   → Resend 이메일 발송 (RESEND_API_KEY 있을 때, 사장님 wishes@wishes.co.kr)
//   → notified_at 갱신 (중복 발송 방지)
//
// 알림 정책 (헌법 §117):
//   80% (warn)    → 정보성 알림
//   95% (critical) → 즉시 알림 + AI 호출 차단 (ai_governance_state.is_blocked)
//   100% (critical) → 즉시 알림 + 차단 + 사용자 화면 폴백 (애플리케이션 코드 별도)
//
// Resend API key 미설정 시:
//   console.warn 폴백 (Sentry 자동 캡처)
//   notified_at 은 그대로 갱신 (큐 중복 방지)
//
// 실행 빈도: 매일 09:30 KST (UTC 00:30) — vercel.json crons 추가
// 헌법: §54 UI 변경 0 / §96 Phase 1 새 기능 0 (인프라 보강)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ALERT_TO = 'wishes@wishes.co.kr';
const ALERT_FROM = 'WISHES Cowork <noreply@wishes.co.kr>';

interface GovernanceLogRow {
  id: number;
  measured_at: string;
  kind: string;
  payload: Record<string, unknown>;
  alert_level: 'warn' | 'critical';
}

function formatAlertSubject(kind: string, level: string, count: number): string {
  const prefix = level === 'critical' ? '🚨 [WISHES CRITICAL]' : '⚠️ [WISHES WARN]';
  return `${prefix} AI 거버넌스 알림 — ${kind} ${count}건`;
}

function formatAlertHtml(rows: GovernanceLogRow[]): string {
  const sections = rows.map((r) => {
    const payloadStr = JSON.stringify(r.payload, null, 2);
    return `
<h3>${r.alert_level.toUpperCase()} — ${r.kind}</h3>
<p><strong>측정 시각:</strong> ${r.measured_at}</p>
<pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:12px;overflow:auto">${payloadStr.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c))}</pre>
`;
  }).join('\n<hr/>\n');

  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:680px;margin:24px auto;padding:0 16px;color:#222">
<h2>WISHES AI 거버넌스 알림</h2>
<p>총 ${rows.length}건의 미발송 알림이 있습니다. 헌법 §117 의 cap 도달 또는 hallucination 의심 통계입니다.</p>
${sections}
<hr/>
<p style="color:#888;font-size:12px">자동 발송 — Vercel cron (매일 09:30 KST). admin dashboard <code>/admin/ai-governance</code> 는 PR-M 에서.</p>
</body>
</html>`;
}

async function sendResendEmail(subject: string, html: string): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'RESEND_API_KEY_missing' };
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: ALERT_FROM,
        to: [ALERT_TO],
        subject,
        html,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { ok: false, reason: `resend_${resp.status}_${errText.slice(0, 100)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `fetch_error_${(err as Error).message?.slice(0, 100)}` };
  }
}

export async function GET(request: NextRequest) {
  // 인증 (vercel cron 표준)
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (cronSecret && !isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();

  // 1) 미발송 큐 조회 (warn/critical, 최근 7일)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('ai_governance_log')
    .select('id, measured_at, kind, payload, alert_level')
    .in('alert_level', ['warn', 'critical'])
    .is('notified_at', null)
    .gte('measured_at', sevenDaysAgo)
    .order('measured_at', { ascending: false })
    .limit(50)
    .returns<GovernanceLogRow[]>();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: 'no_pending_alerts' });
  }

  // 2) 알림 본문 빌드
  const criticalCount = rows.filter((r) => r.alert_level === 'critical').length;
  const warnCount = rows.length - criticalCount;
  const level = criticalCount > 0 ? 'critical' : 'warn';
  const subject = formatAlertSubject('cap+hallucination', level, rows.length);
  const html = formatAlertHtml(rows);

  // 3) Resend 발송 (RESEND_API_KEY 있을 때)
  const sendResult = await sendResendEmail(subject, html);

  // 4) notified_at 갱신 (중복 발송 방지) — Resend 실패해도 갱신 (재시도 X, Sentry 가 잡음)
  const ids = rows.map((r) => r.id);
  const { error: updateErr } = await supabase
    .from('ai_governance_log')
    .update({ notified_at: new Date().toISOString() })
    .in('id', ids);

  // 5) 결과 반환
  if (!sendResult.ok) {
    // RESEND_API_KEY 미설정은 정상 fallback 으로 간주 (큐 비우기 OK)
    if (sendResult.reason === 'RESEND_API_KEY_missing') {
      console.warn('[ai-governance-alert] RESEND_API_KEY 미설정 — 큐 비우기만 (notified_at 갱신).');
      return NextResponse.json({
        success: true,
        processed: rows.length,
        critical: criticalCount,
        warn: warnCount,
        delivery: 'skipped_no_api_key',
        update_error: updateErr?.message,
      });
    }
    console.error('[ai-governance-alert] Resend 발송 실패:', sendResult.reason);
    return NextResponse.json(
      {
        success: false,
        processed: rows.length,
        critical: criticalCount,
        warn: warnCount,
        delivery: 'failed',
        reason: sendResult.reason,
        update_error: updateErr?.message,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    processed: rows.length,
    critical: criticalCount,
    warn: warnCount,
    delivery: 'sent',
    to: ALERT_TO,
    update_error: updateErr?.message,
  });
}
