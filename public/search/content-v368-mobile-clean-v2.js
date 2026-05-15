/**
 * v368 — 모바일 UI clean v2 + PTR 실제 scroll container
 * 사장님 명령 2026-05-14.
 *
 * v367 의 한계 발견 + v368 fix:
 *
 * 1) v367 의 selector 가 부정확:
 *    - 만료 임박 badge = #ws-expiry-badge (ID 있음, inline-style position:fixed)
 *    - 도구 = .wp-tools-btn (ws-tool-btn 아님)
 *    - 큰 글씨 = .senior-toggle
 *    - 종 알림 = button[aria-label*="알림"]
 *
 * 2) v367 의 PTR 이 작동 안 함:
 *    - body 가 overflow: hidden (v364 v3 잔재) — window.scrollY 항상 0
 *    - 실제 scroll container = #ws-search-overlay (scrollHeight 4106, clientHeight 855)
 *    - PTR 은 #ws-search-overlay 의 scrollTop 기준으로 판단해야 함
 *
 * v368 변경:
 *
 * 1) 만료 임박 badge dismissible:
 *    - 우상단 X 닫기 버튼 추가
 *    - 클릭 시 localStorage 에 'ws_expiry_badge_dismissed' 저장
 *    - 다음 로드 시 자동 숨김
 *    - 화면 좁을 때 (모바일 ≤ 768px) 작게
 *
 * 2) PTR 표준 동작 — 실제 scroll container 사용:
 *    - #ws-search-overlay 의 scrollTop 기준
 *    - scrollTop <= 3 + pull-down 120px → location.reload()
 *
 * 3) 모바일 (≤768px) 에서 floating buttons 작게:
 *    - .wp-tools-btn opacity 0.85
 *    - .senior-toggle scale 0.85
 *    - 알림 button 28x28
 *
 * 회귀 회피:
 *    - v367 등록 그대로 둠 (v367 의 CSS 일부 selector 가 안 맞아도 무해)
 *    - v368 은 v367 위에 누적 적용 (좀 더 정확한 fix)
 *    - 새 파일 — 기존 안 건드림
 */
