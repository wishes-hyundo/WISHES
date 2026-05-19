/* /search content-v326 — 매물번호 옆 mini 출처 뱃지 cleanup-only.
 *
 * 사장님 명령 (2026-04-29): "상세보기 아래는 제거" (매물번호 옆 mini G/O)
 *
 * 배경:
 *   v324a 가 카드 우측 매물번호(.ws-listing-id) 옆에 mini G/O 뱃지를 prepend 했는데
 *   주소 옆 뱃지와 위치 중복으로 보임. v324b 에서 그 추가 코드를 제거 + cleanup 로직
 *   넣었지만, Vercel CDN edge 가 v324 path 를 stale serve 해서 새 코드 안 풀림
 *   (ETag 동일, age 130초 누적, x-vercel-cache: HIT).
 *
 * 해결:
 *   별개 path (v326) 로 cleanup 전용 patch 만들어 cache miss 강제. 단순히
 *   .ws-src-badge-mini 모두 제거 + MutationObserver 로 재생성 시 즉시 제거.
 *
 * 영향: 좌측 주소 옆 G/O 뱃지(.ws-src-badge)는 그대로 유지. 우측 매물번호 옆
 *       mini 뱃지(.ws-src-badge-mini)만 제거.
 */
(function () {
  'use strict';
  var V = 'v326-cleanup-mini-badge';

  function killMinis(root) {
    try {
      var minis = (root || document).querySelectorAll('.ws-src-badge-mini');
      for (var i = 0; i < minis.length; i++) {
        try { minis[i].parentNode && minis[i].parentNode.removeChild(minis[i]); } catch (_) {}
      }
    } catch (_) {}
  }

  var t = null;
  function scheduleSweep() {
    if (t) return;
    t = setTimeout(function () { t = null; killMinis(document); }, 60);
  }

  var __mo_throttle = null;
  var mo = new MutationObserver(function (mutations) {
    // [Step 37 fix 2026-05-19 사장님 명령] throttle 250ms — Observer cascade freeze 차단
    if (__mo_throttle) return;
    __mo_throttle = setTimeout(function() { __mo_throttle = null; }, 250);
    var hit = false;
    for (var i = 0; i < mutations.length && !hit; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.classList && n.classList.contains('ws-src-badge-mini')) { hit = true; break; }
        if (n.querySelector && n.querySelector('.ws-src-badge-mini')) { hit = true; break; }
      }
    }
    if (hit) scheduleSweep();
  });

  function init() {
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    killMinis(document);
    setTimeout(function () { killMinis(document); }, 300);
    setTimeout(function () { killMinis(document); }, 1000);
    setTimeout(function () { killMinis(document); }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
