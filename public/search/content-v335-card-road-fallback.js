/* /search content-v335 v2 — 매물 카드 부 라인 도로명 (전체 표시)
 * 사장님 명령 (2026-05-09): "경기도 양주시 회천로 234" 전체 표시 (short X)
 */
(function () {
  'use strict';
  var V = 'v335-card-road-fallback';
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // L-perf-v335-2026-05-10 (사장님 명령 Fix 5): localStorage cache 영구.
  //   이전: _kakaoCache 메모리만 → 페이지 새로고침 시 초기화 → 매번 60K 매물 호출 → 1.3분.
  //   이후: localStorage 영구 cache. 같은 좌표 매물 cache HIT → 호출 ~0 회.
  var STORAGE_KEY = 'ws_v335_road_cache';
  var MAX_CACHE_ENTRIES = 5000; // 5000 entries × ~50 byte = ~250 KB localStorage
  var _kakaoCache = {};
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) _kakaoCache = JSON.parse(raw) || {};
  } catch (_) {}
  var _saveTimer = null;
  function _scheduleSave() {
    if (_saveTimer) return;
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      try {
        // size 제한: 너무 크면 가장 오래된 절반 제거
        var keys = Object.keys(_kakaoCache);
        if (keys.length > MAX_CACHE_ENTRIES) {
          var newCache = {};
          for (var i = keys.length - MAX_CACHE_ENTRIES / 2; i < keys.length; i++) {
            newCache[keys[i]] = _kakaoCache[keys[i]];
          }
          _kakaoCache = newCache;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_kakaoCache));
      } catch (_) {}
    }, 1000);
  }

  function fetchRoadFromKakao(lat, lng, callback) {
    if (lat == null || lng == null) { callback(''); return; }
    var key = lat + ',' + lng;
    if (_kakaoCache[key] != null) { callback(_kakaoCache[key]); return; }
    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== 'function') {
      callback(''); return;
    }
    window.kakao.maps.load(function () {
      try {
        if (!window.kakao.maps.services || !window.kakao.maps.services.Geocoder) {
          callback(''); return;
        }
        var geocoder = new window.kakao.maps.services.Geocoder();
        geocoder.coord2Address(parseFloat(lng), parseFloat(lat), function (result, status) {
          try {
            if (status === window.kakao.maps.services.Status.OK && result && result[0]) {
              var road = (result[0].road_address && result[0].road_address.address_name) || '';
              _kakaoCache[key] = road;
              _scheduleSave();
              callback(road);
            } else {
              _kakaoCache[key] = '';
              _scheduleSave();
              callback('');
            }
          } catch (_) { callback(''); }
        });
      } catch (_) { callback(''); }
    });
  }

  function applyToCard(card) {
    try {
      var sub = card.querySelector('.ws-listing-title-sub');
      if (!sub) return;
      if (sub.dataset.v335Applied === '1') return;
      if (sub.dataset.v327Mode === 'road') {
        sub.dataset.v335Applied = '1';
        return;
      }

      var id = card.getAttribute('data-listing-id');
      if (!id) return;

      var arr = (window.WS && window.WS.allListings) || [];
      var listing = null;
      for (var i = 0; i < arr.length; i++) {
        if (String(arr[i].id) === String(id)) { listing = arr[i]; break; }
      }
      if (!listing) return;

      if (listing.road_address) return;
      var bi = listing.building_info;
      if (bi && typeof bi === 'object' && bi['도로명주소']) return;

      if (listing.lat == null || listing.lng == null) return;

      sub.dataset.v335Applied = '1';
      // L-perf-fix-11-2026-05-10 (사장님 명령 coord2address 잡기):
      //   Kakao API 호출 자체 제거. listing.address (지번주소) 즉시 표시.
      //   도로명주소는 Fix 6 의 cron 이 5일 내 backfill → 그 후 listing.road_address.
      //   사장님 명령 (2026-05-09 도로명 표시) vs (2026-05-10 속도) 둘 다 균형:
      //     - cron 채워진 매물 → 도로명 표시 (이미 listing.road_address 분기에서 skip)
      //     - cron 안 채워진 매물 → 지번주소 (listing.address) 표시 (빈 채 X)
      //     - Kakao API 호출 0 회.
      var el = sub;
      var fallbackAddr = listing.address || '';
      if (fallbackAddr) {
        el.textContent = fallbackAddr;
        el.style.setProperty('color', '#6b7280', 'important');
        el.style.setProperty('font-weight', '400', 'important');
        el.title = '주소: ' + fallbackAddr;
      }
      // 옛 fetchRoadFromKakao 호출 영구 제거 (Kakao API 호출 자체 안 함)
    } catch (e) {
      try { console.warn('[' + V + '] error:', e); } catch (_) {}
    }
  }

  function sweep() {
    try {
      var cards = document.querySelectorAll('.ws-listing-card');
      cards.forEach(applyToCard);
    } catch (_) {}
  }

  var t = null;
  function schedule() {
    if (t) return;
    t = setTimeout(function () { t = null; sweep(); }, 200);
  }

  var __mo_throttle = null;
  var mo = new MutationObserver(function (mutations) {
    // [Step 37 fix 2026-05-19 사장님 명령] throttle 250ms — Observer cascade freeze 차단
    if (__mo_throttle) return;
    __mo_throttle = setTimeout(function() { __mo_throttle = null; }, 1000);
    var hit = false;
    for (var i = 0; i < mutations.length && !hit; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if ((n.classList && n.classList.contains('ws-listing-card')) ||
            (n.querySelector && n.querySelector('.ws-listing-card'))) {
          hit = true; break;
        }
      }
    }
    if (hit) schedule();
  });

  function init() {
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    sweep();
    setTimeout(sweep, 1000);
    setTimeout(sweep, 3000);
    setTimeout(sweep, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try { window.WS = window.WS || {}; window.WS._v335 = { sweep: sweep }; } catch (_) {}
  try { console.log('[' + V + ' v2] active - full road display'); } catch (_) {}
})();
