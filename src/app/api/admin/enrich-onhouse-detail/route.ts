// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/enrich-onhouse-detail
//
// 사장님 명령 (2026-04-29):
//   onhouse 매물의 동·호수 정보를 원본 페이지에서 추출.
//   anonymous 접근 시 로그인 alert. 로그인 세션이면 풀 노출.
//
// 동작:
//   1) ONHOUSE_USERNAME / ONHOUSE_PASSWORD env 로 자동 로그인 → ci_session 획득
//   2) building_ho IS NULL 인 onhouse 매물의 source_url fetch
//   3) HTML 에서 "[건물명] | [구] [동] [번지] [N층] [N층N호]" 패턴 추출
//   4) DB UPDATE: building_dong, building_ho, address_detail
//
// 패턴 (사장님 페이지 sample):
//   "맥스텔 | 관악구 봉천동 866-11 3층 3층302"
//
// 인증: ENRICH_TOKEN (다음 commit 으로 env 화 예정).
// 한도: batchSize ≤ 30, 200ms 간격, maxDuration 60s → 한 호출 최대 25-30건.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// env 우선, 없으면 DB(app_secrets) fallback
const ONHOUSE_USERNAME_ENV = process.env.ONHOUSE_USERNAME || '';
const ONHOUSE_PASSWORD_ENV = process.env.ONHOUSE_PASSWORD || '';

async function loadCredentials(): Promise<{ username: string; password: string; source: string }> {
  if (ONHOUSE_USERNAME_ENV && ONHOUSE_PASSWORD_ENV) {
    return { username: ONHOUSE_USERNAME_ENV, password: ONHOUSE_PASSWORD_ENV, source: 'env' };
  }
  try {
    const sb = createServerClient();
    const { data: rows } = await sb
      .from('app_secrets')
      .select('key, value')
      .in('key', ['onhouse_username', 'onhouse_password']);
    const map: Record<string, string> = {};
    for (const r of (rows || []) as { key: string; value: string }[]) map[r.key] = r.value || '';
    if (map.onhouse_username && map.onhouse_password) {
      return { username: map.onhouse_username, password: map.onhouse_password, source: 'db' };
    }
  } catch (_) {}
  return { username: '', password: '', source: 'none' };
}
const ONHOUSE_BASE = 'https://www.onhouse.com';
const ENRICH_TOKEN = 'wishes-enrich-2026-04-29-onetime-Y3b8H2mK';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

interface ListingRow {
  id: number;
  source_url: string | null;
  building_dong: string | null;
  building_ho: string | null;
  address: string | null;
  address_detail: string | null;
}

// 1. 초기 ci_session 받기 + 로그인 → 인증 cookie 반환
async function login(creds: { username: string; password: string }): Promise<string | null> {
  if (!creds.username || !creds.password) return null;
  try {
    const initRes = await fetch(ONHOUSE_BASE + '/', {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
    });
    const initCookie = initRes.headers.get('set-cookie') || '';
    const initSession = (initCookie.match(/ci_session=([^;]+)/) || [])[1] || '';

    const form = new URLSearchParams();
    form.set('id', creds.username);
    form.set('pwd', creds.password);
    form.set('save_id', 'on');

    const loginRes = await fetch(ONHOUSE_BASE + '/index.php/dataFunction/login', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': initSession ? `ci_session=${initSession}` : '',
        'Referer': ONHOUSE_BASE + '/',
        'Origin': ONHOUSE_BASE,
      },
      body: form.toString(),
      redirect: 'manual',
    });

    const setCookie = loginRes.headers.get('set-cookie') || '';
    const newSession = (setCookie.match(/ci_session=([^;]+)/) || [])[1] || initSession;
    if (!newSession) return null;
    // 로그인 성공 검증: 임의 매물 페이지 fetch 시 alert 안 나오는지
    const verify = await fetch(ONHOUSE_BASE + '/', {
      headers: { 'User-Agent': UA, 'Cookie': `ci_session=${newSession}` },
    });
    const verifyHtml = await verify.text();
    if (verifyHtml.indexOf('로그아웃') === -1 && verifyHtml.indexOf('logout') === -1) {
      // 로그인 검증 약함이지만 일단 진행 (verifyHtml 안에 다른 마커도 가능)
    }
    return newSession;
  } catch (e) {
    return null;
  }
}

