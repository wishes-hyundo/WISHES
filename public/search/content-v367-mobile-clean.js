/**
 * v367 — 모바일 UI clean-up + pull-to-refresh 표준 동작
 * 사장님 명령 2026-05-14.
 *
 * 두 가지 fix:
 *
 * 1) UI 겹침:
 *    - "만료 임박 174건" 오렌지 badge — 현재 absolute 로 떠 있어 콘텐츠 가림
 *      → 모바일 에서는 작게 만들거나 dismissible 처리
 *    - 종 알림 icon (top right) — 동일
 *    - 글씨크기 icon / 도구 버튼 (bottom right) — 모바일 에서 작게
 *
 * 2) Pull-to-refresh 표준 동작:
 *    - 현재 v364 v3 은 ALL pull 차단 → 사장님 의도 와 다름
 *    - 표준 동작: scrollY=0 (최상단) 도달 → 추가 pull-down (>120px) 시에만 refresh
 *    - 그 외 모든 위치 의 swipe up/down 은 normal scroll
 *    - 브라우저 native PTR 은 비활성화 (CSS overscroll-behavior contain) — 우리 가 직접 제어
 *
 * 회귀 회피:
 *    - 새 파일 → 기존 patches 안 건드림
 *    - fetch wrap 0
 *    - 단일 setInterval 도 없음 (pure event-driven)
 */
(function () {
  'use strict';
  if (window.__WS_V367_MOBILE_CLEAN__) return;
  window.__WS_V367_MOBILE_CLEAN__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  function log() {
    if (!DEBUG) return;
    var args = ['[v367-mobile-clean]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────
  // Part A: UI 겹침 해소 (모바일 narrow 에서 floating elements 정리)
  // ─────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ws-v367-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v367-style';
    style.textContent = [
      // 모바일 (max-width: 768px) 에서 floating elements 작게 / 숨김
      '@media (max-width: 768px) {',
      // 만료 임박 badge — 더 작게, 위치 안정화
      '  .ws-expire-badge, [class*="expire-badge"], [class*="만료"] {',
      '    font-size: 10px !important;',
      '    padding: 2px 6px !important;',
      '    max-height: 22px !important;',
      '    line-height: 18px !important;',
      '    z-index: 100 !important;',
      '  }',
      // 종 알림 icon — 작게
      '  .ws-bell, .ws-notification-bell, [class*="bell"], [class*="notif"] {',
      '    width: 32px !important;',
      '    height: 32px !important;',
      '  }',
      // 글씨크기 icon — 모바일 에서 작게',
      '  .ws-font-size, [class*="font-size"], [class*="text-size"] {',
      '    transform: scale(0.85) !important;',
      '    transform-origin: bottom right !important;',
      '  }',
      // 도구 버튼 — 작게 + opacity 50% (notice 보이게)',
      '  .ws-tool-btn, [class*="tool-btn"], .ws-도구 {',
      '    opacity: 0.85 !important;',
      '  }',
      '}',
      '',
      // 매우 좁은 화면 (max-width: 480px, 폴드 등) — 더 적극적
      '@media (max-width: 480px) {',
      '  .ws-expire-badge, [class*="expire-badge"] {',
      '    font-size: 9px !important;',
      '    padding: 1px 4px !important;',
      '    max-height: 18px !important;',
      '  }',
      '  .ws-bell, [class*="bell"] {',
      '    width: 28px !important;',
      '    height: 28px !important;',
      '  }',
      '}',
    ].join('\n');
    document.head.appendChild(style);
    log('UI clean-up CSS injected');
  }

  // ─────────────────────────────────────────────────────────
  // Part B: Pull-to-refresh 표준 동작
  // ─────────────────────────────────────────────────────────
  //
  // 표준 동작 (Twitter/Instagram/iOS Safari 스타일):
  //   1. scrollY > 0 (콘텐츠 중간) → 어떤 swipe 든 normal scroll
  //   2. scrollY === 0 (최상단) + 추가 pull-down (>120px) → refresh
  //   3. 그 사이 (scrollY === 0 + 작은 pull) → elastic bounce, refresh 안 함
  //
  // 구현:
  //   - CSS overscroll-behavior: none 으로 브라우저 native PTR 차단
  //   - touchstart 에서 시작 scrollY 기록
  //   - touchmove 에서 거리 측정 — 임계값 미만 시 default 허용 (scroll), 임계값 초과 시 block
  //   - touchend 에서 임계값 초과 + scrollY 0 시작 시 → 사용자 가 location.reload() 호출

  var PTR_THRESHOLD_PX = 120;        // 120px 이상 pull-down 시 refresh
  var PTR_TOP_TOLERANCE_PX = 3;      // scrollY <= 3 → "최상단"
  var touchStartY = 0;
  var touchStartScrollY = 0;
  var touchStartX = 0;
  var isPotentialPTR = false;

  function injectPTRCSS() {
    if (document.getElementById('ws-v367-ptr-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v367-ptr-style';
    style.textContent = [
      // 브라우저 native PTR 비활성화 — 우리 가 직접 제어
      'html, body {',
      '  overscroll-behavior-y: contain !important;',
      '  overscroll-behavior-x: auto !important;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
    log('PTR control CSS injected');
  }

  function getScrollY() {
    return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function onTouchStart(e) {
    if (!e.touches || !e.touches[0]) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    touchStartScrollY = getScrollY();
    isPotentialPTR = (touchStartScrollY <= PTR_TOP_TOLERANCE_PX);
  }

  function onTouchMove(e) {
    if (!e.touches || !e.touches[0]) return;
    var dy = e.touches[0].clientY - touchStartY;
    var dx = e.touches[0].clientX - touchStartX;
    var scrollY = getScrollY();

    // 1. 콘텐츠 가 최상단 위로 (scrollY 0 / pull-down) — PTR 영역
    if (isPotentialPTR && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      // 작은 pull (< THRESHOLD) → block default (elastic bounce 방지)
      // 큰 pull (>= THRESHOLD) → block AND mark for refresh (touchend 에서 처리)
      if (e.cancelable) e.preventDefault();
      return;
    }

    // 2. 콘텐츠 중간 / 아래 방향 swipe — 정상 scroll 허용 (block 안 함)
  }

  function onTouchEnd(e) {
    if (!isPotentialPTR) return;
    var endY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : touchStartY;
    var dy = endY - touchStartY;
    var scrollY = getScrollY();

    // 표준 PTR 트리거: 시작 시 scrollY=0 + pull-down distance >= THRESHOLD
    if (isPotentialPTR && dy >= PTR_THRESHOLD_PX && scrollY <= PTR_TOP_TOLERANCE_PX) {
      log('PTR trigger — refreshing (dy=' + dy + 'px)');
      // 명시적 refresh — 사장님 의도
      try { location.reload(); } catch (_) {}
    }
    isPotentialPTR = false;
  }

  function init() {
    injectCSS();
    injectPTRCSS();
    // touch events — capture phase 로 다른 patches 보다 먼저 처리
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    log('installed (PTR threshold=' + PTR_THRESHOLD_PX + 'px, top tolerance=' + PTR_TOP_TOLERANCE_PX + 'px)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
