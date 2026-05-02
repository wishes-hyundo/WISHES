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

### I-PROC-3: 기능 추가 전 현재 작동 확인 + 새 결함 0 (사장님 영구 명령 2026-05-03)
- 새 기능 / 변경 / 마이그레이션 시작 전:
  1. prod 핵심 동작 (main / map / viewport API / health) 정상 확인
  2. 기존 데이터 무결성 (auth.users / admin_users / profiles / listings count) 기록
- 변경 후 즉시 regression 검사:
  1. 위 동일 항목 재확인 — 깨졌으면 즉시 fix 또는 롤백
  2. 새 결함 발견 시 즉시 fix (다음 단계 진행 X)
- "절대 문제점 만들지 마라. 있으면 바로 고쳐서 수정해" — 사장님 영구 명령

### I-LEGACY-1: legacy 잔존 발견 시 즉시 정리, 최신 버전 단일 유지 (사장님 영구 명령 2026-05-03)
- DB CHECK 제약 / 컬럼 / 테이블 / 코드 — 구버전 + 신버전 동시 존재 발견 시:
  1. 신버전 (더 포괄적) 만 유지
  2. 구버전 즉시 DROP (위험 평가 후)
- 예: admin_users_role_check (구) + admin_users_role_chk (신) → 구 DROP
- 항시 최신 버전에 맞춰서 버그 없이 진행

### I-AUTH-1: 직원/고객 분리 — admin_users(직원) vs profiles(고객) (사장님 명령 2026-05-03)
- 직원/운영자 (사장님 + 운영팀) = `admin_users` 테이블 + 사장님 승인 필요 (status='pending' → 'approved')
- 고객 (매물 검색자) = `profiles` 테이블 + OAuth 가입 즉시 활성
- 같은 사용자가 두 테이블에 동시 존재 금지
- 중개업체 (외부 중개사) = 추후 활성화 (현재 영구 pending — 홈페이지 자리 잡은 후)

### I-AUTH-2: OAuth 가입자(kakao/naver/google) = profiles 만 INSERT (사장님 명령 2026-05-03)
- `/api/auth/kakao` / `/api/auth/naver` callback = profiles upsert (admin_users INSERT 금지)
- Google native OAuth = `/api/auth/complete-profile` 도 profiles 만 (existing admin_users 권한 보존 UPDATE 만 허용)
- 직원이 OAuth 로 가입 시도 시 = profiles 로 들어감. 사장님이 admin_users 수동 등록으로 직원 권한 부여.
- profiles 의 `source` 컬럼 = 가입 경로 ('kakao'/'naver'/'google'/'email')

### I-AUTH-3: 자체 가입(/api/auth/register) = admin_users 만 INSERT (직원 등록 흐름)
- `register` route = admin_users insert. 신 enum 'pending' status, role='pending'
- 사장님이 /admin/users 에서 승인 → status='approved', role 변경 (broker/agent/admin/owner)
- 자체 가입자는 profiles 에 row 만들지 않음

### I-AUTH-4: auth.users <-> admin_users / profiles 정합성 1:1 (사장님 명령 2026-05-03)
- auth.users 의 id 와 email = admin_users / profiles 의 id 와 email 정확히 일치 필수
- mismatch (id 같은데 email 다름) 발견 시 = 즉시 정리 (UPDATE 또는 DELETE)
- 정기 검증 cron 권장: `SELECT au.id FROM admin_users au JOIN auth.users u ON u.id = au.id WHERE LOWER(au.email) != LOWER(u.email);` → 0 row 이어야

### I-AUTH-5: 중개업체 가입 = 영구 pending (홈페이지 자리 잡은 후 활성화)
- 사장님 결정 (2026-05-03): 중개업체 가입 흐름은 바탕만 만들어 두고 실제 활성화는 추후
- 가입 페이지 자체는 존재 가능 (status='pending' 영구). 사장님 수동 승인만 가능
- 정부 OpenAPI (국세청 / nsdi.go.kr) 자동 검증은 추후 활성화 시 도입

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
- §11 #6 ("새 페이지 생성 X, 모든 게 /