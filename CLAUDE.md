# CLAUDE.md — 절대 영구 규칙

## 🔴 최우선 규칙 (절대 까먹지 않음)

**모든 작업은 2026년 현시점 전세계 가장 최근 기준으로**
**가장 우수하고 최고의 기술과 스킬을 사용해서 작업한다.**

이 규칙은 영구하며 모든 파일 수정, 기능 추가, 버그 수정, 디자인 결정에 적용됨.

---

## 🛡️ INVARIANTS — 영구 불변식 (사장님 명령 2026-05-02)

**C 프로그램 빌드 원칙**: 한 번 발견한 결함은 다시는 생기지 않게 INVARIANT 로 기록.
모든 PR 은 아래 INVARIANT 를 위반하면 안 됨. 위반 발견 시 즉시 fix + 새 INVARIANT 추가.

### I-COORD-1: 좌표 마스킹 정밀도 = 110m (round to 0.001°)
- `src/lib/coordinateMask.ts` `maskCoordinate()` 만 사용 (절대 자체 round 금지)
- 위반 결과: 마커 1점에 모이거나, prod 캐시 키 mismatch
- 영향 endpoint (전수): `/api/listings/map`, `/api/listings/viewport`, `/api/listings/[id]`,
  `/api/listings/by-ids`, `/api/map/search`. 모두 비로그인 마스킹 필수.
- 검증: `src/lib/coordinateMask.test.ts` 13 tests

### I-COORD-2: 같은 좌표 매물은 1 클러스터 (절대 stack 금지)
- HtmlMarkerOverlay cellSize=0 분기에서 (lat,lng) 동일 매물은 자동 그룹
- 위반 결과: 화면에 마커 "1" N개가 한 픽셀에 stack → 사용자가 매물 카운트 X
- 코드: `src/features/map-2026/components/HtmlMarkerOverlay.tsx` `c:${lat}:${lng}` 키

### I-MAP-1: 검색창 = 매물번호 / 주소 / 자연어 3-in-1
- 매물번호 (5-6자리) → `/api/listings/[id]` → openListingDetail + cinematicFlyTo
- 주소 (한글+동/구/로/길/번지) → `/api/address-search` → 지도 이동
- 자연어 → `/api/map/search-nl`
- 코드: `src/features/map-2026/components/NlSearchBar.tsx` `detectIntent()`

### I-MAP-2: /listings/* 영구 폐기 → /map?listing=ID
- `next.config.js` redirect destination 은 반드시 `/map?listing=:id` (절대 `/map/:id` 금지)
- 위반 결과: 공유링크 → 모달 자동 오픈 X (사장님 SEO 의도 깨짐)

### I-MOBILE-1: BottomSheet 드래그는 핸들에서만
- `framer-motion` `useDragControls()` + `dragListener=false` + 핸들 `onPointerDown={controls.start}`
- ListPanel 은 native overflow scroll 보장 (touchAction:'none' 시트 전체에 절대 X)

### I-A11Y-1: 모든 모바일 터치 타깃 ≥ 44px (WCAG 2.2 AAA)
- 닫기/네비/갤러리 화살표 등 모든 인터랙티브 버튼
- desktop 은 `sm:size-N` 으로 작게 OK, 모바일만 size-11+

### I-API-1: 응답 shape `{ success, data }` 통일
- /api/listings/[id] 응답: `{ success: true, data: { id, lat, lng, ... } }`
- 클라이언트 파싱: `data?.data ?? data?.listing ?? data` (3-tier fallback)

### I-PROC-1: 모든 PR 는 prod 시각 회귀 검증 후 완료
- `npm run gate` 통과만으로는 부족. 사장님 화면이 정답.
- 사장님이 못 잡고 제가 못 잡으면 INVARIANT 누락 → 즉시 추가

### I-IMG-1: 크롤링 원본 사진 영구 차단 (사장님 명령 2026-05-02)
- `image-policy.ts` `isSelfHostedImage()` whitelist 만 허용 (wishes.co.kr / supabase / r2)
- onhouse / naver / 직방 등 외부 크롤링 사이트 사진 절대 노출 X
- 사장님이 매물별 사진 직접 업로드 — admin/listings/new + mobile-photo.html 에서
- 위시스 필름 룩 자동 적용 (자체 매물만, 크롤링은 적용 X)
- 위반 결과: 저작권 분쟁 + 위시스 차별화 가치 손실

### I-COUNT-1: 카운트 single source — 서버 categoryCounts = 클라이언트 sorted.length
- 사용자 발견 버그: "지도 매물 개수와 좌측 카운트 안 맞음"
- 해결 (L-naver-2026truecount2): 클라이언트 sorted.length 단일화 (서버 categoryCounts 부 보조용)
- 서버 categoryCounts 와 listings 메인 query 의 조건 불일치 시 무조건 client sorted 신뢰
- 코드: `src/features/map-2026/components/ListPanel.tsx` header 카운트 = `sorted.length`

