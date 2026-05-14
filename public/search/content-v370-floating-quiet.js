/**
 * v370 — 모든 viewport (PC 포함) 에서 floating UI 가리지 않게
 * 사장님 명령 2026-05-14.
 *
 * 발견된 v367/v368/v369 의 한계:
 *   - CSS 가 @media (max-width: 768px) 안에만 있어서 PC 1280px+ 환경에서 적용 0
 *   - badge 가 좌상단 (top:80, left:20, 140x42) 그대로 시/도 버튼 / 탭 가림
 *   - v369 X 버튼 작동하지만 사장님이 매번 X 안 누름 → 매 reload 마다 다시 보임
 *
 * v370 변경 (모든 viewport 공통):
 *   1. badge — 좌하단 (bottom:80, left:10) 으로 위치 변경 → 시/도 버튼 + 탭 안 가림
 *      + 작게 (font-size 11px, padding 4px 24px 4px 10px)
 *      + 5초 후 자동 opacity 0.25 (hover 시 1 복귀)
 *   2. bell — 36x36 으로 축소 + opacity 0.85 (hover 1)
 *   3. senior-toggle — 이미 0.55 + scale 작음, 변경 없음
 *   4. wp-tools-btn — 위치 그대로
 *
 * 회귀 회피:
 *   - 새 파일 — v367/v368/v369 그대로 유지
 *   - v369 X 닫기 버튼 그대로 작동 (사장님이 영구 dismiss 원하면)
 *   - position fixed override 만, content 안 건드림
 */
(function () {
  'use strict';
  if (window.__WS_V370_FLOATING_QUIET__) return;
  window.__WS_V370_FLOATING_QUIET__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  function log() {
    if (!DEBUG) return;
    var args = ['[v370-floating-quiet]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────
  // CSS — 모든 viewport (PC 포함) 적용
  // ─────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ws-v370-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v370-style';
    style.textContent = [
      '#ws-expiry-badge {',
      '  top: auto !important;',
      '  bottom: 80px !important;',
      '  left: 10px !important;',
      '  right: auto !important;',
      '  font-size: 11px !important;',
      '  padding: 4px 24px 4px 10px !important;',
      '  max-height: 28px !important;',
      '  line-height: 18px !important;',
      '  opacity: 1;',
      '  transition: opacity 0.6s ease-in-out !important;',
      '}',
      '#ws-expiry-badge.v370-dimmed {',
      '  opacity: 0.25 !important;',
      '}',
      '#ws-expiry-badge:hover {',
      '  opacity: 1 !important;',
      '}',
      'button[aria-label*="알림"] {',
      '  width: 36px !important;',
      '  height: 36px !important;',
      '  opacity: 0.85 !important;',
      '  transition: opacity 0.2s !important;',
      '}',
      'button[aria-label*="알림"]:hover {',
      '  opacity: 1 !important;',
      '}',
      '.senior-toggle {',
      '  transform: scale(0.75) !important;',
      '  transform-origin: bottom right !important;',
      '  opacity: 0.55 !important;',
      '  transition: opacity 0.2s !important;',
      '}',
      '.senior-toggle:hover {',
      '  opacity: 1 !important;',
      '}',
      '.wp-tools-btn {',
      '  opacity: 0.85 !important;',
      '  transition: opacity 0.2s !important;',
      '}',
      '.wp-tools-btn:hover {',
      '  opacity: 1 !important;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
    log('CSS injected');
  }

  function setupBadgeAutoDim() {
    var dimTimer = null;
    function start() {
      var b = document.getElementById('ws-expiry-badge');
      if (!b) return false;
      clearTimeout(dimTimer);
      b.classList.remove('v370-dimmed');
      dimTimer = setTimeout(function () {
        var b2 = document.getElementById('ws-expiry-badge');
        if (b2) {
          b2.classList.add('v370-dimmed');
          log('badge auto-dimmed after 5s');
        }
      }, 5000);
      return true;
    }
    if (start()) return;
    var obs = new MutationObserver(function () {
      if (start()) {
        try { obs.disconnect(); } catch (_) {}
      }
    });
    try {
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { try { obs.disconnect(); } catch (_) {} }, 30000);
    } catch (_) {}
  }

  function init() {
    injectCSS();
    setupBadgeAutoDim();
    log('installed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
