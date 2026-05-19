/* /search content-v327 — 카드 부 라인 = 도로명주소 (있을 때만)
 *
 * 사장님 명령 (2026-04-29):
 *   "메인 굵은건 구주소 바로 아래 얇은 글씨는 도로명 주소로 나와야 되는데
 *    둘다 구주소로 나오고 있어"
 *
 * 동작:
 *   카드 .ws-listing-title-sub 의 표시를 도로명주소로 교체.
 *   우선순위:
 *     1) listing.building_info?.['도로명주소'] (jsonb)
 *     2) listing.road_address (top-level, 있다면)
 *     3) 없으면 원본(listing.title) 그대로 유지 — 현재 동작
 *
 * 데이터: window.WS.allListings (id → building_info / road_address)
 *
 * 영향:
 *   - 메인 .ws-listing-addr 는 그대로 (지번주소 풀주소)
 *   - 부 .ws-listing-title-sub 만 도로명주소 (있을 때)
 *   - 도로명 없는 매물은 기존 표시 유지 (안전)
 *
 * 시각: 도로명주소는 #6b7280 회색 + 옅은 글씨로 구분 (메인과 차별).
 */
(function () {
  'use strict';
  var V = 'v327-road-address-sub';

  function getRoadAddrById(id) {
    var arr = (window.WS && window.WS.allListings) || [];
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].id) === String(id)) {
        var l = arr[i];
        var bi = l.building_info;
        if (bi && typeof bi === 'object') {
          var r = bi['도로명주소'];
          if (r && String(r).trim().length > 4) return String(r).trim();
        }
        if (l.road_address && String(l.road_address).trim().length > 4) {
          return String(l.road_address).trim();
        }
        return ''; // listing 있는데 도로명 없음
      }
    }
    return null; // listings 아직 로드 전
  }

  function applyToCard(card) {
    if (!card) return;
    var id = card.getAttribute('data-listing-id');
    if (!id) return;
    var sub = card.querySelector('.ws-listing-title-sub');
    if (!sub) return;

    var road = getRoadAddrById(id);
    if (road === null) return; // 아직 데이터 X — 다음 sweep 에 재시도

    // 원본 보존 (한 번만)
    if (!sub.dataset.v327Original) {
      sub.dataset.v327Original = sub.textContent || '';
    }

    if (road && road.length > 4) {
      // 도로명 있음 → "서울특별시 X구 / 서울 X구 / X구" prefix 제거 (메인과 중복).
      // 사장님 명령 (2026-04-29): "굳이 서울 관악구 반복하지 말고 신림로11길 123-14 이렇게만"
      var roadShort = road.replace(/^서울특별시\s+[가-힣]+[구군]\s+/, '')
                          .replace(/^서울\s+[가-힣]+[구군]\s+/, '')
                          .replace(/^경기도?\s+[가-힣]+[시군]\s+/, '')
                          .replace(/^인천(광역시)?\s+[가-힣]+[구군]\s+/, '')
                          .replace(/^[가-힣]+[구군]\s+/, '');
      if (sub.dataset.v327Mode !== 'road' || (sub.textContent || '').trim() !== roadShort) {
        sub.textContent = roadShort;
        sub.dataset.v327Mode = 'road';
        sub.style.color = '#6b7280';
        sub.style.fontWeight = '400';
        sub.title = '도로명주소: ' + road;
      }
    } else {
      // 도로명 없음 → 원본 유지 (한 번만 reset)
      if (sub.dataset.v327Mode !== 'orig') {
        if (sub.dataset.v327Original) sub.textContent = sub.dataset.v327Original;
        sub.dataset.v327Mode = 'orig';
        sub.style.color = '';
        sub.style.fontWeight = '';
      }
    }
  }

  function sweep() {
    try {
      var cards = document.querySelectorAll('.ws-listing-card');
      cards.forEach(applyToCard);
    } catch (e) {
      try { console.warn('[' + V + '] sweep error:', e); } catch (_) {}
    }
  }

  var t = null;
  function scheduleSweep() {
    if (t) return;
    t = setTimeout(function () { t = null; sweep(); }, 80);
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
        if (n.classList && (n.classList.contains('ws-listing-card') ||
                            n.classList.contains('ws-listing-title-sub'))) { hit = true; break; }
        if (n.querySelector && n.querySelector('.ws-listing-card, .ws-listing-title-sub')) { hit = true; break; }
      }
    }
    if (hit) scheduleSweep();
  });

  function init() {
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    sweep();
    setTimeout(sweep, 500);
    setTimeout(sweep, 1500);
    setTimeout(sweep, 3000);
    setTimeout(sweep, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try { window.WS = window.WS || {}; window.WS._v327 = { sweep: sweep, getRoadAddrById: getRoadAddrById }; } catch (_) {}
})();
