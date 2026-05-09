/* /search content-v335 v2 — 매물 카드 부 라인 도로명 (전체 표시)
 * 사장님 명령 (2026-05-09): "경기도 양주시 회천로 234" 전체 표시 (short X)
 */
(function () {
  'use strict';
  var V = 'v335-card-road-fallback';
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var _kakaoCache = {};
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
              callback(road);
            } else {
              _kakaoCache[key] = '';
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
      fetchRoadFromKakao(listing.lat, listing.lng, function (road) {
        if (!road) return;
        var el = card.querySelector('.ws-listing-title-sub');
        if (!el) return;
        // 사장님 명령 (2026-05-09): "경기도 양주시 회천로 234" 전체 표시
        el.textContent = road;
        el.style.setProperty('color', '#6b7280', 'important');
        el.style.setProperty('font-weight', '400', 'important');
        el.title = '도로명주소: ' + road;
      });
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

  var mo = new MutationObserver(function (mutations) {
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
