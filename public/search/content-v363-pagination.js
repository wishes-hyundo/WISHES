/**
 * v363 v4 — True pagination (NO sparse array, direct DOM update)
 * 사장님 명령 2026-05-12.
 *
 * v4 변경:
 *   - sparse array 폐기 (다른 patches v328/v329/v330/v335 호환성 위해)
 *   - WS.allListings = page data (정상 array, 20개)
 *   - 직접 DOM update:
 *     - #ws-mgmt-total = total (DB 전체 카운트)
 *     - #ws-mgmt-public, #ws-mgmt-private = public/private counts (server 응답 필요)
 *     - #ws-result-count = data.length (페이지 매물 수)
 *   - 페이지네이션 UI: renderPagination wrap (temp sparse for length only, 동기)
 *
 * 회귀 회피:
 *   - sparse array 폐기 → v328/v329/v330/v335 sweep errors 해결
 *   - fetch wrap 0 → v294-scope 충돌 0
 *   - WS.allListings 정상 array → 다른 patches 안전
 *
 * 안전 가드:
 *   - loading mutex
 *   - WS 없으면 silent skip
 *   - renderPagination 호출 시 try/finally 로 원복 보장
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
    var args = ['[v363-pagination-v4]'].concat([].slice.call(arguments));
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

  function fmt(n) {
    return (typeof n === 'number') ? n.toLocaleString() : String(n);
  }

  function updateCountUI(data, total) {
    try {
      // 검색결과 = 페이지 매물 수
      var resEl = document.getElementById('ws-result-count');
      if (resEl) resEl.textContent = String(data.length);
      // 전체 = DB 전체
      var totalEl = document.getElementById('ws-mgmt-total');
      if (totalEl) totalEl.textContent = fmt(total);
    } catch (e) {
      log('updateCountUI err:', e && e.message);
    }
  }

  function safeRenderPagination(total) {
    if (!window.WS || typeof window.WS.renderPagination !== 'function') return;
    var orig = window.WS.allListings;
    try {
      // Temp sparse for length-only — synchronous block
      window.WS.allListings = new Array(total);
      window.WS.renderPagination();
    } catch (e) {
      log('renderPagination err:', e && e.message);
    } finally {
      // Immediately restore (sync) — other patches see normal array
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
      currentPage = pageNum;

      // 정상 array (20개) — 다른 patches 호환
      window.WS.allListings = data.slice();
      try {
        if (window.WS.state) {
          window.WS.state.page = pageNum;
          window.WS.state.totalListings = total;
        }
      } catch (_) {}
      firstFetchDone = true;

      log('page', pageNum, 'OK in', ms, 'ms (got', data.length, 'rows, total=' + total + ', perPage=' + perPage + ')');

      // 1) Render listings (normal array)
      try {
        if (typeof window.WS.renderAll === 'function') window.WS.renderAll();
      } catch (e) { log('renderAll err:', e && e.message); }

      // 2) Pagination UI (temp sparse for length)
      safeRenderPagination(total);

      // 3) 카운트 elements 직접 update
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
    log('v4 installed (no sparse + direct DOM update for count elements)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
