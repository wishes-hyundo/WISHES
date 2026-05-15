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
      var r = await fetch('/api/admin/listings/by-ids', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
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

  window.WS.fetchListingById = async function (id) {
    if (!id) return null;
    var cached = findInCache(id);
    if (cached) return cached;
    return await fetchSingle(id);
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
      }
    }
    // 입력 순서 보존
    return ids.map(function (id) { return byId[String(id)]; }).filter(Boolean);
  };

  try { console.log('[v399-fetch-by-id] WS.fetchListingById / fetchListingsByIds installed'); } catch (_) {}
})();
