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

### I-POLY-1: 폴리곤 표시 zoom 컷오프 (사장님 명령 2026-05-02)
- Kakao level 5 (z15) 부터는 마커 zone — 폴리곤 절대 X
- level 6~7 (z13~z14) = dong polygon, level 8~10 = sigungu, level 11+ = sido
- 코드: `AdminRegionOverlay.tsx` `level >= 6` 만 dong (절대 `level >= 5` 금지)
- 폴리곤 클릭 시 STEP=3 → 한 방에 마커 zone 진입 (절대 STEP=2 회귀 X)
- 위반 결과: 사장님 z15에서도 빨간 영역 그대로 → 매물 안 보임

### I-MARKER-1: 마커 grid 단지 단위 정밀 (직방/네이버 표준)
- z14 (level 6): cellSize ~440m (이전 1.1km 너무 큼)
- z15 (level 5): cellSize ~220m
- z16 (level 4): cellSize ~110m
- z17 (level 3): cellSize ~66m
- z18+ (level 2): cellSize=0 (단독 + 같은 좌표 자연 그룹)
- 코드: `HtmlMarkerOverlay.tsx` `gridSizeForLevel()`
- 위반 결과: 마커가 grid 균일 배치로 보임 (직방/네이버 시각 ≠)

### I-TEST-1: Critical Flow Playwright 시각 회귀 (E-1 도입 2026-05-02)
- `tests/dom-snapshot/critical-flows.spec.ts` 5 시나리오 매 PR 자동 검증
- 실패 시 머지 차단 (gate-6 의 일부)
- 사장님이 보는 화면 = 컴퓨터가 미리 봄 → 사장님 시간 빼앗김 0
- 새 결함 발견 → 시나리오 추가 → 재발 차단 자동화
- 코드 review 통과만으로는 부족 — 시각 회귀 통과 필수

---

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
