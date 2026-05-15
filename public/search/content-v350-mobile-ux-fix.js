/**
 * content-v350-mobile-ux-fix.js (2026-05-11)
 *
 * Fix 40 (사장님 명령 모바일 발견):
 *   1. 아래 스크롤 시 새로고침 (pull-to-refresh) - PTR 차단 필요
 *   2. 아래 스크롤 안 됨 - touch-action 또는 overflow 차단 해제
 *   3. 사진 확대 시 swipe 제스처 X - lightbox 에 touch swipe 좌/우 추가
 *
 * I-USER-EXP-1 준수: 사용자 한 일 0, 자동 적용.
 *
 * Fix 내용:
 *   A. CSS 강제 (가장 outer style — !important 모든 inner 덮어씀)
 *      - html, body: overscroll-behavior: none (PTR 차단)
 *      - .ws-mobile-page: touch-action: manipulation, overflow-y: auto
 *   B. v247 lightbox touch swipe 좌/우 — 다음/이전 사진
 *   C. visibility change 시 css 재주입 (mobile browser quirk)
 *
 * 위험 매우 낮음:
 *   - CSS 만 강제 (functional 코드 변경 X)
 *   - lightbox swipe 는 기존 화살표 핸들러 재사용
 *   - 모든 사용자 자동 적용
 */
(function () {
  'use strict';
  if (window.__WS_V350_MOBILE_UX__) return;
  window.__WS_V350_MOBILE_UX__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // ────────────────────────────────────────────────────────────
  // A. CSS 강제 — PTR 차단 + scroll 보장
  // ────────────────────────────────────────────────────────────
  function injectMobileCss() {
    if (document.getElementById('v350-mobile-css')) return;
    var css = [
      'html, body {',
      // [2026-05-14 사장님 명령] overscroll-behavior 제거 — 브라우저 native PTR 살림
      // '  overscroll-behavior: none !important;',
      // '  overscroll-behavior-y: none !important;',
      '  overflow-x: hidden !important;',
      '  overflow-y: auto !important;',
      '}',
      '.ws-mobile-page, #ws-search-root, .ws-search-container {',
      '  touch-action: manipulation !important;',
      // [2026-05-14 사장님 명령] overscroll-behavior 제거
      // '  overscroll-behavior: contain !important;',
      '  overflow-y: visible !important;',
      '}',
      '/* Lightbox swipe area — pinch zoom 가능 + swipe 가능 */',
      '#v247-lightbox {',
      '  touch-action: pan-y pinch-zoom !important;',
      '}',
      '#v247-lightbox .v247-img {',
      '  touch-action: pan-y pinch-zoom !important;',
      '  user-select: none;',
      '  -webkit-user-drag: none;',
      '}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'v350-mobile-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  injectMobileCss();

  // Re-inject on visibility change (some mobile browsers drop styles)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      setTimeout(injectMobileCss, 100);
    }
  });

  // ────────────────────────────────────────────────────────────
  // B. v247 lightbox touch swipe — 좌/우 사진 navigation
  // ────────────────────────────────────────────────────────────
  function attachLightboxSwipe() {
    // MutationObserver 로 #v247-lightbox 등장 감지
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.id === 'v247-lightbox') {
            setupSwipe(n);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: false });
  }

  function setupSwipe(lightbox) {
    if (lightbox.__v350SwipeAttached) return;
    lightbox.__v350SwipeAttached = true;

    var startX = 0;
    var startY = 0;
    var startTime = 0;
    var SWIPE_MIN_DISTANCE = 50;
    var SWIPE_MAX_TIME = 500;
    var SWIPE_MAX_Y_DRIFT = 100;

    lightbox.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
    }, { passive: true });

    lightbox.addEventListener('touchend', function (e) {
      var t = e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - startX;
      var dy = Math.abs(t.clientY - startY);
      var dt = Date.now() - startTime;

      if (dt > SWIPE_MAX_TIME) return;
      if (dy > SWIPE_MAX_Y_DRIFT) return;
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return;

      // 좌 swipe → 다음 사진, 우 swipe → 이전 사진
      var btn = dx < 0
        ? lightbox.querySelector('.v247-next')
        : lightbox.querySelector('.v247-prev');
      if (btn) {
        btn.click();
      }
    }, { passive: true });

    try { console.log('[v350] lightbox swipe attached'); } catch (_) {}
  }

  attachLightboxSwipe();

  try { console.log('[v350-mobile-ux-fix] active'); } catch (_) {}
})();
