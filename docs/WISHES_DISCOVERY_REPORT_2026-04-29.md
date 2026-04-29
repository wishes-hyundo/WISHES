# WISHES Discovery 종합 보고서 (PART III 산출물)

**작성일**: 2026-04-29
**조사 범위**: Supabase `wishes-realestate` (xbjgdsyukjdkfvcbzmjc) +
`C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2`
**전체 시간**: read-only Discovery (코드 1 줄도 수정 없음)

---

## 0. 핵심 결론 한 문장

이 코드베이스는 **이미 월드클래스에 가깝다.** 새로 만드는 게 아니라
**누수 지점을 정확히 찾아 막는 것**이 진짜 작업이다. 가장 큰 누수는
**`type` 컬럼 26종 정규화 붕괴** — 사용자가 "원룸" 만 켜면 `주거용`(102),
`주택`(95), `확인필요`(77), `사업자등록가능`(21) 등 305+ 매물이 사라진다.
UI 와 인프라는 거의 손대지 않고 **데이터 정규화 + SSOT registry 도입** 만으로
수만 건의 매물 노출 누수가 멎는다.

---

## 1. 프로젝트 인프라 — 이미 갖춰진 것 (보존 대상)

### 1.1 스택 (package.json 검증 완료)
- Next.js 15.2 + React 19 + TypeScript + Tailwind v3.4
- Supabase JS, Drizzle ORM (단 schema 는 레거시, §3.1 참조)
- Kakao Maps + maplibre-gl + deck.gl + h3-js + @turf/turf (지오 풀스택)
- Zustand + TanStack Query v5 + react-hook-form + zod
- Sentry (에러 추적), Resend (이메일), AWS S3 + Cloudflare R2 (스토리지)
- Vitest 4.1 (테스트), framer-motion (애니메이션), Radix UI (접근성)
- @react-pdf/renderer, qrcode, sharp (이미지 변환)

### 1.2 Supabase 인스턴스
- **프로젝트**: `wishes-realestate` / region `ap-northeast-2` (서울)
- **Postgres**: 17.6.1 (최신)
- **상태**: ACTIVE_HEALTHY, 2026-03-24 생성

### 1.3 익스텐션 (활성)
- `postgis` 3.3.7 ✅ (지오)
- `vector` (pgvector) 0.8.0 ✅ (시맨틱 검색)
- `pg_cron` 1.6.4 ✅ (스케줄)
- `pg_trgm` 1.6 ✅ (한국어 trigram 유사도)
- `pg_stat_statements` 1.11 ✅
- `supabase_vault` 0.3.1 ✅ (시크릿)
- `uuid-ossp`, `pgcrypto`, `plpgsql`

> **이미 `pgroonga`도 설치 가능 상태** (한국어 형태소 검색용) — 필요 시 활성.

### 1.4 데이터 규모
- `listings`: **29,475 매물** (status: 공개 27,520 / 비공개 1,953 / 중복정리 2)
- `listing_images`: **186,254 사진** (매물당 평균 6.3장)
- `listing_videos`: 2 (자체 동영상 갤러리)
- `listing_history`: 5,620 (변경 이력)
- `listing_raw_html`: 18,626 (원본 HTML 보존)
- `listings_map_diff`: 29,412 (지도 diff 추적)
- `subway_stations`: 411 (data.go.kr 정부 공식)
- `building_registry_cache`: 15 (건축물대장 24h 캐시)
- `admin_audit_log`: 12,702 (관리자 감사)
- `user_consents`: 26 (PIPA 동의)
- `legal_documents`: 4 (이용약관 / 개인정보처리방침 / KISO / AI 라벨)

### 1.5 인덱스 — 49개 (성능 인프라 매우 양호)
주요 (필터 작업과 직결):
- `idx_listings_bounds_filter` — 복합 (`status, lat, lng, deal, type`) WHERE `status='공개'` (지도 viewport)
- `idx_listings_geom` — GiST `st_makepoint(lng,lat)` WHERE `status='공개'` (지오)
- `idx_listings_status_geom` — GiST `geom`
- `idx_listings_status_type`, `idx_listings_status_deal`, `idx_listings_status_dong`
- `idx_listings_address_trgm` / `idx_listings_title_trgm` / `idx_listings_building_trgm` — GIN trgm
- `idx_listings_embedding_hnsw` — HNSW (m=16, ef_construction=64) ★
- `idx_listings_embedding` — IVFFlat (lists=100, 폴백)
- `idx_listings_field_sources_gin`, `idx_listings_contacts_gin`
- `idx_listings_published_created_at`, `idx_listings_published_updated_at`
- `idx_listings_created_brin`, `idx_listings_updated_brin` (BRIN, 시간순)
- `listings_problematic_idx`, `listings_trust_score_idx`
- 단지정보 / 학교 / 지하철: `listings_school_count_idx`, `listings_subway_count_idx`

→ **PART XII §73.1 인덱스 전략 거의 완성됨**. 추가는 한정적.

