# 위시스 중개사 포털 — 다음 세션 부트스트랩 v2

> **사용법**: 새 세션 첫 메시지에 이 파일 전체 붙여넣기 → 모든 컨텍스트 즉시 복원 → 사장님 명령 받음
> 이전 부트스트랩 (`_SESSION_BOOTSTRAP_PROMPT.md`) 의 v2. Phase 1 + 5 + 6 완료 + 자가검수 12 라운드 누적 후 작성.

---

## 0. 사장님 정체성 + 핵심 명령

**사장님 (Owner)**: WISHES (wishes@wishes.co.kr)
**사이트**: https://wishes.co.kr
**프로젝트 경로**: `C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2`
**GitHub**: `wishes-hyundo/WISHES` (main)
**라이브 commit (이 부트스트랩 작성 시점)**: `111036b`

### 영구 정책 (CLAUDE.md 동기화, 절대 위반 X)

#### 🚫 절대 X (사장님 명령)
1. **`/search` 절대 손대지 마라** — 13년 손때 묻은 중개사 작업장. vanilla content.js 영구 보존.
   - `src/app/search/page.tsx` (451줄), `src/app/search/layout.tsx`
   - `public/search/content.js` (13,671줄)
   - `public/search/content-v230~v300-*.js` (14 patch)
   - `public/search/styles.css` (850줄)
   - React 재현 X, BoB 컴포넌트 X, shadcn/ui X
   - 새 기능은 `content-v301-...js` 패치 파일로
2. **사장님 직접 검토 페이지 X** — 자동화로 처리. 사장님 시간 빼앗는 UI 만들지 마라.
3. **카톡 알림톡 (Solapi) X** — 알림은 Resend 이메일만.
4. **AI 시세 추정 / 자연어 검색 / pgvector AI 추천 X** — 사장님 한 번 거부.
5. **Sentry $26 X** — 사장님 한 번 거부.
6. **가격 이상치 자동 판단 X** — 시세는 사장님 영역.
7. **공실클럽 / 온하우스 자동 크롤링 X** — 사장님 별도 프로그램 보유. DB INSERT 만 하면 위시스 자동 enrich 작동.
8. **모호 5개 영구 X** — 전자서명 / Bright Data / 친구톡 / 3D 사진 / eKYC.
9. **큰 비용 X** — VR Matterport / 음성 AI / 데이터 웨어하우스 / 모바일 네이티브 앱.
10. **거래 기록 삭제 X** — PIPA 3년 후 PII 만 익명화. 거래 통계 영구 보존.

#### ✅ 허용 (사장님 명령)
1. **`/admin/*` 자유** — 새 React, shadcn/ui, Tailwind v4, 디자인 변경 OK, 새 페이지 생성 OK, 영구 유지.
2. **무료 + 극소액 OK** — 부트스트랩 §9 매트릭스 (월 $400~1,200).
   - 무료: Gemini Flash / Kakao / V-World / data.go.kr / Resend / GA4 / Clarity / GrowthBook / PostHog
   - 극소액: Vercel Pro $20 / Supabase Pro $25 / Anthropic API $50~300 / Cloudflare R2 $5
3. **자동화 우선** — SQL 함수 + cron + AI 무료 한도 활용.
4. **전국 부동산 운영** — 서울이 가장 많지만 서울 전문 X. 매물 부족할 뿐.
5. **2026 SOTA 기술** — Next.js 16, React 19, TypeScript 5.7+, Claude Sonnet 4.6, Gemini 2.5 Flash.

#### 🤖 자동화 우선 원칙
- 사장님께 일 시키지 마라. 사장님은 결과만 받음.
- 데이터 보정 / 정리 / enrich → SQL + cron 자동
- 매물 등록 시 KISO 14항 자동 검증 (trigger)
- 이상치 / 중복 / 오류 → 자동 탐지 + 자동 보정
- 정기 보고서 → Resend 이메일 (월 1회)
- "사장님이 직접 클릭해서 처리" UI 절대 X

