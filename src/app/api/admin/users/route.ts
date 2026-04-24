import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { notifyUserApproved, notifyUserRejected } from '@/lib/email';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';


/**
 * admin_users 행 업데이트 헬퍼 — 2026-04-23 L-admin-fix
 *   PostgREST upsert 는 INSERT 먼저 시도하므로 email NOT NULL 제약으로 조용히 실패.
 *   UPDATE 먼저, 0 rows 면 email 을 fetch 해서 INSERT 로 fallback.
 */
async function _applyAdminUserFields(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .update(fields)
      .eq('id', userId)
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (data && data.length > 0) return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as { message?: string })?.message || 'update failed' };
  }
  // 0 rows affected → 새로 INSERT (admin_users 가 없던 사용자). email 필수.
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const email = (userData?.user?.email || '').toLowerCase();
    if (!email) return { ok: false, error: 'user email missing' };
    const { error: insertError } = await supabase
      .from('admin_users')
      .insert({ id: userId, email, ...fields });
    if (insertError) return { ok: false, error: insertError.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as { message?: string })?.message || 'insert failed' };
  }
}

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

// GET /api/admin/users - ì¬ì©ì ëª©ë¡ ì¡°í
export async function GET(request: NextRequest) {
  try {
    // L-sec127 (2026-04-22, M-1): verifyAdminAuth 는 role=agent 까지 통과 → 일반
    //   에이전트가 타 에이전트의 이메일/전화/회사/role/status 를 전부 볼 수 있었음.
    //   verifyAdminAuthStrict + role gate 로 superadmin/master 만 허용.
    const caller = await verifyAdminAuthStrict(request);
    if (!caller.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (caller.role !== 'superadmin' && caller.role !== 'master') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    // L-sec97 (2026-04-22): CRITICAL privilege escalation 차단.
    //   과거엔 verifyAdminAuth (agent/admin/superadmin 모두 통과) 만
    //   가드였으로, role=agent 계정이 action='change_role' + role='superadmin' +
    //   userId=<self> 로 자가 승격 가능했음.
    //   verifyAdminAuthStrict 로 caller role 확인하고 superadmin/master 만 허용.
    const caller = await verifyAdminAuthStrict(request);
    if (!caller.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (caller.role !== 'superadmin' && caller.role !== 'master') {
      return NextResponse.json(
        { error: '사용자 계정 관리는 슈퍼어드민만 가능합니다.' },
        { status: 403 },
      );
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

      const _r = await _applyAdminUserFields(supabase, userId, { status: 'approved', role: newRole });
      if (!_r.ok) { console.warn('admin_users update (approve) failed:', _r.error); }
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
      const _r = await _applyAdminUserFields(supabase, userId, { status: 'rejected' });
      if (!_r.ok) { console.warn('admin_users update (reject) failed:', _r.error); }
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
      if (!newRole || !['superadmin', 'admin', 'agent', 'viewer', 'user'].includes(newRole)) {
        return NextResponse.json({ error: 'ì í¨íì§ ìì ì¬í ìëë¤.' }, { status: 400 });
      }

      const _r = await _applyAdminUserFields(supabase, userId, { role: newRole });
      if (!_r.ok) { console.warn('admin_users update (change_role) failed:', _r.error); }
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
      const _r = await _applyAdminUserFields(supabase, userId, { status: 'blocked' });
      if (_r.ok) dbUpdated = true; else console.warn('admin_users update (block) failed:', _r.error);

      const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { status: 'blocked' }
      });
      if (!metaError) metaUpdated = true;

      return NextResponse.json({ success: true, message: 'ì¬ì©ìê° ì°¨ë¨ëììµëë¤.', dbUpdated, metaUpdated });
    }

    // ì°¨ë¨ í´ì 
    if (action === 'unblock') {
      const _r = await _applyAdminUserFields(supabase, userId, { status: 'approved' });
      if (_r.ok) dbUpdated = true; else console.warn('admin_users update (unblock) failed:', _r.error);

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
    // L-sec97 (2026-04-22): DELETE 도 superadmin/master 만.
    //   일반 admin 이 다른 admin 계정(심지어 superadmin)을 삭제하는 것을 차단.
    const caller = await verifyAdminAuthStrict(request);
    if (!caller.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (caller.role !== 'superadmin' && caller.role !== 'master') {
      return NextResponse.json(
        { error: '사용자 삭제는 슈퍼어드민만 가능합니다.' },
        { status: 403 },
      );
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

    return NextResponse.json({ success: true, message: '사용자가 삭제되었습니다.' });

  } catch (error) {
    console.error('Admin users DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
