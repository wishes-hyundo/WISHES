import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { notifyUserApproved, notifyUserRejected } from '@/lib/email';
import { verifyAdminAuth } from '@/lib/adminAuth';

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

// GET /api/admin/users - ì¬ì©ì ëª©ë¡ ì¡°í
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    let adminUsersData: any[] = [];
    let tableExists = true;
    const { data: adminData, error: adminError } = await supabase.from('admin_users').select('*');
    if (adminError) {
      console.warn('admin_users table query failed:', adminError.message);
      tableExists = false;
    } else {
      adminUsersData = adminData || [];
    }

    const mergedUsers = (users || []).map(user => {
      const adminRow = adminUsersData.find(au => au.id === user.id || au.email === user.email);
      const meta = user.user_metadata || {};

      return {
        id: user.id,
        email: user.email,
        name: adminRow?.name || meta.name || '',
        phone: adminRow?.phone || meta.phone || '',
        company: adminRow?.company || meta.company || '',
        role: adminRow?.role || meta.role || 'user',
        reason: adminRow?.reason || meta.reason || '',
        status: adminRow?.status || meta.status || (SUPERADMIN_EMAILS.includes(user.email?.toLowerCase() || '') ? 'approved' : 'pending'),
        created_at: adminRow?.created_at || user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      };
    });

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    const filtered = statusFilter ? mergedUsers.filter(u => u.status === statusFilter) : mergedUsers;

    return NextResponse.json({
      success: true,
      users: filtered,
      total: mergedUsers.length,
      pending: mergedUsers.filter(u => u.status === 'pending').length,
      approved: mergedUsers.filter(u => u.status === 'approved').length,
      tableExists,
    });

  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/users - ì¬ì©ì ì¹ì¸/ê±°ë¶/ì­í ë³ê²½/ì°¨ë¨
export async function PUT(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, action, role } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400 });
    }

    const supabase = createServerClient();
    let dbUpdated = false;
    let metaUpdated = false;

    // ì¹ì¸
    if (action === 'approve') {
      // L-sec48 (2026-04-22): approve path newRole whitelist (defense in depth)
      //   compromised admin injecting arbitrary role blocked
      const VALID_ROLES = ['admin', 'agent', 'viewer'];
      const newRole = VALID_ROLES.includes(String(role || '')) ? String(role) : 'agent';

      const { error: upsertError } = await supabase.from('admin_users').upsert({
        id: userId, status: 'approved', role: newRole,
      }, { onConflict: 'id' });
      if (upsertError) { console.warn('admin_users upsert failed:', upsertError.message); }
      else { dbUpdated = true; }

      const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
        email_confirm: true,
        user_metadata: { status: 'approved', role: newRole }
      });
      if (metaError) { console.warn('user_metadata update failed:', metaError.message); }
      else { metaUpdated = true; }

      if (!dbUpdated && !metaUpdated) {
        return NextResponse.json({ success: false, error: 'ì¹ì¸ ì²ë¦¬ ì¤í¨' }, { status: 500 });
      }

      const approvedUser = (await supabase.auth.admin.getUserById(userId))?.data?.user;
      notifyUserApproved({
        email: approvedUser?.email || '',
        name: approvedUser?.user_metadata?.name || '',
        role: newRole,
      }).catch(console.error);

      return NextResponse.json({ success: true, message: 'ì¬ì©ìê° ì¹ì¸ëììµëë¤.', dbUpdated, metaUpdated });
    }

    // ê±°ë¶
    if (action === 'reject') {
      const { error: upsertError } = await supabase.from('admin_users').upsert({
        id: userId, status: 'rejected',
      }, { onConflict: 'id' });
      if (upsertError) { console.warn('admin_users upsert failed:', upsertError.message); }
      else { dbUpdated = true; }

      const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { status: 'rejected' }
      });
      if (metaError) { console.warn('user_metadata update failed:', metaError.message); }
      else { metaUpdated = true; }

      if (!dbUpdated && !metaUpdated) {
        return NextResponse.json({ success: false, error: 'ê±°ë¶ ì²ë¦¬ ì¤í¨' }, { status: 500 });
      }

      const rejectedUser = (await supabase.auth.admin.getUserById(userId))?.data?.user;
      notifyUserRejected({
        email: rejectedUser?.email || '',
        name: rejectedUser?.user_metadata?.name || '',
      }).catch(console.error);

      return NextResponse.json({ success: true, message: 'ì¬ì©ìê° ê±°ë¶ëììµëë¤.', dbUpdated, metaUpdated });
    }

    // ì­í (ì§ì±) ë³ê²½
    if (action === 'change_role') {
      const newRole = role;
      if (!newRole || !['superadmin', 'admin', 'agent', 'viewer'].includes(newRole)) {
        return NextResponse.json({ error: 'ì í¨íì§ ìì ì¬í ìëë¤.' }, { status: 400 });
      }

      const { error: upsertError } = await supabase.from('admin_users').upsert({
        id: userId, role: newRole,
      }, { onConflict: 'id' });
      if (upsertError) { console.warn('admin_users role update failed:', upsertError.message); }
      else { dbUpdated = true; }

      const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { role: newRole }
      });
      if (metaError) { console.warn('user_metadata role update failed:', metaError.message); }
      else { metaUpdated = true; }

      if (!dbUpdated && !metaUpdated) {
        return NextResponse.json({ success: false, error: 'ì­í  ë³ê²½ ì¤í¨' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'ì­í ì´ ' + newRole + '(ì¼)ë¡ ë³ê²½ëììµëë¤.',
        dbUpdated, metaUpdated,
      });
    }

    // ì°¨ë¨
    if (action === 'block') {
      const { error: upsertError } = await supabase.from('admin_users').upsert({
        id: userId, status: 'blocked',
      }, { onConflict: 'id' });
      if (!upsertError) dbUpdated = true;

      const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { status: 'blocked' }
      });
      if (!metaError) metaUpdated = true;

      return NextResponse.json({ success: true, message: 'ì¬ì©ìê° ì°¨ë¨ëììµëë¤.', dbUpdated, metaUpdated });
    }

    // ì°¨ë¨ í´ì 
    if (action === 'unblock') {
      const { error: upsertError } = await supabase.from('admin_users').upsert({
        id: userId, status: 'approved',
      }, { onConflict: 'id' });
      if (!upsertError) dbUpdated = true;

      const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { status: 'approved' }
      });
      if (!metaError) metaUpdated = true;

      return NextResponse.json({ success: true, message: 'ì°¨ë¨ì´ í´ì ëììµëë¤.', dbUpdated, metaUpdated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Admin users PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/users - ì¬ì©ì ì­ì 
export async function DELETE(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { error: deleteError } = await supabase.from('admin_users').delete().eq('id', userId);
    if (deleteError) { console.warn('admin_users delete failed:', deleteError.message); }

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'ì¬ì©ìê° ì­ì ëììµëë¤.' });

  } catch (error) {
    console.error('Admin users DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
