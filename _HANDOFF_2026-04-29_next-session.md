# 다음 세션 인계 프롬프트 — 2026-04-29 세션 종료 시점

## 0. 너는 누구
WISHES 부동산 사이트 (wishes.co.kr) 풀스택 개발자. 사장님(WISHES 대표)이 모든 commit + push 위임 — 너가 sandbox `/tmp/wishes-clone` 에서 마무리까지 수행.
- GitHub: `https://github.com/wishes-hyundo/WISHES.git` (main)
- Vercel: `wishes.co.kr` (한국 region icn1)
- Supabase project: `xbjgdsyukjdkfvcbzmjc`

## 1. 영구 규칙 (CLAUDE.md 절대 어기지 마라)

### `/search` 영역
- vanilla `content.js` (13,671줄) + `content-v230~v323` patch 14+ 개
- **content.js 직접 수정 X** — 새 기능은 `content-v***-name.js` patch 파일로
- React 재현 X / shadcn/ui X / Tailwind 적용 X / 디자인 변경 X
- patch 파일 추가 시 `src/app/search/page.tsx` 의 `patches` 배열에 등록 필수

### `/admin/*` 영역
- 사장님 전용. UI/UX 자유. React + shadcn/ui + Tailwind v4 OK

### `/map` (고객 페이지)
- React 컴포넌트 자유 — `src/features/map-2026/` + `src/app/map/MapClient.tsx`
- 매물 모달: `src/features/map-2026/components/ListingDetailModal.tsx`
- AI 자연어 검색 (Gemini Flash 무료)
- `/listings/*` 영구 폐기 → `/map?listing=ID` 리다이렉트

### 자동화 우선
사장님께 일 시키지 마라. 데이터 보정 / enrich → SQL 함수 + cron. 무료 + 극소액 OK (Gemini / Kakao / V-World / Resend / GA4 / Supabase Pro $25 / Anthropic API). 큰 비용 (월 $500+) X.

### 위시스 필름 룩
모든 자체 업로드 사진/영상 Fujifilm Classic Negative 자동 적용. `_WISHES_FILM_LOOK_RECIPE.md` 절대 삭제 X.

## 2. 핵심 인프라

### Vercel + Cloudflare Worker 이중 보안
- `wishes.co.kr` Referrer-Policy: `strict-origin-when-cross-origin`
- 크롤링 사진 도메인: `wishes-image-proxy.wishes-img.workers.dev`
- Worker 가 Referer path 검사 (`/search` 포함) — 모바일/iOS 일부에서 referrerpolicy 무시 → 403
- **해결:** `/api/img-proxy` (Edge Function) — server-side fetch + Referer 직접 설정

### CSP img-src 화이트리스트
`'self' data: blob: *.supabase.co images.unsplash.com *.daumcdn.net *.kakao.com *.kakao.co.kr pub-e16c7a50584c4db7be3571746cd80716.r2.dev wishes-image-proxy.wishes-img.workers.dev d4k1brqee4emz.cloudfront.net *.basemaps.cartocdn.com *.openfreemap.org`

## 3. 이번 세션 (2026-04-29) commit 시간순

| Commit | 영역 | 내용 |
|--------|------|------|
| `40aa65d` | /map | 전유부 dead code 제거 |
| `4daf942` | dep | typescript 5.7 revert |
| `03a886c` | /map | 주소 라인 + (주용도) 라벨 + 최초등록 최하단 |
| `8e196b9` | /map | 폴드/소형 모바일 호환성 — dvh + sticky footer |
| `99900bc` | /map | 2026 — Container Queries + Foldable + Safe-area 4방향 + View Transitions |
| `81bd217` | /map | UX 최적화 — Visual Viewport + content-visibility + Focus trap + Haptic |
| `d7edbdc` | /map | @starting-style + SWR localStorage 캐시 |
| `302a64b` | /admin /search | 모바일 끝판왕 표준 |
| `fd6a8fc` | /map | CRITICAL 폴드7 펼침 footer + 접힘 헤더 잘림 |
| `304b268` | /map | 단일 탭 → 폴리곤/줌 + 더블 탭 → 확대 |
| `20dab23` | /map | TS Fix addListener type widening |
| `43610bc` | infra | 자동 정밀 검수 시스템 + GitHub Actions |
| `defaa90` | /search | v322 매물 그룹 = 건물 단위 (호수/층 제거) |
| `2ae9d0a` | /search | v318 모바일 썸네일 — IntersectionObserver lazy 우회 |
| `e279fc4` | /search | v318 rev2 외부 도메인 자동 wrap |
| `cbdfe8e` | /search | v318 rev3 referrerpolicy=unsafe-url |
| `489c4d7` | /search | v318 rev4 모든 <img> + 강제 reload |
| `f0677b9` | /search + API | **v318 rev5 + /api/img-proxy** server-side proxy |
| `3e719e0` | /search | v318 rev6 background-image 도 proxy 변환 |
| `d4e120a` | /search | v319 hero-dedup 주소 겹침 fix |

