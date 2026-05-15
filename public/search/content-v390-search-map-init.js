/**
 * v390 — /search 의 지도보기 탭에 Kakao Map 직접 init
 * 사장님 명령 2026-05-14.
 *
 * 진단:
 *   - content.js 의 window.WS.initMap (line 5740) 가 Chrome Extension 의
 *     chrome.runtime.getURL('map-main.js') 로 외부 script 로드
 *   - 지금은 일반 웹사이트 → chrome.runtime 없음 → script 로드 X → 지도 회색
 *
 * v390 fix:
 *   - WS.initMap 가 호출되면 chrome 없을 때 fallback path 추가
 *   - Kakao SDK (이미 layout.tsx 에서 load) 직접 사용
 *   - 매물 marker + InfoWindow 표시
 *   - 클러스터링 사용 (libraries=clusterer 이미 load)
 *
 * 회귀 회피:
 *   - 원본 WS.initMap 의 chrome path 그대로 keep (사용자 환경에 따라 동작)
 *   - WS.initMap 호출 시 chrome 분기 시도 → 실패 시에만 우리 inline path
 *   - 다른 모든 기능 (필터, 검색, 카드 list 등) 영향 0
 */
(function () {
  'use strict';
  if (window.__WS_V390_SEARCH_MAP_INIT__) return;
  window.__WS_V390_SEARCH_MAP_INIT__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v390-search-map]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  var DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 }; // 서울 시청
  var DEFAULT_LEVEL = 8;

  function loadKakaoMap(callback) {
    if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
      window.kakao.maps.load(callback);
      return;
    }
    // Kakao SDK 가 아직 로드 중 - 대기
    var attempts = 0;
    var maxAttempts = 50; // 5초
    var iv = setInterval(function () {
      attempts++;
      if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
        clearInterval(iv);
        window.kakao.maps.load(callback);
      } else if (attempts >= maxAttempts) {
        clearInterval(iv);
        log('Kakao SDK 로드 timeout');
      }
    }, 100);
  }

  function formatPrice(l) {
    if (l.deal === '월세') {
      return (l.deposit || 0) + '/' + (l.monthly || 0);
    }
    if (l.deal === '전세') {
      return '전세 ' + (l.deposit || 0) + '만';
    }
    if (l.deal === '매매') {
      return '매매 ' + ((l.price || 0) >= 10000 ? Math.floor(l.price / 10000) + '억' + (l.price % 10000 || '') : (l.price || 0) + '만');
    }
    return '';
  }

  var currentMap = null;
  var currentMarkers = [];
  var currentClusterer = null;
  var currentInfoWindow = null;

  function clearMarkers() {
    if (currentClusterer) {
      try { currentClusterer.clear(); } catch (_) {}
    }
    currentMarkers.forEach(function (m) {
      try { m.setMap(null); } catch (_) {}
    });
    currentMarkers = [];
  }

  function renderMap() {
    var container = document.getElementById('ws-map-container');
    if (!container) {
      log('ws-map-container not found');
      return;
    }

    // 매물 데이터 추출
    var allListings = (window.WS && window.WS.filtered) || (window.WS && window.WS.allListings) || [];
    var validListings = allListings.filter(function (l) { return l.lat && l.lng; });
    log('rendering map with', validListings.length, '/', allListings.length, 'listings');

    // map div 준비
    var mapDiv = document.getElementById('ws-kakao-map');
    if (!mapDiv || mapDiv.children.length === 0) {
      container.innerHTML = '<div id="ws-kakao-map" style="width:100%;height:600px;border-radius:8px;"></div>';
      mapDiv = document.getElementById('ws-kakao-map');
    }

    loadKakaoMap(function () {
      try {
        // 처음 로드: map 새로 생성
        if (!currentMap) {
          var center = validListings.length > 0
            ? new kakao.maps.LatLng(validListings[0].lat, validListings[0].lng)
            : new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);

          currentMap = new kakao.maps.Map(mapDiv, {
            center: center,
            level: validListings.length > 0 ? 6 : DEFAULT_LEVEL,
          });

          // 클러스터러 init (libraries=clusterer 이미 로드됨)
          if (kakao.maps.MarkerClusterer) {
            currentClusterer = new kakao.maps.MarkerClusterer({
              map: currentMap,
              averageCenter: true,
              minLevel: 5,
            });
          }

          // InfoWindow
          currentInfoWindow = new kakao.maps.InfoWindow({ removable: true });
        } else {
          // 재호출: marker 만 다시 그리기 (map 유지)
          clearMarkers();
        }

        // marker 생성
        validListings.forEach(function (l) {
          try {
            var pos = new kakao.maps.LatLng(l.lat, l.lng);
            var marker = new kakao.maps.Marker({ position: pos });
            var content = '<div style="padding:8px 10px;font-size:12px;line-height:1.4;min-width:180px;">' +
              '<div style="font-weight:700;color:#2D5A27;margin-bottom:4px;">매물 ' + l.id + ' · ' + (l.deal || '') + '</div>' +
              '<div style="font-size:11px;color:#555;margin-bottom:2px;">' + (l.address || '') + '</div>' +
              '<div style="font-weight:600;">' + formatPrice(l) + '</div>' +
              '</div>';
            kakao.maps.event.addListener(marker, 'click', function () {
              currentInfoWindow.setContent(content);
              currentInfoWindow.open(currentMap, marker);
            });
            currentMarkers.push(marker);
          } catch (e) {
            log('marker create fail for', l.id, e && e.message);
          }
        });

        // 클러스터에 추가
        if (currentClusterer) {
          currentClusterer.addMarkers(currentMarkers);
        } else {
          // 클러스터 없으면 직접 map 에 add
          currentMarkers.forEach(function (m) { m.setMap(currentMap); });
        }

        // viewport — 모든 marker 포함하도록
        if (validListings.length > 1) {
          var bounds = new kakao.maps.LatLngBounds();
          validListings.forEach(function (l) {
            bounds.extend(new kakao.maps.LatLng(l.lat, l.lng));
          });
          currentMap.setBounds(bounds);
        }

        log('map rendered with', currentMarkers.length, 'markers');
      } catch (e) {
        log('renderMap error:', e && e.message);
      }
    });
  }

  function installInitMapWrap() {
    if (!window.WS) return setTimeout(installInitMapWrap, 100);
    if (window.WS.__v390InitMapWrapped) return;
    window.WS.__v390InitMapWrapped = true;

    var origInitMap = typeof window.WS.initMap === 'function' ? window.WS.initMap : null;
    window.WS.initMap = function () {
      // chrome extension 환경이면 원본 path 시도
      if (origInitMap && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        try {
          return origInitMap.apply(this, arguments);
        } catch (e) {
          log('orig initMap error:', e && e.message);
        }
      }
      // 일반 웹사이트 → 우리 inline kakao map
      renderMap();
    };

    // 이미 지도 탭이 활성 상태면 즉시 render
    var container = document.getElementById('ws-map-container');
    if (container && container.style.display !== 'none' && container.offsetParent !== null) {
      setTimeout(renderMap, 100);
    }

    log('initMap wrapped');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installInitMapWrap);
  } else {
    installInitMapWrap();
  }

  // 탭 전환 감지 — 지도보기 탭 click 시 render
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t) return;
    var btn = t.closest && t.closest('button');
    if (!btn) return;
    if (btn.matches && btn.matches('[data-view="map"], .ws-tab[data-view="map"]')) {
      // 모달 탭 click — 잠시 후 render
      setTimeout(renderMap, 200);
    }
  }, true);
})();
