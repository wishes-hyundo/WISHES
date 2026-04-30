# RFC 0001 — PR-E: 회귀 안전망 (Regression Safety Net)

> **상태**: Approved (사장님 OK 2026-04-30)
> **작성**: 2026-04-30
> **작성자**: Claude (Cowork mode 세션)
> **라벨**: `[UI:0]`
> **브랜치**: `feat/pr-e-regression-safety-net`
> **PR 큐 위치**: Phase 1 #1 (마스터 프롬프트 §127)
> **선행**: 없음 (Phase 1 첫 PR)
> **후행**: PR-G (Cool-down 24h 후 자동 진행)
> **참조**: 마스터 프롬프트 §125 / §102 / §96 / §100 / §101 / §67 — Discovery 보고서 §A1 ~ §A11

---

## 0. 11 줄 자기검증 (§102 / §128)

> 본 RFC 가 헌법을 위반하지 않음을 자체 검증한다. 모든 파생 PR (PR-G ~ PR-O) 의 PR 본문 첫 머리에도 동일 11 줄을 박는다.

- [x] Discovery 없이는 코드 한 줄 안 고친다.
- [x] 회귀 0 이 아니면 머지 안 한다.
- [x] 무료/OSS 가 가능한데 유료 안 쓴다.
- [x] 만든 것은 부수지 않고 더 정교하게 만든다.
- [x] UI 기본틀은 헌법이다 — 명시 승인 없이 단 한 픽셀도 안 바꾼다.
- [x] 네이버·구글이 매시간 와서 우리 매물을 좋아하게 만든다.
- [x] 5 층 방어를 모두 통과하지 못한 변경은 존재하지 않는다.
- [x] 반복하더라도 0 회귀가 될 때까지 머지하지 않는다.
- [x] 사회초년생 / 신혼부부 / 사업자 — 셋 중 하나의 페인을 풀거나 100% 실매물 보증을 강화한다.
- [x] Phase 1 = 한계치까지 (새 기능 0). Phase 2 = 그 위에 쌓기 (Phase 1 안정 후만).
- [x] 이 PR 은 [UI:0] / [UI:meta] / [UI:rfc] 중 하나로 명시되어 있다.

---

## 1. Motivation (왜 PR-E 가 PR-G 보다 먼저인가)

### 1.1 임박한 위험
PR-G 가 곧 진행됩니다. PR-G = `listings` 테이블에 자동 추출 trigger 5 개 등록:

1. `auto_extract_rooms_bathrooms_from_raw()` — rooms / bathrooms NULL 53% → < 20% 목표
2. `auto_extract_options_from_raw_fields()` — options NULL 32% → < 10% 목표
3. `auto_calculate_trust_score()` — trust_score NULL 60% → 100% 목표
4. `auto_detect_jeonse_risk()` — 전세사기 의심 자동 라벨
5. `auto_fix_problematic_listings()` — KISO 14 항 자동 검증

함수 5 개는 Discovery §A2 / §A3 에 정의되어 있으나, **trigger 미연결 상태**.

### 1.2 회귀 안전망 없이 trigger 켜면?
17,345 채 매물 (총 29,475 채 중 신규 + 기존 NULL) 에 5 trigger 가 한꺼번에 발화 → 만약 함수 1 개라도 잘못된 추출 로직이면 **17K 매물 데이터가 한 번에 오염**.

Discovery §A11 위험 명시:
> "실제 데이터로 검증 후. 카나리 필수."

### 1.3 PR-E 가 깔아두는 그물망
PR-G 가 잘못된 결과를 만들 때 **즉시 catch** 하는 6 개 자동 게이트:

1. **type** — TypeScript 컴파일 0 에러
2. **lint** — ESLint 0 경고
3. **unit** — Vitest 단위 테스트 (filters-baseline 포함)
4. **golden** — Golden 50 시드 (사회초년생 20 / 신혼부부 15 / 사업자 15) 검색 결과 ID 집합 = 베이스라인
5. **sql-oracle** — 같은 필터 → API ID 집합 vs 직접 SQL ID 집합 차집합 = 0
6. **dom-snapshot** — 4 페이지 (`/`, `/map`, `/listings/[id]`, `/about`) 렌더 HTML = 베이스라인

→ 머지 전 6 게이트 모두 PASS 가 아니면 PR-G 머지 자체가 차단됨.

### 1.4 헌법 §96 Two-Phase Doctrine 의 명시
> "Phase 1 첫 PR-E 부터 [UI:0] 라벨로 즉시 시작. PR-G 는 PR-E 머지 24h Cool-down 후 다음 PR."

PR-E 미선행 + PR-G 단독 = 헌법 위반.

---

## 2. Scope — 8 단계 (§125.1)

