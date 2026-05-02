import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { withTimeout } from '@/lib/withTimeout';

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];



/**
 * GET /api/auth/me
 * 현재 로그인한 사용자의 역할 및 승인 상태 확인
 * Header: Authorization: Bearer <access_token>
 */
export async function GET(request: NextRequest) {
  try {
    // L-sec81 (2026-04-22): 토큰 validation brute-force 방지.
    //   유효한 토큰인지 빠르게 스캔하어 leaked token 탐색 가능함.
    //   5분 60회/IP cap (정상 사용자는 세션당 몇 번).
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `auth-me:ip:${_ip}`, limit: 60, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, message: '요청이 너무 많습니다.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, message: '인증 토큰이 없습니다.' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Auth API로 사용자 확인 (3초 타임아웃)
    let user;
    try {
      const { data, error: userError } = await withTimeout(
        supabase.auth.getUser(token),
        3000,
      );
      if (userError || !data.user) {
        return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
      }
      user = data.user;
    } catch {
      return NextResponse.json({ success: false, message: '인증 서버 응답 시간 초과' }, { status: 504 });
    }

    const email = (user.email || '').toLowerCase();
    const isSuperAdmin = SUPERADMIN_EMAILS.includes(email);

    // superadmin은 DB 쿼리 없이 즉시 반환
    if (isSuperAdmin) {
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email,
          name: user.user_metadata?.name || 'WISHES',
          company: user.user_metadata?.company || '',
          phone: user.user_metadata?.phone || '',
          role: 'superadmin',
          status: 'approved',
          canAccessBroker: true,
        }
      });
    }

    // L-login-fix1 (사장님 명령 2026-05-02 — 직원 가입+승인 후 로그인 안 됨):
    //   기존: .or('id.eq.UUID,email.eq.X') 문자열 escaping 문제 + id 타입 mismatch 가능성.
    //   해결: email 우선 쿼리 (소문자 정규화), 실패 시 id 로 fallback.
    let adminUser: { role?: string; name?: string; company?: string; phone?: string; status?: string } | null = null;
    try {
      const emailLc = (email || '').toLowerCase();
      // 1) email 우선 (가장 안정적 — register 에서 항상 소문자 저장)
      const res = await withTimeout(
        supabase
          .from('admin_users')
          .select('role, name, company, phone, status')
          .eq('email', emailLc)
          .limit(1)
          .maybeSingle(),
        3000,
      ) as any;
      const data = res?.data;
      if (data) {
        adminUser = data;
      } else if (user?.id) {
        // 2) email mismatch (혹시) 시 id 로 fallback
        const res2 = await withTimeout(
          supabase
            .from('admin_users')
            .select('role, name, company, phone, status')
            .eq('id', user.id)
            .limit(1)
            .maybeSingle(),
          3000,
        ) as any;
        if (res2?.data) adminUser = res2.data;
      }
    } catch (e) {
      console.warn('[auth/me] admin_users lookup failed', e);
    }

    // L-sec60 (2026-04-22): CRITICAL user_metadata role/status fallback 제거.
    //   user_metadata 는 supabase.auth.updateUser({data:...}) 로 사용자 본인이
    //   자유롭게 수정 가능. role='admin' / status='approved' 를 스스로 설정한 뒤
    //   /api/auth/me 를 호출하면 canAccessBroker=true 가 되어 UI가 어드민 권한으로 열렸다.
    //   name/company/phone 는 식별용 표시값이라 user_metadata 폴백 가능, role/status 만 거부.
    const meta = (user.user_metadata || {}) as { name?: string; company?: string; phone?: string };

    const role = adminUser?.role || 'user';
    const rawStatus = adminUser?.status || 'pending';
    // L-login-fix1: status enum 양립 — 'approved' / 'active' / '승인' 모두 인정
    const APPROVED_STATUSES = ['approved', 'active', '승인', 'enabled'];
    const status = APPROVED_STATUSES.includes(rawStatus) ? 'approved' : rawStatus;

    const APPROVED_ROLES = [
      'owner', 'admin', 'broker', 'partner',  // 신
      'superadmin', 'agent',                   // legacy
    ];
    const canAccessBroker = status === 'approved' && APPROVED_ROLES.includes(role);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email,
        name: adminUser?.name || meta.name || '',
        company: adminUser?.company || meta.company || '',
        phone: adminUser?.phone || meta.phone || '',
        role,
        status,
        canAccessBroker,
      }
    });
  } catch (error) {
    console.error('me API error:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
