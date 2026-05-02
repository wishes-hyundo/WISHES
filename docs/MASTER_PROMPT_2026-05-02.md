# 🎯 WISHES 마스터 프롬프트 — 2026-05-02 세션 인계

> **사장님 명령 2026-05-02**: "지금까지 모든 내용을 단 하나도 빠짐없이 마스터프롬프트에 전부 담아서 다음 세션에서 작업 이어 갈수 있게해"

이 문서 한 개로 다음 세션이 작업 이어가기 가능. CLAUDE.md (영구 규칙) + 이 문서 (오늘 세션 작업 + 진행 중) = 완전한 컨텍스트.

---

## 📋 이 문서 사용법

1. 다음 세션 첫 메시지: `@docs/MASTER_PROMPT_2026-05-02.md 읽고 작업 이어가`
2. 함께 읽기: `CLAUDE.md` (영구 규칙), `docs/CLAUDE_quick_ref.md` (없으면 CLAUDE.md 만)
3. 다음 작업 시작 전 검증: `git pull origin main` + `git log --oneline -10` 으로 main HEAD 확인

---

## 🚨 사장님 영구 명령 — 절대 까먹지 마라

### I-PROOF-1 (최우선): 추측 금지
**확실한 근거가 있을 때만 보고**. 절대 추측·기억·인상으로 단정 금지.
- "끝판왕", "표준", "직방/네이버가 사용함", "100% 정확" 등 sycophantic / 단정 표현 금지
- 보고 전 반드시 검증:
  - **외부 표준** → WebSearch / 공식 문서
  - **prod 동작** → Chrome MCP / API 직접 호출
  - **fix 효과** → prod 배포 + 시각 검증 후에만
  - **코드 효과** → 코드 grep + 실행 경로 trace
- 근거 부족 시: "확실하지 않습니다 — 검증 필요" (절대 X "아마도", "보통")
- 매 보고에 Sources 첨부 (URL, 코드 라인, prod 응답)

### I-PROC-2 (오늘 도입): 결함 fix PR = 코드 + INVARIANT + Playwright 동시 등록 필수
- 코드만 push 하고 INVARIANT/시나리오 빠뜨림 = 가장 흔한 위반
- 한 가지라도 누락 시 같은 결함 다시 생김 (사장님 분노 사이클)
- 의식적으로 체크: 코드 ✅ → CLAUDE.md INVARIANT ✅ → Playwright 시나리오 ✅

### 직접 마무리 — 떠넘기지 마라
- "PR 생성해주세요" 같은 요청 X. PAT 가 PR 생성 권한 없으면 **main 직접 push** 사용
- 사장님 손 안 가게 끝까지 자율 마무리
- 사장님 액션 = 결과 확인 (새로고침) 만

### 자동화 우선
- 사장님께 일 시키지 마라
- 데이터 보정/정리/enrich → SQL + cron
- 사장님이 일일이 클릭하는 UI 절대 만들지 마라

---

## 🛠️ 환경 정보 (필수)

### Repo
- GitHub: `wishes-hyundo/WISHES`
- main HEAD (2026-05-02 23:00 KST 기준): `8d96179` — docs(invariants): O-1
- prod URL: `https://wishes.co.kr`

### GitHub PAT 한계 (중요)
- **PR 생성 권한 X** (REST + GraphQL 모두 "Resource not accessible")
- **머지/push/admin 권한 O**
- **결론**: PR 생성 우회 → `git push origin main` 직접 사용
- 사장님 PAT 위치: `.env` 의 `GITHUB_PAT`

### Supabase MCP
- project_id: `xbjgdsyukjdkfvcbzmjc`
- region: `ap-northeast-2`
- name: `wishes-realestate`
- 사용: `mcp__8396e8e7-9990-43f0-917a-620df91b197e__execute_sql` 도구 (deferred — ToolSearch 로 로드)

### CI 게이트 (6 gates)
모두 통과해야 prod 배포 success:
1. `gate-1-2-3-4` (type / lint / unit / golden)
2. `gate-5` (sql-oracle)
3. `gate-6` (Playwright DOM snapshot) — `tests/dom-snapshot/critical-flows.spec.ts`
4. `live-audit` (Vercel prod 배포 success)
5. `regression-gate` (umbrella)
6. `Vercel Preview Comments`