(function () {
  'use strict';
  if (window.__WS_V368_MOBILE_CLEAN_V2__) return;
  window.__WS_V368_MOBILE_CLEAN_V2__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  function log() {
    if (!DEBUG) return;
    var args = ['[v368-mobile-clean-v2]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  var BADGE_DISMISS_KEY = 'ws_expiry_badge_dismissed';

  // ─────────────────────────────────────────────────────────
  // Part A: 만료 임박 badge dismissible
  // ─────────────────────────────────────────────────────────
  function isBadgeDismissed() {
    try { return localStorage.getItem(BADGE_DISMISS_KEY) === '1'; } catch (_) { return false; }
  }
  function setBadgeDismissed() {
    try { localStorage.setItem(BADGE_DISMISS_KEY, '1'); } catch (_) {}
  }

  function decorateBadge(badge) {
    if (!badge || badge.__v368_decorated) return;
    badge.__v368_decorated = true;

    // If already dismissed in localStorage, hide immediately
    if (isBadgeDismissed()) {
      badge.style.display = 'none';
      log('badge hidden (dismissed previously)');
      return;
    }

    // Add close button
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.title = '닫기 (다시 안 보기)';
    closeBtn.style.cssText = [
      'position: absolute',
      'top: 2px',
      'right: 4px',
      'background: transparent',
      'border: none',
      'color: rgb(133, 100, 4)',
      'font-size: 18px',
      'font-weight: 700',
      'line-height: 18px',
      'cursor: pointer',
      'padding: 0 4px',
      'margin: 0',
      'opacity: 0.7',
    ].join(';');
    closeBtn.addEventListener('mouseenter', function () { closeBtn.style.opacity = '1'; });
    closeBtn.addEventListener('mouseleave', function () { closeBtn.style.opacity = '0.7'; });
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setBadgeDismissed();
      badge.style.transition = 'opacity 0.3s, transform 0.3s';
      badge.style.opacity = '0';
      badge.style.transform = 'translateX(-20px)';
      setTimeout(function () { badge.style.display = 'none'; }, 300);
      log('badge dismissed by user');
    });

    // Need padding-right space for the X
    var currentPaddingRight = parseInt(window.getComputedStyle(badge).paddingRight) || 16;
    badge.style.paddingRight = Math.max(currentPaddingRight, 24) + 'px';
    badge.style.position = badge.style.position || 'fixed';  // ensure positioning context

    badge.appendChild(closeBtn);
    log('badge decorated with close button');
  }

  function ensureBadgeWatched() {
    var badge = document.getElementById('ws-expiry-badge');
    if (badge) {
      decorateBadge(badge);
      return;
    }
    // If badge not yet created, watch for it
    var observer = new MutationObserver(function (mutations) {
      var b = document.getElementById('ws-expiry-badge');
      if (b) {
        decorateBadge(b);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { observer.disconnect(); }, 30000);  // give up after 30s
  }

  // ─────────────────────────────────────────────────────────
  // Part B: CSS for mobile small UI (correct selectors)
  // ─────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ws-v368-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v368-style';
    style.textContent = [
      // 모바일 (max-width: 768px) — floating buttons 작게
      '@media (max-width: 768px) {',
      '  #ws-expiry-badge {',
      '    font-size: 10px !important;',
      '    padding: 6px 24px 6px 10px !important;',
      '    max-height: 28px !important;',
      '  }',
      '  .wp-tools-btn {',
      '    opacity: 0.85 !important;',
      '    font-size: 11px !important;',
      '    padding: 4px 8px !important;',
      '  }',
      '  .senior-toggle {',
      '    transform: scale(0.85) !important;',
      '    transform-origin: bottom right !important;',
      '  }',
      '  button[aria-label*="알림"] {',
      '    width: 32px !important;',
      '    height: 32px !important;',
      '  }',
      '}',
      // 매우 좁은 (≤480px) — 더 작게
      '@media (max-width: 480px) {',
      '  #ws-expiry-badge {',
      '    font-size: 9px !important;',
      '    padding: 4px 20px 4px 8px !important;',
      '    max-height: 24px !important;',
      '  }',
      '  button[aria-label*="알림"] {',
      '    width: 28px !important;',
      '    height: 28px !important;',
      '  }',
      '}',
    ].join('\n');
    document.head.appendChild(style);
    log('CSS injected');
  }

  // ─────────────────────────────────────────────────────────
  // Part C: PTR (Pull-to-refresh) — 실제 scroll container 사용
  // ─────────────────────────────────────────────────────────
  //
  // 실제 scroll container = #ws-search-overlay (scrollTop 변화)
  // window.scrollY 는 body overflow:hidden 때문에 항상 0 — 사용 불가
  //
  // 표준 PTR 동작:
  //   1. #ws-search-overlay scrollTop > 3 → 콘텐츠 중간 → 어떤 swipe 든 normal scroll
  //   2. scrollTop === 0 + pull-down >= 120px → location.reload()
  //   3. 그 사이 (scrollTop=0 + 작은 pull) → bounce 방지 (preventDefault)

  var PTR_THRESHOLD_PX = 120;
  var PTR_TOP_TOLERANCE_PX = 3;
  var touchStartY = 0;
  var touchStartX = 0;
  var touchStartScrollTop = 0;
  var isPotentialPTR = false;
  var scrollContainer = null;

  function getScrollContainer() {
    if (scrollContainer && document.body.contains(scrollContainer)) return scrollContainer;
    scrollContainer = document.getElementById('ws-search-overlay');
    return scrollContainer;
  }

  function getScrollTop() {
    var c = getScrollContainer();
    if (c) return c.scrollTop || 0;
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  function onTouchStart(e) {
    if (!e.touches || !e.touches[0]) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    touchStartScrollTop = getScrollTop();
    isPotentialPTR = (touchStartScrollTop <= PTR_TOP_TOLERANCE_PX);
  }

  function onTouchMove(e) {
    if (!e.touches || !e.touches[0]) return;
    if (!isPotentialPTR) return;
    var dy = e.touches[0].clientY - touchStartY;
    var dx = e.touches[0].clientX - touchStartX;
    // pull-down 만 처리 (수직 + 아래로)
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      // 이미 #ws-search-overlay 가 scrollTop=0 — 더 끌리지 않도록 bounce 방지
      if (e.cancelable) e.preventDefault();
    }
  }

  function onTouchEnd(e) {
    if (!isPotentialPTR) return;
    var endY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : touchStartY;
    var dy = endY - touchStartY;
    var scrollTop = getScrollTop();

    if (dy >= PTR_THRESHOLD_PX && scrollTop <= PTR_TOP_TOLERANCE_PX) {
      log('PTR trigger — refresh (dy=' + dy + 'px, scrollTop=' + scrollTop + ')');
      try { location.reload(); } catch (_) {}
    }
    isPotentialPTR = false;
  }

  function bindPTR() {
    // Bind to document AND to scroll container if available
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    log('PTR bound (threshold=' + PTR_THRESHOLD_PX + 'px, container=#ws-search-overlay)');
  }

  function init() {
    injectCSS();
    ensureBadgeWatched();
    // [2026-05-14 사장님 명령]: PTR 너무 예민 → 비활성화. 브라우저 native PTR 도
    // globals.css 의 overscroll-behavior:none 으로 차단됨.
    // bindPTR();  // disabled
    log('installed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
