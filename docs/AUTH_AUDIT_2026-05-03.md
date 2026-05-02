# 회원가입 시스템 정밀검수 보고서 — 2026-05-03

> **사장님 명령**: "회원가입 시스템 정밀검수 + 2026 최신 기술 함께 보고. 대충 보고 X."

검증 방법: 코드(177ee333 main HEAD) + Supabase 직접 SQL + prod API 직접 호출 + 2026 표준 WebSearch. 추측 0.

---

## 1. 라이브 데이터 — 현재 회원 상태

| 항목 | 수치 | 비고 |
|---|---|---|
| auth.users 총 가입자 | **15명** | Supabase 내장 |
| 카카오 OAuth 가입자 | **1명** | kakao_4861415260@users.wishes.co.kr (2026-04-24) |
| 네이버 OAuth 가입자 | **1명** | gla***@naver.com (2026-04-30) |
| 구글 OAuth 가입자 | **2명** | yyj***@gmail.com / 사장님 본인 wis***@wishes.co.kr |
| 자체 가입(이메일/비번) | **11명** | 모두 admin_users.role='agent', status='approved' |
| admin_users 등록 사용자 | **13명** | auth.users 15명 중 2명 누락 |
| admin_users 누락 (유령 계정) | **2명** | (1) gla***@naver.com (2) 사장님 wis***@wishes.co.kr Google 계정 |

---

## 2. 결함 (Critical → Minor 순)

### F-1 [CRITICAL] `/admin/users` 사이드바 링크 부재 — 사장님이 못 찾는 진짜 원인
- 페이지 자체는 `src/app/admin/users/page.tsx` 에 존재 (헤더 "직원 승인 관리")
- API `/api/admin/users` GET 도 정상 (`supabase.auth.admin.listUsers()` 로 모든 카카오/네이버/구글/자체 사용자 통합 반환)
- **사이드바 (`src/app/admin/layout.tsx` line 221)** navItems 에 `/admin/users` **링크 없음**:
  ```ts
  const navItems = [
    { href: '/admin', label: '대시보드' },
    { href: '/admin?tab=contacts', label: '상담 관리' },
    { href: '/admin/dedup', label: '중복 정리' },
    { href: '/admin/profile', label: '내 프로필' },
  ];  // → /admin/users 없음
  ```
- 결과: 사장님이 URL `/admin/users` 직접 입력하지 않으면 영원히 못 찾음

### F-2 [CRITICAL] Google OAuth 가입자가 admin_users 에 안 들어감
- 사장님 본인(Google 가입) admin_users 에 누락
- 코드 검증: `/api/auth/kakao` 와 `/api/auth/naver` 는 callback 에서 `admin_users.insert` 시도
- **Google 은 Supabase native `signInWithOAuth('google')` 사용** → callback page (`src/app/auth/callback/client.tsx`) 가 단순 `verifyOtp` 만 함, admin_users insert 로직 없음
- `AuthContext.tsx` line 65: `signInWithProvider(provider: 'kakao' | 'google')` — google 분기에 admin_users 처리 누락
- 사장님이 가입자 안 보이는 두 번째 이유

### F-3 [HIGH] 자체 회원가입은 'pending' 으로 들어가는데 승인 UI 접근 불가 — "기능이 작동 안 한다" 진짜 원인
- `/api/auth/register` 는 superadmin 외 모두 `status='pending'` + `email_confirm: false`
- 가입자는 `notifyAdminNewRegistration` 이메일이 사장님께 발송됨 (`src/lib/email.ts`)
- 사장님이 이 이메일 받아도 **승인 페이지(`/admin/users`) 사이드바 링크 부재(F-1)** → 어디 가서 승인하는지 모름 → 가입자 영원히 'pending' → 로그인 시도 시 "관리자 승인 대기 중" 응답 → 가입은 됐는데 못 들어옴 = "작동 안 함"
- 11명의 자체 가입자가 모두 'approved' 인 건 사장님이 SQL 로 직접 처리했거나 URL 직접 입력으로 승인한 흔적