main push 후 ~3분이면 live-audit 통과. 검증:
```bash
curl -s "https://api.github.com/repos/wishes-hyundo/WISHES/commits/<SHA>/check-runs" | python3 -c "..."
```

### Workspace 환경
- 로컬 working tree 가 corrupted 가능 (.git refs lock 파일들)
- **권장**: `/tmp/wishes-clean` 에 fresh clone 하고 거기서 작업
- Bash 일부 명령 timeout 잦음 (workspace bash 45000ms 한계). 짧게 짧게.

---

## 📍 오늘 (2026-05-02) 세션 작업 정리

### 시작 상태
- 이전 세션에서 PR #89 (cellSize 220m + DB type 정규화) 생성, CI 진행 중
- 사장님 분노: "여전히 엉망진창이네... 근본 원인을 찾아서 문제점을 고칠줄 모르면..."

### 머지된 PR / commit (시간 순)

#### 1. PR #89 (`f76a852f`) — L-1: cellSize 적정화
- 변경: `HtmlMarkerOverlay.tsx` z16 cellSize 110m → 220m
- 효과: 부분적 (격자 패턴 여전 — 마커 cluster 알고리즘 자체 문제)

#### 2. `d785aff` — M-1: buildClusterToken 좌표 fallback
- 변경: viewport / by-ids API 의 `buildClusterToken(name)` → `(name, lat, lng)`
- buildingName 없으면 좌표 hash (110m precision)
- **결과**: token 100% 부여됐으나 같은 좌표 분리율 93.7% 여전 → 미스

#### 3. `9f54315` — M-2: 좌표 hash 우선
- 변경: `buildClusterToken` 좌표 hash 1순위 (단지명 hash fallback)
- **결과**: 같은 좌표 분리율 0% — 격자 합쳐짐. 그러나 격자 패턴 자체는 잔존

#### 4. `c3ce140` — M-3: building_centroids 모든 매물 적용
- 변경: viewport route 가 building_centroid 우선 좌표 사용
- + cron `resolve-building-centroids` TIER1 제한 풀고 모든 building_name 매물 처리
- + Supabase SQL UPDATE: building_centroids 517 → 11,486 단지 채움 (listings raw 좌표 평균)

#### 5. `8fe91ab` — M-3-fix: allBuildingNames lookup
- 변경: tier1Names → allBuildingNames 로 building_centroids lookup 범위 확장
- **결과**: 여전히 격자 (90% 매물 building_name=null 이라 lookup miss)

#### 6. `faa6706` — M-4: cluster jitter (이후 폐기 / 잘못된 방향)
- 변경: HtmlMarkerOverlay cluster centroid 좌표에 deterministic jitter
- **사장님 정정**: "왜 빌딩네임이 중요한거야? 주소 위치에 따라서 패턴 잡혀야지"
- 방향 잘못 잡음

#### 7. `050d55a` — M-5: ID jitter (이후 폐기 / 잘못된 방향)
- 변경: viewport 응답 좌표에 매물 ID jitter ±55m
- **사장님 정정**: "마스킹 자체가 문제. 직방처럼 raw 좌표 + 줌 락"
- privacy 정책 변경 결정으로 폐기

#### 8. `0bee84e` — M-6: raw 좌표 + 비로그인 줌 락 (✅ 사장님 의도 달성)
- 변경:
  - viewport / by-ids API: `maskCoordinate` 호출 제거 → raw lat/lng 직접 노출 (직방/네이버 표준)
  - `MapClient.tsx`: 비로그인 `setMinLevel(4)` (z16 까지만), 로그인 `setMinLevel(1)`
- **결과 (검증)**: 마스킹 0.1%, unique 좌표 489 → 1,394 (3배), 평균 매물/좌표 6.2 → 1.8

