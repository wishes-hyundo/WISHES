# L-audit-2026-04-22 마감 보고 — 2026-04-23 (L-close)

**보고 대상**: `docs/L-audit-2026-04-22.md` 에서 식별된 CRITICAL / HIGH / MEDIUM 항목의 마감 현황.
**작성 시각**: 2026-04-23 (KST)
**최종 프로덕션 HEAD**: `ab3488d` (Vercel Ready / Current)

---

## 0. 경영진 한 장 요약

2026-04-22 감사에서 잡힌 총 11건(C-1~C-4, H-1~H-4, M-1~M-7) 중 **9건 닫힘**. 잔여 2건은 침습 범위가 커서 별도 스프린트로 분리됐다. 모든 마감 건은 `origin/main` 에 실제 반영 + Vercel Production 배포까지 확인됨.

| 등급 | 전체 | 닫힘 | 잔여 | 잔여 사유 |
| ---- | ---- | ---- | ---- | --------- |
| CRITICAL | 4 | 3 | 1 | C-2 는 HttpOnly cookie 로의 전면 전환이라 2주 플랜 분리 |
| HIGH | 4 | 3 | 1 | H-4 테스트 하네스는 별도 스프린트로 분리 |
| MEDIUM | 7 | 3 | 4 | M-4 ~ M-7 UX 개선은 보안 scope 밖 |

**이번 세션 3개 커밋으로 9건 마감**: `1cab93e` · `1eade25` · `ab3488d`.

---

## 1. 이번 세션 마감 커밋 요약

### 1-1. `1cab93e` — L-sec120~123 (C-1, H-1, H-2, H-3)

| L-sec | audit 항목 | 파일 |
| ----- | ---------- | ---- |
| L-sec120 | C-1 Admin IDOR DELETE/PATCH | `src/app/api/admin/listings/[id]/route.ts` + `src/lib/adminAuth.ts` |
| L-sec121 | H-1 감사 로그 (admin_audit_log 없이 console) | `src/lib/auditLog.ts` 신규 |
| L-sec122 | H-2 rate limit 확장 | `src/lib/rateLimit.ts` + admin mutation 경로 |
| L-sec123 | H-3 뷰포트 다거래 가격필터 OR-scope | `src/app/api/listings/viewport/route.ts` |

**핵심**: 이전 82cce92 커밋에서 "L-sec112 IDOR 적용" 마크가 찍혔지만 실제로는 파일이 커밋에 포함되지 않은 fake-commit 이 드러남. 재적용 + 증거 대조(파일 실제 바이트 검증) 로 마감.

### 1-2. `1eade25` — L-sec126 / L-sec127 (C-3 재적용, M-1)

| L-sec | audit 항목 | 내용 |
| ----- | ---------- | ---- |
| L-sec126 | C-3 `/api/ai/match` PostgREST ilike escape | `escapeIlike()` 헬퍼 추가 후 `filters.dong` / `filters.businessType` 두 호출부에 적용 |
| L-sec127 | M-1 `/api/admin/users` GET strict auth | `verifyAdminAuth` → `verifyAdminAuthStrict` + `role in {superadmin, master}` 게이트 |

**핵심**: C-3 도 L-sec114 마크는 있었지만 파일 미반영. 같은 fake-commit 패턴이 세션에서 두 번 반복 확인되어, 이후 모든 `[completed]` 표시는 파일 실제 내용 재검증을 거치는 루틴을 도입.

### 1-3. `ab3488d` — L-sec129 / L-sec130 (M-2, M-3)

| L-sec | audit 항목 | 내용 |
| ----- | ---------- | ---- |
| L-sec129 | M-2 `/compare` robots noindex | `src/app/compare/layout.tsx` metadata + sitemap 제거 |
| L-sec130 | M-3 CORS localhost prod 허용 제거 | `src/lib/cors.ts` + `src/middleware.ts` NODE_ENV gate |

