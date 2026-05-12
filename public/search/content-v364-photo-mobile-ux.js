/**
 * v364 v3 — Photo 1200px + swipe + pull-to-refresh NUCLEAR block
 * 사장님 명령 2026-05-12.
 *
 * v3 변경:
 *   - Pull-to-refresh: 더 강력한 차단
 *     • overscroll-behavior: none (vs contain)
 *     • touch-action: pan-y manipulation
 *     • touchmove capture: true (다른 listener 보다 먼저)
 *     • scrollY<=0 && deltaY>0 시 preventDefault
 *     • 이벤트 비활성화 까지
 *   - Lightbox swipe: img target 큰 사진 위 swipe → 좌/우 버튼 click
 *
 * 회귀 회피:
 *   - JS body 의 scroll 자체는 안 건드림 (페이지 정상 스크롤)
 *   - 모바일 (≤768px) 만 적용
 */
(function () {
  'use strict';
  if (window.__WS_V364_PHOTO_MOBILE__) return;
  window.__WS_V364_PHOTO_MOBILE__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var HERO_WIDTH = 1200;
  var SWIPE_THRESHOLD_PX = 50;
  var SWIPE_TIME_MAX_MS = 600;
  var BIG_IMG_MIN_WIDTH = 200;

  function log() {
    if (!DEBUG) return;
    var args = ['[v364-photo-mobile-v3]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  // ─────────────────────────────────────────────────
  // CSS — pull-to-refresh nuclear
  // ─────────────────────────────────────────────────
  function injectCSS() {
    try {
      var style = document.createElement('style');
      style.setAttribute('data-v364', 'mobile-ux-v3');
      style.textContent = [
        'html, body {',
        '  overscroll-behavior: none !important;',
        '  overscroll-behavior-y: none !important;',
        '}',
        '@media (max-width: 768px) {',
        '  html, body {',
        '    overscroll-behavior: none !important;',
        '    overscroll-behavior-y: none !important;',
        '    -webkit-overflow-scrolling: touch;',
        '    touch-action: pan-y manipulation !important;',
        '  }',
        '}',
      ].join('\n');
      document.head.appendChild(style);
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────
  // Touch handlers — pull-to-refresh + swipe
  // ─────────────────────────────────────────────────
  var touchStartY = 0;
  var touchStartX = 0;
  var touchStartTime = 0;
  var touchTargetIsImg = false;
  var touchTargetIsBigImg = false;

  function onTouchStartCapture(e) {
    if (!e.touches || e.touches.length !== 1) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    touchStartTime = Date.now();
    var t = e.target;
    touchTargetIsImg = !!(t && t.tagName === 'IMG');
    touchTargetIsBigImg = false;
    if (touchTargetIsImg) {
      var rect = t.getBoundingClientRect();
      if (rect.width >= BIG_IMG_MIN_WIDTH) touchTargetIsBigImg = true;
    }
  }

  function onTouchMoveCapture(e) {
    // Fix 42 (2026-05-12 사장님 발견): CSS overscroll-behavior 작동 X.
    //   PTR 만 정확히 차단 - closest scrollable parent scrollTop === 0 + 손가락 아래로 swipe.
    //   page 위쪽으로 swipe (위로 scroll) 은 정상 작동.
    if (!e.touches || e.touches.length !== 1) return;
    var dy = e.touches[0].clientY - touchStartY;
    var dx = e.touches[0].clientX - touchStartX;

    // 큰 사진 위 수평 swipe 차단 (page scroll 방지)
    if (touchTargetIsBigImg && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      e.preventDefault();
      return;
    }

    // PTR 정확 차단: 손가락 아래로 swipe (dy > 0) + scrollable container 가 top 일 때만
    if (dy > 5 && Math.abs(dy) > Math.abs(dx)) {
      // closest scrollable parent 검사
      var el = e.target;
      var atTop = true;
      while (el && el !== document.documentElement && el.nodeType === 1) {
        try {
          var cs = window.getComputedStyle(el);
          var oy = cs.overflowY;
          if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollTop > 0) {
            atTop = false;
            break;
          }
        } catch (_) {}
        el = el.parentElement;
      }
      // root scroll 도 검사
      if (atTop) {
        var rootScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        if (rootScroll > 0) atTop = false;
      }
      if (atTop) {
        // 모든 scrollable parent + root 가 top — PTR. 차단.
        e.preventDefault();
        try { e.stopPropagation(); } catch (_) {}
      }
    }
  }

  function onTouchEndCapture(e) {
    if (!e.changedTouches || e.changedTouches.length !== 1) return;
    var dt = Date.now() - touchStartTime;
    if (dt > SWIPE_TIME_MAX_MS) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (!touchTargetIsBigImg) return;
    var direction = dx < 0 ? 'next' : 'prev';
    var btn = findNavButton(direction);
    if (btn) {
      try {
        btn.click();
        log('swipe', direction, 'clicked nav button');
      } catch (_) {}
    }
  }

  function findNavButton(direction) {
    var candidates = document.querySelectorAll('button, div, span, a, [role="button"]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.offsetParent === null) continue;
      var text = (el.textContent || '').trim();
      var aria = el.getAttribute('aria-label') || '';
      var cls = (el.className || '').toString().toLowerCase();
      var matchesNext = direction === 'next' && (
        text === '›' || text === '→' || text === '>' ||
        /next|다음/.test(aria) || /next/.test(cls)
      );
      var matchesPrev = direction === 'prev' && (
        text === '‹' || text === '←' || text === '<' ||
        /prev|이전/.test(aria) || /prev/.test(cls)
      );
      if (matchesNext || matchesPrev) return el;
    }
    return null;
  }

  // ─────────────────────────────────────────────────
  // Photo 1200 (이전 그대로)
  // ─────────────────────────────────────────────────
  function rewriteToHero(url) {
    if (!url || typeof url !== 'string') return url;
    if (/[?&]w=\d+/.test(url)) {
      return url.replace(/([?&]w=)\d+/, '$1' + HERO_WIDTH);
    }
    return url;
  }

  function upgradePhotoSrc(img) {
    try {
      if (!img || img.tagName !== 'IMG') return;
      if (img.dataset && img.dataset.v364Upgraded) return;
      var src = img.getAttribute('src') || '';
      var newSrc = rewriteToHero(src);
      if (newSrc !== src) {
        img.setAttribute('src', newSrc);
        if (img.dataset) img.dataset.v364Upgraded = '1';
      }
    } catch (_) {}
  }

  function watchPhotos() {
    try {
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === 'childList') {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var node = m.addedNodes[j];
              if (node.nodeType !== 1) continue;
              if (node.tagName === 'IMG') upgradePhotoSrc(node);
              else if (node.querySelectorAll) {
                var inner = node.querySelectorAll('img');
                for (var k = 0; k < inner.length; k++) upgradePhotoSrc(inner[k]);
              }
            }
          } else if (m.type === 'attributes' && m.target && m.target.tagName === 'IMG' && m.attributeName === 'src') {
            if (m.target.dataset && m.target.dataset.v364Upgraded) {
              delete m.target.dataset.v364Upgraded;
            }
            upgradePhotoSrc(m.target);
          }
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['src'],
      });
    } catch (_) {}
  }

  function upgradeAllPhotos() {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) upgradePhotoSrc(imgs[i]);
  }

  function init() {
    injectCSS();
    upgradeAllPhotos();
    watchPhotos();
    // capture: true — 다른 listener 보다 먼저 실행 + preventDefault 효과 보장
    try {
      document.addEventListener('touchstart', onTouchStartCapture, { passive: true, capture: true });
      document.addEventListener('touchmove', onTouchMoveCapture, { passive: false, capture: true });
      document.addEventListener('touchend', onTouchEndCapture, { passive: true, capture: true });
      // window level 도 추가 (일부 브라우저용)
      window.addEventListener('touchmove', onTouchMoveCapture, { passive: false, capture: true });
    } catch (_) {}
    log('v3 installed (pull-refresh nuclear + img swipe robust + photo 1200)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
