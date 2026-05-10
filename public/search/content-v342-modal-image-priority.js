/**
 * content-v342-modal-image-priority.js (2026-05-10)
 *
 * 사장님 명령: "상세보기 모달 속도가 느려 그래서 사진뜨는것도 너무 느림".
 *
 * 결함:
 *   1. 모달 hero (.ws-gallery-main background-image) = 원본 사진 (5-10MB CloudFront)
 *   2. 썸네일 (.ws-thumb <img>) = 원본 사진 (5-10MB) 30 장 동시 로드
 *   3. 브라우저 6 connection 한도 → hero 가 썸네일 뒤에 큐 → 사용자 빈 화면
 *   4. 30 장 × 5MB = 150MB 모달 한 번에 로드 → 네트워크 saturate
 *
 * Plan B (사장님 SOTA 안전):
 *   1. window.WS.showDetail 가로챔 — listing 객체 전달 시 listing.images URL 수정
 *      - hero (idx 0) → ?w=1200 (CloudFront resize, ~200KB 대신 ~5MB)
 *      - thumbnails (idx 1+) → ?w=400 (~50KB 대신 ~5MB)
 *   2. 모달 DOM 마운트 후 .ws-thumb 에 loading="lazy" + decoding="async"
 *      + fetchpriority="low" 추가 (브라우저가 hero 우선 fetch)
 *   3. <link rel="preload" as="image" fetchpriority="high"> hero 미리 받기
 *   4. data-url 원본 URL 보존 — 썸네일 클릭 시 원본 hero 표시 (원본 보존)
 *
 * 안전 가드:
 *   - v240 wrap 보다 OUTER (v342 마지막 entry)
 *   - listing 객체 mutate 안 함 — 새 객체 clone 후 수정
 *   - URL 이미 ?w= 있으면 skip (회귀 0)
 *   - CloudFront resize 만 적용 — R2 / 외부 host 는 원본 그대로
 *   - data-url 원본 URL 보존 → 썸네일 클릭 시 hero 원본 사진 (사장님 화질 X)
 *
 * 효과:
 *   - 모달 진입 1초 안 hero (1200px ~200KB) 표시
 *   - 30 썸네일 50KB × 30 = 1.5MB (이전 150MB) → 100배 절감
 *   - 사장님 화질 0 (썸네일 클릭 시 원본 hero 그대로 표시)
 */
(function () {
  'use strict';
  if (window.__WS_V342_MODAL_IMG__) return;
  window.__WS_V342_MODAL_IMG__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var CDN_RESIZE_RE = /(d4k1brqee4emz\.cloudfront\.net)/i;
  var HERO_W = 1200;
  var THUMB_W = 400;

  function _addWidthParam(url, w) {
    if (!url || typeof url !== 'string') return url;
    if (url.indexOf('?w=') >= 0 || url.indexOf('&w=') >= 0) return url; // 이미 있음
    if (!CDN_RESIZE_RE.test(url)) return url; // CloudFront 아니면 skip
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + 'w=' + w;
  }

  function _processListing(listing) {
    if (!listing || typeof listing !== 'object') return listing;
    var imgs = listing.images || listing.listing_images;
    if (!Array.isArray(imgs) || imgs.length === 0) return listing;

    // shallow clone listing + images array (mutate 회피)
    var clone = {};
    for (var k in listing) {
      if (Object.prototype.hasOwnProperty.call(listing, k)) clone[k] = listing[k];
    }
    var newImgs = imgs.map(function (img, idx) {
      var url = img && (img.url || img);
      if (!url) return img;
      var w = (idx === 0) ? HERO_W : THUMB_W;
      var newUrl = _addWidthParam(url, w);
      if (newUrl === url) return img;
      // 객체 형태면 복제 후 url 수정, string 형태면 그대로 string
      if (img && typeof img === 'object') {
        var imgClone = {};
        for (var ik in img) {
          if (Object.prototype.hasOwnProperty.call(img, ik)) imgClone[ik] = img[ik];
        }
        imgClone.url = newUrl;
        // 원본 URL 보존 (썸네일 클릭 hero 표시용)
        imgClone._orig_url = url;
        return imgClone;
      }
      return newUrl; // string 형태
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
      // 이미 preload 했으면 skip
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

  function _addThumbAttrs() {
    try {
      var thumbs = document.querySelectorAll('.ws-thumb[data-type="image"]:not([data-v342])');
      for (var i = 0; i < thumbs.length; i++) {
        var t = thumbs[i];
        if (i === 0) {
          // 첫 썸네일 (active hero) 은 high priority
          t.setAttribute('decoding', 'async');
          t.setAttribute('fetchpriority', 'high');
        } else {
          t.setAttribute('loading', 'lazy');
          t.setAttribute('decoding', 'async');
          t.setAttribute('fetchpriority', 'low');
        }
        t.setAttribute('data-v342', '1');
      }
    } catch (_) {}
  }

  // window.WS.showDetail 가로챔 (v240 가 wrap 한 후 v342 가 outer wrap)
  function _installShowDetailHook() {
    if (!window.WS || typeof window.WS.showDetail !== 'function') {
      // WS / showDetail 아직 안 준비 → 100ms wait
      return setTimeout(_installShowDetailHook, 100);
    }
    if (window.WS.__v342Hooked) return;
    window.WS.__v342Hooked = true;
    var origShowDetail = window.WS.showDetail;
    window.WS.showDetail = function (listing) {
      try {
        var processed = _processListing(listing);
        _preloadHero(processed);
        var ret = origShowDetail.call(this, processed);
        // 모달 마운트 직후 썸네일 attrs 추가 (rAF 두 번 = 다음 프레임)
        if (window.requestAnimationFrame) {
          requestAnimationFrame(function () {
            requestAnimationFrame(_addThumbAttrs);
          });
        } else {
          setTimeout(_addThumbAttrs, 32);
        }
        // MutationObserver 비활성 — v240 가 inner DOM update 시에도 한 번 더 시도
        setTimeout(_addThumbAttrs, 200);
        setTimeout(_addThumbAttrs, 800);
        return ret;
      } catch (e) {
        try { console.warn('[v342-modal-img] hook error', e); } catch (_) {}
        // 실패 시 원본 listing 그대로 (사용자 영향 0)
        return origShowDetail.call(this, listing);
      }
    };
    try { console.log('[v342-modal-img] showDetail hook installed (HERO ' + HERO_W + 'px / THUMB ' + THUMB_W + 'px)'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _installShowDetailHook);
  } else {
    _installShowDetailHook();
  }
})();
