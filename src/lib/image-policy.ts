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
//
// ⚠️ L-img1-revert (2026-04-24): wishes-image-proxy.wishes-img.workers.dev 와
//   d4k1brqee4emz.cloudfront.net 을 whitelist 에 넣었던 L-img1 을 롤백한다.
//   이 두 도메인은 '우리가 운영하는' 인프라이긴 하지만 그 역할은 크롤링 원본
//   이미지를 다운받아 재서빙하는 프록시 역할이며, 원본 저작권은 여전히
//   공실클럽/온하우스 등 외부 크롤링 소스에 있다. 따라서 저작권 판정상 '외부'
//   로 분류되어야 한다. L-img1 은 /search 카드 썸네일을 살리려는 좋은 의도였지만
//   부작용으로 공개 /map/검색 페이지에 워터마크 박힌 크롤링 사진이 노출됐다.
//   admin 포털 (/api/admin/listings, [id]) 의 preferSelfHostedImages 는 '자체
//   업로드 없으면 원본 유지' 로직이라 whitelist 제거 후에도 중개사 뷰에서는
//   크롤링 썸네일이 정상 표시됨. 공개 엔드포인트는 applyImagePolicy 경로로
//   crawl 원본이 자동 차단된다.

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

  // ⚠️ L-img1-revert (2026-04-24): wishes-image-proxy.wishes-img.workers.dev 와
  //   d4k1brqee4emz.cloudfront.net 은 whitelist 에서 제외 (위 주석 참조).
  //   공개 페이지에서 크롤링 원본 사진이 노출되는 저작권 침해를 막기 위함.

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
