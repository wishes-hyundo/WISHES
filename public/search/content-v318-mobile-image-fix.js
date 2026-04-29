/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v318 — 모든 <img> 에 referrerpolicy=unsafe-url 적용 (rev4)
 *
 * 사장님 보고 (2026-04-29):
 *   "모바일 사진 안뜸" → "데스크탑 사진 안뜸" → "모바일 여전히 안뜸"
 *   → "매물 상세 모달 사진 자체가 안뜸"
 *
 * 진짜 근본 원인:
 *   ① DB image URL = wishes-image-proxy.wishes-img.workers.dev/listings/...
 *   ② Cloudflare Worker 는 Referer 에 'https://wishes.co.kr/search...' (path 포함)
 *      필요 — 응답 본문 "Forbidden: images are restricted to admin /search page only."
 *   ③ wishes.co.kr Referrer-Policy = strict-origin-when-cross-origin → cross-origin
 *      요청 시 path 제거 → Worker 403.
 *
 * 이전 시도 (rev3) 의 한계:
 *   - selector 가 'img.ws-listing-image, img.ws-lazy[data-src]' 만 → 매물 카드만 처리
 *   - 매물 상세 모달 갤러리 (ws-thumb / src= 직접) 는 미처리 → 여전히 빨간/검정
 *
 * Fix (rev4):
 *   - 모든 <img> 에 referrerpolicy=unsafe-url 적용 (전역 적용)
 *   - 이미 데이터/blob URL 이거나 self-origin 이면 skip (불필요한 변경 X)
 *   - lazy data-src → src 즉시 이동 (모바일 IntersectionObserver 우회)
 *   - MutationObserver 로 새 img 추가 자동 처리
 *
 * 정책 (CLAUDE.md): content.js 안 건드림. 별도 patch 파일.
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v318-mobile-image-fix-rev4';
  var IMAGE_PROXY_HOST = 'wishes-image-proxy.wishes-img.workers.dev';

  function needsReferrer(img) {
    try {
      var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (!src) return false;
      if (src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return false;
      // image-proxy 또는 외부 도메인이면 referrer 필요
      return (src.indexOf(IMAGE_PROXY_HOST) >= 0 || src.indexOf('://') >= 0);
    } catch (_) { return true; }
  }

  function fixImg(img) {
    try {
      // ① referrerpolicy: unsafe-url — Cloudflare Worker referer 검사 통과
      if (needsReferrer(img) && img.getAttribute('referrerpolicy') !== 'unsafe-url') {
        img.setAttribute('referrerpolicy', 'unsafe-url');
        // referrer 변경 후 src 재할당해야 새 referrer 로 재요청
        // 단, naturalWidth > 0 (이미 로드 성공) 이면 skip
        if (img.naturalWidth === 0) {
          var s = img.getAttribute('src');
          if (s) {
            // forced reload — src 를 빈값 → 다시 설정
            img.setAttribute('src', '');
            // microtask 후 다시 src 설정 (브라우저가 referrer 갱신 후 fetch)
            setTimeout(function () { try { img.setAttribute('src', s); } catch (_) {} }, 0);
          }
        }
      }
      // ② lazy → 즉시 src
      var ds = img.getAttribute('data-src');
      if (ds && img.getAttribute('src') !== ds) {
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        img.setAttribute('src', ds);
        img.removeAttribute('data-src');
        if (img.classList) img.classList.remove('ws-lazy');
      }
    } catch (e) { /* noop */ }
  }

  function fixAll() {
    try {
      // 모든 <img> 처리 (매물 카드 / 모달 갤러리 / 라이트박스 / 인쇄 / QR 등)
      var imgs = document.querySelectorAll('img');
      imgs.forEach(fixImg);
    } catch (e) { /* noop */ }
  }

  function start() {
    fixAll();
    var mo = new MutationObserver(function (muts) {
      var hit = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) {
              if (n.tagName === 'IMG' || (n.querySelector && n.querySelector('img'))) {
                hit = true; break;
              }
            }
          }
          if (hit) break;
        }
        // src/data-src 변경 감지
        if (m.type === 'attributes' && m.target && m.target.tagName === 'IMG') {
          var attr = m.attributeName;
          if (attr === 'src' || attr === 'data-src') { hit = true; break; }
        }
      }
      if (hit) {
        if (window.requestAnimationFrame) requestAnimationFrame(fixAll);
        else setTimeout(fixAll, 16);
      }
    });
    try {
      mo.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'data-src'],
      });
      console.log('[' + V + '] 시작 — 모든 <img> 에 referrerpolicy=unsafe-url + lazy 즉시 로드');
    } catch (e) {
      console.warn('[' + V + '] MutationObserver 실패:', e);
    }
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
