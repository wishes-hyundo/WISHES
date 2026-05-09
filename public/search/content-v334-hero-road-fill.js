/* /search content-v334 — 모달 hero 도로명주소 직접 채우기
 *
 * 사장님 명령 (2026-05-09):
 *   매물 78954 모달: "도로명 주소가 구주소 뒤에 숨겨져 있음"
 *   기대: hero h1 아래 "📍 경기도 양주시 회천로 234" 표시
 *
 * 원인:
 *   content-v240-detail.js 가 Kakao Geocoder API 로 도로명주소 받아서
 *   #v240-hero-road element 에 채우는데 (line 195), API 실패 또는
 *   응답에 road_address 없으면 빈 상태.
 *
 *   매물 데이터 (listing.building_info['도로명주소'] 또는 listing.road_address)
 *   에 이미 도로명이 있는 케이스가 있어서 직접 채우는 게 더 신뢰 가능.
 *
 * 동작:
 *   #v240-hero-road element 가 비어있으면 (textContent.trim() === ''):
 *     1) URL ?listing=ID 또는 data-listing-id 에서 id 추출
 *     2) WS.allListings 에서 listing 찾기
 *     3) listing.building_info['도로명주소'] 또는 listing.road_address 사용
 *     4) 있으면 textContent = '📍 ' + road
 *
 * 안전:
 *   - 이미 채워져 있으면 (textContent 길이 > 0) skip — Kakao 결과 보존
 *   - data-v334-applied 로 1회만 시도 (반복 호출 안 함)
 */
(function () {
  'use strict';
  var V = 'v334-hero-road-fill';

  // /search 전용
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function getCurrentListingId() {
    // 1) URL ?listing=ID
    try {
      var params = new URLSearchParams(location.search);
      var lid = params.get('listing');
      if (lid) return String(lid);
    } catch (_) {}
    // 2) #ws-detail-container 의 data-listing-id
    try {
      var modal = document.getElementById('ws-detail-container');
      if (modal && modal.dataset && modal.dataset.listingId) {
        return String(modal.dataset.listingId);
      }
    } catch (_) {}
    // 3) WS.currentListing (있으면)
    try {
      if (window.WS && window.WS.currentListing && window.WS.currentListing.id) {
        return String(window.WS.currentListing.id);
      }
    } catch (_) {}
    return null;
  }

  function getRoadFromListing(id) {
    try {
      var arr = (window.WS && window.WS.allListings) || [];
      for (var i = 0; i < arr.length; i++) {
        if (String(arr[i].id) !== String(id)) continue;
        var l = arr[i];
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
    } catch (_) {}
    return '';
  }

  function applyToHero() {
    try {
      var heroEl = document.getElementById('v240-hero-road');
      if (!heroEl) return;
      // 이미 채워져 있으면 skip (Kakao 결과 또는 다른 패치)
      var current = (heroEl.textContent || '').trim();
      if (current && current.length > 2) {
        heroEl.dataset.v334Applied = '1';
        return;
      }
      if (heroEl.dataset.v334Applied === '1') return;

      var id = getCurrentListingId();
      if (!id) return;

      var road = getRoadFromListing(id);
      if (!road) return;

      heroEl.textContent = '📍 ' + road;
      heroEl.dataset.v334Applied = '1';
      try {
        console.log('[' + V + '] filled hero-road for listing ' + id + ': ' + road);
      } catch (_) {}
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try { window.WS = window.WS || {}; window.WS._v334 = { apply: applyToHero }; } catch (_) {}
  try { console.log('[' + V + '] active'); } catch (_) {}
})();