### I-DATA-1: type 컬럼 표준 값 enum (DB 입력 표준화)
- 허용 값: 원룸 / 투룸 / 쓰리룸 / 포룸+ / 오피스텔 / 아파트 / 빌라 / 다세대 / 다가구 / 단독주택 / 쉐어하우스 / 고시원 / 상가 / 사무실 / 지식산업센터 / 공유오피스 / 근린생활시설 / 복합건물 / 토지 / 대지 / 전 / 답 / 임야 / 잡종지
- 자유 입력 (`주거용`, `건물` 등) 금지 — admin/listings/new 에서 select dropdown
- 위반 결과: 카테고리 탭에 노출 안 되어 사용자가 매물 못 봄 (영업 손실)
- 검증: 카테고리 분류 누락 매물 0 (cron `auto-fix-problematic` 또는 `integrity-audit` 에서 alert)

### I-POLY-1: 폴리곤 표시 zoom 컷오프 (사장님 명령 2026-05-02 H-1 강화)
- **사장님 명시**: "폴리곤은 z13까지만 하고 14부터는 동그라미 마커로 표시"
- Kakao level 6 (z14) 부터는 마커 zone — 폴리곤 절대 X
- level 7 (z13) = dong polygon (한 단계만), level 8~10 = sigungu, level 11+ = sido
- 코드: `AdminRegionOverlay.tsx` `level >= 7` 만 dong (절대 `level >= 5/6` 금지)
- 폴리곤 클릭 시 STEP=4 → 한 방에 마커 zone 진입 (절대 STEP=2/3 회귀 X)
- 위반 결과: z14/z15에서도 빨간 영역 그대로 → 매물 안 보임

### I-MARKER-1: 마커 grid 단지 단위 정밀 (직방/네이버 표준)
- z14 (level 6): cellSize ~440m (이전 1.1km 너무 큼)
- z15 (level 5): cellSize ~220m
- z16 (level 4): cellSize ~110m
- z17 (level 3): cellSize ~66m
- z18+ (level 2): cellSize=0 (단독 + 같은 좌표 자연 그룹)
- 코드: `HtmlMarkerOverlay.tsx` `gridSizeForLevel()`
- 위반 결과: 마커가 grid 균일 배치로 보임 (직방/네이버 시각 ≠)

### I-MARKER-2: building_name + cluster_token 우선 cluster (직방/네이버 표준 강화)
- **사장님 정책**: 비로그인에 building_name **자체는 노출 X** (privacy 유지)
- **해결**: 서버에서 단지명 hash (FNV-1a) 를 `cluster_token` 필드로 노출
- 클라이언트 cluster key 우선순위:
  1. `cluster_token` (단지명 hash) → `t:${token}` — 비로그인/로그인 모두 작동
  2. `building_name` (로그인 시) → `b:${name}` — token 없을 때
  3. `cellSize > 0` → `g:${cellX}:${cellY}` (광역 grid)
  4. `cellSize = 0` → `c:${lat}:${lng}` (좌표)
- 같은 단지명 매물 → 같은 token → 1 마커
- 다른 단지명 매물 → 다른 token → 분리 (좌표/cell 같아도)
- 정규화: NBSP/다중 공백 → 한 칸
- 사장님 z19 발견: 110m 마스킹으로 다른 단지 매물 같은 좌표 → 21 마커 한 곳 → cluster_token 으로 fix
- 코드: `viewport/route.ts` `by-ids/route.ts` `buildClusterToken()` + `HtmlMarkerOverlay.tsx` `buildKey()`
- 위반 결과: 다른 단지 매물이 한 마커에 묶여 사용자 매물 위치 정확도 X
- privacy: token 은 hash 라 단지명 역산 불가 (16M+ hash 공간)

### I-TEST-1: Critical Flow Playwright 시각 회귀 (E-1 도입 2026-05-02)
- `tests/dom-snapshot/critical-flows.spec.ts` 5 시나리오 매 PR 자동 검증
- 실패 시 머지 차단 (gate-6 의 일부)
- 사장님이 보는 화면 = 컴퓨터가 미리 봄 → 사장님 시간 빼앗김 0
- 새 결함 발견 → 시나리오 추가 → 재발 차단 자동화
- 코드 review 통과만으로는 부족 — 시각 회귀 통과 필수

### I-MARKER-3: TIER1 단지 마커 = building_centroids 정확 좌표 (사장님 명령 2026-05-02)
- TIER1_TYPES = `아파트`, `오피스텔`, `주상복합`, `도시형생활주택`
- TIER1 매물 마커 좌표 = `building_centroids` 테이블의 정확 단지 좌표 (좌표 평균 X)
- 좌표 source 우선순위:
  1. `tier1_lat / tier1_lng` (building_centroids 의 정확 단지 좌표) — TIER1 매물에 한정
  2. cluster centroid (좌표 평균) — fallback (building_centroids 비어있을 때)
- TIER1 마커 시각: 사각형 chip (네이버 표준), 그 외 = 동그라미 (현재)
- 좌표 마스킹 110m + cluster centroid 평균 = 격자 패턴 — 이 조합을 깨려면 단지 좌표 직접 사용 필수
- 코드: `viewport/route.ts` (tier1_lat/lng 응답), `HtmlMarkerOverlay.tsx` (마커 좌표/시각 분기), `building_centroids` 테이블
- Cron: `/api/cron/resolve-building-centroids` 매주 카카오 Local API 로 자동 갱신
- 위반 결과: TIER1 매물도 동그라미 + 격자 패턴 = 사장님 분노 (네이버 표준 ≠)