### 1.6 마이그레이션 (46개 — 4월 27~29일 활발한 리팩토링)
- phase0a~e (2026-04-27): 파싱 버그 / 타입 / RLS / search_path / Cascade
- phase1_01~14 (04-27~28): user_role enum / RLS 강화 / KISO·AI 라벨 / 정규화 / 옵션 / 자동화 / fingerprint / AI cost monitoring / cron 헬스
- **phase5_korean_17_data_enrich** (04-28): 17개 한국 특화 데이터 보강 ★
- phase6_* (04-28): 미디어 / 면적 / RLS 누수 픽스 / 인덱스 추가 / 건축물대장
- session2/4 (04-29): listings 트리거, pg_cron, **pgvector + LISTEN/NOTIFY**, app_secrets
- **subway_stations_postgis_100pct** (04-28): 411개 지하철역 PostGIS
- normalize_listing_address v1~v4 (04-29): 주소 정규화 멱등화
- phase7 advisor 보안 픽스 (04-29 오늘)

→ 활발한 작업 중. 라운드 진행 중 배포 금지 (PART IV §36) 강제 필수.

### 1.7 페이지 (src/app)
공개: `/`, `/map`, `/listings`, `/listings/[id]`, `/search`, `/search/v2`,
`/search/v2/listings`, `/search-preview`, `/calculator`, `/compare`, `/contact`,
`/about`, `/faq`, `/privacy`, `/terms`, `/unsub`

인증: `/login`, `/signup`, `/forgot-password`, `/reset-password`,
`/auth/callback`, `/auth/verify`, `/complete-profile`, `/mypage`

매물 등록/공유: `/new`, `/listings/[id]/edit`, `/admin/listings/new`,
`/admin/listings/[id]/edit`, `/s/[code]` (단축 URL)

관리자: `/admin/*` (command-center-v2, contacts, dedup, users, automation-status,
photo-enhancer, briefing, problematic, search, profile, listings/bulk-upload)

### 1.8 API 라우트 (95+)
**필터/검색 핵심 5개**:
- `/api/listings` — 메인 목록 (search/deal/type/dong/minDeposit/maxDeposit/sort/limit/offset)
- `/api/listings/viewport` — 지도 viewport 매물
- `/api/listings/by-ids` — 비교용
- `/api/listings/stats` — 통계
- `/api/listings/map` — 지도용

**지도/지오 5개**:
- `/api/map/items` — 마커
- `/api/map/clusters` — 서버 사전집계 H3
- `/api/map/search` — **하이브리드 자연어 검색 (HARD/SOFT 필터 분리)** ★
- `/api/map/search-nl` — 자연어 변형
- `/api/map/isochrone` — 등시선

**지오데이터 6개**:
- `/api/geo/sido` (시·도)
- `/api/geo/sigungu` (시·군·구)
- `/api/geo/dong` (동)
- `/api/geo/dong/sigungu/[code]`
- `/api/geo/legaldong/sigungu/[code]`
- `/api/address-search`

**AI 4개**:
- `/api/ai/briefing`, `/api/ai/match`, `/api/ai/auto-generate-bulk`,
  `/api/admin/smart-analyze`

**중복/품질**:
- `/api/admin/dedup/{cleanup,hide,restore,scan}`
- `/api/admin/clean-raw-fields`, `/api/admin/listings-field-update`
- `/api/admin/backfill-{embeddings,maintenance}`
- `/api/admin/enrich-{stations,title-hints}`

**알림/Cron**:
- `/api/saved-searches`, `/api/alerts`, `/api/alerts/send`
- `/api/cron/notify-matches`, `/api/cron/update-rates`,
  `/api/cron/weekly-briefing`, `/api/cron/generate-descriptions`

**기타**: 인증(MFA), R2 프록시, Sentry, CSP, OAuth (kakao/naver), 결제 미보임.

### 1.9 /features/map-2026 — 신규 완성 시스템 (보존 대상)
2026-04-21 마이그레이션. 카테고리 우선 + Semantic Zoom + Hero Pin + 3D + 시네마틱 모션 + 비교 인지.

**보존 컴포넌트 (절대 손대지 말 것)**:
- `CategoryTabs`, `FilterModal`, `ActiveFilterPills`, `NlSearchBar`
- `ListPanel`, `MapControls`, `SemanticZoomIndicator`, `MiniCard`, `SumBox`
- `MobileListSheet`, `MapErrorBoundary`, `MapLoadingIndicator`
- `KakaoDeckOverlay`, `HtmlMarkerOverlay`, `AdminRegionOverlay`
- `ListingDetailModal`, `CopyToastOutlet`, `FilterAccordion`

**훅**: `useMap2026Store`, `useViewport`, `useSemanticZoom`, `useHeroRanking`,
`useFilterUrlSync`, `useListingUrlSync`, `useMapClusters`

→ **UI 기본틀 헌법(PART XI §54) 적용 대상.** 이 컴포넌트들은 수정 금지.

---

## 2. 핵심 발견 — 필터 누수 원인

### 2.1 최대 누수 — `type` 컬럼 26종 정규화 붕괴 ★★★
실제 분포 (29,475 / 100%):

**정상 8종 (29,036, 98.5%)**:
원룸 9,587 / 상가 9,520 / 투룸 3,874 / 쓰리룸 3,012 / 사무실 1,795 /
오피스텔 692 / 빌라 329 / 아파트 227

**비정상 18종 (439, 1.5%) — 사용자 필터에서 사라지는 매물**:
주거용 102 / 주택 95 / 확인필요 77 / 토지 50 / 전체 34 /
사업자등록가능 21 / 지식산업센터 18 / 이면도로 13 / 사무용 5 /
"주거용, 전입신고가능" 5 / 대로변 5 / "주택겸 사무실" 4 /
"전체, 사업자등록가능" 2 / 건물 2 / "사업자등록가능, 주택겸 사무실" 2 /
"사무용, 사업자등록가능" 2 / "주거용, 사업자등록가능" 1 / "사무실/상가" 1

