/**
 * v385 — <link rel="preload" as="image"> 의 href 를 img-proxy 로 강제 변환
 * 사장님 명령 2026-05-14.
 *
 * 진단 (사장님 직접 capture curl 명령):
 *   - URL: https://d4k1brqee4emz.cloudfront.net/room_img/...jpg?w=1200
 *   - Referer: https://wishes.co.kr/search?sort=latest
 *   - 원인: content-v342-modal-image-priority.js 의 _preloadHero 가
 *           document.head 에 <link rel="preload" as="image" href="rawUrl"> 추가
 *           → 브라우저가 raw cloudfront 직접 fetch (img-proxy 우회) → 거대 image (3MB)
 *
 * v385 fix:
 *   - MutationObserver on document.head
 *   - new <link rel="preload" as="image"> 감지 시 href 변환:
 *     · raw cloudfront → img-proxy + ?w=1200 + nocap=1
 *     · raw zigbang/etc → img-proxy + nocap=1
 *     · 이미 img-proxy → ?w=1200 + nocap=1 보장
 *
 * 매물카드 영향 0 — selector 가 link[rel=preload][as=image] 만.
 */
(function () {
  'use strict';
  if (window.__WS_V385_PRELOAD_LINK_PATCH__) return;
  window.__WS_V385_PRELOAD_LINK_PATCH__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var EXTERNAL_HOSTS = [
    'resource.zigbang.io',
    'ic.zigbang.com',
    'img.nemoapp.kr',
    'blob.nemoapp.kr',
    'gsc.gongsilclub.com',
  ];
  var CDN_HOST = 'd4k1brqee4emz.cloudfront.net';

  function buildBigUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.indexOf('data:') === 0) return url;
    if (url.indexOf('/api/img-proxy') > -1) {
      var u = url;
      if (u.indexOf('nocap=1') < 0) u += (u.indexOf('?') >= 0 ? '&' : '?') + 'nocap=1';
      if (/(%3[Ff]w%3[Dd])\d+/.test(u)) u = u.replace(/(%3[Ff]w%3[Dd])\d+/, '$1' + '1200');
      else if (/[?&]w=\d+/.test(u)) u = u.replace(/([?&])w=\d+/, '$1w=1200');
      return u;
    }
    if (url.indexOf(CDN_HOST) > -1) {
      var raw = url;
      if (/[?&]w=\d+/.test(raw)) raw = raw.replace(/([?&])w=\d+/, '$1w=1200');
      else raw = raw + (raw.indexOf('?') >= 0 ? '&' : '?') + 'w=1200';
      return '/api/img-proxy?url=' + encodeURIComponent(raw) + '&nocap=1';
    }
    for (var i = 0; i < EXTERNAL_HOSTS.length; i++) {
      if (url.indexOf(EXTERNAL_HOSTS[i]) > -1) {
        return '/api/img-proxy?url=' + encodeURIComponent(url) + '&nocap=1';
      }
    }
    return url;
  }

  function isPreloadImageLink(node) {
    return node && node.tagName === 'LINK'
      && node.rel === 'preload'
      && (node.as === 'image' || node.getAttribute('as') === 'image');
  }

  function processLink(link) {
    try {
      if (!link || link.dataset.v385done) return;
      var href = link.getAttribute('href');
      if (!href) return;
      var newHref = buildBigUrl(href);
      if (newHref && newHref !== href) {
        link.dataset.v385done = '1';
        link.setAttribute('href', newHref);
      }
    } catch (_) {}
  }

  function processAll() {
    var links = document.head.querySelectorAll('link[rel="preload"][as="image"]');
    for (var i = 0; i < links.length; i++) processLink(links[i]);
  }

  function init() {
    processAll();
    try {
      // Observe document.head for new <link rel="preload" as="image">
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.addedNodes) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.nodeType === 1 && isPreloadImageLink(n)) {
                processLink(n);
              }
            }
          }
          if (m.type === 'attributes' && m.attributeName === 'href' && isPreloadImageLink(m.target)) {
            // href 변경 감지 (rare)
            if (!m.target.dataset.v385done) processLink(m.target);
          }
        }
      }).observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href']
      });

      // Also observe document.documentElement in case <link> goes elsewhere
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.addedNodes) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.nodeType === 1 && isPreloadImageLink(n)) {
                processLink(n);
              }
            }
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}

    // Also wrap document.head.appendChild to catch the link BEFORE browser fetches
    try {
      var origAppendChild = document.head.appendChild;
      document.head.appendChild = function (node) {
        try {
          if (isPreloadImageLink(node) && !node.dataset.v385done) {
            processLink(node);
          }
        } catch (_) {}
        return origAppendChild.call(this, node);
      };
    } catch (_) {}

    try { console.log('[v385-preload-link-patch] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
