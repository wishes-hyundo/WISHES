/**
 * v373 — 좋은 layout 재배치
 * 사장님 명령 2026-05-14.
 *
 * 사장님 호소: 좌상단 전체/내매물 탭 + 우상단 ⋮ 둘 다 검색 영역 가림.
 * "전부 활용하기 좋게 배치좌좌".
 *
 * v373 재배치:
 *   1. #ws-v294-scope-root (전체/내매물 탭) — 좌상단 floating → 검색바 row 안 inline
 *      (top:12, left:160 — WISHES 매물검색 타이틀 우측 옆)
 *      검색 input 좌측 끝과 같은 row → 자연스러움 + 자주 처다볼 수 있음
 *   2. #ws-v372-toggle (⋮ 토글) — 우상단 → 우하단 도구 좌측
 *      (bottom:8, right:105 — 도구 버튼 좌측 옆)
 *      검색 영역 절대 안 가림
 *
 * 회귀 회피:
 *   새 파일, v294/v371/v372 그대로 유지. CSS override 만.
 */
(function () {
  'use strict';
  if (window.__WS_V373_LAYOUT__) return;
  window.__WS_V373_LAYOUT__ = true;
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function injectCSS() {
    if (document.getElementById('ws-v373-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v373-style';
    style.textContent = [
      // 전체/내매물 탭 — 검색바 row 안 inline
      '#ws-v294-scope-root {',
      '  top: 12px !important;',
      '  left: 160px !important;',
      '  right: auto !important;',
      '  bottom: auto !important;',
      '  z-index: 1000001 !important;',
      '}',
      // ⋮ 토글 — 우하단 도구 좌측
      '#ws-v372-toggle {',
      '  top: auto !important;',
      '  bottom: 8px !important;',
      '  right: 105px !important;',
      '  left: auto !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
    try { console.log('[v373-layout-reposition] scope+toggle repositioned'); } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  } else {
    injectCSS();
  }
})();
