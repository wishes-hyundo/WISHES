// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /s/[code]  — 단축 URL 리다이렉트
// (v7 §5 URL 딥링크 — Phase 1 Backend)
//
// 흐름
//   1. code 포맷 검증 (invalid → 404)
//   2. Supabase 조회 (code, target_url, expires_at, scope)
//   3. 만료 확인 → 410 페이지
//   4. clicks 증분 RPC (fire-and-forget)
//   5. target_url 로 303 See Other 리다이렉트 (POST-redirect-GET 안전)
//
// 비고
//   target_url 은 DB 에 항상 `/` 로 시작하므로 absolute path 로 그대로 사용.
//   ✨ 추가로 middleware 에서 wishes.me 호스트 최상위 경로(`/abc123`)를 이
//   라우트로 rewrite → 도메인을 아무리 짧게 잡아도 코드 테이블 단일 진실원.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { isValidShortCode } from '@/lib/shortCode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params;

  if (!isValidShortCode(code)) {
    return new NextResponse('Invalid short code', { status: 404 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('short_urls')
    .select('code, target_url, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    console.error('[/s/[code]] supabase error:', error);
    return new NextResponse('Temporarily unavailable', { status: 503 });
  }

  if (!data) {
    // 404 HTML 페이지로 보내고 싶으면 redirect to /not-found 대신 여기서 랜더링
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>단축 URL을 찾을 수 없습니다 — WISHES</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#fafaf7;color:#1c3a25;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{max-width:480px;text-align:center;background:white;padding:32px 24px;border-radius:16px;box-shadow:0 8px 24px -12px rgba(0,0,0,.15)}h1{font-size:20px;margin:0 0 8px}p{font-size:14px;color:#4b5563;margin:0 0 24px}a{display:inline-block;background:#047857;color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px}a:hover{background:#065f46}</style>
<div class="card"><h1>404 — 존재하지 않는 단축 URL</h1><p>요청하신 단축 URL이 만료되었거나 존재하지 않습니다.</p><a href="/map">WISHES 지도로 이동</a></div>`,
      { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>단축 URL 만료됨 — WISHES</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#fafaf7;color:#1c3a25;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{max-width:480px;text-align:center;background:white;padding:32px 24px;border-radius:16px;box-shadow:0 8px 24px -12px rgba(0,0,0,.15)}h1{font-size:20px;margin:0 0 8px}p{font-size:14px;color:#4b5563;margin:0 0 24px}a{display:inline-block;background:#047857;color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px}a:hover{background:#065f46}</style>
<div class="card"><h1>410 — 만료된 단축 URL</h1><p>이 단축 URL은 만료되었습니다. 새 조건으로 다시 공유해주세요.</p><a href="/map">WISHES 지도로 이동</a></div>`,
      { status: 410, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }

  // 비동기 clicks 증분 (누락 허용, await 안 함)
  void supabase.rpc('increment_short_url_clicks', { p_code: code });

  // 303 See Other — POST 기반 공유 시 GET 으로 변환 보장
  const target = data.target_url as string;
  return NextResponse.redirect(new URL(target, request.url), 303);
}