### F-4 [HIGH] 자체 회원가입 후 이메일 미인증 + 'pending' 분기 메시지 혼동
- `register` 코드: `email_confirm: isSuperAdmin` → 일반 가입자 `email_confirm: false`
- 첫 로그인 시 Supabase 가 "Email not confirmed" 반환
- `/api/auth/login` 코드:
  ```ts
  if (authError.message.includes('Email not confirmed')) {
    return ... { message: '관리자 승인 대기 중입니다...', status: 403 };
  }
  ```
- 즉, **이메일 미인증과 관리자 승인 대기를 같은 메시지로 처리** — 실제 원인 진단 불가능. 사장님 콘솔에서 어떤 이슈인지 구분 안 됨.

### F-5 [HIGH] 네이버 callback 의 admin_users insert silent fail
- `/api/auth/naver` 는 신규 가입 분기에서만 admin_users insert (existingUser 분기 누락)
- gla***@naver.com 케이스: app_provider='email' + user_provider='naver' — 이전에 다른 경로로 auth.users 에 만들어진 후 네이버 로그인 → existingUser 분기 → admin_users insert 미실행
- 카카오 코드도 동일 패턴 (existingUser 분기에서 admin_users insert 안 함)
- 결과: 첫 가입은 OK 지만 통합 케이스에서 admin_users 누락

### F-6 [MEDIUM] OAuth 콜백 redirect_uri = `www.wishes.co.kr` (apex 미통일)
- `curl -I https://wishes.co.kr/api/auth/oauth-start/kakao` 응답:
  ```
  Location: https://kauth.kakao.com/oauth/authorize?...&redirect_uri=https%3A%2F%2Fwww.wishes.co.kr%2Fauth%2Fcallback%3Fprovider%3Dkakao
  ```
- 사장님 메인 도메인은 apex `wishes.co.kr` 인데 OAuth 시작 시 Origin 헤더가 www 로 와서 redirect_uri 가 www 로 박힘
- Kakao Developers Console 에 두 도메인 모두 등록 안 되어 있으면 KOE205 또는 redirect_uri_mismatch 발생

### F-7 [MEDIUM] /admin/users UI 가 "직원 승인 관리" 만 강조 — 일반 고객 분리 필터 부재
- 헤더: "직원 승인 관리"
- 실제로는 카카오/네이버/구글 가입자도 같이 표시
- 사장님이 들어가도 "이건 직원용이지 고객 회원 정보가 아니다" 오인
- 필터: status (pending/approved/rejected/all) 만 있고, **provider/role 별 필터 부재** (고객 vs 직원 구분 어려움)

### F-8 [MEDIUM] Default 필터 'pending' — 카카오/네이버 가입자가 default 화면에 안 보임
- 카카오/네이버 OAuth 가입자는 `status='approved'` 자동 (코드: `status: 'approved'`)
- /admin/users 첫 진입 시 `filter='pending'` default → approved 가입자 안 보임 → 사장님 "고객 정보 어디 있는지 모르겠다" 인상

### F-9 [LOW] 이중 인증 흐름 (`/login` vs `/admin/admin-auth.html`)
- `/login` (Next.js 페이지) + `/admin/admin-auth.html` (정적 HTML) 두 개 공존
- admin layout 인증 가드는 `/admin/admin-auth.html` 로 redirect
- 일반 페이지 (e.g. `/mypage`) 가드는 `/login` 으로 redirect
- 동일 사용자가 두 경로 거치는 로직 (token bridge) 복잡 + 디버깅 어려움 (코드 주석 곳곳에 'L-sec-bridge-remove' 흔적)

### F-10 [LOW] 비밀번호 정책 약함
- `register` 입력 검증: `password: z.string().min(1).max(200)` — 1자도 통과
- signup page client 에서 8자 검사하지만 우회 가능 (직접 API 호출)
- 2026 NIST SP 800-63B-4 권장: **최소 15자**, 비밀번호 차단 리스트 + breach 검사

