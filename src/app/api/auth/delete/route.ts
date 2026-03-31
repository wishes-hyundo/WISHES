import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: '사용자 정보가 없습니다.' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 사용자의 찜 목록 삭제
    try {
      await supabase.from('favorites').delete().eq('user_id', userId);
    } catch {
      // favorites 테이블이 없어도 무시
    }

    // Supabase Auth에서 사용자 삭제
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      console.error('회원 탈퇴 오류:', error.message);
      return NextResponse.json({ error: '회원 탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '회원 탈퇴가 완료되었습니다.' });
  } catch (error) {
    console.error('회원 탈퇴 서버 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
