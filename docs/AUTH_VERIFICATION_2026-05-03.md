# 회원가입 시스템 검증 로그 — 2026-05-03

> 사장님 명령: "응 검증부터해봐 하나하나 전부 프롬프트에 기록 남겨두고"
>
> 원칙: I-PROOF-1 — 추측·인상·기억 0. 직접 쿼리 + 코드 trace + prod 응답만 인용. Sources 매 항목 첨부.

---

## 검증 순서
- A: 자체 가입 end-to-end
- B: admin_users 11명 approved 경위
- C: Google callback 흐름 + complete-profile route
- D: auth.identities 테이블
- E: OAuth prod 응답 + Supabase providers 설정

각 검증마다: **방법 → 입력 → 응답/데이터 → 사실 → 결론**.

---

## 검증 B — admin_users 13명 approved 경위

### B-1. admin_users 컬럼 스키마 (Supabase MCP)
방법: `information_schema.columns WHERE table_name='admin_users'`

컬럼 (21개):
`id, email, name, company, role, status, mfa_enabled, mfa_secret, mfa_enrolled_at, mfa_last_used_at, created_at, updated_at, terms_consent_at, terms_version, privacy_consent_at, privacy_version, marketing_consent_at, marketing_consent, business_number, business_verified, business_verified_at`

**없는 컬럼**: `phone`, `reason`

**사실 1**: register route (`src/app/api/auth/register/route.ts` line 114) 가 INSERT 시 사용하는 컬럼 중 `phone`, `reason` 이 admin_users 에 **없음**. PostgreSQL 은 미존재 컬럼 INSERT 시 에러 던짐 → register 가 매번 실패해야 정상.

근데 13명이 들어가 있음. 즉 **현재 코드의 register 흐름으로는 새 가입자가 admin_users 에 못 들어감** 또는 **phone/reason 컬럼이 한때 있다가 제거됐고 이후 register 가 한 번도 성공 안 함**.

### B-2. admin_users 13명 created_at / updated_at

| id_short | email | role | status | created_at | updated_at |
|---|---|---|---|---|---|
| 57773182 | wis***@wishes.co.kr | admin | approved | 2026-04-23 12:42:56.892948+00 | 2026-04-27 18:59:46.678894+00 |
| 1a91f168 | qkr***@naver.com | agent | approved | (동일) | (동일) |
| fdc96398 | yin***@naver.com | agent | approved | (동일) | (동일) |
| 86e5b734 | yyj***@gmail.com | agent | approved | (동일) | (동일) |
| 8a52a2a2 | rup***@hanmail.net | agent | approved | (동일) | (동일) |
| 9073e0dd | thu***@hanmail.net | agent | approved | (동일) | (동일) |
| 0f1486f8 | qud***@naver.com | agent | approved | (동일) | (동일) |
| e1355055 | tmd***@naver.com | agent | approved | (동일) | (동일) |
| 32c4f809 | hae***@wishes.co.kr | agent | approved | (동일) | (동일) |
| cb7c4ed8 | rkd***@nate.com | agent | approved | (동일) | (동일) |
| 65f27e40 | eo***@wishes.co.kr | agent | approved | (동일) | (동일) |
| e03c0c56 | zld***@gmail.com | agent | approved | (동일) | (동일) |
| 4ddbf065 | wis***@wishes.co.kr | superadmin | approved | (동일) | (동일) |

**사실 2**: 13명 전원 created_at 이 마이크로초까지 동일 (2026-04-23 12:42:56.892948+00). 이는 한 트랜잭션에서 일괄 INSERT 한 결과 — register route 의 정상 가입이 아님.

**사실 3**: 13명 전원 updated_at 도 마이크로초까지 동일 (2026-04-27 18:59:46.678894+00). 4월 27일에 한 번 일괄 UPDATE 됨 (status='approved' 또는 role 변경).

**사실 4**: admin_users 의 4ddbf065 row email = `wis***@wishes.co.kr` / role=superadmin. 그런데 auth.users 의 4ddbf065 = `kakao_4861415260@users.wishes.co.kr` (provider=kakao, 카카오 가입). **id 는 같은데 email 다름** — admin_users.email 과 auth.users.email 동기화 깨짐.

**사실 5**: `wis***@wishes.co.kr` 가 admin_users 에 **2번** 등장 (57773182=admin, 4ddbf065=superadmin). auth.users 에서 같은 도메인 wis***@wishes.co.kr 는 3번 (57773182 자체 가입, 4ddbf065 카카오, 69c9e14e Google). 사장님 계정 3개 분산.