### F-11 [LOW] 패스키(WebAuthn) / MFA 미적용
- 2026 트렌드: passkey 표준화, OAuth 보강 + 피싱 저항
- 현재 시스템: 비밀번호 + OAuth (kakao/naver/google) 만. MFA, TOTP, passkey 전무
- Supabase Auth: passkey **experimental** (2026 Q2 GA 예정), TOTP/SMS MFA 정식 GA

### F-12 [LOW] OAuth 콜백 후 client-side localStorage 토큰 저장
- `login` page lines 196~239: `localStorage.setItem('ws_token', tok)` + `ws_refresh_token` 까지 저장
- XSS 발생 시 access + refresh 모두 탈취 → 영구 계정 탈취
- 2026 권장: HttpOnly cookie + same-site=Lax, refresh_token 은 절대 localStorage 금지

---

## 3. 2026 최신 인증 표준 — 조사 결과

### Auth.js v5 (구 NextAuth)
- 2024 말 stable. Next.js 14+ 필수. AUTH_* env 표준
- **카카오/네이버 빌트인 provider** 존재 (Auth.js 기본 제공)
- 자동 OAuth 환경변수 추론 (`AUTH_KAKAO_ID`, `AUTH_KAKAO_SECRET`)
- Passkey 는 별도 provider plugin 필요 (커스텀)

### Better Auth v1.0 (2026 신예)
- **Auth.js 메인테이너가 신규 프로젝트는 Better Auth 추천**
- Plugin 구조: OAuth, 2FA, **Passkey 빌트인**, organizations
- 즉시 세션 무효화 (revoke)
- 카카오/네이버는 커스텀 OAuth provider 로 추가 필요

### Supabase Auth (현재 우리 시스템)
- TOTP / SMS MFA 정식 GA — 즉시 적용 가능
- AAL (Authenticator Assurance Levels) JWT claims (aal1, aal2)
- **Passkey 는 experimental** (`auth.experimental.passkey: true` 필요, Q2 2026 GA 예정)

### Passkey / WebAuthn 트렌드
- 비밀번호 폐기 → 디바이스 + 생체 (Face ID, Touch ID, Windows Hello)
- **피싱 저항** (origin-bound) — OAuth 와 보완 관계
- 2026 신규 프로젝트는 passkey 우선 + OAuth 보조 + 비밀번호 fallback 구조 권장

### PIPA 2026 개정 (대한민국 개인정보보호법)
- 2026-03-10 개정, 2026-09-11 시행 (본문 다수 조항)
- 위반 과징금 매출 3% → **10%** 상향 (반복 위반 / 1천만 정보주체 / 시정명령 불응)
- ISMS-P 인증 의무화 (2027-07-01 시행)
- **이용자 회원가입 시 명시적·구분된 동의 필수** (현재 우리 시스템 구현됨: `acceptedTerms`, `acceptedPrivacy`, `acceptedMarketing` + `user_consents` 이력 테이블)
- Marketing 동의 분리는 정보통신망법 + PIPA 동시 충족 — 우리 시스템 OK
- 단 동의 화면 UI 점검 필요 (필수/선택 명확 표기, 거부권 안내)

### 카카오 / 네이버 / 구글 OAuth 2026 현황
- **카카오**: `account_email` scope 가 비즈 앱 인증 후만 활성. 우리 시스템은 우회로 `profile_nickname` 만 받고 합성 이메일 (`kakao_<id>@users.wishes.co.kr`) 사용 — 정확한 처리법
  - 비즈 앱 인증 받으면 `account_email` 추가 가능 (수익화 / 이메일 마케팅 시 권장)
- **네이버**: 이메일 동의 처음부터 가능 (검수만). 현재 시스템 정상 동작
- **구글**: Supabase native OAuth 사용 → admin_users sync 코드 보강 필요 (F-2)

---

## 4. 해결 방안 (단계별)

### Phase A — 즉시 fix (오늘 내 완료 가능, 고위험)

**A-1**: `/admin/users` 사이드바 링크 추가 (F-1)
- `src/app/admin/layout.tsx` navItems 에 `{ href: '/admin/users', label: '회원 관리', icon: '👥' }` 추가
- 사장님 즉시 접근 가능

