/**
 * v374 — 검색결과 행 영역으‍lo floating UI 이동 (JS 동적)
 * 사장님 명령 2026-05-14.
 * v373 이 검색 input 좌측 + 공유 아이콘 다 가림.
 * v374: scope-root + ⋮ 검색결과 행 (검색바/필터/공유 영역 이외) 으않‍child 이동.
 * JS 동적 조정 — viewport 변경 시 자동 추적.
 */
(function () {
  'use strict';
  if (window.__WS_V374_RESULT_ROW__) return;
  window.__WS_V374_RESULT_ROW__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function findResultEl() {
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var t = (all[i].textContent || '').trim();
      if (/^​?검색결과:\s*\d/.test(t) && all[i].children.length < 5 && (all[i].textContent || '').length < 100) {
        return all[i];
      }
    }
    return null;
  }

  var lastKey = null;
  function reposition() {
    var resultEl = findResultEl();
    if (!resultEl) return;
    var rt = resultEl.getBoundingClientRect();
    if (rt.top === 0 && rt.left === 0) return;
    var key = Math.round(rt.top) + '|' + Math.round(rt.left) + '|' + window.innerWidth;
    if (key === lastKey) return;
    lastKey = key;

    var scope = document.getElementById('ws-v294-scope-root');
    var toggle = document.getElementById('ws-v372-toggle');
    var topPx = Math.round(rt.top - 4) + 'px';

    if (scope) {
      scope.style.setProperty('position', 'fixed', 'important');
      scope.style.setProperty('top', topPx, 'important');
      scope.style.setProperty('left', '180px', 'important');
      scope.style.setProperty('right', 'auto', 'important');
      scope.style.setProperty('bottom', 'auto', 'important');
      scope.style.setProperty('z-index', '1000001', 'important');
    }
    if (toggle) {
      toggle.style.setProperty('position', 'fixed', 'important');
      toggle.style.setProperty('top', topPx, 'important');
      toggle.style.setProperty('right', '400px', 'important');
      toggle.style.setProperty('left', 'auto', 'important');
      toggle.style.setProperty('bottom', 'auto', 'important');
    }
  }

  function init() {
    reposition();
    try {
      new MutationObserver(reposition).observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    window.addEventListener('resize', reposition);
    setInterval(reposition, 1500);
    try { console.log('[v374-result-row-position] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
