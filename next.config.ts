import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
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
    ],
  },
  serverExternalPackages: ['better-sqlite3'],
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
};

export default nextConfig;