## 4. 라이브 적용 핵심 fix

### A. /map 매물 모달
**모바일 끝판왕:** dvh/svh + foldable viewport-segments + container queries + safe-area 4방향 + View Transitions API + dark mode + prefers-reduced-motion/contrast/transparency/data + viewport-fit cover + interactiveWidget overlays-content

**UX:** Visual Viewport API + Network Information API + Haptic + Focus trap+restore + Body scroll lock + CSS containment + content-visibility + touch-action manipulation + fetchPriority + decoding async

**끝판왕 7가지:** Skeleton UI / Swipe-down close / AbortController / Preconnect Supabase / Wake Lock / Idle revalidation 5분 / Pinch-to-zoom

**최종 정리:**
- H1 = 전유부 주용도 (`unit_purpose_resolved`) 만 + 우측 끝 emerald `매물번호 N` 뱃지
- 주소 라인 + (주용도) 라벨 + 전유부 Row + 전용률 subtitle 모두 제거
- 매물정보 "건축물 용도" Row = 표제부 (`title_purpose_resolved`)
- 섹션 헤더 통일 `text-[13px] font-bold neutral-900`
- 메타 footer 진짜 최하단 (담당자 연결 직전)

### B. /map 지도 (MapClient.tsx)
- 단일 탭 → level 5 + Circle / 더블 탭 → 카카오 기본 줌
- `disableDoubleClickZoom: false` + 햅틱 8ms

### C. /search (vanilla content.js + patch)
**v318 rev6** — 사진 안 뜨는 문제 (사장님 raw 보고: "직접 올린 사진은 뜨고 그 외는 전혀 안뜸"):
- 모든 `<img src/data-src>` + `<div style="background-image">` 검사
- 외부 도메인 (image-proxy/r2/cloudfront) → `/api/img-proxy?url=...` 자동 변환
- MutationObserver attributeFilter ['src','data-src','style']

**v319 hero-dedup** — 주소 겹침:
- `.v240-hero` 중복 마운트 제거 / H1 dedup / hero-road substring hide / hero-bldg dedup

### D. /api/img-proxy (Edge Function 신규)
```
GET /api/img-proxy?url=encodedURL
```
- 화이트리스트 호스트만 통과
- server-side fetch + `Referer: https://wishes.co.kr/search` 직접 설정
- Cloudflare Worker 200 통과 → response stream
- 24h CDN cache (s-maxage=86400)

### E. /api/listings/[id] resolved 응답
- `unit_purpose_resolved` (전유부, 가장 정확)
- `title_purpose_resolved` (표제부)
- `building_purpose_resolved` (DB → 전유부 → 표제부 fallback)
- `building_name_resolved` / `floor_total_resolved` / `usage_approved_resolved`
- `area_m2_resolved` / `area_supply_m2_resolved` / `area_common_m2_resolved` / `area_total_m2_resolved`
- 주소 sanitize (Kakao geocoder 매칭률 향상)
- 호수 자동 추출 (building_ho null 매물 대응)

## 5. 자동 정밀 검수 시스템

### scripts/audit/live-health.mjs (8개 항목)
1. wishes.co.kr root 200
2. /map 200
3. /admin 200
4. /search 200
5. /api/listings/[id] resolved 스키마
6. /api/listings/[id]/nearby (stations + buses)
7. /map SSR HTML
8. Vercel 한국 region (icn1)

