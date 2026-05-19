/**
 * v402 — WS.showDetail wrap (Phase I)
 * 사장님 명령 2026-05-15: 지도 마커 click 등 minimal listing 으로 showDetail 호출 시 보강.
 *
 * 배경:
 *   - v390 지도 마커 click 시: cluster sample_ids 또는 item.id 만 있는 minimal data 로 showDetail
 *   - v397 활성 시 WS.allListings 가 page 만 → 다른 위치 매물은 minimal 만 사용 가능
 *   - showDetail 받은 listing 이 title/description 없는 minimal 이면 모달 정보 부족
 *
 * v402 동작:
 *   1. 원래 WS.showDetail 보관 (origShowDetail)
 *   2. wrap function:
 *      - listing 이 detail data (title 또는 description 있음) 면 → 그대로 origShowDetail 호출
 *      - minimal (title 없음) + id 있음 → fetchListingById 후 결과로 origShowDetail
 *      - fetch 실패 → 원본 listing 그대로 사용 (graceful degrade)
 *   3. async wrap — caller 가 await 안 해도 modal 표시 (지연 ~500ms)
 *
 * 회귀 회피:
 *   - listing 에 title/description/deposit 있으면 fetch X (이미 detail)
 *   - 카드 click 등 일반 흐름 영향 X
 *   - fetch 실패 시 원본으로 폴백
 *   - origShowDetail 보존
 */
(function () {
  'use strict';
  if (window.__WS_V402_SHOWDETAIL_WRAP__) return;
  window.__WS_V402_SHOWDETAIL_WRAP__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v402-showdetail-wrap]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function isDetailListing(listing) {
    if (!listing) return false;
    // detail listing 은 title 또는 description 또는 deposit/price 가 있음
    return !!(listing.title || listing.description || listing.address_detail ||
              listing.deposit !== undefined || listing.price !== undefined);
  }

  function tryWrap() {
    if (!window.WS || typeof window.WS.showDetail !== 'function') {
      return setTimeout(tryWrap, 200);
    }
    if (window.WS.__v402_wrapped) return;
    window.WS.__v402_wrapped = true;

    var orig = window.WS.showDetail;
    window.WS.__v402_origShowDetail = orig;

    // [Step 84 fix 2026-05-19 사장님 명령] 모달 perceived loading 1-2초 → <100ms
    //   기존: minimal listing 이면 await fetchListingById 후 orig 호출 → 1-2초 blank
    //   수정: orig 즉시 호출 (minimal data 로 모달 open) → 백그라운드 fetch → 보강된 data 로 re-render
    //   사용자는 즉시 모달 보고, 풍부한 정보는 0.5-1초 후 자연스럽게 추가됨.
    window.WS.showDetail = function (listing) {
      var self = this;
      try {
        // 즉시 orig 호출 (minimal 이어도 모달 빨리 표시)
        var origResult = orig.call(self, listing);

        // detail 정보 부족하면 백그라운드 fetch + re-render
        if (!isDetailListing(listing) && listing && listing.id && typeof window.WS.fetchListingById === 'function') {
          log('minimal listing for id', listing.id, '— background fetch + re-render');
          window.WS.fetchListingById(listing.id).then(function (full) {
            if (!full) return;
            try {
              var modal = document.getElementById('ws-modal-detail');
              if (!modal || modal.style.display === 'none') return;
              if (modal.dataset.wsReleased === '1') return;
              try {
                if (window.WS && window.WS.__lastListing &&
                    String(window.WS.__lastListing.id) !== String(listing.id)) {
                  log('outdated, skip');
                  return;
                }
              } catch (_) {}
              orig.call(self, full);
            } catch (e) { log('re-render err:', e && e.message); }
          }).catch(function (err) { log('background fetch err:', err && err.message); });
        }
        return origResult;
      } catch (err) {
        log('wrap err:', err && err.message);
        return orig.call(self, listing);
      }
    };

    log('showDetail wrapped');
  }

  tryWrap();
})();
