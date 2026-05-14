/**
 * v363 v5 — True pagination + search/filter passthrough
 * 사장님 명령 2026-05-12.
 *
 * v5 변경:
 *   - 사장님 검색/필터 사용 시 → fetchServerPage(1) 호출 시 q/type/deal 전달
 *   - WS.state.keyword / typeTab / deal change 감지 → 자동 re-fetch
 *   - backend page route v2 와 연동 (검색 server side)
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

  // v7: sticky search params 원칙 — legacy renderAll 이 WS.state.keyword 를
  // clear 해도 cached 값 유지. 페이지 버튼 클릭 시 state 재읽 안 함.
  var stickyParams = { q: '', type: '', deal: '' };

  function log() {
    if (!DEBUG) return;
    var args = ['[v363-pagination-v5]'].concat([].slice.call(arguments));
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

  // v7: read directly from DOM input element (most reliable) — falls back to WS.state, then sticky cache
  function readQFromInput() {
    var sels = [
      'input[placeholder*="검색"]',
      'input.ws-keyword',
      '#ws-keyword',
      'input[name="keyword"]',
      'input[name="q"]',
      'input[type="search"]',
      'input.ws-search-input',
      '.ws-search input',
    ];
    for (var i = 0; i < sels.length; i++) {
      try {
        var el = document.querySelector(sels[i]);
        if (el && typeof el.value === 'string') return el.value.trim();
      } catch (_) {}
    }
    return null;  // not found
  }

  function readCurrentParamsFromState() {
    var p = { q: '', type: '', deal: '' };
    try {
      if (window.WS && window.WS.state) {
        var s = window.WS.state;
        if (s.keyword && String(s.keyword).trim()) p.q = String(s.keyword).trim();
        if (s.typeTab && s.typeTab !== '전체') p.type = s.typeTab;
        if (s.deal && s.deal !== '전체') p.deal = s.deal;
      }
    } catch (_) {}
    return p;
  }

  function refreshSticky() {
    // v7: combine DOM input + WS.state + previous sticky (sticky wins if DOM/state empty)
    var domQ = readQFromInput();   // null if input not found, '' if cleared, value if typed
    var stateP = readCurrentParamsFromState();
    // q: DOM input is source of truth IF found. Otherwise state. Otherwise keep sticky.
    if (domQ !== null) {
      // input element found — its value IS the user's actual search
      stickyParams.q = domQ;
    } else if (stateP.q) {
      stickyParams.q = stateP.q;
    }
    // else: keep sticky.q as-is (don't clear from race)
    // type/deal: rely on WS.state (legacy doesn't seem to clear these)
    if (stateP.type) stickyParams.type = stateP.type;
    else if (stateP.type === '' && document.querySelector('.ws-type-tab.active')) {
      // type tab UI exists but state empty — could be '전체', keep empty
      stickyParams.type = '';
    }
    if (stateP.deal) stickyParams.deal = stateP.deal;
  }

  function getSearchParams() {
    refreshSticky();
    var p = {};
    if (stickyParams.q) p.q = stickyParams.q;
    if (stickyParams.type) p.type = stickyParams.type;
    if (stickyParams.deal) p.deal = stickyParams.deal;
    return p;
  }

  function fmt(n) { return (typeof n === 'number') ? n.toLocaleString() : String(n); }

  function updateCountUI(data, total) {
    try {
      var resEl = document.getElementById('ws-result-count');
      if (resEl) resEl.textContent = String(data.length);
      var totalEl = document.getElementById('ws-mgmt-total');
      if (totalEl) totalEl.textContent = fmt(total);
    } catch (_) {}
  }

  // v9 fix (2026-05-14): renderPagination 가 WS.filtered.length 기준으로 페이지 수 계산.
  //   WS.allListings sparse 는 효과 X. WS.filtered 를 sparse 로 만들어야 페이지 버튼 그려짐.
  function safeRenderPagination(total) {
    if (!window.WS || typeof window.WS.renderPagination !== 'function') return;
    var origFiltered = window.WS.filtered;
    var origAllListings = window.WS.allListings;
    try {
      window.WS.filtered = new Array(total);
      window.WS.allListings = new Array(total);  // 안전망 (만약 다른 곳도 length 확인)
      window.WS.renderPagination();
    } catch (_) {} finally {
      window.WS.filtered = origFiltered;
      window.WS.allListings = origAllListings;
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
      var sp = getSearchParams();
      var url = ENDPOINT + '?page=' + pageNum + '&size=' + perPage + '&scope=' + scope;
      for (var k in sp) {
        url += '&' + k + '=' + encodeURIComponent(sp[k]);
      }
      url += '&_ts=' + Date.now();

      var r = await fetch(url, {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + getToken() },
      });
      var ms = Date.now() - t0;
      if (!r.ok) { log('page', pageNum, 'http', r.status, 'in', ms, 'ms'); return; }
      var j = await r.json();
      if (!j || !j.success) { log('page', pageNum, 'bad response:', j && j.error); return; }
      var data = j.data || [];
      var total = (typeof j.total === 'number') ? j.total : (totalCount || data.length);
      totalCount = total;
      currentPage = pageNum;

      window.WS.allListings = data.slice();
      // v6 fix: pagination render FIRST with state.page=pageNum for correct button highlight,
      //   THEN set state.page=1 so legacy renderAll's slice((page-1)*perPage, page*perPage)
      //   returns items [0:20] of WS.allListings (which is server-fetched page data).
      try {
        if (window.WS.state) {
          window.WS.state.page = pageNum;
          window.WS.state.totalListings = total;
        }
      } catch (_) {}
      firstFetchDone = true;
      log('page', pageNum, 'v6 OK in', ms, 'ms (got', data.length, 'rows, total=' + total + ', q=' + (sp.q || '') + ')');

      // v8 reorder fix (2026-05-14): renderAll FIRST with state.page=1 (slice math),
      //   then state.page=pageNum + safeRenderPagination for correct highlight + 3376 buttons.
      //   v6/v7 had renderAll AFTER safeRenderPagination → buttons wiped by renderAll.
      try { if (window.WS.state) window.WS.state.page = 1; } catch (_) {}
      try { if (typeof window.WS.renderAll === 'function') window.WS.renderAll(); }
      catch (_) {}
      try { if (window.WS.state) window.WS.state.page = pageNum; } catch (_) {}
      safeRenderPagination(total);
      updateCountUI(data, total);
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
      if (requestedPage === currentPage && firstFetchDone) return;
      e.preventDefault();
      e.stopPropagation();
      log('user clicked page', requestedPage);
      fetchServerPage(requestedPage);
    } catch (_) {}
  }

  function watchState() {
    // v7: watch BOTH WS.state and DOM input directly
    var lastTrackedQ = '';
    var lastTrackedType = '';
    var lastTrackedDeal = '';
    var lastTrackedPerPage = getPerPage();
    // Initial sync — capture current state into sticky
    refreshSticky();
    lastTrackedQ = stickyParams.q;
    lastTrackedType = stickyParams.type;
    lastTrackedDeal = stickyParams.deal;

    setInterval(function () {
      // refresh sticky from DOM + state
      refreshSticky();
      var perPage = getPerPage();
      var changed = (
        stickyParams.q !== lastTrackedQ ||
        stickyParams.type !== lastTrackedType ||
        stickyParams.deal !== lastTrackedDeal ||
        perPage !== lastTrackedPerPage
      );
      if (changed) {
        log('v7 change: q=' + stickyParams.q + ' (was ' + lastTrackedQ + '), type=' + stickyParams.type + ', deal=' + stickyParams.deal);
        lastTrackedQ = stickyParams.q;
        lastTrackedType = stickyParams.type;
        lastTrackedDeal = stickyParams.deal;
        lastTrackedPerPage = perPage;
        if (firstFetchDone) fetchServerPage(1);
      }
    }, 500);
  }

  function init() {
    setTimeout(function () { fetchServerPage(1); }, INIT_DELAY_MS);
    document.addEventListener('click', onPageBtnClick, true);
    setTimeout(watchState, 500);
    log('v5 installed (search/filter passthrough + page click hook)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
