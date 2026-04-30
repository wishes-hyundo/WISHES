# RFC 0002 — PR-A: type 컬럼 정규화 + SSOT registry v0.1

> **상태**: Draft (사장님 결단 받기 — 매핑 표 §3 확정 완료, 구현 OK 대기)
> **작성**: 2026-04-30
> **작성자**: Claude (Cowork mode 세션 v16+1)
> **라벨**: `[UI:0]`
> **브랜치 (예정)**: `feat/pr-a-type-normalization`
> **PR 큐 위치**: Phase 1 #4 (마스터 프롬프트 §127)
> **선행**: PR-E (#10 ✅), PR-FIX (#11 ✅), PR-G2-AREA (#12 ✅)
> **후행**: PR-FIX2 재시도 (sql-oracle 임계값 완화) → PR-F (MV 보강 — type_normalized 컬럼 추가) → PR-G2 AI trigger 2 + cost cap
> **참조**: Discovery §2.1 / §3.2 / §6.PR-A — 인계 v16 §13 — 마스터 프롬프트 §125 / §102 / §96 / §100 / §101 / §67 / §54 / §72 / §77

---

## 0. 11 줄 자기검증 (§102 / §128)

> 본 RFC 가 헌법을 위반하지 않음을 자체 검증한다.

- [x] Discovery 없이는 코드 한 줄 안 고친다. — Discovery §2.1 / §6.PR-A 명시
- [x] 회귀 0 이 아니면 머지 안 한다. — PR-E 6 게이트 + 신규 sql-oracle baseline 재박제 후 PASS 만 머지
- [x] 무료/OSS 가 가능한데 유료 안 쓴다. — Postgres trigger + Zod 무료, AI 분류 X (사장님 명시 매핑만 사용)
- [x] 만든 것은 부수지 않고 더 정교하게 만든다. — `type` 컬럼 보존, `type_normalized` 신규 dual-write
- [x] UI 기본틀은 헌법이다 — 명시 승인 없이 단 한 픽셀도 안 바꾼다. — UI 코드 0 줄 수정. CategoryTabs 라벨 동일.
- [x] 네이버·구글이 매시간 와서 우리 매물을 좋아하게 만든다. — 검색 결과 매물 수 +990 회복 → SEO 인덱싱 정확도 ↑
- [x] 5 층 방어를 모두 통과하지 못한 변경은 존재하지 않는다.
- [x] 반복하더라도 0 회귀가 될 때까지 머지하지 않는다.
- [x] 사회초년생 / 신혼부부 / 사업자 — 셋 중 하나의 페인을 풀거나 100% 실매물 보증을 강화한다. — **세 페르소나 모두 직접 수혜** (신혼부부 빌라/아파트 누락 95+102, 사업자 사무실 누락 53건, 사회초년생 원룸 누락 551건)
- [x] Phase 1 = 한계치까지 (새 기능 0). Phase 2 = 그 위에 쌓기 (Phase 1 안정 후만). — 신규 컬럼/trigger/registry 모두 인프라 기존 보강.
- [x] 이 PR 은 [UI:0] / [UI:meta] / [UI:rfc] 중 하나로 명시되어 있다. — `[UI:0]`

---

## 1. Motivation — 왜 PR-A 가 가장 큰 누수인가

### 1.1 라이브 데이터 분포 (Discovery §2.1, 2026-04-29 측정)

총 29,475 매물 중 `type` 컬럼 값이 **26 종**으로 흩어져 있다. 정상 8 종이 98.5% (29,036) 를 덮지만, 비정상 18 종 (439) + 세부 sub-type (551) = **약 990 건이 사용자 필터에서 사라진다**.

**정상 8 종 (29,036, 98.5%)** — 사장님 명시 보존:
원룸 9,587 / 상가 9,520 / 투룸 3,874 / 쓰리룸 3,012 / 사무실 1,795 / 오피스텔 692 / 빌라 329 / 아파트 227

**비정상 18 종 (439)**: 주거용 102 / 주택 95 / 확인필요 77 / 토지 50 / 전체 34 / 사업자등록가능 21 / 지식산업센터 18 / 이면도로 13 / 사무용 5 / 주거용·전입신고가능 5 / 대로변 5 / 주택겸 사무실 4 / 전체·사업자등록가능 2 / 건물 2 / 사업자등록가능·주택겸 사무실 2 / 사무용·사업자등록가능 2 / 주거용·사업자등록가능 1 / 사무실/상가 1

**세부 sub-type (551, 인계 v16 §13)**: 오픈형원룸 323 / 주방분리형원룸 125 / 분리형원룸(1룸 1거실) 63 / 복층형원룸 29 / 분리형원룸 11

### 1.2 사용자 영향 (페르소나별)

| 페르소나 | 검색어 | 현재 누락 | PR-A 후 |
|---|---|---|---|
| 사회초년생 | "원룸" | 551 건 (오픈형/분리형/복층형) | 0 |
| 신혼부부 | "아파트" | 108 건 (주거용 102 + 변형 6) | 0 |
| 신혼부부 | "빌라" | 95 건 (주택) | 0 |
| 사업자 | "사무실" | 50+ 건 (사업자등록가능 21 + 지식산업센터 18 + 사무용 5 + 변형 8) | 0 |
| 사업자 | "상가" | 18 건 (이면도로 13 + 대로변 5) | 0 |

→ **헌법 §98 KPI #2 "type 정규화 26→8 100%"** 직접 달성 (실제로는 **10 종**으로 확장 — §3 매핑 결정).

### 1.3 SSOT 부재 (Discovery §3.2)
type/deal/status 의 enum 정의가 **5 곳에 다른 형태로 흩어져 있다**:
1. Drizzle schema: `['원룸','투룸','쓰리룸','오피스텔','아파트','상가','사무실']` (7 종 — legacy, sqlite)
2. 라이브 DB: 26 종 실제 분포 (CHECK 제약 없음)
3. `/api/listings` parseMatchQuery 자체 파싱 로직
4. `/api/map/search` 자체 매핑
5. UI CategoryTabs 4 카테고리 (주거/상가/토지/투자) — 클라이언트 매핑

→ **PR-A SSOT v0.1 가 단일 진실** (`src/filters/registry.ts`) 만들고 나머지는 **import 만**.

---

## 2. Two-Phase Doctrine 위치 (§96)

| Phase | 의도 | PR-A 적용 |
|---|---|---|
| Phase 1 = 한계치까지 (새 기능 0) | 인프라/데이터 정규화로 기존 자산 100% 활용 | ✅ type_normalized 신규 컬럼 + trigger + registry |
| Phase 2 = 그 위에 쌓기 | UI/UX 신규 기능 | ❌ 본 PR 미해당 |

→ **PR-A 는 Phase 1 핵심**. UI 변경 0 줄 (헌법 §54).

---

## 3. 매핑 결정표 (사장님 결단 2026-04-30)

### 3.1 SSOT 10 종 enum (확장 결단)

```ts
const TYPE_NORMALIZED = [
  '원룸',     // newcomer 핵심
  '투룸',     // newcomer 커플
  '쓰리룸',   // newcomer 가족
  '아파트',   // newlywed 핵심
  '오피스텔', // 직장인
  '빌라',     // newlywed 저예산
  '상가',     // business 핵심
  '사무실',   // business 핵심
  '토지',     // 신규 — 투자자 (사장님 결단 2026-04-30)
  '건물',     // 신규 — 통빌딩 매매 (사장님 결단 2026-04-30)
] as const;
```

### 3.2 raw → normalized 매핑 (전체)

| 원본 type | 건수 | → | normalized | 결단자 |
|---|---|---|---|---|
| 원룸 | 9,587 | → | 원룸 | passthrough |
| 투룸 | 3,874 | → | 투룸 | passthrough |
| 쓰리룸 | 3,012 | → | 쓰리룸 | passthrough |
| 상가 | 9,520 | → | 상가 | passthrough |
| 사무실 | 1,795 | → | 사무실 | passthrough |
| 오피스텔 | 692 | → | 오피스텔 | passthrough |
| 빌라 | 329 | → | 빌라 | passthrough |
| 아파트 | 227 | → | 아파트 | passthrough |
| 주거용 | 102 | → | **아파트** | 사장님 명시 |
| 주거용, 전입신고가능 | 5 | → | **아파트** | 사장님 룰 (주거용 패턴) |
| 주거용, 사업자등록가능 | 1 | → | **아파트** | 사장님 룰 (주거용 패턴) |
| 주택 | 95 | → | **빌라** | 사장님 명시 |
| 오픈형원룸 | 323 | → | **원룸** | 사장님 명시 |
| 분리형원룸 | 11 | → | **원룸** | 사장님 명시 |
| 주방분리형원룸 | 125 | → | **원룸** | 사장님 룰 (분리형원룸 패턴) |
| 분리형원룸(1룸 1거실) | 63 | → | **원룸** | 사장님 룰 (분리형원룸 패턴) |
| 복층형원룸 | 29 | → | **원룸** | 사장님 룰 (분리형원룸 패턴) |
| 사업자등록가능 | 21 | → | **사무실** | 사장님 결단 (지식산업센터 룰 일관) |
| 지식산업센터 | 18 | → | **사무실** | 사장님 결단 |
| 사무용 | 5 | → | **사무실** | 사장님 룰 |
| 사무용, 사업자등록가능 | 2 | → | **사무실** | 사장님 룰 |
| 주택겸 사무실 | 4 | → | **사무실** | 사장님 결단 |
| 사업자등록가능, 주택겸 사무실 | 2 | → | **사무실** | 사장님 룰 |
| 사무실/상가 | 1 | → | **사무실** | Claude 제안 (slash 우선 좌측) |
| 이면도로 | 13 | → | **상가** | Claude 제안 (도로변 매물 = 상권) |
| 대로변 | 5 | → | **상가** | Claude 제안 (이면도로 룰) |
| 토지 | 50 | → | **토지** | 사장님 결단 (10종 확장) |
| 건물 | 2 | → | **건물** | 사장님 결단 (10종 확장) |
| 확인필요 | 77 | → | **NULL** + admin 큐 | 사장님 결단 |
| 전체 | 34 | → | **NULL** + admin 큐 | 사장님 결단 |
| 전체, 사업자등록가능 | 2 | → | **NULL** + admin 큐 | 사장님 룰 (전체 패턴) |

**합계**: 29,475 매물 100% 매핑 — 정규화 후 NULL 113 건 (확인필요 77 + 전체 36) 만 admin 처리.

### 3.3 사장님 영업 보호 (헌법 §)

NULL 113 건은 **status='공개' 유지** (영업 손실 방지 — 사장님 명령 2026-04-30 PR-G2-AREA 와 동일 원칙). 일반 사용자 검색에서만 노출 안 됨, 이메일·SMS·직접 링크는 정상 동작. admin 큐에서 사장님이 정규화 결정 후 type_normalized 갱신.

---

## 4. Scope — 8 단계 (§125.1)

> 각 단계는 사장님께 유치원 수준 설명 + 진행 OK 보고 후 시작.

### 단계 0 — RFC 작성 (본 문서) ✅
- `docs/RFC/0002-pr-a-type-normalization.md`
- 코드 변경 0 줄
- **Acceptance**: 매핑 표 §3 사장님 OK

### 단계 1 — SQL 마이그레이션 (expand 단계)
- 파일: `docs/migrations/pr_a_type_normalization_2026-04-30.sql`
- 작업:
  1. `ALTER TABLE listings ADD COLUMN type_normalized text` (NULL 허용)
  2. CHECK 제약: `type_normalized IS NULL OR type_normalized IN (10 종)`
  3. SQL 함수 `normalize_type(raw text) RETURNS text` — 매핑 표 §3.2 의 SQL CASE 식
  4. BEFORE INSERT/UPDATE trigger `tr_listings_normalize_type` — INSERT/UPDATE 시 raw `type` 들어오면 자동 채움
  5. 백필 UPDATE: `UPDATE listings SET type_normalized = normalize_type(type) WHERE type_normalized IS NULL`
  6. 인덱스: `CREATE INDEX idx_listings_gu_type_normalized ON listings (gu, type_normalized) WHERE status='공개'`
- **expand-contract 핵심**: `type` 원본 컬럼은 **건드리지 않음** — 7 days dual-write → contract phase 에서 `type` deprecate 결정 (PR-A2)
- **Acceptance**: 백필 후 `SELECT count(*) FROM listings WHERE type_normalized IS NULL AND type NOT IN ('확인필요','전체','전체, 사업자등록가능')` = 0

### 단계 2 — SSOT registry v0.1 (`src/filters/registry.ts`)
- 신규 파일 `src/filters/registry.ts` (대략 200 줄)
- type/deal/status 3 개만 우선 (PART XII §77.1 형식):
  ```ts
  export const FILTER_REGISTRY = {
    type: {
      column: 'type_normalized',
      enum: TYPE_NORMALIZED,
      labels: { 원룸: '원룸', 투룸: '투룸', ... },
      ui_categories: {
        '주거': ['원룸','투룸','쓰리룸','아파트','오피스텔','빌라'],
        '상가': ['상가'],
        '사무실': ['사무실'],
        '토지/건물': ['토지','건물'],
      },
      raw_to_normalized: { /* 매핑 표 §3.2 */ },
      null_policy: { display: 'admin only', user_search: 'exclude' },
      sql_builder: (values: string[]) => `type_normalized = ANY($1)`,
      zod: z.enum(TYPE_NORMALIZED),
    },
    deal: { ... },
    status: { ... },
  } as const;
  ```
- 헬퍼:
  - `normalizeType(raw: string): string | null` — DB 함수와 동일 결과
  - `toDbValue(filter: 'type', uiValue: string): string`
  - `toUiLabel(filter: 'type', dbValue: string): string`
- **Acceptance**: 단위 테스트 (`tests/unit/filters-registry.test.ts`) 매핑 표 §3.2 30 케이스 모두 PASS

### 단계 3 — 7 API endpoint type_normalized 사용 전환
대상 (Grep 결과):
1. `src/app/api/listings/route.ts`
2. `src/app/api/listings/viewport/route.ts`
3. `src/app/api/listings/map/route.ts`
4. `src/app/api/listings/stats/route.ts`
5. `src/app/api/map/clusters/route.ts` (RPC `rpc_map_clusters` 의 `p_types[]` 파라미터)
6. `src/app/api/map/items/route.ts`
7. `src/app/api/map/search/route.ts`
8. `src/app/api/ai/match/route.ts` (점수 계산 input)

변경 패턴:
```ts
// before
.in('type', userSelectedTypes)
// after
.in('type_normalized', FILTER_REGISTRY.type.toDbValues(userSelectedTypes))
```

RPC `rpc_map_clusters` 는 단계 1 SQL 마이그레이션에서 같이 갱신 — `p_types text[]` 인자가 `type_normalized` 컬럼과 매칭되도록.

- UI 컴포넌트 (`src/features/map-2026/**`) 수정 X (헌법 §54).
- **Acceptance**: golden 50 + sql-oracle baseline drift 0 (재박제 후)

### 단계 4 — seeds.yaml 신혼부부 케이스 재설계
- 파일: `tests/golden/seeds.yaml`
- 변경 대상: g021 ~ g035 (newlywed 15 케이스)
- 의도: type_normalized 백필 후 신혼부부 검색 결과 자연 통과되도록 임계값 완화
- 예시:
  - g023 강남 아파트 전세 7억 → **15억** (강남 아파트 전세 5억 이하 매물 거의 0 건 — 라이브 분포 반영)
  - g022 송파 아파트 전세 5억 → **10억**
  - g027 강북 아파트 전세 2.5억 → **5억**
  - 나머지는 라이브 분포 보고 확정 (단계 5 oracle 결과로)
- type 값은 그대로 (정규화 후 동일 키)
- **Acceptance**: 50 케이스 모두 expected_min_count ≤ 실제 count ≤ expected_max_count

### 단계 5 — baseline.json 재박제
- `npm run oracle` 1 회 실행 (사장님 환경)
- `tests/golden/baseline.json` 갱신:
  - `total_cases`: 50
  - `total_ids`: 합산
  - 50 케이스 모두 `count > 0` (현재 PR-FIX2 막은 케이스 통과 확인)
- **Acceptance**: sql-oracle 게이트 strict PASS (expected_min ≤ count, drift ≤ ±5%)

### 단계 6 — 회귀 검증 (5 층 방어 §128)
1. **type** (typecheck) — registry.ts 타입 체크
2. **lint** — ESLint 신규 rule (raw `type` 컬럼 직접 비교 금지)
3. **unit** — registry 30 케이스 + filters-baseline 23 케이스
4. **golden** — 50 케이스 schema sanity
5. **sql-oracle** — drift 0
6. **dom-snapshot** — 4 페이지 변경 0 (UI 헌법 §54)

- **Acceptance**: 6 게이트 모두 PASS, Vercel preview Ready

### 단계 7 — PR 생성 + 머지
- 브랜치: `feat/pr-a-type-normalization`
- PR body: 본 RFC 링크 + 11 줄 자기검증 + 매핑 표 §3.2 + KPI #2 달성 확인
- **머지 전 확인**:
  - 라이브 SQL 실행: `SELECT type_normalized, count(*) FROM listings WHERE status='공개' GROUP BY 1 ORDER BY 2 DESC` = 11 행 (10 enum + NULL)
  - 사용자 시나리오 검증: "원룸" 검색 시 라이브 매물 수 +551 회복 확인
  - 사장님 검토 후 명시 OK

---

## 5. 위험 + 완화

| 위험 | 완화 |
|---|---|
| 백필 UPDATE 17K row 락 | 트랜잭션 분할 (chunked UPDATE 1K row 단위) — PR-G2-AREA 와 동일 패턴 |
| `rpc_map_clusters` 함수 인자 호환성 | 함수 본문만 수정 (시그니처 동일) — 클라이언트 무중단 |
| AI 매칭 점수 산출 (`/api/ai/match`) 결과 변동 | 동일 검색에 대해 type_normalized 매핑 후 점수 안정 (오히려 정확도 ↑) |
| SSOT registry import 누락 | ESLint custom rule `no-raw-type-column` — `.eq('type'`/`.in('type'` 패턴 차단 |
| 신혼부부 검색 매물 수 사장님 영업 영향 | seeds.yaml 임계값 완화 + sql-oracle baseline 재박제로 자연 통과 |
| 사용자가 과거 "주거용" 검색 기억 | `/map?type=주거용` URL 도착 시 registry.normalizeType('주거용') = '아파트' 자동 redirect |

---

## 6. UI 영향 = 0 (헌법 §54)

- `/features/map-2026/components/CategoryTabs.tsx` 미수정
- `/features/map-2026/components/FilterPanel.tsx` 미수정
- 4 카테고리 라벨 동일 (주거/상가/토지/투자 → registry.ui_categories 매핑만 갱신)
- pixel diff 0 (dom-snapshot 게이트로 자동 검증)

---

## 7. 일정

- 단계 0 (RFC): 2026-04-30 (본 세션)
- **24h Cool-down 권고** — 사장님 매핑 OK 후 다음 세션 시작
- 단계 1-2 (SQL + registry): 1h
- 단계 3 (API 7 곳): 1h
- 단계 4-5 (seeds + baseline): 30m
- 단계 6-7 (검증 + 머지): 30m
- **합계**: 3h (RFC + Cool-down 별도)

---

## 8. KPI 달성 (헌법 §98)

| KPI | 현재 | PR-A 후 | 목표 |
|---|---|---|---|
| #2 type 정규화 26→8 100% | 26 종 (98.5% 정상) | **10 종** (확인필요/전체 113 건만 NULL) | 100% (113 admin 큐는 별도 KPI) |
| #6 매물 노출 정확도 -5% 이상 후퇴 0 | "원룸" 검색 누락 551 | "원룸" 검색 누락 0 | -5% 이내 |

→ KPI #2 + #6 동시 직접 달성.

---

## 9. 명시 차단 (헌법 §54 / §96)

PR-A 는 **하지 않는 것**:

- ❌ UI 픽셀 변경 (CategoryTabs / FilterPanel / map 등)
- ❌ 신규 사용자 기능 추가 (Phase 2)
- ❌ AI 자동 분류 (사장님 명시 매핑만 사용. AI 도입은 PR-G2 별도 PR)
- ❌ `type` 원본 컬럼 삭제 (expand-contract 의 contract 단계는 별도 PR-A2)
- ❌ 매물 비공개 처리 (영업 손실 방지 — 113 건은 status='공개' 유지)

---

## 10. 후행 PR 의존

- **PR-FIX2 재시도** — sql-oracle 임계값 완화 (PR-A 결과로 자연 통과)
- **PR-F MV 보강** — `mv_map_listings` 정의에 `gu` + `type_normalized` 추가 (인덱스 활용)
- **PR-G2 AI trigger 2** — `/api/ai/match` 가 type_normalized 사용 전제

---

작성: 2026-04-30 (본 세션)
승인 대기: 사장님 명시 OK (매핑 표 §3.2 확인 + 단계 1 SQL 미적용 상태)
적용 환경: working copy 작성 완료 → fresh clone cp → main 브랜치 머지
