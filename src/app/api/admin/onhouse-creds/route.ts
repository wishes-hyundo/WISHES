// /api/admin/onhouse-creds — onhouse 자격증명 저장/조회.
// 사장님 명령 (2026-04-29): "아이디랑 암호 적는 창 띄워놔줘"
//
// GET  → { hasUsername: bool, hasPassword: bool, updated_at, lastEnrichTest? }
// POST → { username, password } 받아 app_secrets 에 저장 + 즉시 onhouse 로그인 테스트

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ONHOUSE_BASE = 'https://www.onhouse.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function testLogin(username: string, password: string): Promise<{ ok: boolean; hint: string }> {
  try {
    const initRes = await fetch(ONHOUSE_BASE + '/', {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
    });
    const initCookie = initRes.headers.get('set-cookie') || '';
    const initSession = (initCookie.match(/ci_session=([^;]+)/) || [])[1] || '';

    const form = new URLSearchParams();
    form.set('id', username);
    form.set('pwd', password);
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
    if (!newSession) return { ok: false, hint: 'session 없음' };

    // 매물 페이지 fetch — 로그인 alert 안 나오면 성공
    const verify = await fetch(ONHOUSE_BASE + '/index/rent_view/3312910', {
      headers: { 'User-Agent': UA, 'Cookie': `ci_session=${newSession}` },
    });
    const html = await verify.text();
    if (html.indexOf('로그인후 이용 가능합니다') !== -1) {
      return { ok: false, hint: 'ID/PW 틀림 또는 로그인 거부' };
    }
    if (html.length < 1000) {
      return { ok: false, hint: '응답 너무 짧음 — 차단 추정' };
    }
    return { ok: true, hint: '로그인 성공 — 매물 페이지 접근 OK' };
  } catch (e) {
    return { ok: false, hint: 'fetch error: ' + ((e as Error).message || '') };
  }
}

async function readSecret(supabase: ReturnType<typeof createServerClient>, key: string): Promise<string> {
  const { data } = await supabase.from('app_secrets').select('value').eq('key', key).maybeSingle();
  return (data?.value as string) || '';
}

async function writeSecret(supabase: ReturnType<typeof createServerClient>, key: string, value: string, description: string, updatedBy: string) {
  return supabase.from('app_secrets').upsert({ key, value, description, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export async function GET(request: NextRequest) {
  if (!(await verifyAuth(request))) {
    return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 });
  }
  const supabase = createServerClient();
  const u = await readSecret(supabase, 'onhouse_username');
  const p = await readSecret(supabase, 'onhouse_password');
  // env 값도 표시 (Vercel UI 등록한 경우)
  const envU = process.env.ONHOUSE_USERNAME || '';
  const envP = process.env.ONHOUSE_PASSWORD || '';

  const { data: meta } = await supabase
    .from('app_secrets')
    .select('key, updated_at, updated_by')
    .in('key', ['onhouse_username', 'onhouse_password']);

  return NextResponse.json({
    ok: true,
    db: { hasUsername: !!u, hasPassword: !!p, masked: u ? u.slice(0, 2) + '***' : '' },
    env: { hasUsername: !!envU, hasPassword: !!envP, masked: envU ? envU.slice(0, 2) + '***' : '' },
    meta: meta || [],
    activeSource: u && p ? 'db' : (envU && envP ? 'env' : 'none'),
  });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAuth(request))) {
    return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '').trim();
  const test = body.test !== false; // 기본 true — 저장 전 로그인 테스트

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: 'username / password 모두 필요' }, { status: 400 });
  }

  let testResult = { ok: true, hint: 'skipped' };
  if (test) {
    testResult = await testLogin(username, password);
    if (!testResult.ok) {
      return NextResponse.json({ ok: false, error: '로그인 실패: ' + testResult.hint, test: testResult }, { status: 400 });
    }
  }

  const supabase = createServerClient();
  const updatedBy = request.headers.get('x-admin-user') || 'admin';
  const r1 = await writeSecret(supabase, 'onhouse_username', username, 'onhouse 로그인 ID', updatedBy);
  if (r1.error) return NextResponse.json({ ok: false, error: r1.error.message }, { status: 500 });
  const r2 = await writeSecret(supabase, 'onhouse_password', password, 'onhouse 비밀번호', updatedBy);
  if (r2.error) return NextResponse.json({ ok: false, error: r2.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: true, test: testResult });
}

export async function DELETE(request: NextRequest) {
  if (!(await verifyAuth(request))) {
    return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 });
  }
  const supabase = createServerClient();
  await supabase.from('app_secrets').delete().in('key', ['onhouse_username', 'onhouse_password']);
  return NextResponse.json({ ok: true, deleted: true });
}