### I-PROOF-1: 추측 금지 — 확실한 근거가 있을 때만 보고 (사장님 명령 2026-05-02)
- 절대 추측·기억·인상으로 "끝판왕", "표준", "SOTA", "직방/네이버가 사용함" 등 단정 금지
- 보고 전 반드시 검증:
  - **외부 표준/기술 주장** → WebSearch / 공식 문서 / 공식 GitHub 확인
  - **prod 동작 주장** → Chrome MCP 직접 캡처 + API 응답 직접 확인
  - **회귀/fix 효과 주장** → prod 배포 + 시각 검증 후에만
  - **코드 효과 주장** → 코드 grep + 실제 실행 경로 trace
- 근거 부족 시 답: "확실하지 않습니다 — 검증 필요" (X "아마도", "보통", "표준입니다")
- 매 보고에 Sources 첨부 (URL, 코드 라인, prod 응답)
- 위반 결과: 사장님 시간 낭비 + 신뢰 붕괴 + 옆구리 터지는 사이클 반복
- 위반 발견 시: 즉시 정정 + 추측 부분 명시 + 검증된 답으로 교체

### I-COORD-3: 메인 지도 viewport API raw 좌표 (직방/네이버 표준 — 사장님 명령 2026-05-02 M-6)
- `/api/listings/viewport` `/api/listings/by-ids` 응답 lat/lng = DB raw 좌표 그대로
- maskCoordinate 호출 금지 (마스킹 = 격자 패턴 원인)
- privacy 보호 = 줌 락 (I-COORD-4) + 매물 detail modal 미니맵 100m 반경 원 (I-DETAIL-1) 으로
- 직방 API 라이브 응답 검증: lat/lng 소수점 13자리 정확 노출 표준
- 검증: viewport 응답 마스킹 비율 (≤ 1%) — Playwright 시각 회귀

### I-COORD-4: 비로그인 줌 락 setMinLevel(4) (사장님 명령 2026-05-02 M-6)
- `MapClient.tsx`: 비로그인 사용자 setMinLevel(4) → z16 (level 4) 까지만 줌인 가능
- 로그인 사용자 setMinLevel(1) → 모든 zoom 가능
- 정확 매물 위치 = 로그인 후 봐야 — 수익화 모델
- privacy 보호의 1차 layer (raw 좌표 + 줌 락 결합)
- 위반 결과: 비로그인 줌인 무제한 → 직거래 유출

### I-MARKER-4: 광역 줌 (cellSize > 0) grid cluster 우선 (사장님 명령 2026-05-02 M-7)
- `HtmlMarkerOverlay.tsx`: cellSize > 0 일 때 cluster key = `g:${cellX}:${cellY}` (grid)
- cluster_token / building_name 무시 — z14~z17 광역 뷰에 맞는 큰 묶음
- 위반 결과: cluster_token 1순위 사용 시 광역 뷰에 마커 수천개 (사장님 z14 캡처)
- 검증: z14 viewport 응답에서 unique cluster ≤ 100 — Playwright 시각 회귀

### I-MARKER-5: 가까이 줌 (cellSize == 0) 같은 좌표 매물 cluster (사장님 명령 2026-05-02 M-7)
- `HtmlMarkerOverlay.tsx`: cellSize == 0 (z18+) 일 때 cluster key = `c:${lat.toFixed(6)}:${lng.toFixed(6)}`
- 같은 lat/lng 매물 (소수점 6자리) = 1 cluster (직방 동작 — 같은 건물 다른 호)
- 다른 lat/lng = 분리 (가까이서 매물 위치 정확히)
- 위반 결과: token 우선 시 가까이 줌인해도 분리 안 됨

### I-DATA-2: maintenance_includes/excludes 의 '관리비' 메타 항목 금지 (사장님 명령 2026-05-02 N-1)
- listings.maintenance_includes/excludes 는 **실제 항목** (수도/전기/가스/인터넷 등) 만 포함
- "관리비" 자체를 항목으로 넣으면 안 됨 — 메타 의미 없음 ("관리비 포함" = 무엇이 포함?)
- ListingDetailModal 클라이언트 방어선: '관리비' 항목 자동 필터
- DB cleanup 완료 (10,926 매물 정리)
- 위반 결과: 칩에 "관리비 포함" 표시되어 별도 항목 구분 시각 깨짐

### I-UI-1: ListingDetailModal left = ListPanel grid col 옆 (사장님 명령 2026-05-02 N-2)
- 데스크탑 modal 위치: `md:left-[280px] lg:left-[340px] 2xl:left-[380px]`
- ListPanel grid 첫 컬럼 (280/340/380px) 옆에 modal 시작 → 두 패널 동시 가시
- 모바일은 전체 화면 fixed (기존 동작)
- 위반 결과: modal 이 ListPanel 영역 가려 매물 목록 안 보임 (네이버 표준 위반)

### I-DETAIL-1: 매물 detail modal 미니맵 = 100m 반경 원 (사장님 명령 2026-05-02)
- 비로그인 매물 정확 위치 노출 X
- 매물 상세 페이지 (/map/[id] modal) 의 "매물 위치" 섹션 = 100m 반경 녹색 원 표시
- 정확 좌표 marker 금지
- privacy 보호의 2차 layer (메인 지도 raw 좌표 사용해도 detail modal 은 흐림)