### .github/workflows/live-audit.yml
- main push 시 자동 실행
- Vercel 배포 90초 대기 후 audit
- 실패 시 commit status red

### sandbox 직접 실행
```bash
cd /tmp/audit && node run.mjs
```

## 6. Sandbox 환경 패턴

### 시작 시 git clone
```bash
URL=$(cat /sessions/pensive-vigilant-curie/mnt/wishes-v2/.git/credentials | head -1)
cd /tmp && rm -rf wishes-clone && git clone --depth 3 --branch main "${URL}/wishes-hyundo/WISHES.git" wishes-clone
cd /tmp/wishes-clone && git config user.email "wishes@wishes.co.kr" && git config user.name "WISHES"
```

### audit 도구 셋업
```bash
mkdir -p /tmp/audit && cd /tmp/audit
[ ! -f run.mjs ] && cp /tmp/wishes-clone/scripts/audit/live-health.mjs ./run.mjs
```

### Vercel 배포 사이클
- push 후 50~90초 대기
- 정적 파일 (search/content-v***.js) CDN 캐시 → `?_=timestamp` cache busting

### content.js patch 추가 절차
1. `public/search/content-v***-name.js` 생성
2. `src/app/search/page.tsx` `patches` 배열에 등록
3. commit + push

## 7. 다음 세션 우선 검증 (사장님 강력 새로고침 후 안 되면)

### A. /api/img-proxy 직접 동작
```bash
curl -m 10 -o /dev/null -w "HTTP %{http_code} | size %{size_download}\n" \
  "https://wishes.co.kr/api/img-proxy?url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('https://wishes-image-proxy.wishes-img.workers.dev/listings/980831/original/0-4962202d08.jpg'))")"
# 기대: HTTP 200 | size 38693
```

### B. v318 rev6 라이브
```bash
curl -sS "https://wishes.co.kr/search/content-v318-mobile-image-fix.js?_=$(date +%s)" | grep "var V"
# 기대: var V = 'v318-mobile-image-fix-rev6';
```

### C. v319 라이브
```bash
curl -sS -I "https://wishes.co.kr/search/content-v319-hero-dedup.js?_=$(date +%s)" | head -1
# 기대: HTTP/2 200
```

### D. 자동 audit 8/8
```bash
cd /tmp/audit && node run.mjs
# 기대: 통과 8, 실패 0
```

## 8. 지속 미해결 (사장님 직접 검증 필요)

### 사장님 라이브 검증 필수
- [ ] 매물 모달 사진 — `<div style="background-image">` 의 background URL 도 자동 proxy 변환되는지 (v318 rev6)
- [ ] 주소 글자 겹침 — v319 로 해결됐는지
- [ ] 폴드7 펼침 모달 footer 노출
- [ ] 모바일 한번 탭 → 폴리곤/줌인 동작
- [ ] 데스크탑/모바일 모두 시크릿 모드 + 강력 새로고침

### 서버측 미해결 가능성
- 일부 매물 listing_images = 0개 (DB 데이터 자체 부재)
- raw_fields 면적 데이터 없는 매물 ~33% — building_registry_cache prewarm cron 점진 해결 중

## 9. 사장님 작업 스타일

- "정말 끝판왕이야?" 류 검증 질문 자주 → 솔직하게 답해라 ("아닙니다, 추가 가능한 X 가 있습니다")
- 라이브 직접 모바일 검증 후 사진 + 한 줄 보고 → 즉시 fix 모드
- "내가 push 안 한다, 네가 마무리까지" — 모든 commit + push 끝까지
- 자동화 우선 — cron / trigger / 자동 fix
- 무료/극소액 비용만 OK
- 한국어 자연스럽게

## 10. 시작 멘트 권장

```
인계 문서 인지했습니다. 첫 작업으로 라이브 audit 실행해서 현재 상태 확인하겠습니다.

[sandbox /tmp/wishes-clone 신규 clone + /tmp/audit 실행]
```

---

**최종 commit: d4e120a (v319 hero-dedup)**
**작성: 2026-04-29 KST**
