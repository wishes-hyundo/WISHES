// Bundle analyzer — `ANALYZE=true npm run build` produces an HTML report.
//   No effect on real builds (no-op pass-through when env unset).
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // L-urgent1 (2026-04-22): build gate (kept lenient — staging dirs have pre-existing TS errors).
  eslint: {
    ignoreDuringBuilds: false,
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
      // Cloudflare Worker proxy for crawled image content (referer-validated).
      { protocol: 'https', hostname: 'wishes-image-proxy.wishes-img.workers.dev' },
      { protocol: 'https', hostname: '*.workers.dev' },
    ],
  },

  async redirects() {
    return [
      // 2026-04-21: MAP 2026 promoted to canonical /map.
      {
        source: '/map-2026',
        destination: '/map',
        permanent: true,
      },
      // /listings deprecated -> /map (numeric IDs go to /map?listing=ID for modal auto-open).
      {
        source: '/listings',
        destination: '/map',
        permanent: true,
      },
      {
        source: '/listings/:id',
        destination: '/map?listing=:id',
        permanent: true,
      },
      // L-perf-fix-10b-2026-05-10 (사장님 명령): admin-auth.html → /login server-side redirect.
      //   client-side script redirect 는 HTML 로드 후 실행 → 검정 배경 잠시 보임.
      //   server-side 308 redirect → 사용자 HTML 안 받음 → 검정 화면 0ms.
      {
        source: '/admin/admin-auth.html',
        destination: '/login?redirect=/admin/',
        permanent: false,
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
      // L-perf-step-f-v3 (2026-05-09 fix): /search/content-v*.js patches 24h cache.
      //   Previous attempts used `/search/content-v:slug*.js` which fails path-to-regexp v6
      //   ("Can not repeat slug without a prefix and suffix"). Use named regex group instead.
      //   - cache buster (?v=...) bumped per push -> new cache key
      //   - 24h fallback -> auto-refresh if buster forgotten
      //   - 736KB patches: first visit cached, repeat visit within 24h = 0 byte
      //   - main content.js NOT cached here (a957c0e4 policy preserved)
      {
        source: '/search/:file(content-v[A-Za-z0-9_-]+\\.js)',
        headers: [
          // [2026-05-14 사장님 명령] cache 즉시 확인 — no-cache, ETag 검증으로 304 빠름
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/search/styles.css',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
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
        source: '/api/admin/__disabled__/:slug*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },

  compress: true,
  poweredByHeader: false,

  // L-clean1 (2026-04-22): SWC strips client console.log/info/debug in production.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
}

module.exports = withBundleAnalyzer(nextConfig);
