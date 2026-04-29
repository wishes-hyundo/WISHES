# 다음 세션 시작 가이드 — v8 결정판 (2026-04-29)

> **이 파일을 첫 메시지로 그대로 복붙하면 즉시 작업 시작 가능.**

---

## 0. 다음 세션 첫 메시지 (Drop-in)

```
WISHES 마스터 프롬프트 v8 (docs/WISHES_FILTER_MASTER_PROMPT.md, 3,270줄)
와 Discovery 보고서 (docs/WISHES_DISCOVERY_REPORT_2026-04-29.md, 669줄)
를 따른다. Phase 1 첫 PR-E 부터 [UI:0] 라벨로 즉시 시작.
11줄 자기검증 (§102) + Two-Phase Doctrine (§96) + UI 헌법 6 규칙 (§100)
+ 데이터/코드 보존 5 원칙 (§101) 모두 적용. 추측·확장·삭제 금지.
```

---

## 1. 작업 시작 전 의무 점검 (5 분)

다음 5 가지를 마스터 프롬프트에서 **직접 확인** 후 작업 시작:

- [ ] §96 Two-Phase Doctrine — Phase 1 = 새 기능 0
- [ ] §100 UI 헌법 6 규칙 — `[UI:0]` / `[UI:meta]` / `[UI:rfc]` 라벨 의무
- [ ] §101 데이터/코드 보존 5 원칙 (추가 X, 정리·연결·통합·보강만)
- [ ] §102 자기검증 11 줄 — PR 템플릿 첫 머리에 박힘
- [ ] §125 PR-E 작업 명세 8 단계

위 5 가지 미숙지 상태로 코드 1 줄 작성하지 말 것.

---

## 2. PR-E 작업 정확한 명세 (§125 요약)

**라벨**: `[UI:0]` (UI 0 변경 — 테스트 + CI 파일만 추가)
**브랜치**: `feat/pr-e-regression-safety-net`

### 8 단계
1. **RFC 작성**: `docs/RFC/0001-pr-e-regression-safety-net.md`
2. **Vitest 베이스라인**:
   - `vitest.config.ts` (deps 이미 있음, 설정만)
   - `tests/setup.ts` (msw + supabase mock)
   - `tests/unit/filters-baseline.test.ts` (현재 동작 capture)
3. **Husky + lint-staged** (devDependencies 추가):
   - `husky@^9.0.0`, `lint-staged@^15.0.0`
   - `.husky/pre-commit`: `pnpm lint-staged`
   - `.lintstagedrc.json`: lint + tsc
4. **Golden 50 시드** (`tests/golden/`):
   - 사회초년생 20 (월세/원룸/투룸/지역/예산)
   - 신혼부부 15 (전세/매매/빌라/아파트/학군/출퇴근)
   - 사업자 15 (월세/상가/사무실/권리금/업종)
   - 각 케이스 YAML (PART XII §72.1 형식)
5. **SQL Oracle** (`scripts/sql-oracle.ts`):
   - 같은 필터 → API 응답 ID 집합 vs 직접 SQL ID 집합 → 차집합 0
6. **DOM Snapshot 베이스라인** (`tests/dom-snapshot/`):
   - `/`, `/map`, `/listings/[id]`, `/about` 4 페이지 capture
7. **CI Workflow** (`.github/workflows/regression-gate.yml`):
   - 6 게이트: type / lint / unit / golden / sql-oracle / dom-snapshot
8. **검증 + 머지**: 23 게이트 통과 + Cool-down 24h

### 절대 금지 (UI 헌법)
- 컴포넌트 수정 X
- 새 페이지 / 새 라우트 / 새 컴포넌트 0
- `package.json` 의 `dependencies` 변경 X (devDependencies 만)
- `/features/map-2026/**` 손대지 말 것 (보존)
- `tailwind.config.js` 변경 X

---

## 3. Phase 1 PR 큐 11 개 (순서대로)

| # | PR | 라벨 | 설명 |
|---|----|----|------|
| 1 | **PR-E** | [UI:0] | 회귀 안전망 (지금 시작) |
| 2 | **PR-G** | [UI:0] | listings trigger 5 등록 (rooms 53%→<20% NULL) |
| 3 | **PR-G2** | [UI:meta] | AI trigger 2 + 비용 cap 자동화 |
| 4 | **PR-A** | [UI:0] | type 26→8 정규화 + SSOT registry v0.1 |
| 5 | **PR-F** | [UI:0] | mv_map_listings 보강 (gu + type_normalized) |
| 6 | **PR-B** | [UI:rfc] | NULL 정책 + UI 모달 텍스트 (사장님 승인) |
| 7 | **PR-D** | [UI:meta] | SEO + JSON-LD + sitemap + IndexNow |
| 8 | **PR-C** | [UI:0] | 17 enrichment 데이터 채우기 |
| 9 | **PR-M** | [UI:0]+[UI:rfc] | 접근성 axe-core + 시니어 토글 |
| 10 | **PR-N** | [UI:0] | 모바일 SLO + RUM + PWA + Web Push |
| 11 | **PR-O** | [UI:0] | 법무 자문 결과 통합 (Track B) |

