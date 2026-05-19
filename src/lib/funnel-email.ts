/**
 * R104 — checklist 이탈률 이메일 템플릿 + Supabase 통계 + Resend 발송
 */
import { createServerClient } from '@/lib/supabase';

const TO_EMAIL = process.env.WISHES_OWNER_EMAIL || 'wishes@wishes.co.kr';
const FROM_EMAIL = process.env.WISHES_FROM_EMAIL || 'WISHES <noreply@wishes.co.kr>';

interface FunnelStats {
  days: number;
  total_sessions: number;
  funnel: { visit: number; step1_done: number; step2_done: number; step3_done: number; sent: number };
  dropoff_pct: { visit_to_step1: number; step1_to_step2: number; step2_to_step3: number; step3_to_sent: number; total: number };
  conversion_pct: number;
}

export async function computeFunnel(days: number): Promise<FunnelStats> {
  const sb = createServerClient();
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from('checklist_funnel_events')
    .select('event, session_id, created_at')
    .gte('created_at', sinceIso);
  const rows = data || [];
  const stageOrder: Record<string, number> = { visit: 1, step1_done: 2, step2_done: 3, step3_done: 4, sent: 5 };
  const sessionStage = new Map<string, number>();
  for (const r of rows) {
    const stage = stageOrder[r.event as string] ?? 0;
    if (!stage) continue;
    const cur = sessionStage.get(r.session_id) ?? 0;
    if (stage > cur) sessionStage.set(r.session_id, stage);
  }
  const counts = { visit: 0, step1_done: 0, step2_done: 0, step3_done: 0, sent: 0 };
  for (const stage of sessionStage.values()) {
    if (stage >= 1) counts.visit++;
    if (stage >= 2) counts.step1_done++;
    if (stage >= 3) counts.step2_done++;
    if (stage >= 4) counts.step3_done++;
    if (stage >= 5) counts.sent++;
  }
  const pct = (n: number, d: number) => (d ? Math.round((1 - n / d) * 1000) / 10 : 0);
  return {
    days,
    total_sessions: counts.visit,
    funnel: counts,
    dropoff_pct: {
      visit_to_step1: pct(counts.step1_done, counts.visit),
      step1_to_step2: pct(counts.step2_done, counts.step1_done),
      step2_to_step3: pct(counts.step3_done, counts.step2_done),
      step3_to_sent:  pct(counts.sent, counts.step3_done),
      total: pct(counts.sent, counts.visit),
    },
    conversion_pct: counts.visit ? Math.round((counts.sent / counts.visit) * 1000) / 10 : 0,
  };
}

function bar(count: number, max: number, color: string): string {
  const pct = max ? Math.round((count / max) * 100) : 0;
  return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0">
    <div style="width:160px;background:#F2F2F7;border-radius:6px;overflow:hidden;height:24px;">
      <div style="background:${color};height:24px;width:${pct}%"></div>
    </div>
    <span style="font-weight:700;color:#1C1C1E;font-size:15px">${count}</span>
  </div>`;
}

export function buildFunnelEmailHtml(stats: FunnelStats, title: string): string {
  const max = Math.max(stats.funnel.visit, 1);
  const periodLabel = stats.days === 1 ? '어제' : `최근 ${stats.days}일`;
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#F2F2F7;font-family:'Apple SD Gothic Neo','-apple-system',sans-serif;color:#1C1C1E">
<div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:14px;padding:24px;color:#1C1C1E">
  <h1 style="margin:0 0 4px;font-size:22px;color:#007AFF">🏠 ${title}</h1>
  <div style="color:#8E8E93;font-size:13px;margin-bottom:20px">${periodLabel} 손님 체크리스트 이탈률</div>

  <div style="background:linear-gradient(135deg,#E5F4EB 0%,#D6F0FA 100%);border-radius:12px;padding:16px;margin-bottom:20px">
    <div style="font-size:13px;color:#1C1C1E;margin-bottom:6px">📊 전환율</div>
    <div style="font-size:32px;font-weight:800;color:#34C759">${stats.conversion_pct}%</div>
    <div style="font-size:12px;color:#1C1C1E;margin-top:4px">방문 ${stats.funnel.visit}명 중 ${stats.funnel.sent}명 전송 완료</div>
  </div>

  <h2 style="font-size:15px;color:#1C1C1E;margin:20px 0 8px">단계별 손님 수</h2>
  <div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px;color:#1C1C1E">
      <span style="width:120px;color:#8E8E93">페이지 방문</span>${bar(stats.funnel.visit, max, '#007AFF')}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px;color:#1C1C1E">
      <span style="width:120px;color:#8E8E93">STEP 1 완료</span>${bar(stats.funnel.step1_done, max, '#5856D6')}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px;color:#1C1C1E">
      <span style="width:120px;color:#8E8E93">STEP 2 완료</span>${bar(stats.funnel.step2_done, max, '#FF9500')}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px;color:#1C1C1E">
      <span style="width:120px;color:#8E8E93">STEP 3 완료</span>${bar(stats.funnel.step3_done, max, '#FF3B30')}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px;color:#1C1C1E">
      <span style="width:120px;color:#8E8E93">전송 완료</span>${bar(stats.funnel.sent, max, '#34C759')}
    </div>
  </div>

  <h2 style="font-size:15px;color:#1C1C1E;margin:20px 0 8px">단계별 이탈률</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;color:#1C1C1E">
    <tr style="background:#F2F2F7">
      <td style="padding:8px 10px;font-weight:600;color:#1C1C1E">방문 → STEP 1</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#FF3B30">${stats.dropoff_pct.visit_to_step1}%</td>
    </tr>
    <tr>
      <td style="padding:8px 10px;color:#1C1C1E">STEP 1 → STEP 2</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#FF9500">${stats.dropoff_pct.step1_to_step2}%</td>
    </tr>
    <tr style="background:#F2F2F7">
      <td style="padding:8px 10px;color:#1C1C1E">STEP 2 → STEP 3</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#FF9500">${stats.dropoff_pct.step2_to_step3}%</td>
    </tr>
    <tr>
      <td style="padding:8px 10px;color:#1C1C1E">STEP 3 → 전송</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#FF3B30">${stats.dropoff_pct.step3_to_sent}%</td>
    </tr>
    <tr style="background:#FFEBEB">
      <td style="padding:8px 10px;font-weight:700;color:#1C1C1E">전체 이탈률</td>
      <td style="padding:8px 10px;text-align:right;font-weight:800;color:#FF3B30;font-size:15px">${stats.dropoff_pct.total}%</td>
    </tr>
  </table>

  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E5EA;font-size:11px;color:#8E8E93;text-align:center">
    🤖 위시스부동산 자동 발송 · 매주 월요일 오전 8시 · ${new Date().toLocaleString('ko-KR')}
  </div>
</div>
</body></html>`;
}

export async function sendFunnelEmail(stats: FunnelStats, title: string): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'RESEND_API_KEY_missing' };
  const html = buildFunnelEmailHtml(stats, title);
  const subject = `[위시스] ${title} — 전환율 ${stats.conversion_pct}%`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: TO_EMAIL,
        subject,
        html,
      }),
    });
    if (r.status >= 200 && r.status < 300) return { ok: true };
    const txt = await r.text().catch(() => '');
    return { ok: false, reason: 'resend_' + r.status + ': ' + txt.slice(0, 200) };
  } catch (e) {
    return { ok: false, reason: 'fetch_error: ' + (e instanceof Error ? e.message : String(e)) };
  }
}
