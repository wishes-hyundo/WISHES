// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 이미지 노출 정책 (저작권 보호 + 자체 업로드 통과)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 🎯 목적
//   - 크롤링 매물(source_site NOT NULL)의 외부 원본 사진은 저작권 보호 차원에서 차단
//   - 그러나 사용자(중개사)가 직접 업로드한 실제 매물 사진은 광고 목적으로 노출
//
// 🔎 판별 기준 (화이트리스트 방식)
//   다음 패턴은 "자체 업로드"로 간주하고 항상 통과시킨다:
//     - /api/images/listings/...        (Next 자체 이미지 프록시)
//     - https://wishes.co.kr/api/images/...
//     - *.supabase.co/storage/...       (Supabase Storage)
//     - pub-*.r2.dev / *.r2.cloudflarestorage.com (Cloudflare R2)
//   그 외 외부 도메인(공실클럽·온하우스 CDN 등)은 모두 차단.

export function isSelfHostedImage(url?: string | null): boolean {
  if (!url) return false;
  const u = String(url).trim();
  if (!u) return false;

  // 상대 경로(자체)
  if (u.startsWith('/api/images/')) return true;

  // 자체 도메인
  if (/^https?:\/\/(www\.)?wishes\.co\.kr\/api\/images\//i.test(u)) return true;

  // Supabase Storage
  if (/\.supabase\.co\/storage\//i.test(u)) return true;

  // Cloudflare R2 (pub-*.r2.dev 또는 *.r2.cloudflarestorage.com)
  if (/\.r2\.dev\//i.test(u)) return true;
  if (/\.r2\.cloudflarestorage\.com\//i.test(u)) return true;

  return false;
}

/**
 * 이미지/비디오 배열을 자체 업로드 분만 남기도록 필터링.
 * url 필드가 없는 항목은 제외.
 */
export function filterSelfHosted<T extends { url?: string | null }>(
  items: T[] | null | undefined
): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter((it) => isSelfHostedImage(it?.url));
}

/**
 * 매물 한 건에 대한 이미지 정책 적용.
 * - source_site 없음(자체 매물): 그대로 유지
 * - source_site 있음(크롤링 매물): 자체 업로드 이미지/비디오만 통과
 */
export function applyImagePolicy<
  T extends {
    source_site?: string | null;
    listing_images?: any[] | null;
    listing_videos?: any[] | null;
  }
>(row: T): T {
  if (!row) return row;
  if (!row.source_site) return row;

  return {
    ...row,
    listing_images: filterSelfHosted(row.listing_images),
    listing_videos: filterSelfHosted(row.listing_videos),
  };
}
