// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 이미지 URL 변환 유틸리티 (클라이언트/서버 공용)
// 모든 이미지 URL을 워터마크 프록시 경로로 변환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const R2_BASE_URL = 'https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev/';

// 외부 이미지 프록시 대상 호스트 (핫링크 보호 우회용)
const PROXY_HOSTS = [
  'd4k1brqee4emz.cloudfront.net',  // 온하우스 이미지 CDN
];

export function getWatermarkedUrl(url: string | null | undefined): string {
  if (!url) return '';

  // Cloudflare R2 공개 URL
  if (url.startsWith(R2_BASE_URL)) {
    const filePath = url.slice(R2_BASE_URL.length);
    return `/api/wm/${filePath}`;
  }

  // 내부 API 이미지 URL (상대경로): /api/images/...
  if (url.startsWith('/api/images/')) {
    return `/api/wm${url}`;
  }

  // 전체 URL에서 /api/images/ 경로 추출
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/api/images/')) {
      return `/api/wm${parsed.pathname}`;
    }
  } catch {
    // URL 파싱 실패 시 무시
  }

  // 로컬 스토리