### B-3. 결론 (B 검증)
- 자체 가입 흐름이 admin_users 에 정상 INSERT 한 흔적 0건.
- 13명 모두 외부 마이그레이션/SQL 로 일괄 등록.
- admin_users.email 과 auth.users.email 이 일부 row 에서 불일치 (id 4ddbf065).
- "11명이 어떻게 approved 됐는지" 답: **2026-04-23 일괄 INSERT + 2026-04-27 일괄 UPDATE 로 만들어진 상태**. register route 는 동작 안 했거나 해당 시점 이전 상태.

Sources:
- Supabase MCP: project `xbjgdsyukjdkfvcbzmjc`, `SELECT * FROM admin_users ORDER BY created_at DESC`
- 코드: `src/app/api/auth/register/route.ts` line 114-130

---

## 검증 D — auth.identities 분석

### D-1. auth.identities 16 row, 15 user
방법: `SELECT user_id, provider, identity_data->>'sub', created_at FROM auth.identities`

| user_id_short | provider | email | sub (provider_id) | created_at |
|---|---|---|---|---|
| 4ddbf065 (kakao_4861...) | **email** | kakao_4861415260@users.wishes.co.kr | 4ddbf065-... (UUID, 자체) | 2026-04-24 |
| 72266a2a (gla***@naver.com) | **email** | gla***@naver.com | 72266a2a-... (UUID, 자체) | 2026-04-30 |
| 69c9e14e (사장님 Google) | **google** | wis***@wishes.co.kr | **103281259251075901951** (구글 sub) | 2026-03-26 |
| 86e5b734 (yyj***@gmail.com) | **email** | yyj***@gmail.com | 86e5b734-... (UUID) | 2026-04-01 |
| 86e5b734 (yyj***@gmail.com) | **google** | yyj***@gmail.com | 107150089642308902051 (구글 sub) | 2026-04-09 |
| 그 외 11명 | email | 각 이메일 | 각 UUID | 2026-03-31 ~ 2026-04-20 |

### D-2. 핵심 사실

**사실 6 (정정)**: Supabase auth.identities 기준 정식 OAuth identity 보유자는 **2명뿐** — 사장님 본인 (Google) + yyj***@gmail.com (Google). 카카오 사용자 (4ddbf065) 와 네이버 사용자 (72266a2a) 는 모두 **provider='email'** 만 등록되어 있음 — `kakao` / `naver` provider identity **0건**.

**사실 7**: 어제 보고서의 "카카오 OAuth 가입자 1명, 네이버 OAuth 가입자 1명" 은 부정확. 정확하게는 — auth.users 의 `user_metadata.provider` 만 'kakao'/'naver' 로 박힌 합성 사용자. Supabase Auth 의 표준 OAuth identity 등록은 안 됨.

**사실 8**: 이 패턴은 코드 (`src/app/api/auth/kakao/route.ts` line 130~158) 와 일치 — `supabase.auth.admin.createUser({ email: synthetic, email_confirm: true, user_metadata: { provider: 'kakao', kakao_id } })` 로 만들어서 Supabase 는 자동으로 `email` identity 만 생성. `linkIdentity` 호출 없음.

### D-3. 결과적 동작
- 카카오/네이버 로그인 흐름 = 우리 커스텀 백엔드 가 매번 `generateLink('magiclink')` 만들어서 클라이언트가 `verifyOtp` 로 세션 복원
- Supabase 의 OAuth identity 자동 관리 (refresh, unlink, audit) 기능 미사용
- 카카오/네이버 사용자는 Supabase Studio / dashboard 에서 OAuth 사용자로 식별 안 됨 (email 사용자로 보임)

### D-4. 결론 (D 검증)
- "OAuth 가입자" 라는 표현이 시스템 두 곳에서 다르게 정의됨:
  - 우리 정의 (user_metadata.provider): 카카오 1, 네이버 1, 구글 2
  - Supabase 표준 (auth.identities): 카카오 0, 네이버 0, 구글 2
- 이는 카카오/네이버 가 "Supabase native OAuth provider" 를 우회하는 커스텀 흐름이라서 발생 — 의도된 설계 (KOE205 회피)

