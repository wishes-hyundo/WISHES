import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ESLint: skip during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // TypeScript: skip type check during build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.wishes.co.kr',
        pathname: '/listings/**',
      },
    ],
  },
  // Server external packages
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
