import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { timingSafeEqualStr } from '@/lib/timingSafe';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// L-sec1 (2026-04-22): admin_bridge_ prefix 만 보고 admin 통과시키던 완전한
//   인증 우회 수정. 이제 prefix 를 벗긴 뒤 inner 토큰이 (a) env CRAWLER_BRIDGE
//   과 정확히 일치하거나 (b) 유효한 Supabase JWT 이어야 한다.
function getCrawlerBridgeToken(): string | null {
  const env = process.env.WISHES_CRAWLER_BRIDGE_TOKEN;
  return env && env.length >= 16 ? env : null;
}
function stripBridgePrefix(token: string): { stripped: string; wasBridge: boolean } {
  if (token.startsWith('admin_bridge_')) {
    return { stripped: token.slice('admin_bridge_'.length), wasBridge: true };
  }
  return { stripped: token, wasBridge: false };
}

export async function POST(request: NextRequest) {
  try {
    // L-sec62 (2026-04-22): verify 엔드포인트 애버용즈 방어 — IP당 1분 60회.
    const ipP = getClientIp(request);
    const rlP = checkRateLimit({ key: `verify:ip:${ipP}`, limit: 60, windowMs: 60_000 });
    if (!rlP.ok) {
      return NextResponse.json(
        { success: false, valid: false, error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rlP.retryAfterSec) } }
      );
    }
    const authHeader = request.headers.get('authorization');
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // Try to get token from body
      try {
        const body = await request.json();
        token = body.token || '';
      } catch {
        // No body
      }
    }

    if (!token) {
      return NextResponse.json(
        { success: false, valid: false, error: 'No token provided' },
        { status: 401 }
      );
    }

    // L-sec1: admin_bridge_ prefix 를 벗기고 inner 토큰을 실제 검증
    const { stripped: inner, wasBridge } = stripBridgePrefix(token);

    // env 완전 일치 → 크롤러 브리지 토큰 (운영 경유)
    const crawlerBridge = getCrawlerBridgeToken();
    if (wasBridge && crawlerBridge && timingSafeEqualStr(inner, crawlerBridge)) {
      return NextResponse.json({
        success: true,
        valid: true,
        user: { role: 'admin', status: 'approved', bridge: true }
      });
    }

    // Verify JWT token with Supabase (bridge prefix 가 있었다면 벗긴 inner 로)
    const supabase = createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser(inner);

    if (error || !user) {
      return NextResponse.json(
        { success: false, valid: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // L-sec59 (2026-04-22): CRITICAL user_metadata fallback 제거.
    //   user_metadata 는 supabase.auth.updateUser({data:...}) 로 사용자 본인이
    //   자유롭게 수정 가능하므로 role/status 를 사용자가 스스로
    //   'admin'/'approved' 으로 설정한 뒤 호출하면 임의로 권한 상승 가능.
    //   admin_users 테이블 row 만 신뢰, 없으면 user/pending 기본값 유지.
    let userStatus = 'pending';
    let userRole = 'user';

    try {
      const { data: adminRow } = await supabase
        .from('admin_users')
        .select('status, role')
        .eq('id', user.id)
        .single();

      if (adminRow) {
        userStatus = adminRow.status || userStatus;
        userRole = adminRow.role || userRole;
      }
    } catch (e) {
      // admin_users 조회 실패 시 기본값(user/pending) 유지 — 권한 상승 없음
    }

    return NextResponse.json({
      success: true,
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        role: userRole,
        status: userStatus,
        approved: userStatus === 'approved'
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { success: false, valid: false, error: 'Verification failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // L-sec62 (2026-04-22): verify GET 엔드포인트 애버용즈 방어 — IP당 1분 60회.
  const ipG = getClientIp(request);
  const rlG = checkRateLimit({ key: `verify:ip:${ipG}`, limit: 60, windowMs: 60_000 });
  if (!rlG.ok) {
    return NextResponse.json(
      { success: false, valid: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rlG.retryAfterSec) } }
    );
  }
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, valid: false, error: 'No token provided' },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);

  // L-sec1: admin_bridge_ prefix 를 벗기고 inner 토큰 검증
  const { stripped: inner, wasBridge } = stripBridgePrefix(token);
  const crawlerBridge = getCrawlerBridgeToken();
  if (wasBridge && crawlerBridge && timingSafeEqualStr(inner, crawlerBridge)) {
    return NextResponse.json({
      success: true,
      valid: true,
      user: { role: 'admin', status: 'approved', bridge: true }
    });
  }

  try {
    const supabase = createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser(inner);

    if (error || !user) {
      return NextResponse.json(
        { success: false, valid: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // L-sec59 (2026-04-22): CRITICAL user_metadata fallback 제거.
    //   user_metadata 는 supabase.auth.updateUser({data:...}) 로 사용자 본인이
    //   자유롭게 수정 가능하므로 role/status 를 사용자가 스스로
    //   'admin'/'approved' 으로 설정한 뒤 호출하면 임의로 권한 상승 가능.
    //   admin_users 테이블 row 만 신뢰, 없으면 user/pending 기본값 유지.
    let userStatus = 'pending';
    let userRole = 'user';

    try {
      const { data: adminRow } = await supabase
        .from('admin_users')
        .select('status, role')
        .eq('id', user.id)
        .single();

      if (adminRow) {
        userStatus = adminRow.status || userStatus;
        userRole = adminRow.role || userRole;
      }
    } catch (e) {
      // admin_users 조회 실패 시 기본값(user/pending) 유지 — 권한 상승 없음
    }

    return NextResponse.json({
      success: true,
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        role: userRole,
        status: userStatus,
        approved: userStatus === 'approved'
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { success: false, valid: false, error: 'Verification failed' },
      { status: 500 }
    );
  }
}
