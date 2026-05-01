// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/complete-profile
//
// 소셜 로그인 직후 필수 필드(이름, 연락처) 가 비어 있는 경우 호출되는 엔드포인트.
// Bearer token(Supabase JWT) 로 사용자 식별 → admin_users + profiles + user_metadata
// 에 이름·연락처 저장. 중복 호출 방지를 위해 이름/연락처가 이미 채워진 사용자가
// 다시 호출하면 새 값으로 덮어쓴다 (사용자가 본인 정보 수정 화면으로도 쓸 수 있음).
//
// L-sec170 (2026-05-02, PR-S1 P0-A): admin_users.role / admin_users.status 보존.
//   기존 upsert(onConflict:id) 패턴은 admin/owner/superadmin/broker 사용자가 자기
//   프로필을 갱신할 때 role='user' / status='approved' 로 덮어써 권한을 잃게 했다.
//   사후 SELECT 으로 재확인 시도가 있었으나 upsert 가 이미 row 를 덮어쓴 뒤이므로
//   복구 불가. 이번 패치에서 SELECT-first 로 패턴을 통일:
//     - 기존 row 있음   → name/phone 만 UPDATE (role/status 보존)
//     - 기존 row 없음   → INSERT (신규 소셜 가입자: user/approved)
//   ON CONFLICT 경합은 신규 가입 → 동시 호출 케이스에서만 발생하며, 두 번째 호출은
//   duplicate key 를 catch 후 UPDATE 경로로 떨어뜨린다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { normalizePhone } from '@/lib/normalizePhone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(30),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `complete-profile:${ip}`, limit: 20, windowMs: 15 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, message: '요청이 너무 많습니다.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: '이름(1~100자)과 연락처(8~30자)를 정확히 입력해주세요.' },
        { status: 400 },
      );
    }
    const name = parsed.data.name.trim();
    const phone = normalizePhone(parsed.data.phone);

    const supabase = createServerClient();

    // JWT 서명 검증 + user 정보 조회
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ success: false, message: '세션이 만료되었습니다.' }, { status: 401 });
    }
    const user = userData.user;
    const userId = user.id;
    const email = (user.email || '').toLowerCase();

    // 1) admin_users: SELECT-then-UPDATE/INSERT 패턴으로 role/status 보존 (L-sec170).
    //    기존 row 가 있으면 name/phone 만 갱신 — 'admin'/'owner'/'broker' 등 권한 유지.
    //    기존 row 가 없으면 신규 INSERT (user/approved).
    const { data: existing, error: selectErr } = await supabase
      .from('admin_users')
      .select('id,role,status')
      .eq('id', userId)
      .maybeSingle();

    if (selectErr) {
      console.warn('[complete-profile] admin_users select failed:', selectErr.message);
    }

    if (existing) {
      // UPDATE: role / status 는 손대지 않는다 — 사장님(owner/admin) 프로필 갱신 시 권한 보존.
      const { error: updateErr } = await supabase
        .from('admin_users')
        .update({ name, phone })
        .eq('id', userId);
      if (updateErr) {
        console.warn('[complete-profile] admin_users update failed:', updateErr.message);
      }
    } else {
      // INSERT: 신규 소셜 가입자 — user/approved 로 즉시 활성화.
      //   동시 호출(레이스) 시 duplicate key 가 떨어지면 다음 GET 시 fall-through 로 안전.
      const { error: insertErr } = await supabase.from('admin_users').insert({
        id: userId,
        email,
        name,
        phone,
        role: 'user',
        status: 'approved',
      });
      if (insertErr && !/duplicate|unique|conflict/i.test(insertErr.message || '')) {
        console.warn('[complete-profile] admin_users insert failed:', insertErr.message);
      }
    }

    // 2) profiles 테이블에도 업데이트 (있으면). profiles 는 role 컬럼이 없어 upsert 안전.
    try {
      await supabase.from('profiles').upsert(
        { id: userId, email, name, phone, profile_completed: true },
        { onConflict: 'id' },
      );
    } catch { /* profiles 테이블 없을 수도 — skip */ }

    // 3) user_metadata 도 일관성 있게 업데이트 (Supabase 클라이언트 표시용)
    try {
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(user.user_metadata || {}),
          name,
          full_name: name,
          phone,
          profile_completed: true,
        },
      });
    } catch (e) {
      console.warn('user_metadata update failed:', (e as { message?: string })?.message);
    }

    return NextResponse.json({ success: true, name, phone });
  } catch (err) {
    console.error('[complete-profile] error:', err);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
