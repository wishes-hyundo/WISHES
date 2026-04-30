# RFC 0007 — PR-D2: /listings → /map?listing 301 영구 리다이렉트

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30 (PR-D 직후)
> **라벨**: `[UI:0]`
> **선행**: PR-D (#21) — sitemap + IndexNow + JSON-LD
> **참조**: CLAUDE.md `/map` 영구 4가지 / 헌법 §54 / RFC 0006 §7

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — CLAUDE.md 명시 명령
- [x] 회귀 0 — 301 영구 redirect, 검색엔진 자동 마이그레이션
- [x] 무료/OSS — Next.js redirects + RSC generateMetadata
- [x] 만든 것 보존 — /listings/[id]/page.tsx + ListingDetailClient 파일 그대로 (혹시 redirect 못 잡는 edge case)
- [x] UI 헌법 §54 — 픽셀 변경 0 (라우팅만)
- [x] 네이버·구글 SEO — 매물별 SSR metadata + JSON-LD 보존 (/map 으로 이전)
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 — 단일 URL `/map?listing=ID` 로 일관 (사용자 혼동 0)
- [x] Phase 1 인프라 보강
- [x] [UI:0]

---

## 1. CLAUDE.md 명령 (영구)

> **`/listings 영구 폐기**` — `/listings/*` → `/map?listing=ID` 또는 `/map` 리다이렉트.
> 모든 매물 검색은 `/map` 한 곳

본 PR-D2 가 영구 적용:
- /listings/123 → /map?listing=123 (301)
- /listings → /map (301)

---

## 2. Scope

### 2.1 next.config.js redirects 추가
```js
{ source: '/listings/:id(\\d+)', destination: '/map?listing=:id', permanent: true },
{ source: '/listings', destination: '/map', permanent: true },
```

### 2.2 /map/page.tsx 에 generateMetadata + JSON-LD
이전: layout.tsx 의 정적 metadata 만
이후: page.tsx 의 generateMetadata 가 `searchParams.listing` 받으면 매물별 동적 metadata 생성. RealEstateListing JSON-LD 도 SSR.

핵심 함수 (L-seo1+L-seo2 v3 일관):
- `checkHasOwnContent` — 자체콘텐츠 30자+ 매물만 인덱싱
- `formatPrice` — 만원 단위 포맷
- `buildJsonLd` — RealEstateListing schema 생성

### 2.3 sitemap.ts 매물 URL 변경
이전: `/listings/${id}`
이후: `/map?listing=${id}`

검색엔진은 sitemap 변경 후 새 URL 인덱싱 + 기존 /listings/${id} 도 301 따라가서 자동 마이그레이션.

### 2.4 IndexNow worker URL 변경
이전: ping `/listings/${id}`
이후: ping `/map?listing=${id}`

---

## 3. SEO 영향 (보존)

### 3.1 검색엔진 자동 마이그레이션
- 301 영구 redirect = 검색엔진 인덱스 새 URL 로 자동 이전 (1-4주)
- 페이지랭크/링크주스 100% 보존
- sitemap.xml 갱신으로 새 URL 의 인덱싱 가속

### 3.2 매물별 metadata + JSON-LD 보존
- 이전 `/listings/[id]/page.tsx` generateMetadata + buildJsonLd → `/map/page.tsx` 로 이전
- `searchParams.listing` 기반 동적 SSR
- canonical URL: `https://wishes.co.kr/map?listing=${id}`

### 3.3 자체 콘텐츠 정책 일관 (L-seo1 v3)
- description 30자+ 매물만 indexable
- 17K nonindex → PR-G2 cron 매 5분 자동 채움 (PR-D 와 동일)

---

## 4. 보존 (헌법 §101)

다음 파일 **삭제 X** — redirect 가 모든 트래픽 흡수하지만 fallback 으로 남김:
- `src/app/listings/page.tsx`
- `src/app/listings/[id]/page.tsx`
- `src/app/listings/[id]/ListingDetailClient.tsx`
- `src/app/listings/ListingsClient.tsx`

이유: redirect 못 잡는 edge case (예: middleware/build 시점 차이) 보호. 추후 90일 안정 후 별도 PR-D5 에서 cleanup.

---

## 5. 위험 + 완화

| 위험 | 완화 |
|---|---|
| 301 redirect 가 / 매물 인덱스 일시 하락 | sitemap + IndexNow 즉시 새 URL ping → 1주 내 자동 이전 |
| /map 의 SSR metadata 가 listing query 못 받음 | `searchParams.listing` 정규식 `^\d+$` 검증 + try/catch fallback |
| /map?listing=ID 로 직접 접근 시 MapClient 가 매물 카드 못 열음 | MapClient 기존 동작 보존 (CLAUDE.md "매물 클릭 시 /map?listing=ID 자동 변경" 영구 요구사항) |
| 검색엔진 redirect 인식 지연 | sitemap 매주 자동 재제출 (Vercel cron) + IndexNow 매시간 |

---

## 6. UI 영향 = 0

- next.config.js redirects (라우팅만)
- /map/page.tsx 의 generateMetadata + JSON-LD (HTML `<head>` 영역)
- sitemap.ts URL 패턴
- 사용자 화면 픽셀 변경 0

---

## 7. 후속 PR

- **PR-D3** RSS `/rss/listings.xml` 신규 (Discovery §6.PR-D)
- **PR-D4** 매물별 OG 이미지 1200×630 자동 (Cloudflare Images Free)
- **PR-D5** /listings/* 파일 cleanup (90일 안정 후)

---

작성: 2026-04-30 (PR-D 직후)
