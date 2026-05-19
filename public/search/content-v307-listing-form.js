/**
 * /search content-v307 — 매물 등록 통합 (Tier 4, 2026-04-28 rev2)
 *
 * 사장님 명령:
 *   - /search 는 편집만 (등록 X)
 *   - 등록은 짧은 URL /new 페이지로 통합
 *   - [+ 매물등록] 버튼 클릭 → /new 로 이동
 *
 * 동작:
 *   1. content.js 의 ws-btn-new-listing 버튼 클릭 가로채기
 *   2. window.WS._showNewListingModal 호출 차단 → /new 로 location 변경
 *   3. URL ?action=new-listing 도 /new 로 redirect
 */
(function () {
  'use strict';
  var V = 'v307-redirect';

  // ──── 1. ?action=new-listing 즉시 redirect ────
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get('action') === 'new-listing') {
      location.href = '/new';
      return;
    }
  } catch (_) {}

  // ──── 2. + 매물등록 버튼 클릭 가로채기 ────
  function attachRedirectHandler() {
    var btn = document.getElementById('ws-btn-new-listing');
    if (!btn || btn.__v307_attached) return;
    btn.__v307_attached = true;

    // 새 click handler 가 기존 모달 호출 전에 동작
    btn.addEventListener('click', function (e) {
      e.stopImmediatePropagation();
      e.preventDefault();
      location.href = '/new';
    }, true); // capture phase = 기존 listener 보다 먼저 실행
  }

  // 초기 + DOM mutation 감지 (content.js 가 늦게 button 만들어도 잡음)
  attachRedirectHandler();
  try {
    // [Step 53 fix 2026-05-19 사장님 명령] throttle 500ms — 30초 동안 폭주 차단
    var __v307_throttle = null;
    var obs = new MutationObserver(function () {
      if (__v307_throttle) return;
      __v307_throttle = setTimeout(function () { __v307_throttle = null; }, 500);
      attachRedirectHandler();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // 30초 후 멈춤
    setTimeout(function () { obs.disconnect(); }, 30000);
  } catch (_) {}

  // ──── 3. window.WS._showNewListingModal 호출 자체 차단 ────
  // content.js 의 다른 코드가 직접 호출 시 redirect
  try {
    var defer = setInterval(function () {
      if (window.WS && typeof window.WS._showNewListingModal === 'function' && !window.WS.__v307_patched) {
        window.WS.__v307_patched = true;
        window.WS._showNewListingModal = function () {
          location.href = '/new';
        };
        clearInterval(defer);
      }
    }, 200);
    setTimeout(function () { clearInterval(defer); }, 30000);
  } catch (_) {}

  console.log('[' + V + '] /search 등록 모달 → /new redirect 활성');
})();