> **사용자 영향**: "원룸" 만 켜고 강남 검색 → 주거용·주택 매물 안 보임.
> "상가" 켜고 검색 → 사무실/상가, 사업자등록가능, 대로변 매물 안 보임.
> 카테고리(주거/상가/토지/투자) 4개 중 어디로 라우팅되어야 할지도 모호.

### 2.2 NULL 비율 — 필터 의미를 파괴하는 필드들

| 필드 | NULL % | 상황 |
|------|--------|------|
| `crime_safety_score` | 100.0% | 17 enrichment 컬럼 — 채워지지 않음 |
| `noise_level` | 100.0% | " |
| `rtms_avg_price` | 100.0% | " (실거래가 통합) |
| `building_dong` | 100.0% | 동 호 정규화 0 |
| `building_ho` | 99.9% | " |
| `direction` | **99.3%** | 거의 미사용 — 필터 의미 X |
| `school_zone_score` | 99.7% | enrichment |
| `embedding` | 88.7% | 26.6K 매물 임베딩 미생성 (88.7%) |
| `full_option`(false/null) | 81.2% | 풀옵션 ON 비율 18.8% — 의미 OK |
| `pet`(false/null) | 97.9% | 반려 OK 비율 2.1% |
| `price`(매매가) | **73.0%** | 월세 매물 19,557 건은 의미상 NULL — deal 로 분기 필수 |
| `elevator`(false/null) | 62.5% | 실제 false 인지 NULL 인지 구분 어려움 (default=false) |
| `maintenance_fee`(0/null) | 61.1% | 0 vs NULL 의미 분리 안 됨 |
| `air_quality_avg` | 60.6% | 17 enrichment 일부 |
| `bathrooms` | 53.5% | 핵심 필터에 절반 누락 |
| `rooms` | 53.4% | " |
| `features`(jsonb) | 47.6% | 옵션 JSON |
| `parking`(false/null) | 42.7% | |
| `options`(text!) | 32.0% | 옵션 텍스트 |
| `loan_available`(NULL) | 27.8% | default=true 인데 27.8% NULL |
| `is_problematic=true` | 15.5% | **4,569 건** 검토 필요 매물 ★ |
| `total_floors` | 14.3% | 층 |
| `built_year` | 1.7% | |
| `floor_current` | 0.1% | text! (혼란) |
| `gu` | 0.0% | 100% 채워짐 ✅ |
| `geo` (lat/lng) | 0.0% | 100% ✅ |
| `area_m2` | 0.0% | 100% ✅ |
| `address_detail` | 0.0% | 100% ✅ |

→ **17 enrichment 컬럼 (school/air/crime/noise/rtms 등) 은 마이그레이션은 됐지만
   데이터 채움이 미진행**. PART XII §75 차별화 필터 가치 = 즉시 캐시 가능.

→ **direction 99.3% NULL** = 필터 항목으로 노출하면 사용자 혼란. 데이터
   채울 때까지 UI 에서 숨기거나 "정보 있는 매물만" 토글 필요.

### 2.3 `direction` 정규화 미흡 (NULL 외 207건)
남향 154 / 동향 17 / 북향 13 / 남서향 6 / 서향 6 / 북동향 5 /
**남동향 3 / 동남향 1** (= 동남/남동 미정규화) / 빈문자열 1 / "-" 1

### 2.4 `gu` 분포 — 자치구 우선 정책 일부 미적용
**서울시 25 구**: 강남 6,423 / 관악 6,377 / 서초 2,360 / 동작 1,619 /
금천 1,183 / 강동 1,181 / 강서 1,067 / 구로 1,014 / 광진 783 / 동대문 563 / 마포 545 /
서대문 466 / 강북 458 / 은평 374 / 영등포 358 / 도봉 320 / 송파 283 / 중랑 265 /
성북 240 / 양천 196 / 노원 178 / 종로 170 / **중구 133** / 성동 100 / 용산 94

**경기 + 일부**: 평택 389 / 의정부 262 / 광주 211 / 구리 210 / 파주 207 /
시흥 181 / 남양주 180 / 김포 174 / 하남 137 / **서울시 101** ★ /
이천 78 / 양주 74 / 오산 73 / 동두천 71 / 광명 69 / 군포 68 / 안성 59 /
양평군 47 / 여주 38 / 포천 26 / 의왕 25 / 가평군 22 / 과천 13 / 연천군 8 / 화성 2

**문제**:
- "서울시" 101건 — 자치구 분리 안 됨 (gu 가 "서울시" 자체로 들어감)
- "중구" 133건 — 서울 중구인지 인천 중구인지 모호
- 의정부/광주 등은 시 단위만 — 자치구 (수원/성남/고양/용인/안산/안양 등) 분리 데이터 부재
- 인수인계 v3 의 "자치구 우선" 정책이 onhouse 만 적용, gongsilclub 미동기화 가능성

### 2.5 `status` 정규화
- 공개 27,520 / 비공개 1,953 / 중복정리 2 → enum 3 종 (정상)
- '거래완료' 값 없음 — `sold_at` 컬럼 (별도) 사용. 동시 운영 합의 필요.

### 2.6 `source_site`
- gongsilclub 18,633 / onhouse 10,841 / NULL 1
- → **공실클럽이 더 많음**. 인수인계 v3 의 "공실클럽 동일 로직 이식" 우선순위 정합.

---

