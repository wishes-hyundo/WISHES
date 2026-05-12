/**
 * v364 v2 — Photo uniform 1200px + mobile swipe (robust) + pull-to-refresh hard block
 * 사장님 명령 2026-05-12.
 *
 * v2 변경:
 *   - Pull-to-refresh: CSS 만으로 부족 → touchmove preventDefault (scrollY===0 + deltaY>0)
 *   - Lightbox swipe: selector 매칭 안 됨 → e.target IMG 큰 사진 위에서 swipe 자동 감지
 *     (img.naturalWidth>800 또는 displayed>300 인 사진 위 swipe → 좌/우 버튼 click)
 *
 * 회귀 회피:
 *   - 새 파일 → 기존 patch 안 건드림
 *   - touchmove non-passive 가 필요 (preventDefault 위해)
 *   - target IMG 검사 → 다른 element swipe 무관
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
    var args = ['[v364-photo-mobile-v2]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  // ─────────────────────────────────────────────────
  // C) Pull-to-refresh HARD BLOCK
  // ─────────────────────────────────────────────────
  var touchStartY = 0;
  var touchStartX = 0;
  var touchStartTime = 0;
  var touchTargetIsImg = false;

  function onTouchStart(e) {
    if (!e.touches || e.touches.length !== 1) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    touchStartTime = Date.now();
    var t = e.target;
    touchTargetIsImg = !!(t && t.tagName === 'IMG');
  }

  function onTouchMove(e) {
    if (!e.touches || e.touches.length !== 1) return;
    var dy = e.touches[0].clientY - touchStartY;
    var dx = e.touches[0].clientX - touchStartX;
    var scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    // 페이지 top 이고 아래로 당기는 경우 → pull-to-refresh 차단
    if (scrollY === 0 && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      e.preventDefault();
      return;
    }
    // 사진 위에서 수평 swipe — 수평 우세 시 default scroll 차단 (수직 page scroll 와 충돌 방지)
    if (touchTargetIsImg && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      // 사진 위에서 수평 swipe → 페이지 scroll 안 함
      e.preventDefault();
    }
  }

  function onTouchEnd(e) {
    if (!e.changedTouches || e.changedTouches.length !== 1) return;
    var dt = Date.now() - touchStartTime;
    if (dt > SWIPE_TIME_MAX_MS) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    // 사진 위 swipe 만 처리
    if (!touchTargetIsImg) return;
    // 큰 사진 위에서만 (썸네일 작은 사진은 무관)
    var target = e.target;
    if (target && target.tagName === 'IMG') {
      var rect = target.getBoundingClientRect();
      if (rect.width < BIG_IMG_MIN_WIDTH) return;
    }
    var direction = dx < 0 ? 'next' : 'prev';
    var btn = findNavButton(direction);
    if (btn) {
      try {
        btn.click();
        log('swipe', direction, 'clicked nav button');
      } catch (_) {}
    } else {
      log('swipe', direction, 'no nav button found');
    }
  }

  function findNavButton(direction) {
    // 광범위 검색: button, div, span 모두 가능
    var candidates = document.querySelectorAll('button, div, span, [role="button"]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.offsetParent === null) continue; // 안 보이는 element skip
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
  // A) 사진 1200px 균등 (이전 v1 그대로)
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

  // ─────────────────────────────────────────────────
  // CSS: pull-to-refresh CSS (보조)
  // ─────────────────────────────────────────────────
  function injectCSS() {
    try {
      var style = document.createElement('style');
      style.setAttribute('data-v364', 'mobile-ux');
      style.textContent = [
        'html, body { overscroll-behavior-y: contain !important; }',
        '@media (max-width: 768px) {',
        '  html, body {',
        '    overscroll-behavior: contain !important;',
        '    -webkit-overflow-scrolling: touch;',
        '  }',
        '}',
      ].join('\n');
      document.head.appendChild(style);
    } catch (_) {}
  }

  function init() {
    injectCSS();
    upgradeAllPhotos();
    watchPhotos();
    // touchstart/move/end — non-passive for preventDefault
    try {
      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd, { passive: true });
    } catch (_) {}
    log('v2 installed (pull-refresh hard block + img swipe robust + photo 1200)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
