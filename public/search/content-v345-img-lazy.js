/**
 * content-v345-img-lazy.js (2026-05-10)
 *
 * Fix 22 (사장님 명령 "좀 더 빨라야"):
 *   매물 카드 100건 표시 시 모든 사진 동시 fetch -> 수백 MB transfer.
 *   viewport 외 사진도 fetch -> 큰 낭비.
 *
 * 해결:
 *   MutationObserver 로 모든 img 에 loading="lazy" + decoding="async" + fetchpriority 추가.
 *   - .ws-listing-image (매물 카드 사진): lazy
 *   - .ws-thumb (모달 썸네일): lazy
 *   - .ws-gallery-main img (모달 hero): high priority
 *
 * 효과:
 *   첫 진입 시 viewport 안 매물 카드 (10-15개) 만 fetch.
 *   스크롤 시 추가 fetch. 사장님 첫 진입 빠름.
 *
 * 안전:
 *   - 이미 lazy 적용된 img 는 skip
 *   - native browser feature 사용 (브라우저 지원 확실)
 *   - data-v345 dataset 으로 중복 처리 방지
 */
(function () {
  'use strict';
  if (window.__WS_V345_IMG_LAZY__) return;
  window.__WS_V345_IMG_LAZY__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function _processImg(img) {
    try {
      if (img.dataset.v345) return;
      img.dataset.v345 = '1';

      // 클래스 별 처리
      var classList = img.classList;

      if (classList.contains('ws-gallery-main') ||
          (img.parentElement && img.parentElement.classList && img.parentElement.classList.contains('ws-gallery-main'))) {
        // 모달 hero — high priority
        img.setAttribute('decoding', 'async');
        img.setAttribute('fetchpriority', 'high');
        return;
      }

      // 첫 active 썸네일 (모달) — eager
      if (classList.contains('ws-thumb-active')) {
        img.setAttribute('decoding', 'async');
        img.setAttribute('fetchpriority', 'high');
        return;
      }

      // 그 외 모든 img — lazy
      if (!img.hasAttribute('loading')) {
        img.setAttribute('loading', 'lazy');
      }
      if (!img.hasAttribute('decoding')) {
        img.setAttribute('decoding', 'async');
      }
      if (!img.hasAttribute('fetchpriority')) {
        img.setAttribute('fetchpriority', 'low');
      }
    } catch (_) {}
  }

  function _sweep(root) {
    try {
      var scope = root || document;
      var imgs = scope.querySelectorAll('img:not([data-v345])');
      for (var i = 0; i < imgs.length; i++) {
        _processImg(imgs[i]);
      }
    } catch (_) {}
  }

  // MutationObserver — 새 img 추가 시 즉시 처리
  var mo = new MutationObserver(function (muts) {
    var hit = false;
    for (var i = 0; i < muts.length && !hit; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG' || (n.querySelector && n.querySelector('img'))) {
          hit = true; break;
        }
      }
    }
    if (hit) {
      // requestAnimationFrame 으로 batch 처리
      if (window.requestAnimationFrame) {
        requestAnimationFrame(function () { _sweep(); });
      } else {
        setTimeout(_sweep, 16);
      }
    }
  });

  function _init() {
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    _sweep();
    // 추가 sweep — content.js 가 매물 카드 렌더 후
    setTimeout(_sweep, 500);
    setTimeout(_sweep, 2000);
    setTimeout(_sweep, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  try { console.log('[v345-img-lazy] active - viewport-only fetch'); } catch (_) {}
})();
