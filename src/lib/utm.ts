// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTM / 광고 경로 자동 파싱 (#49)
//
//   리드 제출 시점(InquiryModal / VisitBookingModal)에서 호출
//   원칙: pathname 기반 source 를 풍부하게 만들되, 너무 길게 늘어지지 않게 200자 제한
//
//   우선순위
//     1) utm_source = 'google' + gclid    → 'google-ads:{utm_campaign||utm_term||path}'
//     2) fbclid 만 있음                    → 'facebook-ads:{path}'
//     3) utm_source 있음                   → '{utm_source}:{utm_campaign||path}'
//     4) referrer 가 naver/daum/google 등  → 'search:naver:{path}' 처럼 검색엔진 라벨
//     5) fallback                          → fallbackSource (통상 pathname)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SEARCH_ENGINES: Record<string, string> = {
  'google.com': 'google',
  'google.co.kr': 'google',
  'naver.com': 'naver',
  'search.naver.com': 'naver',
  'daum.net': 'daum',
  'search.daum.net': 'daum',
  'bing.com': 'bing',
  'duckduckgo.com': 'ddg',
};

function getSearchParam(search: string, key: string): string | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search);
    const v = params.get(key);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function referrerHost(): string | null {
  if (typeof document === 'undefined') return null;
  const ref = document.referrer;
  if (!ref) return null;
  try {
    const u = new URL(ref);
    // 같은 사이트면 무시
    if (typeof window !== 'undefined' && u.host === window.location.host) return null;
    return u.host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function classifyReferrer(host: string): string | null {
  if (SEARCH_ENGINES[host]) return `search:${SEARCH_ENGINES[host]}`;
  // .co.kr 제거 등 단순화
  const bare = host.split('.').slice(-2).join('.');
  if (SEARCH_ENGINES[bare]) return `search:${SEARCH_ENGINES[bare]}`;
  return `ref:${host}`;
}

/**
 * 현재 페이지 URL + referrer 를 읽어 광고 / 검색 유입을 추정한 source 문자열 반환
 * @param fallbackSource 컴포넌트가 이미 알고 있는 source (보통 pathname or context)
 * @returns `google-ads:brand-kw` | `facebook-ads:/listings/123` | `search:naver:/listings` 같은 형태
 */
export function enrichSource(fallbackSource?: string | null): string {
  if (typeof window === 'undefined') {
    return (fallbackSource || '').slice(0, 200);
  }

  const path = fallbackSource?.trim() || window.location.pathname;
  const search = window.location.search;

  const utmSource = getSearchParam(search, 'utm_source');
  const utmMedium = getSearchParam(search, 'utm_medium');
  const utmCampaign = getSearchParam(search, 'utm_campaign');
  const utmTerm = getSearchParam(search, 'utm_term');
  const gclid = getSearchParam(search, 'gclid');
  const fbclid = getSearchParam(search, 'fbclid');
  const kakaoclid = getSearchParam(search, 'kakao_click_id') || getSearchParam(search, 'kclid');

  // 1) Google Ads — gclid 가 있으면 확정
  if (gclid || (utmSource && utmSource.toLowerCase().includes('google') && utmMedium?.toLowerCase() === 'cpc')) {
    const tag = utmCampaign || utmTerm || path;
    return `google-ads:${tag}`.slice(0, 200);
  }

  // 2) Facebook/Meta Ads
  if (fbclid || (utmSource && /facebook|meta|instagram/i.test(utmSource))) {
    const tag = utmCampaign || path;
    return `facebook-ads:${tag}`.slice(0, 200);
  }

  // 3) Kakao Moment (광고)
  if (kakaoclid || (utmSource && /kakao/i.test(utmSource))) {
    const tag = utmCampaign || path;
    return `kakao-ads:${tag}`.slice(0, 200);
  }

  // 4) 일반 UTM
  if (utmSource) {
    const tag = utmCampaign || utmMedium || path;
    return `${utmSource}:${tag}`.slice(0, 200);
  }

  // 5) Referrer 기반 검색엔진/외부 유입
  const host = referrerHost();
  if (host) {
    const cls = classifyReferrer(host);
    return `${cls}:${path}`.slice(0, 200);
  }

  // 6) Fallback — 순수 pathname
  return path.slice(0, 200);
}
