# RFC 0007 — PR-D2 v2: /map 매물별 SSR metadata + JSON-LD

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30 (PR-D2 첫 시도 #22 revert 후 재시도)
> **라벨**: `[UI:meta]`
> **선행**: PR-D (#21) — sitemap + IndexNow + JSON-LD (이전 /listings/:id 기준)
> **참조**: CLAUDE.md `/map` 4가지 영구 / 헌법 §54

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — CLAUDE.md 명시 명령
- [x] 회귀 0 — /map/page.tsx 1 파일만 (working copy 우회)
- [x] 무료/OSS — Next.js generateMetadata + JSON-LD
- [x] 만든 것 보존 — layout.tsx 정적 metadata 그대로 (page.tsx 우선)
- [x] UI 헌법 §54 — 픽셀 변경 0 (HTML head 만)
- [x] 네이버·구글 SEO — 매물별 SSR metadata 보존 (PR-D 의 /listings/:id 정책을 /map 에 이전)
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 모두 직접 수혜 — SEO 인덱싱 확장
- [x] Phase 1 인프라 보강
- [x] [UI:meta]

---

## 1. 발견 (이번 세션)

### 1.1 main 에 이미 적용된 부분
`next.config.js` redirects (L-listings-deprecate, 2026-04-29):
- `/listings` → `/map` (301)
- `/listings/:id` → `/map/:id` (301)

라이브 검증:
- `/listings/45989` → 308 → `/map/45989` ✓
- `/map/45989` → 200 OK ✓ (Next.js 가 /map page.tsx 로 fallback 처리, MapClient client-side 라우팅)

### 1.2 잔여 = 매물별 SSR metadata
- `/listings/[id]/page.tsx` 의 generateMetadata + RealEstateListing JSON-LD (L-seo1+L-seo2 v3)
  → 더 이상 도달 안 함 (redirect 우선)
- `/map/page.tsx` 가 매물별 metadata 미보유 → SEO 인덱싱 손실

### 1.3 PR-D2 첫 시도 (#22) 의 revert 이유
- working copy 동시 수정으로 4 파일 (next.config.js + map/page + sitemap + indexnow-ping) 끝부분 잘림
- main 빌드 차단 → revert (#24)

### 1.4 본 PR-D2 v2 패턴 개선
**fresh clone 에서 sandbox bash heredoc 으로 직접 작성** (working copy 거치지 X).
1 파일만 변경 (`/map/page.tsx`) — risk 최소.

---

## 2. Scope

### 단계 1 — `/map/page.tsx` 재작성 (251줄)
- `import type { Metadata }` + `createServerClient`
- `searchParams: Promise<{ listing?: string }>` (Next.js 15 async)
- `generateMetadata` — listing query 받으면 매물별 SSR metadata
  - L-seo1 v3 일관: `checkHasOwnContent` (description 30자+)
  - canonical: `/map?listing=ID`
  - `robots: { index: false, follow: true }` if no own content
- `buildJsonLd` — RealEstateListing schema
  - address / geo / Offer / floorSize / numberOfRooms / yearBuilt
- `MapPage` async — JSON-LD inject 또는 정적 렌더

### 단계 2 — 라이브 검증
- /map?listing=45989 SSR HTML 에 `<script type="application/ld+json">` 포함 확인
- /listings/45989 → 308 → /map/45989 → 매물 카드 자동 오픈 (MapClient client-side)

---

## 3. 보존 (헌법 §101)

- `next.config.js` redirects 2026-04-29 그대로 (이미 main 적용)
- `src/app/listings/[id]/page.tsx` 그대로 (혹시 못 잡는 edge case)
- `src/app/sitemap.ts` 그대로 (현재 /listings/${id} 유지 — 검색엔진 301 자동 마이그레이션 경로 보존)
- `src/app/api/cron/indexnow-ping/route.ts` 그대로

→ sitemap/indexnow URL 갱신은 별도 PR-D3 (현재 라이브 검색 인덱스 보존 우선).

---

## 4. UI 영향 = 0

- /map page.tsx 의 generateMetadata + JSON-LD 만 신규 (HTML head 영역)
- 사용자 화면 픽셀 변경 0
- /map page 의 client-side 라우팅 (MapClient) 그대로

---

## 5. 위험 + 완화

| 위험 | 완화 |
|---|---|
| working copy cp 잘림 재발 | **fresh clone heredoc 직접 작성 패턴** — 본 PR 검증 |
| /map?listing 와 /map/:id 두 패턴 충돌 | 둘 다 같은 page.tsx 로 라우팅 (Next.js fallback) — generateMetadata 가 searchParams.listing 만 처리 |
| /map/:id (path) 매물별 SEO 누수 | 후속 PR-D3 에서 별도 라우트 작성 또는 sitemap URL 통일 |

---

## 6. 후속 PR

- **PR-D3** sitemap + IndexNow URL 통일 (`/map/${id}` or `/map?listing=${id}` 결정 후)
- **PR-D4** RSS `/rss/listings.xml`
- **PR-D5** /listings/* 파일 cleanup (90일 안정 후)

---

작성: 2026-04-30 (PR-D2 v2, fresh clone 패턴 검증)
