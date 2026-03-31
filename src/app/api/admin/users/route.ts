import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

// GET /api/admin/users - 사용자 목록 조회
export async function GET(request: NextRequest) {
  try {
    // Verify admin auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get all users from Supabase Auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    // Get admin_users data
    let adminUsersData: any[] = [];
    try {
      const { data } = await supabase.from('admin_users').select('*');
      adminUsersData = data || [];
    } catch (e) {
      // Table might not exist
    }

    // Merge auth users with admin_users data
    const mergedUsers = (users || []).map(user => {
      const adminData = adminUsersData.find(au => au.id === user.id || au.email === user.email);
      const meta = user.user_metadata || {};
      
      return {
        id: user.id,
        email: user.email,
        name: adminData?.name || meta.name || '',
        phone: adminData?.phone || meta.phone || '',
        company: adminData?.company || meta.company || '',
        role: adminData?.role || meta.role || 'user',
        reason: adminData?.reason || '',
        status: adminData?.status || (SUPERADMIN_EMAILS.includes(user.email?.toLowerCase() || '') ? 'approved' : 'pending'),
        created_at: adminData?.created_at || user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      };
    });

    // Filter by status if requested
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    
    const filtered = statusFilter 
      ? mergedUsers.filter(u => u.status === statusFilter)
      : mergedUsers;

    return NextResponse.json({ 
      success: true, 
      users: filtered,
      total: mergedUsers.length,
      pending: mergedUsers.filter(u => u.status === 'pending').length,
      approved: mergedUsers.filter(u => u.status === 'approved').length,
    });

  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/users - 사용자 승인/거부
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, action, role } = body; // action: 'approve' | 'reject'

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400 });
    }

    const supabase = createServerClient();

    if (action === 'approve') {
      // Update admin_users table
      try {
        await supabase.from('admin_users').upsert({
          id: userId,
          status: 'approved',
          role: role || 'agent',
        }, { onConflict: 'id' });
      } catch (e) {
        console.error('admin_users update failed:', e);
      }

      // Update user metadata
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { status: 'approved', role: role || 'agent' }
      });

      return NextResponse.json({ success: true, message: '사용자가 승인되었습니다.' });
    } 
    
    if (action === 'reject') {
      try {
        await supabase.from('admin_users').upsert({
          id: userId,
          status: 'rejected',
        }, { onConflict: 'id' });
      } catch (e) {
        console.error('admin_users update failed:', e);
      }

      return NextResponse.json({ success: true, message: '사용자가 거부되었습니다.' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Admin users PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/users - 사용자 삭제
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Delete from admin_users
    try {
      await supabase.from('admin_users').delete().eq('id', userId);
    } catch (e) {
      console.error('admin_users delete failed:', e);
    }

    // Delete from Supabase Auth
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '사용자가 삭제되었습니다.' });

  } catch (error) {
    console.error('Admin users DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
                                            }
