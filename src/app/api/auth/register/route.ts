import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Superadmin emails that get auto-approved
const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, phone, company, role, reason, autoApprove, requestedRole } = body;

    // Basic validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, message: '필수 항목을 입력해주세요.' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const isSuperAdmin = SUPERADMIN_EMAILS.includes(email.toLowerCase());

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: '이미 등록된 이메일입니다.' },
        { status: 409 }
      );
    }

    // Hash password using Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: isSuperAdmin, // Auto-confirm superadmin
      user_metadata: {
        name,
        phone,
        company,
        role: requestedRole || role,
      }
    });

    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { success: false, message: authError.message || '가입 중 오류가 발생했습니다.' },
        { status: 400 }
      );
    }

    // Insert into admin_users table
    const { error: insertError } = await supabase
      .from('admin_users')
      .insert({
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

    if (insertError) {
      console.error('Insert error:', insertError);
      // If admin_users table doesn't exist, still return success for superadmin
      if (isSuperAdmin) {
        // Sign in to get session token
        const { data: signInData, error: signInError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: email.toLowerCase(),
        });

        return NextResponse.json({
          success: true,
          token: authData.user.id,
          user: {
            id: authData.user.id,
            name,
            email: email.toLowerCase(),
            role: 'superadmin',
            company,
          }
        });
      }
      // For regular users, still return success (pending)
      return NextResponse.json({ success: true });
    }

    // If superadmin, return token for auto-login
    if (isSuperAdmin) {
      return NextResponse.json({
        success: true,
        token: authData.user.id,
        user: {
          id: authData.user.id,
          name,
          email: email.toLowerCase(),
          role: 'superadmin',
          company,
        }
      });
    }

    // Regular user - return success without token (pending approval)
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
