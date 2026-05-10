/**
 * content-v347-lightbox-imgs-fill.js v2 (2026-05-11)
 *
 * 사장님 v1 결과: "한번에 안뜨고 한번 껐다 다시 켜면 그때 나옴"
 *   원인: v247 (lightbox) 도 click capture phase. v347 도 click capture phase.
 *         같은 phase 면 등록 순서대로 fire — v247 (v240-detail.js) 가 먼저 로드됨.
 *         첫 클릭: v247 먼저 fire → 1 entry 만 읽음. v347 가 set 해도 늦음.
 *         두번째 클릭: 첫 v347 set 이 이미 적용 → v247 8장.
 *
 * v2 fix:
 *   click 대신 mousedown capture 사용 (mousedown 이 click 보다 먼저 fire — browser 표준).
 *   mousedown 시 data-images attribute 채움 → 직후 click 에서 v247 fresh attribute 읽음.
 *   첫 클릭부터 정상 동작.
 *
 * 또한 MutationObserver 로 모달 open 시 한 번 미리 채움 (안전 가드).
 *
 * 안전 가드:
 *   - mousedown 만 hook, click 흐름 변경 X
 *   - data-images attribute set 만, preventDefault X
 *   - .ws-thumb 없으면 set 안 함 (fallback safe)
 *   - 1 entry 매물 정상 (urls.length <= 1 이면 set 안 함)
 *
 * 검증:
 *   - 매물 112552 (사진 8장): 첫 클릭부터 1/8 + 화살표
 *   - 매물 102644 (사진 20장): 첫 클릭부터 1/20 + 화살표
 *   - 사진 1장 매물: 1/1 (원래 그래야 함)
 */
(function () {
  'use strict';
  if (window.__WS_V347_LIGHTBOX_FIX_V2__) return;
  window.__WS_V347_LIGHTBOX_FIX_V2__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function fillImagesAttr(mainEl) {
    if (!mainEl) return;
    try {
      var root = mainEl.closest('.v240-body') || document;
      var thumbs = root.querySelectorAll('.ws-thumb[data-url]');
      if (!thumbs || thumbs.length <= 1) return;

      var urls = [];
      for (var i = 0; i < thumbs.length; i++) {
        var u = thumbs[i].getAttribute('data-url');
        if (u) urls.push(u);
      }
      if (urls.length <= 1) return;

      // Already correct? skip
      var existing = mainEl.getAttribute('data-images') || '[]';
      try {
        var existingArr = JSON.parse(existing);
        if (Array.isArray(existingArr) && existingArr.length === urls.length) {
          // Already set with same length — likely already correct, skip
          return;
        }
      } catch (_) {}

      mainEl.setAttribute('data-images', JSON.stringify(urls));
    } catch (e) {
      try { console.warn('[v347-v2 fillImagesAttr]', e); } catch (_) {}
    }
  }

  // 1. mousedown capture — fires BEFORE click. v247 click listener 가 fire 할 때 attribute 이미 set.
  document.addEventListener('mousedown', function (ev) {
    try {
      if (ev.target && ev.target.closest && ev.target.closest('.v248-nav-btn')) return;
      if (ev.target && ev.target.closest && ev.target.closest('.v250-nav-btn')) return;
      var m = ev.target && ev.target.closest ? ev.target.closest('#ws-gallery-main') : null;
      if (m) fillImagesAttr(m);
    } catch (_) {}
  }, true);

  // 2. MutationObserver — 모달 open 시 한 번 미리 set. 안전 가드.
  try {
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.id === 'ws-gallery-main') { fillImagesAttr(n); continue; }
          if (n.querySelector) {
            var inner = n.querySelector('#ws-gallery-main');
            if (inner) fillImagesAttr(inner);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  try { console.log('[v347-v2 lightbox-fix] active (mousedown + observer)'); } catch (_) {}
})();