### I-PROC-2: 새 결함 발견 시 INVARIANT + Playwright 시나리오 동시 등록 (사장님 명령 2026-05-02 O-1)
- 모든 결함 fix PR 는 다음 3가지를 함께 포함해야 머지 가능:
  1. 코드 fix (실제 변경)
  2. CLAUDE.md 새 INVARIANT 추가 (재발 방지 규칙)
  3. Playwright `tests/dom-snapshot/critical-flows.spec.ts` 시나리오 추가 (자동 회귀 검증)
- 한 가지라도 빠지면 같은 결함이 다시 생김 (사장님 시간 낭비 패턴)
- 위반 발견 시: 즉시 회수 + 누락된 부분 별도 PR
- 코드만 push 하고 INVARIANT/시나리오 빠뜨림 = 가장 흔한 위반 — 의식적으로 체크

### I-MARKER-6: 클러스터 필터 활성 시 spider-fy radial spread (G-123 / 사장님 발견 2026-05-04)
- `clusterFilterIds != null` 일 때 HtmlMarkerOverlay 는 같은 좌표 매물을 시각적으로 분산 (12 시 방향, N 등분 원형).
- 이유: 클러스터 클릭 후 패널에 N개 매물이 보이는데 지도엔 1점에 stack 되면 사용자가 매물 위치 인지 불가.
- 코드: `src/features/map-2026/components/HtmlMarkerOverlay.tsx` — `clusterFilterIds` 분기에서 (lat,lng) 기준 그룹화 후
  같은 그룹 매물에 `radius ≈ 28px / cos(lat)` 만큼 좌표 jitter 적용.
- 위반 결과: 신림동 23 매물 클러스터 클릭 → 1 픽셀에 23 마커 stack → 사용자 X.

### I-MARKER-7: 클러스터 카테고리 = listingCategoryOf (cross-residential 포함) (G-122 / 2026-05-04)
- 클러스터 집계 / 카테고리 필터에는 `listingCategoryOf(listing)` 함수 사용 (단순 type → category 매핑 X).
- cross-residential 규칙: type ∈ {사무실, 근린생활시설, 학원} 이고 area_m2 < 50 인 매물은
  `residence` 카테고리에도 포함 (소형 사무실/학원이 사실상 주거 용도로 사용되는 시장 현실 반영).
- 코드: `src/features/map-2026/lib/markerTier.ts` `listingCategoryOf()` + `isCrossResidential()`.
- 서버 (`/api/map/clusters`) 와 클라이언트 (HtmlMarkerOverlay) 양쪽이 같은 함수를 사용해야
  cluster total = viewport listings count 가 일치.
- 위반 결과: 클라이언트는 23 매물, 서버 cluster 22 매물 — 1 매물 누락 → 사용자가 본 카드 클릭 시 빈 화면.

### I-PERF-1: 마커 DOM 렌더 rAF batching (G-117 / 사장님 측정 2026-05-04 longtask 167ms)
- HtmlMarkerOverlay 의 cluster 루프는 `requestAnimationFrame` batch 50개 단위로 분할.
- 새 render 시작 시 `renderTokenRef` 증가 → 진행 중인 batch 자동 abort (stale frames 방지).
- 위반 결과: 카테고리 탭 / 줌 변경 시 415 markers 동기 생성 → 167ms longtask → 사용자 freeze 체감.
- 검증: Performance API longtask < 50ms, 60fps 유지.
- 코드: `src/features/map-2026/components/HtmlMarkerOverlay.tsx` `_processBatch()` + `renderTokenRef`.
- Wave 44 이후 HtmlMarkerOverlay 는 `listings={[]}` 로 사실상 비활성. I-PERF-2 가 영구 fix.

### I-PERF-2: SVG layer + Web Worker 영구 활성 (Wave 38~44 / 사장님 명령 2026-05-04 옵션 A+B)
- **3-layer 구조 영구 보존** (한 부분 빠지면 freeze 회귀):
  1. `SvgMarkerLayer` (Wave 38~42): 단일 SVG element, parent g `translate(dx,dy)` pan = 1 setAttribute
  2. `svg-cluster.worker.ts` (Wave 43): aggregateClusters/applySpiderFy/computeClusterPosition/listingCategoryOf off-main
  3. `HtmlMarkerOverlay` mount 유지 + `listings={[]}` (Wave 31 lesson — 컴포넌트 unmount 시 WebGL/event listener 회귀)
- prod 검증 (사장님 + Claude 2026-05-04): z16 강남 53 cluster, 6 연속 zoom round-trip = longtask **0**, max **0ms** (warm worker)
- 위반 결과:
  - SvgMarkerLayer 비활성 → HtmlMarkerOverlay 의 415 setMap/setContent → 95~146ms longtask 회귀
  - Web Worker 제거 → main thread aggregation → cold zoom 60~95ms
  - HtmlMarkerOverlay 완전 unmount → Wave 30/31 의 WebGL invisible 회귀 (deck.gl trigger 끊김)
