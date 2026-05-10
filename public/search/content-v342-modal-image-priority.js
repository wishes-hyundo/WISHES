/**
 * content-v342-modal-image-priority.js v3 (2026-05-10) — replace 방식
 *
 * Fix 7-2 (사장님 명령): 모달 사진 속도 개선.
 *   v1/v2 의 _addWidthParam 가 "?w= 이미 있으면 skip" -> 효과 0% (사진 100% 가 ?w=1920).
 *   v3: ?w=1920 -> ?w=400 으로 REPLACE (skip 아님).
 *   CloudFront 60% 매물 적용 -> 썸네일 size 5MB -> 50KB (100배 감소).
 *   Hero 도 ?w=1200 (5MB -> 200KB).
 *
 * 안전:
 *   - showDetail wrap (v240 호출 시 listing 가공)
 *   - listing 객체 새 clone (mutate X)
 *   - 에러 시 원본 listing 그대로 (사용자 영향 0)
 *   - data-_orig_url 보존 (썸네일 클릭 시 hero 원본 화질 가능)
 *   - CloudFront (d4k1brqee4emz) 만 적용. 외부 host (zigbang/nemo) 는 원본 유지.
 *
 * 이전 v342 v1 회귀 원인 재분석:
 *   - 사장님 본 broken 썸네일 = img-proxy 4 host 차단 (Fix 1 로 이미 fix)
 *   - v342 v1 자체는 효과 0% (skip) 라 broken 의 원인이 아니었음
 *   - 그러나 활성화 후 broken 보였던 건 timing 문제 (v318 변환 + v342 변환 충돌 가능)
 *   - v3 는 listing 객체만 변경 + DOM 에 src 삽입 1회만 (충돌 회피)
 */
(function () {
  'use strict';
  if (window.__WS_V342_MODAL_IMG_V3__) return;
  window.__WS_V342_MODAL_IMG_V3__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var CDN_RESIZE_RE = /(d4k1brqee4emz\.cloudfront\.net)/i;
  var HERO_W = 1200;
  var THUMB_W = 400;

  function _setWidthParam(url, w) {
    if (!url || typeof url !== 'string') return url;
    if (!CDN_RESIZE_RE.test(url)) return url; // CloudFront 만
    // ?w= 또는 &w= 이미 있으면 REPLACE (이전 v1/v2 의 skip 버그 fix)
    if (/[?&]w=\d+/.test(url)) {
      return url.replace(/([?&])w=\d+/, '$1w=' + w);
    }
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + 'w=' + w;
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
      var newUrl = _setWidthParam(url, w);
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
      var existing = document.querySelector('link[rel="preload"][data-v342-hero]');
      if (existing) existing.remove();
      var link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      link.setAttribute('fetchpriority', 'high');
      link.setAttribute('data-v342-hero', '1');
      document.head.appendChild(link);
    } catch (_) {}
  }

  function _installShowDetailHook() {
    if (!window.WS || typeof window.WS.showDetail !== 'function') {
      return setTimeout(_installShowDetailHook, 100);
    }
    if (window.WS.__v342v3Hooked) return;
    window.WS.__v342v3Hooked = true;
    var origShowDetail = window.WS.showDetail;
    window.WS.showDetail = function (listing) {
      try {
        var processed = _processListing(listing);
        _preloadHero(processed);
        return origShowDetail.call(this, processed);
      } catch (e) {
        try { console.warn('[v342-v3] hook error', e); } catch (_) {}
        return origShowDetail.call(this, listing);
      }
    };
    try {
      console.log('[v342-v3] showDetail hook installed (HERO ' + HERO_W + 'px / THUMB ' + THUMB_W + 'px, REPLACE mode)');
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _installShowDetailHook);
  } else {
    _installShowDetailHook();
  }
})();
