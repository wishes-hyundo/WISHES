/**
 * v381 — Option C: modal hero / lightbox 의 background-image + thumb data-url 을
 *        listing.listing_images[idx].hero_url 로 swap
 * 사장님 명령 2026-05-14.
 *
 * 진단:
 *   - v240-detail.js 의 hero (.ws-gallery-main) 는 background-image (img 태그 X)
 *   - thumb 클릭 시 data-url 의 url 을 hero background 로 set
 *   - 매물 카드 src + thumb data-url 모두 listing_images[0].url (?w=220 작음)
 *
 * v381 fix:
 *   - server response 에 listing_images[0].hero_url 추가됨 (?w=1200, img-proxy nocap=1 wrapped)
 *   - showDetail 후 modal 의 thumb data-url 을 hero_url 로 swap
 *   - main background-image 도 첫 thumb 의 hero_url 로 update
 *   - thumb img src 는 그대로 (작은 thumbnail)
 *
 * 결과:
 *   - 매물 카드: ?w=220 작은 (freeze 0)
 *   - thumb 작은 미리보기: ?w=220 작은
 *   - hero 큰 표시: hero_url ?w=1200 (cap 우회) → 1200px 선명 ✅
 */
(function () {
  'use strict';
  if (window.__WS_V381_HERO_SWAP__) return;
  window.__WS_V381_HERO_SWAP__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function getCurrentListing() {
    try {
      if (window.WS && window.WS.__lastListing) return window.WS.__lastListing;
    } catch (_) {}
    return null;
  }

  function findHeroUrlForIdx(listing, idx) {
    if (!listing) return null;
    var imgs = listing.images || listing.listing_images || [];
    var entry = imgs[idx];
    if (!entry) return null;
    if (typeof entry === 'object' && entry.hero_url) return entry.hero_url;
    return null;
  }

  function patchModal() {
    var listing = getCurrentListing();
    if (!listing) return;
    var thumbs = document.querySelectorAll('.ws-thumb[data-url]');
    if (!thumbs || thumbs.length === 0) return;

    var firstHeroUrl = null;
    for (var i = 0; i < thumbs.length; i++) {
      var thumb = thumbs[i];
      if (thumb.dataset.v381) continue;
      var idxAttr = thumb.getAttribute('data-idx');
      var idx = idxAttr ? parseInt(idxAttr, 10) : i;
      var heroUrl = findHeroUrlForIdx(listing, idx);
      if (heroUrl) {
        thumb.setAttribute('data-url', heroUrl);
        thumb.dataset.v381 = '1';
        if (i === 0) firstHeroUrl = heroUrl;
        if (thumb.classList.contains('ws-thumb-active') && !firstHeroUrl) {
          firstHeroUrl = heroUrl;
        }
      }
    }

    // Update main background-image to first hero
    var main = document.getElementById('ws-gallery-main');
    if (main && firstHeroUrl) {
      main.style.backgroundImage = "url('" + firstHeroUrl.replace(/'/g, "\\'") + "')";
    }
  }

  function init() {
    // showDetail wrap — modal 열린 후 thumbs render 후 patch
    var hookShowDetail = function () {
      if (!window.WS || typeof window.WS.showDetail !== 'function') {
        return setTimeout(hookShowDetail, 100);
      }
      if (window.WS.__v381Hooked) return;
      window.WS.__v381Hooked = true;
      var orig = window.WS.showDetail;
      window.WS.showDetail = function (listing) {
        var result = orig.apply(this, arguments);
        // modal HTML render 후 patch (delay 100ms x 3 — render race 회피)
        setTimeout(patchModal, 100);
        setTimeout(patchModal, 300);
        setTimeout(patchModal, 800);
        return result;
      };
    };
    hookShowDetail();

    // MutationObserver fallback — modal 동적 build 시 trigger
    try {
      new MutationObserver(function () {
        if (document.querySelector('.ws-thumb[data-url]:not([data-v381])')) {
          patchModal();
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (_) {}

    try { console.log('[v381-modal-hero-swap] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
