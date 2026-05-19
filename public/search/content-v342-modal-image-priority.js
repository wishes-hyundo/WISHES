/**
 * content-v342-modal-image-priority.js v4 (2026-05-14) — img-proxy wrap 추가
 *
 * v3 의 raw cloudfront URL preload → 거대 image (3MB) octet-stream
 * v4: 모든 cloudfront URL 을 img-proxy wrap (?w=1200 hero, ?w=220 thumb)
 *
 * 안전:
 *   - showDetail wrap (v240 호출 시 listing 가공)
 *   - listing 객체 새 clone (mutate X)
 *   - 에러 시 원본 listing 그대로 (사용자 영향 0)
 *   - data-_orig_url 보존 (썸네일 클릭 시 hero 원본 화질 가능)
 *   - CloudFront (d4k1brqee4emz) 만 적용. 외부 host (zigbang/nemo) 는 원본 유지.
 */
(function () {
  'use strict';
  if (window.__WS_V342_MODAL_IMG_V4__) return;
  window.__WS_V342_MODAL_IMG_V4__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var CDN_RESIZE_RE = /(d4k1brqee4emz\.cloudfront\.net)/i;
  var HERO_W = 1200;
  var THUMB_W = 400;

  function _setWidthParam(url, w) {
    if (!url || typeof url !== 'string') return url;
    if (!CDN_RESIZE_RE.test(url)) return url; // CloudFront 만
    if (/[?&]w=\d+/.test(url)) {
      return url.replace(/([?&])w=\d+/, '$1w=' + w);
    }
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + 'w=' + w;
  }

  // [v4 신규] cloudfront URL 을 img-proxy 로 wrap
  function _wrapImgProxy(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.indexOf('/api/img-proxy') > -1) return url; // 이미 wrap
    if (!CDN_RESIZE_RE.test(url)) return url; // CloudFront 만 wrap
    return '/api/img-proxy?url=' + encodeURIComponent(url) + '&nocap=1';
  }

  function _processListing(listing) {
    if (!listing || typeof listing !== 'object') return listing;
    var imgs = listing.images || listing.listing_images;
    if (!Array.isArray(imgs) || imgs.length === 0) return listing;

    var clone = {};
    for (var k in listing) {
      if (Object.prototype.hasOwnProperty.call(listing, k)) clone[k] = listing[k];
    }
    var newImgs = imgs.map(function (img, idx) {
      var url = img && (img.url || img);
      if (!url) return img;
      var w = (idx === 0) ? HERO_W : THUMB_W;
      var sized = _setWidthParam(url, w);
      var newUrl = _wrapImgProxy(sized); // [v4] img-proxy wrap 추가
      if (newUrl === url) return img;
      if (img && typeof img === 'object') {
        var imgClone = {};
        for (var ik in img) {
          if (Object.prototype.hasOwnProperty.call(img, ik)) imgClone[ik] = img[ik];
        }
        imgClone.url = newUrl;
        imgClone._orig_url = url;
        return imgClone;
      }
      return newUrl;
    });
    if (listing.images) clone.images = newImgs;
    if (listing.listing_images) clone.listing_images = newImgs;
    return clone;
  }

  function _preloadHero(listing) {
    try {
      var imgs = (listing && (listing.images || listing.listing_images)) || [];
      if (imgs.length === 0) return;
      var first = imgs[0];
      var url = first && (first.url || first);
      if (!url) return;
      // [v4] _processListing 가 이미 img-proxy 로 wrap 했지만 안전 보장
      var heroUrl = _wrapImgProxy(_setWidthParam(url, HERO_W));
      var existing = document.querySelector('link[rel="preload"][data-v342-hero]');
      if (existing) existing.remove();
      var link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = heroUrl;
      link.setAttribute('fetchpriority', 'high');
      link.setAttribute('data-v342-hero', '1');
      document.head.appendChild(link);
    } catch (_) {}
  }

  function _installShowDetailHook() {
    if (!window.WS || typeof window.WS.showDetail !== 'function') {
      return setTimeout(_installShowDetailHook, 100);
    }
    if (window.WS.__v342v4Hooked) return;
    window.WS.__v342v4Hooked = true;
    var origShowDetail = window.WS.showDetail;
    window.WS.showDetail = function (listing) {
      try {
        var processed = _processListing(listing);
        _preloadHero(processed);
        return origShowDetail.call(this, processed);
      } catch (e) {
        try { console.warn('[v342-v4] hook error', e); } catch (_) {}
        return origShowDetail.call(this, listing);
      }
    };
    try {
      console.log('[v342-v4] showDetail hook installed (HERO ' + HERO_W + 'px / THUMB ' + THUMB_W + 'px, IMG-PROXY WRAP mode)');
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _installShowDetailHook);
  } else {
    _installShowDetailHook();
  }
})();
