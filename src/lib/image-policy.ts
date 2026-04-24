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
//     - *.wishes-img.workers.dev           (Cloudflare Worker 이미지 프록시 — 자체 처리)
//     - d4k1brqee4emz.cloudfront.net       (기존 이미지 프록시 CDN)
//   그 외 외부 도메인(공실클럽·온하우스 CDN 등)은 모두 차단.
//
// ─── L-img1 (2026-04-24) ───
//   listing_images 샘플 2,000건 중 1,998건(99.9%) 이 wishes-image-proxy 도메인에
//   있었는데 기존 whitelist 에 없어서 admin/search 카드 썸네일 전부 공백이 되던
//   '썸네일 전원 실종' 버그의 근본원인. Worker 프록시는 우리 인프라(Cloudflare
//   Workers 계정) 라 저작권 판정상 '자체 업로드' 와 동치로 처리.

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

  // L-img1 (2026-04-24): Cloudflare Worker 이미지 프록시 (자체 계정 소유, CSP img-src 에 등재)
  if (/\.wishes-img\.workers\.dev\//i.test(u)) return true;

  // L-img1 (2026-04-24): 기존 CloudFront 이미지 배포 CDN (자체 S3 오리진)
  if (/\/\/d4k1brqee4emz\.cloudfront\.net\//i.test(u)) return true;

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
 * 매물 한 건에 대한 이미지 정책 적용. (공개 엔드포인트 전용 — /api/listings, /api/listings/map 등)
 * - source_site 없음(자체 매물): 그대로 유지
 * - source_site 있음(크롤링 매물): 자체 업로드 이미지/비디오만 통과 (저작권 보호)
 *
 * 중개사 전용(/api/admin/*) 엔드포인트에는 preferSelfHostedImages 를 쓸 것.
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

/**
 * 관리자/중개사 포털(admin broker portal) 전용 이미지 정책.
 *
 * 공개 엔드포인트의 applyImagePolicy 와 달리 "크롤링 원본 썸네일 노출" 을 허용한다.
 *   - 자체 매물(source_site NULL): 그대로
 *   - 크롤링 + 자체 업로드 섞인 매물: 자체 업로드만 노출
 *     (46163 봉천동 62-24 처럼 공실클럽 워터마크 썸네일을 중개사가 교체한 케이스 보호)
 *   - 크롤링 사진만 있는 매물: 크롤링 원본 유지
 *     (중개사가 업무상 참조해야 하므로 카드 썸네일을 비워두지 않는다)
 *
 * ※ 공개 엔드포인트에는 절대 쓰지 말 것 — 저작권 차단 우회 루트가 된다.
 */
export function preferSelfHostedImages<
  T extends {
    source_site?: string | null;
    listing_images?: any[] | null;
    listing_videos?: any[] | null;
  }
>(row: T): T {
  if (!row) return row;
  if (!row.source_site) return row;

  const selfImgs = filterSelfHosted(row.listing_images);
  const selfVids = filterSelfHosted(row.listing_videos);

  return {
    ...row,
    listing_images:
      selfImgs.length > 0
        ? selfImgs
        : (Array.isArray(row.listing_images) ? row.listing_images : []),
    listing_videos:
      selfVids.length > 0
        ? selfVids
        : (Array.isArray(row.listing_videos) ? row.listing_videos : []),
  };
}
