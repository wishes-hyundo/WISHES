/**
 * v374 v2 — 검색결과 행으‍로 floating UI 이동 (viewport bound check 추가)
 * 사장님 명령 2026-05-14.
 * v374 v1 버그: 페이지 로딩 쓴 검색결과 행이 viewport 밖은 경우 reposition ​도 계산 자이웩 좌표 (-2606) ​.
 * v374 v2: viewport 안 50px 이상 보일 때만 reposition. 그 외 last 위치 유지.
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
      if (/^검색결과:\s*\d/.test(t) && all[i].children.length < 5 && (all[i].textContent || '').length < 100) {
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
    // viewport bound check — 보일 때만 reposition
    if (rt.top < 50 || rt.top > window.innerHeight - 30) return;
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
    window.addEventListener('scroll', reposition, { passive: true });
    setInterval(reposition, 1500);
    try { console.log('[v374-result-row-position v2] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
