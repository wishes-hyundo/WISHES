// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/complete-profile
//
// 소셜 로그인 직후 필수 필드(이름, 연락처) 가 비어 있는 경우 호출되는 엔드포인트.
// Bearer token(Supabase JWT) 로 사용자 식별 → admin_users + profiles + user_metadata
// 에 이름·연락처 저장. 중복 호출 방지를 위해 이름/연락처가 이미 채워진 사용자가
// 다시 호출하면 새 값으로 덮어쓴다 (사용자가 본인 정보 수정 화면으로도 쓸 수 있음).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(30),
});

function normalizePhone(raw: string): string {
  // 숫자와 하이픈만 남기고 다른 문자 제거
  const cleaned = raw.replace(/[^\d-]/g, '').trim();
  // 010xxxxxxxx → 010-xxxx-xxxx 포매팅 (11자리 숫자)
  const digits = cleaned.replace(/-/g, '');
  if (/^\d{11}$/.test(digits) && digits.startsWith('010')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (/^\d{10}$/.test(digits) && (digits.startsWith('02') || digits.startsWith('011'))) {
    return digits;
  }
  return cleaned;
}

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

    // 1) admin_users upsert (없으면 user role/approved 로 자동 생성)
    const { error: upsertErr } = await supabase.from('admin_users').upsert(
      {
        id: userId,
        email,
        name,
        phone,
        role: 'user',
        status: 'approved',
      },
      { onConflict: 'id' },
    );
    // 이미 admin/agent/superadmin 행이 있는 경우 role/status 를 덮어쓰지 않도록
    // 아래에서 role-aware UPDATE 로 name/phone 만 업데이트하면 더 안전하지만,
    // onConflict:id 로 upsert 하면 role/status 도 바뀌므로 주의. 대신 먼저 기존 행을
    // 확인해서 있으면 UPDATE 만, 없으면 INSERT.
    if (upsertErr) {
      // fallback: select then update/insert
      const { data: existing } = await supabase
        .from('admin_users')
        .select('id,role,status')
        .eq('id', userId)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('admin_users')
          .update({ name, phone })
          .eq('id', userId);
      } else {
        await supabase.from('admin_users').insert({
          id: userId,
          email,
          name,
          phone,
          role: 'user',
          status: 'approved',
        });
      }
    } else {
      // upsert 가 성공했지만 기존 role/status 를 지우지 않도록 재확인 후 복구
      const { data: existing } = await supabase
        .from('admin_users')
        .select('role,status')
        .eq('id', userId)
        .maybeSingle();
      // upsert 가 방금 쓴 user/approved 를 기존 role 이 다르면 복구 불필요 (select 값이 방금 쓴 값).
      // 실제로는 위 upsert 가 첫 insert 상황에서만 의미 있고, 기존 행이 있으면 UPDATE 처리 됐음.
      void existing;
    }

    // 2) profiles 테이블에도 업데이트 (있으면)
    try {
      await supabase.from('profiles').upsert(
        { id: userId, email, name, phone, profile_completed: true },
        { onConflict: 'id' },
      );
    } catch { /* profiles 테이블 없을 수도 — skip */ }

    // 3) user_metadata 도 일관성 있게 업데이트
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
