// SpeculationRules — Chrome/Edge prerender + prefetch
// L-naver-2026spec1: /api/geo/* prefetch 추가
export default function SpeculationRules() {
  const rules = {
    prerender: [
      {
        where: {
          href_matches: ['/listings', '/listings?*', '/listings/*', '/'],
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
