# RFC 0006 — PR-D: SEO 메타 + sitemap + IndexNow + 네이버 verification

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30 (PR-F 직후 동일 세션)
> **라벨**: `[UI:meta]`
> **선행**: PR-A (#15) 등 이전 PR
> **참조**: 헌법 §127 #7 / Discovery §6.PR-D / §54

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — 매물 1만 SEO 인덱스 누수 확인
- [x] 회귀 0 — 신규 sitemap.ts (이미 v3 작성됨) + IndexNow worker
- [x] 무료/OSS — IndexNow 무료, Vercel cron 무료
- [x] 만든 것 보존 — /listings/[id]/page.tsx generateMetadata + JSON-LD 그대로 활용
- [x] UI 헌법 §54 — 픽셀 변경 0 (SSR metadata + sitemap + ping)
- [x] 네이버·구글 SEO — **본 PR 핵심 가치** — 자체콘텐츠 9,833 매물 인덱싱
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 — 더 많은 매물이 검색에서 발견됨 → 사장님 영업 확장
- [x] Phase 1 인프라 보강
- [x] [UI:meta]

---

## 1. 이미 적용된 부분 (이번 세션 발견)

PR-D 본질의 대부분이 이미 라이브 적용됨:

### 1.1 generateMetadata + RealEstateListing JSON-LD ✅
- `src/app/listings/[id]/page.tsx` (252줄, 2026-04-27 v3)
- L-seo1: 자체 콘텐츠 30자+ 있는 매물만 noindex 해제
- L-seo2: RealEstateListing schema (address/geo/Offer/floorSize/numberOfRooms/yearBuilt)

### 1.2 sitemap.ts ✅
- `src/app/sitemap.ts` (101줄, 2026-04-27 v3)
- 정적 8 페이지 + 동적 매물 (페이징 1000/page × 50 = 50K 한도)
- L-seo1 일관 — 자체 콘텐츠 매물만

### 1.3 robots.ts ✅
- `src/app/robots.ts`
- /api/, /admin/ 차단

### 1.4 네이버 서치어드바이저 verification ✅
- `src/app/layout.tsx` line 60
- `naver-site-verification`: 924ead2b53885a0168f7b41745852535ac11f7b8

### 1.5 Google Search Console ✅
- 환경변수 `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`

### 1.6 OpenGraph + Twitter Card ✅
- 매물별 1200×630 (`/api/og/listing/{id}`)
- root layout fallback (`/og-image.png`)

---

## 2. 본 PR-D 잔여 (신규 작성)

### 2.1 IndexNow helper
- `src/lib/indexnow.ts` (70줄)
- API: https://api.indexnow.org/IndexNow (Bing/Yandex/Naver/Seznam fanout)
- Key: 환경변수 `INDEXNOW_KEY`
- 미설정 시 console.warn fallback (사장님 부담 0)

### 2.2 IndexNow Vercel cron
- `src/app/api/cron/indexnow-ping/route.ts` (90줄)
- 매시간 (`vercel.json crons[28]`)
- 최근 24h 신규/업데이트 매물 (자체콘텐츠) 최대 1,000 ping

### 2.3 IndexNow key 파일
- `public/{32-hex-key}.txt`
- 도메인 검증용 (wishes.co.kr/{key}.txt → key 본문)

### 2.4 vercel.json cron 추가
```json
{
  "path": "/api/cron/indexnow-ping",
  "schedule": "0 * * * *"
}
```
크론 28→29.

---

## 3. 라이브 매물 SEO 분포 (2026-04-30)

| 항목 | 건수 | 비율 |
|---|---|---|
| 총 매물 | 29,475 | 100% |
| 공개 매물 | 26,964 | 91.5% |
| **자체 콘텐츠 보유** (인덱싱 OK) | **9,833** | **33.4% / 36.5% of public** |
| noindex 처리 | 17,131 | crawled 매물 등 |

→ 9,833 매물이 sitemap + IndexNow 대상.
→ 나머지 17K 는 ai_description 자동 생성 (PR-G2 cron auto-regenerate-ai-desc 가 매 5분 50건씩 처리) 후 자동 인덱싱 큐에 자연 진입.

---

## 4. 사장님 1회 작업 (선택)

### 4.1 INDEXNOW_KEY Vercel 환경변수 등록
이번 세션 자동 생성된 key 를 Vercel 에 등록:

1. Vercel project → Settings → Environment Variables
2. 키: `INDEXNOW_KEY`
3. 값: `<32-hex 키 — .env.local 에 자동 추가됨>`
4. Redeploy

### 4.2 미등록 시
- console.warn fallback
- IndexNow ping skip
- sitemap 만 동작 (구글/네이버 자체 크롤링 + sitemap.xml 의존)

---

## 5. UI 영향 = 0

- SSR metadata + JSON-LD 만 추가 (HTML `<head>` 영역)
- sitemap + IndexNow 는 검색엔진용
- 사용자 화면 픽셀 변경 0

---

## 6. 위험 + 완화

| 위험 | 완화 |
|---|---|
| INDEXNOW_KEY 노출 시 무한 ping 공격 | API endpoint cron 인증 (CRON_SECRET) + LIMIT 1000/run |
| sitemap.xml 빌드 시 Supabase 부하 | 페이징 1000/page + `change_freq=weekly` cache 1h |
| 자체 콘텐츠 없는 매물 noindex 처리 | 17K 매물 PR-G2 cron 으로 자동 ai_description 생성 (자동 인덱싱) |
| /listings → /map 리다이렉트 미적용 | 본 PR 범위 외 — 별도 PR |

---

## 7. 후속 작업

- **PR-D2** — /listings → /map?listing 301 영구 리다이렉트 (CLAUDE.md /map 정책)
- **PR-D3** — /map?listing=ID 동적 SSR metadata (현재 /listings 만 보유)
- **PR-D4** — RSS `/rss/listings.xml` (Discovery §6.PR-D §3)

---

작성: 2026-04-30 (PR-F 직후)
