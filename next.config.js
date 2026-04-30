// L1 (2026-04-21): Bundle analyzer ??`ANALYZE=true npm run build` ë¡?HTML ë¦¬í¬???ì„±.
//   ?¤ì œ ë¹Œë“œ???í–¥ ?†ìŒ(env ?†ìœ¼ë©?no-op pass-through).
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // L-urgent1 (2026-04-22): ë¹Œë“œ ê²Œì´???¬í™œ?±í™”.
  //   map-2026 merge ?´í›„ ?„ì‹œë¡??´ì–´?ì—ˆ??bypass ë¥??«ëŠ”?? ESLint 16ê±?+ 2ê±?truncation
  //   ë³µêµ¬ ?„ë£Œ. ?´ì œ ?Œê?ë¥?CI ?ì„œ ì¦‰ì‹œ ?¡ë„ë¡?strict ëª¨ë“œë¡??˜ì›.
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
      // L-img-proxy1 (2026-04-23 p.m.): ?¬ë¡¤???´ë?ì§€ ?œë¹™??Cloudflare Worker.
      //   DB thumb_url 5,460ê±?ëª¨ë‘ ???„ë©”?? remotePatterns ?„ë½ ??Next.js
      //   Image ê°€ ?„ë? ì°¨ë‹¨??/map ì¹´ë“œ???¬ì§„?????¨ë˜ ë²„ê·¸.
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
      // L-listings-deprecate (2026-04-29 ?¬ì¥??ëª…ë ¹): /listings ?êµ¬ ?ê¸°.
      //   Â· /listings (index) ??/map
      //   Â· /listings/:id (?ì„¸) ??/map?listing=:id (ë§¤ë¬¼ì¹´ë“œ ?ë™ ?¤í”ˆ)
      //   ë§¤ë¬¼ì¹´ë“œ URL ?¼ìš°??(f9bf3c1) ?¼ë¡œ ?™ì¼ ê°€ì¹??œê³µ.
      //   ??next.config.ts ?ë„ ?™ì¼ redirect ?ˆì?ë§?ë¹Œë“œ??.js ë§??¬ìš© ì¤?
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

  // L-clean1 (2026-04-22): ?´ë¼?´ì–¸??console ?•ì±… ëª…ì‹œ.
  //   SWC ê°€ ?„ë¡œ?•ì…˜ ë¹Œë“œ ??client ë²ˆë“¤?ì„œ console.log/info/debug ???œê±°.
  //   console.warn / console.error ??? ì? ??DevTools, ì¶”í›„ Sentry ?±ì— ?°ê²°.
  //   ?œë²„(Node) ë²ˆë“¤?ëŠ” ?í–¥ ?†ìŒ(Vercel ë¡œê·¸ ì±„ë„ë¡??„ë? ?µê³¼).
  //   ??ê°œë°œ ì¤‘ì—??console.log ?ìœ ë¡?²Œ ?¬ìš©?´ë„ ?„ë¡œ?•ì…˜??? ì¶œ?˜ì? ?ŠìŒ.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
}

module.exports = withBundleAnalyzer(nextConfig);
