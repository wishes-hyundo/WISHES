/**
 * v374 v3 — 단순 CSS only fix (JS 동적 폐기)
 * 사장님 명령 2026-05-14.
 *
 * v374 v1/v2 버그: JS reposition 이 viewport scroll race condition 으‍로 잘못된 좌표 (음수) set.
 * v374 v3: 단순 viewport-fixed top:사장님 환경 고정 — 검색결과 영역 위치
 *   - scope-root: bottom: 145px (viewport 바닥으로다 구조 145px 위)
 *   - ⋮ toggle: bottom: 145px
 *   - 명닝 키 때‍ 검색결과 행과 같은 vertical 위치
 *
 * 검색바 ≡ 상단 (top 0) 공유/도구 ≡ 우하단 (bottom 우측 모서리) — 둘 다 안 가림.
 */
(function () {
  'use strict';
  if (window.__WS_V374_RESULT_ROW__) return;
  window.__WS_V374_RESULT_ROW__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function injectCSS() {
    if (document.getElementById('ws-v374-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v374-style';
    style.textContent = [
      '#ws-v294-scope-root {',
      '  position: fixed !important;',
      '  top: auto !important;',
      '  bottom: 145px !important;',
      '  left: 180px !important;',
      '  right: auto !important;',
      '  z-index: 1000001 !important;',
      '}',
      '#ws-v372-toggle {',
      '  position: fixed !important;',
      '  top: auto !important;',
      '  bottom: 148px !important;',
      '  right: 400px !important;',
      '  left: auto !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
    try { console.log('[v374-result-row-position v3] CSS-only fix installed'); } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  } else {
    injectCSS();
  }
})();