**A-2**: Google OAuth 가입자 admin_users sync (F-2)
- `src/app/auth/callback/client.tsx` 의 `prepareAdminSession` 흐름에 Google 케이스 admin_users upsert 추가
- 또는 `/api/auth/me` 가 admin_users 없으면 자동 insert (idempotent)
- 누락된 사장님 본인 + gla***@naver.com 즉시 SQL 로 admin_users insert (1회성)

**A-3**: /admin/users UI 분리 + 헤더 변경 (F-7, F-8)
- 헤더: "직원 승인 관리" → "회원 / 직원 관리"
- 필터: provider (전체/카카오/네이버/구글/자체) + role (전체/owner/admin/broker/user) 추가
- Default 필터: 'pending' → 'all'

**A-4**: Naver / Kakao existingUser 분기에 admin_users upsert 추가 (F-5)
- `existingUser` 발견 시에도 `admin_users.upsert` 실행 (idempotent, ON CONFLICT id DO NOTHING)
- gla***@naver.com 같은 케이스 재발 방지

**A-5**: 누락된 admin_users 즉시 SQL 보정
- 사장님 본인 (Google) + gla***@naver.com 두 명 admin_users insert
- INVARIANT 등록: I-AUTH-1 = "auth.users 가입자는 admin_users 와 1:1 동기화"

### Phase B — 1주일 내 (UX + 보안)

**B-1**: 이메일 미인증 vs 관리자 승인 분리 메시지 (F-4)
- `register` 의 `email_confirm: false` → `email_confirm: true` (가입은 즉시 승인하고, admin_users.status 만 'pending')
- 또는 별도 분기로 정확한 메시지

**B-2**: 비밀번호 정책 강화 (F-10)
- `register` Zod schema: `password: z.string().min(15)` (NIST 권장)
- 일반 비밀번호 차단 리스트 (haveibeenpwned API 또는 정적 top-100k)

**B-3**: redirect_uri apex/www 통일 (F-6)
- `next.config.js` redirect: www.wishes.co.kr → wishes.co.kr (또는 반대)
- Kakao/Naver/Google 콘솔 redirect_uri 통일

**B-4**: 토큰 저장 → HttpOnly cookie 전환 (F-12)
- 현재: localStorage.ws_token + ws_refresh_token (XSS 노출)
- 전환: `Set-Cookie: ws_session=...; HttpOnly; Secure; SameSite=Lax`
- 클라이언트 fetch 는 `credentials: 'include'` 자동 첨부

**B-5**: PIPA 동의 화면 UI 점검
- 필수/선택 명확 구분 (현재 OK)
- "거부권" 안내 명시 ("동의 거부 시 회원가입 불가" 문구)
- terms_version / privacy_version 자동 갱신 cron

### Phase C — 4주일 내 (2026 표준 적용)

