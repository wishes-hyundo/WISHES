# 2026-04-21 어드민 / 마이페이지 세션·인가 전수 감사 (#101)

## TL;DR (요약)
현 어드민 경계는 **공개 저장소에 마스터 패스워드가 박제된** 상태로 운영 중이며,
`verifyAdminAuth()` 가 **JWT 서명 검증 없이** "eyJ 로 시작하고 점 2개짜리 3-파트"
문자열이면 전부 통과시키는 우회 버그가 있다. 별도 차단이 없는 한
누구든 `Bearer admin_bridge_xxx` 또는 `Bearer wishes2026` 만 들고 와도
모든 `/api/admin/*` 엔드포인트를 호출할 수 있다.

즉시 복구 P0 와 점진 복구 P1/P2 로 나눠 처리한다.

---

## 조사 범위
- `src/middleware.ts` — 라우트 진입 보호
- `src/lib/adminAuth.ts` — 어드민 API 공용 검증기
- `src/app/admin/**/page.tsx` — 어드민 UI 10개 페이지 인증 루트
- `src/app/mypage/page.tsx` — 고객 마이페이지 세션 루트
- `src/app/api/admin/**/route.ts` — 40+ 어드민 API 라우트
- `src/contexts/AuthContext` / `createAuthClient` — 클라이언트 세션 유틸

---

## 치명적 결함 (P0 — 즉시 수정)

### P0-1 : 마스터 패스워드 `wishes2026` 소스 박제
- `src/lib/adminAuth.ts:16` — `const MASTER_PASSWORD = 'wishes2026';`
- `src/app/search/page.tsx:88` — 클라이언트 JS 에 헤더로 직접 박제
- `src/app/admin/listings/page.tsx` 6곳 — 모두 `Bearer wishes2026`
- `src/app/admin/listings/[id]/edit/page.tsx` 9곳 — 동일
- `src/app/admin/dedup/page.tsx:279` — 동일

공개 GitHub 저장소에 올라간 순간 만인 공유 상태가 된다. `git log` 만
돌려도 이 문자열로 바로 어드민 권한이 주어진다.

**수정 플랜**
1. `WISHES_ADMIN_MASTER_PASSWORD` 환경변수 신설 (Vercel Production + Preview)
2. `adminAuth.ts` 는 env 우선, 개발 환경에서만 레거시 `wishes2026` 허용
3. 클라이언트 박제된 `wishes2026` 는 `useAuth()` 가 주는 JWT 사용으로 교체
   (고객 어드민 세션 통합)
4. 한 번 환경변수로 이전되면 `wishes2026` 문자열을 소스에서 전부 제거

### P0-2 : `verifyAdminAuth()` JWT 우회
```ts
if (token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40) {
  return true;
}
```
- `eyJ` 로 시작하는 모든 문자열이 통과. 서명 검증 0.
- Supabase anon key (`eyJhbGci...`) 도 JWT 형식이므로 통과.
- 고객 계정의 access_token 도 어드민으로 판정되어 role/status 무시.
- `token.startsWith('admin_bridge_')` 는 더 심각 — 문자열 시작만 보고 통과.

**수정 플랜**
1. `verifyAdminAuthStrict()` 신설 (async)
   - `supabase.auth.getUser(token)` 으로 실제 서명 검증
   - `admin_users.role ∈ ('superadmin','admin','agent')`
   - `admin_users.status = 'approved'`
2. 변이성 엔드포인트부터 순차 전환
   - `/api/admin/listings-bulk-delete` (P0)
   - `/api/admin/listings-field-update` (P0)
   - `/api/admin/migrate` · `/api/admin/db-migrate` · `/api/admin/apply-map-migration` (P0)
   - `/api/admin/dedup/hide` · `/restore` · `/cleanup` (P0)
   - `/api/admin/upload` · `/upload-video` · `/migrate-to-r2` (P1)
   - `/api/admin/users` (P0 — 계정 승인/반려를 한다)
   - 조회성 엔드포인트 (`/stats`, `/briefing`, `/subscribers`) (P1)
3. 기존 `verifyAdminAuth()` 는 전환 완료 후 제거

