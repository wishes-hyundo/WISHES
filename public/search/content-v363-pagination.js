/**
 * v363 — Pagination (page-based load)
 * 사장님 명령 2026-05-12.
 *
 * 배경:
 *   60K+ 매물 전체 fetch (35초) → 페이지당 100개만 fetch (1-2초).
 *   첫 화면 즉시 표시 → 사용자 스크롤 시 다음 page lazy load.
 *
 * 동작:
 *   1. 페이지 진입 시: GET /api/admin/listings/page?page=1&size=100
 *      → 응답: { data: [100], total: 63286, has_more: true }
 *   2. WS.allListings = data
 *   3. WS.renderAll() → 사장님 시야 1-2초 안 매물 표시
 *   4. 사용자 스크롤 viewport 끝 가까이 → 다음 page lazy load
 *
 * 회귀 회피 (오늘 v359/v361/v362 사고 학습):
 *   - 새 파일 → 기존 patch 안 건드림
 *   - fetch wrap 0 → v294-scope 충돌 0
 *   - setInterval 0 → backend 부하 0 (사용자 액션 시만 fetch)
 *   - 등록 안 하면 prod 영향 0
 *   - degrade: v363 fail 시 silent → 기존 흐름 (v349) 이 fallback
 *
 * 안전 가드:
 *   - loading mutex (concurrent fetch 회피)
 *   - has_more=false 시 더 이상 fetch 안 함
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
  var PAGE_SIZE = 100;
  var INIT_DELAY_MS = 100;
  var ENDPOINT = '/api/admin/listings/page';
  var SCROLL_THRESHOLD_PX = 800;

  var loading = false;
  var currentPage = 0;
  var total = 0;
  var hasMore = true;
  var firstFetchDone = false;

  function log() {
    if (!DEBUG) return;
    var args = ['[v363-pagination]'].concat([].slice.call(arguments));
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

  async function fetchPage(pageNum) {
    if (loading) return;
    if (!hasMore && pageNum > 1) return;
    if (!window.WS) { log('WS missing, skip'); return; }

    loading = true;
    var t0 = Date.now();
    try {
      var scope = getScope();
      var url = ENDPOINT + '?page=' + pageNum + '&size=' + PAGE_SIZE + '&scope=' + scope + '&_ts=' + Date.now();
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
      if (pageNum === 1) {
        window.WS.allListings = data.slice();
        if (typeof j.total === 'number') {
          total = j.total;
          try {
            if (window.WS && window.WS.state) {
              window.WS.state.totalListings = total;
            }
          } catch (_) {}
        }
        firstFetchDone = true;
      } else {
        var existing = window.WS.allListings || [];
        var existingIds = new Set();
        for (var i = 0; i < existing.length; i++) {
          if (existing[i] && existing[i].id !== undefined) existingIds.add(String(existing[i].id));
        }
        var added = 0;
        for (var k = 0; k < data.length; k++) {
          if (!existingIds.has(String(data[k].id))) {
            existing.push(data[k]);
            added++;
          }
        }
        window.WS.allListings = existing;
        log('page', pageNum, 'appended', added, 'rows (mem=' + existing.length + ')');
      }
      currentPage = pageNum;
      hasMore = j.has_more === true;
      log('page', pageNum, 'OK in', ms, 'ms (got', data.length, 'rows, total=' + total + ', has_more=' + hasMore + ')');

      if (typeof window.WS.renderAll === 'function') {
        try { window.WS.renderAll(); }
        catch (e) { log('renderAll err:', e && e.message); }
      }
    } catch (e) {
      log('page', pageNum, 'err:', e && e.message);
    } finally {
      loading = false;
    }
  }

  function onScroll() {
    if (loading || !hasMore || !firstFetchDone) return;
    try {
      var scrollY = window.scrollY || window.pageYOffset || 0;
      var viewportH = window.innerHeight || 0;
      var docH = document.documentElement.scrollHeight || 0;
      if (docH - (scrollY + viewportH) < SCROLL_THRESHOLD_PX) {
        fetchPage(currentPage + 1);
      }
    } catch (e) {
      log('onScroll err:', e && e.message);
    }
  }

  function init() {
    setTimeout(function () { fetchPage(1); }, INIT_DELAY_MS);
    var scrollTimer = null;
    window.addEventListener('scroll', function () {
      if (scrollTimer) return;
      scrollTimer = setTimeout(function () {
        scrollTimer = null;
        onScroll();
      }, 200);
    }, { passive: true });
    log('installed (page size', PAGE_SIZE, ', first fetch in', INIT_DELAY_MS, 'ms)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