**C-1**: Supabase MFA (TOTP) 활성화
- 사장님 / 직원(broker, agent) 계정에 TOTP 의무화
- 일반 고객은 옵션
- AAL2 요구되는 경로: /admin/* + 결제

**C-2**: Passkey 도입 (Supabase experimental → Q2 2026 GA 후 전환)
- 자체 회원가입 사용자 대상 우선
- "Touch/Face ID 로 빠르게 로그인" CTA — 비밀번호 점차 폐기

**C-3**: 카카오 비즈 앱 인증 (선택)
- 사장님 사업자 인증으로 카카오 Business 앱 전환
- account_email scope 활성화 → 합성 이메일 (`kakao_*@users.wishes.co.kr`) 폐기 가능
- 마케팅 / 알림톡 가능

**C-4**: 인증 흐름 통합 (F-9)
- `/admin/admin-auth.html` 폐기 → `/login?role=admin` 로 통합
- token bridge 코드 제거 (legacy bridge 코드 약 200 lines)

---

## 5. 사장님 즉시 액션 추천

오늘 내 적용 가능한 가장 큰 효과:

| 우선순위 | 작업 | 예상 시간 | 효과 |
|---|---|---|---|
| 1 | A-1 (사이드바 링크 추가) | 5분 | 사장님 즉시 회원 페이지 접근 |
| 2 | A-5 (누락 2명 SQL insert) | 5분 | 유령 계정 0 |
| 3 | A-3 (UI 분리 + default 필터 변경) | 30분 | 고객 vs 직원 구분 가능 |
| 4 | A-2 (Google sync 코드 fix) | 30분 | 향후 Google 가입자 admin_users 자동 등록 |
| 5 | A-4 (existingUser 분기 fix) | 20분 | 카카오/네이버 재가입 시 누락 0 |

전체 Phase A: 약 **1.5시간**, push + CI 검증 + 보고 포함.

사장님 결정 받고 진행:
- **(1) Phase A 즉시 진행**: 코드 fix + INVARIANT + Playwright 시나리오 동시 push (I-PROC-2)
- **(2) Phase B/C 까지 한 번에**: 약 1주일 분량 (UX + PIPA + 2026 표준)
- **(3) 다른 우선순위**: 사장님 별도 명령

---

## Sources

### 코드 (main HEAD `177ee333`)
- `src/app/admin/users/page.tsx` (직원 승인 관리 페이지)
- `src/app/admin/layout.tsx` line 221-225 (navItems — `/admin/users` 누락)
- `src/app/api/admin/users/route.ts` (auth.users + admin_users 머지)
- `src/app/api/auth/register/route.ts` (PIPA 동의 + admin_users insert)
- `src/app/api/auth/login/route.ts` (Email not confirmed = 'pending' 메시지 충돌)
- `src/app/api/auth/kakao/route.ts` line 176-187 (existingUser 분기 admin_users 누락)
- `src/app/api/auth/naver/route.ts` line 151-163 (existingUser 분기 admin_users 누락)
- `src/app/auth/callback/client.tsx` (Google admin_users sync 부재)
- `src/contexts/AuthContext.tsx` line 65 (signInWithProvider google)
- `src/lib/supabase.ts` (createServerClient = SERVICE_ROLE_KEY → RLS bypass)

### Supabase 직접 SQL (project `xbjgdsyukjdkfvcbzmjc`)
- `auth.users` 15명, provider 분포
- `admin_users` 13명, status/role 분포
- RLS policies (admin_users_no_self_insert WITH CHECK false)
- 누락 2명 (gla***@naver.com, 사장님 Google)

### Prod 라이브 검증
- https://wishes.co.kr/login (HTTP 200)
- https://wishes.co.kr/signup (HTTP 200)
- https://wishes.co.kr/api/auth/me (HTTP 401, 인증 토큰 없음)
- https://wishes.co.kr/api/auth/oauth-start/kakao → kauth.kakao.com 302 (redirect_uri www)
- https://wishes.co.kr/api/auth/oauth-start/google → 400 Unsupported provider

### 2026 표준 조사
- [Supabase Auth — Multi-Factor Authentication](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase Passkey Discussion #8677](https://github.com/orgs/supabase/discussions/8677) (Q2 2026 GA 예정)
- [Auth.js v5 with Next.js 16 — 2026 Guide](https://dev.to/huangyongshan46a11y/authjs-v5-with-nextjs-16-the-complete-authentication-guide-2026-2lg)
- [Best Next.js Auth Solutions 2026 — Better Auth 추천](https://blog.logrocket.com/best-auth-library-nextjs-2026/)
- [Better Auth v1.0 SaaS Showdown 2026](https://starterpick.com/blog/better-auth-clerk-nextauth-saas-showdown-2026)
- [Auth.js Kakao provider](https://authjs.dev/getting-started/providers/kakao)
- [Auth.js Naver provider](https://authjs.dev/reference/core/providers/naver)
- [Korea PIPA 2026 Compliance — Cross-Border + New Duties](https://www.koreabusinesshub.kr/blog/pipa-compliance-cross-border-data-2026)
- [South Korea PIPA 2026 — pureumlawoffice](https://pureumlawoffice.com/personal-information-protection-act-pipa/)
- [Kakao OAuth account_email scope 비즈 앱 (Issue #36878)](https://github.com/supabase/supabase/issues/36878)

작성: 2026-05-03 KST
검증자: Claude (사장님 명령)
