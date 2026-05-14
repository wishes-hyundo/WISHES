/**
 * v376 — 큰글씨 모드 (.senior-toggle) 완전 제거
 * 사장님 명령 2026-05-14.
 * 쓸모 없음 → display:none 영구.
 */
(function () {
  'use strict';
  if (window.__WS_V376_REMOVE_SENIOR__) return;
  window.__WS_V376_REMOVE_SENIOR__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;
  function inject() {
    if (document.getElementById('ws-v376-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v376-style';
    style.textContent = '.senior-toggle { display: none !important; }';
    document.head.appendChild(style);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
