// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SpeculationRules — Chrome/Edge 122+ 프리렌더 규칙
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 사용자가 링크를 hover/mousedown 할 때 브라우저가 다음 페이지를 백그라운드에서
// 완전 렌더해둬 실제 클릭 시 0ms 내비게이션.
//   - eagerness "moderate" = hover 후 이동 의도 강해지면 prerender
//   - SSR HTML 중심 경로(/listings, /listings/*) 만 prerender
//   - 외부 링크, 로그인 / 결제 / 전송형 경로는 차단
//
// L-mapfix2 (2026-04-21): /map 을 prerender 목록에서 제외.
//   /map 은 MapLibre 4.x + deck.gl 9.x + WebGL 을 쓰는 무거운 SPA 라우트라
//   prerender 중 document.prerendering=true 상태에서 WebGL 컨텍스트가 생성되면
//   activation 시점에 canvas 가 재동기화되지 못해 "타일은 HTTP 200 인데
//   panel 은 흰색" 증상이 재현됨. prerender 제외 + prefetch 도 /api/map/* 에
//   한해 유지해 네트워크 우선순위는 살림.
//
// 지원 안 되는 브라우저(Firefox/Safari)는 JSON 을 무시 → 폴백 비용 0.

export default function SpeculationRules() {
  const rules = {
    prerender: [
      {
        where: {
          href_matches: [
            '/listings',
            '/listings?*',
            '/listings/*',
            '/',
          ],
        },
        eagerness: 'moderate',
      },
    ],
    prefetch: [
      {
        where: {
          href_matches: ['/api/map/*', '/api/listings/*', '/map', '/map?*'],
        },
        eagerness: 'eager',
      },
    ],
  };
  return (
    <script
      type="speculationrules"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(rules) }}
    />
  );
}
