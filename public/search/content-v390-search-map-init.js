/**
 * v390 v6 — /search 지도보기 (auto-render + click)
 * 사장님 명령 2026-05-14.
 *
 * - 자동 init render: 페이지 init 후 1.5초 뒤 — 지도 탭 active 면 render
 * - WS.initMap wrap: content.js 가 호출 시 우리 path 사용
 * - click backup: 지도 탭 click 시에도 render
 * - server cluster API 사용 (수십 marker)
 */
(function () {
  'use strict';
  if (window.__WS_V390_SEARCH_MAP_INIT__) return;
  window.__WS_V390_SEARCH_MAP_INIT__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v390 v6]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  var DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };
  var DEFAULT_LEVEL = 11; // [v6 사장님] 더 멀리 시작 - cluster 적게
  var CLUSTER_ENDPOINT = '/api/map/clusters';
  var DEBOUNCE_MS = 500;

  function loadKakaoMap(callback) {
    if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
      window.kakao.maps.load(callback);
      return;
    }
    var attempts = 0;
    var iv = setInterval(function () {
      attempts++;
      if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
        clearInterval(iv);
        window.kakao.maps.load(callback);
      } else if (attempts >= 50) {
        clearInterval(iv);
        log('Kakao SDK timeout');
      }
    }, 100);
  }

  var currentMap = null;
  var currentMarkers = [];
  var clusterFetchTimer = null;
  var inflightController = null;
  var ignoreBoundsChanges = true;

  function clearMarkers() {
    currentMarkers.forEach(function (m) {
      try { m.setMap(null); } catch (_) {}
    });
    currentMarkers = [];
  }

  function fetchClusters(map) {
    if (!map) return;
    try {
      var bounds = map.getBounds();
      var sw = bounds.getSouthWest();
      var ne = bounds.getNorthEast();
      var zoom = map.getLevel();
      var serverZoom = Math.max(1, Math.min(20, 20 - zoom)); // [v6 사장님] 매핑 조정 cluster 줄임

      if (inflightController) {
        try { inflightController.abort(); } catch (_) {}
      }
      var ctrl = new AbortController();
      inflightController = ctrl;

      var url = CLUSTER_ENDPOINT +
        '?swLat=' + sw.getLat() +
        '&swLng=' + sw.getLng() +
        '&neLat=' + ne.getLat() +
        '&neLng=' + ne.getLng() +
        '&zoom=' + serverZoom;

      log('fetch clusters z=' + zoom);
      fetch(url, { signal: ctrl.signal, credentials: 'include' })
        .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
        .then(function (data) {
          var clusters = (data && (data.clusters || data.data)) || [];
          log('clusters', clusters.length);
          renderClusters(clusters);
        })
        .catch(function (e) {
          if (e && e.name === 'AbortError') return;
          log('fetch fail:', e && e.message);
        })
        .finally(function () { if (inflightController === ctrl) inflightController = null; });
    } catch (e) {
      log('fetchClusters err:', e && e.message);
    }
  }

  function renderClusters(clusters) {
    if (!currentMap) return;
    clearMarkers();
    if (!Array.isArray(clusters)) return;
    clusters.forEach(function (c) {
      try {
        var lat = c.lat || c.latitude || (c.center && c.center.lat);
        var lng = c.lng || c.longitude || (c.center && c.center.lng);
        var count = c.count || c.n || (c.sample_ids ? c.sample_ids.length : 1);
        if (!lat || !lng) return;
        var pos = new kakao.maps.LatLng(lat, lng);
        var content = document.createElement('div');
        content.style.cssText = 'background:rgba(45,90,39,0.9);color:#fff;font-weight:700;font-size:13px;padding:6px 12px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);min-width:32px;text-align:center;cursor:pointer;';
        content.textContent = String(count);
        var overlay = new kakao.maps.CustomOverlay({
          position: pos, content: content, yAnchor: 0.5, xAnchor: 0.5,
        });
        overlay.setMap(currentMap);
        currentMarkers.push(overlay);
        content.addEventListener('click', function () {
          var newLevel = Math.max(1, currentMap.getLevel() - 2);
          currentMap.setLevel(newLevel, { anchor: pos });
        });
      } catch (e) {}
    });
    log('rendered', currentMarkers.length, 'bubbles');
  }

  function scheduleClusterFetch() {
    if (ignoreBoundsChanges) return;
    if (clusterFetchTimer) clearTimeout(clusterFetchTimer);
    clusterFetchTimer = setTimeout(function () {
      clusterFetchTimer = null;
      if (currentMap) fetchClusters(currentMap);
    }, DEBOUNCE_MS);
  }

  function renderMap() {
    var container = document.getElementById('ws-map-container');
    if (!container) {
      log('no ws-map-container');
      return;
    }

    var mapDiv = document.getElementById('ws-kakao-map');
    if (!mapDiv || mapDiv.children.length === 0) {
      container.innerHTML = '<div id="ws-kakao-map" style="width:100%;height:600px;border-radius:8px;"></div>';
      mapDiv = document.getElementById('ws-kakao-map');
    }

    loadKakaoMap(function () {
      try {
        if (!currentMap) {
          currentMap = new kakao.maps.Map(mapDiv, {
            center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
            level: DEFAULT_LEVEL,
          });
          ignoreBoundsChanges = true;
          kakao.maps.event.addListener(currentMap, 'idle', scheduleClusterFetch);
          setTimeout(function () {
            ignoreBoundsChanges = false;
            fetchClusters(currentMap);
          }, 500);
          log('map created');
        } else {
          fetchClusters(currentMap);
        }
      } catch (e) {
        log('renderMap err:', e && e.message);
      }
    });
  }

  function checkAutoRender() {
    try {
      var mapTab = document.querySelector('.ws-tab[data-view="map"].ws-tab-active, .ws-tab.ws-tab-active[data-view="map"]');
      var container = document.getElementById('ws-map-container');
      var visible = container && container.style.display !== 'none' && container.offsetParent !== null;
      if (mapTab || visible) {
        log('auto render — map tab active');
        renderMap();
      } else {
        log('auto render skip');
      }
    } catch (e) {
      log('auto render err:', e && e.message);
    }
  }

  function installInitMapWrap() {
    if (!window.WS) return setTimeout(installInitMapWrap, 200);
    if (window.WS.__v390InitMapWrapped) return;
    window.WS.__v390InitMapWrapped = true;

    var origInitMap = typeof window.WS.initMap === 'function' ? window.WS.initMap : null;
    window.WS.initMap = function () {
      log('WS.initMap called');
      if (origInitMap && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        try { return origInitMap.apply(this, arguments); } catch (e) {}
      }
      setTimeout(renderMap, 100);
    };

    log('initMap wrapped');

    setTimeout(checkAutoRender, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installInitMapWrap);
  } else {
    installInitMapWrap();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t) return;
    var btn = t.closest && t.closest('button, .ws-tab');
    if (!btn) return;
    if (btn.matches && btn.matches('[data-view="map"], .ws-tab[data-view="map"]')) {
      log('tab clicked');
      setTimeout(renderMap, 200);
    }
  }, true);
})();