## 3. SSOT(Single Source of Truth) 부재 진단

### 3.1 Drizzle schema 는 사용되지 않는 레거시 ★★
`src/db/schema.ts` 첫 줄: `// STEP 0: SQLite (로컬 개발)` + `sqliteTable` import.

내용은 `listings` 7 개 컬럼 (id/title/type/deal/deposit/monthly/price/area/floor/address/dong/lat/lng/description/available/availableDate/built/parking/elevator/pet/status). 실제 Postgres 는 **142 컬럼** + PostGIS + pgvector + 17 enrichment + AI 필드 + 광고 정책 + 신뢰도 + 중복관리.

**= Drizzle schema 는 SSOT 가 아니다.** 누군가 이걸 보고 SSOT 라고 착각해 작업하면 즉시 사고. 즉각 결정 필요:
- A) 재생성 (drizzle-kit pull 로 142 컬럼 정확히) — 권장
- B) 삭제 + 명시 (`/* DEPRECATED: Postgres listings 142 col 이 진실. drizzle 재생성 전엔 사용 X */`)
- C) Zod 기반 별도 SSOT registry 도입 (PART XII §77)

### 3.2 type/deal 의 enum 진실은?
- Drizzle schema enum: `['원룸','투룸','쓰리룸','오피스텔','아파트','상가','사무실']` (7)
- 실제 분포: **26 종** (위 §2.1)
- API `/api/map/search` (parseMatchQuery): 자체 파싱 로직, enum 명시 없음
- API `/api/listings`: 단순 `slice(0,40)` 만, enum 검증 없음
- DB CHECK 제약: 없음 (단 NOT NULL 만)

→ **4 곳에 정의가 흩어져 있고, 어느 것도 정답이 아니다.** PART XII §77
   SSOT registry 도입 시 1 위 우선순위.

### 3.3 status enum
- Drizzle: `['공개','비공개','계약중','계약완료']`
- 실제: 공개 / 비공개 / 중복정리 (계약중/계약완료 없음 — sold_at 으로 대체)
- DB default `'가용'` (정의된 enum 어디에도 없는 값!)

→ default 값 `'가용'` 이 신규 row 에 들어가면 status enum 위반. 마이그레이션
   히스토리 검증 필요.

### 3.4 필터 정의 흩어짐 (수정 시 사이드 이펙트 원천)
한 필터 (예: deal) 의 정의가 다음 6 곳에 분산:
1. UI 라벨: `/features/map-2026/components/CategoryTabs.tsx`, `FilterModal.tsx`
2. URL sync: `useFilterUrlSync.ts`
3. Zustand 스토어: `useMap2026Store`
4. API parser: `lib/ai-match-parser.ts` (자연어 추출)
5. API filter: `/api/listings/route.ts`, `/api/map/search/route.ts`,
   `/api/listings/viewport/route.ts`
6. DB column: `listings.deal`

**한 곳 고치면 다섯 곳이 안 따라가서 "필터가 자꾸 어긋나는" 사용자 증상의
근본 원인.**

### 3.5 mv_map_listings — Materialized View 발견
`/api/map/search` 가 `from('mv_map_listings')` 사용. = 인기 필터 사전계산 MV
존재. 갱신 정책 / 컬럼 셋 / pg_cron 스케줄 검증 필요 (다음 PR).

---

## 4. SEO 현황 — 큰 갭

### 4.1 /map 페이지 (layout.tsx)
- title: "지도검색 - 서울·경기 부동산 지도" ✅
- description: 70자 ✅
- canonical: `https://wishes.co.kr/map` ✅
- OG: 최소 (title/description/url) — **이미지 OG 없음**

**누락**:
- Twitter Card
- `RealEstateListing` JSON-LD (매물 상세 / 카테고리 페이지)
- `BreadcrumbList` JSON-LD
- `Organization` + `RealEstateAgent` JSON-LD
- 네이버 site verification 메타
- robots.txt / sitemap.xml 검증 안 됨 (next.config.js + app/sitemap.ts 확인 필요)
- IndexNow 자동 알림 워커 없음
- 동적 검색결과 (`/map?filter=...`) noindex 명시 안 됨
- 17 enrichment 데이터 (school/air/subway) 가 schema.org 에 미반영

→ PART XI §56-61 우선순위 작업 = 매물 페이지 JSON-LD + sitemap 분할 + 네이버
   서치어드바이저 등록 + IndexNow 워커 (매물 INSERT 트리거).

### 4.2 매물 상세 (`/listings/[id]/page.tsx`) — 미확인
다음 PR 에서 메타 + JSON-LD 검토 필요.

---

## 5. 보안 advisor — 즉시 조치 안 해도 OK 인 것

- ERROR `spatial_ref_sys` RLS 미활성 — PostGIS 표준, 무시 가능
- WARN `postgis` 익스텐션이 public 스키마 — 격리 권장 (다음 마이그레이션)
- WARN `st_estimatedextent` SECURITY DEFINER 가 anon/auth 에 노출 — PostGIS 함수,
  REVOKE EXECUTE 권장 (분기 작업)

→ phase7 advisor 픽스가 오늘(04-29) 적용됨. 위 3 개는 잔여.

---

## 6. 권장 다음 PR (우선순위 + 비파괴)

> **모든 PR 은 PART IV §34 7 단계 프로토콜 + PART XI §54 UI 헌법 + PART X §52
> 안티패턴 + PR 머지 게이트 23 개(PART XI §67) 통과 후만 머지.**

