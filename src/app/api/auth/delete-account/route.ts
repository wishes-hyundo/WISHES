import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { timingSafeEqualStr } from '@/lib/timingSafe';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// L-sec1 (2026-04-22): admin_bridge_ prefix 만 보고 body.userId 로 임의
//   계정을 삭제하던 치명적 우회 수정.
const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];
function getCrawlerBridgeToken(): string | null {
  const env = process.env.WISHES_CRAWLER_BRIDGE_TOKEN;
  return env && env.length >= 16 ? env : null;
}

// DELETE /api/auth/delete-account - 회원탈퇴 (자기 계정 영구 삭제)
export async function DELETE(request: NextRequest) {
  try {
    // L-sec62 (2026-04-22): 계정 삭제 남용 방어 — IP당 1시간 3건.
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `delacct:ip:${ip}`, limit: 3, windowMs: 60 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const supabase = createServerClient();

    // L-sec1: admin_bridge_ prefix 를 벗긴 뒤 inner 토큰을 실제 검증.
    //   허용 조건 (bridge 경로에서 타인 계정 삭제):
    //     A) inner 토큰이 env WISHES_CRAWLER_BRIDGE_TOKEN 과 정확히 일치 (운영 전용)
    //     B) inner 토큰이 superadmin email 로 검증된 JWT
    //   그 외엔 반드시 JWT 로 본인 계정만 셀프 삭제.
    let userId: string;
    let isBridgeAuthorized = false;

    if (token.startsWith('admin_bridge_')) {
      const inner = token.slice('admin_bridge_'.length);
      const crawlerBridge = getCrawlerBridgeToken();

      if (crawlerBridge && timingSafeEqualStr(inner, crawlerBridge)) {
        isBridgeAuthorized = true;
      } else {
        // inner 가 JWT 이면 Supabase 로 검증 + superadmin email 체크
        const { data: { user }, error } = await supabase.auth.getUser(inner);
        if (error || !user) {
          return NextResponse.json(
            { success: false, message: '유효하지 않은 브리지 토큰입니다.' },
            { status: 401 }
          );
        }
        const email = (user.email || '').toLowerCase();
        if (!SUPERADMIN_EMAILS.includes(email)) {
          return NextResponse.json(
            { success: false, message: '이 작업은 슈퍼어드민만 가능합니다.' },
            { status: 403 }
          );
        }
        isBridgeAuthorized = true;
      }

      if (isBridgeAuthorized) {
        const body = await request.json();
        userId = body.userId;
        if (!userId) {
          return NextResponse.json({ success: false, message: '사용자 ID가 필요합니다.' }, { status: 400 });
        }
      } else {
        return NextResponse.json(
          { success: false, message: '권한이 없습니다.' },
          { status: 403 }
        );
      }
    } else {
      // 일반 경로: JWT 로 본인 계정만 셀프 삭제
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
