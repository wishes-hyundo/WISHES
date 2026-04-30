// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) tests/golden/handlers.ts — msw 핸들러
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 단계 4 (이번): 단순 sanity 핸들러 (빈 결과 반환)
// 단계 5 (예정): SQL Oracle — 라이브 supabase service-role 별도 client
//   각 케이스 sql_oracle 직접 실행 → ID 집합 박제
// 단계 6 (예정): DOM Snapshot — Next.js renderToString
// 단계 7 (예정): CI 통합 — GitHub Actions 환경변수 (CI=true)
//
// 헌법 §125.1 + §72.1 + §96 Phase 1 새 기능 0

import { http, HttpResponse } from 'msw';

/**
 * Golden 50 msw 핸들러 — 단계 4 sanity.
 *
 * 단계 5 에서 sql_oracle 결과로 응답 mock 보강.
 * 현재는 외부 fetch 가 들어오면 빈 결과 반환 (실 서버 호출 차단).
 */
export const goldenHandlers = [
  // 매물 검색 API mock (단계 4 sanity — 빈 결과)
  http.get('*/api/listings/search', () => {
    return HttpResponse.json({
      listings: [],
      total: 0,
      _stage: 'PR-E §125.1 단계 4 sanity placeholder',
    });
  }),

  // 매물 단건 조회 mock
  http.get('*/api/listings/:id', () => {
    return HttpResponse.json({
      listing: null,
      _stage: 'PR-E §125.1 단계 4 sanity placeholder',
    });
  }),

  // 지도 클러스터 API mock
  http.get('*/api/map/clusters', () => {
    return HttpResponse.json({
      clusters: [],
      _stage: 'PR-E §125.1 단계 4 sanity placeholder',
    });
  }),

  // 지도 viewport 매물 API mock
  http.get('*/api/map/items', () => {
    return HttpResponse.json({
      items: [],
      _stage: 'PR-E §125.1 단계 4 sanity placeholder',
    });
  }),
];