> 각 단계는 사장님께 유치원 수준 설명 + 진행 OK 보고 후 시작.

### 단계 1 — RFC 작성 ✅
- 본 문서 (`docs/RFC/0001-pr-e-regression-safety-net.md`)
- 코드 변경 0 줄

### 단계 2 — Vitest 베이스라인 보강
- `vitest.config.ts` 생성 (deps 이미 있음, 설정만)
- `tests/setup.ts` (msw + supabase mock)
- `tests/unit/filters-baseline.test.ts` (현재 동작 capture)

### 단계 3 — Husky + lint-staged
- `package.json` devDependencies 추가:
  - `husky@^9.0.0`
  - `lint-staged@^15.0.0`
- `.husky/pre-commit`: `pnpm lint-staged`
- `.lintstagedrc.json`: `{ "*.{ts,tsx}": ["eslint --fix", "tsc --noEmit"] }`

### 단계 4 — Golden 50 시드
- `tests/golden/` 디렉토리
- 사회초년생 20 (월세 / 원룸 / 투룸 / 지역 / 예산)
- 신혼부부 15 (전세 / 매매 / 빌라 / 아파트 / 학군 / 출퇴근)
- 사업자 15 (월세 / 상가 / 사무실 / 권리금 / 업종)
- 각 케이스 YAML 형식 (PART XII §72.1)

### 단계 5 — SQL Oracle
- `scripts/sql-oracle.ts`
- 동일 필터 입력 → API 응답 ID 집합 + 직접 SQL ID 집합 비교 → 차집합 0 검증

### 단계 6 — DOM Snapshot 베이스라인
- `tests/dom-snapshot/`
- 4 페이지 렌더 HTML capture: `/`, `/map`, `/listings/[id]`, `/about`
- Vitest snapshot 매칭

### 단계 7 — CI Workflow
- `.github/workflows/regression-gate.yml`
- 6 게이트: type / lint / unit / golden / sql-oracle / dom-snapshot
- 통과해야만 PR 머지 가능

### 단계 8 — 검증 + 머지
- 23 게이트 (PART XI §67) 가능한 것 모두
- 자가 회귀 검증 (변경 코드 0 줄 → 회귀도 0)
- 카나리 1% 불필요 (테스트 파일은 prod 영향 0)
- Cool-down 24h 자동 대기 → PR-G 진행

---

## 3. Non-goals (절대 안 하는 것)

§125.2 + §100 UI 헌법 + §101 데이터/코드 보존 5 원칙 적용:

| # | 금지 항목 | 근거 |
|---|---|---|
| 1 | 컴포넌트 수정 X | §125.2 / §100 |
| 2 | 새 페이지 / 새 라우트 / 새 컴포넌트 0 | §125.2 |
| 3 | `package.json` `dependencies` 추가 X (devDependencies 만 OK) | §125.2 |
| 4 | `/features/map-2026/**` 손대지 X | §100 / NEXT §7 보존 |
| 5 | `tailwind.config.js` 변경 X | §100 / NEXT §7 |
| 6 | `/search` (vanilla content.js) 손대지 X | CLAUDE.md 영구 |
| 7 | `/admin/*` 손대지 X | PR-E 범위 밖 |
| 8 | DB 마이그레이션 X | PR-E 는 테스트 인프라만 |
| 9 | DB 트리거 등록 X | 그건 PR-G 영역 |
| 10 | 데이터 수정 X | §101 (정리 · 연결 · 통합 · 보강만) |

---

## 4. Verification

### 4.1 자가 회귀 검증
PR-E 는 회귀 검증 **인프라 자체**이므로 → 변경되는 prod 코드 0 줄 → 회귀 도 0.

테스트 파일 (`tests/`, `.github/workflows/`, `.husky/`) 은 `next build` 단계에서 prod bundle 에서 제외 → 라이브 영향 0.

### 4.2 Pre-merge Checklist (필수)

- [ ] 6 게이트 모두 PASS (type / lint / unit / golden / sql-oracle / dom-snapshot)
- [ ] 11 줄 자기검증 PR 본문 머리 (§102)
- [ ] `[UI:0]` 라벨 부착
- [ ] `git diff main feat/pr-e-regression-safety-net -- 'src/features/map-2026/**'` = 0 줄
- [ ] `git diff main feat/pr-e-regression-safety-net -- 'tailwind.config.js'` = 0 줄
- [ ] `git diff main feat/pr-e-regression-safety-net -- 'public/search/**'` = 0 줄
- [ ] `package.json` `dependencies` 변경 0 (devDependencies 만)
- [ ] `/api/version` 호출 가능 (라이브 영향 0 검증)
- [ ] Vercel 빌드 PASS

