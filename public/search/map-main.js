/**
 * WISHES 카카오맵 — Full Feature Edition
 *  · 드래그 / 휠 줌 / 더블클릭 줌 전체 활성화
 *  · ZoomControl + MapTypeControl
 *  · 지도타입 전환 (일반/위성/하이브리드)
 *  · 오버레이: 교통정보 / 지형정보 / 자전거도로 / 지적편집도
 *  · 로드뷰 분할 화면 (🚶 워커 드래그 드롭)
 *  · 📍 내 위치 이동
 *  · ⛶ 전체화면
 *  · 매물 마커 클러스터링 + 레이지 인포윈도우
 */
(function() {
  var _map = null;
  var _clusterer = null;
  var _openInfowindow = null;
  var _overlays = { traffic: null, terrain: null, bicycle: null, useDistrict: null };
  var _roadviewClient = null;
  var _roadview = null;
  var _rvMarker = null;
  var _mapWrap = null;
  var _rvContainer = null;
  var _myLocMarker = null;

  // ========== 메인 지도 렌더 ==========
  function renderWishesMap() {
    var mapDiv = document.getElementById('ws-kakao-map');
    if (!mapDiv) return;

    var listingsData = [];
    try { listingsData = JSON.parse(mapDiv.getAttribute('data-listings') || '[]'); }
    catch(e) { console.error('WISHES Map: Failed to parse listings data', e); }

    // 정리
    if (_clusterer) { _clusterer.clear(); _clusterer = null; }
    if (_openInfowindow) { _openInfowindow.close(); _openInfowindow = null; }

    // 지도 생성 / 재사용
    var needNew = !_map || mapDiv.getAttribute('data-ws-mounted') !== '1';
    if (needNew) {
      // 래퍼 세팅
      mapDiv.setAttribute('data-ws-mounted', '1');
      mapDiv.style.position = 'relative';

      _map = new kakao.maps.Map(mapDiv, {
        center: new kakao.maps.LatLng(37.5665, 126.9780),
        level: 8,
        draggable: true,
        scrollwheel: true,
        disableDoubleClick: false,
        disableDoubleClickZoom: false
      });

      // 기본 컨트롤 — 줌 + 맵타입
      try {
        _map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        _map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
      } catch(e) {}

      // 커스텀 툴바
      buildToolbar(mapDiv);
    } else {
      try { _map.setDraggable(true); _map.setZoomable(true); } catch(e) {}
    }

    if (listingsData.length === 0) {
      // 매물 없음 안내 (지도는 유지)
      var warn = document.getElementById('ws-map-empty-hint');
      if (!warn) {
        warn = document.createElement('div');
        warn.id = 'ws-map-empty-hint';
        warn.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,255,255,.95);padding:14px 22px;border-radius:10px;font-size:14px;color:#666;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:5;';
        warn.textContent = '📍 좌표 정보가 있는 매물이 없습니다';
        mapDiv.appendChild(warn);
      }
      return;
    } else {
      var oldWarn = document.getElementById('ws-map-empty-hint');
      if (oldWarn) oldWarn.remove();
    }

    var bounds = new kakao.maps.LatLngBounds();
    var markers = [];

    function buildInfoContent(l) {
      var priceText = '';
      if (l.deal === '월세') priceText = (l.deposit >= 10000 ? (l.deposit/10000) + '억' : l.deposit + '만') + '/' + l.monthly + '만';
      else if (l.deal === '전세') priceText = l.deposit >= 10000 ? (l.deposit/10000) + '억' : l.deposit + '만';
      else priceText = l.price >= 10000 ? (l.price/10000) + '억' : l.price + '만';
      var dealColor = l.deal === '월세' ? '#e53e3e' : l.deal === '전세' ? '#2D5A27' : '#1a73e8';
      var dealBadge = '<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600;color:#fff;background:' + dealColor + ';">' + l.deal + '</span>';
      return '<div style="padding:12px 14px;min-width:220px;font-size:13px;line-height:1.6;">' +
        '<div style="font-weight:700;margin-bottom:6px;color:#2D5A27;font-size:14px;">' + (l.type || '') + ' ' + dealBadge + '</div>' +
        '<div style="font-size:17px;font-weight:800;color:' + dealColor + ';margin-bottom:6px;">' + priceText + '</div>' +
        '<div style="color:#555;font-size:12px;">' + (l.dong || (l.address || '').split(' ').slice(0, 3).join(' ')) + '</div>' +
        '<div style="color:#888;font-size:11px;margin-top:4px;border-top:1px solid #eee;padding-top:4px;">' +
          (l.area_m2 ? (l.area_m2 * 0.3025).toFixed(1) + '평' : '') +
          (l.floor_current ? ' · ' + l.floor_current + '/' + (l.floor_total || '') + '층' : '') +
          (l.rooms ? ' · ' + l.rooms + '룸' : '') +
          (l.parking ? ' · 🅿️' : '') +
        '</div></div>';
    }

    listingsData.forEach(function(listing) {
      if (!listing.lat || !listing.lng) return;
      var coords = new kakao.maps.LatLng(listing.lat, listing.lng);
      bounds.extend(coords);
      var marker = new kakao.maps.Marker({ position: coords, title: listing.title || listing.address });
      kakao.maps.event.addListener(marker, 'click', (function(m, l) {
        return function() {
          if (_openInfowindow) _openInfowindow.close();
          var iw = new kakao.maps.InfoWindow({ content: buildInfoContent(l), removable: true });
          iw.open(_map, m);
          _openInfowindow = iw;
        };
      })(marker, listing));
      markers.push(marker);
    });

    _clusterer = new kakao.maps.MarkerClusterer({
      map: _map,
      averageCenter: true,
      minLevel: 5,
      disableClickZoom: false,
      styles: [{
        width: '50px', height: '50px',
        background: 'rgba(45, 90, 39, 0.85)',
        borderRadius: '25px',
        color: '#fff',
        textAlign: 'center',
        fontWeight: 'bold',
        lineHeight: '50px',
        fontSize: '14px'
      }]
    });
    _clusterer.addMarkers(markers);

    if (markers.length > 0) {
      _map.setBounds(bounds);
    }
  }

  // ========== 커스텀 툴바 ==========
  function buildToolbar(mapDiv) {
    if (document.getElementById('ws-map-toolbar')) return;

    var bar = document.createElement('div');
    bar.id = 'ws-map-toolbar';
    bar.style.cssText = [
      'position:absolute', 'top:12px', 'left:12px', 'z-index:10',
      'display:flex', 'flex-direction:column', 'gap:6px',
      'background:rgba(255,255,255,.95)', 'padding:8px', 'border-radius:10px',
      'box-shadow:0 4px 14px rgba(0,0,0,.15)', 'font-family:-apple-system,sans-serif'
    ].join(';') + ';';

    // 지도 타입 row
    var typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;gap:4px;';
    var types = [
      { label: '일반', id: 'ROADMAP' },
      { label: '스카이뷰', id: 'SKYVIEW' },
      { label: '하이브리드', id: 'HYBRID' }
    ];
    types.forEach(function(t) {
      var b = makeBtn(t.label);
      b.addEventListener('click', function() {
        _map.setMapTypeId(kakao.maps.MapTypeId[t.id]);
        Array.prototype.forEach.call(typeRow.children, function(c) { c.classList.remove('ws-btn-active'); });
        b.classList.add('ws-btn-active');
      });
      typeRow.appendChild(b);
    });
    typeRow.children[0].classList.add('ws-btn-active');
    bar.appendChild(typeRow);

    // 오버레이 row
    var ovRow = document.createElement('div');
    ovRow.style.cssText = 'display:flex;gap:4px;';
    var overlays = [
      { label: '🚦교통', key: 'traffic', type: 'TRAFFIC' },
      { label: '🌍지형', key: 'terrain', type: 'TERRAIN' },
      { label: '🚴자전거', key: 'bicycle', type: 'BICYCLE' },
      { label: '🗺지적도', key: 'useDistrict', type: 'USE_DISTRICT' }
    ];
    overlays.forEach(function(o) {
      var b = makeBtn(o.label);
      b.addEventListener('click', function() {
        if (_overlays[o.key]) {
          _map.removeOverlayMapTypeId(kakao.maps.MapTypeId[o.type]);
          _overlays[o.key] = null;
          b.classList.remove('ws-btn-active');
        } else {
          _map.addOverlayMapTypeId(kakao.maps.MapTypeId[o.type]);
          _overlays[o.key] = true;
          b.classList.add('ws-btn-active');
        }
      });
      ovRow.appendChild(b);
    });
    bar.appendChild(ovRow);

    // 액션 row
    var actRow = document.createElement('div');
    actRow.style.cssText = 'display:flex;gap:4px;';

    var rvBtn = makeBtn('🚶 로드뷰');
    rvBtn.addEventListener('click', function() { toggleRoadview(mapDiv, rvBtn); });
    actRow.appendChild(rvBtn);

    var locBtn = makeBtn('📍 내위치');
    locBtn.addEventListener('click', function() { goToMyLocation(locBtn); });
    actRow.appendChild(locBtn);

    var fsBtn = makeBtn('⛶ 전체화면');
    fsBtn.addEventListener('click', function() { toggleFullscreen(mapDiv, fsBtn); });
    actRow.appendChild(fsBtn);

    bar.appendChild(actRow);

    // 버튼 스타일
    if (!document.getElementById('ws-map-toolbar-style')) {
      var st = document.createElement('style');
      st.id = 'ws-map-toolbar-style';
      st.textContent =
        '#ws-map-toolbar button{padding:6px 10px;font-size:12px;font-weight:600;border:1px solid #dcdcdc;background:#fff;color:#444;border-radius:6px;cursor:pointer;white-space:nowrap;transition:all .15s;}' +
        '#ws-map-toolbar button:hover{background:#f5f9f3;border-color:#2D5A27;color:#2D5A27;}' +
        '#ws-map-toolbar button.ws-btn-active{background:#2D5A27;color:#fff;border-color:#2D5A27;}';
      document.head.appendChild(st);
    }

    mapDiv.appendChild(bar);
  }

  function makeBtn(label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    return b;
  }

  // ========== 로드뷰 ==========
  function toggleRoadview(mapDiv, btn) {
    if (_rvContainer && _rvContainer.parentNode) {
      // 끄기
      _rvContainer.parentNode.removeChild(_rvContainer);
      _rvContainer = null;
      _roadview = null;
      if (_rvMarker) { _rvMarker.setMap(null); _rvMarker = null; }
      mapDiv.querySelector('div[style*="width: 100%"]');
      var inner = _map && _map.getNode && _map.getNode();
      if (inner) { inner.style.width = '100%'; }
      try { _map.relayout(); } catch(e) {}
      btn.classList.remove('ws-btn-active');
      return;
    }

    // 켜기: 맵 영역을 반으로 줄이고 우측에 로드뷰 컨테이너 추가
    _rvContainer = document.createElement('div');
    _rvContainer.id = 'ws-roadview-container';
    _rvContainer.style.cssText = 'position:absolute;top:0;right:0;width:50%;height:100%;z-index:3;border-left:2px solid #2D5A27;background:#000;';
    mapDiv.appendChild(_rvContainer);

    // 맵 쪽 resize
    var kakaoInner = mapDiv.querySelector('div');
    try { _map.relayout(); } catch(e) {}

    // 로드뷰 인스턴스
    _roadview = new kakao.maps.Roadview(_rvContainer);
    _roadviewClient = new kakao.maps.RoadviewClient();

    // 현재 지도 중심 기준으로 가장 가까운 파노라마 로드
    var center = _map.getCenter();
    _roadviewClient.getNearestPanoId(center, 50, function(panoId) {
      if (panoId) {
        _roadview.setPanoId(panoId, center);
      } else {
        _rvContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;font-size:14px;">이 위치에는 로드뷰가 없습니다.<br>지도를 클릭해 다른 지점을 선택하세요.</div>';
      }
    });

    // 지도 클릭 → 해당 지점 로드뷰
    var clickHandler = function(mouseEvent) {
      var latlng = mouseEvent.latLng;
      if (!_rvMarker) {
        _rvMarker = new kakao.maps.Marker({ position: latlng, map: _map });
      } else {
        _rvMarker.setPosition(latlng);
      }
      _roadviewClient.getNearestPanoId(latlng, 50, function(panoId) {
        if (panoId) { _roadview.setPanoId(panoId, latlng); }
      });
    };
    kakao.maps.event.addListener(_map, 'click', clickHandler);
    _rvContainer._clickHandler = clickHandler;

    btn.classList.add('ws-btn-active');
  }

  // ========== 내 위치 ==========
  function goToMyLocation(btn) {
    if (!navigator.geolocation) {
      alert('위치 정보가 지원되지 않는 브라우저입니다.');
      return;
    }
    btn.textContent = '📍 검색중...';
    navigator.geolocation.getCurrentPosition(function(pos) {
      var latlng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
      _map.setCenter(latlng);
      _map.setLevel(4);
      if (_myLocMarker) _myLocMarker.setMap(null);
      _myLocMarker = new kakao.maps.Marker({
        position: latlng,
        map: _map,
        image: new kakao.maps.MarkerImage(
          'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="%232D5A27" stroke="white" stroke-width="3"/><circle cx="16" cy="16" r="4" fill="white"/></svg>'),
          new kakao.maps.Size(32, 32)
        )
      });
      btn.textContent = '📍 내위치';
    }, function(err) {
      alert('위치를 가져오지 못했습니다: ' + err.message);
      btn.textContent = '📍 내위치';
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  // ========== 전체화면 ==========
  function toggleFullscreen(mapDiv, btn) {
    var doc = document;
    var el = mapDiv;
    var isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
    if (!isFs) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) el.msRequestFullscreen();
      btn.textContent = '⛶ 전체화면 해제';
      setTimeout(function() { try { _map.relayout(); } catch(e) {} }, 300);
    } else {
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      else if (doc.msExitFullscreen) doc.msExitFullscreen();
      btn.textContent = '⛶ 전체화면';
      setTimeout(function() { try { _map.relayout(); } catch(e) {} }, 300);
    }
  }
  document.addEventListener('fullscreenchange', function() {
    setTimeout(function() { try { _map && _map.relayout(); } catch(e) {} }, 200);
  });

  // ========== 상세 모달 미니맵 ==========
  var _miniMap = null;
  var _miniMarker = null;
  var _miniMapLocked = true;

  function renderDetailMinimap(data) {
    var div = document.getElementById('ws-detail-minimap');
    if (!div || !data.lat || !data.lng) return;

    div.innerHTML = '';
    div.style.display = 'block';
    div.style.position = 'relative';

    var mapEl = document.createElement('div');
    mapEl.style.cssText = 'width:100%;height:100%;';
    div.appendChild(mapEl);

    var center = new kakao.maps.LatLng(data.lat, data.lng);
    _miniMapLocked = true;

    _miniMap = new kakao.maps.Map(mapEl, {
      center: center,
      level: 3,
      draggable: false,
      scrollwheel: false,
      disableDoubleClick: true,
      disableDoubleClickZoom: true
    });

    var lockBtn = document.createElement('button');
    lockBtn.innerHTML = '🔒 지도 잠금';
    lockBtn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10;padding:5px 10px;border-radius:6px;border:1px solid #ccc;background:rgba(255,255,255,.92);cursor:pointer;font-size:12px;font-weight:600;color:#555;box-shadow:0 1px 4px rgba(0,0,0,.15);transition:all .2s;';
    lockBtn.addEventListener('click', function() {
      _miniMapLocked = !_miniMapLocked;
      _miniMap.setDraggable(!_miniMapLocked);
      _miniMap.setZoomable(!_miniMapLocked);
      if (_miniMapLocked) {
        lockBtn.innerHTML = '🔒 지도 잠금';
        lockBtn.style.background = 'rgba(255,255,255,.92)';
        lockBtn.style.color = '#555';
        lockBtn.style.borderColor = '#ccc';
      } else {
        lockBtn.innerHTML = '🔓 지도 조작 가능';
        lockBtn.style.background = 'rgba(45,90,39,.9)';
        lockBtn.style.color = '#fff';
        lockBtn.style.borderColor = '#2D5A27';
      }
    });
    div.appendChild(lockBtn);

    _miniMarker = new kakao.maps.Marker({ position: center, map: _miniMap });

    if (data.address) {
      var addrParts = (data.address || '').split(' ');
      var shortAddr = addrParts.length > 2 ? addrParts.slice(1).join(' ') : data.address;
      var infoContent = '<div style="padding:5px 10px;font-size:12px;font-weight:600;color:#2D5A27;white-space:nowrap;">' + shortAddr + '</div>';
      var infowindow = new kakao.maps.InfoWindow({ content: infoContent });
      infowindow.open(_miniMap, _miniMarker);
    }
  }

  // ========== 이벤트 브릿지 ==========
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'ws-map-render') {
      if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.Map) renderWishesMap();
    }
    if (e.data && e.data.type === 'ws-minimap-render') {
      if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.Map) renderDetailMinimap(e.data);
      else if (typeof kakao !== 'undefined' && kakao.maps) kakao.maps.load(function() { renderDetailMinimap(e.data); });
    }
  });

  // ========== SDK 로더 ==========
  if (typeof kakao === 'undefined' || !kakao.maps) {
    var s = document.createElement('script');
    s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=a1c65d0ec2ecc8d2d231f8558f896e38&autoload=false&libraries=services,clusterer,drawing';
    s.onload = function() { kakao.maps.load(renderWishesMap); };
    document.head.appendChild(s);
  } else if (kakao.maps.Map) {
    renderWishesMap();
  } else {
    kakao.maps.load(renderWishesMap);
  }
})();
