/**
 * WISHES 카카오맵 - MAIN WORLD에서 실행
 * Content script에서 DOM data 속성으로 전달받은 매물 데이터를 카카오맵에 표시
 * 커스텀 이벤트 'ws-map-render'로 재렌더링 지원
 */
(function() {
  var _map = null;
  var _clusterer = null;
  var _openInfowindow = null;

  function renderWishesMap() {
    var mapDiv = document.getElementById('ws-kakao-map');
    if (!mapDiv) return;

    var listingsData = [];
    try {
      listingsData = JSON.parse(mapDiv.getAttribute('data-listings') || '[]');
    } catch(e) {
      console.error('WISHES Map: Failed to parse listings data', e);
    }

    if (listingsData.length === 0) {
      mapDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:500px;color:#666;font-size:15px;">📍 좌표 정보가 있는 매물이 없습니다</div>';
      return;
    }

    // Clean up previous clusterer/infowindow
    if (_clusterer) {
      _clusterer.clear();
      _clusterer = null;
    }
    if (_openInfowindow) {
      _openInfowindow.close();
      _openInfowindow = null;
    }

    // Reuse existing map or create new
    if (!_map || !mapDiv.hasChildNodes() || mapDiv.querySelector('div') === null) {
      _map = new kakao.maps.Map(mapDiv, {
        center: new kakao.maps.LatLng(37.5665, 126.9780),
        level: 8,
        draggable: false,
        scrollwheel: false,
        disableDoubleClick: true,
        disableDoubleClickZoom: true
      });
      // 줌/맵타입 컨트롤 제거 (이동 잠금)
    }

    var bounds = new kakao.maps.LatLngBounds();
    var markers = [];

    listingsData.forEach(function(listing) {
      var coords = new kakao.maps.LatLng(listing.lat, listing.lng);
      bounds.extend(coords);

      var marker = new kakao.maps.Marker({
        position: coords,
        title: listing.title || listing.address
      });

      var priceText = '';
      if (listing.deal === '월세') {
        priceText = (listing.deposit >= 10000 ? (listing.deposit/10000) + '억' : listing.deposit + '만') + '/' + listing.monthly + '만';
      } else if (listing.deal === '전세') {
        priceText = listing.deposit >= 10000 ? (listing.deposit/10000) + '억' : listing.deposit + '만';
      } else {
        priceText = listing.price >= 10000 ? (listing.price/10000) + '억' : listing.price + '만';
      }

      var dealColor = listing.deal === '월세' ? '#e53e3e' : listing.deal === '전세' ? '#2D5A27' : '#1a73e8';
      var dealBadge = '<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600;color:#fff;background:' + dealColor + ';">' + listing.deal + '</span>';

      var infoContent = '<div style="padding:12px 14px;min-width:220px;font-size:13px;line-height:1.6;">' +
        '<div style="font-weight:700;margin-bottom:6px;color:#2D5A27;font-size:14px;">' + listing.type + ' ' + dealBadge + '</div>' +
        '<div style="font-size:17px;font-weight:800;color:' + dealColor + ';margin-bottom:6px;">' + priceText + '</div>' +
        '<div style="color:#555;font-size:12px;">' + (listing.dong || listing.address.split(' ').slice(0, 3).join(' ')) + '</div>' +
        '<div style="color:#888;font-size:11px;margin-top:4px;border-top:1px solid #eee;padding-top:4px;">' +
          (listing.area_m2 ? (listing.area_m2 * 0.3025).toFixed(1) + '평' : '') +
          (listing.floor_current ? ' · ' + listing.floor_current + '/' + listing.floor_total + '층' : '') +
          (listing.rooms ? ' · ' + listing.rooms + '룸' : '') +
          (listing.parking ? ' · 🅿️' : '') +
        '</div></div>';

      var infowindow = new kakao.maps.InfoWindow({ content: infoContent, removable: true });
      kakao.maps.event.addListener(marker, 'click', function() {
        if (_openInfowindow) _openInfowindow.close();
        infowindow.open(_map, marker);
        _openInfowindow = infowindow;
      });

      markers.push(marker);
    });

    // Apply clusterer
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

  // ========== 상세 모달 미니맵 ==========
  var _miniMap = null;
  var _miniMarker = null;
  var _miniMapLocked = true; // 기본: 잠금 상태

  function renderDetailMinimap(data) {
    var div = document.getElementById('ws-detail-minimap');
    if (!div || !data.lat || !data.lng) return;

    // 래퍼 div 설정 (상대 위치)
    div.innerHTML = '';
    div.style.display = 'block';
    div.style.position = 'relative';

    // 지도 div 생성
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

    // 🔒 잠금/해제 토글 버튼
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

    // 마커 표시
    _miniMarker = new kakao.maps.Marker({
      position: center,
      map: _miniMap
    });

    // 주소 인포윈도우
    if (data.address) {
      var addrParts = (data.address || '').split(' ');
      var shortAddr = addrParts.length > 2 ? addrParts.slice(1).join(' ') : data.address;
      var infoContent = '<div style="padding:5px 10px;font-size:12px;font-weight:600;color:#2D5A27;white-space:nowrap;">' + shortAddr + '</div>';
      var infowindow = new kakao.maps.InfoWindow({ content: infoContent });
      infowindow.open(_miniMap, _miniMarker);
    }
  }

  // Listen for re-render messages from content script (ISOLATED → MAIN world)
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'ws-map-render') {
      if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.Map) {
        renderWishesMap();
      }
    }
    // 상세 모달 미니맵 렌더링
    if (e.data && e.data.type === 'ws-minimap-render') {
      if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.Map) {
        renderDetailMinimap(e.data);
      } else if (typeof kakao !== 'undefined' && kakao.maps) {
        kakao.maps.load(function() { renderDetailMinimap(e.data); });
      }
    }
  });

  // Initial load: load SDK if needed, then render
  if (typeof kakao === 'undefined' || !kakao.maps) {
    var s = document.createElement('script');
    s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=a1c65d0ec2ecc8d2d231f8558f896e38&autoload=false&libraries=services,clusterer';
    s.onload = function() {
      kakao.maps.load(renderWishesMap);
    };
    document.head.appendChild(s);
  } else if (kakao.maps.Map) {
    renderWishesMap();
  } else {
    kakao.maps.load(renderWishesMap);
  }
})();
