import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { notifyUserApproved, notifyUserRejected } from '@/lib/email';

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

      // Get admin_users data (table may not exist)
      let adminUsersData: any[] = [];
          let tableExists = true;
          const { data: adminData, error: adminError } = await supabase.from('admin_users').select('*');
          if (adminError) {
                  console.warn('admin_users table query failed:', adminError.message);
                  tableExists = false;
          } else {
                  adminUsersData = adminData || [];
          }

      // Merge auth users with admin_users data + user_metadata fallback
      const mergedUsers = (users || []).map(user => {
              const adminRow = adminUsersData.find(au => au.id === user.id || au.email === user.email);
              const meta = user.user_metadata || {};

                                                  // Priority: admin_users table > user_metadata > defaults
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
              tableExists,
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
          let dbUpdated = false;
          let metaUpdated = false;

      if (action === 'approve') {
              const newRole = role || 'agent';

            // 1) Try admin_users table upsert (proper error check)
            const { error: upsertError } = await supabase.from('admin_users').upsert({
                      id: userId,
                      status: 'approved',
                      role: newRole,
            }, { onConflict: 'id' });

            if (upsertError) {
                      console.warn('admin_users upsert failed:', upsertError.message);
            } else {
                      dbUpdated = true;
            }

            // 2) Always update user_metadata as fallback/sync
            const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
                      email_confirm: true,
                      user_metadata: { status: 'approved', role: newRole }
            });

            if (metaError) {
                      console.warn('user_metadata update failed:', metaError.message);
            } else {
                      metaUpdated = true;
            }

            // At least one must succeed
            if (!dbUpdated && !metaUpdated) {
                      return NextResponse.json({
                                  success: false,
                                  error: '승인 처리 실패: DB와 메타데이터 모두 업데이트 실패',
                                  details: { upsertError: upsertError?.message, metaError: metaError?.message }
                      }, { status: 500 });
            }


            // 승인 알림 이메일 발송
            const approvedUser = (await supabase.auth.admin.getUserById(userId))?.data?.user;
            notifyUserApproved({
              email: approvedUser?.email || '',
              name: approvedUser?.user_metadata?.name || '',
              role: newRole,
            }).catch(console.error);

            return NextResponse.json({
                      success: true,
                      message: '사용자가 승인되었습니다.',
                      dbUpdated,
                      metaUpdated,
            });
      }

      if (action === 'reject') {
              // 1) Try admin_users table upsert
            const { error: upsertError } = await supabase.from('admin_users').upsert({
                      id: userId,
                      status: 'rejected',
            }, { onConflict: 'id' });

            if (upsertError) {
                      console.warn('admin_users upsert failed:', upsertError.message);
            } else {
                      dbUpdated = true;
            }

            // 2) Always update user_metadata as fallback
            const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
                      user_metadata: { status: 'rejected' }
            });

            if (metaError) {
                      console.warn('user_metadata update failed:', metaError.message);
            } else {
                      metaUpdated = true;
            }

            if (!dbUpdated && !metaUpdated) {
                      return NextResponse.json({
                                  success: false,
                                  error: '거부 처리 실패: DB와 메타데이터 모두 업데이트 실패',
                                  details: { upsertError: upsertError?.message, metaError: metaError?.message }
                      }, { status: 500 });
            }


            // 거부 알림 이메일 발송
            const rejectedUser = (await supabase.auth.admin.getUserById(userId))?.data?.user;
            notifyUserRejected({
              email: rejectedUser?.email || '',
              name: rejectedUser?.user_metadata?.name || '',
            }).catch(console.error);

            return NextResponse.json({
                      success: true,
                      message: '사용자가 거부되었습니다.',
                      dbUpdated,
                      metaUpdated,
            });
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

      // Delete from admin_users (ignore if table doesn't exist)
      const { error: deleteError } = await supabase.from('admin_users').delete().eq('id', userId);
          if (deleteError) {
                  console.warn('admin_users delete failed:', deleteError.message);
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