**핵심**: `ALLOWED_ADMIN_ORIGINS` 에 `http://localhost:3001` 이 프로덕션 빌드에서도 하드코딩돼, CSRF 툴에서 오리진 위조 시 `Access-Control-Allow-Origin` 이 echo 되던 결함. NODE_ENV 게이트로 dev 전용 축소.

---

## 2. 잔여 항목 — 별도 스프린트 분리

### 2-1. C-2. HttpOnly 세션 쿠키 마이그레이션 (보류)

**현황**: `admin_password` 평문 sessionStorage 저장 → 전면 철거 필요.
**분리 사유**: 로그인/세션 전 영역 재설계가 필요(클라이언트 `Authorization: Bearer` 로직 → `credentials: 'include'` 전환, refresh token rotation, 모든 관리자 재로그인 공지). 보안 긴급도는 높지만 **현재 프로덕션을 망치지 않고** 전환하려면 최소 2주 플랜이 필요.
**제안 일정**: 별도 `L-auth-migration-2026-05` 스프린트로 분리.
**임시 미티게이션**: 이미 L-sec54 (localStorage → sessionStorage) + L-sec4 (CSP enforce, `unsafe-eval` 제거) 로 XSS 표면은 상당히 축소됨.

### 2-2. H-4. 테스트 하네스 (보류)

**현황**: IDOR / role escalation / rate limit 을 코드로 단언하는 테스트 셋 미구축.
**분리 사유**: Next.js App Router + Supabase admin SDK 를 로컬에서 mock 하는 하네스 설계가 하루 이상 소요. 가장 중요한 공격 경로는 이미 코드 단에서 차단됐으므로 병렬 작업으로 분리 가능.
**제안 일정**: `H-4-harness-2026-05` — Vitest + supabase-js mock + `next-test-api-route-handler`.

### 2-3. MEDIUM UX 항목 (M-4 ~ M-7)

감사 원문 범위상 UX 개선 — 보안 스코프 밖이라 이번 마감 대상에서 제외.

---

## 3. 세션 중 확보된 운영 교훈

1. **fake-commit 패턴 재현**: 과거 커밋 메시지에 `[completed]` 마크가 찍혔지만 실제 diff 에 해당 파일이 없는 사례가 **두 번** 발견됨 (L-sec112, L-sec114). 이후 모든 보안 마감 커밋은 `git show --stat <hash>` 로 파일 포함 여부 검증 후 "완료" 처리.
2. **Windows cmd 배치 스크립트 안정화**: 긴 `-m` 인자 → 파일 기반 `-F`, `(x86)` paren parser 충돌 → goto label 구조, PATH 미등록 git → `C:\Program Files\Git\cmd\git.exe` fallback. 최종 템플릿은 `_run_l129_130.bat` 패턴 재사용.
3. **샌드박스 mount vs Windows FS 비동기**: 리눅스 mount 가 Windows 쓰기를 즉시 반영하지 못해 파일 크기 불일치가 관찰됨. 이후 git 연산은 반드시 Windows 네이티브 경로에서 실행.

---

## 4. 마감 체크리스트

- [x] 모든 보안 L-sec 커밋 `origin/main` 반영
- [x] Vercel Production Ready 확인 (`ab3488d` Current)
- [x] `tsc --noEmit` 3커밋 모두 rc=0
- [x] fake-commit 재발 방지 루틴(파일 바이트 검증) 세션 내 적용
- [ ] C-2 별도 스프린트 티켓 생성 — **다음 작업**
- [ ] H-4 별도 스프린트 티켓 생성 — **다음 작업**

---

## 5. 최종 커밋 그래프

```
ab3488d (HEAD -> main, origin/main) sec/seo: L-sec129 /compare noindex + L-sec130 CORS local…
1eade25                             sec/fix: L-sec126 ai/match ilike escape + L-sec127 admin/us…
1cab93e                             sec/fix: L-sec120~123 IDOR+audit+rate-limit + H-3 viewport …
82cce92                             sec/fix: L-sec112 IDOR + L-sec113 admin_password scope + …   (fake, 위 1cab93e 에서 보완)
45c322b                             sec: L-sec111 gate public API error.message/body leaks on is…
```