### P0-3 : `admin_bridge_*` 토큰 자유 통과
- 문자열 접두사만 체크해 누구나 생성 가능.
- 크롤러 용도라면 **별도 서버 비밀 + HMAC 서명**으로 바꿔야 함.
- 즉시 수정: `WISHES_CRAWLER_BRIDGE_TOKEN` env 와 등치 비교, 아니면 거부.

---

## 구조적 결함 (P1)

### P1-1 : `middleware.ts` 가 `/admin/*` 를 보호하지 않는다
```ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|og-image.png).*)'],
};
```
보안 헤더(X-Frame-Options, CSP 등)만 붙이고 세션 확인은 0.
`/admin/listings` 같은 UI 는 인증 없이도 HTML 렌더링 가능
(데이터는 404/401 이지만 폼 자체는 열린다).

**수정 플랜**
- `/admin/*` 에 한해 미들웨어에서 Supabase 세션 쿠키 확인
- 미인증 시 `/login?next=/admin/...` 리다이렉트
- 단, 현재는 admin 페이지 자체에서 `/api/auth/me` 로 체크하고 있어
  즉시 크래시는 아님. P1 로 분류.

### P1-2 : `localStorage['admin_password']` 패턴
- `src/app/admin/page.tsx:140` — 비밀번호를 LocalStorage 에 평문 저장
- XSS 한 번으로 전체 어드민 토큰 탈취 가능
- 서드파티 스크립트/CDN 침해 시 전원 털림

**수정 플랜**
- Supabase 세션 (`useAuth()`) 으로 통일 → 자동으로 httpOnly 쿠키 적용
- 이미 `src/app/admin/users/page.tsx` 는 `createAuthClient()` 로 전환되어
  있으므로 이 패턴을 나머지 admin 페이지에도 일괄 적용

### P1-3 : `NEXT_PUBLIC_AUTH_TOKEN` 폴백
```ts
const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'wishes2026';
```
- `NEXT_PUBLIC_*` 는 클라이언트 번들에 포함되는 env. Vercel 에 제대로
  세팅하더라도 **브라우저 JS 에 그대로 노출**된다.
- 존재 자체가 사용자 세션 인증 안 쓰겠다는 증거.

**수정 플랜**
- 이 env 제거. 모든 호출을 `Authorization: Bearer ${session.access_token}` 로 교체.

---

## 정상 패턴 (참고용)

- `src/app/mypage/page.tsx` — `useAuth()` 로 세션 체크 + 미인증 시 redirect
- `src/app/admin/users/page.tsx` — `createAuthClient().auth.getSession()`
- `src/app/api/auth/me/route.ts` — `supabase.auth.getUser(token)` 로 실 검증

위 세 지점은 이미 올바른 패턴이므로, 나머지 admin UI 페이지 + 어드민
API 라우트를 이 패턴으로 단계적 통일한다.

---

## 즉시 적용 (이번 커밋)
1. `adminAuth.ts` 개선
   - `MASTER_PASSWORD` env 기반 전환 + 기본값 제거
   - `admin_bridge_` 접두사 → `WISHES_CRAWLER_BRIDGE_TOKEN` 등치
   - `verifyAdminAuthStrict()` 추가 (async, JWT 서명 검증 + role/status)
2. 문서화 (이 파일)
3. 후속 PR 을 위한 체크리스트 작성

## 후속 PR 체크리스트 (마이그레이션 순서)
- [ ] 변이성 엔드포인트 10개 → `verifyAdminAuthStrict` 전환
- [ ] 조회성 엔드포인트 10개 → `verifyAdminAuthStrict` 전환
- [ ] 클라이언트 `wishes2026` 박제 제거 — `useAuth()` 로 교체
- [ ] `NEXT_PUBLIC_AUTH_TOKEN` 제거 + Vercel env 정리
- [ ] `localStorage['admin_password']` 패턴 삭제
- [ ] `/admin/*` 미들웨어 세션 가드 추가
- [ ] `admin_users` 승인 흐름 → role 기반 세밀 권한
  (superadmin/admin/agent/viewer)

## 모니터링
- Vercel 로그에서 `authorization: Bearer wishes2026` 호출 빈도 집계 →
  전환 완료 시 0 이 되어야 함.
- Supabase audit log 에서 `admin_users.role != superadmin` 인
  `eyJ` 토큰으로 어드민 API 호출되는 건 0 이어야 함.
