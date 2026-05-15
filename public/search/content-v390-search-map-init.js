/**
 * v390 v7 — /search 지도보기 (cluster 깔끔 + 빠름)
 * 사장님 명령 2026-05-14.
 *
 * v6 가 cluster 너무 많고 겹침 → v7:
 *   1. server zoom 매핑 18-zoom (더 큰 cluster)
 *   2. cluster size 차등화 (count 별 다른 크기)
 *   3. 가까운 cluster client-side 합치기 (50px 이내 합침)
 *   4. 큰 cluster 위에 작은 cluster z-index 우선
 */
(function () {
  'use strict';
  if (window.__WS_V390_SEARCH_MAP_INIT__) return;
  window.__WS_V390_SEARCH_MAP_INIT__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v390 v7]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  var DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };
  var DEFAULT_LEVEL = 11;
  var CLUSTER_ENDPOINT = '/api/map/clusters';
  var DEBOUNCE_MS = 500;
  var MERGE_DISTANCE_PX = 50; // 50px 이내 cluster 합침

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

  // count 별 marker 스타일
  function getStyleForCount(count) {
    if (count >= 1000) {
      return { size: 56, fontSize: 16, bg: 'rgba(180,30,30,0.92)', border: '2px solid #fff' };
    } else if (count >= 100) {
      return { size: 48, fontSize: 15, bg: 'rgba(220,80,30,0.92)', border: '2px solid #fff' };
    } else if (count >= 30) {
      return { size: 40, fontSize: 14, bg: 'rgba(220,150,30,0.92)', border: '2px solid #fff' };
    } else if (count >= 10) {
      return { size: 36, fontSize: 13, bg: 'rgba(45,90,39,0.92)', border: '2px solid #fff' };
    } else {
      return { size: 30, fontSize: 12, bg: 'rgba(80,120,80,0.85)', border: '1.5px solid #fff' };
    }
  }

  // 가까운 cluster 합치기 (client-side merge)
  function mergeNearbyCluster(clusters, projection) {
    if (!projection || clusters.length < 2) return clusters;
    var pts = clusters.map(function (c) {
      var lat = c.lat || c.latitude || (c.center && c.center.lat);
      var lng = c.lng || c.longitude || (c.center && c.center.lng);
      var count = c.count || c.n || (c.sample_ids ? c.sample_ids.length : 1);
      try {
        var px = projection.containerPointFromCoords(new kakao.maps.LatLng(lat, lng));
        return { lat: lat, lng: lng, count: count, px: px.x, py: px.y, merged: false };
      } catch (e) { return null; }
    }).filter(Boolean);

    var result = [];
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].merged) continue;
      var cur = pts[i];
      var totalCount = cur.count;
      var sumLat = cur.lat * cur.count;
      var sumLng = cur.lng * cur.count;
      for (var j = i + 1; j < pts.length; j++) {
        if (pts[j].merged) continue;
        var dx = pts[j].px - cur.px;
        var dy = pts[j].py - cur.py;
        if (dx * dx + dy * dy < MERGE_DISTANCE_PX * MERGE_DISTANCE_PX) {
          totalCount += pts[j].count;
          sumLat += pts[j].lat * pts[j].count;
          sumLng += pts[j].lng * pts[j].count;
          pts[j].merged = true;
        }
      }
      result.push({ lat: sumLat / totalCount, lng: sumLng / totalCount, count: totalCount });
    }
    return result;
  }

  function fetchClusters(map) {
    if (!map) return;
    try {
      var bounds = map.getBounds();
      var sw = bounds.getSouthWest();
      var ne = bounds.getNorthEast();
      var zoom = map.getLevel();
      var serverZoom = Math.max(1, Math.min(18, 18 - zoom));

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

      log('fetch z=' + zoom + '/sz=' + serverZoom);
      fetch(url, { signal: ctrl.signal, credentials: 'include' })
        .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
        .then(function (data) {
          var clusters = (data && (data.clusters || data.data)) || [];
          log('server clusters', clusters.length);
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
    if (!Array.isArray(clusters) || clusters.length === 0) return;

    // client-side merge — 화면 가까운 cluster 합치기
    var projection = null;
    try { projection = currentMap.getProjection(); } catch (_) {}
    var merged = mergeNearbyCluster(clusters, projection);
    log('after merge:', merged.length);

    merged.forEach(function (c) {
      try {
        if (!c.lat || !c.lng) return;
        var pos = new kakao.maps.LatLng(c.lat, c.lng);
        var style = getStyleForCount(c.count);
        var content = document.createElement('div');
        content.style.cssText =
          'background:' + style.bg + ';' +
          'color:#fff;' +
          'font-weight:700;' +
          'font-size:' + style.fontSize + 'px;' +
          'width:' + style.size + 'px;' +
          'height:' + style.size + 'px;' +
          'line-height:' + (style.size - 4) + 'px;' +
          'border-radius:50%;' +
          'border:' + style.border + ';' +
          'box-shadow:0 2px 6px rgba(0,0,0,0.4);' +
          'text-align:center;' +
          'cursor:pointer;' +
          'user-select:none;';
        content.textContent = String(c.count);
        var overlay = new kakao.maps.CustomOverlay({
          position: pos, content: content, yAnchor: 0.5, xAnchor: 0.5,
          zIndex: c.count,
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