---

## 1. 비즈니스 모델

```
[외부 매물 소스 — 사장님 별도 프로그램]
├─ 공실클럽 (사장님 자체 시스템)
└─ 온하우스 (사장님 자체 시스템)

         ↓ DB INSERT (사장님 별도 프로그램이 위시스 listings 에)

[위시스 본진 = wishes.co.kr]
├─ /search = 옛날 vanilla 가게 (영구 보존, 절대 X)
├─ /admin/* = React + 자유 (영구 유지)
├─ 매물 자동 enrich (15분 cron + 6시간 cron + 매일 cron)
├─ AI v3 (Gemini 2.5 Flash 무료 + Claude — 단 시세는 사장님 영역)
├─ 17 한국 데이터 자동 (V-World, Kakao, 학교, 미세먼지, 학원 등)
├─ CRM 파이프라인 (Lead→Closed)
├─ 마케팅 (이메일 + 단축 URL + 인스타 카드 — 카톡 X)
├─ 분석 dashboard (read-only, 사장님 클릭 0)
└─ 권한 5단계 (Owner/Admin/Broker/Partner/Pending)

         ↓

[고객]
├─ 자체 사이트 (wishes.co.kr 일반)
├─ 이메일 (Resend 무료 100K)
├─ 단축 URL + QR + OG 미리보기
└─ 인스타 카드 (자동 게시는 사장님 결정)
```

---

## 2. 라이브 현재 상태 (작성 시점)