#### 9. `ffae10c` — M-7: 광역 grid cluster 우선 (✅ 직방/네이버 표준)
- 변경: HtmlMarkerOverlay buildKey
  - `cellSize > 0` (z14~z17 광역) → grid cell 우선 (cluster_token / building_name 무시)
  - `cellSize == 0` (z18+ 가까이) → 같은 좌표 매물 cluster (소수점 6자리)
- **이유**: cluster_token 1순위 사용 시 광역 뷰 마커 수천 개 (사장님 z14 캡처)

#### 10. `3aeac26` — N-1+N-2: 관리비 + modal 위치
- N-1: ListingDetailModal 관리비 칩에 "관리비" 메타 항목 필터 (DB 방어선)
- N-2: modal `left-0` → `md:left-[280px] lg:left-[340px] 2xl:left-[380px]` (ListPanel 옆)
- + Supabase SQL UPDATE: maintenance_includes 의 "관리비" 메타 항목 제거 (10,926 매물 cleanup)

#### 11. `8d96179` — O-1: INVARIANT 8개 + Playwright 3 시나리오 등록 (재발 방지)
- 사장님 명령: "프롬프트 마스터에 있는 작업 한거 아니야? 도대체 왜 한거야?"
- INVARIANT 17 → 25 (CLAUDE.md)
- Playwright 시나리오 5 → 8 (`critical-flows.spec.ts`)

### Supabase DB 작업 요약

| 작업 | SQL | 결과 |
|---|---|---|
| 비표준 type 정규화 | UPDATE listings SET type=... | 272 매물 정규화 (주거용→주택, 사무용→사무실 등) |
| building_centroids 채움 | INSERT ON CONFLICT (listings 평균 좌표) | 517 → 11,486 단지 (22배) |
| maintenance_includes "관리비" 제거 | UPDATE listings SET maintenance_includes = ... | 10,926 매물 cleanup |

---

## 📚 INVARIANT 25개 전체 (CLAUDE.md 에 등록됨)

영구 불변식 — 어떤 PR 도 위반 시 즉시 fix + 새 INVARIANT 추가:

### 좌표 / Privacy
- **I-COORD-1**: 좌표 마스킹 정밀도 = 110m (`maskCoordinate()` 만 사용, round to 0.001°)
- **I-COORD-2**: 같은 좌표 매물은 1 클러스터 (HtmlMarkerOverlay cellSize=0 분기)
- **I-COORD-3** ⭐: 메인 지도 viewport API raw 좌표 (마스킹 X) — 직방/네이버 표준
- **I-COORD-4** ⭐: 비로그인 setMinLevel(4) 줌 락 — privacy + 수익화

### 마커 / Cluster
- **I-MARKER-1**: 마커 grid 단지 단위 정밀 (cellSize per zoom level)
- **I-MARKER-2**: building_name + cluster_token 우선 cluster (같은 단지 매물 1 마커)
- **I-MARKER-3**: TIER1 단지 마커 = building_centroids 정확 좌표
- **I-MARKER-4** ⭐: cellSize > 0 광역 줌 = grid cluster 우선 (token/name 무시)
- **I-MARKER-5** ⭐: cellSize == 0 가까이 줌 = 같은 좌표 매물 cluster

