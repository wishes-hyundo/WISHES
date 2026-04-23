# C-2 Auth Migration — Phase 3c Roadmap

**Status:** Planned (not yet started)
**Target deadline:** 2026-05-23 (30 days from Phase 3b completion)
**Owner:** TBD
**Dependencies:** Phase 3b complete (L-sec147 ~ L-sec150, shipped 2026-04-23)

---

## 목표

`sessionStorage('ws_token')` + legacy Bearer fallback 경로를 완전히 제거해
admin 인증을 **HttpOnly cookie(ws_session) + CSRF(ws_csrf) 단일 모델**로
통일한다.

## 왜 지금 당장 못 하는가

Phase 3c 는 1-line 수정이 아니다. `ws_token` 은 **6개 파일에 걸쳐** 인증
게이트 + 세션 부트스트랩 역할을 함께 수행 중이므로, 제거하려면:

1. 클라이언트 인증 게이트(admin/layout.tsx:42, :218, :253) 를 쿠키-기반
   `/api/auth/me` 엔드포인트로 교체
2. `/login/page.tsx` 의 ws_token 쓰기 3곳 제거 + 쿠키 직발급 경로 통합
3. `/search/page.tsx` 의 ws_token/localStorage 마이그레이션 로직 제거
4. adminFetch Bearer fallback 제거
5. 회귀 테스트: 마스터 패스워드 로그인, Supabase JWT 로그인, 크롤러 브리지
   (3가지 인증 경로 각각)

각 경로가 서로 다른 토큰 타입(JWT, 마스터 패스워드, admin_bridge_)을 다루므로
테스트 하네스 없이 건드리면 관리자 로그인 자체가 무너질 위험.

## 실행 단계 (별도 PR 권장)

### Step 1 — `/api/auth/me` 엔드포인트 신설
- 입력: `ws_session` 쿠키 (HttpOnly, JWT)
- 출력: `{ email, role, status, loginTime }` 또는 401
- 기존 `verifyAdminAuthStrict()` 재사용
- 신규 파일: `src/app/api/auth/me/route.ts`

### Step 2 — 클라이언트 인증 게이트 전환
- `admin/layout.tsx` checkAuth() 를 `/api/auth/me` 호출로 교체
- `ws_token` / `ws_user` / `ws_login_time` sessionStorage 의존 제거
- `handleCommandCenter()` / `handleDeleteAccount()` 도 cookie 기반으로

### Step 3 — 로그인 경로 정리
- `login/page.tsx`:
  - `sessionStorage.setItem('ws_token', ...)` 3곳 제거
  - `localStorage.setItem('ws_token', ...)` 3곳 제거
  - 대신 `/api/auth/cookie-issue` 직접 호출로 쿠키만 발급
- `search/page.tsx`: ws_token migration 로직 제거 (cookie 가 있으면 통과)

### Step 4 — adminFetch Bearer 제거
- `src/lib/adminFetch.ts:53-57` Bearer 첨부 코드 삭제
- `credentials: 'include'` + `X-CSRF-Token` 만 유지

### Step 5 — 서버측 Bearer 수용 유지 결정
- **Option A (권장):** 서버는 당분간 Bearer 도 수용 (크롤러 스크립트 호환)
- **Option B:** `verifyAdminAuth()` 에서 Bearer 경로 아예 제거 — 크롤러가
  부서지므로 `onhouse_crawl_gh.py` 를 쿠키 기반으로 먼저 마이그레이션 필요

### Step 6 — 회귀 테스트
- `vitest` 3종:
  - 마스터 패스워드 로그인 → 쿠키 발급 → admin API 200
  - Supabase JWT 로그인 → 쿠키 발급 → admin API 200
  - 크롤러 브리지 토큰 → 크롤러 엔드포인트 200 (Bearer 유지 시)
- 수동: Chrome DevTools 에서 sessionStorage 비우고 admin 페이지 새로고침 →
  `/admin/admin-auth.html` 로 리다이렉트 확인

### Step 7 — Rollback 플랜
- 문제 발생 시 `git revert` 로 Phase 3c 단일 PR 되돌리면 즉시 복구
- 쿠키는 그대로 유효 → 사용자 재로그인 불필요

## 보안 이득 (Phase 3c 완료 후)

| 공격 경로 | Phase 3b 현재 | Phase 3c 이후 |
|---|---|---|
| XSS → sessionStorage 탈취 | `ws_token` JWT 탈취 가능 → Bearer 로 admin API 호출 | 쿠키는 HttpOnly → JS 접근 불가 |
| CSRF | cookie-based 세션은 차단, Bearer 는 soft-check | Bearer 경로 자체 없음 → 완전 차단 |
| 세션 만료 | sessionStorage 타임스탬프 비교 (조작 가능) | 서버측 쿠키 max-age 로만 결정 |

## 완료 기준 (Definition of Done)

- [ ] `grep -rn "ws_token" src/` 0건
- [ ] adminFetch.ts 에 `Authorization` 헤더 설정 없음
- [ ] `/api/auth/me` 200 응답 확인 (쿠키 존재 시)
- [ ] 모든 회귀 테스트 통과
- [ ] 프로덕션 배포 24시간 모니터링 — 401 에러율 기준선 이내

## Rollback 조건

다음 지표 중 하나라도 충족 시 즉시 revert:
- admin 경로 401 에러율 > 5% (baseline: 0.1%)
- `/api/auth/me` p95 latency > 500ms
- Sentry `CSRF token verification failed` 1시간 내 > 100건

---

## 참고

- Phase 3a (L-sec145): adminFetch wrapper 신설
- Phase 3b (L-sec147): 클라이언트 전환 + 미들웨어 hard-enforce
- Phase 3c (본 문서): Bearer fallback + ws_token 제거

관련 커밋: `5c7f00c1`, `a886144b`, `fc532395`, `6871f6b2`, `93d5e64`
보안 리뷰: `docs/L-sec-review-phase3-2026-04-23.md`
