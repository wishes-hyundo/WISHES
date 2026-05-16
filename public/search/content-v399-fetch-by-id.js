/**
 * v399 — WS.fetchListingById / WS.fetchListingsByIds helper (Phase F.1)
 * 사장님 명령 2026-05-15: 서버 페이지네이션 도입 시 detail-by-id 변환 위한 helper.
 *
 * 동작:
 *   1. WS.fetchListingById(id) — 단건 fetch
 *      - cache 우선 (이미 WS.allListings 에 있으면 그대로 반환)
 *      - 없으면 /api/admin/listings/[id] 호출
 *      - 응답 listing 반환 (listing_images / videos 포함)
 *   2. WS.fetchListingsByIds([id, id, ...]) — 다건 fetch
 *      - cache hit 만 우선 수집
 *      - miss id 들만 /api/admin/listings/by-ids 호출
 *      - 결과 + cache hit 합쳐 반환 (입력 순서 보존)
 *
 * 사용 예 (Phase F.2~F.7 에서):
 *   var listing = await WS.fetchListingById(id);
 *   var listings = await WS.fetchListingsByIds([1,2,3]);
 *
 * 안전:
 *   - cache hit 시 network 안 부르고 즉시 반환
 *   - network fail → null/empty array (caller 처리)
 *   - timeout 10초
 */
(function () {
  'use strict';
  if (window.__WS_V399_FETCH_BY_ID__) return;
  window.__WS_V399_FETCH_BY_ID__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function getToken() {
    try { return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || ''; }
    catch (_) { return ''; }
  }

  // [Critical fix 2026-05-15] middleware CSRF check 통과용 ws_csrf 쿠키 헤더
  function getCsrfToken() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)ws_csrf=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (_) { return ''; }
  }

  function findInCache(id) {
    try {
      var arr = (window.WS && window.WS.allListings) || [];
      return arr.find(function (x) { return x && String(x.id) === String(id); }) || null;
    } catch (_) { return null; }
  }

  async function fetchSingle(id) {
    var t = getToken();
    if (!t) return null;
    var ctrl = new AbortController();
    var tm = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 10000);
    try {
      var r = await fetch('/api/admin/listings/' + id, {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + t },
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      if (!r.ok) return null;
      var j = await r.json();
      return (j && j.success) ? j.data : null;
    } catch (_) {
      clearTimeout(tm);
      return null;
    }
  }

  async function fetchBulk(ids) {
    var t = getToken();
    if (!t || !ids || ids.length === 0) return [];
    var ctrl = new AbortController();
    var tm = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 15000);
    try {
      var csrf = getCsrfToken();
      var headers = {
        'Authorization': 'Bearer ' + t,
        'Content-Type': 'application/json',
      };
      if (csrf) headers['X-CSRF-Token'] = csrf;
      var r = await fetch('/api/admin/listings/by-ids', {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({ ids: ids }),
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      if (!r.ok) return [];
      var j = await r.json();
      return (j && j.success && Array.isArray(j.data)) ? j.data : [];
    } catch (_) {
      clearTimeout(tm);
      return [];
    }
  }

  window.WS = window.WS || {};

  function _addToCache(listing) {
    if (!listing || !listing.id) return;
    try {
      if (!window.WS.allListings) window.WS.allListings = [];
      // 이미 있으면 update (덮어쓰기)
      var idx = window.WS.allListings.findIndex(function (x) {
        return x && String(x.id) === String(listing.id);
      });
      if (idx >= 0) window.WS.allListings[idx] = listing;
      else window.WS.allListings.push(listing);
    } catch (_) {}
  }

  // [Step 16 fix 2026-05-16] in-flight dedup
  //   v400 (카드 click) + v402 (showDetail wrap) 가 같은 id 거의 동시에 fetch 시
  //   동일 Promise 반환 → 중복 네트워크 요청 방지
  var _inflight = {};
  window.WS.fetchListingById = async function (id) {
    if (!id) return null;
    var cached = findInCache(id);
    if (cached) return cached;
    var key = String(id);
    if (_inflight[key]) return _inflight[key];  // 진행 중이면 동일 Promise 반환
    _inflight[key] = (async function () {
      try {
        var fresh = await fetchSingle(id);
        if (fresh) _addToCache(fresh);
        return fresh;
      } finally {
        delete _inflight[key];  // 완료 후 cleanup
      }
    })();
    return _inflight[key];
  };

  window.WS.fetchListingsByIds = async function (ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    var byId = {};
    var miss = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var cached = findInCache(id);
      if (cached) byId[String(id)] = cached;
      else miss.push(id);
    }
    if (miss.length > 0) {
      var fetched = await fetchBulk(miss);
      for (var j = 0; j < fetched.length; j++) {
        byId[String(fetched[j].id)] = fetched[j];
        _addToCache(fetched[j]);
      }
    }
    // 입력 순서 보존
    return ids.map(function (id) { return byId[String(id)]; }).filter(Boolean);
  };

  try { console.log('[v399-fetch-by-id] WS.fetchListingById / fetchListingsByIds installed'); } catch (_) {}
})();