- **HEAD (라이브)**: `111036b`
- **/search**: 옛날 vanilla content.js 13K + 14 patch ✅ 무중단
- **/admin/***: 영구 유지, React + Tailwind 자유
- **빌드 패턴**: 단계별 단독 commit + Vercel 빌드 검증 (한꺼번에 X)
- **푸시 클론**: `/tmp/wishes-build` (별도 git checkout). credential = `.git/credentials` (mount 의 것 복사)

### 매물 통계
```
listings_total: 12,130
status='공개': 11,611
status='비공개': 515 (자동 처리 — 가격 누락, 중복, area 극단치)
fingerprint: 100% ✅ (md5)
air_quality_avg: 100% ✅ (서울 PM2.5 21.0 — 매물 모두 서울)
trust_score 평균: 44/100
신뢰도 ≥80: 236건
신뢰도 <40: 4,471건
```

### 사용자
- admin_users 13명 (사장님 owner 1 + admin 1 + broker/agent 11)
- 모두 status='approved', PIPA 동의 grandfathered backfill 완료
- MFA 활성화: 0명 (옵션)

---

## 3. 확정 기술 스택 (무료 / 극소액)

### Framework
- Next.js 16 (App Router, RSC, Server Actions)
- React 19 (use API, Suspense)
- TypeScript 5.7 strict

### UI (옛날 디자인 영구 보존, /admin 만 자유)
- shadcn/ui + Radix UI + cva
- Tailwind CSS v4
- lucide-react (아이콘)
- 색상: `wishes-search-primary #2D5A27` (옛날 가게), `wishes-primary #1b5e20` (홈/마케팅)
- 폰트: GmarketSans + Pretendard

### 상태 / 데이터
- TanStack Query v5 + Table v8 + Virtual v3
- React Hook Form + Zod

### 백엔드
- Supabase (PostgreSQL 17.6 + Auth + RLS + Storage + Realtime + pgvector)
- Drizzle ORM
- Vercel Edge / nodejs Functions
- Vercel Cron (무료)
- Cloudflare R2 (이미지/PDF, 백업 옵션)

### AI
- Google **Gemini 2.5 Flash** (무료 일 100K, Vision + Text)
- Anthropic Claude (Sonnet 4.6 / Haiku 4.5) — 옵션
- Vercel AI SDK v6
- Prompt caching 90% 절감

### 메시징
- **Resend** (이메일 100K 무료) ⭐
- React Email (템플릿)
- ❌ Solapi 카톡 (사장님 X)

### PDF
- **`@react-pdf/renderer ^4.1.6`** (Vercel Serverless 검증) ⭐
- Noto Sans KR (Google CDN OTF)
- Recharts v3 (차트)

### 단축 URL / SNS
- short_urls 테이블 + `/api/short-url`
- `qrcode ^1.5.4 + @types/qrcode` (PNG)
- Next.js `next/og` ImageResponse (Satori, 의존성 0)

### 분석 / 모니터링
- Vercel Analytics + Speed Insights
- GA4 (무료)
- Microsoft Clarity (무료)
- PostHog free tier
- GrowthBook (Feature Flag)

### 보안
- Supabase RLS (모든 19 테이블)
- 5단계 권한 (Owner/Admin/Broker/Partner/Pending)
- Argon2id / bcrypt + MFA TOTP (옵션)
- CSRF double-submit hard enforce
- HSTS + CSP (unsafe-inline 옛날 가게 의존)
- audit log (admin_audit_log + listing_history)

### 한국 17 데이터 (모두 무료)
- V-World 건축물대장 27 필드 ✅ cron 매 15분
- Kakao Local API ✅ cron 매 6시간 (좌표) + 매일 (학세권)
- RTMS 실거래가 (사장님 API key 등록 대기)
- 학교알리미 / 어린이집정보공시 / 학원알리미 ✅ Kakao Local 통합
- 에어코리아 미세먼지 ✅ 시도별 매핑 (전국 17 시도)
- 국토부 토지이용 / 공시지가 (사장님 API key 등록 대기)
- 경찰청 안전 점수 (동일)
- 부동산24 / KOSIS / 소상공인공단 / R-ONE (cron 추가 가능)

---

## 4. 운영 cron 매트릭스 (23개, 모두 무료/극소액)

### 매 15분
| cron | 용도 |
|---|---|
| backfill-building-info | V-World 건축물대장 27 필드 자동 enrich |

### 매 6시간
| cron | 용도 |
|---|---|
| geocode-missing | Kakao 좌표 자동 보정 (50건/run) |
| enrich-vision | Gemini Vision (direction + heating_type) |
| enrich-text | Gemini Flash (description + seo_tags) |

### 매일 KST
| 시간 | cron |
|---|---|
| 02:00 | integrity-audit (데이터 무결성) |
| 03:00 | auto-fix-problematic (5종 자동 정리) |
| 04:00 | pipa-anonymize (PIPA 3년 후 PII 익명화) |
| 04:00 | rtms-sync (사장님 API key 대기) |
| 07:00 | notify-matches (saved_searches 자동 이메일) |
| 10:00 | auto-extract-options (raw_fields → 옵션) |
| 10:30 | price-outliers (깡통전세만, 가격 이상치 X) |
| 10:45 | trust-score (0-100 자동 계산) |
| 11:00 | enrich-school-zone (학교/학원/어린이집/병원) |
| 12:00 | enrich-air-quality (시도별 PM2.5) |
| 20:30 | enrich-academies (학원 정밀) |
| 21:00 | enrich-subway (지하철역 + 가까운 역 3개) |

### 매주
| 요일 | cron |
|---|---|
| 일 02:00 | backup-r2 (Cloudflare R2 무료 10GB) |
| 일 14:00 | ai-hallucination-fix |
| 월 13:00 | verify-business (사업자번호) |
| 월 22:00 | enrich-land-price (V-World 공시지가) |
| 월 22:30 | enrich-crime-safety (경찰청) |

### 매월
| 일자 | cron |
|---|---|
| 1일 09:00 | monthly-report (사장님 자동 이메일, Resend) |
| 1일 09:00 | sota-recommend (부동산 SOTA 8 토픽) |

---

## 5. DB 마이그레이션 누적 (16개 적용 완료)

```
phase0a_parsing_bug_fix_2026_04_27
phase0b_anon_listings_lockdown_2026_04_27
phase0c_type_correction_2026_04_27
phase0d_field_sources_cascade_2026_04_27
phase0e_function_search_path_2026_04_27
phase0e2_cascade_helpers_search_path_2026_04_27
phase1_01_user_role_enum_and_helpers
phase1_02a_rls_always_true_tightening
phase1_02bc_admin_users_and_broker_rls
phase1_03_security_definer_cleanup_and_audit
phase1_04_pipa_consent_kiso_ai_label
phase1_05_pipa_anonymize_and_p1_backfill
phase1_06_auto_fix_problematic_listings
phase1_07_full_auto_listing_cleanup
phase1_08_area_policy_fix
phase1_09_raw_fields_options_extract
phase1_10_full_automation_db
phase1_11_price_outlier_revert
phase1_12_fingerprint_and_history
phase1_13_ai_cost_monitoring
phase5_korean_17_data_enrich
phase1_14_cron_health_and_trends
```

### 매물 컬럼 추가 누적
```
fingerprint / fingerprint_at  (md5 바코드)
trust_score / trust_score_at
school_zone_score / school_zone_data
air_quality_avg / air_quality_data
school_count / daycare_count / academy_count / hospital_count
subway_count / subway_data
land_use / land_price_per_m2
crime_safety_score / noise_level / commercial_score
rtms_avg_price / rtms_data
ai_generated_fields  (한국 AI 기본법 2026)
is_problematic / problematic_reason / problematic_marked_at
```

### admin_users 컬럼 누적
```
role (enum user_role: owner/admin/broker/partner/pending)
status / mfa_enabled / mfa_secret
terms_consent_at / terms_version
privacy_consent_at / privacy_version
marketing_consent_at / marketing_consent
business_number / business_verified / business_verified_at
```

### 신규 테이블
```
listing_history  (변경 이력, fingerprint 기반)
legal_documents  (terms/privacy/marketing/ai_label 버전 관리)
user_consents    (사용자별 동의 이력 + ip + user_agent)
sota_reports     (월간 SOTA 보고서)
```

---

## 6. 권한 시스템 5단계 (Phase 1)

| 역할 | DB role | 권한 |
|------|--------|------|
| Owner | `owner` | 모든 + 사용자 권한 부여 (사장님) |
| Admin | `admin` | Owner 외 모든 + Pending 승인 |
| Broker | `broker` | 자기 매물 + CRM (legacy `agent` 매핑) |
| Verified Partner | `partner` | 회사 매물 조회 |
| Pending | `pending` | 로그인만 (데이터 X) |

helper 함수 7개:
- `current_user_role()` (정규화)
- `is_owner()` / `is_admin_or_above()` / `is_broker_or_above()` / `is_partner_or_above()` / `is_pending_user()`
- `log_admin_users_role_change()` (audit trigger)

---

## 7. Phase 단계 진척

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | 권한 + 보안 (RBAC + RLS + JWT + PIPA + KISO + AI 라벨) | ✅ 완료 |
| 2 | 옛날 UI 픽셀 React 재현 | ❌ **사장님 영구 X** |
| 3 | admin/* 통합 + 옛날 admin 폐기 | ❌ **사장님 영구 X** (admin/* 영구 유지) |
| 4 | 매물 수집 (공실/온하우스) | 🔵 **사장님 별도 프로그램** (위시스 INSERT trigger 만 작동) |
| 5 | 17 한국 데이터 자동 enrich | ✅ 완료 (env 등록 대기 일부) |
| 6 | OCR + 인스타 카드 + PDF (react-pdf) + QR + 매칭 알림 | ✅ 완료 |
| 7 | 옛날 코드 폐기 | ❌ **무효** (옛날 가게 영구 보존) |

---

## 8. Phase 6 라이브 endpoint (5개)

| URL | 용도 | SOTA |
|---|---|---|
| `POST /api/admin/extract-from-photo` | 매물 광고지 OCR 자동 등록 | Gemini 2.5 Flash Vision 무료 |
| `GET /api/og/instagram/[id]` | 1080×1080 SNS 카드 | Next.js Satori (의존성 0) |
| `GET /admin/briefing/[id]` | 매물 PDF 인쇄 친화 페이지 | Server Component |
| `GET /api/admin/briefing-pdf/[id]` | 자동 PDF 다운로드 | **react-pdf 4.1 + Noto Sans KR** ⭐ |
| `GET /api/og/qr/[code]` | 단축 URL QR PNG | qrcode + @types/qrcode |

### 사용 흐름 (사장님 손 0)
```
1. 매물 광고지 사진/팩스 받음 → /api/admin/extract-from-photo POST
   → Gemini Vision OCR → listings 자동 INSERT
   → 신뢰도 ≥90 자동 공개, 미만 비공개 (사장님 검토 X — 자동)
2. 매물 → /api/short-url → 단축 URL + QR
3. 인스타 카드 → /api/og/instagram/[id] (사장님 직접 게시 — 자동 게시 X)
4. PDF → /admin/briefing/[id] (HTML, Cmd+P) 또는 /api/admin/briefing-pdf/[id] (자동)
5. 매물 매칭 알림 → notify-matches cron 매일 07:00 (Resend 무료 자동)
```

---

## 9. 사장님 read-only Dashboard

**`/admin/automation-status`** (Server Component, 1분마다 자동 갱신, 사장님 클릭 0)

표시 항목:
- 핵심 KPI (매물 / 공개 / fingerprint % / AI 라벨)
- 신뢰도 분포 게이지 (우수/중간/개선 SVG)
- 매물 월별 추세 차트 (생성/수정/변경 이력 6개월 SVG)
- cron 헬스 (등록 23개 / 24h 실행)
- 데이터 무결성 자동 점검
- 한국 17 데이터 enrich 진행률
- AI 비용 + 환각 감지

**의존성 0** (SVG 직접). Recharts 없이.

---

## 10. 자가검수 12 라운드 누적

| 라운드 | 영역 | P0 fix | P1 | P2 |
|---|---|---|---|---|
| 1 | 1 코드품질 (+2,7,9,12) | 15건 | 5 | 9 |
| 2 | 2 보안 + 3 성능 | 0 | 0 | 0 |
| 3 | 4 UX + 5 접근성 | 0 | 2 | 2 |
| 4+5 | 6 SEO + 8 API + 10 데이터 + 11 AI | 0 | 0 | 5 |
| 6 | 2 보안 deep (CSP/HSTS/CSRF) | 0 | 0 | 1 |
| 7 | 9 비즈니스 로직 deep (IDOR/auth) | 0 | 0 | 0 |
| 8 | 11 AI 품질 | 0 | 0 | 3 |
| 9 | 6 SEO deep + 5 a11y deep | 0 | 0 | 0 |
| 10 | 7 DB 인덱스 (모두 효율 우수) | 0 | 0 | 0 |
| 11+12 | 12 법적 컴플라이언스 deep | 0 | 0 | 0 |

→ **모든 P0 처리. 영역 1-12 점검 완료.**

### 잔여 P1/P2 (점진 개선)
- P1-A: admin/* 의 `<button>` aria-label 다수 누락 (admin/* 자유라 점진)
- P1-B: onClick `<div>` 14건 (role+tabIndex)
- P1-004: JWT HS256 → ES256 (사장님 Supabase 대시보드 토글)
- P1-005: Leaked Password Protection (사장님 토글)
- P2: AI 환각 감지 / Anthropic Prompt cache / API rate limit 56 endpoint

---

## 11. 사장님 액션 (선택, env 등록 시 자동 enrich 시작)

```
RTMS_API_KEY     — data.go.kr (실거래가, 무료 일 10K)
VWORLD_API_KEY   — V-World (공시지가)
NTS_API_KEY      — 국세청 사업자번호 진위확인 (무료)
POLICE_API_KEY   — 경찰청 안전 점수
AIRKOREA_API_KEY — 에어코리아 (대안, 현재는 시도별 매핑)
CLOUDFLARE_R2_ACCOUNT_ID / ACCESS_KEY_ID / SECRET_ACCESS_KEY / BUCKET — R2 백업

Supabase 대시보드:
- Auth > Password Policy > Leaked Password Protection 켜기
- Settings > API > JWT 알고리즘 ES256 (이미 modern publishable key 발급됨)

이미 등록됨:
✅ GEMINI_API_KEY (Vision + Text 무료 100K/일)
✅ KAKAO_REST_API_KEY (좌표 / 학세권 / 지하철 무료)
✅ RESEND_API_KEY (이메일 무료 100K)
```

**미등록 시에도 다른 cron 정상 가동** — 사장님 손 0.

### legal_documents 본문 4건 (Claude 가 placeholder 작성)
- terms (1,125자)
- privacy (1,720자)
- marketing (451자)
- ai_label (748자)

→ 사장님 검토 시 SQL UPDATE 또는 admin UI 추후.

---

## 12. 핵심 파일 위치

### 인계 / 청사진
- `_HANDOFF_2026-04-28_v14.md` — **최종 인계** (Phase 1 + 5 + 6 완료)
- `_HANDOFF_2026-04-28_v13.md` — Phase 1 완료 시점
- `_HANDOFF_2026-04-28_v12.md` ~ v9 — 과거
- `_AUTOMATION_MASTER_BACKLOG_2026-04-28.md` — 모든 자동화 매트릭스
- `_AREA_AUTOMATION_RESEARCH_2026-04-28.md` — 글로벌 7개국 best practice (1,595줄)
- `_PHASE0_IMPLEMENTATION_2026-04-28.md` — area enrich 구현 가이드
- `_SOTA_REPORT_2026-04.md` — 1회차 SOTA
- `_INSPECTION_BACKLOG.md` — 자가검수 백로그
- `_PHASE1_PLAN_2026-04-28.md` / `_PHASE1_PROGRESS_2026-04-28.md`
- `_PORTAL_BLUEPRINT_V3_2026-04-28.md` — v3 청사진
- `_BOB_FINAL_PLAN_2026-04-27.md` — 6 Phase 30+ Layer
- `_MASTER_FEATURE_CATALOG_2026-04-28.md` — 모든 기능 카탈로그
- `_INTEGRATION_GAP_2026-04-28.md` — admin/* 통합 누락 (사장님 명령으로 무효)
- `_ROLLBACK_2026-04-28.md` — Claude 실수 기록
- `_SELF_INSPECTION_SYSTEM.md` — 12 영역 자가검수 명세
- `_NEXT_SESSION_START_PROMPT.md` — 이전 부트스트랩
- `CLAUDE.md` — **영구 규칙** (사장님 명령 모두 반영)

### 옛날 가게 (영구 보존)
- `src/app/search/page.tsx` (451줄)
- `src/app/search/layout.tsx`
- `public/search/content.js` (13,671줄)
- `public/search/content-v*.js` (14 patch)
- `public/search/styles.css` (850줄)

### Phase 6 신규
- `src/app/api/admin/extract-from-photo/route.ts`
- `src/app/api/og/instagram/[id]/route.tsx`
- `src/app/admin/briefing/[id]/page.tsx`
- `src/app/api/admin/briefing-pdf/[id]/route.tsx`
- `src/app/api/og/qr/[code]/route.ts`

### 자동화 cron 23개
- `src/app/api/cron/*/route.ts` 모두

### Dashboard
- `src/app/admin/automation-status/page.tsx` ⭐ (사장님 read-only)

### lib (보안 + AI + 권한)
- `src/lib/adminAuth.ts` (5단계 + legacy 양립)
- `src/lib/adminAuthz.ts` (IDOR 가드)
- `src/lib/auditLog.ts` (audit + ip + UA)
- `src/lib/supabase.ts` (createServerClient / createUserClient)
- `src/lib/mfaTotp.ts` (MFA TOTP)
- `src/middleware.ts` (CORS + CSRF + CSP + HSTS + 단축 URL rewrite)

---

## 13. 빌드 / 푸시 패턴 (12+회 통과 검증)

```bash
# 1. 푸시 클론
cd /tmp/wishes-build
git fetch origin main && git reset --hard origin/main

