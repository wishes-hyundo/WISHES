import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { emailSchema } from '@/lib/schemas';

// L-login-timeout (2026-05-10 사장님 발견): /api/auth/login 504 (10s default).
//   Vercel default function timeout 10s → cold start + Supabase signInWithPassword
//   조합 시 가끔 초과. maxDuration 30s 로 충분한 여유 확보.
//   nodejs runtime 명시 — Edge runtime 회귀 차단 (auth flow 는 nodejs 필요).
export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

// L-sec39 (2026-04-22): 로그인 입력 검증 강화.
//   이전: body.email/password 타입·길이 검증 전무 → 10MB 패스워드 bcrypt DoS,
//         .toLowerCase() 호출 시 타입 불일치로 500, 에러 경로 분기 불명확.
// L-hub1 (2026-04-22): emailSchema (max 200, trim) 허브 이관.
const LoginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
    try {
          const body = await request.json().catch(() => ({}));
          const parsed = LoginSchema.safeParse(body);
          if (!parsed.success) {
                  return NextResponse.json(
                    { success: false, message: '이메일과 비밀번호를 입력해주세요.' },
                    { status: 400 }
                            );
          }
          const { email: rawEmail, password } = parsed.data;
          const email = rawEmail.toLowerCase();

      // L-sec62 (2026-04-22): brute-force 방어용 rate limit.
      //   (a) IP+email: 15분 5회 — 동일 계정 표적 공격 차단
      //   (b) IP 전역: 15분 20회 — 단일 IP 다계정 credential stuffing 차단
      //   per-instance 메모리 제한이라 수평 스케일 시 N배 허용되지만 defense-in-depth.
      const ip = getClientIp(request);
          const perIpEmail = checkRateLimit({ key: `login:ip:${ip}:email:${email}`, limit: 5, windowMs: 15 * 60_000 });
          const perIp = checkRateLimit({ key: `login:ip:${ip}`, limit: 20, windowMs: 15 * 60_000 });
          if (!perIpEmail.ok || !perIp.ok) {
                  const retry = Math.max(perIpEmail.retryAfterSec, perIp.retryAfterSec);
                  return NextResponse.json(
                    { success: false, message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
                    { status: 429, headers: { 'Retry-After': String(retry) } }
                          );
          }

      const supabase = createServerClient();

      // L-login-timeout (2026-05-10 사장님 발견): signInWithPassword 가 가끔 hang.
      //   Promise.race 로 8s 안 응답 안 오면 timeout error 반환 (10s Vercel default 보다 짧게).
      //   사용자에 즉각 피드백 + Vercel 함수 stuck 회피.
      const SIGNIN_TIMEOUT_MS = 8000;
      const signInPromise = supabase.auth.signInWithPassword({ email, password });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('signin_timeout_8s')), SIGNIN_TIMEOUT_MS)
      );
      let authData: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'];
      let authError: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'];
      try {
        const result = await Promise.race([signInPromise, timeoutPromise]);
        authData = result.data;
        authError = result.error;
      } catch (timeoutErr) {
        console.error('[login] Supabase auth timeout:', timeoutErr);
        return NextResponse.json(
          { success: false, message: '인증 서버가 일시적으로 응답이 느립니다. 잠시 후 다시 시도해주세요.' },
          { status: 503, headers: { 'Retry-After': '5' } }
        );
      }

      if (authError) {
              // Check if user exists but is not confirmed (pending approval)
            if (authError.message.includes('Email not confirmed')) {
                      return NextResponse.json(
                        { success: false, message: '관리자 승인 대기 중입니다. 승인 후 이메일로 안내드리겠습니다.' },
                        { status: 403 }
                                );
            }
              return NextResponse.json(
                { success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
                { status: 401 }
                      );
      }

      // Check admin_users table for role info
      const isSuperAdmin = SUPERADMIN_EMAILS.includes(email);
          let userRole = isSuperAdmin ? 'superadmin' : 'user';
          let userName = authData.user?.user_metadata?.name || '';
          let userCompany = authData.user?.user_metadata?.company || '';

      // Try to get role from admin_users table
      const { data: adminUser } = await supabase
            .from('admin_users')
            .select('role, name, company, status')
            .eq('email', email)
            .single();

      if (adminUser) {
              if (adminUser.status === 'pending') {
                        return NextResponse.json(
                          { success: false, message: '관리자 승인 대기 중입니다.' },
                          { status: 403 }
                                  );
              }
              if (adminUser.status === 'rejected') {
                        return NextResponse.json(
                          { success: false, message: '가입이 거절되었습니다. 관리자에게 문의하세요.' },
                          { status: 403 }
                                  );
              }
              // L-sec159 (2026-04-23): 'blocked' 상태 누락 차단.
            //   Command Center 의 차단(block) 버튼이 status='blocked' 로 DB 업데이트하지만
            //   login 경로에는 차단 분기가 없어 blocked 사용자도 로그인이 뚫렸음.
            if (adminUser.status === 'blocked') {
                      return NextResponse.json(
                        { success: false, message: '계정이 차단되었습니다. 관리자에게 문의하세요.' },
                        { status: 403 }
                                );
            }
              userRole = adminUser.role || userRole;
              userName = adminUser.name || userName;
              userCompany = 