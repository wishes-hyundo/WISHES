# L-scan32 — Fresh security audit sweep (post b6204f3 → 9ce2d93)

_Owner: 보안 / Date: 2026-04-23 / Status: draft_

## 감사 범위

직전 세션에서 추가된 3개 커밋의 레거시/회귀 리스크 점검.

- b6204f3 L-observe1 — Sentry/OTel (※ 이후 e5c9195 에서 revert 됨, 본 감사에선 제외)
- 0c2ae10 L-mfa1 — Admin TOTP + recovery
- 9ce2d93 L-rls1 Phase 1 — RLS shadow + createUserClient

## 감사 결과 요약

| 항목 | 상태 | 비고 |
|---|---|---|
| MFA 5 routes rate-limit 커버리지 | ✅ | 5/5 라우트 checkRateLimit 적용 |
| MFA `error.message` prod 누출 | ✅ | production→'internal', dev→원문 가드 일관 |
| MFA `any` 타입 | ✅ | 신규 파일 0건 |
| RLS shadow policy 작동 호환성 | ✅ | service_role bypass 유지, anon/authenticated 는 USING(true) |
| user_metadata role trust (/api/auth/*) | ✅ | L-sec59/60 회귀 없음 |
| admin/users 리스트 display 필드 | ⚠️ | meta.role/meta.status display fallback 잔존 (F-1) |
| CORS `*` 엔드포인트 4건 | 🟡 | 기존부터. 각 경로 IP rate-limit 으로 지금은 커버 |
| `SUPABASE_SERVICE_ROLE_KEY` literal 접근 10+ | 🟡 | RLS Phase 4 에서 일괄 정리 예정 (설계 문서 참조) |
| `is_admin_unlimited()` SECURITY DEFINER 재귀 | ✅ | search_path 고정, admin_users RLS 회피 |

## 발견 — 후속 조치

### F-1 (Low) — admin/users GET meta.role/meta.status 표시 폴백

`src/app/api/admin/users/route.ts:41-53`

```ts
role: adminRow?.role || meta.role || 'user',
status: adminRow?.status || meta.status || (...SUPERADMIN_EMAILS.includes(...) ? 'approved' : 'pending'),
```

- 영향: 사용자가 `supabase.auth.updateUser({ data: { role: 'superadmin' } })` 로 자기
  user_metadata.role 을 변경한 뒤 admin_users 에 레코드가 없는 상태면, 관리자
  포털의 사용자 목록에서 superadmin 으로 오인되어 표시될 수 있다. 실제 권한
  승격은 L-sec59/60 이후 막혀 있으므로 **display-only spoof** 에 한정.
- 권장 수정: `adminRow?.role ?? 'user'` 로 좁히고 meta fallback 제거. admin_users
  에 row 가 없는 사용자는 'user'/'pending' 으로 표시.
- 우선순위: Low (social engineering 창구 축소 차원).

### F-2 (Info) — CORS `*` 4건 정책 확인

- `address-search`, `ai/briefing`, `kakao-rv/[...path]`, `naver-works-post`.
- 과거 L-sec14/15 에서 사례별로 검토되었고, 각 경로에 IP rate-limit + 입력
  cap + 외부 API 할당량 보호 도입됨.
- 후속 감사 때 "정말 cross-origin 호출이 필요한가" 를 경로별로 재질문해
  같은 도메인으로 좁히는 쪽이 나은지 판단.

### F-3 (Info) — service_role key 정적 import 10+

- `createServerClient()` 를 쓰지 않고 route 최상위에서 `process.env.SUPABASE_SERVICE_ROLE_KEY!`
  를 직접 읽는 파일들: apply-map-migration, auto-generate, db-migrate, dedup-migrate,
  migrate, migrate-to-r2, generate-description, images/[id], listings/[id]/images, …
- L-rls1 Phase 4 에서 일괄 `createServerClient()` 로 리팩터링 + admin route 에서는
  `createUserClient(token)` 우선, 크론/배치만 service_role 유지.
- 현재는 모두 verifyAdminAuth 뒤에 있어 활성 취약점 아님.

## 회귀 테스트 포인트 (후속 커밋 전 확인)

1. **MFA flow**: enroll → verify (10 recovery) → challenge → login-verify → recovery 전 구간
   수동 스모크. `MFA_ENCRYPTION_KEY` / `MFA_CHALLENGE_SECRET` 환경변수 Vercel 3환경 주입.
2. **RLS**: staging DB 에 20260423_rls_phase1_shadow.sql 적용 → /api/listings 공개 GET
   응답 카운트 / /admin/listings 관리자 응답 카운트 변동 여부. Phase 1 은 변동 0 이어야 함.
3. **build**: Vercel 빌드에서 `speakeasy` 미설치 여부 확인 (본 구현은 zero-dep,
   추가 의존성 없음 — `otplib` 등을 나중에 도입할 때만 package.json 업데이트).

## 다음 라운드 감사 (L-scan33 예비 목록)

- MFA_ENCRYPTION_KEY / MFA_CHALLENGE_SECRET 실제 Vercel 주입 후 MFA e2e 스모크
- RLS Phase 2 — is_admin_unlimited 기반 tight policy 작성 + staging 검증
- /api/admin/users F-1 display fallback 제거
- Sentry 재도입 (b6204f3 revert 원인 분석 후 재커밋)
- speakeasy/otplib 도입 여부 결정 (현재 zero-dep 유지 이점 vs 테스트 벡터 편의)
- csrf 토큰 — state-changing admin POST/PUT/DELETE 전수 감사