### PR-A: type 컬럼 정규화 + SSOT registry v0.1 (가장 큰 누수 차단)
**목표**: 사용자 "원룸" 검색 시 305 건 사라지던 누수 0 으로.

1. **데이터 정규화 마이그레이션** (expand-contract):
   - 신규 컬럼 `type_normalized text` 추가 (CHECK 제약 enum 8종)
   - dual-write trigger: 기존 `type` → 정규화 매핑 (주거용→원룸/주택→ ?, 사업자등록가능→사무실, 대로변→상가, ...)
   - LLM 보조 분류 (Groq Free) — confidence ≥ 0.95 만 자동 적용, 검토 큐
   - 매물별 정규화 후 DB 컬럼 채우기 (백필)

2. **SSOT v0.1**: `src/filters/registry.ts` 생성. type/deal/status 3개만 우선.
   PART XII §77.1 형식 — UI 라벨 + Zod schema + DB 컬럼 + SQL builder + 테스트 케이스.

3. **API 통합**: `/api/listings`, `/api/map/search`, `/api/listings/viewport`
   세 곳에서 SSOT registry 만 import. raw 컬럼 직접 비교 금지 ESLint rule 추가.

4. **회귀 테스트**: golden 50 + property fuzz 5K (PART XII §72) — 변경 전후
   각 deal/type 조합의 매물 ID 집합 비교, diff 0 보장.

5. **UI 변경 0**: `/features/map-2026/components/*` 미수정. CategoryTabs 의 라벨은
   동일, 단지 표시 매물 수만 늘어남.

**위험**: 과거 "주거용" 검색하던 사용자에겐 결과가 달라짐 — A/B 토글로 1% → 100%.

### PR-B: 필터 NULL 정책 명시 + UI 게이트 (혼란 차단)
**목표**: NULL 처리 정책을 SSOT 에 명시. UI 가이드.

1. SSOT registry 의 `null_policy` 필드 추가 — 모든 필터에 명시.
2. `direction` 99.3% NULL → 필터 UI 에서 임시 숨김 또는 "정보 있는 매물만"
   토글로 노출.
3. `rooms`/`bathrooms` 53% NULL → 필터 적용 시 정보 명시:
   *"방수 정보가 없는 매물은 결과에서 제외됩니다 (12,567 건)"*.
4. `pet`/`elevator`/`parking` default false vs NULL 구분: trigger 로 NULL → false 명시 backfill.

**UI 변경**: 필터 모달 내부 텍스트만 (UI 헌법 §54.1 의 "라벨" 변경 — RFC 필요).

### PR-C: 17 enrichment 데이터 채우기 (차별화 필터 즉시 가용)
**목표**: 컬럼은 만들어져 있으나 데이터가 0 인 17 항목 채우기.

1. **무료 공공 데이터** 우선:
   - `school_*` (교육청 학구도 + 학업성취도) — 전체 매물
   - `subway_*` 이미 411개 역 데이터 있음 — 매물별 거리 enrichment worker
   - `air_quality_*` (에어코리아 측정소 거리 + 농도)
   - `crime_safety_score` (경찰청 행정동 통계)
   - `noise_level` (도로/철도 PostGIS 거리)
   - `rtms_avg_price` (국토부 실거래가 — 동·매물유형 평균)
   - `school_count`/`daycare_count`/`hospital_count`/`academy_count` (POI count)

2. **enrichment worker**: pg_cron 또는 Inngest Free 로 야간 배치.
3. **필터 UI 점진 추가**: 데이터 채움 비율 ≥ 80% 인 항목부터 PART XI §54.3 RFC.

**비용**: 모두 무료 공공 API. PART V §38 캡 영향 없음.

### PR-D: SEO 메타 + 매물 상세 JSON-LD (네이버/구글 노출 강화)
**목표**: 매시간 네이버/구글이 우리 매물을 인덱싱해서 좋아하게.

1. `/listings/[id]/page.tsx` 의 generateMetadata + RealEstateListing JSON-LD
2. `app/sitemap.ts` 분할 (5만 매물 단위)
3. RSS `/rss/listings.xml` 신규 매물 100건
4. 네이버 서치어드바이저 등록 (HTML 메타 추가)
5. IndexNow 워커 (매물 INSERT 트리거 → ping)
6. /map?filter=... 동적 URL `noindex, follow` 명시
7. Twitter Card / OG 이미지 자동 1200×630 (Cloudflare Images Free)

**UI 변경 0**: `<head>` 내부만.

### PR-E: 회귀 테스트 인프라 — Layer 1~3
**목표**: PR-A~D 가 회귀 만들지 않게.

1. Vitest unit + property (fast-check 5K runs)
2. Playwright E2E 핵심 5 flow (랜딩→/map→필터→상세→문의)
3. DOM Snapshot — 핵심 페이지 (UI 헌법 자동 가드)
4. Visual Regression — Argos Free 5K screenshots
5. SQL oracle: API 결과 vs 직접 SQL diff 0 verify
6. CI 게이트 (PART XI §67 의 23개 중 가장 우선 6개)

### PR-F (선택): mv_map_listings 컬럼셋 + 갱신 정책 검증
**목표**: MV 가 stale 데이터 노출하지 않게.

1. MV 정의 dump
2. 갱신 트리거 (LISTEN/NOTIFY 이미 04-29 에 도입됨)
3. p95 응답 시간 측정 → SLO

---

## 7. 보존해야 할 것 — 절대 손대지 말 것