→ Phase 1 → Phase 2 게이트 (§98 9 KPI + 사장님 결단) 통과 후 Phase 2 진입.

---

## 4. 11 줄 자기검증 (모든 PR 의 PR 템플릿 첫 머리)

- [ ] Discovery 없이는 코드 한 줄 안 고친다.
- [ ] 회귀 0 이 아니면 머지 안 한다.
- [ ] 무료/OSS 가 가능한데 유료 안 쓴다.
- [ ] 만든 것은 부수지 않고 더 정교하게 만든다.
- [ ] UI 기본틀은 헌법이다 — 명시 승인 없이 단 한 픽셀도 안 바꾼다.
- [ ] 네이버·구글이 매시간 와서 우리 매물을 좋아하게 만든다.
- [ ] 5 층 방어를 모두 통과하지 못한 변경은 존재하지 않는다.
- [ ] 반복하더라도 0 회귀가 될 때까지 머지하지 않는다.
- [ ] 사회초년생/신혼부부/사업자 — 셋 중 하나의 페인을 풀거나 100% 실매물 보증을 강화한다.
- [ ] Phase 1 = 한계치까지 (새 기능 0). Phase 2 = 그 위에 쌓기 (Phase 1 안정 후만).
- [ ] 이 PR 은 [UI:0] / [UI:meta] / [UI:rfc] 중 하나로 명시되어 있다.

---

## 5. 사장님 결단 한 가지 (PR-E 시작과 병렬 진행 가능)

**Track B 외부 자문**:
- 부동산 전문 변호사 1 회 자문 (₩30~50만, PIPA + 표시광고법 + 청약철회)
- 접근성 인터뷰 1~2 명 (무료~소액)
- 시니어 사용자 인터뷰 1~2 명 (무료)

→ PR-E 와 병렬 진행 추천. 결과는 PR-O / PR-M 에 통합.

---

## 6. Discovery 핵심 발견 요약 (작업 직결)

### 가장 큰 누수 (PR-A 가 차단)
- `type` 컬럼 26 종 정규화 붕괴 (정상 8 + 비정상 18 = 439 건 누수)
- 사용자 "원룸" 검색 시 305 건 사라짐

### 즉시 보강 가능 (PR-G 가 trigger 5 줄로 해결)
- `auto_extract_rooms_bathrooms_from_raw()` 정의됨, trigger 미연결 → rooms/bathrooms 53% NULL
- `auto_extract_options_from_raw_fields()` 정의됨, trigger 미연결 → options 32% NULL
- 추가 3 개 (`auto_calculate_trust_score`, `auto_detect_jeonse_risk`, `auto_fix_problematic_listings`)

### SSOT 부재 (PR-A 가 통합)
enum 정의가 5 곳에 분산:
- DB 실제 분포 (26 종)
- `src/db/schema.ts` (Drizzle, legacy SQLite)
- `src/lib/ai-match-parser.ts` (7 종, 단기 빠짐)
- `src/features/map-2026/components/FilterModal.tsx` (4 deal types)
- `rpc_map_clusters` RPC (검증 없음)

### MV 보강 필요 (PR-F)
- `mv_map_listings` 에 `gu` 컬럼 없음 → 자치구 필터 통과 못 함
- PR-A 후 `type_normalized` 도 추가

### 17 enrichment 컬럼 데이터 0 (PR-C)
- `crime_safety_score`, `noise_level`, `rtms_avg_price` 등 100% NULL
- 무료 공공 API (교육청/에어코리아/경찰청/국토부) 로 채움

---

## 7. 보존 대상 (절대 손대지 말 것)

PART XI §54 + §100 헌법 적용 대상:

- `/features/map-2026/**` 모든 컴포넌트 + 훅
- `MapClientWrapper` WebGL 감지 + 스켈레톤 LCP 최적화
- ConditionalLayout (header 숨김 / dvh 처리)
- 카테고리 탭 → FilterModal Gate 패턴
- 광고 정책 / `status='공개'` 강제 (IDOR 방어 L-sec92)
- PostgREST `.or()` injection 방어 (L-sec106)
- Rate limit 모든 라우트
- Image policy (저작권 보호)
- `stripInternalFieldsArray` (embedding/dedup 노출 차단)
- 디자인 토큰 (`wishes-cream`, `wishes-primary`, `wishes-secondary`)
- Tailwind 색상 / 폰트 / spacing / breakpoint

---

## 8. v8 단 한 줄 비전

> **"이미 있는 것을 한계까지, UI 는 단 한 픽셀도 안 바꾸고,
> 회귀 0 의 자동 게이트 위에서, 사회초년생·신혼부부·사업자가
> 100% 실매물을 직방보다 정확하게 만나는 — 그게 WISHES."**

---

**다음 글자는 코드여야 한다.** PR-E RFC 부터 시작.
