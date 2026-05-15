/**
 * v390 v8 — 애플 스타일 cluster + click 작동 fix
 * 사장님 명령 2026-05-14.
 *
 * - 테두리 제거, 부드러운 그림자, 단일 톤 색상
 * - cluster 클릭 → 자동 줌인 + 매물 popup 가능
 * - hover/active 부드러운 transition
 */
(function () {
  'use strict';
  if (window.__WS_V390_SEARCH_MAP_INIT__) return;
  window.__WS_V390_SEARCH_MAP_INIT__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v390 v8]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  var DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };
  var DEFAULT_LEVEL = 11;
  var CLUSTER_ENDPOINT = '/api/map/clusters';
  var DEBOUNCE_MS = 500;
  var MERGE_DISTANCE_PX = 60;

  // 애플 스타일 CSS 한 번만 inject
  function injectAppleStyle() {
    if (document.getElementById('v390-apple-style')) return;
    var s = document.createElement('style');
    s.id = 'v390-apple-style';
    s.textContent = [
      '.v390-pin{',
      '  display:flex;align-items:center;justify-content:center;',
      '  border-radius:9999px;color:#fff;font-weight:600;',
      '  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Pretendard Variable",sans-serif;',
      '  letter-spacing:-0.02em;',
      '  box-shadow:0 4px 14px rgba(0,0,0,0.18),0 1px 3px rgba(0,0,0,0.10);',
      '  cursor:pointer;user-select:none;',
      '  transition:transform 0.2s cubic-bezier(0.4,0,0.2,1),box-shadow 0.2s ease;',
      '  will-change:transform;',
      '}',
      '.v390-pin:hover{',
      '  transform:scale(1.12);',
      '  box-shadow:0 6px 20px rgba(0,0,0,0.25),0 2px 6px rgba(0,0,0,0.15);',
      '}',
      '.v390-pin:active{',
      '  transform:scale(0.96);',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function loadKakaoMap(callback) {
    if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
      window.kakao.maps.load(callback);
      return;
    }
    var n = 0;
    var iv = setInterval(function () {
      n++;
      if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
        clearInterval(iv);
        window.kakao.maps.load(callback);
      } else if (n >= 50) {
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

  // 애플 스타일 — 모두 단일 톤 (사이트 브랜드 녹색), 크기만 차등
  function getStyleForCount(count) {
    if (count >= 1000) return { size: 56, fontSize: 16, bg: '#1B4D1A' };
    if (count >= 100)  return { size: 48, fontSize: 15, bg: '#2D5A27' };
    if (count >= 30)   return { size: 42, fontSize: 14, bg: '#3A7D34' };
    if (count >= 10)   return { size: 36, fontSize: 13, bg: '#4FA046' };
    return                    { size: 30, fontSize: 12, bg: '#66BB6A' };
  }

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

    var projection = null;
    try { projection = currentMap.getProjection(); } catch (_) {}
    var merged = mergeNearbyCluster(clusters, projection);
    log('clusters', clusters.length, '→ merged', merged.length);

    merged.forEach(function (c) {
      try {
        if (!c.lat || !c.lng) return;
        var pos = new kakao.maps.LatLng(c.lat, c.lng);
        var style = getStyleForCount(c.count);
        var pin = document.createElement('div');
        pin.className = 'v390-pin';
        pin.style.background = style.bg;
        pin.style.width = style.size + 'px';
        pin.style.height = style.size + 'px';
        pin.style.fontSize = style.fontSize + 'px';
        pin.textContent = String(c.count);
        // click handler — 자동 줌인
        pin.addEventListener('click', function (ev) {
          try { ev.stopPropagation(); } catch (_) {}
          var newLevel = Math.max(1, currentMap.getLevel() - 2);
          currentMap.setLevel(newLevel, { anchor: pos, animate: true });
        }, false);
        var overlay = new kakao.maps.CustomOverlay({
          position: pos, content: pin, yAnchor: 0.5, xAnchor: 0.5,
          zIndex: c.count,
          clickable: true,
        });
        overlay.setMap(currentMap);
        currentMarkers.push(overlay);
      } catch (e) {}
    });
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
    if (!container) return;

    injectAppleStyle();

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
      if (mapTab || visible) renderMap();
    } catch (e) {}
  }

  function installInitMapWrap() {
    if (!window.WS) return setTimeout(installInitMapWrap, 200);
    if (window.WS.__v390InitMapWrapped) return;
    window.WS.__v390InitMapWrapped = true;

    var origInitMap = typeof window.WS.initMap === 'function' ? window.WS.initMap : null;
    window.WS.initMap = function () {
      if (origInitMap && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        try { return origInitMap.apply(this, arguments); } catch (e) {}
      }
      setTimeout(renderMap, 100);
    };

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
      setTimeout(renderMap, 200);
    }
  }, true);
})();
