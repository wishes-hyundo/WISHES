import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: '이메일과 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Try to sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (authError) {
      // Check if user exists but is not confirmed (pending approval)
      if (authError.message.includes('Email not confirmed')) {
        return NextResponse.json(
          { success: false, message: '관리자 승인 대기 중입니다. 승인 후 이메일로 안내드리겠습니다.' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    // Check admin_users table for role info
    const isSuperAdmin = SUPERADMIN_EMAILS.includes(email.toLowerCase());
    let userRole = isSuperAdmin ? 'superadmin' : 'user';
    let userName = authData.user?.user_metadata?.name || '';
    let userCompany = authData.user?.user_metadata?.company || '';

    // Try to get role from admin_users table
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role, name, company, status')
      .eq('email', email.toLowerCase())
      .single();

    if (adminUser) {
      if (adminUser.status === 'pending') {
        return NextResponse.json(
          { success: false, message: '관리자 승인 대기 중입니다.' },
          { status: 403 }
        );
      }
      if (adminUser.status === 'rejected') {
        return NextResponse.json(
          { success: false, message: '가입이 거절되었습니다. 관리자에게 문의하세요.' },
          { status: 403 }
        );
      }
      userRole = adminUser.role || userRole;
      userName = adminUser.name || userName;
      userCompany = adminUser.company || userCompany;
    }

    return NextResponse.json({
      success: true,
      token: authData.session?.access_token || authData.user.id,
      user: {
        id: authData.user.id,
        name: userName,
        email: email.toLowerCase(),
        role: userRole,
        company: userCompany,
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
