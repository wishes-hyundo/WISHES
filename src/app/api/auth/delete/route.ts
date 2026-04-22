import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// L-sec37 (2026-04-22) CRITICAL:
//   이전 버전은 요청 body 의 userId 만 읽어 supabase.auth.admin.deleteUser 를
//   호출했음 → 인증 없이 아무 사용자 계정 삭제 가능한 치명적 취약점.
//   이제 Authorization: Bearer <JWT> 를 요구하고, JWT 에서 추출한 user.id 만
//   사용 (body.userId 는 완전 무시). 셀프 삭제만 허용.
export async function POST(request: NextRequest) {
  try {
    // L-sec77 (2026-04-22): defense-in-depth. L-sec37 auth 우회 수정 외
    //   토큰 leak / 인증 로직 회귀 대비. 5분 5회/IP cap.
    //   정상 self-delete 는 사용자당 종생 1회.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `auth-delete:ip:${_ip}`, limit: 5, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const supabase = createServerClient();

    // JWT 검증 — 서명 검증까지 포함 (verifyAdminAuth 와 동일 원칙)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const userId = user.id;

    // 사용자의 찜 목록 삭제 (favorites 테이블이 있다면)
    try {
      await supabase.from('favorites').delete().eq('user_id', userId);
    } catch {
      // favorites 테이블이 없어도 무시
    }

    // Supabase Auth 에서 사용자 삭제
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      console.error('회원 탈퇴 오류:', error.message);
      return NextResponse.json(
        { error: '회원 탈퇴 처리 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: '회원 탈퇴가 완료되었습니다.' });
  } catch (error) {
    console.error('회원 탈퇴 서버 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
