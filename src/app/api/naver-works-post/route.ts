import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

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
    let s = '<div style="font-family:sans-serif;max-width:700px;margin:0 auto">';
    s += `<h2 style="color:#b8860b;border-bottom:2px solid #b8860b;padding-bottom:8px">${title}</h2>`;

    for (const sec of rawSections) {
      if (!sec || typeof sec !== 'object') continue;
      s += '<table style="width:100%;border-collapse:collapse;margin:10px 0">';
      s += `<tr style="background:#f5f0e1"><td colspan="2" style="padding:8px;font-weight:bold;color:#8b6914;font-size:15px">${esc(capStr(sec.title))}</td></tr>`;
      const rows = Array.isArray(sec.rows) ? sec.rows.slice(0, MAX_ROWS_PER_SECTION) : [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const lbl = esc(capStr(row[0]));
        const val = esc(capStr(row[1]));
        if (!val) continue;
        s += `<tr><td style="padding:6px 10px;border:1px solid #ddd;width:30%;background:#faf7f0;font-weight:bold">${lbl}</td><td style="padding:6px 10px;border:1px solid #ddd">${val}</td></tr>`;
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message },
      { status: 500, headers: corsHeaders }
    );
  }
}
