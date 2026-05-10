/**
 * content-v341-progressive.js v2 (2026-05-10) - 재설계
 *
 * 단계B (사장님 명령 "차례대로 안전하게"):
 *   v1 회귀 (매물 0건) 분석 → v260-perf 의 r.clone() 위에 v341 가 또 r.clone() →
 *   stream tee 다중 wrap 충돌. content.js 의 r.json() 가 빈 데이터 받음.
 *
 * v2 해결:
 *   1. fetch 가로챈 후 origFetch 응답을 fully consume (.json())
 *   2. 결과 data 에서 nextCursor 추출 → 백그라운드 fetch 스케줄
 *   3. content.js 에는 NEW Response 객체 반환 (data: first 20)
 *      - 새 Response 는 새 stream → content.js 의 r.json() 정상 동작
 *      - paginated/returned 메타 필드 제거 → content.js 가 기대하는 {success, data} 형태
 *   4. 백그라운드는 origFetch 직접 호출 → window.WS.allListings.push + renderAll
 *
 * 안전 가드:
 *   - error 시 원본 URL fetch fallback (사용자 영향 0)
 *   - signal 보존 (content.js 의 60s abort 정상 작동)
 *   - v294 (Bearer auth) inner. v341 outer. wrap 순서 정상.
 *   - dedupe cache (v260-perf) 는 modifiedUrl 로 저장됨. 같은 첫 호출 5s 이내면 dedupe HIT.
 *
 * 효과:
 *   - 첫 진입 1-2초 안 20매물 표시
 *   - 백그라운드 5-10초 내 전체 62K 매물 push
 */
(function () {
  'use strict';
  if (window.__WS_V341_PROGRESSIVE_V2__) return;
  window.__WS_V341_PROGRESSIVE_V2__ = true;

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
    if (urlStr.indexOf('paginated=') >= 0) return false;
    return true;
  }

  function _addPaginationParams(urlStr, limit, cursor) {
    var sep = urlStr.indexOf('?') >= 0 ? '&' : '?';
    var params = 'paginated=1&limit=' + limit;
    if (cursor) params += '&cursor=' + encodeURIComponent(cursor);
    return urlStr + sep + params;
  }

  // 백그라운드 추가 페이지 fetch — origFetch 직접 호출 (recursive wrap 회피)
  function _backgroundFetch(baseUrl, firstCursor, originalInit) {
    var origFetch = window.__WS_V341_ORIG_FETCH_V2__ || window.fetch;
    var cursor = firstCursor;
    var bgStart = Date.now();
    var totalFetched = 0;

    function fetchNextPage() {
      if (!cursor) {
        try {
          console.log('[v341-v2] background complete (' +
            ((Date.now() - bgStart) / 1000).toFixed(1) + 's, +' + totalFetched + ' listings)');
        } catch (_) {}
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
          setTimeout(fetchNextPage, 100);
        } else {
          cursor = null;
          fetchNextPage();
        }
      }).catch(function (err) {
        try { console.warn('[v341-v2] bg fetch error', err); } catch (_) {}
      });
    }
    fetchNextPage();
  }

  // fetch wrap
  var origFetch = window.fetch;
  window.__WS_V341_ORIG_FETCH_V2__ = origFetch;

  window.fetch = function (input, init) {
    var urlStr = typeof input === 'string' ? input : (input && input.url) || '';
    if (!_firstFetchDone && _isFirstFetchTarget(urlStr)) {
      _firstFetchDone = true;
      var firstUrl = _addPaginationParams(urlStr, FIRST_LIMIT, null);
      try {
        console.log('[v341-v2] first fetch limit=' + FIRST_LIMIT + ' (background +' + BG_LIMIT + ' each)');
      } catch (_) {}
      var firstStart = Date.now();
      // origFetch 응답을 fully consume → 새 Response 만들어 content.js 에 반환
      // stream 충돌 회피
      return origFetch.call(this, firstUrl, init).then(function (r) {
        if (!r.ok) {
          // 에러 응답 그대로 반환
          return r;
        }
        return r.json().then(function (data) {
          try {
            console.log('[v341-v2] first fetch ok (' +
              ((Date.now() - firstStart) / 1000).toFixed(2) + 's, ' +
              (data.data ? data.data.length : 0) + ' listings)');
          } catch (_) {}
          // 백그라운드 fetch 트리거
          if (data && data.nextCursor) {
            setTimeout(function () {
              _backgroundFetch(urlStr, data.nextCursor, init);
            }, 300);
          }
          // content.js 가 기대하는 단순 형태로 새 Response 생성
          var simpleBody = JSON.stringify({
            success: data.success !== false,
            data: Array.isArray(data.data) ? data.data : []
          });
          return new Response(simpleBody, {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        });
      }).catch(function (err) {
        // fallback: 원본 URL 그대로 fetch (사용자 영향 0)
        try { console.warn('[v341-v2] error, fallback to original URL', err); } catch (_) {}
        return origFetch.call(this, input, init);
      });
    }
    return origFetch.call(this, input, init);
  };

  // 진단
  window.WS = window.WS || {};
  window.WS._progressiveStatusV2 = function () {
    try {
      var n = (window.WS.allListings || []).length;
      console.log('[v341-v2] firstFetchDone:', _firstFetchDone, '| allListings:', n);
      return { firstFetchDone: _firstFetchDone, count: n };
    } catch (e) { return null; }
  };
})();
