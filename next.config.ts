import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 60,
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.wishes.co.kr',
        pathname: '/listings/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/**',
      },
      {
        protocol: 'https',
        hostname: 'pub-e16c7a50584c4db7be3571746cd80716.r2.dev',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/admin/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
        ],
      },
      // HTTP 103 Early Hints + 프리커넥트 / 프리로드 — /map 초기 로드 가속
      {
        source: '/map',
        headers: [
          {
            key: 'Link',
            value:
              '<https://dapi.kakao.com>; rel=preconnect; crossorigin, ' +
              '<https://t1.daumcdn.net>; rel=preconnect; crossorigin, ' +
              '<https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev>; rel=preconnect; crossorigin, ' +
              '<https://fonts.googleapis.com>; rel=preconnect',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/listings/:id',
        headers: [
          {
            key: 'Link',
            value:
              '<https://dapi.kakao.com>; rel=preconnect; crossorigin, ' +
              '<https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev>; rel=preconnect; crossorigin',
          },
        ],
      },
      // 정적 자산 캐시
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.wishes.co.kr' }],
        destination: 'https://wishes.co.kr/:path*',
        permanent: true,
      },
      // L-listings-deprecate (2026-04-29 사장님 명령): /listings 영구 폐기.
      //   · /listings (index) → /map
      //   · /listings/:id (상세) → /map?listing=:id (매물카드 자동 오픈)
      //   기존 SEO 보존 의도 무효 — 사장님이 listings 완전 폐기 명령.
      //   매물 카드 자체 URL 라우팅 (f9bf3c1) 으로 동일 가치 제공.
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
    ];
  },
};

export default nextConfig;