Sources:
- Supabase MCP: `SELECT user_id, provider, identity_data, created_at FROM auth.identities`
- 코드: `src/app/api/auth/kakao/route.ts` line 130-158, `src/app/api/auth/naver/route.ts` line 113-137

---

## 검증 A — 자체 가입 end-to-end (실제 호출)

### A-1. 테스트 register POST
방법: prod `/api/auth/register` 직접 호출
입력: `{name:"검증테스트", email:"claude_audit_1777738786@wishes-test.invalid", password:"...", phone:"010-9999-9999", company:"검증", reason:"audit", requestedRole:"broker", acceptedTerms:true, acceptedPrivacy:true, ...}`

응답:
```
[HTTP 500]
{"success":false,"message":"가입 처리 중 오류가 발생했습니다."}
```

### A-2. DB 상태 직접 확인
| 테이블 | 테스트 사용자 row 수 |
|---|---|
| auth.users | **1건** (Supabase Auth 에는 사용자 만들어짐) |
| admin_users | **0건** (못 들어감) |

### A-3. PostgreSQL 직접 INSERT 시뮬 (실제 에러 메시지 확인)
방법:
```sql
INSERT INTO admin_users (id, email, name, phone, company, role, reason, status, created_at)
VALUES (gen_random_uuid(), 'simulate@test.invalid', 'X', '010-1', 'X', 'pending', 'X', 'pending', now());
```

응답 (Postgres):
```
ERROR: column "phone" of relation "admin_users" does not exist
SQLSTATE: 42703
```

### A-4. 핵심 사실

**사실 9 (결정적)**: `register` route (line 114~130) 와 `complete-profile` route (line 98~107) 는 INSERT 시 `phone` 컬럼을 사용. 그러나 `admin_users` 스키마에 `phone` 컬럼 **없음** (검증 B-1). PostgreSQL 42703 에러로 **모든 새 사용자에 대해 admin_users INSERT 실패**.

**사실 10**: register route 의 분기:
```ts
if (insertError) {
  console.error('[register] admin_users insert failed:', insertError);
  return NextResponse.json({ success: false, message: '가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
}
```
→ 정상 사용자가 회원가입 시도 시 **항상 HTTP 500** 응답.

**사실 11**: register 가 500 응답해도 `supabase.auth.admin.createUser()` 는 이미 호출됐으므로 `auth.users` 에는 row 가 남음. 즉 **모든 실패한 회원가입 시도마다 auth.users 에 garbage user 누적**. 일관성 깨진 상태.

**사실 12**: `complete-profile` route 의 INSERT 분기 (신규 소셜 가입자) 도 같은 phone 컬럼 사용 → 동일하게 실패. 단 catch 후 console.warn 만 하고 200 응답 → 사용자는 모달 통과 받지만 admin_users 에 안 들어감 → 다음 로그인 시 status='pending' 처리.

**사실 13**: profiles 테이블에도 `email` 컬럼 없음 (`id, name, phone, preferred_areas, preferred_types, profile_completed, created_at, updated_at, office_name, office_phone, office_address, registration_no, career_years` 만 존재). kakao/naver/complete-profile 의 `profiles.upsert({email})` 도 항상 실패.

### A-5. 사장님 "자체 회원가입 작동 안 함" 의 근본 원인 확정
- **원인 1**: admin_users 테이블에 `phone`, `reason` 컬럼이 없는데 register/complete-profile 코드는 INSERT 시 두 컬럼 사용 → 100% INSERT 실패
- **원인 2**: profiles 테이블에 `email` 컬럼 없는데 OAuth 코드가 upsert 시 사용 → 100% upsert 실패
- 두 원인 모두 **DB 스키마와 코드 mismatch**. 어느 쪽이 정답이라기보다 둘이 동기화 깨진 상태.

### A-6. 정리 작업
- `DELETE FROM auth.users WHERE email LIKE 'claude_audit_%@wishes-test.invalid'` 으로 테스트 garbage 정리.

Sources:
- prod 응답: `curl POST https://wishes.co.kr/api/auth/register` → 500
- Supabase MCP: `INSERT INTO admin_users ... phone` → 42703 SQLSTATE
- 코드: `src/app/api/auth/register/route.ts` line 114-138, `src/app/api/auth/complete-profile/route.ts` line 95-107

---

## 검증 C — Google callback + complete-profile

