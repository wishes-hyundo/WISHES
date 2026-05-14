/**
 * v375 — 전체/내매물 탭을 화면 최하단 toolbar 안 inline 으로 이동
 * 사장님 명령 2026-05-14.
 *
 * 차근차근 시작 — 좌측 상단의 [전체|내매물] 탭부터.
 *   - 현재: fixed top:52, left:12 (좌상단 floating, 시/도/탭 영역 가림)
 *   - 변경: 화면 최하단 toolbar (전체선택/해제/AI브리핑/비교/관심+/관심목록/인쇄/엑셀) 안 첫 자리 inline
 *   - 결과: 다른 도구들과 같은 row 자연스럽게 배치, 좌상단 완전 비움
 *
 * 회귀 회피: 새 파일, CSS 강제 없음, JS 로 toolbar 발견 후 inline append.
 */
(function () {
  'use strict';
  if (window.__WS_V375_SCOPE_BOTTOM_TOOLBAR__) return;
  window.__WS_V375_SCOPE_BOTTOM_TOOLBAR__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function findBottomToolbar() {
    var allBtns = document.querySelectorAll('button');
    for (var i = 0; i < allBtns.length; i++) {
      var t = (allBtns[i].textContent || '').trim();
      if (t === '전체선택' || t === 'AI브리핑') {
        return allBtns[i].parentElement;
      }
    }
    return null;
  }

  var attempted = 0;
  function attach() {
    attempted++;
    var scope = document.getElementById('ws-v294-scope-root');
    var toolbar = findBottomToolbar();
    if (!scope || !toolbar) {
      if (attempted < 30) setTimeout(attach, 500);
      return;
    }
    if (scope.__v375_attached) return;
    scope.__v375_attached = true;
    scope.style.setProperty('position', 'static', 'important');
    scope.style.setProperty('top', 'auto', 'important');
    scope.style.setProperty('left', 'auto', 'important');
    scope.style.setProperty('right', 'auto', 'important');
    scope.style.setProperty('bottom', 'auto', 'important');
    scope.style.setProperty('margin-right', '12px', 'important');
    scope.style.setProperty('display', 'inline-flex', 'important');
    scope.style.setProperty('vertical-align', 'middle', 'important');
    toolbar.insertBefore(scope, toolbar.firstChild);
    try { console.log('[v375-scope-bottom-toolbar] attached'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
