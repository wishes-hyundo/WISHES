import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { notifyAdminNewRegistration } from '@/lib/email';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { emailSchema, passwordSchema } from '@/lib/schemas';

// L-sec39 (2026-04-22): 가입 입력 길이 cap + authError prod 숨김.
// Phase 1 (2026-04-28): PIPA 동의 필드 추가 (acceptedTerms/Privacy/Marketing).
const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: emailSchema, // L-hub1
  password: passwordSchema,
  phone: z.string().max(30).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  role: z.string().max(40).optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  autoApprove: z.boolean().optional(),
  requestedRole: z.string().max(40).optional().nullable(),
  // PIPA / 정보통신망법 동의 — 약관 + 개인정보 필수, 마케팅 옵션
  acceptedTerms: z.boolean().optional(),
  acceptedPrivacy: z.boolean().optional(),
  acceptedMarketing: z.boolean().optional(),
  termsVersion: z.string().max(50).optional().nullable(),
  privacyVersion: z.string().max(50).optional().nullable(),
});

const SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: '입력값을 확인해주세요.' },
        { status: 400 }
      );
    }
    const {
      name, email, password, phone, company, role, reason, requestedRole,
      acceptedTerms, acceptedPrivacy, acceptedMarketing,
      termsVersion, privacyVersion,
    } = parsed.data;

    // Phase 1 (2026-04-28): PIPA — 약관/개인정보 동의 필수 (사장님 본인은 면제)
    const isSuperAdminEmail = ['wishes@wishes.co.kr'].includes(email.toLowerCase());
    if (!isSuperAdminEmail && (!acceptedTerms || !acceptedPrivacy)) {
      return NextResponse.json(
        { success: false, message: '약관 및 개인정보 처리방침 동의가 필요합니다.' },
        { status: 400 }
      );
    }

    // L-sec62 (2026-04-22): 가입 스팸/자동봇 대량 계정 생성 방어.
    //   IP당 1시간 3건 제한.
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `register:ip:${ip}`, limit: 3, windowMs: 60 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, message: '가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const supabase = createServerClient();
    const isSuperAdmin = SUPERADMIN_EMAILS.includes(email.toLowerCase());

    // Try to create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: isSuperAdmin,
      user_metadata: { name, phone, company, role: requestedRole || role }
    });

    // L-sec9 (2026-04-22): CRITICAL account-takeover fix.
    //   Prior branch let anyone who knew a SUPERADMIN email re-POST /register
    //   with any password -> updateUserById + signInWithPassword returned a
    //   valid session token = full account takeover. Remove reset branch
    //   entirely. Password reset must go through Supabase's email flow.
    if (authError && authError.message?.includes('already been registered')) {
      return NextResponse.json(
        { success: false, message: '이미 등록된 이메일입니다.' },
        { status: 409 }
      );
    }

    if (authError) {
      // L-sec39: Supabase authError.message 프로덕션에서 숨김
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { success: false, message: isDev ? (authError.message || '가입 중 오류가 발생했습니다.') : '가입 중 오류가 발생했습니다.' },
        { status: 400 }
      );
    }

    // Phase 1 (2026-04-28): 신 5단계 enum 도입 — 'viewer' 라벨 폐기.
    //   isSuperAdmin → 'owner' (신) 또는 'superadmin' (legacy 양립) 둘 다 통과.
    //   일반 가입자 → 'pending' (승인 후 /admin/users 에서 broker/admin/partner 변경)
    //   admin_users.role CHECK constraint 가 잘못된 라벨을 막아주므로
    //   silent failure 가 아니라 명시적 에러 응답으로 전환.
    const initialRole = isSuperAdmin ? 'owner' : 'pending';
    const initialStatus = isSuperAdmin ? 'approved' : 'pending';

    // Phase 1 (2026-04-28): 동의 시각 기록 (PIPA)
    const nowIso = new Date().toISOString();
    const consentAt = isSuperAdmin ? nowIso : (acceptedTerms ? nowIso : null);
    const privacyAt = isSuperAdmin ? nowIso : (acceptedPrivacy ? nowIso : null);
    const marketingAt = acceptedMarketing ? nowIso : null;
    const tVer = termsVersion || 'v2026-04-28';
    const pVer = privacyVersion || 'v2026-04-28';

    const { error: insertError } = await supabase.from('admin_users').insert({
      id: authData.user.id,
      email: email.toLowerCase(),
      name,
      phone: phone || null,
      company: company || null,
      role: initialRole,
      reason: reason || null,
      status: initialStatus,
      created_at: nowIso,
      terms_consent_at: consentAt,
      terms_version: consentAt ? tVer : null,
      privacy_consent_at: privacyAt,
      privacy_version: privacyAt ? pVer : null,
      marketing_consent_at: marketingAt,
      marketing_consent: !!acceptedMarketing,
    });

    if (insertError) {
      // CHECK constraint 위반 / FK 위반 등 — auth.users 는 만들어진 상태이므로 보고만
      console.error('[register] admin_users insert failed:', insertError);
      // L-sec39: 프로덕션에선 상세 에러 숨김
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        {
          success: false,
          message: isDev ? `사용자 프로필 저장 실패: ${insertError.message}` : '가입 처리 중 오류가 발생했습니다.',
        },
        { status: 500 }
      );
    }

    // Phase 1 (2026-04-28): user_consents 이력 기록 (PIPA 증빙)
    try {
      const ua = request.headers.get('user-agent') || null;
      const consentRows: Array<{ user_id: string; doc_type: string; doc_version: string; consented: boolean; ip: string | null; user_agent: string | null; }> = [];
      if (acceptedTerms || isSuperAdmin) {
        consentRows.push({
          user_id: authData.user.id, doc_type: 'terms', doc_version: tVer,
          consented: true, ip, user_agent: ua,
        });
      }
      if (acceptedPrivacy || isSuperAdmin) {
        consentRows.push({
          user_id: authData.user.id, doc_type: 'privacy', doc_version: pVer,
          consented: true, ip, user_agent: ua,
        });
      }
      consentRows.push({
        user_id: authData.user.id, doc_type: 'marketing', doc_version: 'v2026-04-28',
        consented: !!acceptedMarketing, ip, user_agent: ua,
      });
      if (consentRows.length > 0) {
        await supabase.from('user_consents').insert(consentRows);
      }
    } catch (e) {
      console.warn('[register] user_consents insert failed (non-blocking):', e);
    }

    // Phase 1 (2026-04-28): audit log
    try {
      const { audit } = await import('@/lib/auditLog');
      audit({
        action: 'auth.register',
        actor: { email: email.toLowerCase(), role: initialRole, uid: authData.user.id },
        target: { type: 'admin_users', id: authData.user.id },
        ip,
        userAgent: request.headers.get('user-agent') || undefined,
        route: '/api/auth/register',
        status: 200,
        meta: {
          requested_role: requestedRole,
          terms_consent: !!acceptedTerms,
          privacy_consent: !!acceptedPrivacy,
          marketing_consent: !!acceptedMarketing,
        },
      });
    } catch { /* audit 실패는 무시 */ }

    // Superadmin: sign in and return token
    if (isSuperAdmin) {
      const { data: signIn } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
      });
      return NextResponse.json({
        success: true,
        token: signIn?.session?.access_token || authData.user.id,
        user: {
          id: authData.user.id,
          name,
          email: email.toLowerCase(),
          role: 'superadmin',
          company,
        }
      });
    }

    // ê´ë¦¬ììê² ì ê°ì ìë¦¼ ì´ë©ì¼ ë°ì¡ (ë¹ëê¸°, ì¤í¨í´ë ê°ìì ì±ê³µ)
    notifyAdminNewRegistration({ name, email, phone, company, reason }).catch(console.error);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { success: false, message: 'ìë² ì¤ë¥ê° ë°ìíìµëë¤.' },
      { status: 500 }
    );
  }
}