# 2. 변경 작업

# 3. commit + push
git add -A
git -c user.email=wishes@wishes.co.kr -c user.name=WISHES commit -m "..."
git push origin main

# 4. Vercel 빌드 검증
sleep 60
curl -s "https://api.github.com/repos/wishes-hyundo/WISHES/commits/<SHA>/status"
curl -s "https://wishes.co.kr/api/version"  # 라이브 commit 확인

# 5. 빌드 실패 시 즉시 revert
git revert <SHA> --no-edit
git push origin main
```

### 빌드 위험 요인 (검증된 실패 패턴)
- 한꺼번에 여러 endpoint 추가 → 단독 commit 으로
- Edge runtime + createServerClient (service_role) 호환 X → nodejs runtime 사용
- `<html><body>` Server Component 직접 출력 X → root layout 활용
- `@sparticuz/chromium` (full) 함수 사이즈 한도 초과 → `react-pdf` 사용
- TypeScript types 누락 (qrcode 등) → `@types/*` 함께 추가
- npm 의존성 추가 시 단독 commit + 빌드 검증

### git credentials
- mount 의 `.git/credentials` 를 `/tmp/wishes-build/.git/credentials` 로 복사
- `git config credential.helper "store --file=.git/credentials"`

---

## 14. 자가검수 시스템

### 12 영역 라운드 로빈
1. 코드 품질 (TS / ESLint / dead code / any)
2. 보안 (OWASP Top 10 2025 / RLS / CSRF / XSS / secret leak)
3. 성능 (Core Web Vitals / bundle / DB)
4. UX (로딩 / 에러 / empty / 키보드 / 모바일)
5. 접근성 (WCAG 2.2 AAA)
6. SEO (meta / sitemap / OG / Schema.org)
7. DB (인덱스 / slow query / RLS 감사)
8. API (rate limit / 캐싱 / 인증)
9. 비즈니스 로직 (권한 / IDOR / edge case)
10. 데이터 품질 (NULL / 이상치 / 중복 / raw_fields)
11. AI 품질 (환각 / 비용 / cache)
12. 법적 컴플라이언스 (PIPA / KISO / AI 라벨 / 광고 동의)

### SOTA 자동 추천 (월 1회)
- WebSearch 8 토픽: 부동산 SaaS / Next.js / Claude / shadcn / TanStack / 한국 공공 API / Korean LLM / Vector DB
- `sota_reports` 테이블 자동 저장
- 월 1일 자동 cron

---

## 15. 다음 세션 첫 액션 (확정)

```
사용자가 새 세션 시작 시 → 이 프롬프트 입력
   ↓
Claude 첫 액션:
1. TaskCreate "다음 세션 첫 액션 — 라이브 점검 + 사장님 명령 받음"
2. 라이브 commit 확인 (curl /api/version) — 현재 111036b
3. /admin/automation-status 점검 (사장님 dashboard)
4. Phase 1-14 마이그레이션 적용 여부 확인 (cron_health_check)
5. 사장님 명령 받음 — 다음 작업 우선순위 결정
6. 자가검수 라운드 13 (다음 영역 — 라운드 로빈)
7. SOTA 추천 (월 1회 자동, 또는 사장님 신호 시)
```

### 다음 세션 가능 작업 후보
- **사장님 사용 패턴 분석** — 라이브 사용 후 우선순위 재조정
- **자가검수 라운드 13+** — 12 영역 라운드 로빈 재시작
- **legal_documents 본문 정비** — 사장님 검토 후 v2 발행
- **사장님 액션 env 등록 후 자동 enrich 시작 점검** (RTMS / VWORLD / NTS / POLICE / R2)
- **AI 환각 감지 정밀화** (description 분석 패턴 강화)
- **사장님 dashboard 추가 강화** (예: 사용자별 활동 / 매물 필터 / 변경 이력 timeline)
- **인스타 카드 디자인 다양화** (매물 사진 합성 강화)
- **Puppeteer 시도 (옵션)** — 현재 react-pdf 사용 중. 더 정밀한 PDF 필요 시.

---

## 16. 사장님과의 약속 (영구)

**Claude 약속**:
- 어설프게 판단 X
- 매 commit 후 자가검수
- 매번 새로운 패턴 (반복 X)
- 옛날 /search 픽셀 100% 보존
- 단 하나의 기능도 빠뜨리지 않음
- 큰 변경 전 반드시 사장님 확인 (단계별)
- 빌드 깨짐 시 즉시 revert
- 매 세션 인계 문서 업데이트
- **사장님께 일 시키지 마라** (자동화 우선)
- **무료/극소액 정책** 영구
- **카톡 X**, Resend 이메일만
- **거래 기록 영구 보존** (PIPA 익명화만)
- **전국 부동산** (서울 전문 X)
- **한꺼번에 X** — 단계별 commit + 빌드 검증

**사장님 결정 사항** (이미 받음, CLAUDE.md 영구):
- ✅ 권한 5단계 그대로
- ✅ /search 절대 X
- ✅ /admin/* 자유 + 영구 유지
- ✅ 사장님 검토 페이지 X — 자동화 우선
- ✅ 무료 / 극소액
- ✅ 거래 기록 보존 (PIPA 익명화)
- ✅ 카톡 X, 이메일만
- ✅ 전국 부동산
- ✅ 가격 이상치 자동 X
- ✅ AI 시세 / 자연어 검색 / pgvector / Sentry X
- ✅ 공실/온하우스 = 사장님 별도 프로그램
- ✅ 모호 5개 영구 X
- ✅ 큰 비용 X
- ✅ 자가검수 시스템 12 영역
- ✅ SOTA 월간 추천

---

## 17. 시작 명령 (다음 세션 첫 메시지)

다음 세션에서 이 프롬프트 붙여넣은 후, 아래 중 하나로 시작:

- **"라이브 점검부터"** → Claude 가 commit / endpoint / cron 헬스 즉시 점검
- **"이어서 진행"** → Claude 가 다음 자가검수 라운드 + 우선순위 자동 진행
- **"[특정 작업] 해"** → 명시 작업 즉시 진행
- **"사장님 사용해보고 피드백" → 사장님 직접 사용 후 우선순위 재조정**

---

## 18. 라이브 endpoint 종합 (작성 시점)

| URL | 인증 | 용도 |
|---|---|---|
| https://wishes.co.kr/search | public | 옛날 가게 (영구) |
| https://wishes.co.kr/admin/automation-status | owner/admin | **사장님 dashboard** ⭐ |
| https://wishes.co.kr/admin/users | owner/admin | 사용자 관리 |
| https://wishes.co.kr/admin/listings/* | owner/admin | 매물 관리 |
| https://wishes.co.kr/admin/briefing/[id] | owner/admin | HTML PDF |
| https://wishes.co.kr/api/admin/briefing-pdf/[id] | owner/admin | react-pdf 자동 |
| https://wishes.co.kr/api/og/instagram/[id] | public | SNS 카드 |
| https://wishes.co.kr/api/og/qr/[code] | public | 단축 URL QR |
| https://wishes.co.kr/api/admin/extract-from-photo (POST) | owner/admin/broker | OCR 자동 등록 |
| https://wishes.co.kr/signup | public | 약관 체크박스 3개 |
| https://wishes.co.kr/listings/[id] | public | Schema.org JSON-LD |
| https://wishes.co.kr/api/version | public | 라이브 commit 확인 |

---

작성: 2026-04-28 v2 부트스트랩 | 라이브 111036b | DB 16 마이그 + cron 23 + Phase 6 endpoint 5 + 자가검수 12 라운드 | 사장님 손 0 | 모두 무료/극소액 | 옛날 가게 무중단
