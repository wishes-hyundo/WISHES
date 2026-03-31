import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// DELETE /api/auth/delete-account - 회원탈퇴 (자기 계정 영구 삭제)
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const supabase = createServerClient();

    // Bridge token인 경우 body에서 userId 사용
    let userId: string;

    if (token.startsWith('admin_bridge_')) {
      const body = await request.json();
      userId = body.userId;
      if (!userId) {
        return NextResponse.json({ success: false, message: '사용자 ID가 필요합니다.' }, { status: 400 });
      }
    } else {
      // JWT 토큰으로 사용자 확인
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
      }
      userId = user.id;
    }

    // 1. admin_users 테이블에서 삭제
    const { error: dbError } = await supabase
      .from('admin_users')
      .delete()
      .eq('id', userId);

    if (dbError) {
      console.warn('admin_users delete failed:', dbError.message);
    }

    // 2. listings 테이블에서 해당 사용자의 매물 삭제
    const { error: listingsError } = await supabase
      .from('listings')
      .delete()
      .eq('user_id', userId);

    if (listingsError) {
      console.warn('listings delete failed:', listingsError.message);
    }

    // 3. contacts 테이블에서 해당 사용자의 상담 삭제
    const { error: contactsError } = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', userId);

    if (contactsError) {
      console.warn('contacts delete failed:', contactsError.message);
    }

    // 4. Supabase Auth에서 사용자 영구 삭제
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      return NextResponse.json(
        { success: false, message: '계정 삭제 실패: ' + authDeleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '회원탈퇴가 완료되었습니다. 모든 데이터가 영구 삭제되었습니다.'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
