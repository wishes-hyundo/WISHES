/**
 * v378 — 매물 카드 image ?w=1200 → ?w=400 (size 80% 감소)
 * 사장님 명령 2026-05-14 (freeze 진단 결과 fix).
 *
 * 진단:
 *   - 사장님 화면 freeze 원인 = 매물 카드 image 가 ?w=1200 (full hero size)
 *   - 실제 카드 표시 영역 109×110px 인데 image 1200px → 11배 oversized
 *   - 각 image 200-388KB. 30 매물 × 250KB = 7.5MB transfer + decode → main thread 4초 block
 *
 * fix:
 *   - 매물 카드 img.ws-listing-image 의 src/data-src 의 ?w=1200 (또는 임의 w=N) → ?w=400 으로 replace
 *   - CloudFront image 만 (다른 host 안 건드림)
 *   - 초기 + 동적 추가 모두 MutationObserver 로 처리
 *
 * 회귀 회피:
 *   - modal hero (?w=1200) / modal thumbnail (?w=400) 은 v342 가 처리 → 건드림 X
 *   - lightbox 원본 이미지 (?w 없음) — 건드림 X (큰 사이즈 필요)
 *   - 매물 카드 (.ws-listing-image) 만 대상
 */
(function () {
  'use strict';
  if (window.__WS_V378_CARD_IMG_SHRINK__) return;
  window.__WS_V378_CARD_IMG_SHRINK__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var CDN_RE = /(d4k1brqee4emz\.cloudfront\.net)/i;
  var CARD_W = 400;

  function shrinkUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (!CDN_RE.test(url)) return url;
    // ?w=N 또는 &w=N 또는 encoded %3Fw%3DN 모두 replace
    var out = url;
    // 일반 ?w=N
    if (/[?&]w=\d+/.test(out)) {
      out = out.replace(/([?&])w=\d+/g, '$1w=' + CARD_W);
    }
    // URL-encoded (img-proxy 사용 시): %3Fw%3D1200 → %3Fw%3D400
    if (/%3[Ff]w%3[Dd]\d+/.test(out)) {
      out = out.replace(/(%3[Ff]w%3[Dd])\d+/g, '$1' + CARD_W);
    }
    // URL-encoded &w=
    if (/%26w%3[Dd]\d+/.test(out)) {
      out = out.replace(/(%26w%3[Dd])\d+/g, '$1' + CARD_W);
    }
    return out;
  }

  function processImg(img) {
    try {
      if (!img || !img.classList || !img.classList.contains('ws-listing-image')) return;
      if (img.dataset.v378) return;
      img.dataset.v378 = '1';

      var src = img.getAttribute('src');
      var dataSrc = img.getAttribute('data-src');
      if (src && CDN_RE.test(src)) {
        var newSrc = shrinkUrl(src);
        if (newSrc !== src) img.setAttribute('src', newSrc);
      }
      if (dataSrc && CDN_RE.test(dataSrc)) {
        var newDataSrc = shrinkUrl(dataSrc);
        if (newDataSrc !== dataSrc) img.setAttribute('data-src', newDataSrc);
      }
    } catch (_) {}
  }

  function processAll(root) {
    if (!root || !root.querySelectorAll) return;
    var imgs = root.querySelectorAll('img.ws-listing-image');
    for (var i = 0; i < imgs.length; i++) processImg(imgs[i]);
  }

  function init() {
    processAll(document);
    try {
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) {
              if (n.tagName === 'IMG') processImg(n);
              if (n.querySelectorAll) processAll(n);
            }
          }
          // src attribute 변경 (lazy load IntersectionObserver 가 data-src → src 시점) 도 대응
          if (m.type === 'attributes' && m.attributeName === 'src') {
            if (m.target && m.target.tagName === 'IMG') processImg(m.target);
          }
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    } catch (_) {}
    try { console.log('[v378-card-img-shrink] installed (w=' + CARD_W + ')'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
