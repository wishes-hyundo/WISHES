import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

// 타임아웃 헬퍼
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * GET /api/auth/me
 * 현재 로그인한 사용자의 역할 및 승인 상태 확인
 * Header: Authorization: Bearer <access_token>
 */
export async function GET(request: NextRequest) {
  try {
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

    // admin_users 테이블에서 역할/상태 조회 (3초 타임아웃 — 실패해도 user_metadata로 진행)
    let adminUser: { role?: string; name?: string; company?: string; phone?: string; status?: string } | null = null;
    try {
      const res = await withTimeout(
        supabase
          .from('admin_users')
          .select('role, name, company, phone, status')
          .or(`id.eq.${user.id},email.eq.${email}`)
          .limit(1)
          .maybeSingle(),
        3000,
      ) as any;
      const data = res?.data;
      if (data) adminUser = data;
    } catch {
      // DB 타임아웃 → user_metadata만으로 진행
    }

    // user_metadata 도 참고
    const meta = (user.user_metadata || {}) as { status?: string; role?: string; name?: string; company?: string; phone?: string };

    const role = adminUser?.role || meta.role || 'pending';
    const status = adminUser?.status === 'approved' || meta.status === 'approved'
      ? 'approved'
      : (adminUser?.status || meta.status || 'pending');

    const APPROVED_ROLES = ['superadmin', 'admin', 'agent', 'broker', 'viewer', 'user'];
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
