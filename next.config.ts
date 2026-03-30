import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // í´ë¼ì´ì¸í¸ ë¼ì°í° ìºì: íì´ì§ ì´ë ì ìë² ì¬ìì²­ ë°©ì§
    staleTimes: {
      dynamic: 300,  // ëì  íì´ì§ 5ë¶ ìºì
      static: 3600,  // ì ì  íì´ì§ 1ìê° ìºì
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
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
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
    ],
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.wishes.co.kr' }],
        destination: 'https://wishes.co.kr/:path*',
        permanent: true,
      },
    ];
  },
  headers: async () => [
    {
      source: '/api/listings/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, s-maxage=30, stale-while-revalidate=60',
        },
      ],
    },
  ],
};

export default nextConfig;
