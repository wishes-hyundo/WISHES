import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 이미지 최적화 설정
  images: {
    // STEP 0: 로컬 이미지만
    // STEP 1: R2 커스텀 도메인 추가
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.wishes.co.kr',
        pathname: '/listings/**',
      },
    ],
  },
  // 서버 외부 패키지 (better-sqlite3는 네이티브 모듈)
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
