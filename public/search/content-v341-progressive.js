/**
 * content-v341-progressive.js (2026-05-10)
 *
 * Plan B Progressive (사장님 명령 — 첫 진입 20매물 1초 안 표시):
 *   /api/admin/listings?fields=minimal fetch 가로챔.
 *   첫 호출: paginated=1&limit=20 (작은 응답, 1초 안)
 *   응답 받음 → content.js 가 즉시 표시 (20매물)
 *   백그라운드: cursor 사용해 나머지 매물 fetch (limit=1000 단위)
 *   받은 매물 → window.WS.allListings.push(...) + renderAll() 호출
 *   사용자 page 2~ 클릭 시 이미 받은 매물 사용 (background 채워졌으면)
 *
 * 안전 가드:
 *   - v294 (Bearer 인증) wrap 보다 OUTER 라야 함 — page.tsx 에서 v341 entry 가 v294 다음에 inject
 *   - 첫 fetch 만 가로챔 (paginated=1 이미 있는 fetch 는 통과)
 *   - 실패 시 fallback: 원본 fetch 그대로 (사용자 영향 0)
 *   - trackChanges/checkAlerts 첫 호출 후 baseline 설정 — 추가 매물 push 시 재호출 X (회귀 방지)
 *
 * 효과:
 *   - 사장님 매물 페이지 첫 진입 21초 → 1-2초 (첫 20매물)
 *   - 백그라운드 fetch 약 5-10초 (총 62K 매물 받음)
 *   - 사용자 page 1 즉시 클릭 가능, page 2~3 거의 즉시 (백그라운드 push 빠름)
 */
(function () {
  'use strict';
  if (window.__WS_V341_PROGRESSIVE__) return;
  window.__WS_V341_PROGRESSIVE__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var TARGET_RE = /\/api\/admin\/listings\?fields=minimal/;
  var FIRST_LIMIT = 20;
  var BG_LIMIT = 1000;
  var _firstFetchDone = false;

  function _isFirstFetchTarget(urlStr) {
    if (typeof urlStr !== 'string') return false;
    if (!TARGET_RE.test(urlStr)) return false;
    if (urlStr.indexOf('paginated=') >= 0) return false; // 이미 paginated 면 통과
    return true;
  }

  function _addPaginationParams(urlStr, limit, cursor) {
    var sep = urlStr.indexOf('?') >= 0 ? '&' : '?';
    var params = 'paginated=1&limit=' + limit;
    if (cursor) params += '&cursor=' + encodeURIComponent(cursor);
    return urlStr + sep + params;
  }

  // 백그라운드 추가 페이지 fetch — origFetch 직접 사용 (recursive fetch wrap 회피)
  function _backgroundFetch(baseUrl, firstCursor, originalInit) {
    var origFetch = window.__WS_V341_ORIG_FETCH__ || window.fetch;
    var cursor = firstCursor;
    var bgStart = Date.now();
    var totalFetched = 0;

    function fetchNextPage() {
      if (!cursor) {
        try {
          console.log('[v341-progressive] background complete (' +
            ((Date.now() - bgStart) / 1000).toFixed(1) + 's, +' + totalFetched + ' listings)');
        } catch (_) {}
        // 모든 매물 받았으니 마지막 한 번 renderAll
        try { if (window.WS && window.WS.renderAll) window.WS.renderAll(); } catch (_) {}
        return;
      }
      var nextUrl = _addPaginationParams(baseUrl, BG_LIMIT, cursor);
      origFetch(nextUrl, originalInit).then(function (r) {
        if (!r.ok) throw new Error('bg fetch ' + r.status);
        return r.json();
      }).then(function (data) {
        if (data && data.success && Array.isArray(data.data)) {
          if (!window.WS) window.WS = {};
          if (!Array.isArray(window.WS.allListings)) window.WS.allListings = [];
          // dedupe by id (race condition 방지)
          var existingIds = {};
          for (var i = 0; i < window.WS.allListings.length; i++) {
            existingIds[String(window.WS.allListings[i].id)] = 1;
          }
          var added = 0;
          for (var j = 0; j < data.data.length; j++) {
            var item = data.data[j];
            if (item && !existingIds[String(item.id)]) {
              window.WS.allListings.push(item);
              added++;
            }
          }
          totalFetched += added;
          cursor = data.nextCursor || null;
          // 100ms wait — 다른 thread 양보 + Vercel CDN cache warm
          setTimeout(fetchNextPage, 100);
        } else {
          cursor = null;
          fetchNextPage(); // empty data → finish
        }
      }).catch(function (err) {
        try { console.warn('[v341-progressive] bg fetch error', err); } catch (_) {}
        // 실패 시 종료 (사용자 영향 0 — 첫 20매물은 표시됨)
      });
    }
    fetchNextPage();
  }

  // fetch wrap
  var origFetch = window.fetch;
  window.__WS_V341_ORIG_FETCH__ = origFetch; // 백그라운드 fetch 가 사용

  window.fetch = function (input, init) {
    var urlStr = typeof input === 'string' ? input : (input && input.url) || '';
    // 첫 fetch + minimal 매물 list + paginated 아님 → progressive 활성
    if (!_firstFetchDone && _isFirstFetchTarget(urlStr)) {
      _firstFetchDone = true;
      var firstUrl = _addPaginationParams(urlStr, FIRST_LIMIT, null);
      try {
        console.log('[v341-progressive] first fetch limit=' + FIRST_LIMIT + ' (background fetches +' + BG_LIMIT + ' each)');
      } catch (_) {}
      var firstStart = Date.now();
      var promise = origFetch.call(this, firstUrl, init);
      // 백그라운드 추가 fetch trigger
      promise.then(function (r) {
        if (!r.ok) return;
        var cloned = r.clone();
        return cloned.json().then(function (data) {
          try {
            console.log('[v341-progressive] first fetch ok (' +
              ((Date.now() - firstStart) / 1000).toFixed(2) + 's, ' +
              (data.data ? data.data.length : 0) + ' listings)');
          } catch (_) {}
          if (data && data.nextCursor) {
            // 사용자 첫 매물 표시 후 백그라운드 시작 (300ms wait)
            setTimeout(function () {
              _backgroundFetch(urlStr, data.nextCursor, init);
            }, 300);
          }
        });
      }).catch(function () {});
      return promise;
    }
    // 다른 fetch 는 통과
    return origFetch.call(this, input, init);
  };

  // 진단
  window.WS = window.WS || {};
  window.WS._progressiveStatus = function () {
    try {
      var n = (window.WS.allListings || []).length;
      console.log('[v341-progressive] firstFetchDone:', _firstFetchDone,
        '| allListings:', n);
      return { firstFetchDone: _firstFetchDone, count: n };
    } catch (e) { return null; }
  };
})();
