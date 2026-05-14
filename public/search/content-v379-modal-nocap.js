/**
 * v379 — 모달 hero / lightbox image 에 ?nocap=1 추가 (img-proxy cap 우회)
 * 사장님 명령 2026-05-14.
 *
 * 배경:
 *   v378 (img-proxy server cap) 이 CloudFront ?w>600 image 를 ?w=400 으로 강제 cap.
 *   매물 카드 (109px) 는 OK 지만 상세 모달 hero (큰 화면) 도 400px 로 작아져서 흐릿.
 *
 * fix:
 *   - 모달 hero (.ws-gallery-main img, .ws-modal-hero img, .ws-lightbox img) 의 src 에 nocap=1 추가
 *   - img-proxy 가 nocap=1 query 받으면 cap 안 함 → 원본 ?w=1200 fetch → 고화질
 *
 * 매물 카드 image (.ws-listing-image) 는 nocap 추가 X — cap 그대로 작동 → freeze 해결 유지.
 */
(function () {
  'use strict';
  if (window.__WS_V379_MODAL_NOCAP__) return;
  window.__WS_V379_MODAL_NOCAP__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // 모달 hero / lightbox image 선택자 — 카드 image 는 제외
  var HERO_SELECTORS = [
    '.ws-gallery-main img',
    '.ws-gallery-main',  // background-image 도 가능
    '.ws-modal-hero img',
    '.ws-lightbox img',
    '.ws-lb-main img',
    '.ws-detail-image img',
    '.v240-hero img',
    '.ws-thumb-active',
    'img.ws-thumb-active'
  ].join(',');

  function addNocap(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.indexOf('/api/img-proxy') === -1) return url;  // img-proxy 거치는 url 만
    if (url.indexOf('nocap=1') >= 0) return url;  // 이미 있음
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'nocap=1';
  }

  function processImg(img) {
    try {
      if (!img || img.dataset.v379) return;
      img.dataset.v379 = '1';
      var src = img.getAttribute('src');
      if (src) {
        var newSrc = addNocap(src);
        if (newSrc !== src) img.setAttribute('src', newSrc);
      }
      // background-image 처리
      var bg = img.style && img.style.backgroundImage;
      if (bg && bg.indexOf('img-proxy') > -1 && bg.indexOf('nocap=1') === -1) {
        var bgUrl = bg.replace(/url\((['"]?)([^'")]+)\1\)/, function(m, q, u) {
          return 'url(' + q + addNocap(u) + q + ')';
        });
        img.style.backgroundImage = bgUrl;
      }
    } catch (_) {}
  }

  function processAll(root) {
    if (!root || !root.querySelectorAll) return;
    var elems = root.querySelectorAll(HERO_SELECTORS);
    for (var i = 0; i < elems.length; i++) processImg(elems[i]);
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
              if (n.matches && n.matches(HERO_SELECTORS)) processImg(n);
              if (n.querySelectorAll) processAll(n);
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    try { console.log('[v379-modal-nocap] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
