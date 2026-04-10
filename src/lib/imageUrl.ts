// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 이미지 URL 변환 유틸리티 (클라이언트/서버 공용)
// 모든 이미지 URL을 워터마크 프록시 경로로 변환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const R2_BASE_URL = 'https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev/';

/**
 * 원본 이미지 URL을 워터마크 프록시 URL로 변환합니다.
 * - R2 URL: https://pub-xxx.r2.dev/listings/foo.webp → /api/wm/listings/foo.webp
 * - 로컬 URL: /images/listings/foo.webp → /api/wm/listings/foo.webp
 * - 그 외: 변환 없이 원본 반환
 */
export function getWatermarkedUrl(url: string | null | undefined): string {
  if (!url) return '';

  // Cloudflare R2 공개 URL
  if (url.startsWith(R2_BASE_URL)) {
    const filePath = url.slice(R2_BASE_URL.length);
    return `/api/wm/${filePath}`;
  }

  // 로컬 스토리지 URL (/images/...)
  if (url.startsWith('/images/')) {
    const filePath = url.slice('/images/'.length);
    return `/api/wm/${filePath}`;
  }

  return url;
}
