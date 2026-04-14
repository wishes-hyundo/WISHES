import type { Metadata } from 'next';

/**
 * /search 전용 레이아웃
 * ─────────────────────────────────────────────────
 * 이 라우트(및 하위 /search/*)에서만 Referer 정책을
 * `unsafe-url` 로 설정하여, Cloudflare Worker
 * (wishes-image-proxy) 가 "요청이 /search 페이지에서
 * 왔는지" 풀 URL 로 검증할 수 있게 한다.
 *
 * 효과:
 *   · /search 페이지 → Referer: https://wishes.co.kr/search... → 이미지 허용
 *   · 고객 페이지(/, /map, /listings 등) → 기본 정책 유지
 *     → Referer: https://wishes.co.kr/ 만 전송 → 이미지 차단
 *
 * 관련 파일:
 *   · Cloudflare Worker: wishes-image-proxy (R2 프록시)
 *   · DB 테이블: listing_images.url (Worker URL 사용)
 */
export const metadata: Metadata = {
  referrer: 'unsafe-url',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
