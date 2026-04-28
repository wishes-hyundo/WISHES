// L1 (2026-04-21): Bundle analyzer — `ANALYZE=true npm run build` 로 HTML 리포트 생성.
//   실제 빌드엔 영향 없음(env 없으면 no-op pass-through).
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // L-urgent1 (2026-04-22): 빌드 게이트 재활성화.
  //   map-2026 merge 이후 임시로 열어두었던 bypass 를 닫는다. ESLint 16건 + 2건 truncation
  //   복구 완료. 이제 회귀를 CI 에서 즉시 잡도록 strict 모드로 환원.
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    domains: ['wishes.co.kr'],
    unoptimized: false,
    minimumCacheTTL: 3600,
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'pub-e16c7a50584c4db7be3571746cd80716.r2.dev' },
      { protocol: 'https', hostname: 'd4k1brqee4emz.cloudfront.net' },
      { protocol: 'https', hostname: '*.daumcdn.net' },
      // L-img-proxy1 (2026-04-23 p.m.): 크롤러 이미지 서빙용 Cloudflare Worker.
      //   DB thumb_url 5,460건 모두 이 도메인. remotePatterns 누락 → Next.js
      //   Image 가 전부 차단해 /map 카드에 사진이 안 뜨던 버그.
      { protocol: 'https', hostname: 'wishes-image-proxy.wishes-img.workers.dev' },
      { protocol: 'https', hostname: '*.workers.dev' },
    ],
  },

  async redirects() {
    return [
      // 2026-04-21: MAP 2026 promoted to canonical /map. Launch codename URL
      // /map-2026 is preserved via 301 for bookmark / shared-link compatibility.
      {
        source: '/map-2026',
        destination: '/map',
        permanent: true,
      },
      // L-listings-deprecate (2026-04-29 사장님 명령): /listings 영구 폐기.
      //   · /listings (index) → /map
      //   · /listings/:id (상세) → /map?listing=:id (매물카드 자동 오픈)
      //   매물카드 URL 라우팅 (f9bf3c1) 으로 동일 가치 제공.
      //   ※ next.config.ts 에도 동일 redirect 있지만 빌드는 .js 만 사용 중.
      {
        source: '/listings',
        destination: '/map',
        permanent: true,
      },
      {
        source: '/listings/:id',
        destination: '/map/:id',
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/_next/static/:slug*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/api/listings',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=3600' },
        ],
      },
      {
        source: '/api/listings/:id',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=1800' },
        ],
      },
      {
        source: '/api/auth/:slug*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/api/admin/:slug*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },

  compress: true,
  poweredByHeader: false,

  // L-clean1 (2026-04-22): 클라이언트 console 정책 명시.
  //   SWC 가 프로덕션 빌드 시 client 번들에서 console.log/info/debug 을 제거.
  //   console.warn / console.error 는 유지 — DevTools, 추후 Sentry 등에 연결.
  //   서버(Node) 번들에는 영향 없음(Vercel 로그 채널로 전부 통과).
  //   → 개발 중에는 console.log 자유롭게 사용해도 프로덕션에 유출되지 않음.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
}

module.exports = withBundleAnalyzer(nextConfig);
