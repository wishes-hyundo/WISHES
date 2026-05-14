/**
 * v380 — 모달 hero / lightbox image 강제 ?w=1200 + img-proxy 강제 wrap
 * 사장님 명령 2026-05-14.
 *
 * 진단 결과:
 *   - server _resizeThumb 가 ?w=1920 → ?w=400 변환 (Fix 32)
 *   - v342 의 showDetail wrap 가 hero ?w=1200 으로 변환 시도 — 그러나:
 *     · v240-detail.js / lightbox 가 별도 reference 사용
 *     · gallery navigate 시 새 src 가 ?w=400 또는 raw cloudfront 로 set
 *     · v318 wrap 이 timing 늦어 외부 host 직접 fetch (octet-stream 거대 image)
 *
 * v380 fix:
 *   1. modal/lightbox/gallery img 의 src 가 ?w<1000 → ?w=1200 강제 (cloudfront/zigbang/nemo)
 *   2. 외부 host img src → /api/img-proxy?url=encoded 로 강제 wrap (timing 무관)
 *   3. MutationObserver attribute filter src — 새 src set 시 즉시 처리 (gallery navigate 대응)
 *
 * 매물 카드 image 는 영향 X — selector 가 modal/lightbox 만.
 */
(function () {
  'use strict';
  if (window.__WS_V380_MODAL_HERO_1200__) return;
  window.__WS_V380_MODAL_HERO_1200__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // hero / lightbox / gallery 큰 image selector
  var BIG_IMG_SELECTORS = [
    '.ws-gallery-main img',
    '.ws-gallery-main',
    '.ws-modal-hero img',
    '.ws-lightbox img',
    '.ws-lb-main img',
    '.ws-lb-thumb',
    '.v240-hero img',
    '.v240-body .ws-gallery-main',
    'img.ws-thumb-active',
    '#ws-lightbox img',
  ].join(',');

  // 외부 host (cap 적용 host) — img-proxy wrap 대상
  var EXTERNAL_HOSTS = [
    'd4k1brqee4emz.cloudfront.net',
    'ic.zigbang.com',
    'resource.zigbang.io',
    'img.nemoapp.kr',
    'blob.nemoapp.kr',
    'gsc.gongsilclub.com',
  ];

  function shouldUpsize(url) {
    if (!url) return false;
    if (url.indexOf('/api/img-proxy') > -1) {
      // img-proxy 거친 url 안 ?w=400 (encoded %3Fw%3D400) 또는 작은 size 면 1200 으로
      var m = url.match(/[?&]w=(\d+)/) || url.match(/%3[Ff]w%3[Dd](\d+)/);
      if (m && parseInt(m[1], 10) < 1000) return true;
      return false;
    }
    // raw cloudfront/zigbang/nemo url
    for (var i = 0; i < EXTERNAL_HOSTS.length; i++) {
      if (url.indexOf(EXTERNAL_HOSTS[i]) > -1) {
        var wm = url.match(/[?&]w=(\d+)/);
        if (wm && parseInt(wm[1], 10) < 1000) return true;
        if (!wm) return true;  // ?w 없는 raw url — wrap + add ?w=1200
      }
    }
    return false;
  }

  function buildWrappedUrl(url) {
    // raw external url → img-proxy wrap + ?w=1200
    if (!url) return url;
    if (url.indexOf('/api/img-proxy') > -1) {
      // 이미 wrap. ?w 만 1200 으로 변경
      var encW = /(%3[Ff]w%3[Dd])\d+/;
      var rawW = /([?&])w=\d+/;
      if (encW.test(url)) return url.replace(encW, '$1' + '1200');
      if (rawW.test(url)) return url.replace(rawW, '$1w=1200');
      return url;
    }
    // raw external — set ?w=1200 + wrap
    var sepUrl = url;
    if (/[?&]w=\d+/.test(sepUrl)) {
      sepUrl = sepUrl.replace(/([?&])w=\d+/, '$1w=1200');
    } else {
      sepUrl = sepUrl + (sepUrl.indexOf('?') >= 0 ? '&' : '?') + 'w=1200';
    }
    return '/api/img-proxy?url=' + encodeURIComponent(sepUrl);
  }

  function processImg(img) {
    try {
      if (!img || img.dataset.v380) return;
      var src = img.getAttribute('src');
      if (!src || !shouldUpsize(src)) return;
      img.dataset.v380 = '1';
      var newSrc = buildWrappedUrl(src);
      if (newSrc !== src) img.setAttribute('src', newSrc);
    } catch (_) {}
  }

  function processAll(root) {
    if (!root || !root.querySelectorAll) return;
    var elems = root.querySelectorAll(BIG_IMG_SELECTORS);
    for (var i = 0; i < elems.length; i++) processImg(elems[i]);
  }

  function init() {
    processAll(document);
    try {
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          // 새 element 추가
          if (m.addedNodes) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.nodeType === 1) {
                if (n.tagName === 'IMG' && n.matches && n.matches(BIG_IMG_SELECTORS)) {
                  // 이미 v380 처리됐으면 skip
                  if (!n.dataset.v380) processImg(n);
                }
                processAll(n);
              }
            }
          }
          // src attribute 변경 (gallery navigate)
          if (m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IMG') {
            if (m.target.matches && m.target.matches(BIG_IMG_SELECTORS)) {
              // src 변경됐으니 v380 마크 제거 후 재처리
              delete m.target.dataset.v380;
              processImg(m.target);
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    } catch (_) {}
    try { console.log('[v380-modal-hero-1200] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
