// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/short-url  — 단축 URL 생성
// GET  /api/short-url?code=xxx — 단축 URL 역조회(리다이렉트 라우트용)
//
// (v7 §5 URL 딥링크 — Phase 1 Backend)
//
// POST 요청
//   body: { target_url: string,
//           context?: 'map'|'search'|'admin'|'other',
//           scope?: 'all'|'mine',
//           ttl_days?: number  (default 90, max 365, 0=무기한) }
//   응답: { code, short_url, target_url, expires_at }
//
// 보안
//   target_url 은 pathname+search 만 허용 (scheme+host 금지) — 오픈 리다이렉트 차단.
//   최대 2KB. CSP 우회 방지.
//   Rate limit: 동일 IP 에서 1분에 30건 초과 시 429. (로드밸런서 단에서 추가 제어 권장)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateShortCode, isValidShortCode, buildShortUrl } from '@/lib/shortCode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TARGET_LEN = 2048;
const ALLOWED_CONTEXT = ['map', 'search', 'admin', 'other'] as const;
const ALLOWED_SCOPE = ['all', 'mine'] as const;

// ─────────────────────────────────────────────────────────
// 간단 인메모리 rate limit (싱글 서버용). 프로덕션은 KV/Redis 권장.
// 분당 30req/IP 초과 시 429.
// ─────────────────────────────────────────────────────────
const rateBucket = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const slot = rateBucket.get(ip);
  if (!slot || now > slot.resetAt) {
    rateBucket.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (slot.count >= max) return false;
  slot.count += 1;
  return true;
}

// ─────────────────────────────────────────────────────────
// 타깃 URL 검증 — pathname+search 만 허용 (오픈 리다이렉트 차단)
// ─────────────────────────────────────────────────────────
function validateTarget(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > MAX_TARGET_LEN) return null;
  if (!s.startsWith('/')) return null; // host/scheme 금지
  if (s.startsWith('//')) return null; // protocol-relative 금지
  if (s.includes('\\')) return null;   // 백슬래시 우회 방지
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(s)) return null; // 제어문자 금지
  return s;
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (!rateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ success: false, error: '잘못된 요청' }, { status: 400 });
    }

    const targetUrl = validateTarget(body.target_url);
    if (!targetUrl) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 target_url' },
        { status: 400 }
      );
    }

    const context =
      typeof body.context === 'string' && (ALLOWED_CONTEXT as readonly string[]).includes(body.context)
        ? (body.context as (typeof ALLOWED_CONTEXT)[number])
        : null;
    const scope =
      typeof body.scope === 'string' && (ALLOWED_SCOPE as readonly string[]).includes(body.scope)
        ? (body.scope as (typeof ALLOWED_SCOPE)[number])
        : null;

    const ttlRaw = Number(body.ttl_days);
    const ttlDays = Number.isFinite(ttlRaw) ? Math.min(365, Math.max(0, Math.floor(ttlRaw))) : 90;
    const expiresAt =
      ttlDays === 0
        ? null
        : new Date(Date.now() + ttlDays * 86_400_000).toISOString();

    const supabase = createServerClient();

    // 충돌 시 길이 확장 재시도 (6 → 8 → 10)
    let code: string | null = null;
    for (const len of [6, 8, 10]) {
      const candidate = generateShortCode(len);
      const { error: insertErr } = await supabase
        .from('short_urls')
        .insert({
          code: candidate,
          target_url: targetUrl,
          context,
          scope,
          expires_at: expiresAt,
        });

      if (!insertErr) {
        code = candidate;
        break;
      }
      // 23505 = unique violation (Postgres). 그 외는 에러 전파.
      const pgCode = (insertErr as { code?: string }).code;
      if (pgCode !== '23505') {
        console.error('[short-url] insert error:', insertErr);
        return NextResponse.json(
          { success: false, error: 'DB 저장 실패' },
          { status: 500 }
        );
      }
    }

    if (!code) {
      return NextResponse.json(
        { success: false, error: '코드 생성 충돌 지속 — 다시 시도' },
        { status: 503 }
      );
    }

    const host = request.headers.get('host') ?? 'wishes.co.kr';
    const shortUrl = buildShortUrl(host, code);

    return NextResponse.json({
      success: true,
      code,
      short_url: shortUrl,
      target_url: targetUrl,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error('[short-url] POST fatal:', err);
    return NextResponse.json(
      { success: false, error: '서버 오류' },
      { status: 500 }
    );
  }
}

// 역조회 (리다이렉트 라우트에서 사용)
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code || !isValidShortCode(code)) {
    return NextResponse.json({ success: false, error: '유효하지 않은 코드' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('short_urls')
    .select('code, target_url, expires_at, context, scope')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    console.error('[short-url] GET error:', error);
    return NextResponse.json({ success: false, error: 'DB 조회 실패' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ success: false, error: 'expired' }, { status: 410 });
  }

  // clicks 증분 (fire-and-forget, 실패해도 무시)
  void supabase.rpc('increment_short_url_clicks', { p_code: code }).then(() => undefined);

  return NextResponse.json({
    success: true,
    code: data.code,
    target_url: data.target_url,
    context: data.context,
    scope: data.scope,
  });
}
