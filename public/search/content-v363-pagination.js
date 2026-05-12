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

  function getSearchParams() {
    var p = {};
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

  function fmt(n) { return (typeof n === 'number') ? n.toLocaleString() : String(n); }

  function updateCountUI(data, total) {
    try {
      var resEl = document.getElementById('ws-result-count');
      if (resEl) resEl.textContent = String(data.length);
      var totalEl = document.getElementById('ws-mgmt-total');
      if (totalEl) totalEl.textContent = fmt(total);
    } catch (_) {}
  }

  function safeRenderPagination(total) {
    if (!window.WS || typeof window.WS.renderPagination !== 'function') return;
    var orig = window.WS.allListings;
    try {
      window.WS.allListings = new Array(total);
      window.WS.renderPagination();
    } catch (_) {} finally {
      window.WS.allListings = orig;
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
      try {
        if (window.WS.state) {
          window.WS.state.page = pageNum;
          window.WS.state.totalListings = total;
        }
      } catch (_) {}
      firstFetchDone = true;
      log('page', pageNum, 'OK in', ms, 'ms (got', data.length, 'rows, total=' + total + ', q=' + (sp.q || '') + ')');

      try { if (typeof window.WS.renderAll === 'function') window.WS.renderAll(); }
      catch (_) {}
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
    var lastKeyword = '';
    var lastType = '';
    var lastDeal = '';
    var lastPerPage = getPerPage();
    setInterval(function () {
      if (!window.WS || !window.WS.state) return;
      var s = window.WS.state;
      var keyword = (s.keyword || '').toString();
      var type = (s.typeTab || '').toString();
      var deal = (s.deal || '').toString();
      var perPage = getPerPage();
      if (
        keyword !== lastKeyword ||
        type !== lastType ||
        deal !== lastDeal ||
        perPage !== lastPerPage
      ) {
        lastKeyword = keyword; lastType = type; lastDeal = deal; lastPerPage = perPage;
        if (firstFetchDone) {
          log('search/filter/perPage changed → re-fetch page 1');
          fetchServerPage(1);
        }
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
