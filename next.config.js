// L1 (2026-04-21): Bundle analyzer — `ANALYZE=true npm run build` 로 HTML 리포트 생성.
//   실제 빌드엔 영향 없음(env 없으면 no-op pass-through).
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // L-urgent1 (2026-04-22): 빌드 게이트.
  // L-perf-step-f-fix (2026-05-09): Step F 가 의도치 않게 게이트 enable 한 사이드이펙트 되돌림.
  //   _g***_clean/, _wave***_clean/ 등 staging 디렉토리에 pre-existing TS 에러 다수 존재.
  //   이전 prod 는 ignore=true 로 통과 중. Step F 의 cache TTL 만 유지하고 게이트는 원복.
  //   (사장님 명령 2026-05-09: "절대 실수 없이 어떠한 버그도 문제도 없이")
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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
      { protocol: 'https', hostname: 'wishes-image-proxy.wishes-img.workers.dev' },
      { protocol: 'https', hostname: '*.workers.dev' },
    ],
  },

  async redirects() {
    return [
      {
        source: '/map-2026',
        destination: '/map',
        permanent: true,
      },
      {
        source: '/listings/:id(\\d+)',
        destination: '/map?listing=:id',
        permanent: true,
      },
      {
        source: '/listings',
        destination: '/map',
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
      // L-perf-step-f (2026-05-09 사장님 SOTA Phase 1 - 24h cache 타협안):
      //   /search/content-v*.js patch 파일들 24시간 cache.
      //   - cache buster (?v=20260509x) 매 push 마다 자동 bump → 새 cache key
      //   - 24h 후 자동 갱신 → 사장님이 ?v= bump 잊어도 안전 (a957c0e4 정책 부분 준수)
      //   - 효과: 736KB patches 첫 방문 후 24h 내 재방문 = 0 byte
      //   - 메인 content.js 는 매 revalidate (a957c0e4 핵심 명령 보존)
      {
        source: '/search/content-v:slug*.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/search/styles.css',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
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

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
}

module.exports = withBundleAnalyzer(nextConfig);
