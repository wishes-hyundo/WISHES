import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

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
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const email = (user.email || '').toLowerCase();
    const isSuperAdmin = SUPERADMIN_EMAILS.includes(email);

    // admin_users 테이블에서 역할/상태 조회 (id 또는 email 로 매칭)
    let adminUser: { role?: string; name?: string; company?: string; phone?: string; status?: string } | null = null;
    try {
      const byId = await supabase
        .from('admin_users')
        .select('role, name, company, phone, status')
        .eq('id', user.id)
        .maybeSingle();
      if (byId.data) adminUser = byId.data;
    } catch {}
    if (!adminUser) {
      try {
        const byEmail = await supabase
          .from('admin_users')
          .select('role, name, company, phone, status')
          .eq('email', email)
          .maybeSingle();
        if (byEmail.data) adminUser = byEmail.data;
      } catch {}
    }

    // user_metadata 도 참고 (/api/admin/users PUT 이 승인 시 user_metadata 를 함께 갱신함)
    const meta = (user.user_metadata || {}) as { status?: string; role?: string; name?: string; company?: string; phone?: string };

    // 상태는 admin_users → user_metadata 순으로 우선, 둘 중 하나라도 approved 면 통과
    const role = isSuperAdmin
      ? 'superadmin'
      : (adminUser?.role || meta.role || 'pending');
    const status = isSuperAdmin
      ? 'approved'
      : (adminUser?.status === 'approved' || meta.status === 'approved'
          ? 'approved'
          : (adminUser?.status || meta.status || 'pending'));

    // 브로커 포털 접근 권한: 승인된 모든 역할 허용
    // ※ 회원가입 시 'viewer', 승인 시 'agent' 가 기본이므로 모두 포함
    const APPROVED_ROLES = ['superadmin', 'admin', 'agent', 'broker', 'viewer', 'user'];
    const canAccessBroker = status === 'approved' && APPROVED_ROLES.includes(role);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email,
        name: adminUser?.name || user.user_metadata?.name || '',
        company: adminUser?.company || user.user_metadata?.company || '',
        phone: adminUser?.phone || user.user_metadata?.phone || '',
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
