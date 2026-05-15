/**
 * v390 v10 — 진짜 Apple Maps 스타일 + 매물 list popup
 * 사장님 명령 2026-05-14.
 *
 * Apple Maps 실제 cluster: solid red 둥근 핀 + 흰 텍스트 + drop shadow.
 * 클릭 시: 줌인 가능하면 줌인, max zoom 이면 매물 list popup.
 */
(function () {
  'use strict';
  if (window.__WS_V390_SEARCH_MAP_INIT__) return;
  window.__WS_V390_SEARCH_MAP_INIT__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v390 v10]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  var DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };
  var DEFAULT_LEVEL = 11;
  var CLUSTER_ENDPOINT = '/api/map/clusters';
  var ITEMS_ENDPOINT = '/api/map/items';
  var DEBOUNCE_MS = 500;
  var MERGE_DISTANCE_PX = 60;
  var MIN_ZOOM_LEVEL = 1;

  function injectAppleStyle() {
    if (document.getElementById('v390-apple-style')) return;
    var s = document.createElement('style');
    s.id = 'v390-apple-style';
    s.textContent = [
      '.v390-pin{',
      '  display:flex;align-items:center;justify-content:center;',
      '  border-radius:50%;color:#fff;font-weight:700;',
      '  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Pretendard Variable",sans-serif;',
      '  letter-spacing:-0.02em;',
      '  background:#5E5CE6;',  // [v11 사장님] Apple Indigo - 부드러움
      '  box-shadow:0 2px 6px rgba(94,92,230,0.20),0 4px 16px rgba(0,0,0,0.10);',
      '  cursor:pointer;user-select:none;',
      '  transition:transform 0.2s cubic-bezier(0.4,0,0.2,1),box-shadow 0.2s ease;',
      '  will-change:transform;',
      '}',
      '.v390-pin.v390-single{',
      '  background:#34C759;',
      '  box-shadow:0 2px 6px rgba(52,199,89,0.20),0 4px 16px rgba(0,0,0,0.10);',
      '}',
      '.v390-pin:hover{',
      '  transform:scale(1.10);',
      '  box-shadow:0 4px 12px rgba(94,92,230,0.30),0 6px 20px rgba(0,0,0,0.15);',
      '}',
      '.v390-pin.v390-single:hover{',
      '  box-shadow:0 4px 12px rgba(52,199,89,0.30),0 6px 20px rgba(0,0,0,0.15);',
      '}',
      '.v390-pin:active{transform:scale(0.94);transition-duration:0.1s;}',

      '.v390-popup{',
      '  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);',
      '  width:min(420px,90vw);max-height:75vh;',
      '  background:rgba(250,250,252,0.96);',
      '  backdrop-filter:blur(40px) saturate(180%);',
      '  -webkit-backdrop-filter:blur(40px) saturate(180%);',
      '  border-radius:16px;',
      '  box-shadow:0 20px 50px rgba(0,0,0,0.30),0 4px 12px rgba(0,0,0,0.10);',
      '  z-index:99999;overflow:hidden;display:flex;flex-direction:column;',
      '  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Pretendard Variable",sans-serif;',
      '  animation:v390pop 0.25s cubic-bezier(0.4,0,0.2,1);',
      '}',
      '@keyframes v390pop{from{opacity:0;transform:translate(-50%,-48%) scale(0.95);}to{opacity:1;transform:translate(-50%,-50%) scale(1);}}',
      '.v390-popup-header{',
      '  display:flex;align-items:center;justify-content:space-between;',
      '  padding:14px 18px 10px;border-bottom:0.5px solid rgba(0,0,0,0.10);',
      '}',
      '.v390-popup-title{font-size:16px;font-weight:700;color:#1d1d1f;letter-spacing:-0.02em;}',
      '.v390-popup-close{',
      '  width:28px;height:28px;border-radius:50%;border:none;',
      '  background:rgba(0,0,0,0.06);color:#3c3c43;',
      '  font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;',
      '  transition:background 0.15s ease;',
      '}',
      '.v390-popup-close:hover{background:rgba(0,0,0,0.12);}',
      '.v390-popup-list{flex:1;overflow-y:auto;padding:4px 0;}',
      '.v390-popup-item{',
      '  display:flex;flex-direction:column;gap:2px;',
      '  padding:12px 18px;cursor:pointer;',
      '  border-bottom:0.5px solid rgba(0,0,0,0.06);',
      '  transition:background 0.12s ease;',
      '}',
      '.v390-popup-item:last-child{border-bottom:none;}',
      '.v390-popup-item:hover{background:rgba(0,122,255,0.08);}',
      '.v390-popup-id{font-size:11px;color:#8e8e93;font-weight:600;}',
      '.v390-popup-addr{font-size:14px;color:#1d1d1f;font-weight:500;letter-spacing:-0.01em;}',
      '.v390-popup-price{font-size:13px;color:#007AFF;font-weight:600;margin-top:2px;}',

      '.v390-popup-backdrop{',
      '  position:fixed;inset:0;background:rgba(0,0,0,0.30);',
      '  z-index:99998;',
      '  animation:v390fade 0.2s ease;',
      '}',
      '@keyframes v390fade{from{opacity:0;}to{opacity:1;}}',
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

  // [v19 사장님] zoom 따라 동적 size — 멀리 시 작게 (시각적 부담 감소, 정확성 유지)
  function getSizeForCount(count, zoomLevel) {
    var base;
    if (count >= 1000) base = { size: 52, fontSize: 15 };
    else if (count >= 100)  base = { size: 46, fontSize: 14 };
    else if (count >= 30)   base = { size: 40, fontSize: 13 };
    else if (count >= 10)   base = { size: 36, fontSize: 13 };
    else if (count >= 2)    base = { size: 32, fontSize: 12 };
    else                    base = { size: 28, fontSize: 11 };
    // zoom 별 scale (Kakao zoom: 1=가깝 ~ 14=멀리)
    var z = zoomLevel || 5;
    var scale;
    if (z <= 3) scale = 1.0;       // 가까움 - 원래 사이즈
    else if (z <= 5) scale = 0.85;
    else if (z <= 7) scale = 0.65;
    else if (z <= 9) scale = 0.45;
    else if (z <= 11) scale = 0.30;
    else scale = 0.20;             // 전국 - 매우 작게
    var min = 8; // 최소 8px (보이는 한도)
    return {
      size: Math.max(min, Math.round(base.size * scale)),
      fontSize: Math.max(8, Math.round(base.fontSize * scale)),
    };
  }

  function mergeNearbyCluster(clusters, projection) {
    if (!projection || clusters.length < 2) return clusters;
    var pts = clusters.map(function (c) {
      var lat = c.lat || c.latitude || (c.center && c.center.lat);
      var lng = c.lng || c.longitude || (c.center && c.center.lng);
      var count = c.count || c.n || (c.sample_ids ? c.sample_ids.length : 1);
      try {
        var px = projection.containerPointFromCoords(new kakao.maps.LatLng(lat, lng));
        return { lat: lat, lng: lng, count: count, px: px.x, py: px.y, merged: false, sample_ids: c.sample_ids || null };
      } catch (e) { return null; }
    }).filter(Boolean);
    var result = [];
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].merged) continue;
      var cur = pts[i];
      var totalCount = cur.count;
      var sumLat = cur.lat * cur.count;
      var sumLng = cur.lng * cur.count;
      var allIds = (cur.sample_ids || []).slice();
      for (var j = i + 1; j < pts.length; j++) {
        if (pts[j].merged) continue;
        var dx = pts[j].px - cur.px;
        var dy = pts[j].py - cur.py;
        if (dx * dx + dy * dy < MERGE_DISTANCE_PX * MERGE_DISTANCE_PX) {
          totalCount += pts[j].count;
          sumLat += pts[j].lat * pts[j].count;
          sumLng += pts[j].lng * pts[j].count;
          if (pts[j].sample_ids) allIds = allIds.concat(pts[j].sample_ids);
          pts[j].merged = true;
        }
      }
      result.push({ lat: sumLat / totalCount, lng: sumLng / totalCount, count: totalCount, sample_ids: allIds.length > 0 ? allIds : null });
    }
    return result;
  }

  // [v14] 가장 큰 cluster 위치 keep — 평균 안 함 (위치 정확성 유지하면서 합침)
  function mergeKeepPosition(clusters, projection) {
    var pts = clusters.map(function (c) {
      var lat = c.lat || c.latitude || (c.center && c.center.lat);
      var lng = c.lng || c.longitude || (c.center && c.center.lng);
      var count = c.count || c.n || (c.sample_ids ? c.sample_ids.length : 1);
      var px = null;
      if (projection) {
        try { px = projection.containerPointFromCoords(new kakao.maps.LatLng(lat, lng)); } catch (_) {}
      }
      return { lat: lat, lng: lng, count: count, px: px ? px.x : 0, py: px ? px.y : 0, merged: false, sample_ids: c.sample_ids || null, hasPx: !!px };
    }).filter(function(x) { return x.lat && x.lng; });
    if (!projection || pts.length < 2) return pts;
    // count 내림차순 정렬 — 큰 cluster 가 anchor
    pts.sort(function(a, b) { return b.count - a.count; });
    var result = [];
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].merged) continue;
      var cur = pts[i];
      var totalCount = cur.count;
      var allIds = (cur.sample_ids || []).slice();
      for (var j = i + 1; j < pts.length; j++) {
        if (pts[j].merged) continue;
        if (!cur.hasPx || !pts[j].hasPx) continue;
        var dx = pts[j].px - cur.px;
        var dy = pts[j].py - cur.py;
        if (dx * dx + dy * dy < MERGE_DISTANCE_PX * MERGE_DISTANCE_PX) {
          totalCount += pts[j].count;
          if (pts[j].sample_ids) allIds = allIds.concat(pts[j].sample_ids);
          pts[j].merged = true;
        }
      }
      // [핵심] 위치는 cur (가장 큰 cluster) 의 lat/lng 그대로 — 평균 안 함
      result.push({ lat: cur.lat, lng: cur.lng, count: totalCount, sample_ids: allIds.length > 0 ? allIds : null });
    }
    return result;
  }

  // [v15] zoom 매우 가까울 때 (level <= 3) — cluster 대신 items 직접 fetch (매물 별 정확한 위치)
  function fetchItemsAsClusters(map) {
    if (!map) return;
    var bounds = map.getBounds();
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    var url = ITEMS_ENDPOINT +
      '?swLat=' + sw.getLat() + '&swLng=' + sw.getLng() +
      '&neLat=' + ne.getLat() + '&neLng=' + ne.getLng() +
      '&limit=1000';
    if (inflightController) {
      try { inflightController.abort(); } catch (_) {}
    }
    var ctrl = new AbortController();
    inflightController = ctrl;
    fetch(url, { signal: ctrl.signal, credentials: 'include' })
      .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
      .then(function (data) {
        var items = (data && (data.items || data.data)) || [];
        log('items', items.length, '(items mode - no merge, exact position)');
        renderItemsExact(items);
      })
      .catch(function (e) { if (e && e.name === 'AbortError') return; })
      .finally(function () { if (inflightController === ctrl) inflightController = null; });
  }

  function fetchClusters(map) {
    if (!map) return;
    try {
      var bounds = map.getBounds();
      var sw = bounds.getSouthWest();
      var ne = bounds.getNorthEast();
      var zoom = map.getLevel();
      // [v22 사장님] zoom <= 5 만 items (가까이 정확), 6+ cluster (멀리 시인성/성능)
      if (zoom <= 5) {
        return fetchItemsAsClusters(map);
      }
      var serverZoom = Math.max(1, Math.min(16, 16 - zoom)); // [v14] 더 큰 grid
      if (inflightController) {
        try { inflightController.abort(); } catch (_) {}
      }
      var ctrl = new AbortController();
      inflightController = ctrl;
      var url = CLUSTER_ENDPOINT +
        '?swLat=' + sw.getLat() + '&swLng=' + sw.getLng() +
        '&neLat=' + ne.getLat() + '&neLng=' + ne.getLng() +
        '&zoom=' + serverZoom;
      fetch(url, { signal: ctrl.signal, credentials: 'include' })
        .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
        .then(function (data) {
          var clusters = (data && (data.clusters || data.data)) || [];
          renderClusters(clusters);
        })
        .catch(function (e) { if (e && e.name === 'AbortError') return; })
        .finally(function () { if (inflightController === ctrl) inflightController = null; });
    } catch (e) {}
  }

  // bbox 안 매물 list 가져오기 — popup 표시용 (정확한 위치, 50m 이내)
  function fetchItemsAt(map, lat, lng, radius) {
    radius = radius || 0.0005; // ~50m (정확한 cluster 위치만)
    var url = ITEMS_ENDPOINT +
      '?swLat=' + (lat - radius) + '&swLng=' + (lng - radius) +
      '&neLat=' + (lat + radius) + '&neLng=' + (lng + radius) +
      '&limit=50';
    return fetch(url, { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return (d && (d.items || d.data)) || []; })
      .catch(function () { return []; });
  }

  function showPopup(items, title) {
    closePopup();
    var bd = document.createElement('div');
    bd.className = 'v390-popup-backdrop';
    bd.addEventListener('click', closePopup);
    document.body.appendChild(bd);

    var box = document.createElement('div');
    box.className = 'v390-popup';

    var hd = document.createElement('div');
    hd.className = 'v390-popup-header';
    var tt = document.createElement('div');
    tt.className = 'v390-popup-title';
    tt.textContent = title || ('매물 ' + items.length + '건');
    var cls = document.createElement('button');
    cls.className = 'v390-popup-close';
    cls.textContent = '✕';
    cls.addEventListener('click', closePopup);
    hd.appendChild(tt);
    hd.appendChild(cls);
    box.appendChild(hd);

    var lst = document.createElement('div');
    lst.className = 'v390-popup-list';
    items.forEach(function (it) {
      var item = document.createElement('div');
      item.className = 'v390-popup-item';
      var idEl = document.createElement('div');
      idEl.className = 'v390-popup-id';
      idEl.textContent = '매물번호 ' + (it.id || '');
      var addr = document.createElement('div');
      addr.className = 'v390-popup-addr';
      addr.textContent = (it.address || it.title || '주소 정보 없음');
      var price = document.createElement('div');
      price.className = 'v390-popup-price';
      var dealStr = it.deal || '';
      if (it.deal === '월세') price.textContent = '월세 ' + (it.deposit || 0) + '/' + (it.monthly || 0);
      else if (it.deal === '전세') price.textContent = '전세 ' + (it.deposit || 0) + '만';
      else if (it.deal === '매매') price.textContent = '매매 ' + (it.price || 0) + '만';
      else price.textContent = dealStr;
      item.appendChild(idEl);
      item.appendChild(addr);
      item.appendChild(price);
      // 매물 click → WS.showDetail
      item.addEventListener('click', function () {
        try {
          if (window.WS && typeof window.WS.showDetail === 'function') {
            // allListings 에서 찾기
            var listing = (window.WS.allListings || []).find(function (l) { return String(l.id) === String(it.id); });
            if (listing) {
              window.WS.showDetail(listing);
            } else {
              window.WS.showDetail(it);
            }
            closePopup();
          }
        } catch (e) {}
      });
      lst.appendChild(item);
    });
    box.appendChild(lst);
    document.body.appendChild(box);
  }

  function closePopup() {
    var bd = document.querySelector('.v390-popup-backdrop');
    var bx = document.querySelector('.v390-popup');
    if (bd) bd.remove();
    if (bx) bx.remove();
  }

  function onPinClick(c) {
    if (!currentMap) return;
    var pos = new kakao.maps.LatLng(c.lat, c.lng);
    var curLevel = currentMap.getLevel();
    if (curLevel <= MIN_ZOOM_LEVEL) {
      // max zoom — sample_ids 우선 (정확한 매물), 없으면 bbox
      if (c.sample_ids && c.sample_ids.length > 0) {
        fetchItemsByIds(c.sample_ids).then(function (items) {
          if (items && items.length > 0) {
            showPopup(items, '매물 ' + items.length + '건');
          } else {
            // sample_ids fetch 실패 시 bbox fallback
            fetchItemsAt(currentMap, c.lat, c.lng, 0.0001).then(function (items2) {
              showPopup(items2 || [], '이 위치 매물 ' + (items2 ? items2.length : 0) + '건');
            });
          }
        });
      } else {
        fetchItemsAt(currentMap, c.lat, c.lng, 0.0001).then(function (items) {
          if (items && items.length > 0) {
            showPopup(items, '이 위치 매물 ' + items.length + '건');
          } else {
            showPopup([], '매물 정보 없음');
          }
        });
      }
    } else {
      var newLevel = Math.max(MIN_ZOOM_LEVEL, curLevel - 2);
      currentMap.setLevel(newLevel, { anchor: pos, animate: true });
    }
  }

  // sample_ids 의 매물 정보 가져오기 — WS.allListings 에서 우선, 없으면 server fetch
  function fetchItemsByIds(ids) {
    var cached = (window.WS && window.WS.allListings) || [];
    var found = ids.map(function (id) {
      return cached.find(function (l) { return String(l.id) === String(id); });
    }).filter(Boolean);
    if (found.length === ids.length) {
      return Promise.resolve(found);
    }
    // missing 매물 server fetch
    var missingIds = ids.filter(function (id) {
      return !cached.find(function (l) { return String(l.id) === String(id); });
    });
    if (missingIds.length === 0) return Promise.resolve(found);
    var url = '/api/admin/listings/batch?ids=' + missingIds.join(',');
    return fetch(url, { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var fetched = (d && (d.data || d.items)) || [];
        return found.concat(fetched);
      })
      .catch(function () { return found; });
  }

  // [v21 사장님 100% 정확] items 전용 render — merge 없음, 매물 lat/lng 그대로
  function renderItemsExact(items) {
    if (!currentMap) return;
    clearMarkers();
    if (!Array.isArray(items) || items.length === 0) return;
    var zoomLvl = currentMap.getLevel();
    items.forEach(function (it) {
      try {
        if (!it.lat || !it.lng) return;
        var pos = new kakao.maps.LatLng(it.lat, it.lng);
        var sz = getSizeForCount(1, zoomLvl);
        var pin = document.createElement('div');
        pin.className = 'v390-pin v390-single';
        pin.style.width = sz.size + 'px';
        pin.style.height = sz.size + 'px';
        pin.style.fontSize = sz.fontSize + 'px';
        pin.textContent = '1';
        pin.addEventListener('click', function (ev) {
          try { ev.stopPropagation(); } catch (_) {}
          // single 매물 click → 바로 상세 모달
          try {
            if (window.WS && typeof window.WS.showDetail === 'function') {
              var listing = (window.WS.allListings || []).find(function (l) { return String(l.id) === String(it.id); });
              if (listing) window.WS.showDetail(listing);
              else window.WS.showDetail(it);
              return;
            }
          } catch (_) {}
          // 모달 호출 실패 시 popup
          showPopup([it], '매물 1건');
        }, false);
        var overlay = new kakao.maps.CustomOverlay({
          position: pos, content: pin, yAnchor: 0.5, xAnchor: 0.5,
          zIndex: 1, clickable: true,
        });
        overlay.setMap(currentMap);
        currentMarkers.push(overlay);
      } catch (e) {}
    });
    log('rendered', currentMarkers.length, 'exact items');
  }

  function renderClusters(clusters) {
    if (!currentMap) return;
    clearMarkers();
    if (!Array.isArray(clusters) || clusters.length === 0) return;
    // [v14 사장님] merge 다시 — 단, 위치는 가장 큰 cluster 의 실제 위치 유지 (평균 X)
    var projection = null;
    try { projection = currentMap.getProjection(); } catch (_) {}
    var merged = mergeKeepPosition(clusters, projection);
    merged.forEach(function (c) {
      try {
        if (!c.lat || !c.lng) return;
        var pos = new kakao.maps.LatLng(c.lat, c.lng);
        var sz = getSizeForCount(c.count, currentMap ? currentMap.getLevel() : 5);
        var pin = document.createElement('div');
        pin.className = 'v390-pin' + (c.count === 1 ? ' v390-single' : '');
        pin.style.width = sz.size + 'px';
        pin.style.height = sz.size + 'px';
        pin.style.fontSize = sz.fontSize + 'px';
        pin.textContent = String(c.count);
        pin.addEventListener('click', function (ev) {
          try { ev.stopPropagation(); } catch (_) {}
          onPinClick(c);
        }, false);
        var overlay = new kakao.maps.CustomOverlay({
          position: pos, content: pin, yAnchor: 0.5, xAnchor: 0.5,
          zIndex: c.count, clickable: true,
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
      container.innerHTML = '<div id="ws-kakao-map" style="width:100%;height:600px;border-radius:12px;"></div>';
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
        } else {
          fetchClusters(currentMap);
        }
      } catch (e) {}
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
    // [v16] auto render 제거 - 사용자 click 시에만 (페이지 freeze 방지)
    // setTimeout(checkAutoRender, 1500);
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

  // ESC 로 popup 닫기
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePopup();
  });
})();
