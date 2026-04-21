// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SpeculationRules — Chrome/Edge 122+ 프리렌더 규칙
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 사용자가 링크를 hover/mousedown 할 때 브라우저가 다음 페이지를 백그라운드에서
// 완전 렌더해둬 실제 클릭 시 0ms 내비게이션.
//   - eagerness "moderate" = hover 후 이동 의도 강해지면 prerender
//   - /map, /listings, /admin 등 내비게이션 타겟만 허용
//   - 외부 링크, 로그인 / 결제 / 전송형 경로는 차단
//
// 지원 안 되는 브라우저(Firefox/Safari)는 JSON 을 무시 → 폴백 비용 0.

export default function SpeculationRules() {
  const rules = {
    prerender: [
      {
        where: {
          href_matches: [
            '/map',
            '/map?*',
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
          href_matches: ['/api/map/*', '/api/listings/*'],
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
