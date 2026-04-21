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
        level: 8
      });
      var zoomControl = new kakao.maps.ZoomControl();
      _map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
      var mapTypeControl = new kakao.maps.MapTypeControl();
      _map.addControl(mapTypeControl, kakao.maps.ControlPosition.TOPRIGHT);
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
        '<div style="color:#555;font-size:12px;">' + listing.address + '</div>' +
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

  // Listen for re-render messages from content script (ISOLATED → MAIN world)
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'ws-map-render') {
      if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.Map) {
        renderWishesMap();
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
