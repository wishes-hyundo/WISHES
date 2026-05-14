/**
 * v384 — modal hero (.ws-gallery-main) background-image 의 raw URL 을 img-proxy wrap
 * 사장님 명령 2026-05-14.
 *
 * 진단 (사장님 스크린샷 Network 탭):
 *   - webp (200-500KB) — img-proxy 통과 (v383 lightbox patch 작동) ✓
 *   - octet-stream (1-3MB) — raw cloudfront 직접 fetch (img-proxy 우회)
 *   - 원인: v240-detail.js line 660 의 .ws-gallery-main 의
 *           style="background-image:url('rawUrl')" — img-proxy 안 거침
 *   - 또 line 1364: lightbox close 시 mainEl.style.backgroundImage = raw url
 *
 * v384 fix:
 *   - MutationObserver: .ws-gallery-main 의 style attribute 변경 감지
 *   - background-image 의 url(...) 안에 raw cloudfront/zigbang URL 이면
 *     /api/img-proxy?url=ENCODED + ?w=1200 (cloudfront) + nocap=1 으로 강제 변환
 *   - thumb click 시 hero swap 도 자동 처리 (style 변경 감지)
 *
 * 매물카드 영향 0 — selector 가 .ws-gallery-main 만.
 */
(function () {
  'use strict';
  if (window.__WS_V384_HERO_BG_PATCH__) return;
  window.__WS_V384_HERO_BG_PATCH__ = true;
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

  function processHeroBg(el) {
    try {
      if (!el || !el.style) return;
      var bg = el.style.backgroundImage;
      if (!bg || bg.indexOf('url') !== 0) return;
      var m = bg.match(/url\((['"]?)([^'")]+)\1\)/);
      if (!m) return;
      var origUrl = m[2];
      var newUrl = buildBigUrl(origUrl);
      if (newUrl && newUrl !== origUrl) {
        if (el.dataset.v384bg === newUrl) return;
        el.dataset.v384bg = newUrl;
        el.style.backgroundImage = "url('" + newUrl.replace(/'/g, "\\'") + "')";
      }
    } catch (_) {}
  }

  function processAll(root) {
    if (!root || !root.querySelectorAll) return;
    var els = root.querySelectorAll('.ws-gallery-main');
    for (var i = 0; i < els.length; i++) processHeroBg(els[i]);
  }

  function init() {
    processAll(document);
    try {
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.addedNodes) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.nodeType === 1) {
                if (n.matches && n.matches('.ws-gallery-main')) processHeroBg(n);
                if (n.querySelectorAll) processAll(n);
              }
            }
          }
          if (m.type === 'attributes' && m.attributeName === 'style' && m.target.classList && m.target.classList.contains('ws-gallery-main')) {
            processHeroBg(m.target);
          }
        }
      }).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style']
      });
    } catch (_) {}
    try { console.log('[v384-modal-hero-bg-patch] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
