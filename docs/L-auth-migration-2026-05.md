# L-auth-migration-2026-05 — HttpOnly 세션 쿠키 마이그레이션 설계

**목표**: `sessionStorage.admin_password` / `sessionStorage.ws_token` 제거.
**원인**: L-audit-2026-04-22 / C-2 — sessionStorage 는 어떤 XSS 도 읽을 수 있음. JWT/패스워드 둘 다 단 한 번의 innerHTML 렌더링 버그로 유출됨.
**계약**: **phase 1 은 2026-04-23 L-sec133 으로 프로덕션 반영 완료** (쓰기 경로만). phase 2/3 은 운영팀 공지 + 재로그인 유도가 필요해 본 문서로 분리.

---

## phase 1 — 쿠키 발급 + 서버 fallback 읽기 (완료)

**커밋 범위**: L-sec133 / `src/app/api/auth/cookie-issue/route.ts` 신규 + `src/lib/adminAuth.ts` 세 함수에 쿠키 fallback 추가.

**동작**:
1. 클라이언트가 `POST /api/auth/cookie-issue` 에 `{ access_token }` 전송.
2. 서버가 supabase.auth.getUser 로 서명 검증 후 `Set-Cookie: ws_session=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`.
3. admin API 측 `verifyAdminAuth*` 가 Authorization 헤더가 없을 때 쿠키에서 JWT 를 읽어 기존 검증 파이프라인 그대로 태움.

**안전성**: additive only. 어떤 기존 클라이언트도 이 엔드포인트를 호출하지 않는 동안은 동작 변화 없음.

---

## phase 2 — 클라이언트 전환

**목표**: 관리자 대시보드가 로그인 직후 `POST /api/auth/cookie-issue` 호출, 이후 admin API fetch 에서 `Authorization` 헤더를 빼고 `credentials: 'include'` 만으로 인증.

**작업**:
1. `src/app/admin/page.tsx` 의 `handleLogin` 블록 — Supabase signIn 성공 시점에 `fetch('/api/auth/cookie-issue', { method:'POST', body: JSON.stringify({access_token}), credentials:'include' })` 추가.
2. 모든 admin fetch helper (검색: `fetch('/api/admin/`, `src/app/admin/**/*.tsx` 그리고 `src/lib/adminClient*` 이 있다면) 에서 `headers: { Authorization: 'Bearer …' }` 줄 제거하고 `credentials: 'include'` 전환.
3. **병행 기간**: phase 2 PR merge 직후에도 서버는 phase 1 fallback 덕에 Bearer 헤더가 여전히 오면 계속 허용. 따라서 이전 탭이 열려있어도 즉시 안 깨짐.
4. **CSRF double-submit token**: 쿠키만으로 인증되면 same-origin XSS 가 대신 fetch 를 띄울 때 쿠키가 자동 포함된다. `Origin` 헤더 검사(이미 `middleware.ts` 화이트리스트 있음) + `X-CSRF-Token` 헤더(쿠키와 별개로 클라이언트가 읽는 비-HttpOnly 토큰)를 이중 제출. `src/lib/adminAuth.ts` 의 JWT 경로 앞에 `if (cookieAuth && !csrfOk) return false;` 추가.

**롤백 포인트**: phase 2 이후에도 phase 1 엔드포인트와 fallback 은 그대로 유지. 문제가 생기면 클라이언트 코드만 revert → Bearer 경로 즉시 재활성.

---

## phase 3 — 레거시 철거

**진입 조건** (전부 만족해야 함):
- [ ] phase 2 프로덕션 배포 후 **2주** 경과 (1 refresh 주기 + 여유)
- [ ] Vercel Logs 의 `[AUDIT] authMode=bearer` 카운트가 0 에 수렴
- [ ] 운영팀에 모든 관리자 "반드시 재로그인" 공지 완료

**작업**:
1. `src/app/admin/page.tsx` 의 `sessionStorage.setItem('admin_password', …)` 삭제
2. `src/app/search/page.tsx` 의 legacy migration JS(`ws_token` 포함) 삭제
3. `src/lib/adminAuth.ts` — query `?token=` fallback 및 Bearer 경로를 유지 여부 재검토 (크롤러 브리지만 남기거나, 크롤러도 쿠키로 전환). 최소 master password 는 headless 운영 스크립트용으로 env 토큰 경로만 남김.
4. `admin_password` 관련 **모든 grep hit 0건** 확인 — 이 시점에 L-audit-2026-04-22 C-2 closeout.

---

## 위험 / 실패 시 대응

| 위험 | 증상 | 대응 |
| ---- | ---- | ---- |
| 쿠키 발급 실패가 로그인 후에 발생 | admin 대시보드가 로그인 상태인데 API 403 | phase 1 서버 fallback 이 살아있는 한 Bearer 헤더 전송으로 즉시 복구. phase 2 롤백 필요 없음 |
| SameSite=Strict 로 서브도메인/카카오톡 인앱 등에서 쿠키 누락 | 관리자 일부 계정만 세션 유실 | Max-Age 를 짧게 유지 + Bearer 헤더 경로 유지로 자동 폴백 |
| CSRF double-submit 누락 상태에서 same-origin XSS 발생 | HttpOnly 라 토큰 유출은 막히지만 attacker-initiated fetch 성립 | phase 2 에 CSRF token 필수 포함 — 이 문서의 phase 2 #4 |
| refresh token rotation 미구현으로 1시간 뒤 세션 만료 | 관리자가 1시간 후 재로그인 | phase 2 에 refresh-on-expiry 훅 포함, 쿠키 갱신 엔드포인트 `/api/auth/cookie-refresh` 추가 |

---

## 체크리스트 (phase 별)

### phase 1 (L-sec133 — **완료**)
- [x] `/api/auth/cookie-issue` POST/DELETE
- [x] `verifyAdminAuth` 쿠키 fallback
- [x] `verifyAdminAuthWithContext` 쿠키 fallback
- [x] `verifyAdminAuthStrict` 쿠키 fallback

### phase 2 (미착수)
- [ ] admin 로그인 핸들러가 cookie-issue 호출
- [ ] admin fetch helper `credentials: 'include'` 로 전환
- [ ] CSRF double-submit token 도입
- [ ] `/api/auth/cookie-refresh` 갱신 엔드포인트
- [ ] 관리자 대시보드 2주간 병행 검증

### phase 3 (미착수)
- [ ] `sessionStorage.admin_password` 전부 삭제
- [ ] `sessionStorage.ws_token` 전부 삭제
- [ ] L-sec54 legacy migration JS 제거
- [ ] grep `admin_password` / `ws_token` 0건 확인
- [ ] L-audit-2026-04-22 C-2 closeout 문서 갱신