- 코드:
  - `src/components/map/SvgMarkerLayer.tsx` (Wave 42 anchor + Wave 43 worker round-trip)
  - `src/features/map-2026/workers/svg-cluster.worker.ts` (Wave 43)
  - `src/app/map/MapClient.tsx` `useState(true)` (Wave 44 SVG 기본화)
- 비상 롤백: URL `?svg=0` (5초 안에 옛날 모드 복원, 코드 push 없이)
- 회귀 차단: `tests/dom-snapshot/critical-flows.spec.ts` Wave 44 시나리오

### I-WEBGL-1: deck.gl `new Deck()` 호출 시 width/height 명시 필수 (사장님 명령 2026-05-04 Wave 26.7~26.12 진단)
- `new DeckCtor({ canvas, width: container.clientWidth, height: container.clientHeight, views: [...], ... })` — width/height 옵션 없으면 deck.gl 내부 0×0 init.
- 위반 결과: layerManager 가 layer reconcile 영구 skip → setProps({layers}) 호출해도 internal layers 0 → canvas 픽셀 0 = silent invisible.
- 검증된 사실 (Wave 26.10 prod 측정): width/height 미지정 시 `deck.props.width=0, deck.props.height=0` 으로 init → 모든 후속 setProps 효과 X.
- 코드: `src/components/map/KakaoDeckOverlay.tsx` 의 `new DeckCtor({...})` 호출.
- 영향: Wave 25c / Wave 26 / Wave 26.2 / Wave 26.6 모든 invisible 회귀 = 같은 root cause.

### I-WEBGL-2: deck.gl `setProps({layers})` 호출 후 `redraw('manual')` 필수 (사장님 명령 2026-05-04 Wave 26.12 검증)
- buildLayers 안 `deckRef.current.setProps({...layers})` 호출 직후 반드시 `deckRef.current.redraw('manual')` 호출.
- 위반 결과: deck.props.layers 는 정상 업데이트되지만 layerManager.getLayers() = 0 (reconcile 트리거 안 됨) → canvas 픽셀 0 = silent invisible.
- 검증된 사실 (Wave 26.12 prod 측정): redraw('manual') 추가 후 자연 상태에서 779,463 canvas 픽셀 (emerald 673,753 = 81 cluster) 정상 렌더.
- 코드: `src/components/map/KakaoDeckOverlay.tsx` 의 buildLayers 함수 끝.
- 추가 주의: layer mount 는 비동기 — setProps + redraw 후 ~10-15초 측정 시간 필요. 너무 일찍 측정하면 0 으로 보임.

### I-WEBGL-3: deck.gl async init 후 useEffect #2 강제 재실행 trigger 필수 (사장님 명령 2026-05-04 Wave 26.9 검증)
- `await import('@deck.gl/core')` 가 ~700ms 소요. 그 동안 useEffect #2 가 fire 됐다면 `deckRef.current=null` 로 early return.
- 해결: useState `deckGenId` 를 useEffect #2 deps 에 추가 + deck assignment 직후 `setDeckGenId(g => g + 1)` 강제 trigger.
- 위반 결과: deck init 완료 후 useEffect #2 가 자동 재실행 안 됨 → buildLayers 호출 안 됨 → invisible 까지 동일.
- 코드: `src/components/map/KakaoDeckOverlay.tsx` 의 deckRef.current = deck 직후 + useEffect #2 deps.

### I-BAT-1: Windows .bat 파일은 ASCII only (Wave 26.13 이전 사고 → Wave 26.15 정식 등록)
- 동적으로 작성하는 .bat 파일 (DEPLOY_*.bat 등) 은 반드시 ASCII 인코딩
- 한글 주석 (REM 한글) 절대 금지 — Korean Windows cmd 가 UTF-8 멀티바이트를 깨진 명령으로 해석
- 위반 결과: `set "PATH=..."`, `copy /y "..."` 등 모든 명령 실패 → deploy 안 됨
- 검증: `file *.bat` 결과 "ASCII text" 이어야 함. UTF-8 나오면 주석 다시 영어로

### I-BAT-2: workspace mount filesystem staging 파일 trailing NULL bytes 검증 (Wave 26.14d 진단 2026-05-04)
- `_waveXX_clean/` 는 mount filesystem (Windows 파일) 을 bash 에서 다루는 환경
- 파일 작성 후 trailing NULL bytes (`\x00`) 가 자동 추가될 수 있음 (파일시스템 sync padding cruft)
- `.bat` 의 `copy /y` 가 NULL bytes 까지 git commit → TypeScript compiler 가 NULL 만나서 syntax error → Vercel build Error
- 검증: 각 staging 파일 작성 후 `python3 -c "print(open('file','rb').read().count(b'\\x00'))"` 결과 0 이어야
- 자동화: staging 작성 직후 NULL strip 1줄:
  ```python
  data = open(f, 'rb').read().replace(b'\x00', b'')
  if not data.endswith(b'\n'): data += b'\n'
  open(f, 'wb').write(data)
  ```
- 모르는 상태로 deploy 시 100% build Error (Wave 26.14/14b/14c 세 번 연속 실패의 원인)

## 🚫 `/search` 절대 손대지 마라 (사장님 명령 2026-04-28)

`wishes.co.kr/search` = 중개사가 사용하기 가장 편한 UI 로 13년 동안 최적화된 작업장.

