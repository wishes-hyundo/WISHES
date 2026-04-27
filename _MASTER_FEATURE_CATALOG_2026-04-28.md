# wishes.co.kr 마스터 기능 카탈로그 — 단 하나도 놓치지 마

**작성일**: 2026-04-28
**목적**: 옛날 `/search` + `/admin/*` 의 **모든 기능**을 새 `/search` (BoB 기술) 에 통합하기 전 누락 방지 체크리스트
**조사 범위**: 18,635줄 코드 (content.js 13,671 + admin/* 5,000+) + 15개 patch + 70+ API

---

## 📌 사장님 확인 방법

이 문서를 한 번 읽어보시고:
1. **빠진 기능**이 있으면 알려주세요 (예: "물건 추적 알림이 빠졌어")
2. **버릴 기능**이 있으면 알려주세요 (예: "AI 자동 생성 v1 은 버려, v2 만 남겨")
3. **추가하고 싶은 기능**이 있으면 알려주세요 (예: "VR 투어 추가해줘")

확인이 끝나면 다음 단계 (Step 2. 로컬 빌드 환경 확인) 로 진행합니다.

---

## 카테고리 1. 매물 조회 / 검색 / 필터

### 1.1 옛날 `/search` 메인 포털 (content.js)
- 키워드 검색 (실시간)
- 지역 필터 (시/구/동 다중선택 + 칩)
- 매물 유형 필터 (원룸/투룸/아파트/오피스텔/상가/사무실)
- 거래 유형 필터 (월세/전세/매매)
- 가격 범위 (보증금/월세/매매가)
- 면적 범위 (m² + 평형 자동변환)
- 즉시 입주 필터
- 옵션 필터 (주차/엘리베이터/펫/발코니/풀옵션/대출가능)
- 정렬 (최신/가격↑↓/면적↑↓)
- 카드 그리드 + 무한 스크롤
- IndexedDB 캐시 (오프라인)
- 글로벌 검색 (v292 — 상단 통합검색)
- Scope 토글 (v294 — 내 매물 vs 전체)
- 알림 로그 (v293 — 🔔 벨 + 드로어 200건)
- 모바일 필터 드로어 (v290)

### 1.2 옛날 `/admin/listings` (관리자 매물목록)
- 매물 테이블 (1,336줄 페이지)
- 키워드 검색
- 다중 필터 (지역, 동, 유형, 거래, 상태)
- 정렬 (생성일/제목/주소/동/유형/거래/가격/상태)
- 페이지네이션 (20/50/100)
- 행 인라인 수정
- 체크박스 다중선택
- 현장확인 배지 (7/30/60일 단계)
- 매물별 통계 (조회수/문의수)

### 1.3 옛날 `/admin/search` (검수 모달)
- 매물 리스트 + 키워드 필터
- 6개 overlay (교통/지도/실거래/건축물/AI/추천)

---

## 카테고리 2. 매물 상세보기

### 2.1 공개 사용자 (`/listings/[id]`)
- 이미지 갤러리 + Lightbox
- VR 투어 (Matterport/Youtube)
- 동영상 재생 (여러 개 지원)
- 기본정보 표 (가격/면적/층/방/욕실/방향)
- 옵션 칩 (6가지)
- 상세설명 (마크다운)
- 위치 지도 (카카오맵)
- 유사매물 추천 (embedding)
- 실거래가 차트
- 교통정보 (지하철/버스 시간)
- 공방향 나침반 (SVG)
- 중개사 정보 카드
- 문의 폼
- 방문 예약 폼
- 즐겨찾기 (♥)
- 공유 버튼 (카톡/페북/URL)

### 2.2 옛날 `/search` 중개사 포털 상세 모달
- 6섹션 단일 스크롤 (v240)
- Hero (주소/가격/배지)
- 기본정보 4열 grid
- 옵션 칩 + 상세설명
- 위치 (카카오맵)
- 유사매물 슬라이더
- 🔒 중개사 전용 (접힘) — 이력/연락처/메모/원본
- 관계자 연락처 (v270 — 050 안심번호 배지)
- 매물 편집 모달 (v297 — slide-over)
- AI 매물설명 v2 재생성 (v300 — 글로벌 SOTA RAG)
- 본문 hydrate (v295 — 초기 로드 후 보강)
- 알림 로그 표시

---

## 카테고리 3. 매물 등록 (신규)

### 3.1 옛날 `/admin/listings/new` (6 Step 폼, 2,739줄)
- **Step 1 기본정보**: 주소(다음 우편번호), 동, 매물유형, 거래유형
- **Step 2 위치**: 도로명/지번, 건물명, 건축물대장 자동조회 → 자동입력
- **Step 3 면적/층수**: 전용면적/공급면적, 층수, 방/욕실 수
- **Step 4 추가정보**: 방향, 난방, 입주가능일, 건축년도, 옵션 6가지
- **Step 5 설명**: textarea, AI 자동생성 버튼
- **Step 6 이미지**: 드래그앤드롭 (최대 10장), AVIF 자동 변환, 미리보기, 순서변경
- 임시저장 (localStorage draft)
- 복사 모드 (기존 매물 복사 후 수정)
- 호실 단위 선택 (`ExclusiveUnitSelector` — 집합건물 호수 자동)
- 동영상 업로드
- 상업용 체크리스트 (상가/사무실 — 권리금/업종제한 등 7개)
- SEO 미리보기

### 3.2 옛날 `/admin/listings/bulk-upload` (CSV 일괄)
- xlsx/xls/csv 파일 선택
- 헤더 자동매핑 (영문/한글 혼용 — Levenshtein)
- 헤더 수동매핑 (드롭다운)
- 미리보기 (10줄)
- 유효성 검사 (필수필드 + 타입)
- 일괄 POST (진행률 표시)
- 결과 요약 (성공/실패)

---

## 카테고리 4. 매물 수정

- 옛날 `/admin/listings/[id]/edit` — 6 Step 폼 재사용 (pre-fill)
- 옛날 `/search` v297 patch — slide-over 패널 인라인 수정
  - 모든 필드 수정 가능
  - 크롤링 raw_fields READ-ONLY
  - 상태 변경 (공개/비공개/계약중/계약완료)
  - 이미지 추가/제거/순서변경
  - cascade 'broker' 자동 표시 (L-cascade1)

---

## 카테고리 5. 매물 검수

### 5.1 검수 overlay 6개 (`/admin/search`)
- 교통정보 (`TransportInfo` — 카카오 Local + Directions)
- 위치 지도 (`LocationMap` — 카카오맵 + 마커)
- 실거래가 (`RealPriceTrend` — Chart.js)
- 건축물대장 (`BuildingRegistry` — 27개 필드)
- AI 자동생성 (`AIAutoGenerate` — Gemini 2.0 Flash)
- 스마트 추천 (`SmartRecommend` — embedding 유사도)

### 5.2 중복 매물 (`/admin/dedup`)
- 중복 스캔 (주소/건물명 그룹)
- 유사도 계산
- soft-delete (is_duplicate=true)
- 복원
- hard-delete (cron 또는 수동)

---

## 카테고리 6. AI 기능

- v1 AI 자동생성 (`AIAutoGenerate` — 정적 템플릿) ← **버릴 예정**
- v2 AI 매물설명 (v300 — 글로벌 SOTA RAG, 환각 0%, 7개 페르소나, Gemini 2.0 Flash)
- 키워드 자동생성 (SEO 태그 5-10개)
- 백필 (기존 매물 일괄 채움)
- 사진 강화 AI (`/admin/photo-enhancer` — sharp + Gemini)

---

## 카테고리 7. 일괄 작업 (Bulk)

- 일괄 삭제 (선택 매물 — `handleBulkDelete`)
- 일괄 상태변경 (`handleBulkStatusChange`)
- 일괄 현장확인 (`handleBulkVerify`)
- 일괄 가격업데이트 (미구현 — API만 있음)
- 일괄 설명 추가 (미구현)
- CSV 내보내기 (`handleExportCSV` — 필터 결과 전체)

---

## 카테고리 8. 사진/영상

### 8.1 이미지
- 드래그앤드롭 업로드
- 자동 AVIF 최적화 (sharp)
- 미리보기 + 순서 변경
- 워터마크 자동 (Classic Negative + 중앙 WISHES)
- AI 강화 (`enhanceImage` — sharp + Gemini)
- Cloudflare R2 저장
- 1년 캐시 (CDN)
- 모자이크 (전화번호 자동감지 + 픽셀화)

### 8.2 동영상
- 파일 업로드 (MP4/WebM, 최대 100MB)
- 메타데이터 추출 (duration/width/height)
- Pre-signed URL (직접 R2 업로드)
- VideoPlayer (다중 재생)
- Poster 자동생성 (Canvas 캡처)

---

## 카테고리 9. 외부 데이터 자동조회

### 9.1 건축물대장 (Building Registry)
- 주소 → bcode 변환 (Daum)
- bcode → 건축물정보 (`/api/admin/building-registry-full`)
- 27개 필드 자동입력 (세대수, 층수, 엘리베이터, 주차, 건축년도, 용도 등)
- Geocoding (주소 → lat/lng — 카카오)
- 건축물대장 백필 cron (30분마다 — `/api/cron/backfill-building-info`)

### 9.2 실거래가 (RTMS)
- 실거래가 수집 cron (`/api/cron/update-rates` — 일일 갱신)
- 차트 시각화 (`RealPriceChart` — 최근 6개월)

### 9.3 교통정보
- 근처 지하철역 (카카오 Local API, 반경 1km)
- 역까지 시간 (카카오 Directions, 도보/차량)
- 버스 노선 (미구현 — 향후)

### 9.4 공실클럽 크롤링 (참조용)
- 옛날 가게 raw_fields 원본보기 (READ-ONLY)

---

## 카테고리 10. CSV/Excel 입출력

- 일괄 등록 (`ExcelUpload` — 헤더 매핑/미리보기/검증)
- 매물 목록 export (CSV — 필터된 결과)
- 감사 로그 export (`/api/admin/audit-log/export`)
- 구독자 export (미구현)

---

## 카테고리 11. 중복 매물 (dedup)

(카테고리 5.2 참조)

---

## 카테고리 12. 연락처 / 약속 / 알림

### 12.1 상담 (`/admin/contacts`)
- 문의 폼 (공개 사용자 — `InquiryModal`)
- 상담 목록 (관리자)
- 상태 변경 (접수→처리중→완료)
- 상담 메모

### 12.2 방문 예약
- 예약 폼 (`VisitBookingModal`)
- 예약 캘린더 (`AdminAppointmentsPanel` — 주간 뷰)
- 상태 변경 (예약→확인→완료/취소)

### 12.3 알림 로그 (v293)
- 🔔 벨 아이콘 (header)
- 알림 드로어 (타임라인)
- 중복 경고 (autoDedup 빨간 배지)
- 토스트 (6초)
- localStorage 200건 저장
- 개별/전체 삭제

### 12.4 알림 구독 (`AlertSubscribeModal`)
- 지역/유형/가격 조건 저장
- 신규 매물 발생 시 이메일/푸시 (미구현 — Twilio/SendGrid 대기)

---

## 카테고리 13. 인증 / 권한 / 중개사 관리

### 13.1 인증
- 로그인 (이메일+비밀번호 — Supabase Auth)
- OAuth 카카오 (`/api/auth/kakao`)
- OAuth 네이버 (`/api/auth/naver`)
- 회원가입 (`/signup` — 이메일 검증)
- 비밀번호 재설정
- 세션 유지 (15분 주기 refresh — L-session1)
- 세션 만료 경고 (5분 전 토스트)
- 계정 삭제 (GDPR)

### 13.2 MFA (옛날 admin)
- TOTP 등록 (`/api/admin/mfa/enroll` — QR 코드)
- 인증 (`/api/admin/mfa/verify`)
- 복구코드 10개
- 2단계 로그인

### 13.3 권한
- admin 게이트 (`/admin/*` 진입 전)
- broker 게이트 (`/search` 진입 전)
- 역할 확인 (`/api/auth/me`)
- adminFetch CSRF + Bearer (L-sec147)

### 13.4 중개사 프로필 (`/admin/profile`)
- 프로필 보기/수정 (이름/전화/회사)
- 사용자 관리 (관리자 전용 — `/admin/users`)
- 권한 변경 (admin/broker)
- 비활성화

---

## 카테고리 14. 대시보드 / 통계

### 14.1 옛날 admin 대시보드 (`/admin`)
- stats 카드 5개 (전체/공개/계약중/완료/미처리상담)
- 일일 브리핑 (`AdminBriefingPanel` — 조회 TOP, 최근등록, 미처리상담, 거래분포)
- 오늘 할 일 (`AdminTodayPanel` — 파이프라인 미처리 리드)
- 주간 전환율 (`AdminConversionPanel` — 문의→예약→계약 퍼널)
- 방문 예약 (`AdminAppointmentsPanel` — 주간 캘린더)
- 뉴스레터 (`AdminNewsletterPanel` — 구독자/발송)
- 차트 (`AdminDashboardCharts` — 거래유형/지역 분포 도넛/막대)
- 계약 갱신 알림 (`ContractRenewalAlert` — 90일 미갱신 배너)
- 주간 이메일 cron (`/api/cron/weekly-briefing`)

### 14.2 명령센터 (`/admin/command-center-v2`)
- (미파악 — 별도 분석 필요)

### 14.3 사진 강화 탭 (`/admin/photo-enhancer`)
- 이미지 선택
- AI 강화 (sharp + Gemini)

### 14.4 마이페이지 (`/mypage` — 공개 사용자)
- 관심매물 목록
- 최근 본 매물 (localStorage 5개)
- 프로필 수정

### 14.5 뉴스레터
- 구독자 목록
- 발송 (전체/필터)
- 템플릿 (주간/특가)
- 구독 해제 (`/unsub` — 토큰)

---

## 카테고리 15. 모바일 / 접근성 / SEO

### 15.1 모바일
- 반응형 (Tailwind mobile-first, 375px+)
- 터치 타겟 44px 최소 (P0-1)
- 모바일 필터 드로어 (BottomSheet 3-snap drag)
- 모바일 하단바 (3개+더보기, safe-area-inset)
- 이미지 4:3 강제 (CLS 개선)
- Pull-to-Refresh
- 오프라인 배너
- 스켈레톤 로딩 (shimmer)
- Haptic Vibrate (즐겨찾기)
- 스크롤 위치 복원 (sessionStorage)

### 15.2 접근성
- aria-label (모든 버튼)
- 폼 라벨 (htmlFor)
- 색상 대비 4.5:1
- 포커스 인디케이터 (outline 2px)
- 언어 선택 (KO/EN — `LanguageToggle`)
- 다크 모드 (미구현)
- 캡션 (영상 — 미구현)

### 15.3 SEO
- Open Graph (og:title/image/description)
- canonical URL
- Sitemap (`/api/sitemap.xml` — 동적)
- robots.txt
- JSON-LD (`RealEstateAgent` + `Residence`)
- 메타 설명 (155자)
- 키워드 기반 제목
- 이미지 alt
- Core Web Vitals (LCP/FID/CLS)
- Google Search Console 자동 재요청 (cron)
- 네이버 검색어드바이저 sitemap 제출

---

## 카테고리 16. 알림 로그 / 디버깅 / 기타

### 16.1 알림
- 토스트 (`Toast` — 6초)
- 알림 로그 (v293 드로어 200건)
- 중복 경고 배지
- 세션 만료 경고
- 에러 토스트 (모든 fetch catch)

### 16.2 로깅 / 감시
- 감사 로그 (`audit_log` 테이블 — L-audit-table)
- CSP 위반 보고 (`/api/csp-report`)
- 헬스체크 (`/api/health`)
- 버전 정보 (`/api/version`)
- Sentry (`@sentry/nextjs`)
- OTel observability

### 16.3 유틸
- 주소 검색 (Daum Postcode)
- 지도 (카카오 Maps)
- 이미지 최적화 (sharp + Gemini)
- 단위 변환 (평형 ↔ m²)
- 가격 포맷 (만원/억)
- 주소 마스킹 (프라이버시)
- 시간 상대표현 ("1시간 전")
- 데이터 검증 (클라이언트 + 서버)
- localStorage (ws_token, 메모, 알림로그)
- IndexedDB (allListings 캐시)
- Service Worker (`/sw.js`, `/sw-map-v1.js`)

---

## 📂 옛날 `/admin/*` 12개 탭 전체 목록

| 탭 | 라우트 | 파일 | 줄 | 주요 기능 |
|----|--------|------|-----|----------|
| 홈/대시보드 | `/admin` | `page.tsx` | ~ | stats + 7개 패널 |
| 매물 목록 | `/admin/listings` | `page.tsx` | 1,336 | 테이블/필터/일괄작업 |
| 매물 등록 | `/admin/listings/new` | `page.tsx` | 2,739 | 6 Step 폼 |
| 매물 수정 | `/admin/listings/[id]/edit` | `page.tsx` | ~ | 등록 폼 재사용 |
| 일괄 업로드 | `/admin/listings/bulk-upload` | `page.tsx` | ~ | CSV/Excel |
| 검수 | `/admin/search` | `page.tsx` | 438 | 6 overlay |
| 연락처 | `/admin/contacts` | `page.tsx` | ~ | 문의 관리 |
| 중복 매물 | `/admin/dedup` | `page.tsx` | ~ | 스캔/숨기기 |
| 사진 강화 | `/admin/photo-enhancer` | `page.tsx` | ~ | AI 강화 |
| 사용자 관리 | `/admin/users` | `page.tsx` | ~ | 권한 변경 |
| 프로필 | `/admin/profile` | `page.tsx` | ~ | 중개사 정보 |
| 명령센터 | `/admin/command-center-v2` | `page.tsx` | ~ | 미분석 |

---

## 📡 API 엔드포인트 전체 (~100개)

### 인증
`/api/auth/{login,register,kakao,naver,forgot-password,reset-password,verify,refresh-session,complete-profile,delete-account,me,oauth-start,cookie-issue}`

### 매물 조회 (공개)
`/api/listings`, `/listings/[id]`, `/listings/by-ids`, `/listings/map`, `/listings/stats`, `/listings/viewport`, `/listings/[id]/{nearby,real-prices,recommend,videos,videos/metadata,videos/presign,images}`

### 관리자 매물
`/api/admin/listings`, `/listings/[id]`, `/listings-bulk-delete`, `/listings-bulk-update`, `/listings-field-update`, `/upload`, `/upload-video`

### AI / 자동화
`/api/admin/{auto-generate,auto-generate-bulk,generate-description,generate-description-v2}`
`/api/admin/{building-registry,building-registry-full,backfill-embeddings,backfill-maintenance,clean-raw-fields,enrich-stations,enrich-title-hints,smart-analyze}`

### 중복 / 마이그레이션
`/api/admin/dedup/{scan,hide,restore,cleanup}`, `/dedup-migrate`, `/db-migrate`, `/apply-map-migration`, `/migrate-to-r2`, `/migrate`, `/geocode-batch`, `/geocode-listings`

### 대시보드
`/api/admin/{stats,briefing,appointments,contacts,subscribers,send-newsletter,users,audit-log,audit-log/export}`

### MFA
`/api/admin/mfa/{enroll,verify,login-verify,recovery,challenge}`

### 사용자
`/api/{profile,favorites,alerts,alerts/send,contacts,appointments,saved-searches}`

### 지도 / 외부
`/api/map/{items,clusters,search,search-nl,isochrone}`, `/address-search`, `/kakao-rv/[...path]`, `/geo/{sido,sigungu,dong,dong/sigungu/[code],legaldong/sigungu/[code]}`, `/building-ledger`

### AI / 챗봇
`/api/{chat,ai/briefing,ai/match,analyze-photo,mosaic-image}`

### Cron (스케줄)
`/api/cron/{notify-matches,update-rates,weekly-briefing,backfill-building-info}`

### 기타
`/api/{health,version,agent/[id],short-url,revalidate,unsub,og/listing/[id],rates,csp-report,naver-works-post,r2/[...path],images/[id],images/[...path],img-proxy,wm/[...path],_diagnostic/r2,diagnostic/r2}`

---

## 🗄️ 주요 DB 테이블

| 테이블 | 주요 컬럼 | 용도 |
|--------|----------|------|
| `listings` | id, type, deal, address, dong, gu, deposit, monthly, price, area_m2, floor_current, floor_total, rooms, bathrooms, built_year, status, lat, lng, ai_tags (=seo_tags), raw_fields, description, ai_description, images, building_info (JSONB), contacts (JSONB), field_sources (JSONB cascade), is_duplicate, created_by, created_at, updated_at | 매물 마스터 |
| `listing_images` | id, listing_id, url, order | 이미지 |
| `listing_videos` | id, listing_id, url, poster, duration, width, height | 동영상 |
| `building_info` | (JSONB on listings) — 27개 필드 | 건축물대장 |
| `prices` | listing_id, price, date | 실거래가 |
| `appointments` | id, listing_id, date, time, visitor_name, phone, status | 방문예약 |
| `contacts` | id, name, phone, email, message, listing_id, status, source | 상담 문의 |
| `admin_users` | id, email, role, status, name, phone, company_name | 중개사/관리자 |
| `favorites` | user_id, listing_id | 관심매물 |
| `saved_searches` | user_id, filters | 저장 검색 |
| `subscribers` | email, status | 뉴스레터 구독 |
| `audit_log` | user_id, action, entity, entity_id, before, after, timestamp | 감사 로그 |
| `admin_mfa` | admin_id, secret, recovery_codes | MFA |
| `short_urls` | code, url | 단축 URL |

---

## 🔧 patch 파일 15개 (`/public/search/content-v*.js`)

| 버전 | 파일 | 역할 | 의존 |
|------|------|------|------|
| base | content.js (13,671줄) | 메인 포털 | sessionStorage 토큰 |
| v230 | content-v230-patch.js | UI/UX 5탭→브리핑 | content.js |
| v240 | content-v240-detail.js | 상세모달 단일스크롤 | v230 |
| v260 | content-v260-perf.js | ai_tags 성능 (자동 재생성 방지) | v240 |
| v270 | content-v270-contacts.js | 관계자 연락처 (050 배지) | v240 |
| v270 | content-v270-freshness.js | (제거됨 — UI 가림 버그) | — |
| v280 | content-v280-mobile.js | 모바일 최적화 기본 | v270 |
| v290 | content-v290-polish.js | 모바일 폴리싱 22건 | v280 |
| v291 | content-v291-stability.js | v290 회귀 제거 | v290 |
| v292 | content-v292-global-search.js | 통합검색 광역 | v291 |
| v293 | content-v293-alert-log.js | 🔔 알림 로그 200건 | v292 |
| v294 | content-v294-scope.js | Scope 토글 (내 매물/전체) | v293 |
| v295 | content-v295-detail-hydrate.js | 본문필드 보강 | v294 |
| v297 | content-v297-edit.js | 상세 편집 slide-over | v295 |
| v300 | content-v300-aidesc-v2.js | v2 AI 매물설명 (RAG) | v297 |

---

## ⚠️ 미구현 / 검토 필요

- 일괄 가격업데이트 UI (API만 있음)
- 일괄 설명 추가 UI (API만 있음)
- MFA UI 전체 (API만 있음)
- 동영상 업로드 UI (API만 있음)
- 신고 기능 (부동산 사기) — 미구현
- 다크 모드 (prefers-color-scheme)
- 영상 자막 (VTT)
- 뉴스레터 스케줄링 (일회 발송만)
- AI 시세 추정 (Gemini + 시장 데이터)
- 학세권 필터 (학교/학원/병원)

---

## 사장님 확인 체크리스트

각 카테고리에 ✅ / ❌ / 추가요청 표시해주세요:

- [ ] 카테고리 1 — 매물 조회/검색/필터
- [ ] 카테고리 2 — 매물 상세보기
- [ ] 카테고리 3 — 매물 등록 (6 Step + CSV)
- [ ] 카테고리 4 — 매물 수정 (slide-over)
- [ ] 카테고리 5 — 검수 6 overlay + 중복 관리
- [ ] 카테고리 6 — AI v2 (RAG, 환각 0)
- [ ] 카테고리 7 — 일괄 작업
- [ ] 카테고리 8 — 사진/영상
- [ ] 카테고리 9 — 외부 데이터 (건축물/실거래/교통)
- [ ] 카테고리 10 — CSV/Excel
- [ ] 카테고리 11 — 중복 매물
- [ ] 카테고리 12 — 연락처/예약/알림
- [ ] 카테고리 13 — 인증/권한/MFA/프로필
- [ ] 카테고리 14 — 대시보드/통계
- [ ] 카테고리 15 — 모바일/접근성/SEO
- [ ] 카테고리 16 — 알림 로그/디버깅/유틸

**모두 ✅ 면 다음 단계 (Step 2 빌드 환경 확인)** 로 진행합니다.
**누락/수정**이 있으면 알려주세요 — 카탈로그 보완 후 다시 확인합니다.

---

작성: 2026-04-28 | 라이브 commit ac87dd3 | BoB Phase 1 코드는 `feat/bob-phase1` 브랜치 보존