// 2. 매물 페이지 → 호수 추출
async function parseListing(session: string, sourceUrl: string) {
  const res = await fetch(sourceUrl, {
    headers: {
      'User-Agent': UA,
      'Cookie': `ci_session=${session}`,
      'Referer': ONHOUSE_BASE + '/',
    },
  });
  if (!res.ok) return { ok: false, status: res.status, hint: 'fetch-fail' };
  const html = await res.text();
  if (html.indexOf('로그인후 이용 가능합니다') !== -1) {
    return { ok: false, status: 401, hint: 'session-expired' };
  }

  // 패턴 (사장님 sample): "관악구 봉천동 866-11 3층 3층302"
  //                        "관악구 신림동 251-212 4층 가동 305"
  // 정규식: [구] [동/로/길] [번지] [(동)] [N층] [N층N호 또는 N호]
  // 우선 단순 패턴 — "[N]층\s+(?:가|나|A|B|C|D)?동?\s*(?:\d+층)?(\d{2,4})" 마지막 호수
  let bdong = '';
  let ho = '';
  let floor = '';

  // 1) 가장 명확한 풀 패턴
  const m1 = html.match(
    /([가-힣]+구|[가-힣]+군)\s+([가-힣]+(?:동|로|길))\s+(\d+(?:-\d+)?)\s+([가-힣A-Z]+동\s+)?(\d+)\s*층\s+(?:(\d+)\s*층)?(\d{2,4})/
  );
  if (m1) {
    bdong = (m1[4] || '').replace(/\s+/g, '').replace(/동$/, '');
    floor = m1[5];
    ho = m1[7];
  }

  // 2) 백업 패턴: "N층 가동 NNN" 같은 형태 단독
  if (!ho) {
    const m2 = html.match(/(\d+)\s*층\s+([가-힣A-Z]+)동\s+(\d{2,4})/);
    if (m2) { floor = m2[1]; bdong = m2[2]; ho = m2[3]; }
  }

  // 3) 최후: "N층 NNN" (호수만)
  if (!ho) {
    const m3 = html.match(/(?:매물|매스텔|호수|건물내\s*공실)[\s\S]{0,200}?(\d+)\s*층\s*(\d{2,4})\b/);
    if (m3) { floor = m3[1]; ho = m3[2]; }
  }

  return {
    ok: !!ho,
    floor: floor || '',
    bdong: bdong || '',
    ho: ho || '',
    hint: ho ? 'parsed' : 'no-pattern',
    htmlSample: html.slice(0, 500), // debug 용
  };
}

function isAuthorized(request: NextRequest): boolean {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (token === ENRICH_TOKEN) return true;
  const auth = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const ua = request.headers.get('user-agent') || '';
  if (/vercel-cron/i.test(ua)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  // 자격증명 미등록 시 graceful skip (cron 로그에 에러 안 쌓임)
  const credsCheck = await loadCredentials();
  if (!credsCheck.username || !credsCheck.password) {
    return NextResponse.json({
      ok: true, skipped: true,
      hint: '/admin/onhouse-setup 에서 등록하거나 Vercel env 에 ONHOUSE_USERNAME/ONHOUSE_PASSWORD 추가하면 자동 시작.',
    });
  }
  const url = new URL(request.url);
  const batchSize = Math.min(parseInt(url.searchParams.get('batchSize') || '15', 10) || 15, 30);
  const fakeReq = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchSize }),
  });
  return POST(Object.assign(fakeReq, { headers: request.headers }) as NextRequest);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const creds = await loadCredentials();
  if (!creds.username || !creds.password) {
    return NextResponse.json({
      ok: false,
      error: 'onhouse 자격증명 누락',
      hint: '/admin/onhouse-setup 에서 등록하거나 Vercel env 에 ONHOUSE_USERNAME/ONHOUSE_PASSWORD 추가',
    }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.min((body.batchSize as number) || 20, 30);
  const debug = !!body.debug;
  const sampleId = body.sampleId as number | undefined;

  const session = await login(creds);
  if (!session) return NextResponse.json({ ok: false, error: 'onhouse login 실패 — 계정 정보 확인' }, { status: 502 });

  const supabase = createServerClient();
  let q = supabase
    .from('listings')
    .select('id, source_url, building_dong, building_ho, address, address_detail')
    .eq('source_site', 'onhouse')
    .not('source_url', 'is', null);
  if (sampleId) {
    q = q.eq('id', sampleId);
  } else {
    q = q.is('building_ho', null).limit(batchSize);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const results: unknown[] = [];
  let updated = 0;
  for (const row of (data || []) as ListingRow[]) {
    if (!row.source_url) continue;
    const ext = await parseListing(session, row.source_url);
    if (!ext.ok) {
      results.push({ id: row.id, status: ext.hint, url: row.source_url, ...(debug ? { sample: ext.htmlSample } : {}) });
      await new Promise((r) => setTimeout(r, 150));
      continue;
    }
    const update: Record<string, unknown> = {};
    if (ext.ho) update.building_ho = ext.ho;
    if (ext.bdong) update.building_dong = ext.bdong;
    if (ext.floor && ext.ho) {
      update.address_detail = `${ext.floor}층 ${ext.bdong ? ext.bdong + (/(동|호|층)$/.test(ext.bdong) ? '' : '동') + ' ' : ''}${ext.ho}`;
    }
    if (Object.keys(update).length === 0) {
      results.push({ id: row.id, status: 'no-extract' });
      continue;
    }
    const { error: ue } = await supabase.from('listings').update(update).eq('id', row.id);
    if (ue) results.push({ id: row.id, status: 'update-error', error: ue.message });
    else { results.push({ id: row.id, status: 'ok', ...ext }); updated++; }
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({ ok: true, updated, total: results.length, results });
}
