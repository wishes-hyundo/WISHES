# search-2026 — /search 현대식 재구축

레거시 `/search` (public/search/content.js 13,776줄 + 패치 84개) 를 통합 React 코드로
재구축. `/map` 의 features/map-2026 재구축과 동일 패턴.

## ★ 최우선 원칙
**UI/디자인 변경 절대 금지.** 기준(spec)은 오직 현재 운영 `/search` 화면.
- CSS spec: `public/search/styles.css` (850줄) — 이 값 그대로 사용.
- DOM 구조 spec: `public/search/content.js` 가 생성하는 마크업.
- 기존 `src/app/search-preview` + `src/components/wishes/*` 는 "비슷하게 새로 디자인" 한
  것이라 실제 /search 와 다름 → **재사용 금지, 폐기 대상.** 전부 styles.css 기준 재작성.

## 방식 — Strangler Fig
운영 `/search` 무중단. 새 구현을 `/search-preview` 에 완성 → 픽셀 검증 → swap.

## 진행 (P1~P7)
- [x] P1 데이터 계층 — types.ts (SearchListing / SearchFilters / SearchPage)
- [ ] P1 잔여 — React Query 훅 (useSearchListings 등), API 클라이언트
- [ ] P2 필터 패널 (styles.css .ws-filter-* 기준)
- [ ] P3 매물 리스트 (가상화, .ws-listing-card 기준)
- [ ] P4 상세 모달
- [ ] P5 지도 뷰 (features/map-2026 재사용 검토)
- [ ] P6 중개사 도구
- [ ] P7 검증 → /search swap → content.js + 패치 84개 제거

상세 로드맵: Projects/★search_현대식_재구축_로드맵.md