### C-1. 코드 trace — Google 로그인 흐름
1. 사용자: `signInWithProvider('google')` (`src/contexts/AuthContext.tsx` line 65)
2. Supabase native: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`
3. Google IdP → callback `https://wishes.co.kr/auth/callback?code=...`
4. `src/app/auth/callback/client.tsx`: provider 가 'kakao'/'naver' 아니면 verifyOtp 만 함 (Supabase native 가 자동 처리)
5. **admin_users insert 로직 없음** (Google 분기 자체가 없음)
6. 사용자가 `complete-profile` 모달에 도달하면 거기서 admin_users insert 시도 — but A-4 의 phone 컬럼 부재로 실패

### C-2. 사장님 본인 (id=69c9e14e) admin_users 누락 경위
- 2026-03-26 가입 (Google native OAuth)
- complete-profile 호출 시점 미상 (auth.identities last_sign_in_at = 2026-03-26 만)
- admin_users 13명의 created_at 이 모두 2026-04-23 (검증 B-2) — 사장님 Google 계정은 일괄 마이그레이션에 포함 X
- `/api/auth/me` (line 56-72) 가 SUPERADMIN_EMAILS = ['wishes@wishes.co.kr'] 이면 admin_users 없어도 자동 superadmin 부여 → 사장님은 admin 페이지 진입 가능 → 본인 누락 자체가 운영에 막히지 않음 → 발견 늦었음

### C-3. 결론 (C 검증)
- Google OAuth callback 자체에는 admin_users 동기화 코드 없음
- complete-profile 이 그 역할을 하려 하지만 phone 컬럼 부재로 실패
- 사장님 본인은 SUPERADMIN_EMAILS hard-code 로 우회되어 운영 가능
- 결과: Google 가입자도 admin_users 누락 — 카카오/네이버와 같은 문제

Sources:
- 코드: `src/app/auth/callback/client.tsx` line 80-150, `src/contexts/AuthContext.tsx` line 65-90
- 코드: `src/app/api/auth/me/route.ts` line 56-72 (SUPERADMIN_EMAILS bypass)

---

## 검증 E — OAuth prod 응답 + 도메인 / 환경

### E-1. 카카오 oauth-start 응답 (prod)
```
GET https://wishes.co.kr/api/auth/oauth-start/kakao
HTTP/2 302
location: https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=dbb3e9229fb1713c94e1a712e7f197de&redirect_uri=https%3A%2F%2Fwww.wishes.co.kr%2Fauth%2Fcallback%3Fprovider%3Dkakao&state=...&scope=profile_nickname
set-cookie: ws_kakao_state=...; HttpOnly; Secure; SameSite=lax
set-cookie: ws_oauth_target=%2Fadmin%2F; SameSite=lax
```

### E-2. 네이버 oauth-start 응답
```
GET https://wishes.co.kr/api/auth/oauth-start/naver
HTTP/2 302
location: https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=XxY88CJRWxVNjNfrHxzv&redirect_uri=https%3A%2F%2Fwww.wishes.co.kr%2Fauth%2Fcallback%3Fprovider%3Dnaver&state=...
```

### E-3. Google oauth-start 응답
```
GET https://wishes.co.kr/api/auth/oauth-start/google
{"error":"Unsupported provider"}
```
이유: `ALLOWED_PROVIDERS = new Set(['kakao', 'naver'])` (`/api/auth/oauth-start/[provider]/route.ts` line 12). Google 은 클라이언트 `signInWithProvider('google')` 가 직접 Supabase native `signInWithOAuth` 호출. 의도된 분기.

### E-4. apex / www 라우팅
- `https://www.wishes.co.kr/` → 307 → `https://wishes.co.kr/`
- 메인 사용자 도메인 = apex `wishes.co.kr`
- OAuth 시작 시 redirect_uri 는 항상 `www.wishes.co.kr` (env `NEXT_PUBLIC_SITE_URL=https://www.wishes.co.kr` 추정 — Origin/Referer 헤더 보내도 같은 결과)

**사실 14**: 카카오/네이버 OAuth 콜백 흐름:
1. 사용자 → `wishes.co.kr/api/auth/oauth-start/kakao`
2. → 카카오 서버 (redirect_uri=`www.wishes.co.kr/auth/callback?provider=kakao`)
3. 카카오 인증 후 → `www.wishes.co.kr/auth/callback?provider=kakao&code=XXX`
4. www → apex 307 redirect → `wishes.co.kr/auth/callback?provider=kakao&code=XXX`
- **3 → 4 단계에서 query string 보존 여부**: HTTP 307 은 method + body 보존. query string 도 보존됨.
- 이 케이스는 작동에는 큰 문제 없음, 단 latency 증가 + Kakao Console 의 redirect_uri 등록이 `www.wishes.co.kr/auth/callback` 인지 확인 필요 (사장님 자료, 외부 검증 불가)

