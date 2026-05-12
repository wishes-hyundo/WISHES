/**
 * v364 — Photo uniform 1200px + mobile swipe + pull-to-refresh prevention
 * 사장님 명령 2026-05-12.
 *
 * 3가지 기능 통합:
 *   A) lightbox 사진 모두 1200px 균등 (v342 의 THUMB 400 → HERO 1200 후처리)
 *   B) 모바일 swipe 제스처 (lightbox 좌/우 슬라이드로 사진 넘기기)
 *   C) 모바일 pull-to-refresh 방지 (CSS overscroll-behavior)
 *
 * 회귀 회피:
 *   - v342 그대로 두고 후처리만 함 (v342 결과 url 을 ?w=400 → ?w=1200 으로 변경)
 *   - 새 파일 → 기존 patch 안 건드림
 *   - fetch wrap 0, setInterval 0
 *   - MutationObserver 로 lightbox 사진 src 변경 감지 → 1200 강제
 *
 * 안전 가드:
 *   - 모든 try/catch 안전 처리
 *   - 등록 안 하면 prod 영향 0
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
  var SWIPE_TIME_MAX_MS = 500;

  function log() {
    if (!DEBUG) return;
    var args = ['[v364-photo-mobile]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  // ─────────────────────────────────────────────────
  // C) pull-to-refresh 방지 (CSS overscroll-behavior)
  // ─────────────────────────────────────────────────
  function preventPullRefresh() {
    try {
      var styleEl = document.createElement('style');
      styleEl.setAttribute('data-v364', 'pull-refresh');
      styleEl.textContent = [
        'html, body {',
        '  overscroll-behavior-y: contain;',
        '}',
        '@media (max-width: 768px) {',
        '  html, body {',
        '    overscroll-behavior: contain;',
        '    -webkit-overflow-scrolling: touch;',
        '  }',
        '}',
      ].join('\n');
      document.head.appendChild(styleEl);
      log('CSS: pull-to-refresh prevented');
    } catch (e) {
      log('CSS err:', e && e.message);
    }
  }

  // ─────────────────────────────────────────────────
  // A) 사진 모두 1200px 균등
  // ─────────────────────────────────────────────────
  function rewriteToHero(url) {
    if (!url || typeof url !== 'string') return url;
    // ?w=400 (or 1920/etc) → ?w=1200
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
    } catch (e) {}
  }

  function upgradeLightboxPhotos() {
    try {
      // 자주 사용되는 lightbox 패턴들
      var selectors = [
        '.ws-gallery-main img',
        '.ws-lightbox img',
        '.ws-modal img',
        '.ws-detail img',
        '[class*="lightbox" i] img',
        '[class*="gallery" i] img',
        '[class*="modal" i] img',
      ];
      for (var i = 0; i < selectors.length; i++) {
        var imgs = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < imgs.length; j++) {
          upgradePhotoSrc(imgs[j]);
        }
      }
    } catch (e) {
      log('upgrade photos err:', e && e.message);
    }
  }

  // MutationObserver: lightbox 새로 열릴 때 또는 사진 변경 시 upgrade
  function watchPhotos() {
    try {
      var observer = new MutationObserver(function (mutations) {
        var needUpgrade = false;
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === 'childList') {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var node = m.addedNodes[j];
              if (node.nodeType === 1) {
                if (node.tagName === 'IMG') { upgradePhotoSrc(node); }
                else if (node.querySelectorAll) {
                  var inner = node.querySelectorAll('img');
                  for (var k = 0; k < inner.length; k++) upgradePhotoSrc(inner[k]);
                }
              }
            }
          } else if (m.type === 'attributes' && m.target && m.target.tagName === 'IMG' && m.attributeName === 'src') {
            // src 가 변경된 경우 (lightbox 다음 사진 등)
            // 단, v364 가 set 한 src 는 다시 처리 안 함 (dataset.v364Upgraded)
            if (m.target.dataset && m.target.dataset.v364Upgraded) {
              delete m.target.dataset.v364Upgraded;
              upgradePhotoSrc(m.target);
            } else {
              upgradePhotoSrc(m.target);
            }
          }
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src'],
      });
      log('MutationObserver: photo upgrade');
    } catch (e) {
      log('observer err:', e && e.message);
    }
  }

  // ─────────────────────────────────────────────────
  // B) 모바일 swipe 제스처 (lightbox 좌/우)
  // ─────────────────────────────────────────────────
  function findLightboxContainer() {
    // 자주 사용되는 lightbox 컨테이너 selector
    var selectors = [
      '.ws-gallery-main',
      '.ws-lightbox',
      '.ws-photo-modal',
      '[class*="lightbox" i]',
      '[class*="gallery" i]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.offsetParent !== null) return el; // visible 만
    }
    return null;
  }

  function findNavButton(direction) {
    // direction: 'next' | 'prev'
    var allBtns = document.querySelectorAll('button, .ws-nav-btn, [class*="nav" i]');
    for (var i = 0; i < allBtns.length; i++) {
      var btn = allBtns[i];
      var text = (btn.textContent || '').trim();
      var aria = btn.getAttribute('aria-label') || '';
      var cls = (btn.className || '').toLowerCase();
      if (direction === 'next') {
        if (text === '›' || text === '→' || /next|다음/.test(aria) || /next/.test(cls)) {
          if (btn.offsetParent !== null) return btn;
        }
      } else {
        if (text === '‹' || text === '←' || /prev|이전/.test(aria) || /prev/.test(cls)) {
          if (btn.offsetParent !== null) return btn;
        }
      }
    }
    return null;
  }

  function attachSwipeListeners() {
    var touchStartX = 0, touchStartY = 0, touchStartTime = 0;
    var swipeActive = false;

    document.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      // lightbox 또는 사진 element 안에서만 활성화
      var target = e.target;
      var inLightbox = !!(target && (target.closest && (
        target.closest('.ws-gallery-main') ||
        target.closest('.ws-lightbox') ||
        target.closest('.ws-photo-modal') ||
        target.closest('[class*="lightbox" i]') ||
        target.closest('[class*="gallery" i]')
      )));
      if (!inLightbox) return;
      swipeActive = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!swipeActive) return;
      swipeActive = false;
      if (!e.changedTouches || e.changedTouches.length !== 1) return;
      var endX = e.changedTouches[0].clientX;
      var endY = e.changedTouches[0].clientY;
      var dt = Date.now() - touchStartTime;
      if (dt > SWIPE_TIME_MAX_MS) return;
      var dx = endX - touchStartX;
      var dy = endY - touchStartY;
      // 수직 보다 수평이 더 커야 swipe
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) return;
      // 좌 → 우 = prev, 우 → 좌 = next
      var direction = dx < 0 ? 'next' : 'prev';
      var btn = findNavButton(direction);
      if (btn) {
        try {
          btn.click();
          log('swipe', direction, 'triggered');
        } catch (err) {}
      }
    }, { passive: true });

    log('mobile swipe listeners attached');
  }

  // ─────────────────────────────────────────────────
  // init
  // ─────────────────────────────────────────────────
  function init() {
    preventPullRefresh();
    upgradeLightboxPhotos();
    watchPhotos();
    attachSwipeListeners();
    log('v364 installed (photo 1200 + mobile swipe + pull-refresh prevent)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
