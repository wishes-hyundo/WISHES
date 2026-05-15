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
      // [사장님 명령 2026-05-15] 만기 badge + descendants (v369 X 버튼 포함) 영구 차단
      '#ws-expiry-badge,',
      '#ws-expiry-badge *,',
      '[data-v369-close] { display: none !important; visibility: hidden !important; }',
      // 종 알림 + 큰글씨 toggle hide
      'button[aria-label*="알림"] { display: none !important; }',
      '.senior-toggle { display: none !important; }',
      // [사장님 명령 2026-05-15] ⋮ floating toggle 영구 제거 (떠다니며 본 페이지 가림)
      '#ws-v372-toggle,',
      '#ws-v372-toggle-btn,',
      '[data-v372-toggle],',
      '.ws-v372-toggle,',
      '.ws-tools-toggle,',
      '.ws-floating-toggle { display: none !important; }',
      // expanded class 도 무력화
      'body.ws-tools-expanded #ws-expiry-badge,',
      'body.ws-tools-expanded button[aria-label*="알림"],',
      'body.ws-tools-expanded .senior-toggle { display: none !important; }'
    ].join('\n');
    document.head.appendChild(style);
    try { console.log('[v371-badge-hide] 3 floating UI hidden'); } catch (_) {}
  }
  // [사장님 명령 2026-05-15] JS 로 element 자체 제거 (CSS hide + DOM removal)
  function removeBadgeElements() {
    try {
      var badge = document.getElementById('ws-expiry-badge');
      if (badge) badge.remove();
      var bells = document.querySelectorAll('button[aria-label*="알림"]');
      bells.forEach(function (b) { try { b.remove(); } catch (_) {} });
      var toggles = document.querySelectorAll('.senior-toggle, #ws-v372-toggle, #ws-v372-toggle-btn, [data-v372-toggle]');
      toggles.forEach(function (t) { try { t.remove(); } catch (_) {} });
    } catch (_) {}
  }

  function setup() {
    injectCSS();
    removeBadgeElements();
    // MutationObserver — 다른 patch 가 이 element 재생성 시도하면 즉시 제거
    try {
      var obs = new MutationObserver(function () { removeBadgeElements(); });
      obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