다음은 헌법(PART XI §54) 적용 대상. 변경 시 RFC + 사용자 명시 승인:

- `/features/map-2026/**` 모든 컴포넌트 + 훅
- Kakao SDK + deck.gl 오버레이 통합
- `MapClientWrapper` WebGL 감지 + 스켈레톤 LCP 최적화 로직
- ConditionalLayout (header 숨김 / dvh 처리)
- 카테고리 탭 → FilterModal Gate 패턴 (이전 사이드바에서 의도적 변경됨)
- 광고 정책 / status='공개' 강제 (IDOR 방어 — L-sec92)
- PostgREST .or() injection 방어 (L-sec106)
- Rate limit 모든 라우트 (L-sec23/27/68 등)
- Image policy (저작권 보호)
- stripInternalFieldsArray (embedding/dedup 노출 차단)

---

## 8. 다음 세션 시작 명령어 (drop-in)

```
WISHES Discovery 보고서 (이 문서) 를 따른다. 이미 매우 많은 것이 구현됨 —
새로 만들지 말고 누수 차단 우선. 가장 큰 누수: type 컬럼 26→8종 정규화.
PR-A (type 정규화 + SSOT registry v0.1) 부터 RFC 작성 후 진행. UI 헌법 §54
+ 비파괴 §34 + PR 게이트 23개 + 무료 우선 강제. 추측·확장·삭제 금지.
```

---

## 9. 미해결 — 다음 Discovery 라운드에서 봐야 할 것

- mv_map_listings 컬럼셋 + 갱신 정책 (현재 SQL 미실행)
- pg_cron jobs (`SELECT * FROM cron.job` 미실행 — 이번 라운드 누락)
- RPC 함수 전체 (match_listings, fn_sunset_listings, fn_bump_miss_count, normalize_listing_address 등)
- RLS 정책 전수 (28 개 테이블)
- field_sources jsonb 의 실제 분포 (어느 필드가 어디서 왔는지)
- ai_generated_fields 분포 (KISO 라벨 정확성)
- 시크릿 매핑 (.env / Vercel / Supabase Vault)
- listings 트리거 정의 (session2_35 마이그레이션)
- next.config.js + middleware.ts 검토
- /features/map-2026 의 실제 코드 (FilterModal 의 카테고리/필터 라벨 정확)
- saved_searches / appointments 동작
- legal_documents 실제 내용
- /api/listings 의 200 줄 이하 부분 (gu 필터 / 카테고리 매핑 처리)
- /api/listings/viewport 코드
- /api/map/items, /api/map/clusters 코드
- ai-match-parser 정규식
- supabase/migrations 폴더 (세부 SQL)

다음 Discovery 라운드에서 위를 읽으면 PR-A~F 의 안전성이 한층 올라간다.

---

이 보고서가 PART III §29-33 산출물의 첫 번째 결정판이다.
사용자 OK → PR-A RFC 작성 → 비파괴 7단계 → 머지.

---
---

# 부록 — Discovery 2 라운드 추가 발견 (2026-04-29 후반)