**보존 대상 (영구)**:
- `src/app/search/page.tsx` (451줄)
- `src/app/search/layout.tsx`
- `public/search/content.js` (13,671줄)
- `public/search/content-v230~v300-*.js` (14 patch)
- `public/search/styles.css` (850줄)

**금지**:
- React 재현 X
- BoB 컴포넌트, shadcn/ui, Tailwind 적용 X
- 디자인 변경 0
- pixel 단위 비교 검증도 X (이미 사장님 검증 완료한 상태)

**허용**:
- 새 기능은 `content-v301-...js` 패치 파일로 옛날 가게 안에 추가
- HTML 구조/CSS 손대지 않고 비즈니스 로직만 보강

**무효화된 부트스트랩 항목**:
- §7 Phase 2 ("UI 픽셀 React 재현") — 취소
- §11 #2 ("vanilla content.js 폐기") — 무효
- §11 #6 ("새 페이지 생성 X, 모든 게 /search 한 곳") — `/search` 강제 통합 의도 무효

---

## 🔍 `/map` 검색·라우팅·성능 (사장님 명령 2026-04-29)

`wishes.co.kr/map` = 일반 사용자/방문자가 매물 찾는 메인 페이지. 모든 매물 검색은 여기 한 곳.

**4가지 영구 요구사항**:

1. **AI 자연어 검색 활성화** — 검색창 1개로 3가지 모두:
   - 매물번호 (5-6자리 숫자만) → 즉시 해당 매물 카드 오픈
   - 주소 패턴 (지역명/도로명/번지) → /api/address-search → 지도 이동
   - 자연어 ("신림동 3억 이하 투룸 5층 이상") → /api/map/search-nl (Gemini 2.5 Flash 무료) → 매물 필터 적용

2. **/listings 영구 폐기** — `/listings/*` → `/map?listing=ID` 또는 `/map` 리다이렉트.
   - 모든 매물 검색은 `/map` 한 곳
   - 사이드바/네비/SEO 메뉴에서 `/listings` 제거
   - listings에 있던 추가 필터/기능은 매물카드(MapListingPanel)에 통합

3. **매물카드 URL 라우팅** — 매물 클릭 시 `/map?listing=ID` 자동 변경 (history.replaceState).
   - 새로고침/직접접근 시 해당 매물 카드 자동 오픈
   - 공유링크 동작 (og:image / og:title 매물별)

4. **폴리곤/매물 렌더링 딜레이 0** — 폴리곤 클릭 → 지도 확대 → 매물 표시 사이 버퍼링/렉/딜레이 **체감 0**.
   - clusters/items API 응답 < 100ms (Edge cache + tile-based)
   - 마커 렌더링 GPU canvas (대량 시 SVG → Canvas)
   - viewport-based prefetch + throttle 16ms (60fps)

**무효화된 부트스트랩 항목**:
- 부트스트랩 §4 "AI 자연어 검색 / pgvector AI 추천 X" — `/map` 검색창에 한해 무효화 (Gemini Flash 무료 한도)
- 부트스트랩 §11 "/listings 유지" — 영구 폐기

**보존 (혼동 금지)**:
- `/search` (중개사용 vanilla content.js) — `/map`(일반 사용자용)과 별개. 둘 다 영구.
- `/admin/*` — 사장님 전용. 별개.

---

## ✅ `/admin/*` 자유 (사장님 명령 2026-04-28)

`/admin/*` = 사장님이 사용. UI/UX 자유.

**허용**:
- 새 React 컴포넌트, shadcn/ui, Tailwind v4
- 디자인 변경, 새 admin 페이지 생성
- 기존 admin 페이지 강화/리팩토링

**무효화된 부트스트랩 항목**:
- §11 #7 ("/admin/* 유지 (Phase 3 후 폐기)") — `/admin/*` 영구 유지로 변경

---

## 🎞️ 위시스 필름 룩 영구 적용 (사장님 명령 2026-04-28)

**모든 위시스 사진/영상은 Fujifilm Classic Negative 레시피 자동 적용**.
명세 파일: `_WISHES_FILM_LOOK_RECIPE.md` (절대 삭제 X, 변경 시 사장님 승인 필수)

핵심 수치 (절대 까먹지 마라):
- Film: **Classic Negative**, Grain: Strong/Large, Colour Chrome FX: Strong (+ Blue Strong)
- WB: Auto (+3R/-5B) 또는 (0R/-2B) | DR400 | Colour +4
- Highlight -2, Shadow -2, Sharpness +2, NR -4, Clarity -2

적용 위치 (모든 곳):
- `mobile-photo.html` 업로드/편집
- `/api/admin/extract-from-photo` Gemini OCR
- `/api/listings/[id]/images` POST
- `/api/listings/[id]/videos` POST + FFmpeg.wasm 자동
- `/api/cron/enrich-vision` 사진 처리

예외 (적용 X):
- `source='crawled'` 사진 — 위시스 룩 적용 X (저작권 안전 + 차별화)
- 사장님 명시 "원본 보존" 선택

---

## 🤖 자동화 우선 (사장님 명령 2026-04-28)

**사장님께 일 시키지 마라.** 사장님은 결과만 받음.

