/**
 * v401 — 비교/인쇄/관심목록 bulk prefetch (Phase F.3)
 * 사장님 명령 2026-05-15: server pagination 모드에서 selected/favorited 매물 자동 fetch.
 *
 * 배경:
 *   - v397 활성 시 WS.allListings = page 만 (20-100건)
 *   - WS.showCompare / printSelected / showFavorites 는 WS.state.selectedIds / favorites
 *     를 .find(id) 로 lookup → page 외 매물은 cache miss → 빈 결과
 *
 * v401 동작:
 *   1. 비교/인쇄/관심목록 buttons click 가로채기 (capture true)
 *   2. selectedIds 또는 favorites 의 id 중 cache miss 인 것들 미리 fetchListingsByIds
 *   3. v399 가 _addToCache 자동 → WS.allListings 에 추가됨
 *   4. 원래 button click handler 가 .find(id) 호출 → 이제 cache hit
 *   5. 정상 작동
 *
 * 회귀 회피:
 *   - cache hit 시 영향 0 (모든 id 가 cache 에 있으면 그냥 통과)
 *   - WS.fetchListingsByIds 없으면 skip
 *   - 비동기 — 사용자 click 후 lazy delay (~200-500ms) 가능
 *   - button click 한번 막고 fetch 후 재 click — 무한 loop 방지 위해 __v401_processed flag 사용
 */
(function () {
  'use strict';
  if (window.__WS_V401_BULK_PREFETCH__) return;
  window.__WS_V401_BULK_PREFETCH__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v401-bulk-prefetch]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function getCacheMissIds(ids) {
    var arr = (window.WS && window.WS.allListings) || [];
    var cached = {};
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id != null) cached[String(arr[i].id)] = true;
    }
    return ids.filter(function (id) { return !cached[String(id)]; });
  }

  async function prefetchSelected() {
    if (typeof window.WS.fetchListingsByIds !== 'function') return;
    var st = (window.WS && window.WS.state) || {};
    var ids = [];
    if (st.selectedIds && typeof st.selectedIds.forEach === 'function') {
      st.selectedIds.forEach(function (id) { ids.push(id); });
    }
    var miss = getCacheMissIds(ids);
    if (miss.length === 0) return;
    log('selected: prefetching', miss.length, 'missing ids');
    await window.WS.fetchListingsByIds(miss);
  }

  async function prefetchFavorites() {
    if (typeof window.WS.fetchListingsByIds !== 'function') return;
    var st = (window.WS && window.WS.state) || {};
    var ids = (st.favorites || []);
    var miss = getCacheMissIds(ids);
    if (miss.length === 0) return;
    log('favorites: prefetching', miss.length, 'missing ids');
    await window.WS.fetchListingsByIds(miss);
  }

  // button id → prefetch type 매핑
  var BTN_HANDLERS = {
    'ws-btn-compare': prefetchSelected,
    'ws-btn-print': prefetchSelected,
    'ws-btn-view-favorites': prefetchFavorites,
    'ws-btn-fav-compare': prefetchFavorites,
  };

  document.addEventListener('click', async function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest('button[id]');
    if (!btn || !btn.id) return;

    var handler = BTN_HANDLERS[btn.id];
    if (!handler) return;

    // 이미 한번 처리됨 (재 click) → 통과
    if (btn.__v401_processed) {
      btn.__v401_processed = false;
      return;
    }

    // cache miss 있는지 확인 — 없으면 통과
    var st = (window.WS && window.WS.state) || {};
    var idsToCheck = [];
    if (btn.id === 'ws-btn-compare' || btn.id === 'ws-btn-print') {
      if (st.selectedIds && typeof st.selectedIds.forEach === 'function') {
        st.selectedIds.forEach(function (id) { idsToCheck.push(id); });
      }
    } else {
      idsToCheck = (st.favorites || []);
    }
    var miss = getCacheMissIds(idsToCheck);
    if (miss.length === 0) return; // 모두 cache 에 있음 → legacy 흐름 그대로

    // cache miss — 가로채서 fetch + 재 click
    e.preventDefault();
    e.stopPropagation();
    log('intercepting', btn.id, '— fetching', miss.length, 'missing ids');
    await handler();
    btn.__v401_processed = true;
    try {
      btn.click();
    } catch (_) {}
  }, true);

  log('v401 installed — bulk prefetch active');
})();