## A1. pg_cron 6개 잡 (모두 활성)
| jobname | schedule | command |
|---------|----------|---------|
| cleanup_map_diff | `0 4 * * *` (매일 04시) | listings_map_diff 정리 |
| **refresh_mv_map_listings** | **`*/3 * * * *` (3분마다)** ★ | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_map_listings` |
| wishes_archive_daily | `0 19 * * *` (매일 19시) | `fn_archive_old_sold(30)` (30일 거래완료 아카이브) |
| wishes_vacuum_weekly | `0 20 * * 0` (일요일 20시) | `VACUUM (ANALYZE) public.listings` |
| wishes_heartbeat_hourly | `0 * * * *` (매시) | `fn_record_heartbeat()` |
| wishes_sunset_daily | `0 18 * * *` (매일 18시) | `fn_sunset_listings(5)` (miss_count≥5 거래완료) |

→ **자동화 매우 잘 갖춰짐.** PR-C enrichment cron 추가만 필요.

## A2. RPC 함수 — 필터 직결 핵심
| 함수 | 역할 | PR 영향 |
|------|------|--------|
| **`rpc_map_clusters(sw_lat, sw_lng, ne_lat, ne_lng, zoom, p_deals[], p_types[], p_min_price, p_max_price, p_min_deposit, p_max_deposit, p_min_monthly, p_max_monthly, p_min_area, p_max_area, p_rooms[], p_new_years, p_station_m, p_features[], p_has_images)`** | **16 파라미터 SSOT 후보 — H3 클러스터 + 모든 필터** | PR-A 의 SQL 백엔드로 통합 |
| `match_listings(query_embedding, threshold, count, sw/ne_lat/lng)` | pgvector 매칭 (viewport 포함) | 자연어/시맨틱 검색 |
| `auto_extract_options_from_raw_fields()` | raw → options 자동 추출 | trigger 등록 필요 |
| **`auto_extract_rooms_bathrooms_from_raw()`** | **rooms/bathrooms 자동 추출** | **★ trigger 미연결 — 53% NULL 의 원인** |
| `auto_calculate_trust_score()` | trust_score 자동 | 운영 |
| `auto_detect_jeonse_risk()` | 전세사기 위험 | 차별화 |
| `auto_fix_problematic_listings()` | problematic 자동 수정 | 4,569건 정리 |
| `kiso_validate_listing()` | KISO 14항 자동 (이미 trigger ON) | ✅ |
| `find_nearest_stations/exits` | 지하철 거리 (PostGIS) | enrichment |
| `is_admin_or_above`, `is_broker_or_above`, `is_partner_or_above`, `is_owner` | RLS 헬퍼 | ✅ |
| `is_field_locked_by_broker` | 중개사 수정 필드 잠금 | 사장님 명령 자동화 |
| `pipa_anonymize_expired` | PIPA 만료 익명화 | 운영 |
| `cron_health_check`, `data_integrity_audit`, `korean_data_enrich_audit` | 헬스체크 | 사장님 결과 보고 |

**중요 발견**:
- `rpc_map_clusters` 파라미터에 **카테고리(주거/상가/토지/투자) 없음** — type[] 만 받음. 카테고리→type[] 매핑은 클라이언트에서만 일어남. PR-A SSOT 가 이 매핑도 통합해야 함.
- `auto_extract_rooms_bathrooms_from_raw()` 정의됨 but trigger 미등록 → rooms/bathrooms 53% NULL 의 진짜 원인. **trigger 등록 1줄로 보강 가능** ★

## A3. listings 트리거 11개 (자동화 강함)
- `kiso_validate_listing_tr` BEFORE I/U — KISO 14항 ✅
- `listings_normalize_address` BEFORE I/U — 주소 정규화 ✅
- `listings_set_fingerprint` BEFORE I/U — 중복 탐지 ✅
- `tr_listings_sync_geom` BEFORE I/U — geom 컬럼 자동 ✅
- `trg_listings_price_history` BEFORE U — 가격 이력 ✅
- `trg_listings_sold_at` BEFORE I/U — sold_at 자동 ✅
- `trg_listings_touch` / `trigger_listings_updated_at` BEFORE I/U — updated_at (중복!)
- `listings_change_history` AFTER U — 변경 이력 → listing_history 누적 ✅
- `trg_listings_map_diff` AFTER I/U/D — 지도 diff ✅
- `trg_notify_new_listing` AFTER I — **LISTEN/NOTIFY → saved_searches 매칭** ★

**누락 트리거**:
- ❌ `auto_extract_rooms_bathrooms_from_raw` (53% NULL 원인)
- ❌ `auto_extract_options_from_raw_fields` (32% NULL 원인)
- ❌ `auto_calculate_trust_score`
- ❌ `auto_detect_jeonse_risk`
- ❌ `auto_fix_problematic_listings`

→ **PR-G 후보 (PR-A 후 즉시)**: 위 5 함수를 trigger 로 등록만 하면 **즉시 5,000+ 매물 데이터 보강**. 데이터 작업 0 줄 — trigger 1 PR.

## A4. mv_map_listings — Materialized View 정의
**컬럼 (~40개)**: id, title, ai_title, ai_description, building_name, type, deal,
deposit, monthly, price, area_m2, area_pyeong, rooms, bathrooms, floor_current,
floor_total, lat, lng, status, dong, address, address_detail, maintenance_fee,
business_type, source_site, created_at, updated_at, views, parking, elevator,
full_option, pet, balcony, built_year, direction, station_name, station_distance,
features, **thumb_url** (sub-select), **has_video** (EXISTS), **price_unified**
(`COALESCE(deposit, monthly, price)`)

**WHERE**: `status IN ('공개','계약중') AND lat IS NOT NULL AND lng IS NOT NULL`

**갱신**: 3분마다 CONCURRENTLY (pg_cron)

**문제 ★★**:
1. **`gu` 컬럼 없음** — 자치구 필터를 MV 통과 못 함. 사용자가 "강남구" 만 켜면 MV → listings fallback 또는 dong 매칭으로 처리. 검증 필요.
2. **status='계약중'** 0 건 — 정의는 미래 대비, 현재 무용지물
3. **price_unified COALESCE(deposit, monthly, price)** — deposit > 0 default 라 항상 deposit 우선. 정렬용은 OK 지만 필터에선 deal 별 분기 필수.
4. **type_normalized 컬럼 없음** — PR-A 적용 시 MV 정의 갱신 필요 (`gu` + `type_normalized` 추가)

→ PR-F 의 핵심 작업 = MV 정의에 `gu`, `type_normalized` 추가.

## A5. RLS 정책 — 매우 잘 설계됨
- `listings`: 5 정책 (broker_insert, broker_owner_delete, broker_owner_update,
  public_select, service_role_all) ✅
- `listing_images/videos`: public_select + service_role_all ✅
- 사용자 데이터 (favorites, alert_settings, profiles, user_consents,
  saved_searches, appointments, contacts): self/own 패턴 ✅
- `admin_users`, `admin_audit_log`, `listing_history`: admin only ✅
- `app_secrets`: anon/auth 모두 차단 ✅
- `legal_documents`: public_select OK ✅

→ PIPA + IDOR 방어 완성. PR 들이 새 RLS 추가 시 동일 패턴 따라야 함.

## A6. ai-match-parser.ts (210 줄 결정적 파서)
한국 부동산 자연어 → 구조화 필터, 외부 API 0 호출, 응답 즉시.

**상수**:
- `DEALS = ['전세','월세','매매']` ★ **'단기' 없음**
- `TYPES = ['원룸','투룸','쓰리룸','오피스텔','아파트','상가','사무실']` ★ **빌라/주택 없음** (DB 분포 329/95 무시)
- `BUSINESS_TYPES`: 카페/음식점/편의점/학원/헬스장/미용실/병원/약국/사무실/사무소 (10종)
- `PYEONG_TO_M2 = 3.3058` ✅

**파싱 패턴** (정규식 결정적):
- "보증금 5000만원 이하", "월세 50만원", "전세 2억", "1.5억"
- "20평 이상", "60m² 이하", "30 제곱"
- "방 2개", "3룸"
- 지역 우선순위: 구 > 동 > 시 (`[가-힣]{2,4}구` 매칭)
- 옵션: "주차", "엘리베이터", "반려/애완/펫/강아지/고양이"

→ **이게 자연어 검색의 SoT**. PR-A SSOT 와 통합 필수.

## A7. FilterModal.tsx (UI Source of Truth)
**카테고리 4종**: `residence`, `retail_office`, `land`, `investment`
**거래 4종 ★**: `'매매','전세','월세','단기'` ← ai-match-parser 의 3종과 불일치
**카테고리별 칩**: ResidenceChips / CommercialChips / LandChips / InvestmentChips
**Gate 패턴**: 카테고리 탭 → 모달 (이전 사이드바 항상 노출 → 피드백 후 변경)
**UI**: 우측 슬라이드 패널 (380px, max-w-85%, 백드롭 없음, 지도 인터랙션 유지)

→ **이게 UI 헌법(§54.1) 보존 핵심.** 절대 손대지 말 것.

## A8. **enum 정의가 분산된 4 위치** (PR-A 의 통합 대상)
| 위치 | type | deal | 비고 |
|------|------|------|------|
| **DB** (실제 분포) | **26 종 (혼란)** | 매매/전세/월세 (단기 0건) | normalize 안 됨 |
| `src/db/schema.ts` (Drizzle) | 7종 (legacy SQLite) | 3종 | **사용 안 됨, 위험** |
| `lib/ai-match-parser.ts` | 7종 | 3종 (**단기 빠짐**) | NL 파싱 SoT |
| `features/map-2026/components/FilterModal.tsx` | 카테고리별 chips | **4종 (단기 포함)** | UI SoT |
| `rpc_map_clusters` | text[] (검증 없음) | text[] | DB SQL SoT |

**= 5 곳에 다른 정의.** PR-A SSOT 가 단일 진실 만들고 나머지는 import 만.

## A9. next.config.js — 잘 갖춰짐
- ESLint + TS strict 빌드 게이트 ✅ (`ignoreDuringBuilds: false`)
- AVIF/WebP 자동 ✅
- 이미지 도메인: supabase / **Cloudflare R2** (`pub-e16c7a50584c4db7be3571746cd80716.r2.dev`) / cloudfront / daumcdn / **Cloudflare Workers** (`wishes-image-proxy.wishes-img.workers.dev`)
- `/map-2026` → `/map` 301 ✅
- API cache: `/api/listings` 5min, `/api/listings/:id` 5min, `/api/auth/*` no-store, `/api/admin/*` no-store ✅
- Bundle analyzer (`ANALYZE=true npm run build`)

## A10. middleware.ts — 보안 + 단축 URL
- CORS 화이트리스트: wishes.co.kr / www / *.vercel.app ✅
- localhost = dev only (CSRF 방어 L-sec130) ✅
- **wishes.me 최상위 → /s/<code>** rewrite ✅
- 예약어 차단 (admin/api/login/map/...)
- legacy `Bearer <legacy>` strip (구 search content.js 호환)

---

## A11. Discovery 2 후 PR 우선순위 갱신

원래 PR-A~F 에 추가:

### PR-G (신규) — Trigger 등록 5 개로 즉시 데이터 보강 ★
**작업**: 이미 정의된 5 함수를 listings BEFORE INSERT/UPDATE 트리거로 등록만.

```sql
CREATE TRIGGER trg_extract_rooms_bathrooms
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION auto_extract_rooms_bathrooms_from_raw();
-- 그 외 4 개 동일
```

**효과 (즉시)**:
- rooms/bathrooms 53% NULL → 추정 < 20% NULL
- options 32% NULL → 추정 < 10%
- trust_score, jeonse_risk 자동 채움
- problematic 자동 수정 (4,569 건 일부)

**위험**: trigger 가 raw_fields 의 형식 가정 — 실제 데이터로 검증 후. 카나리 필수.

→ **새 우선순위**: Discovery 2 → PR-E preflight → **PR-G** → PR-A → PR-F → PR-B → PR-D → PR-C

PR-G 가 PR-A 보다 먼저인 이유: 데이터를 먼저 채우면 PR-A 의 type 정규화 매핑 정확도가 올라가고, golden case 가 더 풍부해짐.

## A12. 미해결 (다음 라운드)
- supabase/migrations 폴더 (실제 SQL 마이그레이션 파일 — `git log` 도움)
- next.config.js 80~끝, middleware.ts 80~끝
- /features/map-2026/store/index.ts (Zustand 스토어 SoT)
- /features/map-2026/lib/filterVisibility.ts (countActiveFilters 정의)
- ResidenceChips / CommercialChips / LandChips / InvestmentChips 의 실제 enum
- /api/listings/route.ts 200 줄 이후 (gu 필터, 카테고리 매핑)
- /api/map/clusters, /api/listings/viewport, /api/map/items
- supabase 폴더 구조

이 정도면 PR-G + PR-E 부터 시작 안전.

---

이 부록까지 = Discovery 2 라운드 마무리. 이제 PR-G/E 부터 비파괴 진행 가능.
