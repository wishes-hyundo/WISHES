// SpeculationRules — Chrome/Edge prerender + prefetch
// L-naver-2026spec1: /api/geo/* prefetch 추가
export default function SpeculationRules() {
  const rules = {
    prerender: [
      {
        where: {
          // L-listings-deprecate (2026-04-29): /listings → /map?listing=:id 영구 redirect.
          //   prerender 대상도 /map 으로 변경.
          href_matches: ['/map', '/map?*', '/'],
        },
        eagerness: 'moderate',
      },
    ],
    prefetch: [
      {
        where: {
          href_matches: ['/api/map/*', '/api/listings/*', '/api/geo/*', '/map', '/map?*'],
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