**자동 처리 원칙**:
- 데이터 보정 / 정리 / enrich → SQL 함수 + cron
- 매물 등록 시 KISO 14항 자동 검증 (trigger)
- 이상치 / 중복 / 오류 → 자동 탐지 + 자동 보정
- 정기 보고서 → 사장님 이메일 또는 dashboard (월/주 단위)

**금지**:
- "사장님이 직접 검토하는 페이지" 만들기 X
- "사장님이 일일이 클릭해서 처리" UI X
- 사장님 시간 빼앗는 모든 패턴 X

---

## 🎯 마케팅 효과 보호 (사장님 명령 2026-04-30 PR-G2-AREA)

**사용자 UI 에 부정적 표시 절대 X.** 광고 = 매물 매력적으로 보여야 함.

**금지 단어** (사용자 UI 에서 절대 X):
- "쪼갬 의심" / "방 분할 의심" / "면적 의심"
- "면적 0" / "면적 미정" / "면적 미확인"
- "신뢰도 낮음" / "검증 필요"
- "정보 부족" / "확인 불가"

**대신 사용**:
- 면적 모름 → "면적 문의"
- type 만 있음 → "원룸" / "투룸" 등
- 의심 플래그 (`area_split_suspected`) → DB 보존 + admin UI 만 표시

**면적 표시 폴백** (`src/lib/formatArea.ts` 사용 의무):
```
1. 공급 > 전용  → "전용 23.5㎡ (7.1평) / 공급 31.2㎡ (9.4평)"
2. area_m2 > 0  → "23.5㎡ (7.1평)"
3. area_m2 = 0  → "면적 문의"
```

---

## 🚫 면적 정보 부족 = 비공개 사유 X (사장님 명령 2026-04-30)

**영업 손실 방지** — 면적 미확정 매물도 광고 진행.

**근거**:
- 건축물대장에도 정보 없는 매물 존재 (무허가 / 오래된 다가구 등)
- 절대 확인 불가한 매물도 있음
- 그렇다고 광고 안 할 수 X (사장님 영업)
- 사장님 추후 실측 시 정확한 값 갱신 가능

**영구 적용**:
- `auto_fix_problematic_listings` 함수의 `hidden_area_invalid` 로직 영구 제거
- 새 매물 등록 시 `area_m2 = 0` 들어와도 `status = '공개'` 유지
- 자동 enrichment 함수 (정규식 + 동평균 + type평균) 가 가능한 source 에서 보강

**관련 SQL migration**: `docs/migrations/pr_g2_area_2026-04-30.sql`

---

## 🏗️ 부동산 도메인 통찰 (사장님 명령 2026-04-30)

**Multi-source verification 시스템** — 면적 한 source 만 신뢰 X. confidence layer 필수.

| 매물 유형 | 면적 source | 정확도 | 한계 |
|---|---|---|---|
| 아파트/오피스텔/주상복합 | 건축물대장 전유부 + 공급면적 | 95%+ | 호별 정확 |
| 빌라/다세대/연립 | 층면적 + 신고 | 60-80% | **방 쪼갬** 빈번 → 실측 필요 |
| 다가구/단독 | 호수 분할 추정 | 50-70% | 실측 필수 |
| 상가/사무실 | 등록 시 명확 / 신고 | 85%+ | 일반적 정확 |

**핵심 통찰**:
- **실측만 100% 정확** — 사장님 갈 수 없으니 multi-source verification
- **임대인/매도인 신고 ≠ 진실** → cross-check 필수
- **방 쪼갬 매물** = 건축물대장 ≠ 실제 임대 면적 → admin 만 라벨

**`area_source` confidence**:
- `measured` (사장님 실측) = 100
- `building_registry` (V-WORLD) = 95
- `rtms_match` = 90
- `photo_ocr` (AI Vision) = 85
- `text_extracted` (정규식) = 70-75
- `broker_reported` (사장님 신고) = 60
- `dong_avg_estimated` (동·type 평균) = 40
- `type_avg_estimated` (전국 type 평균) = 20
- `unknown` = 0

## 💰 비용 정책 (사장님 명령 2026-04-28)

**무료 + 극소액 OK**. 큰 비용 (월 $500+) X.
- 무료 우선 — Gemini Flash / Kakao / V-World / data.go.kr / Resend / GA4 / Clarity / GrowthBook / PostHog
- 극소액 OK — Sentry $26/월, Vercel Pro $20, Supabase Pro $25, Cloudflare R2 $5, Anthropic API $50~300 (Prompt cache 90% 절감)
- 부트스트랩 §9 매트릭스: 월 $400~1,200 OK (사장님 결정 완료)

**여전히 X**:
- 큰 비용 옵션 (VR Matterport / Bright Data / 음성 AI / 데이터 웨어하우스)
- 사장님 손 가는 검수 페이지
- 카톡 알림톡 (Solapi) — 사장님 명령 2026-04-28: 사용 X. **알림은 Resend 이메일만**

## 🌍 비즈니스 영역 (사장님 명령 2026-04-28)

**전국 부동산 운영**. 서울 매물이 가장 많지만 서울 전문 X.
- 매물 데이터: 전국 17 시도 모두
- 자동 enrich: 전국 학교/어린이집/병원 (Kakao Local 무료)
- 미세먼지: 시도별 매핑 (현재 12K 매물이 모두 서울이라 100% 서울 매칭, 매물 추가되면 자동 다른 시도)
- 부트스트랩 §3 한국 17 데이터 모두 전국 영역

