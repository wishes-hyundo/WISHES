/**
 * v377 — 만기 임박 badge 를 종 알림 옆 inline 으로 통합
 * 사장님 명령 2026-05-14.
 *
 * 좌상단 fixed floating badge (#ws-expiry-badge) → 종 알림 button 직전 inline insert.
 * 좌상단 완전 비움 + 종 알림 옆에 만기 카운트 같이 표시.
 *
 * 변경:
 *   - badge: position static, font-size 11px, padding 4px 10px, max-height 28px
 *   - bell button 의 부모 container 안에 insertBefore(badge, bell)
 *   - X 닫기 버튼은 그대로 (v369 호환)
 */
(function () {
  'use strict';
  if (window.__WS_V377_EXPIRY_INTO_BELL__) return;
  window.__WS_V377_EXPIRY_INTO_BELL__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var attempted = 0;
  function attach() {
    attempted++;
    var badge = document.getElementById('ws-expiry-badge');
    var bell = document.querySelector('button[aria-label*="알림"]');
    if (!badge || !bell) {
      if (attempted < 40) setTimeout(attach, 500);
      return;
    }
    if (badge.__v377_attached) return;
    badge.__v377_attached = true;

    // fixed 해제 → inline
    badge.style.setProperty('position', 'static', 'important');
    badge.style.setProperty('top', 'auto', 'important');
    badge.style.setProperty('left', 'auto', 'important');
    badge.style.setProperty('right', 'auto', 'important');
    badge.style.setProperty('bottom', 'auto', 'important');
    badge.style.setProperty('display', 'inline-flex', 'important');
    badge.style.setProperty('align-items', 'center', 'important');
    badge.style.setProperty('vertical-align', 'middle', 'important');
    badge.style.setProperty('margin-right', '8px', 'important');
    badge.style.setProperty('font-size', '11px', 'important');
    badge.style.setProperty('padding', '4px 10px', 'important');
    badge.style.setProperty('max-height', '28px', 'important');
    badge.style.setProperty('line-height', '20px', 'important');
    badge.style.setProperty('white-space', 'nowrap', 'important');

    // 종 button 직전에 inline 삽입
    var container = bell.parentElement;
    if (container) {
      container.insertBefore(badge, bell);
      try { console.log('[v377-expiry-into-bell] badge inserted before bell'); } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
