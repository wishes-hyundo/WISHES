/**
 * v383 — lightbox img.v247-img 의 src 를 직접 patch (final solution)
 * 사장님 명령 2026-05-14.
 *
 * 진단:
 *   - v382 openLightbox wrap 실패 (race condition / 또는 다른 path)
 *   - 사장님 lightbox src: /api/img-proxy?url=...zigbang...?w=1200 (nocap=1 누락)
 *   - img-proxy CAP_HOSTS 가 zigbang ?w=1200 → ?w=220 으로 강제 cap
 *   - origin (zigbang) 일부 매물 죽었음 → 1x1 PNG fallback
 *
 * v383 fix:
 *   - MutationObserver 가 .v247-img / #v247-lightbox img / .v245-img 의 src 변경 감지
 *   - src 가 /api/img-proxy?url=... 면 nocap=1 + (cloudfront 만) ?w=1200 강제
 *   - src 가 raw cloudfront 면 img-proxy wrap + ?w=1200 + nocap=1
 *   - src 가 raw zigbang/nemo/gongsil 면 img-proxy wrap + nocap=1 (?w 안 건드림)
 *
 * 매물카드 영향 0 — selector 가 lightbox/모달 hero img 만.
 */
(function () {
  'use strict';
  if (window.__WS_V383_LIGHTBOX_PATCH__) return;
  window.__WS_V383_LIGHTBOX_PATCH__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // Lightbox / modal hero image selectors only — 매물카드 X
  var TARGET_SELECTORS = [
    '.v247-img',
    '#v247-lightbox img',
    '.v245-img',
    '.ws-lightbox img',
    '#ws-lightbox img',
    '.ws-lb-main img',
  ].join(',');

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

    // Already img-proxy wrapped — ensure nocap=1 + (cloudfront only) ?w=1200
    if (url.indexOf('/api/img-proxy') > -1) {
      var u = url;
      if (u.indexOf('nocap=1') < 0) {
        u += (u.indexOf('?') >= 0 ? '&' : '?') + 'nocap=1';
      }
      // [2026-05-15 사장님 명령] cloudfront 또는 workers.dev (encoded) 둘 다 ?w=1200 처리
      var hasCdnInner = u.indexOf(encodeURIComponent('cloudfront.net')) > -1 ||
                        u.indexOf('cloudfront.net') > -1 ||
                        u.indexOf('workers.dev') > -1 ||
                        u.indexOf(encodeURIComponent('workers.dev')) > -1 ||
                        u.indexOf('.workers.dev'.replace(/\./g, '%2E')) > -1;
      if (hasCdnInner) {
        if (/(%3[Ff]w%3[Dd])\d+/.test(u)) {
          u = u.replace(/(%3[Ff]w%3[Dd])\d+/, '$1' + '1200');
        } else if (/[?&]w=\d+/.test(u)) {
          u = u.replace(/([?&])w=\d+/, '$1w=1200');
        } else {
          // inner url 에 ?w 없으면 decode → 부착 → 재encode
          try {
            var m = u.match(/[?&]url=([^&]+)/);
            if (m) {
              var inner = decodeURIComponent(m[1]);
              if (!/[?&]w=\d+/.test(inner)) {
                inner = inner + (inner.indexOf('?') >= 0 ? '&' : '?') + 'w=1200';
                u = u.replace(/([?&]url=)[^&]+/, '$1' + encodeURIComponent(inner));
              }
            }
          } catch (_) {}
        }
      }
      return u;
    }

    // Raw cloudfront OR workers.dev → wrap + ?w=1200 + nocap=1
    // [2026-05-15 사장님 명령] workers.dev 추가
    if (url.indexOf(CDN_HOST) > -1 || url.indexOf('.workers.dev') > -1) {
      var raw = url;
      if (/[?&]w=\d+/.test(raw)) {
        raw = raw.replace(/([?&])w=\d+/, '$1w=1200');
      } else {
        raw = raw + (raw.indexOf('?') >= 0 ? '&' : '?') + 'w=1200';
      }
      return '/api/img-proxy?url=' + encodeURIComponent(raw) + '&nocap=1';
    }

    // Raw external (zigbang/nemo/gongsil) → wrap + nocap=1 (don't touch ?w)
    for (var i = 0; i < EXTERNAL_HOSTS.length; i++) {
      if (url.indexOf(EXTERNAL_HOSTS[i]) > -1) {
        return '/api/img-proxy?url=' + encodeURIComponent(url) + '&nocap=1';
      }
    }

    return url;
  }

  function processImg(img) {
    try {
      if (!img || !img.getAttribute) return;
      var src = img.getAttribute('src');
      if (!src) return;
      var newSrc = buildBigUrl(src);
      if (newSrc && newSrc !== src) {
        // Mark old src so observer doesn't infinite-loop
        if (img.dataset.v383src === newSrc) return;
        img.dataset.v383src = newSrc;
        img.setAttribute('src', newSrc);
      }
    } catch (_) {}
  }

  function processAll(root) {
    if (!root || !root.querySelectorAll) return;
    var imgs = root.querySelectorAll(TARGET_SELECTORS);
    for (var i = 0; i < imgs.length; i++) processImg(imgs[i]);
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
                if (n.matches && n.matches(TARGET_SELECTORS)) processImg(n);
                if (n.querySelectorAll) processAll(n);
              }
            }
          }
          if (m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IMG') {
            if (m.target.matches && m.target.matches(TARGET_SELECTORS)) {
              processImg(m.target);
            }
          }
        }
      }).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
      });
    } catch (_) {}
    try { console.log('[v383-lightbox-img-patch] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
