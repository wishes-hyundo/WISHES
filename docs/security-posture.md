# Security Posture — wishes.co.kr

최종 갱신: 2026-04-23

본 문서는 wishes 서비스의 보안 체계 전반을 정리한다. 감사(audit) / 실사(due diligence) / 고객 보안 설문 대응 시 1차 제출 문서.

---

## 1. 인증 & 권한 (AuthN/AuthZ)

### 1.1 어드민 인증
- Supabase Auth JWT (RS256) 기반. `verifyAdminAuth(request)` → `supabase.auth.getUser(token)` 로 **서명 검증**. 형식 검증만 하던 구버전은 L-sec2 에서 폐기.
- 마스터 패스워드 (`WISHES_ADMIN_MASTER_PASSWORD`) 는 운영/프리뷰/로컬 모든 환경에서 env 로만 관리. 소스에 박제된 dev fallback 은 L-sec89 에서 제거.
- `admin_users` 테이블의 `role` / `status` 만 신뢰. `auth.user_metadata` 의 self-escalation 경로는 L-sec59 에서 차단.

### 1.2 권한 범주
| role | 접근 | 비고 |
|---|---|---|
| superadmin | 모두 | `wishes@wishes.co.kr` 고정 화이트리스트 |
| admin | 모두 (일부 super-only 제외) | admin_users.status=approved 필수 |
| agent | 본인 생성 리소스만 (IDOR 가드) | scope filter: `created_by = uid` |
| crawler_bridge | /api/admin/* GET 한정 | env 토큰 완전 일치 |
| master | 모두 (긴급용) | env 마스터 패스워드 |

### 1.3 MFA (TOTP)
- RFC 6238 기반 TOTP 구현체 `src/lib/mfaTotp.ts` 완비.
- 현 단계: 선택 등록. **강제(enforce) 는 로드맵 항목** — 등록 UI / 백업코드 / 복구 플로우 완성 후 전환.

### 1.4 세션 관리
- phase 1 (L-sec133): HttpOnly `ws_session` 쿠키 발급 엔드포인트 `/api/auth/cookie-issue`.
- phase 2 (L-sec142): Origin 검증 + CSRF double-submit (`ws_csrf`) 동시 발급.
- phase 3 (L-sec145 진행 중): 클라이언트 `adminFetch` 래퍼 배포, 미들웨어 soft-check. hard-enforce + sessionStorage 제거는 점진 전환.

---

## 2. 입력 검증 & IDOR 방어

- 모든 admin mutation route 는 `verifyAdminAuthWithContext()` 로 호출자 uid/role 확보 후 대상 리소스 소유자 대조.
  - 적용 route: listings CRUD, appointments, contacts, users.
  - 대표 커밋: L-sec112, L-sec136, L-sec137, L-sec138, L-sec139.
- 회귀 방지: `src/__tests__/adminAuthz.test.ts` 를 포함한 Vitest 하네스 (L-sec131~132).
- `.ilike` / SQL / regex 모두 escape helper 사용 (`escapeIlike`, `escapeRegex`).
- LLM 출력 (search-nl 등) 은 Zod `.strict()` 화이트리스트 검증 (L-sec141).

---

## 3. 네트워크 & 전송 보안

### 3.1 Security Headers (src/middleware.ts)
| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Content-Security-Policy` | default-src self + 명시 화이트리스트 (kakao, google-analytics, supabase, sentry, openfreemap 등). `unsafe-eval` 제거 (L-sec4). |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self)` |
| `Reporting-Endpoints` | `csp-endpoint="/api/csp-report"` |

### 3.2 CORS — /api/admin/**
- 화이트리스트: `wishes.co.kr`, `www.wishes.co.kr`, `*.vercel.app` (preview 자동 허용).
- 로컬 dev origin (`localhost:3000/3001`) 은 `NODE_ENV !== 'production'` 에서만 허용 (L-sec130).
- `Access-Control-Allow-Credentials: true` + `X-CSRF-Token` 헤더 허용 (phase 3).

### 3.3 Rate Limiting (H-2, L-sec143 갱신)
- 엔드포인트별 bucket. 주요 한계:
  - `/api/auth/*`: 20 req / 5min / IP
  - `/api/admin/audit-log/export`: 5 req / 10min / IP
  - `/api/auth/cookie-issue`: 30 req / 15min / IP
- `src/lib/rateLimit.ts` — in-memory LRU. 장기적 Redis 전환 여지.

---

## 4. 관측 & 감사

### 4.1 에러 관측 (Sentry, L-observe1)
- `@sentry/nextjs` instrumentation hook. DSN 미설정 시 완전 no-op.
- `beforeSend` 에서 PII/secret 마스킹: authorization / cookie / x-admin-token 헤더 + IP + email + query token 등 REDACTED.
- 기본 `tracesSampleRate 0.05`. `SENTRY_TRACES_SAMPLE_RATE` 로 조정.

### 4.2 감사 로그 (audit_log)
- 1차: `console.log('[AUDIT]', …)` → Vercel Log drain.
- 2차: `admin_audit_log` DB 테이블 (L-sec146, `supabase/migrations/20260423_admin_audit_log.sql`). RLS 로 `service_role` 만 접근. 24개월 자동 삭제 cron 옵션 제공.
- CSV 내보내기: `GET /api/admin/audit-log/export` (superadmin + rate-limit).

### 4.3 로그 수집 권장
- Vercel Log Drain → Logflare / Datadog 중 택1 로 추가 수집 권장.
- Sentry 알림: error + audit warning + Slack/email 채널 연결.

---

## 5. 비밀 관리

### 5.1 Env 인벤토리 (운영 기준)
| Key | 용도 | 재발급 주기 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 DB 전권 | 이벤트 드리븐 (유출 시 즉시) |
| `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` | 퍼블릭 | 변경 시 |
| `WISHES_ADMIN_MASTER_PASSWORD` | 마스터 어드민 | 6개월 |
| `WISHES_CRAWLER_BRIDGE_TOKEN` | 크롤러 | 6개월 |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | LLM | 6개월 |
| `SENTRY_DSN` | Sentry ingest | 유출 시 교체 |

### 5.2 로테이션 절차
1. 신규 값 생성 (패스워드 매니저 권장).
2. Vercel dashboard 에 신규 env 추가 (동일 key, 기존 값 덮어쓰기).
3. Redeploy — 이전 토큰 즉시 무효화.
4. 로테이션 기록을 `docs/secret-rotation-log.md` (별도) 에 날짜 + 담당자 + 이유 3줄.

### 5.3 노출 대응 런북
- 유출 의심 → (1) 해당 key 즉시 rotate (2) Supabase auth sessions revoke (3) Vercel Deployment rollback 필요 여부 판단 (4) `admin_audit_log` 에서 최근 24h 의심 액션 조회 (5) 결론/보고.

---

## 6. 의존성 & 공급망

- `.github/dependabot.yml` (L-sec144): 주간 스캔 + 보안 patch 즉시 PR. major bump 은 수동 검토.
- `npm audit --production` 은 CI 통과 조건 아님 (fail-open). 보안 issue 는 Dependabot alert 로 처리.
- Chrome extension 등 외부 번들은 CSP 에서 엄격 차단 (L-sec4, L-sec102).

---

## 7. 백업 & 복구 (DR)

### 7.1 현황
- DB: Supabase 관리. 기본 일 단위 스냅샷. **PITR(Point-in-Time Recovery) 는 유료 Add-on — 활성화 권장**.
- 코드: GitHub `main` single-source, Vercel 이 배포 이력 보유.

### 7.2 RTO / RPO 목표
| 항목 | RTO | RPO |
|---|---|---|
| 웹 (Vercel rollback) | 5 min | 0 |
| DB (Supabase PITR) | 1 h | 1 min |
| DB (snapshot only) | 4 h | 24 h |

### 7.3 DR 드릴 (분기 1회 권장)
1. 스테이징 DB 에 최신 스냅샷 복원.
2. 임의 timestamp 로 PITR 복구 테스트 (PITR 활성 시).
3. 결과 기록 `docs/dr-drills/YYYY-QN.md`.

---

## 8. 사고 대응 (Incident Response)

### 8.1 심각도 분류
- **Sev1**: 서비스 전면 장애, 대규모 데이터 유출. 1h 이내 대응 착수.
- **Sev2**: 일부 기능 장애, 단일 계정 침해. 4h 이내.
- **Sev3**: UX 버그, 부분 성능 저하. 영업일 내.

### 8.2 공통 체크리스트
1. 탐지 (Sentry alert / 고객 제보 / audit log anomaly).
2. 영향 범위 확정 — 관련 user_id / listing / 기간.
3. 긴급 완화 — 토큰 rotate / rate-limit 강화 / 엔드포인트 일시 차단.
4. Root-cause 정리.
5. 사후 보고서 — `docs/incidents/YYYY-MM-DD-title.md`.

---

## 9. 컴플라이언스 (PIPA / 개인정보보호법)

- 수집 항목: 이메일, 전화, 주소(일부), 매물 협상 기록. 법정 보관 기간 2년 이상 (거래 기록).
- `admin_audit_log` 2년 보존 정책 (§4.2).
- 삭제 요청 플로우: `/api/auth/delete-account` (DELETE). L-sec 계열 테스트로 회귀 방지.
- 개인정보 처리방침 페이지 `/privacy` 유지 관리.

---

## 10. 펜테스트 / 외부 점검

### 10.1 내부 체크리스트 (반기 1회)
- [ ] 모든 admin route 가 `verifyAdminAuth*` 통과 — `grep -r "export async function.* route.ts"` 로 수동 확인
- [ ] 주요 IDOR 엔드포인트 scope filter 회귀 테스트 (Vitest)
- [ ] CSP 승격 후 위반 리포트 0 유지 (`/api/csp-report` 로그)
- [ ] Dependabot alert 전수 처리
- [ ] Env 인벤토리 재확인 (§5.1)
- [ ] DR 드릴 1회 (§7.3)

### 10.2 외부 업체 권장
- OWASP Top 10 + API Security Top 10 스캔 연 1회.
- 예산 100~300만원대 → OWASP ZAP 기반 자동 + 샘플 수동 진단.

---

## 부록 A. 참고 커밋

| 항목 | 커밋 예시 |
|---|---|
| JWT 서명 검증 | L-sec2 |
| 마스터 패스워드 env 이전 | L-sec89 |
| admin_users 신뢰 경로 | L-sec59 |
| IDOR 가드 전수 | L-sec112, L-sec136~139 |
| CSP `unsafe-eval` 제거 | L-sec4 |
| CORS 화이트리스트 축소 | L-sec130 |
| audit_log H-1 | L-sec125 |
| Vitest IDOR 회귀 | L-sec131, H-4 phase 2 |
| Sentry 통합 | L-observe1 |
| HttpOnly 쿠키 phase 1 | L-sec133 |
| HttpOnly 쿠키 phase 2 | L-sec142 |
| Dependabot | L-sec144 |
| CSRF soft-check | L-sec145 |
| admin_audit_log DB | L-sec146 |
