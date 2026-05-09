/* /search content-v334 — 모달 hero 도로명주소 (v7: 단순 텍스트, 배경/테두리 X)
 * 사장님 명령 (2026-05-09):
 *   v6 chip 형태 → "배경 및 테두리 칸은 필요 없음" + h1 위 겹침 fix
 */
(function () {
  'use strict';
  var V = 'v334-hero-road-fill';
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var INJECT_ID = 'v334-road-injected';

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
    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== 'function') {
      callback(''); return;
    }
    window.kakao.maps.load(function () {
      try {
        if (!window.kakao.maps.services || !window.kakao.maps.services.Geocoder) {
          callback(''); return;
        }
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
    });
  }

  // L-v334-simple (2026-05-09 사장님 명령): 배경/테두리 X, 단순 텍스트만
  function injectRoadElement(road) {
    try {
      var modal = document.getElementById('ws-detail-container');
      if (!modal) return false;
      var existing = modal.querySelector('#' + INJECT_ID);
      if (existing) {
        if ((existing.textContent || '').indexOf(road) === -1) {
          existing.textContent = '📍 ' + road;
        }
        return true;
      }
      // 기존 v240-hero-road 빈 element 숨김 (혼란/겹침 방지)
      var origRoad = modal.querySelector('#v240-hero-road');
      if (origRoad) {
        origRoad.style.display = 'none';
      }

      var h1 = modal.querySelector('.v240-hero h1');
      if (!h1) return false;

      var div = document.createElement('div');
      div.id = INJECT_ID;
      div.textContent = '📍 ' + road;
      // 단순 텍스트 — 배경/테두리/padding 모두 제거. h1 다음 line 정상 표시.
      div.style.cssText = [
        'color: #6b7280',
        'font-size: 13px',
        'font-weight: 500',
        'margin: 6px 0 0 0',
        'padding: 0',
        'background: transparent',
        'border: none',
        'display: block',
        'visibility: visible',
        'opacity: 1',
        'clear: both',
        'width: auto',
        'line-height: 1.5',
        'letter-spacing: -0.01em',
        'position: static',
      ].join(' !important; ') + ' !important;';

      // h1 의 nextSibling 으로 삽입 (h1 다음 line)
      if (h1.nextSibling) {
        h1.parentNode.insertBefore(div, h1.nextSibling);
      } else {
        h1.parentNode.appendChild(div);
      }
      return true;
    } catch (e) {
      try { console.warn('[' + V + '] inject error:', e); } catch (_) {}
      return false;
    }
  }

  function applyToHero() {
    try {
      var modal = document.getElementById('ws-detail-container');
      if (!modal) return;
      if (modal.querySelector('#' + INJECT_ID)) return;

      var id = getCurrentListingId();
      if (!id) return;

      var road = getRoadFromListing(id);
      if (road) {
        if (injectRoadElement(road)) {
          try { console.log('[' + V + '] injected (db) listing ' + id + ': ' + road); } catch (_) {}
        }
        return;
      }

      fetchRoadFromKakao(id, function (kakaoRoad) {
        if (!kakaoRoad) {
          try { console.log('[' + V + '] no road for listing ' + id); } catch (_) {}
          return;
        }
        if (injectRoadElement(kakaoRoad)) {
          try { console.log('[' + V + '] injected (kakao) listing ' + id + ': ' + kakaoRoad); } catch (_) {}
        }
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
        if ((n.classList && n.classList.contains('v240-hero')) ||
            (n.querySelector && n.querySelector('.v240-hero h1'))) {
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try { window.WS = window.WS || {}; window.WS._v334 = { apply: applyToHero, getId: getCurrentListingId }; } catch (_) {}
  try { console.log('[' + V + ' v7] active - simple text mode'); } catch (_) {}
})();
