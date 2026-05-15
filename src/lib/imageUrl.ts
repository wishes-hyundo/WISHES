// 이미지 URL 변환 유틸리티 (클라이언트/서버 공용)
// 모든 이미지 URL을 워터마크 프록시 경로로 변환

const R2_BASE_URL = 'https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev/';

// [2026-05-14 사장님 명령]: 외부 CDN 도 img-proxy 로 강제 wrap.
// 이전: cloudfront/zigbang URL raw 그대로 → /map /listings /home prerender 시
// raw cloudfront fetch (?w=1920 거대 image, 2-3MB octet-stream).
// fix: 외부 CDN host 면 /api/img-proxy 로 wrap (cap 적용 → 220px 카드 size).
// 모달 hero / lightbox 는 v383/v384 가 ?w=1200 + nocap=1 으로 별도 처리.
const IMG_PROXY_HOSTS = [
  'd4k1brqee4emz.cloudfront.net',
  'resource.zigbang.io',
  'ic.zigbang.com',
  'img.nemoapp.kr',
  'blob.nemoapp.kr',
  'gsc.gongsilclub.com',
];

function _wrapImgProxy(url: string): string {
  return '/api/img-proxy?url=' + encodeURIComponent(url);
}

export function getWatermarkedUrl(url: string | null | undefined): string {
  if (!url) return '';

  // Cloudflare R2 공개 URL
  if (url.startsWith(R2_BASE_URL)) {
    const filePath = url.slice(R2_BASE_URL.length);
    return '/api/wm/' + filePath;
  }

  // 내부 API 이미지 URL (상대경로): /api/images/...
  if (url.startsWith('/api/images/')) {
    return '/api/wm' + url;
  }

  // 전체 URL에서 /api/images/ 경로 추출
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/api/images/')) {
      return '/api/wm' + parsed.pathname;
    }
    // [2026-05-14 사장님 명령] 외부 CDN host 면 img-proxy wrap
    if (IMG_PROXY_HOSTS.includes(parsed.hostname)) {
      return _wrapImgProxy(url);
    }
  } catch {
    // URL 파싱 실패 시 무시
  }

  // 로컬 스토리지 URL (/images/...)
  if (url.startsWith('/images/')) {
    const filePath = url.slice('/images/'.length);
    return '/api/wm/' + filePath;
  }

  // 이미 img-proxy 거친 URL — 중복 wrap 방지
  if (url.indexOf('/api/img-proxy') > -1) {
    return url;
  }

  // 그 외 외부 URL 은 그대로
  return url;
}
