/**
 * v371 — 만료 badge + 종 알림 + 큰글씨 토글 모두 default 숨김
 * 사장님 명령 2026-05-14.
 *
 * 사장님 호소: "만기 종료 아이콘만 하냐고 전체 내매물 + 종 알림 + 큰글씨 변경 아이콘은?"
 *
 * v371 결정: floating UI 3개 (만기 임박 badge + 종 알림 + 큰글씨 토글) 다 default 숨김
 *   - 사용자가 필요 시 다른 경로로 접근
 *   - 매물 검색에 방해 되는 floating 0
 *
 * 회귀 회피: 새 파일, v370 그대로 유지
 */
(function () {
  'use strict';
  if (window.__WS_V371_BADGE_HIDE__) return;
  window.__WS_V371_BADGE_HIDE__ = true;
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;
  function injectCSS() {
    if (document.getElementById('ws-v371-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v371-style';
    style.textContent = [
      '#ws-expiry-badge { display: none !important; }',
      'button[aria-label*="알림"] { display: none !important; }',
      '.senior-toggle { display: none !important; }'
    ].join('\n');
    document.head.appendChild(style);
    try { console.log('[v371-badge-hide] 3 floating UI hidden'); } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  } else {
    injectCSS();
  }
})();
