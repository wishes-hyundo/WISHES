import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
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

    // Bridge tokens are auto-verified
    if (token.startsWith('admin_bridge_')) {
      return NextResponse.json({
        success: true,
        valid: true,
        user: { role: 'admin', status: 'approved', bridge: true }
      });
    }

    // Verify JWT token with Supabase
    const supabase = createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json(
        { success: false, valid: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // admin_users 테이블에서 status 확인 (더 정확)
    let userStatus = user.user_metadata?.status || 'pending';
    let userRole = user.user_metadata?.role || 'user';

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
      // admin_users 테이블 조회 실패 시 user_metadata 사용
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
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, valid: false, error: 'No token provided' },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);

  // Bridge tokens are auto-verified
  if (token.startsWith('admin_bridge_')) {
    return NextResponse.json({
      success: true,
      valid: true,
      user: { role: 'admin', status: 'approved', bridge: true }
    });
  }

  try {
    const supabase = createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json(
        { success: false, valid: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // admin_users 테이블에서 status 확인 (더 정확)
    let userStatus = user.user_metadata?.status || 'pending';
    let userRole = user.user_metadata?.role || 'user';

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
      // admin_users 테이블 조회 실패 시 user_metadata 사용
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