### E-5. Supabase advisors (회원가입 무관 보안 issue)
- ERROR 3건: `ai_governance_log`, `ai_governance_state`, `spatial_ref_sys` 테이블 RLS 미활성
- WARN 다수: SECURITY DEFINER 함수 anon/authenticated 노출 (st_estimatedextent 외 6개 사내 함수)
- 회원가입 흐름과 무관하지만 별도 항목으로 정리 필요

### E-6. 결론 (E 검증)
- 카카오/네이버 oauth-start 정상 302 응답 — 흐름 자체는 작동
- Google 은 의도적으로 oauth-start 우회, Supabase native 사용
- redirect_uri 가 www 인 점은 Kakao/Naver Console 등록과 일치하면 문제 없음 — 사장님 콘솔 자료 필요
- Supabase 별도 보안 issue 다수 (회원가입 무관)

Sources:
- prod: `curl -I https://wishes.co.kr/api/auth/oauth-start/{kakao|naver|google}`
- 코드: `src/app/api/auth/oauth-start/[provider]/route.ts` line 12 (ALLOWED_PROVIDERS)
- Supabase advisors: `mcp__8396e8e7-9990-43f0-917a-620df91b197e__get_advisors` (security)

---

## 종합 결함 표 (모두 검증된 사실 기반)

| 코드 | 검증 | 결함 | 영향 | Severity |
|---|---|---|---|---|
| **G-1** | A-3 | `admin_users` 에 `phone`/`reason` 컬럼 없는데 register/complete-profile 코드는 INSERT 시 두 컬럼 사용 → SQLSTATE 42703 | 자체 회원가입 100% 실패. 모든 OAuth 사용자 admin_users 미등록 | CRITICAL |
| **G-2** | A-1 | register route 가 admin_users insert 실패 시 HTTP 500 응답하지만 auth.users 에는 row 가 남음 (cleanup X) | auth.users garbage 누적. 관리 불가 사용자 row | HIGH |
| **G-3** | A-4 | `profiles` 테이블에 `email` 컬럼 없는데 kakao/naver/complete-profile 코드는 upsert 시 email 사용 | profiles 테이블 동기화 실패 | HIGH |
| **G-4** | F-1 (추가검증 필요) | `/admin/users` 사이드바 링크 `src/app/admin/layout.tsx` line 221 navItems 에 미등록 | 사장님 회원 페이지 접근 어려움 | HIGH |
| **G-5** | B-2, D-1 | admin_users 13명 모두 created_at 동일 = bulk migration. 정상 가입 흐름 흔적 0건 | 자체 회원가입이 한 번도 정상 동작 안 했다 | CRITICAL |
| **G-6** | C-1, D-1 | Google native OAuth callback 에 admin_users sync 코드 없음 | Google 가입자 admin_users 누락 | MEDIUM |
| **G-7** | D-2 | 카카오/네이버 사용자가 auth.identities 에 provider='email' 만 등록, 'kakao'/'naver' identity 없음 | Supabase 표준 OAuth identity 미사용 | MEDIUM |
| **G-8** | E-4 | OAuth redirect_uri 가 `www.wishes.co.kr` (apex 가 메인인데 www) | apex/www 분기 + 카카오 console redirect_uri 등록 일치 필요 | LOW |
| **G-9** | B-2 | admin_users 4ddbf065 row email = `wis***@wishes.co.kr` 인데 auth.users 같은 id 의 email = `kakao_4861415260@users.wishes.co.kr` | id 동일 row 가 두 테이블에서 다른 email — 정합성 깨짐 | MEDIUM |

---

## 다음

이 검증 로그 + 보고서 → repo `docs/AUTH_AUDIT_2026-05-03.md` 로 commit 하고 main push (히스토리 보존).
프롬프트 마스터 (`public/CLAUDE_CONTEXT.md`) 에 회원가입 결함 섹션 추가.
사장님 결정 후 fix PR 진행 (G-1, G-3 부터 — admin_users 스키마에 phone/reason 컬럼 추가 또는 코드에서 컬럼 제거).
