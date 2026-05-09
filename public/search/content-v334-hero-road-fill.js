/* /search content-v334 — 모달 hero 도로명주소 직접 채우기
 *
 * 사장님 명령 (2026-05-09):
 *   매물 78954 모달 도로명주소 안 보임. DB road_address/building_info null.
 *
 * 동작 (3-source):
 *   1) listing.building_info['도로명주소'] 또는 listing.road_address (DB)
 *   2) DB null → Kakao reverseGeocoder (lat,lng)
 *
 * listing id source priority:
 *   1) 모달 .v240-num.ws-copy-id 의 data-copy (가장 신뢰)
 *   2) URL ?listing=ID
 *   3) #ws-detail-container dataset.listingId
 *   4) WS.currentListing.id
 */
(function () {
  'use strict';
  var V = 'v334-hero-road-fill';
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function getCurrentListingId() {
    try {
      var numTag = document.querySelector('#ws-detail-container .v240-num.ws-copy-id, #ws-detail-container .ws-copy-id[data-copy]');
      if (numTag) {
        var copy = numTag.getAttribute('data-copy');
        if (copy && /^\d+$/.test(copy)) return String(copy);
        var m = (numTag.textContent || '').match(/\d{4,}/);
        if (m) return String(m[0]);
      }
    } catch (_) {}
    try {
      var params = new URLSearchParams(location.search);
      var lid = params.get('listing');
      if (lid) return String(lid);
    } catch (_) {}
    try {
      var modal = document.getElementById('ws-detail-container');
      if (modal && modal.dataset && modal.dataset.listingId) return String(modal.dataset.listingId);
    } catch (_) {}
    try {
      if (window.WS && window.WS.currentListing && window.WS.currentListing.id) {
        return String(window.WS.currentListing.id);
      }
    } catch (_) {}
    return null;
  }

  function getListingById(id) {
    try {
      var arr = (window.WS && window.WS.allListings) || [];
      for (var i = 0; i < arr.length; i++) {
        if (String(arr[i].id) === String(id)) return arr[i];
      }
    } catch (_) {}
    return null;
  }

  function getRoadFromListing(id) {
    var l = getListingById(id);
    if (!l) return '';
    var bi = l.building_info;
    if (bi && typeof bi === 'object') {
      var r = bi['도로명주소'];
      if (r && String(r).trim().length > 4) return String(r).trim();
    }
    if (l.road_address && String(l.road_address).trim().length > 4) {
      return String(l.road_address).trim();
    }
    return '';
  }

  var _kakaoCache = {};
  function fetchRoadFromKakao(id, callback) {
    var l = getListingById(id);
    if (!l || l.lat == null || l.lng == null) { callback(''); return; }
    var key = l.lat + ',' + l.lng;
    if (_kakaoCache[key] != null) { callback(_kakaoCache[key]); return; }
    if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
      callback(''); return;
    }
    try {
      var geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.coord2Address(parseFloat(l.lng), parseFloat(l.lat), function (result, status) {
        try {
          if (status === window.kakao.maps.services.Status.OK && result && result[0]) {
            var road = (result[0].road_address && result[0].road_address.address_name) || '';
            _kakaoCache[key] = road;
            callback(road);
          } else {
            _kakaoCache[key] = '';
            callback('');
          }
        } catch (_) { callback(''); }
      });
    } catch (_) { callback(''); }
  }

  function applyToHero() {
    try {
      var heroEl = document.getElementById('v240-hero-road');
      if (!heroEl) return;
      var current = (heroEl.textContent || '').trim();
      if (current && current.length > 2) {
        heroEl.dataset.v334Applied = '1';
        return;
      }
      if (heroEl.dataset.v334Applied === '1') return;

      var id = getCurrentListingId();
      if (!id) {
        try { console.log('[' + V + '] no listing id (waiting...)'); } catch (_) {}
        return;
      }

      var road = getRoadFromListing(id);
      if (road) {
        heroEl.textContent = '📍 ' + road;
        heroEl.dataset.v334Applied = '1';
        try { console.log('[' + V + '] filled (db) listing ' + id + ': ' + road); } catch (_) {}
        return;
      }

      heroEl.dataset.v334Applied = '1';
      fetchRoadFromKakao(id, function (kakaoRoad) {
        if (!kakaoRoad) {
          try { console.log('[' + V + '] no road for listing ' + id + ' (db null + kakao empty)'); } catch (_) {}
          return;
        }
        var el = document.getElementById('v240-hero-road');
        if (!el) return;
        var cur = (el.textContent || '').trim();
        if (cur && cur.length > 2) return;
        el.textContent = '📍 ' + kakaoRoad;
        try { console.log('[' + V + '] filled (kakao) listing ' + id + ': ' + kakaoRoad); } catch (_) {}
      });
    } catch (e) {
      try { console.warn('[' + V + '] error:', e); } catch (_) {}
    }
  }

  var t = null;
  function schedule() {
    if (t) return;
    t = setTimeout(function () { t = null; applyToHero(); }, 100);
  }

  var mo = new MutationObserver(function (mutations) {
    var hit = false;
    for (var i = 0; i < mutations.length && !hit; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.id === 'v240-hero-road' || (n.querySelector && n.querySelector('#v240-hero-road'))) {
          hit = true; break;
        }
      }
    }
    if (hit) schedule();
  });

  function init() {
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    applyToHero();
    setTimeout(applyToHero, 500);
    setTimeout(applyToHero, 1500);
    setTimeout(applyToHero, 3500);
    setTimeout(applyToHero, 7000);
    setTimeout(applyToHero, 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try { window.WS = window.WS || {}; window.WS._v334 = { apply: applyToHero, getId: getCurrentListingId }; } catch (_) {}
  try { console.log('[' + V + '] active'); } catch (_) {}
})();
