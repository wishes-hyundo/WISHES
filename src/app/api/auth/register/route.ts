import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { notifyAdminNewRegistration } from '@/lib/email';

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, phone, company, role, reason, autoApprove, requestedRole } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, message: 'íì í­ëª©ì ìë ¥í´ì£¼ì¸ì.' },
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
    if (authError && authError.message?.includes('already been registered')) {
      if (isSuperAdmin) {
        // Superadmin already exists - update password and sign in
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existingUser = users?.find((u: { email?: string }) => u.email === email.toLowerCase());

        if (existingUser) {
          // Update password and confirm email
          await supabase.auth.admin.updateUserById(existingUser.id, {
            password,
            email_confirm: true,
            user_metadata: { name, phone, company, role: 'superadmin' }
          });

          // Sign in with new password
          const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
            email: email.toLowerCase(),
            password,
          });

          if (signInErr) {
            return NextResponse.json(
              { success: false, message: 'ë¡ê·¸ì¸ ì²ë¦¬ ì¤ ì¤ë¥: ' + signInErr.message },
              { status: 400 }
            );
          }

          return NextResponse.json({
            success: true,
            token: signIn.session?.access_token || existingUser.id,
            user: {
              id: existingUser.id,
              name,
              email: email.toLowerCase(),
              role: 'superadmin',
              company,
            }
          });
        }
      }
      return NextResponse.json(
        { success: false, message: 'ì´ë¯¸ ë±ë¡ë ì´ë©ì¼ìëë¤.' },
        { status: 409 }
      );
    }

    if (authError) {
      return NextResponse.json(
        { success: false, message: authError.message || 'ê°ì ì¤ ì¤ë¥ê° ë°ìíìµëë¤.' },
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
        role: isSuperAdmin ? 'superadmin' : 'viewer',
        reason: reason || null,
        status: isSuperAdmin ? 'approved' : 'pending',
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('admin_users insert skipped:', e);
    }

    // Superadmin: sign in and return token
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

    // ê´ë¦¬ììê² ì ê°ì ìë¦¼ ì´ë©ì¼ ë°ì¡ (ë¹ëê¸°, ì¤í¨í´ë ê°ìì ì±ê³µ)
    notifyAdminNewRegistration({ name, email, phone, company, reason }).catch(console.error);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { success: false, message: 'ìë² ì¤ë¥ê° ë°ìíìµëë¤.' },
      { status: 500 }
    );
  }
}
