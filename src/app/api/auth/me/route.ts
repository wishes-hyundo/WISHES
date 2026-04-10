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

    // admin_users 테이블에서 역할/상태 조회
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role, name, company, phone, status')
      .eq('email', email)
      .single();

    const role = isSuperAdmin ? 'superadmin' : (adminUser?.role || 'pending');
    const status = isSuperAdmin ? 'approved' : (adminUser?.status || 'pending');

    // 브로커 포털 접근 권한: superadmin, broker, viewer 중 approved
    const canAccessBroker = status === 'approved' && ['superadmin', 'broker', 'viewer', 'admin'].includes(role);

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