**무료 한도 활용**:
- Gemini 2.5 Flash (Google) — 일 100K 호출 무료 (Vision 포함)
- Claude API — Prompt caching 90% 비용 절감
- 카카오 Local API — 무료
- V-World 건축물대장 / RTMS / data.go.kr — 무료
- Google Earth Engine — 무료
- Vercel Cron — 무료
- Resend — 100K 무료
- Inngest — free tier
- Microsoft Clarity / GA4 / GrowthBook / PostHog — 무료

**자동화 제안 시 항상 무료 옵션 우선**. 비용 들어가는 옵션 제시 X.

**허용 (사장님 결과 확인용)**:
- 실시간 dashboard (지표만, 클릭 없이)
- 자동 처리된 결과 요약 (audit log)
- 정기 PDF 보고서

### 적용 기준

#### 1. 기술 스택
- 항상 최신 LTS 버전 사용 (Next.js 16+, React 19+, TypeScript 5.7+)
- 최신 React 패턴 (Server Components, Suspense, use API)
- 최신 Web API (Container Queries, View Transitions, Anchor Positioning, Popover API)
- 최신 CSS (subgrid, :has(), color-mix(), oklch, view transitions)
- ESM only, no CommonJS
- Edge Runtime 우선

#### 2. AI/ML 기능
- 2026년 기준 SOTA 모델 사용 (Claude Sonnet 4.6+, GPT-5+, Gemini 2.5+)
- LLM 기반 자연어 검색
- 임베딩 기반 시맨틱 검색
- AI 추천 시스템

#### 3. UI/UX 기준
- 2026년 최신 디자인 트렌드 (글래스모피즘 + 미니멀)
- 마이크로 인터랙션
- 60fps 애니메이션
- 다크모드 기본 지원
- 접근성 WCAG 2.2 AAA

#### 4. 부동산 도메인 (네이버/직방/호갱노노 벤치마크)
- 학세권 필터 (학교/학원/병원)
- 거리뷰/항공뷰/위성뷰
- VR 투어
- AI 시세 추정
- 단지별 실거래가 그래프
- 관심 매물 핀
- 세부 필터 (계단식/복도식, 전용면적)

#### 5. 성능
- Core Web Vitals 모든 지표 Good
- 첫 페이지 로드 1초 이내
- INP < 200ms
- 이미지 AVIF/WebP 자동 최적화
- 코드 스플리팅 + 프리페치

#### 6. 보안
- Content Security Policy 엄격
- 매물 위치 마스킹 (비로그인)
- Rate limiting
- SQL injection 방지

#### 7. 개발 프로세스
- 매 commit 후 Vercel 배포 상태 즉시 확인
- TypeScript strict mode
- ESLint no-warnings
- 빌드 통과 후에만 "완료" 보고

---

## 작업 후 체크리스트

매 commit 후 반드시 확인:
- [ ] Vercel 배포 status가 "Ready" (Error 아님)
- [ ] 라이브 사이트 동작 검증
- [ ] 사용자 영향 피드백 수집

---

작성: 2026-04-26
규칙 추가: 사용자 명시 — "절대 까먹지 않게"


## 🆕 2026-05-09 추가 INVARIANTs

### I-STORAGE-1: /search localStorage quota 자동 정리 + 토스트 throttle (사장님 발견 2026-05-09)
- 결함: 매물 30,420건 → `ws_data_snapshot` + `ws_price_snapshots` 캐시 ~9MB → 브라우저 limit 5~10MB 도달 → "저장공간이 부족합니다" 토스트 매 분마다 반복 발생
- 원인 path: `_autoRefreshTimer` 10분 간격 → `trackChanges` → `_saveSnapshot` → `_safeSetItem` → QuotaExceededError → 토스트
- 해결: `content-v321-storage-cleanup.js` 패치
  1. `Storage.prototype.setItem` 가로채기 → quota 시 자동 cleanup + 재시도 (성공하면 토스트 X)
  2. 토스트 10분 throttle (cleanup 후에도 실패한 경우만)
  3. 페이지 로드 시 4MB+ 도달하면 사전 cleanup
- 키 분류 (영구):
  - `SAFE_PRESERVE` (절대 삭제 X): ws-favorites, ws-memos, ws-contacts, ws_customer_folders, ws_filter_presets, ws_dark_mode/auto, ws_customer_prefs, ws_fav_categories, ws_noti_settings, ws_token, ws_user, ws_login_time, ws_refresh_token, ws-search-history, ws_autorefresh_min, wp-pal-frecent
  - `CLEANABLE_CACHE` (자동 정리 가능): ws_data_snapshot, ws_price_snapshots, ws_changelog, ws_alerts, ws_alert_log_v1, ws_alert_log_unread_v1
- 매물 본 데이터는 localStorage X (DB + memory.allListings) → 정리해도 매물 영향 0
- 진단: `window.WS._lsUsage()` / `window.WS._lsCleanup()`
- 위반 결과: 토스트 무한 반복 → 사장님 작업 방해 + 알림 로그 spam
- 코드: `public/search/content-v321-storage-cleanup.js`, `src/app/search/page.tsx` patches 배열
