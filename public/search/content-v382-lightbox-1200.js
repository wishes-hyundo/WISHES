/**
 * v382 — openLightbox wrap + 모든 lightbox/modal hero image 의 ?w=1200+nocap 강제
 * 사장님 명령 2026-05-14.
 *
 * 진단:
 *   - openLightbox 가 url array 받아 lightbox image src 로 사용
 *   - url 은 listing_images[i].url (?w=220 작음)
 *   - lightbox 가 그 url 그대로 src 사용 → 사장님 확대 시 220px 작음
 *   - hero_url field 는 server response 에 있지만 client 가 사용 안 함
 *
 * v382 fix:
 *   - openLightbox wrap — url array 의 cloudfront url 을 ?w=1200 + nocap=1 + img-proxy wrap 으로 변환
 *   - modal hero (.ws-gallery-main) 의 background-image 도 변환 (showDetail wrap)
 *   - 매물 카드 (.ws-listing-image) 영향 0 (selector 정확히 modal/lightbox 만)
 */
(function () {
  'use strict';
  if (window.__WS_V382_LIGHTBOX_1200__) return;
  window.__WS_V382_LIGHTBOX_1200__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function buildHeroUrl(url) {
    if (!url || typeof url !== 'string') return url;
    // 이미 img-proxy wrap 된 경우
    if (url.indexOf('/api/img-proxy') > -1) {
      var u = url;
      // nocap 추가
      if (u.indexOf('nocap=1') < 0) u += (u.indexOf('?') >= 0 ? '&' : '?') + 'nocap=1';
      // encoded ?w=N → 1200
      if (/(%3[Ff]w%3[Dd])\d+/.test(u)) {
        u = u.replace(/(%3[Ff]w%3[Dd])\d+/, '$1' + '1200');
      }
      return u;
    }
    // raw cloudfront
    if (url.indexOf('cloudfront.net') > -1) {
      var heroRaw = url;
      if (/[?&]w=\d+/.test(heroRaw)) {
        heroRaw = heroRaw.replace(/([?&])w=\d+/g, '$1w=1200');
      } else {
        heroRaw = heroRaw + (heroRaw.indexOf('?') >= 0 ? '&' : '?') + 'w=1200';
      }
      return '/api/img-proxy?url=' + encodeURIComponent(heroRaw) + '&nocap=1';
    }
    // 자체 호스팅 (wishes-image-proxy) / zigbang 등 — 원본 url 그대로 (이미 작음 또는 자체 사이즈)
    return url;
  }

  function hookLightbox() {
    if (!window.WS || typeof window.WS.openLightbox !== 'function') {
      return setTimeout(hookLightbox, 100);
    }
    if (window.WS.__v382LightboxHooked) return;
    window.WS.__v382LightboxHooked = true;
    var orig = window.WS.openLightbox;
    window.WS.openLightbox = function (imagesJson, idx) {
      try {
        var images = typeof imagesJson === 'string' ? JSON.parse(imagesJson) : (imagesJson || []);
        if (Array.isArray(images)) {
          var heroes = images.map(buildHeroUrl);
          return orig.call(this, typeof imagesJson === 'string' ? JSON.stringify(heroes) : heroes, idx);
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    try { console.log('[v382-lightbox-1200] openLightbox hooked'); } catch (_) {}
  }

  function hookShowDetail() {
    if (!window.WS || typeof window.WS.showDetail !== 'function') {
      return setTimeout(hookShowDetail, 100);
    }
    if (window.WS.__v382DetailHooked) return;
    window.WS.__v382DetailHooked = true;
    var orig = window.WS.showDetail;
    window.WS.showDetail = function () {
      var result = orig.apply(this, arguments);
      // modal HTML render 후 hero background + thumb data-url swap
      var doSwap = function () {
        try {
          // Modal hero (background-image)
          var main = document.getElementById('ws-gallery-main');
          if (main) {
            var bg = main.style.backgroundImage;
            if (bg && bg.indexOf('url') === 0) {
              var m = bg.match(/url\((['"]?)([^'")]+)\1\)/);
              if (m) {
                var newUrl = buildHeroUrl(m[2]);
                if (newUrl !== m[2]) {
                  main.style.backgroundImage = "url('" + newUrl.replace(/'/g, "\\'") + "')";
                }
              }
            }
          }
          // Modal thumb data-url (클릭 시 사용되는 url)
          var thumbs = document.querySelectorAll('.ws-thumb[data-url]');
          for (var i = 0; i < thumbs.length; i++) {
            var t = thumbs[i];
            if (t.dataset.v382) continue;
            var u = t.getAttribute('data-url');
            var nu = buildHeroUrl(u);
            if (nu && nu !== u) {
              t.setAttribute('data-url', nu);
              t.dataset.v382 = '1';
            }
          }
        } catch (_) {}
      };
      setTimeout(doSwap, 100);
      setTimeout(doSwap, 300);
      setTimeout(doSwap, 800);
      return result;
    };
    try { console.log('[v382-lightbox-1200] showDetail hooked'); } catch (_) {}
  }

  function init() {
    hookLightbox();
    hookShowDetail();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
