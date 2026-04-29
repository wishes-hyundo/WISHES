/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v318 — 썸네일 사진 노출 fix (모바일 + 데스크탑 양쪽)
 *
 * 사장님 보고 (2026-04-29):
 *   "모바일 보니깐 썸네일에 사진이 전혀 안뜸"
 *   "데스크탑에서도 썸네일 노출 안되는것 같은데"
 *   "모바일에서 여전히 썸네일 안뜸" (rev2 후)
 *
 * 진짜 근본 원인 (3중 발견):
 *   ① DB 의 image URL 은 wishes-image-proxy.wishes-img.workers.dev/listings/...
 *   ② Cloudflare Worker (image-proxy) 는 Referer 헤더에 'https://wishes.co.kr/search'
 *      처럼 path 까지 있어야 200 OK (저작권 보호 의도). path 없으면 403.
 *      응답 본문: "Forbidden: images are restricted to admin /search page only."
 *   ③ wishes.co.kr 의 Referrer-Policy = 'strict-origin-when-cross-origin'.
 *      → cross-origin 요청 (image-proxy.workers.dev 는 다른 origin) 시 path 제거된
 *        origin 만 referer 로 보냄. → Worker 403 → onerror 발동 → 빨간 집.
 *
 * Fix:
 *   - <img> 태그에 referrerpolicy="unsafe-url" 추가 → cross-origin 요청 시
 *     full URL (path 포함) 을 referer 로 보냄 → Worker 200 통과.
 *   - lazy loading 우회 (IntersectionObserver 모바일 트리거 안 됨).
 *   - native loading="lazy" decoding="async" — 브라우저 자체 최적화.
 *
 * 정책 (CLAUDE.md): content.js 손대지 X. 별도 patch 파일.
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v318-mobile-image-fix-rev3';

  function fixImg(img) {
    try {
      // ① referrerpolicy: unsafe-url — Cloudflare Worker referer 검사 통과
      if (img.getAttribute('referrerpolicy') !== 'unsafe-url') {
        img.setAttribute('referrerpolicy', 'unsafe-url');
      }
      // ② lazy → 즉시 로드 (data-src → src)
      var ds = img.getAttribute('data-src');
      if (ds && img.getAttribute('src') !== ds) {
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        img.setAttribute('src', ds);
        img.removeAttribute('data-src');
        img.classList.remove('ws-lazy');
      }
    } catch (e) { /* noop */ }
  }

  function fixAll() {
    try {
      // 모든 매물 이미지 (lazy + 일반 모두) 처리
      var imgs = document.querySelectorAll('img.ws-listing-image, img.ws-lazy[data-src]');
      imgs.forEach(fixImg);
    } catch (e) { /* noop */ }
  }

  function start() {
    fixAll();
    // 새 카드 추가 / 페이지 변경 감지
    var mo = new MutationObserver(function (muts) {
      var hit = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1 && n.querySelector) {
              if (n.tagName === 'IMG' || n.querySelector('img')) {
                hit = true; break;
              }
            }
          }
          if (hit) break;
        }
      }
      if (hit) {
        if (window.requestAnimationFrame) requestAnimationFrame(fixAll);
        else setTimeout(fixAll, 16);
      }
    });
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      console.log('[' + V + '] 시작 — referrerpolicy=unsafe-url + lazy 즉시 로드');
    } catch (e) {
      console.warn('[' + V + '] MutationObserver 실패:', e);
    }
    // 안전망 sweep
    setTimeout(fixAll, 500);
    setTimeout(fixAll, 1500);
    setTimeout(fixAll, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
