/**
 * R106 — checklist 이탈률 NaverWorks 게시판 자동 등록
 * 사장님이 이미 사용 중인 NaverWorks 환경변수 재사용 (Resend 불필요).
 */
import crypto from 'crypto';
import { computeFunnel } from './funnel-email';

function buildJWT(clientId: string, serviceAccount: string, privateKeyPEM: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: clientId, sub: serviceAccount, iat: now, exp: now + 3600 };
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const hdr = enc(header);
  const clm = enc(claims);
  const sigInput = hdr + '.' + clm;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(sigInput);
  const sig = sign.sign(privateKeyPEM, 'base64url');
  return hdr + '.' + clm + '.' + sig;
}

function bar(label: string, count: number, max: number, color: string): string {
  const pct = max ? Math.round((count / max) * 100) : 0;
  return `<tr><td style="padding:6px 10px;color:#1C1C1E;width:130px">${label}</td>
    <td style="padding:6px 10px"><div style="display:inline-block;background:${color};height:18px;width:${Math.max(pct, 2)}%;min-width:6px;border-radius:3px;vertical-align:middle"></div>
    <span style="margin-left:8px;font-weight:700;color:#1C1C1E">${count}</span></td></tr>`;
}

export async function sendFunnelToNaverWorks(days: number): Promise<{ ok: boolean; reason?: string; postId?: string }> {
  const clientId = process.env.NW_CLIENT_ID || '';
  const clientSecret = process.env.NW_CLIENT_SECRET || '';
  const svcAccount = process.env.NW_SERVICE_ACCOUNT || '';
  const privateKey = (process.env.NW_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const boardId = process.env.NW_BOARD_ID || '';
  if (!privateKey || !boardId) return { ok: false, reason: 'NW_env_missing' };

  const stats = await computeFunnel(days);
  const periodLabel = days === 1 ? '어제' : `최근 ${days}일`;
  const title = `[이탈률] ${periodLabel} — 방문 ${stats.funnel.visit} · 전송 ${stats.funnel.sent} · 전환율 ${stats.conversion_pct}%`;
  const max = Math.max(stats.funnel.visit, 1);

  let body = '<div style="font-family:sans-serif;max-width:700px;margin:0 auto;background:#FFFFFF;color:#1C1C1E;padding:16px;border-radius:8px">';
  body += `<h2 style="color:#007AFF;border-bottom:2px solid #007AFF;padding-bottom:8px;margin:0 0 14px">📊 손님 이탈률 (${periodLabel})</h2>`;
  body += `<div style="background:linear-gradient(135deg,#E5F4EB 0%,#D6F0FA 100%);border-radius:10px;padding:14px 16px;margin:0 0 14px;color:#1C1C1E">
    <div style="font-size:13px;color:#1C1C1E;margin-bottom:4px">전환율</div>
    <div style="font-size:30px;font-weight:800;color:#34C759">${stats.conversion_pct}%</div>
    <div style="font-size:12px;color:#1C1C1E;margin-top:6px">방문 ${stats.funnel.visit}명 중 ${stats.funnel.sent}명 전송 완료</div>
  </div>`;
  body += '<h3 style="font-size:14px;color:#1C1C1E;margin:14px 0 6px">단계별 손님 수</h3>';
  body += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  body += bar('페이지 방문', stats.funnel.visit, max, '#007AFF');
  body += bar('STEP 1 완료', stats.funnel.step1_done, max, '#5856D6');
  body += bar('STEP 2 완료', stats.funnel.step2_done, max, '#FF9500');
  body += bar('STEP 3 완료', stats.funnel.step3_done, max, '#FF3B30');
  body += bar('전송 완료', stats.funnel.sent, max, '#34C759');
  body += '</table>';

  body += '<h3 style="font-size:14px;color:#1C1C1E;margin:14px 0 6px">단계별 이탈률</h3>';
  body += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  const drow = (k: string, v: number, hl: boolean) =>
    `<tr style="background:${hl ? '#FFEBEB' : 'transparent'}"><td style="padding:6px 10px;color:#1C1C1E">${k}</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:${v > 50 ? '#FF3B30' : '#FF9500'}">${v}%</td></tr>`;
  body += drow('방문 → STEP 1', stats.dropoff_pct.visit_to_step1, stats.dropoff_pct.visit_to_step1 > 50);
  body += drow('STEP 1 → STEP 2', stats.dropoff_pct.step1_to_step2, false);
  body += drow('STEP 2 → STEP 3', stats.dropoff_pct.step2_to_step3, false);
  body += drow('STEP 3 → 전송', stats.dropoff_pct.step3_to_sent, false);
  body += `<tr style="background:#FFEBEB"><td style="padding:8px 10px;font-weight:700;color:#1C1C1E">전체 이탈률</td><td style="padding:8px 10px;text-align:right;font-weight:800;color:#FF3B30;font-size:15px">${stats.dropoff_pct.total}%</td></tr>`;
  body += '</table>';
  body += `<p style="color:#999;font-size:11px;margin-top:14px;text-align:center">📊 WISHES 자동 발송 · ${new Date().toLocaleString('ko-KR')}</p>`;
  body += '</div>';

  try {
    const jwt = buildJWT(clientId, svcAccount, privateKey);
    const tokenRes = await fetch('https://auth.worksmobile.com/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        assertion: jwt,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'board',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenRes.status !== 200 || !tokenData.access_token) {
      return { ok: false, reason: 'token_fail_' + tokenRes.status };
    }
    const token = tokenData.access_token;
    const postRes = await fetch(
      `https://www.worksapis.com/v1.0/boards/${boardId}/posts`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      }
    );
    const postData = await postRes.json().catch(() => ({}));
    if (postRes.status === 201) return { ok: true, postId: postData.postId || undefined };
    return { ok: false, reason: 'post_' + postRes.status };
  } catch (e) {
    return { ok: false, reason: 'fetch_error: ' + (e instanceof Error ? e.message : String(e)) };
  }
}
