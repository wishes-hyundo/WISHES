/**
 * v400 — 모달 click prefetch (Phase F.2)
 * 사장님 명령 2026-05-15: server pagination 모드 .find(id) miss 자동 fetch + showDetail.
 *
 * 배경:
 *   - v397 활성 시 WS.allListings = 현재 page (20-100건) 만 보유
 *   - content.js 의 click handler 는 _findListing(id) → WS.allListings.find(id) 호출
 *   - page 외 매물 click 시 .find null → showDetail 호출 안 됨 → 사용자 click 묵살
 *
 * v400 동작:
 *   1. click event capture (true) 로 다른 handler 보다 먼저 잡음
 *   2. .ws-detail-btn / .ws-listing-title / .ws-addr-preview click 감지
 *   3. WS.allListings 에 매물 있으면 → e.preventDefault 안 함 → legacy 흐름 그대로
 *   4. WS.allListings 에 없으면 → e.preventDefault + e.stopPropagation
 *      → await WS.fetchListingById(id) (v399 가 _addToCache 자동)
 *      → 응답 도착 후 WS.showDetail / WS._showQuickPreview 직접 호출
 *
 * 회귀 회피:
 *   - cache hit (현재 page 매물) → 영향 0 (legacy 흐름)
 *   - WS.fetchListingById 없으면 (v399 미설치) → 그냥 통과
 *   - feature flag 검사 안 함 — legacy 모드에서도 안전 (cache 항상 hit 이므로 통과)
 *
 * 사용 patch: v397 (server pagination) 활성 시 효과 발현
 */
(function () {
  'use strict';
  if (window.__WS_V400_MODAL_PREFETCH__) return;
  window.__WS_V400_MODAL_PREFETCH__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v400-modal-prefetch]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function findCachedListing(id) {
    try {
      var arr = (window.WS && window.WS.allListings) || [];
      return arr.find(function (x) { return x && String(x.id) === String(id); }) || null;
    } catch (_) { return null; }
  }

  document.addEventListener('click', async function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    // detail-btn / listing-title-sub / listing-title / addr-preview 식별
    var btn = t.closest('.ws-detail-btn') ||
              t.closest('.ws-listing-title-sub[data-listing-id]') ||
              t.closest('.ws-listing-title[data-listing-id]') ||
              t.closest('.ws-addr-preview[data-listing-id]');
    if (!btn) return;

    var id = btn.dataset.id || btn.dataset.listingId;
    if (!id || !window.WS) return;

    // 1) cache hit — legacy 흐름 그대로 (영향 0)
    if (findCachedListing(id)) return;

    // 2) cache miss — fetch + showDetail 직접 호출
    if (typeof window.WS.fetchListingById !== 'function') {
      log('cache miss but no fetchListingById (v399 missing) — fallthrough');
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    var listing;
    try {
      listing = await window.WS.fetchListingById(id);
    } catch (err) {
      log('fetch err:', err && err.message);
      return;
    }
    if (!listing) {
      log('fetch returned null for id', id);
      return;
    }

    log('cache miss → fetched + opening modal for id', id);

    // quick preview (addr) vs detail
    if (btn.classList && btn.classList.contains('ws-addr-preview') &&
        typeof window.WS._showQuickPreview === 'function') {
      window.WS._showQuickPreview(listing, btn);
    } else if (typeof window.WS.showDetail === 'function') {
      window.WS.showDetail(listing);
    } else {
      log('WS.showDetail not found');
    }
  }, true);

  log('v400 installed — modal prefetch active');
})();
