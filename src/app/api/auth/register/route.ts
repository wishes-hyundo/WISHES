import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, phone, company, role, reason, autoApprove, requestedRole } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, message: '필수 항목을 입력해주세요.' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const isSuperAdmin = SUPERADMIN_EMAILS.includes(email.toLowerCase());

    // Try to create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: isSuperAdmin,
      user_metadata: { name, phone, company, role: requestedRole || role }
    });

    // Handle user already exists
    if (authError) {
      if (authError.message?.includes('already been registered')) {
        if (isSuperAdmin) {
          // Superadmin already exists - sign them in
          const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
            email: email.toLowerCase(),
            password,
          });
          if (signInErr) {
            return NextResponse.json(
              { success: false, message: '이미 등록된 이메일입니다. 비밀번호를 확인해주세요.' },
              { status: 400 }
            );
          }
          return NextResponse.json({
            success: true,
            token: signIn.session?.access_token || signIn.user?.id,
            user: {
              id: signIn.user?.id,
              name: signIn.user?.user_metadata?.name || name,
              email: email.toLowerCase(),
              role: 'superadmin',
              company: signIn.user?.user_metadata?.company || company,
            }
          });
        }
        return NextResponse.json(
          { success: false, message: '이미 등록된 이메일입니다.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, message: authError.message || '가입 중 오류가 발생했습니다.' },
        { status: 400 }
      );
    }

    // Try insert into admin_users (gracefully handle if table doesn't exist)
    try {
      await supabase.from('admin_users').insert({
        id: authData.user.id,
        email: email.toLowerCase(),
        name,
        phone: phone || null,
        company: company || null,
        role: isSuperAdmin ? 'superadmin' : (role || 'user'),
        reason: reason || null,
        status: isSuperAdmin ? 'approved' : 'pending',
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('admin_users insert skipped:', e);
    }

    // Superadmin: return token for auto-login
    if (isSuperAdmin) {
      const { data: signIn } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
      });
      return NextResponse.json({
        success: true,
        token: signIn?.session?.access_token || authData.user.id,
        user: {
          id: authData.user.id,
          name,
          email: email.toLowerCase(),
          role: 'superadmin',
          company,
        }
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
