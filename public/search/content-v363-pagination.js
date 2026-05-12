/**
 * v363 v3 — True pagination + sparse array (total count + page UI 정상)
 * 사장님 명령 2026-05-12.
 *
 * v3 변경:
 *   - WS.allListings 를 j.total 길이 sparse array 로 (예: 67114 length)
 *   - 받은 page 데이터만 정확한 offset 위치 채움 (예: page 5 size 20 → idx 80-99)
 *   - "전체" 카운트 = WS.allListings.length = 67114 ✓
 *   - 페이지네이션 UI = 67114 / perPage = 3356 페이지 자동 생성 ✓
 *   - 페이지 클릭 시 페이지 버튼 사라지지 않음 (length 유지)
 *
 * 회귀 회피:
 *   - fetch wrap 0 → v294-scope 충돌 0
 *   - setInterval 1 (perPage 폴링, 가벼움)
 *   - sparse array 는 undefined 일 수 있음 — 다른 patches 가 `if (r) ...` 확인하면 안전
 *
 * 안전 가드:
 *   - loading mutex
 *   - 같은 page 재클릭 시 skip
 *   - WS 없으면 silent skip
 */
(function () {
  'use strict';
  if (window.__WS_V363_PAGINATION__) return;
  window.__WS_V363_PAGINATION__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var INIT_DELAY_MS = 100;
  var ENDPOINT = '/api/admin/listings/page';

  var loading = false;
  var currentPage = 0;
  var totalCount = 0;
  var firstFetchDone = false;

  function log() {
    if (!DEBUG) return;
    var args = ['[v363-pagination-v3]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function getToken() {
    try {
      return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch (_) { return ''; }
  }

  function getScope() {
    try {
      if (window.WS && window.WS.state && window.WS.state.scope === 'mine') return 'mine';
      var u = new URL(location.href);
      if ((u.searchParams.get('scope') || '').toLowerCase() === 'mine') return 'mine';
    } catch (_) {}
    return 'all';
  }

  function getPerPage() {
    try {
      if (window.WS && window.WS.state && typeof window.WS.state.perPage === 'number') {
        return Math.max(1, Math.min(200, window.WS.state.perPage));
      }
    } catch (_) {}
    return 20;
  }

  function ensureSparseArr(total) {
    if (!Array.isArray(window.WS.allListings) || window.WS.allListings.length !== total) {
      window.WS.allListings = new Array(total);
      log('initialized sparse array length=' + total);
    }
  }

  async function fetchServerPage(pageNum) {
    if (loading) return;
    if (!window.WS) { log('WS missing, skip'); return; }

    var perPage = getPerPage();
    loading = true;
    var t0 = Date.now();
    try {
      var scope = getScope();
      var url = ENDPOINT + '?page=' + pageNum + '&size=' + perPage + '&scope=' + scope + '&_ts=' + Date.now();
      var r = await fetch(url, {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + getToken() },
      });
      var ms = Date.now() - t0;
      if (!r.ok) {
        log('page', pageNum, 'http', r.status, 'in', ms, 'ms');
        return;
      }
      var j = await r.json();
      if (!j || !j.success) {
        log('page', pageNum, 'bad response:', j && j.error);
        return;
      }
      var data = j.data || [];
      var total = (typeof j.total === 'number') ? j.total : (totalCount || data.length);
      totalCount = total;

      // Initialize sparse array (preserves total count)
      ensureSparseArr(total);

      // Insert data at correct offset
      var offset = (pageNum - 1) * perPage;
      for (var i = 0; i < data.length; i++) {
        window.WS.allListings[offset + i] = data[i];
      }

      currentPage = pageNum;
      try {
        if (window.WS.state) {
          window.WS.state.page = pageNum;
          window.WS.state.totalListings = total;
        }
      } catch (_) {}
      firstFetchDone = true;
      log('page', pageNum, 'OK in', ms, 'ms (got', data.length, 'rows at offset', offset, ', total=' + total + ', perPage=' + perPage + ')');

      try {
        if (typeof window.WS.renderAll === 'function') window.WS.renderAll();
        if (typeof window.WS.renderPagination === 'function') window.WS.renderPagination();
      } catch (e) { log('render err:', e && e.message); }
    } catch (e) {
      log('page', pageNum, 'err:', e && e.message);
    } finally {
      loading = false;
    }
  }

  function onPageBtnClick(e) {
    try {
      var target = e.target;
      if (!target || !target.classList || !target.classList.contains('ws-page-btn')) return;
      var dataPage = target.getAttribute('data-page');
      if (!dataPage) return;
      var requestedPage = parseInt(dataPage, 10);
      if (!requestedPage || requestedPage < 1) return;

      // Check if memory already has this page's data
      var perPage = getPerPage();
      var offset = (requestedPage - 1) * perPage;
      var memArr = window.WS && window.WS.allListings;
      var alreadyHave = memArr && Array.isArray(memArr) && memArr[offset] !== undefined;
      if (alreadyHave && requestedPage === currentPage) return;

      // Capture click — let default handler also run, but trigger our fetch if data missing
      if (!alreadyHave) {
        e.preventDefault();
        e.stopPropagation();
      }

      log('user clicked page', requestedPage, alreadyHave ? '(have data)' : '(fetch needed)');
      // Always set currentPage so subsequent renders use it
      currentPage = requestedPage;
      try {
        if (window.WS.state) window.WS.state.page = requestedPage;
      } catch (_) {}

      if (!alreadyHave) {
        fetchServerPage(requestedPage);
      } else {
        // re-render only
        try {
          if (typeof window.WS.renderAll === 'function') window.WS.renderAll();
        } catch (err) {}
      }
    } catch (err) {
      log('onPageBtnClick err:', err && err.message);
    }
  }

  function onPerPageChange() {
    if (!firstFetchDone) return;
    log('perPage changed → reset + re-fetch page 1');
    // Reset memory (new perPage means different page boundaries)
    try {
      if (window.WS) {
        window.WS.allListings = [];
        currentPage = 0;
      }
    } catch (_) {}
    fetchServerPage(1);
  }

  function watchPerPage() {
    var lastPerPage = getPerPage();
    setInterval(function () {
      var cur = getPerPage();
      if (cur !== lastPerPage) {
        lastPerPage = cur;
        onPerPageChange();
      }
    }, 1000);
  }

  function init() {
    setTimeout(function () { fetchServerPage(1); }, INIT_DELAY_MS);
    document.addEventListener('click', onPageBtnClick, true);
    setTimeout(watchPerPage, 500);
    log('v3 installed (sparse array + page click hook + perPage hook)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
