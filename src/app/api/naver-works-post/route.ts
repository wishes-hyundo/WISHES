import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { createServerClient } from '@/lib/supabase';

// ─── CORS headers ───
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// L-sec12 (2026-04-22): 공개 + CORS * + 외부 보드 POST 라 attacker 가
// 거대 payload 로 Naver Works 보드를 스팸해 API 할당량/스토리지를
// 고갈시킬 수 있다. 입력 shape 을 엄격히 제한해 차단.
const MAX_FIELD_LEN = 500;
const MAX_TITLE_FIELD = 100;
const MAX_SECTIONS = 20;
const MAX_ROWS_PER_SECTION = 30;
const MAX_BODY_BYTES = 50 * 1024; // 50KB

function capStr(v: unknown, max = MAX_FIELD_LEN): string {
  if (typeof v !== 'string') return '';
  return v.length > max ? v.slice(0, max) : v;
}

// ─── OPTIONS (preflight) ───
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ─── JWT builder (RS256) ───
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

// ─── POST handler ───
export async function POST(request: NextRequest) {
  try {
    // L-sec71 (2026-04-22): 공개 + CORS * 로 Naver Works API 할당량 보호
    //   15분 30회/IP cap. 사용 빈도가 낮은 내부 용 도구.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `naver-works:ip:${_ip}`, limit: 30, windowMs: 15 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, message: '요청이 너무 많습니다.' },
        { status: 429, headers: { ...corsHeaders, 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    // L-sec12: body 크기 상한을 먼저 측정해 50KB 초과시 즉시 차단.
    //   request.json() 은 raw bytes 접근이 어려우니 text() → JSON.parse.
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, message: `body 크기가 ${MAX_BODY_BYTES} bytes 를 초과합니다` },
        { status: 413, headers: corsHeaders }
      );
    }
    let input: any;
    try {
      input = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON' },
        { status: 400, headers: corsHeaders }
      );
    }
    if (!input || typeof input !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON' },
        { status: 400, headers: corsHeaders }
      );
    }

    /* ────────────────────────────────────────────────────────
       R61 (2026-05-19) — 🚨 사장님 명령: 조가영 손님 데이터 손실 재발 차단.
       Supabase 에 raw payload 즉시 영구 저장. forward 성공/실패 무관.
       사장님 발견 silent fail 시에도 사장님이 raw 데이터 확인 가능.
       ──────────────────────────────────────────────────────── */
    let _submissionId: number | null = null;
    try {
      const sb = createServerClient();
      const _ua = request.headers.get('user-agent') || '';
      const _sections = Array.isArray((input as { sections?: unknown }).sections)
        ? (input as { sections: unknown[] }).sections.length
        : 0;
      const _ins = await sb.from('checklist_submissions').insert({
        raw_payload: input,
        c_name: typeof (input as { cName?: unknown }).cName === 'string' ? (input as { cName: string }).cName : null,
        c_phone: typeof (input as { cPhone?: unknown }).cPhone === 'string' ? (input as { cPhone: string }).cPhone : null,
        deal: typeof (input as { deal?: unknown }).deal === 'string' ? (input as { deal: string }).deal : null,
        prop: typeof (input as { prop?: unknown }).prop === 'string' ? (input as { prop: string }).prop : null,
        sections_count: _sections,
        client_ip: _ip,
        user_agent: _ua.slice(0, 500),
        forwarded_status: 'pending',
      }).select('id').single();
      if (_ins.data && typeof _ins.data === 'object' && 'id' in _ins.data) {
        _submissionId = (_ins.data as { id: number }).id;
      }
    } catch (e) {
      // Supabase 실패해도 NaverWorks forward 는 계속 (가용성 우선)
      if (process.env.NODE_ENV !== 'production') console.error('[R61] Supabase save failed', e);
    }

    // R14 (2026-05-18): phone hash 2-key rate limit — 같은 손님 1시간 5회 cap.
    //   IP 단독 rate limit 으론 같은 손님 도배 차단 X (IP 30회 → 손님 30번 폭탄 가능).
    //   phone digits 끝 4자리 hash → privacy 안전 + 도배 차단 효과적.
    try {
      const cPhone = String(input.cPhone || '').replace(/\D/g, '');
      if (cPhone.length >= 4) {
        const t4 = cPhone.slice(-4);
        // 간단 FNV-1a — phone 직접 노출 X (key 만 비교)
        let h = 0x811c9dc5;
        const s = 'wsr14:' + t4;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
        const phoneKey = `naver-works:phone:${h.toString(16)}`;
        const _phRl = checkRateLimit({ key: phoneKey, limit: 5, windowMs: 60 * 60_000 });
        if (!_phRl.ok) {
          return NextResponse.json(
            { success: false, message: '같은 번호로 너무 많이 전송하셨어요. 잠시 후 다시 시도해주세요.' },
            { status: 429, headers: { ...corsHeaders, 'Retry-After': String(_phRl.retryAfterSec) } },
          );
        }
      }
    } catch { /* phone 검사 실패해도 다음 layer 로 진행 */ }

    // ─── Credentials from env ───
    const clientId = process.env.NW_CLIENT_ID || '';
    const clientSecret = process.env.NW_CLIENT_SECRET || '';
    const svcAccount = process.env.NW_SERVICE_ACCOUNT || '';
    const privateKey = (process.env.NW_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const boardId = process.env.NW_BOARD_ID || '';

    if (!privateKey) {
      return NextResponse.json(
        { success: false, message: 'No private key configured' },
        { status: 500, headers: corsHeaders }
      );
    }

    // ─── 1. Get access token ───
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
      return NextResponse.json(
        { success: false, message: 'Token fail', code: tokenRes.status },
        { status: 502, headers: corsHeaders }
      );
    }
    const token = tokenData.access_token;

    // ─── 2. Build HTML body ───
    const esc = (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // L-sec12: 제목 노출 필드는 짧은 cap (100자)
    const deal = esc(capStr(input.deal, MAX_TITLE_FIELD) || '-');
    const prop = esc(capStr(input.prop, MAX_TITLE_FIELD) || '-');
    const name = esc(capStr(input.cName, MAX_TITLE_FIELD) || 'N/A');
    const phone = esc(capStr(input.cPhone, MAX_TITLE_FIELD) || '');
    const title = `[${deal}][${prop}] ${name}${phone ? ' (' + phone + ')' : ''}`;

    // L-sec12: sections 배열은 20개 cap, 각 section 의 rows 는 30개 cap.
    const rawSections = Array.isArray(input.sections) ? input.sections.slice(0, MAX_SECTIONS) : [];
    // R26 ❹ — gold 톤 → 위시스 ios-blue 톤 (사장님 명령 "13년 브랜드 색 X")
    let s = '<div style="font-family:sans-serif;max-width:700px;margin:0 auto">';
    s += `<h2 style="color:#007AFF;border-bottom:2px solid #007AFF;padding-bottom:8px">${title}</h2>`;

    for (const sec of rawSections) {
      if (!sec || typeof sec !== 'object') continue;
      s += '<table style="width:100%;border-collapse:collapse;margin:10px 0">';
      s += `<tr style="background:#F2F2F7"><td colspan="2" style="padding:8px;font-weight:bold;color:#1C1C1E;font-size:15px">${esc(capStr(sec.title))}</td></tr>`;
      const rows = Array.isArray(sec.rows) ? sec.rows.slice(0, MAX_ROWS_PER_SECTION) : [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const lbl = esc(capStr(row[0]));
        const val = esc(capStr(row[1]));
        if (!val) continue;
        s += `<tr><td style="padding:6px 10px;border:1px solid #E5E5EA;width:30%;background:#F9F9FB;font-weight:bold;color:#1C1C1E">${lbl}</td><td style="padding:6px 10px;border:1px solid #E5E5EA;color:#1C1C1E">${val}</td></tr>`;
      }
      s += '</table>';
    }
    s += '<p style="color:#999;font-size:11px;margin-top:15px">WISHES Checklist</p></div>';

    // ─── 3. Post to Naver Works board ───
    const postRes = await fetch(
      `https://www.worksapis.com/v1.0/boards/${boardId}/posts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body: s }),
      }
    );

    const postData = await postRes.json().catch(() => ({}));

    /* R61 — forward 결과 업데이트 (fire-and-forget) */
    if (_submissionId !== null) {
      try {
        const sb2 = createServerClient();
        await sb2.from('checklist_submissions').update({
          forwarded_status: postRes.status === 201 ? 'success' : 'failed',
          forwarded_at: new Date().toISOString(),
          post_id: postData?.postId ? String(postData.postId) : null,
          forwarded_http_code: postRes.status,
        }).eq('id', _submissionId);
      } catch { /* noop */ }
    }

    if (postRes.status === 201) {
      return NextResponse.json(
        { success: true, message: 'OK', postId: postData.postId || null },
        { headers: corsHeaders }
      );
    } else {
      return NextResponse.json(
        { success: false, message: 'API error', httpCode: postRes.status, response: postData },
        { status: 502, headers: corsHeaders }
      );
    }
  } catch (err: unknown) {
    // L-sec104 (2026-04-22): prod 에서 err.message 로 JWT / Naver Works 내부 API
    //   응답 구조가 누출되지 않도록 generic 메시지로 치환. dev 에선 디버깅 유지.
    const isDev = process.env.NODE_ENV !== 'production';
    const message = isDev ? (err instanceof Error ? err.message : 'Unknown error') : 'Internal error';
    return NextResponse.json(
      { success: false, message },
      { status: 500, headers: corsHeaders }
    );
  }
}
