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
const ALLOWED_ORIGINS = [
  'https://wishes.co.kr',
  'https://www.wishes.co.kr',
  'http://localhost:3000',
  'http://localhost:3001',
];

const ALLOWED_PATHS = ['/checklist', '/checklist/']; // Referer pathname 화이트리스트

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
    // R15-㉠: Origin / Referer 검증 (외부 사이트 호출 차단)
    //   브라우저가 보내는 Origin 헤더는 위조 어려움. Referer 도 추가 보호.
    const reqOrigin = request.headers.get('origin') || '';
    const reqReferer = request.headers.get('referer') || '';
    const reqUA = request.headers.get('user-agent') || '';
    // OPTIONS preflight 만 Origin 없이도 허용 — 그 외엔 Origin 필수
    if (request.method !== 'OPTIONS') {
      const originOk = !reqOrigin || ALLOWED_ORIGINS.includes(reqOrigin);
      let refererOk = false;
      if (reqReferer) {
        try {
          const u = new URL(reqReferer);
          refererOk = ALLOWED_ORIGINS.includes(u.origin)
            && ALLOWED_PATHS.some(p => u.pathname === p || u.pathname.startsWith(p));
        } catch { refererOk = false; }
      }
      // Origin 위반 OR (Origin 없고 Referer 위반) → 차단
      if (!originOk || (!reqOrigin && !refererOk) || !reqUA) {
        return NextResponse.json(
          { success: false, message: '허용되지 않은 요청입니다.' },
          { status: 403, headers: corsHeaders }
        );
      }
    }

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

    // R15-㉢: honeypot field — bot 식별 (UI 상 숨겨진 칸)
    if (typeof input.website === 'string' && input.website.trim() !== '') {
      // bot 채워 보냄 — 정상 응답으로 위장하되 실제 전송 X
      return NextResponse.json(
        { success: true, message: 'OK', postId: null },
        { headers: corsHeaders }
      );
    }
    // R15-㉡: 입력 길이 cap (클라이언트 maxlength 우회 차단)
    const lenCap = (s: unknown, max: number): string => {
      if (typeof s !== 'string') return '';
      return s.slice(0, max);
    };
    input.cName = lenCap(input.cName, 50);
    input.cPhone = lenCap(input.cPhone, 14);
    if (Array.isArray(input.sections)) {
      input.sections = input.sections.slice(0, 30); // section 최대 30개
      for (const sec of input.sections) {
        if (sec && typeof sec === 'object') {
          if (typeof sec.title === 'string') sec.title = sec.title.slice(0, 100);
          if (Array.isArray(sec.rows)) {
            sec.rows = sec.rows.slice(0, 50);
            for (let i = 0; i < sec.rows.length; i++) {
              const row = sec.rows[i];
              if (Array.isArray(row)) {
                sec.rows[i] = row.map(c => typeof c === 'string' ? c.slice(0, 500) : c);
              }
            }
          }
        }
      }
    }
    // 추가 보안: phone 형식 010-XXXX-XXXX 만
    const phoneDigits = String(input.cPhone || '').replace(/\D/g, '');
    if (phoneDigits.length > 0 && !/^010\d{7,8}$/.test(phoneDigits)) {
      return NextResponse.json(
        { success: false, message: '010 으로 시작하는 휴대폰 번호만 가능합니다.' },
        { status: 400, headers: corsHeaders }
      );
    }

        // R15 (2026-05-18): Supabase 기반 영구 rate limit (in-memory 한계 해결).
    //   모든 Vercel 인스턴스가 1 DB 공유 → 정확 5회/1시간 cap.
    //   비용 0 — 기존 Supabase 무료 한도 안.
    try {
      const cPhone = String(input.cPhone || '').replace(/\D/g, '');
      if (cPhone.length >= 4) {
        const t4 = cPhone.slice(-4);
        // FNV-1a — phone 직접 노출 X (hash 만 저장)
        let _h = 0x811c9dc5;
        const _s = 'wsr15:' + t4;
        for (let i = 0; i < _s.length; i++) { _h ^= _s.charCodeAt(i); _h = (_h * 0x01000193) >>> 0; }
        const phoneHash = _h.toString(16);
        // IP hash 도 동일 방식
        let _ih = 0x811c9dc5;
        const _is = 'wsr15ip:' + _ip;
        for (let i = 0; i < _is.length; i++) { _ih ^= _is.charCodeAt(i); _ih = (_ih * 0x01000193) >>> 0; }
        const ipHash = _ih.toString(16);

        const supa = createServerClient();
        const { data, error } = await supa.rpc('check_and_log_submit', {
          p_phone_hash: phoneHash,
          p_ip_hash: ipHash,
        });
        if (!error && data && typeof data === 'object' && (data as { ok?: boolean }).ok === false) {
          return NextResponse.json(
            { success: false, message: '같은 번호로 1시간에 5번까지만 전송 가능합니다. 잠시 후 다시 시도해주세요.' },
            { status: 429, headers: { ...corsHeaders, 'Retry-After': '3600' } },
          );
        }
        // error 발생 시 fallback to in-memory (defense-in-depth)
        if (error) {
          const _phRl = checkRateLimit({ key: 'nw-fallback:' + phoneHash, limit: 5, windowMs: 60 * 60_000 });
          if (!_phRl.ok) {
            return NextResponse.json(
              { success: false, message: '같은 번호로 너무 많이 전송하셨어요.' },
              { status: 429, headers: { ...corsHeaders, 'Retry-After': String(_phRl.retryAfterSec) } },
            );
          }
        }
      }
    } catch { /* DB 호출 실패 시에도 다음 layer 로 진행 */ }

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
    // R26 ❹ — gold 톤 → 위시스 ios-blue 톤 (사장님 명령 '13년 브랜드 색 X')
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
