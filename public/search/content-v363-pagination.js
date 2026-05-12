/**
 * v363 v2 — True pagination (page button click hook)
 * 사장님 명령 2026-05-12.
 *
 * v2 변경:
 *   - 페이지 버튼 (.ws-page-btn data-page=N) 클릭 hook
 *   - 사용자가 어느 페이지 클릭하든 server 에서 그 페이지만 받음 (네이버 부동산 식)
 *   - 첫 로드: server page 1 (size = WS.state.perPage = 20) → 1초 안 표시
 *   - WS.allListings = 받은 page 의 매물만 (매 클릭 시 교체)
 *   - WS.state.totalListings = 67,114 (전체 카운트 표시)
 *
 * 효과:
 *   - 사장님 시야 1-2초 안 첫 매물 + 전체 카운트 67,114
 *   - 페이지 버튼 1, 2, 3, ..., 3165 클릭 시 즉시 그 페이지 받기
 *   - backend 부하 매우 낮음
 *
 * 회귀 회피:
 *   - fetch wrap 0 → v294-scope 충돌 0
 *   - setInterval 0 (perPage polling 만, 1초 — 가벼움)
 *   - 페이지 버튼 click hook (selector .ws-page-btn 정확)
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
  var total = 0;
  var firstFetchDone = false;

  function log() {
    if (!DEBUG) return;
    var args = ['[v363-pagination-v2]'].concat([].slice.call(arguments));
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

      window.WS.allListings = data.slice();
      currentPage = pageNum;
      if (typeof j.total === 'number') {
        total = j.total;
        try {
          if (window.WS.state) {
            window.WS.state.totalListings = total;
            window.WS.state.page = pageNum;
          }
        } catch (_) {}
      }
      firstFetchDone = true;
      log('page', pageNum, 'OK in', ms, 'ms (got', data.length, 'rows, total=' + total + ', perPage=' + perPage + ')');

      try {
        if (typeof window.WS.renderAll === 'function') {
          window.WS.renderAll();
        }
      } catch (e) { log('renderAll err:', e && e.message); }
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
    } catch (err) {
      log('onPageBtnClick err:', err && err.message);
    }
  }

  function onPerPageChange() {
    if (!firstFetchDone) return;
    log('perPage changed → re-fetch page 1');
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
    log('v2 installed (page click hook + perPage change hook)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
