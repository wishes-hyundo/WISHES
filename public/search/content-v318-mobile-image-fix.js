/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v318 — 모바일/데스크탑 썸네일 사진 즉시 로드 + 외부 도메인 proxy.
 *
 * 사장님 보고 (2026-04-29):
 *   "모바일 보니깐 썸네일에 사진이 전혀 안뜸"
 *   "데스크탑에서도 썸네이 노출 안되는것 같은데"
 *
 * 근본 원인:
 *   1. content.js 의 IntersectionObserver lazy loading 이 모바일 비표준 viewport
 *      에서 트리거 안 됨. → src 영원히 비어있음.
 *   2. 크롤링 매물 (gongsilclub 등) 의 이미지 URL 이 외부 도메인 → CSP img-src
 *      허용 목록에 없으면 차단 → onerror 발동 → 빨간 집 아이콘만 표시.
 *
 * 정책 (CLAUDE.md):
 *   - content.js 손대지 X — 별도 patch 파일.
 *   - 모든 매물 + 신규 매물 영구 적용.
 *
 * 동작:
 *   1. 페이지 로드 + 매번 매물 카드 렌더 후 MutationObserver 감지
 *   2. img.ws-lazy[data-src] 모두 찾아서 즉시 src 이동
 *   3. **외부 도메인 자동 감지** → wishes-image-proxy.wishes-img.workers.dev 로 wrap
 *      (CSP 허용 + 저작권 안전)
 *   4. native loading="lazy" decoding="async" 사용 (브라우저 자체 최적화)
 *   5. onerror 시 한번 더 image-proxy 로 재시도 (이중 안전망)
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v318-mobile-image-fix';
  var IMAGE_PROXY = 'https://wishes-image-proxy.wishes-img.workers.dev';

  // CSP img-src 에 허용된 도메인 (whitelist).
  var ALLOWED_HOSTS = [
    'wishes.co.kr',                              // self
    'supabase.co',                               // *.supabase.co
    'r2.dev',                                    // R2 storage
    'wishes-image-proxy.wishes-img.workers.dev', // 자체 proxy
    'cloudfront.net',                            // d4k1brqee4emz.cloudfront.net
    'daumcdn.net', 'kakao.com', 'kakao.co.kr',   // 카카오
    'images.unsplash.com',
  ];

  function isAllowed(url) {
    if (!url) return false;
    if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return true;
    if (url.indexOf('/') === 0) return true; // 상대경로 = self
    try {
      var u = new URL(url, location.origin);
      // same origin 자동 허용
      if (u.origin === location.origin) return true;
      var h = u.hostname;
      for (var i = 0; i < ALLOWED_HOSTS.length; i++) {
        if (h === ALLOWED_HOSTS[i] || h.endsWith('.' + ALLOWED_HOSTS[i])) return true;
      }
      return false;
    } catch (_) { return false; }
  }

  function proxify(url) {
    if (!url) return url;
    if (isAllowed(url)) return url; // 이미 허용된 도메인은 그대로
    // 외부 도메인 → image-proxy 통해서 wrap (CSP 통과 + 인증 헤더 추가 가능)
    try {
      return IMAGE_PROXY + '/?url=' + encodeURIComponent(url);
    } catch (_) { return url; }
  }

  function eagerLoad(img) {
    try {
      var ds = img.getAttribute('data-src');
      if (!ds) return;
      var finalUrl = proxify(ds);
      if (img.getAttribute('src') === finalUrl) {
        img.removeAttribute('data-src');
        img.classList.remove('ws-lazy');
        return;
      }
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      // onerror 추가 — 한 번 더 image-proxy 로 재시도 (이미 proxy 면 skip)
      if (!img.hasAttribute('data-v318-retry')) {
        var origOnError = img.getAttribute('onerror') || '';
        img.setAttribute('onerror',
          "if(!this.hasAttribute('data-v318-retry')){this.setAttribute('data-v318-retry','1');var u=this.getAttribute('src');if(u && u.indexOf('" + IMAGE_PROXY + "')!==0){this.src='" + IMAGE_PROXY + "/?url='+encodeURIComponent(u);return;}}" + origOnError
        );
      }
      img.setAttribute('src', finalUrl);
      img.removeAttribute('data-src');
      img.classList.remove('ws-lazy');
    } catch (e) { /* noop */ }
  }

  function loadAll() {
    try {
      var imgs = document.querySelectorAll('img.ws-lazy[data-src]');
      imgs.forEach(eagerLoad);
      // 추가: 이미 src 가 설정됐지만 외부 도메인이라 차단된 이미지도 proxy 적용
      var allImgs = document.querySelectorAll('img.ws-listing-image[src]:not([data-v318-checked])');
      allImgs.forEach(function (img) {
        img.setAttribute('data-v318-checked', '1');
        var src = img.getAttribute('src');
        if (src && !isAllowed(src) && src.indexOf(IMAGE_PROXY) !== 0) {
          img.setAttribute('src', proxify(src));
        }
      });
    } catch (e) { /* noop */ }
  }

  function start() {
    loadAll();
    var mo = new MutationObserver(function (muts) {
      var hit = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) {
              if ((n.tagName === 'IMG' && n.classList && (n.classList.contains('ws-lazy') || n.classList.contains('ws-listing-image'))) ||
                  (n.querySelector && n.querySelector('img.ws-lazy, img.ws-listing-image'))) {
                hit = true; break;
              }
            }
          }
          if (hit) break;
        }
      }
      if (hit) {
        if (window.requestAnimationFrame) requestAnimationFrame(loadAll);
        else setTimeout(loadAll, 16);
      }
    });
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      console.log('[' + V + '] image fix 시작 — lazy 즉시 로드 + 외부 도메인 자동 proxy');
    } catch (e) {
      console.warn('[' + V + '] MutationObserver 실패:', e);
    }
    setTimeout(loadAll, 1000);
    setTimeout(loadAll, 3000);
    setTimeout(loadAll, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
