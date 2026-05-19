/**
 * WISHES 카카오맵 — 속도 최우선 + 모든 기능
 *
 * 성능 최적화
 *  - 툴바 기본 접힘 (헤더만 노출) → 필요할 때만 펼침
 *  - 미니맵 오버뷰 제거 (두 번째 Map 인스턴스 생성 비용 제거)
 *  - 마커 생성 requestAnimationFrame 배치화
 *  - 비핵심 UI (축척 등) requestIdleCallback 지연 초기화
 *  - mousemove 리스너 제거 (jank 원인)
 *  - 클러스터 마커 addMarkers 일괄 호출
 *
 * 기능 (전부 유지)
 *  - 지도타입/오버레이/그리기/주변시설/반경검색/로드뷰/내위치/전체화면/공유/인쇄/히트맵/주소조회/축척/매물 클러스터
 */
(function() {
  // ======================== 🛣️  카카오 로드뷰 프록시 패치 ========================
  // Kakao SDK 의 `Roadview` 는 `rv.map.kakao.com/roadview-search/v2/*` 를 호출하는데
  // 이 엔드포인트는 Referer 가 map.kakao.com 이 아니면 전부 503 을 반환한다.
  // → XHR/fetch 를 감싸서 같은 URL 을 `/api/kakao-rv/*` 서버 프록시로 리라이트.
  //   서버에서 Referer: https://map.kakao.com/ 헤더를 주입해 정상 응답을 받는다.
  (function installRoadviewProxy() {
    if (window.__WS_RV_PROXY_PATCHED__) return;
    window.__WS_RV_PROXY_PATCHED__ = true;

    var TARGET = 'https://rv.map.kakao.com/';
    var PROXY = '/api/kakao-rv/';

    function rewrite(url) {
      if (typeof url !== 'string') return url;
      if (url.indexOf(TARGET) === 0) {
        return PROXY + url.substring(TARGET.length);
      }
      // protocol-relative
      if (url.indexOf('//rv.map.kakao.com/') === 0) {
        return PROXY + url.substring('//rv.map.kakao.com/'.length);
      }
      return url;
    }

    // XHR.open 패치
    try {
      var _open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        var rewritten = rewrite(url);
        if (rewritten !== url) {
          arguments[1] = rewritten;
        }
        return _open.apply(this, arguments);
      };
    } catch(e) { /* noop */ }

    // fetch 패치
    try {
      var _fetch = window.fetch;
      if (_fetch) {
        window.fetch = function(input, init) {
          try {
            if (typeof input === 'string') {
              input = rewrite(input);
            } else if (input && input.url) {
              var rw = rewrite(input.url);
              if (rw !== input.url) input = new Request(rw, input);
            }
          } catch(e) { /* noop */ }
          return _fetch.call(this, input, init);
        };
      }
    } catch(e) { /* noop */ }

    // script 태그 주입 (JSONP) 패치 — src 세터를 가로채서 리라이트
    try {
      var scriptProto = HTMLScriptElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(scriptProto, 'src') ||
                 Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'src');
      if (desc && desc.set) {
        var _setSrc = desc.set;
        Object.defineProperty(scriptProto, 'src', {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get,
          set: function(v) {
            return _setSrc.call(this, rewrite(v));
          }
        });
      }
    } catch(e) { /* noop */ }
  })();
  // ======================== /카카오 로드뷰 프록시 패치 ========================

  // ======================== 상태 ========================
  var _map = null;
  var _clusterer = null;
  var _sharedIw = null;            // ⚡ 단일 공유 InfoWindow — new 비용 제거
  var _overlays = { traffic: false, terrain: false, bicycle: false, useDistrict: false, roadviewLayer: false };
  var _drawingManager = null;
  var _placesService = null;
  var _geocoder = null;
  var _placeMarkers = [];
  var _roadview = null;
  var _roadviewClient = null;
  var _rvContainer = null;
  var _rvMarker = null;
  var _myLocMarker = null;
  var _radiusCircle = null;
  var _heatmapOverlays = [];
  var _allListings = [];
  var _scaleEl = null;
  var _clickMode = 'none';
  var _toolbarBodyBuilt = false;   // ⚡ 툴바 바디 지연 빌드 플래그
  var _urlRestored = false;        // ⚡ URL 복원 여부 → setBounds 스킵 판단

  // requestIdleCallback 폴리필 (50ms deadline)
  var _ric = window.requestIdleCallback || function(cb) { return setTimeout(cb, 1); };

  // ⚡ 공유 InfoWindow 싱글톤 — 최초 사용시 1회만 생성
  function getSharedIw() {
    if (!_sharedIw) _sharedIw = new kakao.maps.InfoWindow({ content: '', removable: true });
    return _sharedIw;
  }

  // ======================== 메인 렌더 ========================
  function renderWishesMap() {
    var mapDiv = document.getElementById('ws-kakao-map');
    if (!mapDiv) return;

    // ⚡ 전역 변수 우선 (2MB+ JSON 파싱 비용 제거), fallback 으로 속성
    if (window.__WS_MAP_LISTINGS__ && Array.isArray(window.__WS_MAP_LISTINGS__)) {
      _allListings = window.__WS_MAP_LISTINGS__;
    } else {
      try { _allListings = JSON.parse(mapDiv.getAttribute('data-listings') || '[]'); }
      catch(e) { _allListings = []; }
    }

    if (_clusterer) { _clusterer.clear(); _clusterer = null; }
    if (_sharedIw) { try { _sharedIw.close(); } catch(e) {} }

    var needNew = !_map || mapDiv.getAttribute('data-ws-mounted') !== '1';
    if (needNew) {
      mapDiv.setAttribute('data-ws-mounted', '1');
      mapDiv.style.position = 'relative';

      // ⚡ 최소 옵션만 동기 초기화 (기본값 프로퍼티 전부 제거)
      _map = new kakao.maps.Map(mapDiv, {
        center: new kakao.maps.LatLng(37.5665, 126.9780),
        level: 8
      });

      try {
        _map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      } catch(e) {}

      // ⚡ URL 복원 먼저 (setBounds 와 경쟁 방지)
      _urlRestored = restoreFromURL();

      // ⚡ 툴바 '헤더만' 즉시 — 바디는 첫 펼침시 lazy
      buildToolbarHeader(mapDiv);

      // ⚡ 마커 렌더 (비동기 청크) — 메인 경로
      renderListingMarkers();

      // ⚡ 지도 이벤트 — 클릭 하나만
      attachMapEvents();

      // ⚡ 축척 바는 idle 로 — 초기 렌더 영향 0
      _ric(function() { buildScaleBar(mapDiv); });
    } else {
      try { _map.setDraggable(true); _map.setZoomable(true); } catch(e) {}
      renderListingMarkers();
    }
  }

  // services/drawing 라이브러리 lazy 초기화
  function ensureServices() {
    if (!_placesService && kakao.maps.services) {
      try {
        _placesService = new kakao.maps.services.Places();
        _geocoder = new kakao.maps.services.Geocoder();
      } catch(e) {}
    }
  }
  // ⚡ drawing 라이브러리는 초기 SDK 에서 제외되므로 첫 그리기 클릭 시 동적 로드
  var _drawingLoading = false;
  function ensureDrawing(onReady) {
    if (_drawingManager) { if (onReady) onReady(); return; }
    function buildMgr() {
      if (_drawingManager || !kakao.maps.drawing) return;
      try {
        _drawingManager = new kakao.maps.drawing.DrawingManager({
          map: _map,
          drawingMode: [
            kakao.maps.drawing.OverlayType.MARKER,
            kakao.maps.drawing.OverlayType.POLYLINE,
            kakao.maps.drawing.OverlayType.RECTANGLE,
            kakao.maps.drawing.OverlayType.CIRCLE,
            kakao.maps.drawing.OverlayType.POLYGON,
            kakao.maps.drawing.OverlayType.ARROW
          ],
          guideTooltip: ['draw', 'drag', 'edit'],
          markerOptions: { draggable: true, removable: true },
          polylineOptions: { draggable: true, removable: true, editable: true, strokeColor: '#2D5A27' },
          rectangleOptions: { draggable: true, removable: true, editable: true, strokeColor: '#2D5A27', fillColor: '#2D5A27', fillOpacity: 0.2 },
          circleOptions: { draggable: true, removable: true, editable: true, strokeColor: '#2D5A27', fillColor: '#2D5A27', fillOpacity: 0.2 },
          polygonOptions: { draggable: true, removable: true, editable: true, strokeColor: '#2D5A27', fillColor: '#2D5A27', fillOpacity: 0.2 },
          arrowOptions: { draggable: true, removable: true, editable: true, strokeColor: '#e53e3e' }
        });
      } catch(e) {}
      if (onReady) onReady();
    }
    if (kakao.maps.drawing) { buildMgr(); return; }
    if (_drawingLoading) return;
    _drawingLoading = true;
    // [Step F-9 fix 2026-05-18] 하드코딩 제거 — window.__KAKAO_APPKEY 재사용
    var appkey = (window.__KAKAO_APPKEY) || '';
    if (!appkey) { console.warn('[map-main] KAKAO_APPKEY 없음 — drawing 모듈 skip'); return; }
    var s = document.createElement('script');
    s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + appkey + '&autoload=false&libraries=drawing';
    s.onload = function() {
      try { kakao.maps.load(buildMgr); } catch(e) {}
    };
    document.head.appendChild(s);
  }

  // ======================== 매물 마커 (배치 생성) ========================
  // ⚡ 공통 마커 클릭 핸들러 팩토리 — 공유 InfoWindow 재사용, new 비용 제거
  // [Step 98 fix 2026-05-19 사장님 명령] S5 — InfoWindow 작은 풍선 → 카드 모달 통일
  //   기존: marker click → 자체 InfoWindow (작은 풍선) — 카드 click 의 풀 모달과 다름
  //   수정: WS.showDetail(listing) 우선 호출 — 카드 click 과 동일한 모달
  //   fallback: WS 없으면 기존 InfoWindow (안정성)
  function makeMarkerClickHandler(marker, listing) {
    return function() {
      try {
        if (window.WS && typeof window.WS.showDetail === 'function') {
          window.WS.showDetail(listing);
          return;
        }
      } catch(e) {}
      // fallback: 기존 InfoWindow (WS 없거나 showDetail 실패 시)
      var iw = getSharedIw();
      try { iw.close(); } catch(e) {}
      iw.setContent(buildListingInfoHtml(listing));
      iw.open(_map, marker);
    };
  }

  function renderListingMarkers() {
    if (_clusterer) { _clusterer.clear(); _clusterer = null; }

    var mapDiv = document.getElementById('ws-kakao-map');
    var hint = document.getElementById('ws-map-empty-hint');
    if (!_allListings || _allListings.length === 0) {
      if (!hint && mapDiv) {
        hint = document.createElement('div');
        hint.id = 'ws-map-empty-hint';
        hint.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,255,255,.95);padding:14px 22px;border-radius:10px;font-size:14px;color:#666;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:5;';
        hint.textContent = '📍 좌표 정보가 있는 매물이 없습니다';
        mapDiv.appendChild(hint);
      }
      return;
    } else if (hint) { hint.remove(); }

    // ⚡ 클러스터러 — gridSize 80 (기본 60) 로 재클러스터 연산 감소, minClusterSize 3
    _clusterer = new kakao.maps.MarkerClusterer({
      map: _map,
      averageCenter: true,
      minLevel: 5,
      gridSize: 80,
      minClusterSize: 3,
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

    // ⚡ 유효 좌표만 필터링 (한번만)
    var validListings = [];
    for (var k = 0; k < _allListings.length; k++) {
      var li = _allListings[k];
      if (li.lat && li.lng) validListings.push(li);
    }
    var total = validListings.length;

    // ⚡ 첫 청크 200개 즉시, 나머지는 단일 idle 배치 — re-cluster 2회로 최소화
    var FIRST_CHUNK = Math.min(200, total);
    var bounds = new kakao.maps.LatLngBounds();

    // 1차 청크 (즉시) — 사용자 즉시 피드백
    var firstMarkers = new Array(FIRST_CHUNK);
    for (var i = 0; i < FIRST_CHUNK; i++) {
      var l = validListings[i];
      var coords = new kakao.maps.LatLng(l.lat, l.lng);
      bounds.extend(coords);
      // ⚡ title 옵션 제거 — 브라우저 tooltip 불필요, 마커 내부 attr 할당 비용 제거
      var marker = new kakao.maps.Marker({ position: coords });
      kakao.maps.event.addListener(marker, 'click', makeMarkerClickHandler(marker, l));
      firstMarkers[i] = marker;
    }
    _clusterer.addMarkers(firstMarkers);

    // ⚡ URL 복원이 없을 때만 setBounds — 복원 있을 땐 그 좌표 유지
    if (!_urlRestored && FIRST_CHUNK > 0) {
      try { _map.setBounds(bounds); } catch(e) {}
    }

    // 2차 청크 (idle) — 나머지 전체를 한 번에
    if (total > FIRST_CHUNK) {
      _ric(function() {
        var rest = new Array(total - FIRST_CHUNK);
        for (var j = FIRST_CHUNK; j < total; j++) {
          var l2 = validListings[j];
          var c2 = new kakao.maps.LatLng(l2.lat, l2.lng);
          var m2 = new kakao.maps.Marker({ position: c2 });
          kakao.maps.event.addListener(m2, 'click', makeMarkerClickHandler(m2, l2));
          rest[j - FIRST_CHUNK] = m2;
        }
        if (_clusterer) _clusterer.addMarkers(rest);
      });
    }
  }

  function buildListingInfoHtml(l) {
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

  // ======================== 접이식 툴바 (헤더만 즉시, 바디는 lazy) ========================
  function buildToolbarHeader(mapDiv) {
    if (document.getElementById('ws-map-toolbar')) return;

    var bar = document.createElement('div');
    bar.id = 'ws-map-toolbar';
    bar.style.cssText = 'position:absolute;top:12px;left:12px;z-index:10;background:rgba(255,255,255,.96);border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.15);font-family:-apple-system,sans-serif;max-width:520px;user-select:none;';

    // 헤더 (항상 보임 — 토글 버튼)
    var header = document.createElement('div');
    header.id = 'ws-tb-header';
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;gap:12px;';
    header.innerHTML = '<span style="font-size:12px;font-weight:700;color:#2D5A27;">🛠 지도 도구</span>' +
      '<span id="ws-tb-toggle" style="font-size:11px;color:#888;">▼ 펼치기</span>';
    bar.appendChild(header);

    // 바디 placeholder (display:none) — 첫 펼침 시 lazy 빌드
    var body = document.createElement('div');
    body.id = 'ws-tb-body';
    body.style.cssText = 'display:none;padding:0 10px 10px 10px;flex-direction:column;gap:6px;max-height:70vh;overflow-y:auto;';
    bar.appendChild(body);

    header.addEventListener('click', function() {
      // ⚡ 최초 펼침 시 바디 콘텐츠 빌드 (40+ 버튼 DOM 생성 지연)
      if (!_toolbarBodyBuilt) {
        _toolbarBodyBuilt = true;
        buildToolbarBody(body, mapDiv);
      }
      var isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'flex' : 'none';
      document.getElementById('ws-tb-toggle').textContent = isHidden ? '▲ 접기' : '▼ 펼치기';
    });

    // 스타일 — 1회만 주입 (헤더 단계에서 준비)
    if (!document.getElementById('ws-map-toolbar-style')) {
      var st = document.createElement('style');
      st.id = 'ws-map-toolbar-style';
      st.textContent =
        '#ws-map-toolbar button{padding:5px 9px;font-size:11px;font-weight:600;border:1px solid #dcdcdc;background:#fff;color:#444;border-radius:6px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s,border-color .12s;}' +
        '#ws-map-toolbar button:hover{background:#f5f9f3;border-color:#2D5A27;color:#2D5A27;}' +
        '#ws-map-toolbar button.ws-btn-active{background:#2D5A27;color:#fff;border-color:#2D5A27;}' +
        '#ws-map-toolbar .ws-sec-label{font-size:10px;font-weight:700;color:#999;letter-spacing:.5px;padding:4px 0 0 2px;}' +
        '#ws-map-toolbar .ws-row{display:flex;gap:3px;flex-wrap:wrap;}' +
        '#ws-map-toolbar #ws-tb-body::-webkit-scrollbar{width:6px;}' +
        '#ws-map-toolbar #ws-tb-body::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px;}';
      document.head.appendChild(st);
    }
    mapDiv.appendChild(bar);
  }

  function buildToolbarBody(body, mapDiv) {
    // 지도 타입
    body.appendChild(sectionLabel('지도타입'));
    var typeRow = rowDiv();
    [
      { label: '일반', id: 'ROADMAP' },
      { label: '스카이뷰', id: 'SKYVIEW' },
      { label: '하이브리드', id: 'HYBRID' }
    ].forEach(function(t, i) {
      var b = makeBtn(t.label);
      b.addEventListener('click', function() {
        _map.setMapTypeId(kakao.maps.MapTypeId[t.id]);
        Array.prototype.forEach.call(typeRow.children, function(c) { c.classList.remove('ws-btn-active'); });
        b.classList.add('ws-btn-active');
      });
      if (i === 0) b.classList.add('ws-btn-active');
      typeRow.appendChild(b);
    });
    body.appendChild(typeRow);

    // 오버레이
    body.appendChild(sectionLabel('오버레이'));
    var ovRow = rowDiv();
    [
      { label: '🚦 교통', key: 'traffic', type: 'TRAFFIC' },
      { label: '🌍 지형', key: 'terrain', type: 'TERRAIN' },
      { label: '🚴 자전거', key: 'bicycle', type: 'BICYCLE' },
      { label: '🗺 지적도', key: 'useDistrict', type: 'USE_DISTRICT' },
      { label: '🚶 로드뷰층', key: 'roadviewLayer', type: 'ROADVIEW' }
    ].forEach(function(o) {
      var b = makeBtn(o.label);
      b.addEventListener('click', function() {
        if (_overlays[o.key]) {
          _map.removeOverlayMapTypeId(kakao.maps.MapTypeId[o.type]);
          _overlays[o.key] = false;
          b.classList.remove('ws-btn-active');
        } else {
          _map.addOverlayMapTypeId(kakao.maps.MapTypeId[o.type]);
          _overlays[o.key] = true;
          b.classList.add('ws-btn-active');
        }
      });
      ovRow.appendChild(b);
    });
    body.appendChild(ovRow);

    // 그리기
    body.appendChild(sectionLabel('그리기/측정'));
    var drawRow = rowDiv();
    [
      { label: '📍 마커', type: 'MARKER' },
      { label: '📏 거리', type: 'POLYLINE' },
      { label: '📐 면적', type: 'POLYGON' },
      { label: '⭕ 원', type: 'CIRCLE' },
      { label: '▭ 사각형', type: 'RECTANGLE' },
      { label: '➡ 화살표', type: 'ARROW' }
    ].forEach(function(d) {
      var b = makeBtn(d.label);
      b.addEventListener('click', function() {
        showToast('⏳ 그리기 도구 로딩...');
        ensureDrawing(function() {
          if (!_drawingManager || !kakao.maps.drawing) {
            showToast('⚠ 그리기 라이브러리 로드 실패');
            return;
          }
          try { _drawingManager.cancel(); } catch(e) {}
          try {
            _drawingManager.select(kakao.maps.drawing.OverlayType[d.type]);
            showToast('✏ ' + d.label + ' — 지도에 클릭/드래그');
          } catch(e) { showToast('⚠ 그리기 오류: ' + e.message); }
        });
      });
      drawRow.appendChild(b);
    });
    var clearDraw = makeBtn('❌ 지우기');
    clearDraw.addEventListener('click', function() {
      if (!_drawingManager) return;
      try {
        _drawingManager.cancel();
        var data = _drawingManager.getData();
        Object.keys(data || {}).forEach(function(k) {
          (data[k] || []).slice().forEach(function(obj) {
            try { _drawingManager.remove(obj); } catch(e) {}
          });
        });
      } catch(e) {}
    });
    drawRow.appendChild(clearDraw);
    body.appendChild(drawRow);

    // 주변시설
    body.appendChild(sectionLabel('주변시설'));
    var catRow = rowDiv();
    [
      { label: '🏦 은행', code: 'BK9' },
      { label: '🚇 지하철', code: 'SW8' },
      { label: '🅿 주차장', code: 'PK6' },
      { label: '🏪 편의점', code: 'CS2' },
      { label: '☕ 카페', code: 'CE7' },
      { label: '🍽 음식점', code: 'FD6' },
      { label: '🏫 학교', code: 'SC4' },
      { label: '🏥 병원', code: 'HP8' },
      { label: '💊 약국', code: 'PM9' },
      { label: '⛽ 주유소', code: 'OL7' },
      { label: '🏨 숙박', code: 'AD5' },
      { label: '🏛 공공', code: 'PO3' }
    ].forEach(function(c) {
      var b = makeBtn(c.label);
      b.addEventListener('click', function() { searchCategory(c.code, b); });
      catRow.appendChild(b);
    });
    var clearCat = makeBtn('❌ 해제');
    clearCat.addEventListener('click', clearPlaceMarkers);
    catRow.appendChild(clearCat);
    body.appendChild(catRow);

    // 반경
    body.appendChild(sectionLabel('반경검색'));
    var radRow = rowDiv();
    [500, 1000, 2000, 3000, 5000].forEach(function(r) {
      var b = makeBtn(r >= 1000 ? (r/1000) + 'km' : r + 'm');
      b.addEventListener('click', function() { enableRadiusMode(r, b); });
      radRow.appendChild(b);
    });
    var clearR = makeBtn('❌ 해제');
    clearR.addEventListener('click', clearRadius);
    radRow.appendChild(clearR);
    body.appendChild(radRow);

    // 기능
    body.appendChild(sectionLabel('기능'));
    var actRow = rowDiv();
    var rvBtn = makeBtn('🚶 로드뷰');
    rvBtn.addEventListener('click', function() { toggleRoadview(mapDiv, rvBtn); });
    actRow.appendChild(rvBtn);

    var locBtn = makeBtn('📍 내위치');
    locBtn.addEventListener('click', function() { goToMyLocation(locBtn); });
    actRow.appendChild(locBtn);

    var fsBtn = makeBtn('⛶ 전체화면');
    fsBtn.addEventListener('click', function() { toggleFullscreen(mapDiv, fsBtn); });
    actRow.appendChild(fsBtn);

    var shareBtn = makeBtn('🔗 공유');
    shareBtn.addEventListener('click', shareCurrentView);
    actRow.appendChild(shareBtn);

    var printBtn = makeBtn('🖨 인쇄');
    printBtn.addEventListener('click', function() { window.print(); });
    actRow.appendChild(printBtn);

    var heatBtn = makeBtn('🔥 히트맵');
    heatBtn.addEventListener('click', function() { toggleHeatmap(heatBtn); });
    actRow.appendChild(heatBtn);

    var addrBtn = makeBtn('📮 주소조회');
    addrBtn.addEventListener('click', function() { enableAddressMode(addrBtn); });
    actRow.appendChild(addrBtn);

    body.appendChild(actRow);

    // 검색창
    body.appendChild(sectionLabel('장소검색'));
    var searchRow = document.createElement('div');
    searchRow.style.cssText = 'display:flex;gap:4px;';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '장소/주소 검색...';
    input.style.cssText = 'flex:1;border:1px solid #dcdcdc;outline:none;font-size:12px;padding:6px 8px;border-radius:6px;';
    var sbtn = makeBtn('🔍');
    sbtn.addEventListener('click', function() { keywordSearch(input.value); });
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') keywordSearch(input.value); });
    searchRow.appendChild(input);
    searchRow.appendChild(sbtn);
    body.appendChild(searchRow);

    // ⚡ 스타일은 buildToolbarHeader 에서 사전 주입됨
  }

  function sectionLabel(text) {
    var d = document.createElement('div');
    d.className = 'ws-sec-label';
    d.textContent = text;
    return d;
  }
  function rowDiv() {
    var d = document.createElement('div');
    d.className = 'ws-row';
    return d;
  }
  function makeBtn(label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    return b;
  }

  // ======================== 장소 검색 ========================
  function keywordSearch(keyword) {
    if (!keyword || !keyword.trim()) return;
    ensureServices();
    if (!_placesService) {
      showToast('⚠ 검색 서비스 로드 실패 — 새로고침 후 다시 시도');
      return;
    }
    clearPlaceMarkers();
    showToast('🔍 "' + keyword + '" 검색중...');
    _placesService.keywordSearch(keyword, function(data, status) {
      if (status === kakao.maps.services.Status.OK) {
        var bounds = new kakao.maps.LatLngBounds();
        data.forEach(function(p) {
          var pos = new kakao.maps.LatLng(p.y, p.x);
          bounds.extend(pos);
          var m = new kakao.maps.Marker({ position: pos, map: _map });
          kakao.maps.event.addListener(m, 'click', (function(mk, place) {
            return function() {
              var iw = getSharedIw();
              try { iw.close(); } catch(e) {}
              var html = '<div style="padding:10px 12px;min-width:200px;font-size:12px;line-height:1.5;">' +
                '<div style="font-weight:700;color:#2D5A27;margin-bottom:4px;">' + place.place_name + '</div>' +
                '<div style="color:#666;">' + (place.road_address_name || place.address_name || '') + '</div>' +
                (place.phone ? '<div style="color:#888;margin-top:4px;">📞 ' + place.phone + '</div>' : '') +
                '</div>';
              iw.setContent(html);
              iw.open(_map, mk);
            };
          })(m, p));
          _placeMarkers.push(m);
        });
        _map.setBounds(bounds);
        showToast('🔍 ' + data.length + '건 찾음');
      } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
        showToast('⚠ 검색 결과 없음');
      } else {
        showToast('⚠ 검색 오류: ' + status);
      }
    });
  }

  function searchCategory(code, btn) {
    ensureServices();
    if (!_placesService) { showToast('⚠ 검색 서비스 미로드'); return; }
    clearPlaceMarkers();
    document.querySelectorAll('#ws-map-toolbar button').forEach(function(b) {
      if (/🏦|🚇|🅿|🏪|☕|🍽|🏫|🏥|💊|⛽|🏨|🏛/.test(b.textContent)) b.classList.remove('ws-btn-active');
    });
    btn.classList.add('ws-btn-active');
    _placesService.categorySearch(code, function(data, status) {
      if (status === kakao.maps.services.Status.OK) {
        data.forEach(function(p) {
          var pos = new kakao.maps.LatLng(p.y, p.x);
          var m = new kakao.maps.Marker({ position: pos, map: _map });
          kakao.maps.event.addListener(m, 'click', (function(mk, place) {
            return function() {
              var iw = getSharedIw();
              try { iw.close(); } catch(e) {}
              iw.setContent('<div style="padding:8px 10px;font-size:12px;"><b>' + place.place_name + '</b><br><span style="color:#666;">' + (place.road_address_name || place.address_name) + '</span></div>');
              iw.open(_map, mk);
            };
          })(m, p));
          _placeMarkers.push(m);
        });
        showToast('✔ ' + data.length + '개 표시');
      } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
        showToast('⚠ 현재 지도 영역에 결과 없음 — 줌인 후 다시 시도');
      } else {
        showToast('⚠ 검색 오류: ' + status);
      }
    }, { useMapBounds: true });
  }

  function clearPlaceMarkers() {
    _placeMarkers.forEach(function(m) { m.setMap(null); });
    _placeMarkers = [];
    if (_sharedIw) { try { _sharedIw.close(); } catch(e) {} }
  }

  // ======================== 반경 검색 ========================
  function enableRadiusMode(radiusMeters, btn) {
    _clickMode = 'radius';
    document.querySelectorAll('#ws-map-toolbar button').forEach(function(b) {
      if (/^\d+(km|m)$/.test(b.textContent.trim())) b.classList.remove('ws-btn-active');
    });
    btn.classList.add('ws-btn-active');
    window._wsRadiusMeters = radiusMeters;
    showToast('지도에서 반경 중심점을 클릭하세요');
  }
  function applyRadius(latlng) {
    var r = window._wsRadiusMeters || 1000;
    if (_radiusCircle) _radiusCircle.setMap(null);
    _radiusCircle = new kakao.maps.Circle({
      center: latlng, radius: r,
      strokeWeight: 2, strokeColor: '#2D5A27', strokeOpacity: 0.8, strokeStyle: 'dashed',
      fillColor: '#2D5A27', fillOpacity: 0.12, map: _map
    });
    var filtered = _allListings.filter(function(l) {
      if (!l.lat || !l.lng) return false;
      return haversine(latlng.getLat(), latlng.getLng(), l.lat, l.lng) <= r;
    });
    if (_clusterer) _clusterer.clear();
    var bounds = new kakao.maps.LatLngBounds();
    bounds.extend(latlng);
    var markers = filtered.map(function(l) {
      var pos = new kakao.maps.LatLng(l.lat, l.lng);
      bounds.extend(pos);
      var m = new kakao.maps.Marker({ position: pos, title: l.title });
      kakao.maps.event.addListener(m, 'click', makeMarkerClickHandler(m, l));
      return m;
    });
    _clusterer.addMarkers(markers);
    _map.setBounds(bounds);
    _clickMode = 'none';
    showToast('🎯 반경 ' + (r >= 1000 ? (r/1000) + 'km' : r + 'm') + ' 내 매물 ' + filtered.length + '건');
  }
  function clearRadius() {
    if (_radiusCircle) { _radiusCircle.setMap(null); _radiusCircle = null; }
    renderListingMarkers();
    showToast('반경 검색 해제');
  }
  function haversine(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ======================== 주소 조회 ========================
  function enableAddressMode(btn) {
    _clickMode = 'address';
    btn.classList.add('ws-btn-active');
    showToast('지도를 클릭하면 해당 지점의 주소를 알려드립니다');
  }
  function lookupAddress(latlng) {
    ensureServices();
    if (!_geocoder) return;
    _geocoder.coord2Address(latlng.getLng(), latlng.getLat(), function(result, status) {
      if (status === kakao.maps.services.Status.OK && result[0]) {
        var r = result[0];
        var road = r.road_address ? r.road_address.address_name : '';
        var jibun = r.address ? r.address.address_name : '';
        var content = '<div style="padding:10px 12px;font-size:12px;min-width:220px;">' +
          (road ? '<div><b>도로명:</b> ' + road + '</div>' : '') +
          (jibun ? '<div style="margin-top:4px;"><b>지번:</b> ' + jibun + '</div>' : '') +
          '<div style="margin-top:4px;color:#888;font-size:11px;">' + latlng.getLat().toFixed(6) + ', ' + latlng.getLng().toFixed(6) + '</div>' +
          '</div>';
        var iw = getSharedIw();
        try { iw.close(); } catch(e) {}
        iw.setContent(content);
        iw.setPosition(latlng);
        iw.open(_map);
      }
    });
    _clickMode = 'none';
  }

  // ======================== 로드뷰 (오버레이 방식 — 지도 DOM 수정 없음) ========================
  function toggleRoadview(mapDiv, btn) {
    // 끄기
    if (_rvContainer && _rvContainer.parentNode) {
      _rvContainer.parentNode.removeChild(_rvContainer);
      _rvContainer = null;
      _roadview = null;
      if (_rvMarker) { _rvMarker.setMap(null); _rvMarker = null; }
      btn.classList.remove('ws-btn-active');
      btn.textContent = '🚶 로드뷰';
      return;
    }

    // 켜기: mapDiv 우측 50% 를 덮는 absolute 오버레이 (지도 내부 DOM 손대지 않음)
    if (getComputedStyle(mapDiv).position === 'static') mapDiv.style.position = 'relative';

    _rvContainer = document.createElement('div');
    _rvContainer.id = 'ws-roadview-container';
    _rvContainer.style.cssText = 'position:absolute;top:0;right:0;width:50%;height:100%;z-index:50;border-left:3px solid #2D5A27;background:#000;box-shadow:-4px 0 16px rgba(0,0,0,0.25);';

    // 닫기 버튼
    var closeBtn = document.createElement('div');
    closeBtn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:51;width:28px;height:28px;border-radius:14px;background:rgba(0,0,0,0.75);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;font-weight:700;';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleRoadview(mapDiv, btn); });
    _rvContainer.appendChild(closeBtn);

    // 로드뷰 본체용 내부 div (닫기 버튼과 z-index 분리)
    var rvInner = document.createElement('div');
    rvInner.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    _rvContainer.appendChild(rvInner);

    mapDiv.appendChild(_rvContainer);

    // 로드뷰 생성
    try {
      _roadview = new kakao.maps.Roadview(rvInner);
      _roadviewClient = new kakao.maps.RoadviewClient();

      var center = _map.getCenter();
      _roadviewClient.getNearestPanoId(center, 150, function(panoId) {
        if (panoId) {
          _roadview.setPanoId(panoId, center);
          // 두 번 relayout 해주면 초기 렌더 안정화
          setTimeout(function() { try { _roadview.relayout(); } catch(e) {} }, 60);
          setTimeout(function() { try { _roadview.relayout(); } catch(e) {} }, 300);
          if (!_rvMarker) _rvMarker = new kakao.maps.Marker({ position: center, map: _map });
          else _rvMarker.setPosition(center);
        } else {
          rvInner.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#fff;font-size:13px;text-align:center;padding:20px;">' +
            '<div style="font-size:36px;margin-bottom:12px;">🚶</div>' +
            '이 위치에는 로드뷰가 없습니다.<br>지도를 클릭해 다른 지점을 선택하세요.' +
            '</div>';
        }
      });
    } catch(e) {
      rvInner.innerHTML = '<div style="padding:20px;color:#fff;font-size:12px;">로드뷰 로드 실패: ' + e.message + '</div>';
    }

    btn.classList.add('ws-btn-active');
    btn.textContent = '🚶 로드뷰 끄기';
  }

  // ======================== 내 위치 ========================
  function goToMyLocation(btn) {
    if (!navigator.geolocation) { alert('위치 정보가 지원되지 않습니다'); return; }
    btn.textContent = '📍 검색중...';
    navigator.geolocation.getCurrentPosition(function(pos) {
      var latlng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
      _map.setCenter(latlng);
      _map.setLevel(4);
      if (_myLocMarker) _myLocMarker.setMap(null);
      _myLocMarker = new kakao.maps.Marker({
        position: latlng, map: _map,
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

  // ======================== 전체화면 ========================
  function toggleFullscreen(mapDiv, btn) {
    var doc = document, el = mapDiv;
    var isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
    if (!isFs) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) el.msRequestFullscreen();
      btn.textContent = '⛶ 해제';
    } else {
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      else if (doc.msExitFullscreen) doc.msExitFullscreen();
      btn.textContent = '⛶ 전체화면';
    }
    setTimeout(function() { try { _map.relayout(); } catch(e) {} }, 300);
  }
  document.addEventListener('fullscreenchange', function() {
    setTimeout(function() { try { _map && _map.relayout(); } catch(e) {} }, 200);
  });

  // ======================== 공유 ========================
  function shareCurrentView() {
    var c = _map.getCenter();
    var lvl = _map.getLevel();
    var url = window.location.origin + window.location.pathname + '?map=' + c.getLat().toFixed(6) + ',' + c.getLng().toFixed(6) + ',' + lvl;
    try { navigator.clipboard.writeText(url).then(function() { showToast('🔗 URL 복사됨'); }); }
    catch(e) { prompt('현재 지도 URL', url); }
  }
  function restoreFromURL() {
    try {
      var m = /[?&]map=([^&]+)/.exec(window.location.search);
      if (m) {
        var parts = m[1].split(',');
        if (parts.length === 3) {
          _map.setCenter(new kakao.maps.LatLng(parseFloat(parts[0]), parseFloat(parts[1])));
          _map.setLevel(parseInt(parts[2], 10));
          return true;
        }
      }
    } catch(e) {}
    return false;
  }

  // ======================== 히트맵 ========================
  function toggleHeatmap(btn) {
    if (_heatmapOverlays.length > 0) {
      _heatmapOverlays.forEach(function(o) { o.setMap(null); });
      _heatmapOverlays = [];
      btn.classList.remove('ws-btn-active');
      return;
    }
    var grid = {};
    _allListings.forEach(function(l) {
      if (!l.lat || !l.lng) return;
      var key = Math.round(l.lat * 500) + '_' + Math.round(l.lng * 500);
      grid[key] = grid[key] || { lat: 0, lng: 0, count: 0 };
      grid[key].lat += l.lat;
      grid[key].lng += l.lng;
      grid[key].count += 1;
    });
    var max = 0;
    Object.keys(grid).forEach(function(k) { if (grid[k].count > max) max = grid[k].count; });
    Object.keys(grid).forEach(function(k) {
      var g = grid[k];
      var intensity = g.count / max;
      var circle = new kakao.maps.Circle({
        center: new kakao.maps.LatLng(g.lat / g.count, g.lng / g.count),
        radius: 200 + g.count * 20,
        strokeWeight: 0,
        fillColor: intensity > 0.66 ? '#e53e3e' : intensity > 0.33 ? '#f6ad55' : '#2D5A27',
        fillOpacity: 0.35 + intensity * 0.3,
        map: _map
      });
      _heatmapOverlays.push(circle);
    });
    btn.classList.add('ws-btn-active');
    showToast('🔥 히트맵 ' + Object.keys(grid).length + '개 영역');
  }

  // ======================== 축척 바 (좌하단) ========================
  function buildScaleBar(mapDiv) {
    if (document.getElementById('ws-scale')) return;
    _scaleEl = document.createElement('div');
    _scaleEl.id = 'ws-scale';
    _scaleEl.style.cssText = 'position:absolute;bottom:12px;left:12px;background:rgba(255,255,255,.92);padding:4px 8px;border-radius:4px;font-size:10px;font-weight:600;color:#555;box-shadow:0 1px 4px rgba(0,0,0,.1);z-index:9;pointer-events:none;';
    mapDiv.appendChild(_scaleEl);
    updateScale();
    kakao.maps.event.addListener(_map, 'zoom_changed', updateScale);
  }
  function updateScale() {
    if (!_scaleEl) return;
    var level = _map.getLevel();
    var scales = [null, '20m', '30m', '50m', '100m', '250m', '500m', '1km', '2km', '4km', '8km', '16km', '32km', '64km', '128km'];
    _scaleEl.textContent = '📏 ' + (scales[level] || '?') + ' · L' + level;
  }

  // ======================== 토스트 ========================
  function showToast(msg) {
    var mapDiv = document.getElementById('ws-kakao-map');
    if (!mapDiv) return;
    var t = document.createElement('div');
    t.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(45,90,39,.92);color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;font-weight:600;z-index:20;box-shadow:0 4px 14px rgba(0,0,0,.2);';
    t.textContent = msg;
    mapDiv.appendChild(t);
    setTimeout(function() { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, 2500);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
  }

  // ======================== 지도 이벤트 ========================
  function attachMapEvents() {
    kakao.maps.event.addListener(_map, 'click', function(mouseEvent) {
      if (_clickMode === 'radius') applyRadius(mouseEvent.latLng);
      else if (_clickMode === 'address') lookupAddress(mouseEvent.latLng);
      else if (_roadview && _rvContainer) {
        if (!_rvMarker) _rvMarker = new kakao.maps.Marker({ position: mouseEvent.latLng, map: _map });
        else _rvMarker.setPosition(mouseEvent.latLng);
        _roadviewClient.getNearestPanoId(mouseEvent.latLng, 50, function(panoId) {
          if (panoId) _roadview.setPanoId(panoId, mouseEvent.latLng);
        });
      }
    });
    // ⚡ mousemove 리스너 제거 (jank 제거)
  }

  // ======================== 상세 미니맵 ========================
  var _miniMap = null, _miniMarker = null, _miniMapLocked = true;
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
      center: center, level: 3,
      draggable: false, scrollwheel: false,
      disableDoubleClick: true, disableDoubleClickZoom: true
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

  // ======================== 브릿지 ========================
  // [Step 105 fix 2026-05-19 사장님 명령] S-10 — 통합 메모리 정리 함수
  //   사장님 장시간 사용 시 _placeMarkers / _heatmapOverlays / _myLocMarker /
  //   _radiusCircle / _roadviewClient 누적 → OOM 위험
  //   해결: 단일 함수로 모두 정리 + 탭 hidden 시 호출
  function clearAllMapResources() {
    try {
      if (_placeMarkers && _placeMarkers.length > 0) {
        _placeMarkers.forEach(function(m) { try { m.setMap(null); } catch(e) {} });
        _placeMarkers = [];
      }
      if (_heatmapOverlays && _heatmapOverlays.length > 0) {
        _heatmapOverlays.forEach(function(o) { try { o.setMap(null); } catch(e) {} });
        _heatmapOverlays = [];
      }
      if (_myLocMarker) { try { _myLocMarker.setMap(null); } catch(e) {} _myLocMarker = null; }
      if (_radiusCircle) { try { _radiusCircle.setMap(null); } catch(e) {} _radiusCircle = null; }
      if (_roadviewClient) { _roadviewClient = null; }
      if (_sharedIw) { try { _sharedIw.close(); } catch(e) {} }
    } catch(e) {}
  }
  // 탭 hidden 시 자동 정리 (사장님 지도 탭 떠날 때 메모리 해제)
  try {
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) clearAllMapResources();
    });
  } catch(e) {}
  // pagehide 도 cover (모바일/일부 브라우저)
  try {
    window.addEventListener('pagehide', clearAllMapResources);
  } catch(e) {}

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'ws-map-render') {
      if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.Map) renderWishesMap();
    }
    if (e.data && e.data.type === 'ws-minimap-render') {
      if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.Map) renderDetailMinimap(e.data);
      else if (typeof kakao !== 'undefined' && kakao.maps) kakao.maps.load(function() { renderDetailMinimap(e.data); });
    }
    // [Step 105] 외부 trigger 로 정리 가능
    if (e.data && e.data.type === 'ws-map-clear') {
      clearAllMapResources();
    }
  });

  // ======================== SDK 로더 ========================
  // layout.tsx 가 beforeInteractive 로 SDK 를 이미 로드했으므로 대부분 즉시 경로 탐
  if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.Map) {
    // 즉시 렌더 (가장 빠른 경로)
    renderWishesMap();
  } else if (typeof kakao !== 'undefined' && kakao.maps && typeof kakao.maps.load === 'function') {
    // SDK 스크립트는 로드됐지만 모듈 미파싱 — kakao.maps.load 로 트리거
    kakao.maps.load(renderWishesMap);
  } else {
    // [Step F-9 fix 2026-05-18] 하드코딩 제거 — window.__KAKAO_APPKEY 재사용
    var appkey = (window.__KAKAO_APPKEY) || '';
    if (!appkey) { console.warn('[map-main] KAKAO_APPKEY 없음 — SDK fallback skip'); return; }
    var s = document.createElement('script');
    s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + appkey + '&autoload=false&libraries=services,clusterer,drawing';
    s.onload = function() { kakao.maps.load(renderWishesMap); };
    document.head.appendChild(s);
  }
})();
