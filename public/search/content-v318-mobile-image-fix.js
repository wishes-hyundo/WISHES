/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v318 — 모바일 썸네일 사진 즉시 로드
 * 사장님 보고 (2026-04-29): "모바일 보니깐 썸네일에 사진이 전혀 안뜸"
 *
 * 원인:
 *   content.js 의 <img class="ws-lazy" data-src="..."> 패턴은 IntersectionObserver
 *   기반 lazy loading. 모바일 일부 브라우저 (특히 iOS Safari + 폴드 펼침 등 비표준
 *   viewport) 에서 observer 가 트리거 안 되거나 root 미스매치로 사진 로드 X.
 *
 * 정책 (CLAUDE.md):
 *   - content.js 손대지 X — 별도 patch 파일로 추가 (이게 정확한 패턴).
 *   - 모든 매물 + 신규 매물 영구 적용.
 *
 * 동작:
 *   1. 페이지 로드 + 매번 매물 카드 렌더 후 MutationObserver 로 감지
 *   2. img.ws-lazy[data-src] 모두 찾아서 src ← data-src 즉시 이동 (즉시 로드)
 *   3. native loading="lazy" decoding="async" 으로 브라우저 자체 lazy 활용
 *      (IntersectionObserver 보다 안정적, 2026 모든 모바일 지원)
 *   4. fetchPriority='auto' — viewport 안 이미지는 LCP 우선
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v318-mobile-image-fix';

  function eagerLoad(img) {
    try {
      var ds = img.getAttribute('data-src');
      if (!ds) return;
      // 이미 src 가 같으면 skip
      if (img.getAttribute('src') === ds) {
        img.removeAttribute('data-src');
        img.classList.remove('ws-lazy');
        return;
      }
      // native lazy loading + async decoding (브라우저 최적화)
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      // src 이동 → 즉시 fetch 시작
      img.setAttribute('src', ds);
      img.removeAttribute('data-src');
      img.classList.remove('ws-lazy');
    } catch (e) { /* noop */ }
  }

  function loadAll() {
    try {
      var imgs = document.querySelectorAll('img.ws-lazy[data-src]');
      imgs.forEach(eagerLoad);
    } catch (e) { /* noop */ }
  }

  // 초기 1회 + 매 렌더링 후
  function start() {
    loadAll();
    // 새 카드 추가 / 페이지 변경 감지
    var mo = new MutationObserver(function (muts) {
      var hit = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) {
              if ((n.tagName === 'IMG' && n.classList && n.classList.contains('ws-lazy')) ||
                  (n.querySelector && n.querySelector('img.ws-lazy[data-src]'))) {
                hit = true; break;
              }
            }
          }
          if (hit) break;
        }
      }
      if (hit) {
        // microtask scheduling → batched (성능)
        if (window.requestAnimationFrame) requestAnimationFrame(loadAll);
        else setTimeout(loadAll, 16);
      }
    });
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      console.log('[' + V + '] 모바일 썸네일 즉시 로드 시작');
    } catch (e) {
      console.warn('[' + V + '] MutationObserver 시작 실패:', e);
    }
    // 안전망: 1초 / 3초 / 6초 후 추가 sweep (느린 네트워크 / 늦게 렌더되는 카드)
    setTimeout(loadAll, 1000);
    setTimeout(loadAll, 3000);
    setTimeout(loadAll, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