### 4.3 Cool-down 24 h 모니터링 (머지 후)

머지 후 24 h 동안:
- Vercel logs (에러 율 변화 0%)
- `/api/version` (라이브 commit 정상)
- Supabase logs (DB 영향 0 — PR-E 는 DB 변경 X)
- /admin/automation-status 대시보드 (KPI 변화 0)

이상 없으면 PR-G 자동 진행.

---

## 5. Rollback

테스트 파일 인프라이므로 즉시 되돌림 가능 (5 분 이내):

```bash
git revert <pr-e-merge-commit>
pnpm remove husky lint-staged
rm -rf tests/ scripts/sql-oracle.ts .github/workflows/regression-gate.yml .husky/ .lintstagedrc.json vitest.config.ts
git push
```

라이브 영향: 0 (테스트 파일 prod 영향 없음).

---

## 6. Cool-down

머지 후 **24 h 자동 대기**.

24 h 모니터링 무이상 → PR-G 진행.
24 h 안 이상 발생 → 즉시 git revert + RFC 0001 v2 작성.

---

## 7. PR 큐 위치 (§127)

| # | PR | 라벨 | 설명 | 상태 |
|---|----|----|------|---|
| **1** | **PR-E** | **`[UI:0]`** | **회귀 안전망 (본 RFC)** | **🔵 진행 중** |
| 2 | PR-G | `[UI:0]` | listings trigger 5 등록 (§A2/A3) | ⏸️ 대기 |
| 3 | PR-G2 | `[UI:meta]` | AI trigger 2 + 비용 cap (§116~119) | ⏸️ |
| 4 | PR-A | `[UI:0]` | type 26→8 정규화 + SSOT registry v0.1 (§77) | ⏸️ |
| 5 | PR-F | `[UI:0]` | mv_map_listings 보강 (gu + type_normalized) | ⏸️ |
| 6 | PR-B | `[UI:rfc]` | NULL 정책 + UI 모달 텍스트 (사장님 승인) | ⏸️ |
| 7 | PR-D | `[UI:meta]` | SEO + JSON-LD + sitemap + IndexNow | ⏸️ |
| 8 | PR-C | `[UI:0]` | 17 enrichment 데이터 채우기 | ⏸️ |
| 9 | PR-M | `[UI:0]+[UI:rfc]` | 접근성 axe-core CI + 시니어 토글 | ⏸️ |
| 10 | PR-N | `[UI:0]` | 모바일 SLO + RUM + PWA + Web Push | ⏸️ |
| 11 | PR-O | `[UI:0]` | 법무 자문 결과 통합 (Track B) | ⏸️ |

---

## 8. 참조 (Source of Truth)

- `docs/WISHES_FILTER_MASTER_PROMPT.md` §96 (Two-Phase Doctrine)
- `docs/WISHES_FILTER_MASTER_PROMPT.md` §100 (UI 헌법 6 규칙)
- `docs/WISHES_FILTER_MASTER_PROMPT.md` §101 (데이터/코드 보존 5 원칙)
- `docs/WISHES_FILTER_MASTER_PROMPT.md` §102 (11 줄 자기검증)
- `docs/WISHES_FILTER_MASTER_PROMPT.md` §125 (PR-E 작업 명세 8 단계)
- `docs/WISHES_FILTER_MASTER_PROMPT.md` §127 (Phase 1 PR 큐 11 개)
- `docs/WISHES_FILTER_MASTER_PROMPT.md` §67 (PART XI 23 게이트)
- `docs/WISHES_DISCOVERY_REPORT_2026-04-29.md` §A1 (cron 6 개 현황)
- `docs/WISHES_DISCOVERY_REPORT_2026-04-29.md` §A2 (listings trigger 함수 5 정의 / 미연결)
- `docs/WISHES_DISCOVERY_REPORT_2026-04-29.md` §A3 (AI trigger 함수 2 정의)
- `docs/WISHES_DISCOVERY_REPORT_2026-04-29.md` §A11 (trigger 등록 위험 명시)
- `CLAUDE.md` (영구 규칙 — /search / /admin / 비용 / 자동화)

---

## 9. 사장님 승인 기록

| 일시 (KST) | 승인 항목 | 비고 |
|---|---|---|
| 2026-04-30 09:0X | "RFC 0001 OK" | 본 RFC 작성 + 단계 2~8 진행 OK |
| 2026-04-30 09:XX | "단계 1 OK" | RFC 작성 즉시 시작 |

(이후 단계마다 사장님 OK 1 회씩 — 유치원 수준 설명 + 진행 OK 패턴)

---

**다음 단계**: 단계 2 — Vitest 베이스라인 보강 유치원 수준 설명 + 진행 OK 요청.