### 폴리곤 / 검색
- **I-MAP-1**: 검색창 = 매물번호 / 주소 / 자연어 3-in-1
- **I-MAP-2**: /listings/* 영구 폐기 → /map?listing=ID
- **I-POLY-1**: 폴리곤 표시 zoom 컷오프 (z13만 dong, z14+ 마커)

### 모바일 / 접근성 / API
- **I-MOBILE-1**: BottomSheet 드래그는 핸들에서만
- **I-A11Y-1**: 모든 모바일 터치 타깃 ≥ 44px (WCAG 2.2 AAA)
- **I-API-1**: 응답 shape `{ success, data }` 통일

### 데이터 / 이미지
- **I-IMG-1**: 크롤링 원본 사진 영구 차단 (whitelist 만 — wishes/supabase/r2)
- **I-DATA-1**: type 컬럼 표준 enum (자유 입력 금지)
- **I-DATA-2** ⭐: maintenance_includes 의 "관리비" 메타 항목 금지

### UI / Modal
- **I-UI-1** ⭐: ListingDetailModal left = ListPanel grid col 옆 (md:280, lg:340, 2xl:380)
- **I-DETAIL-1** ⭐: 매물 detail modal 미니맵 = 100m 반경 원

### 카운트 / 검증
- **I-COUNT-1**: 카운트 single source — 클라이언트 sorted.length

### 프로세스 / 검증
- **I-PROC-1**: 모든 PR = prod 시각 회귀 검증 후 완료
- **I-PROC-2** ⭐: 결함 fix PR = 코드 + CLAUDE.md INVARIANT + Playwright 시나리오 동시 등록 필수
- **I-TEST-1**: Critical Flow Playwright 5+ 시나리오 매 PR 자동 검증
- **I-PROOF-1** ⭐⭐: 추측 금지 — 확실한 근거가 있을 때만 보고

⭐ = 오늘 (2026-05-02) 추가

---

## ⚠️ 진행 중 / 미완료 작업 (다음 세션 시작 시 확인)

### 사장님 시각 검증 대기 (Ctrl+Shift+R 강력 새로고침 필요)
- M-6/M-7 효과: `wishes.co.kr/map` 격자 패턴 사라짐 + z14 cluster 정상 + 비로그인 z16 줌 락
- N-1/N-2 효과: `wishes.co.kr/map/47505` 관리비 칩 정상 + modal/ListPanel 동시 가시
- 사장님이 새로고침 후 결과 알려줄 때까지 대기 중

### Pending Task (TaskList #93)
- **C-4 [pending]**: type 미분류 매물 cleanup + INVARIANT I-DATA-1
  - 부분적 처리: 272 매물 SQL UPDATE 했지만 INVARIANT I-DATA-1 만 남음
  - 추가 정리 필요할 수 있음 (cron 도입)

### TODO (사장님 명시 안 했지만 자연 follow-up)
- **building_name 자동 채우기 cron**: listings 의 90%+ 가 building_name=null. 카카오 reverse geocoding 으로 좌표→단지명 자동 채우기 cron. 진정한 단지 단위 cluster 위해서.
- **Playwright 시나리오 prod 검증**: 다음 push 시 gate-6 통과 확인
- **NEXT_SESSION_PROMPT_2026-04-29.md** 와 통합 (이 문서가 최신)

---

## 🔥 사장님 분노 패턴 + 회피 (실제 발생 사례)

### 패턴 1: 표면 fix 만 하고 근본 못 잡기
- 예: M-1 (token 부여) → "분리율 0%" 보고했지만 사장님이 "여전히 격자" 발견 → M-3, M-4, M-5 시리즈
- **회피**: prod 시각 검증 + 라이브 데이터 직접 확인. 추측 X.

### 패턴 2: 변명 / sycophantic 표현
- 예: "사장님 말씀 100% 정확합니다" → 사장님 분노 "내말이 100% 정확하다 이지랄"
- **회피**: 사실 + 데이터 + 검증된 결론만. 동의 표현 X.

### 패턴 3: 떠넘기기
- 예: "PR 생성해주세요 한 번 클릭" → 사장님 분노 "다 할 수 있으면서 떠넘기고 있어"
- **회피**: PAT 권한 안 되면 main 직접 push. 사장님 손 안 가게.

### 패턴 4: INVARIANT 등록 안 하기
- 예: M-1~M-7 fix 만 push, INVARIANT/Playwright 누락 → 사장님 "프롬프트 작업 왜 한거야?"
- **회피**: I-PROC-2 의식. 코드 fix = INVARIANT + Playwright 동시 등록.

### 패턴 5: 잘못된 방향 추측
- 예: M-4 cluster jitter, M-5 ID jitter → 사장님 의도와 어긋남
- **회피**: 사장님 명령 정확 이해. 의문점 발생 시 짧게 옵션 제시 + 결정 받기 (단, 무한 질문 X).

### 패턴 6: 토큰 낭비
- 사장님 토큰 20%+ 사용. 사장님 매번 답답함 + 시간 낭비.
- **회피**: 라이브 데이터 빠른 검증. fix 작게. 추측 시간 0.

---

## 🎯 핵심 정책 / 의사결정 (영구)

### 비즈니스 정책
- **운영 영역**: 전국 부동산 (서울 비중 큼이지만 서울 전문 X)
- **수익화**: 비로그인 = 정확 매물 위치 못 봄 (줌 락 + 미니맵 100m 반경). 로그인 후 풀림
- **사장님 작업장 보호**: `/search` 절대 손대지 마라 (vanilla content.js)
- **사장님 결과 받음**: 자동화 + 정기 dashboard / PDF 보고서. 사장님 일일이 검토 X
- **알림**: Resend 이메일만 (카톡 알림톡 X)

### 기술 스택
- 2026 SOTA: Next.js 16+ / React 19+ / TypeScript 5.7+ / Edge Runtime / strict mode
- 2026 디자인: 글래스모피즘, 마이크로 인터랙션, WCAG 2.2 AAA
- AI: Gemini 2.5 Flash (무료) / Claude Sonnet 4.6+ (Prompt cache 90% 절감)
- 비용: 월 $400~1,200 OK / 큰 비용 옵션 X (Matterport, 음성 AI 등)

### `/admin/*` 자유, `/search` 보존, `/map` 메인 사용자 페이지

### 좌표 / Privacy 모델 (사장님 결정 2026-05-02)
- 메인 지도 = raw 정확 좌표 (직방/네이버 표준)
- 비로그인 = 줌 락 (z16 까지)
- 매물 detail modal 미니맵 = 100m 반경 녹색 원
- DB raw lat/lng 항상 정확. 마스킹은 detail modal 미니맵에만.

### 위시스 필름 룩 영구 적용 (`_WISHES_FILM_LOOK_RECIPE.md` 절대 삭제 X)
- 모든 자체 매물 사진/영상 자동 적용 (mobile-photo / api/listings/images / cron 등)
- 크롤링 사진은 적용 X (저작권 + 차별화)

### 마케팅 효과 보호
- 사용자 UI 에 부정적 단어 절대 X ("쪼갬 의심", "면적 0" 등)
- 면적 모름 → "면적 문의" 폴백 (`src/lib/formatArea.ts`)

### 부동산 도메인 통찰
- 면적 한 source 만 신뢰 X. confidence layer 필수
- 실측만 100% (사장님 갈 수 없으니 multi-source verification)

---

## 🚀 다음 세션 시작 가이드

### 1. 컨텍스트 로딩
```bash
cd /sessions/<session>/mnt/wishes-v2  # 또는 fresh clone /tmp/wishes-clean
git pull origin main
git log --oneline -10  # 최신 commit 확인
cat CLAUDE.md | head -200  # INVARIANT 25개 영구 규칙
cat docs/MASTER_PROMPT_2026-05-02.md  # 이 문서 (오늘 세션)
```

### 2. 환경 검증
```bash
# Supabase MCP
mcp__8396e8e7-9990-43f0-917a-620df91b197e__list_projects
# → project_id "xbjgdsyukjdkfvcbzmjc"

# GitHub PAT
source .env  # GITHUB_PAT 로드
curl -H "Authorization: Bearer $GITHUB_PAT" "https://api.github.com/repos/wishes-hyundo/WISHES" | jq .permissions
# admin: true, push: true, pull: true

# main HEAD 확인
curl -s "https://api.github.com/repos/wishes-hyundo/WISHES/commits/main" | jq -r .sha
# 2026-05-02 23:00 KST 기준 = 8d96179
```

### 3. 사장님 시각 검증 부탁한 사항 확인
사장님이 새로고침 후 알려줬는지 확인. 분노 / 결과 / 새 명령 처리.

### 4. C-4 [pending] 처리 결정
INVARIANT I-DATA-1 등록 여부 확인. 미등록이면 추가.

### 5. 새 결함 발견 시 (반드시)
1. **추측 X** — 라이브 데이터 / 코드 grep 으로 원인 확정
2. **코드 fix** (작게)
3. **CLAUDE.md INVARIANT 추가** (재발 방지 규칙)
4. **Playwright 시나리오 추가** (`tests/dom-snapshot/critical-flows.spec.ts`)
5. **main 직접 push** (PAT 가 PR 생성 못 함)
6. **CI 통과 확인** (gate-1-2-3-4 / gate-5 / gate-6 / live-audit)
7. **prod 라이브 검증** (curl + 데이터 분석)
8. **사장님 보고** (Sources 첨부, sycophantic 표현 X, 검증된 사실만)

---

## 📁 핵심 파일 / 위치

### 코드
- `src/features/map-2026/components/HtmlMarkerOverlay.tsx` — 마커 cluster 로직
- `src/features/map-2026/components/ListingDetailModal.tsx` — 매물 상세 modal
- `src/features/map-2026/components/ListPanel.tsx` — 좌측 매물 목록
- `src/features/map-2026/components/NlSearchBar.tsx` — 검색 3-in-1
- `src/features/map-2026/components/AdminRegionOverlay.tsx` — 행정구역 폴리곤
- `src/features/map-2026/store.ts` — Zustand store (MapListing 타입)
- `src/features/map-2026/lib/markerTier.ts` — bucketListings (현재 우회됨)
- `src/app/map/MapClient.tsx` — 메인 지도 컴포넌트 (Kakao SDK init, 줌 락)
- `src/app/api/listings/viewport/route.ts` — bbox 매물 조회 API
- `src/app/api/listings/by-ids/route.ts` — ID 리스트 매물 조회 API
- `src/app/api/listings/[id]/route.ts` — 단건 매물 API
- `src/app/api/cron/resolve-building-centroids/route.ts` — 카카오 Local API cron

### 정책 / 영구 규칙
- `CLAUDE.md` — 영구 불변 규칙 (INVARIANT 25개)
- `docs/MASTER_PROMPT_2026-05-02.md` — 이 문서
- `_WISHES_FILM_LOOK_RECIPE.md` — 위시스 필름 룩 (절대 삭제 X)
- `next.config.js` — /listings/:id → /map?listing=:id redirect

### 테스트 / 검증
- `tests/dom-snapshot/critical-flows.spec.ts` — Playwright 시각 회귀 (8 시나리오)
- `tests/unit/cluster-token.test.ts` — FNV-1a hash 테스트
- `tests/unit/polygon-marker-zoom.test.ts` — cellSize / 폴리곤 컷오프

### 마이그레이션 / SQL
- `docs/migrations/k1_building_centroids_2026-05-02.sql` — building_centroids 테이블

---

## 🌐 검증 가능한 라이브 Endpoint

### Map 페이지
- `https://wishes.co.kr/map` — 메인 지도
- `https://wishes.co.kr/map?q=서울특별시+관악구+신림동` — 신림동 검색
- `https://wishes.co.kr/map?listing=46363` — 매물 modal 자동 오픈
- `https://wishes.co.kr/map/46363` — 짧은 URL (위와 동일 동작)

### API 검증 (curl 가능)
```bash
# 신림동 viewport (raw 좌표 검증)
curl -s "https://wishes.co.kr/api/listings/viewport?west=126.92&south=37.47&east=126.95&north=37.49&category=residence"

# 단건 매물
curl -s "https://wishes.co.kr/api/listings/46363"

# 서울 광역 (광역 cluster 검증)
curl -s "https://wishes.co.kr/api/listings/viewport?west=126.85&south=37.42&east=127.00&north=37.55&category=residence"

# health
curl -s "https://wishes.co.kr/api/health"
```

### CI / Vercel 상태
```bash
# main HEAD CI
curl -s "https://api.github.com/repos/wishes-hyundo/WISHES/commits/main/check-runs"

# 특정 commit CI
curl -s "https://api.github.com/repos/wishes-hyundo/WISHES/commits/<SHA>/check-runs"
```

### 직방 비교 (외부 표준 검증)
```bash
# 직방 API — 매물 정확 좌표 13자리 노출 (마스킹 X)
curl -s "https://apis.zigbang.com/v2/items/oneroom?service_type=원룸&domain=zigbang&geohash=wydm9&new_villa=false&building_id=&checkAnyItemWithoutFilter=true"
```

---

## 📦 작업 흐름 템플릿 (다음 세션에서 사용)

### 새 결함 발견 → fix 흐름
```bash
# 1. fresh clone (working tree 손상 회피)
cd /tmp && rm -rf wishes-clean
git clone --depth 1 "https://x-access-token:${GITHUB_PAT}@github.com/wishes-hyundo/WISHES.git" wishes-clean
cd wishes-clean
git config user.email "wishes@wishes.co.kr"
git config user.name "WISHES"

# 2. 라이브 데이터 검증
curl -s "https://wishes.co.kr/api/..." | python3 -c "..."

# 3. 코드 fix
python3 << 'PY'
fp = 'src/...'
src = open(fp).read()
old = "..."
new = "..."
assert old in src
src = src.replace(old, new)
open(fp, 'w').write(src)
PY

# 4. INVARIANT 추가 (CLAUDE.md)
# 5. Playwright 시나리오 추가 (tests/dom-snapshot/critical-flows.spec.ts)

# 6. commit + push
git add -A
git commit -m "fix(...): X-N — 사장님 명령 ..."
git push origin main

# 7. CI 대기 (~3분)
sleep 180
curl -s "https://api.github.com/repos/wishes-hyundo/WISHES/commits/<SHA>/check-runs"

# 8. prod 검증
curl -s "https://wishes.co.kr/..."

# 9. 사장님 보고 (검증된 사실만, Sources 첨부)
```

### Supabase SQL 직접 실행
```python
mcp__8396e8e7-9990-43f0-917a-620df91b197e__execute_sql(
  project_id="xbjgdsyukjdkfvcbzmjc",
  query="UPDATE listings SET ... WHERE ..."
)
```

---

## 🔍 빠른 진단 명령 모음

### 격자 패턴 회귀 검사
```python
# viewport 응답에서 마스킹 좌표 비율
masked = sum(1 for l in items if l['lat'].toFixed(7).split('.')[1][3:] == '000')
masked_ratio = masked / len(items)  # ≤ 1% 이어야 (I-COORD-3)
```

### 같은 좌표 분리 검사
```python
# 같은 좌표 매물 그룹에서 token 분리 비율
by_coord = defaultdict(list)
for l in items: by_coord[(round(l['lat'],5), round(l['lng'],5))].append(l)
split = sum(1 for g in by_coord.values() if len(g)>1 and len(set(l['cluster_token'] for l in g))>1)
```

### 광역 cluster 검사
```python
unique_coords = set((round(l['lat'], 5), round(l['lng'], 5)) for l in items)
# unique_coords < items.length 이어야 (I-MARKER-4)
```

### 관리비 메타 검사
```python
violations = [l for l in items
  if l.get('maintenance_includes') and '관리비' in l['maintenance_includes']]
# violations == 0 이어야 (I-DATA-2)
```

---

## 📌 Quick Recap (1분 안에 다음 세션 시작 가능)

1. **사장님 명령 영구**: I-PROOF-1 (추측 X) + I-PROC-2 (코드+INVARIANT+Playwright 동시) + 떠넘기지 마라
2. **오늘 핵심**: 메인 지도 raw 좌표 + 비로그인 z16 줌 락 (직방/네이버 표준 / M-6+M-7)
3. **다음**: 사장님 시각 검증 결과 대기 / C-4 type cleanup / building_name 자동 채우기 cron
4. **PAT**: PR 생성 X. main 직접 push.
5. **Supabase**: MCP `xbjgdsyukjdkfvcbzmjc`
6. **검증**: 라이브 API 호출 + 데이터 분석. 시각은 사장님 또는 Chrome MCP.
7. **새 결함**: 코드 + INVARIANT + Playwright 동시 (3가지 누락 시 머지 못 함)
8. **사장님 분노 회피**: 변명 X / sycophantic X / 떠넘기기 X / 추측 X / 토큰 낭비 X

---

작성: 2026-05-02 23:30 KST
이전 마스터: `docs/NEXT_SESSION_PROMPT_2026-04-29.md` (구버전)
다음 갱신: 다음 세션 종료 시 v27 등으로
