/**
 * v395 — 매물 등록/수정 모달에 mini map + 좌표 클릭 input
 * 사장님 명령 2026-05-14: 100% 정확한 위치 보장 (사람이 직접 클릭)
 *
 * 동작:
 *   1. v297-edit 모달 (수정) 감지
 *   2. 주소 입력 필드 (.v297-grid 의 [name="address"]) 옆/아래에 mini map inject
 *   3. 주소 입력 시 → kakao geocoder → 마커 표시
 *   4. 지도 click → 마커 위치 변경 → form 의 hidden lat/lng input set
 *   5. 마커 drag 가능 (미세 조정)
 *   6. 좌표 표시 (소수점 6자리)
 */
(function () {
  'use strict';
  if (window.__WS_V395_EDIT_MAP_PICKER__) return;
  window.__WS_V395_EDIT_MAP_PICKER__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v395-edit-map-picker]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function injectStyle() {
    if (document.getElementById('v395-style')) return;
    var s = document.createElement('style');
    s.id = 'v395-style';
    s.textContent = [
      '.v395-map-wrap{margin:12px 0;border-radius:10px;overflow:hidden;border:1px solid rgba(0,0,0,0.10);background:#f5f5f7;}',
      '.v395-map-header{padding:8px 12px;font-size:12px;color:#1d1d1f;font-weight:600;background:#fff;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;justify-content:space-between;align-items:center;}',
      '.v395-map-coord{font-family:-apple-system,SF Mono,monospace;font-size:11px;color:#6e6e73;font-weight:500;}',
      '.v395-map-help{font-size:11px;color:#8e8e93;font-weight:400;}',
      '.v395-map-canvas{width:100%;height:280px;}',
      '.v395-map-actions{padding:8px 12px;display:flex;gap:8px;background:#fff;border-top:1px solid rgba(0,0,0,0.06);}',
      '.v395-map-btn{padding:6px 12px;border:none;border-radius:6px;background:#007AFF;color:#fff;font-size:12px;font-weight:600;cursor:pointer;}',
      '.v395-map-btn.secondary{background:#e5e5ea;color:#1d1d1f;}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function loadKakao(callback) {
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

  // 주소 → 좌표 (kakao geocoder)
  function geocodeAddress(addr, callback) {
    if (!window.kakao || !kakao.maps || !kakao.maps.services) return callback(null);
    try {
      var geo = new kakao.maps.services.Geocoder();
      geo.addressSearch(addr, function (result, status) {
        if (status === kakao.maps.services.Status.OK && result.length > 0) {
          callback({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
        } else {
          // keyword fallback
          var places = new kakao.maps.services.Places();
          places.keywordSearch(addr, function (r2, s2) {
            if (s2 === kakao.maps.services.Status.OK && r2.length > 0) {
              callback({ lat: parseFloat(r2[0].y), lng: parseFloat(r2[0].x) });
            } else { callback(null); }
          });
        }
      });
    } catch (e) { callback(null); }
  }

  function injectMapPicker(form) {
    if (form.dataset.v395Done) return;
    form.dataset.v395Done = '1';

    // 주소 input 찾기
    var addrInput = form.querySelector('[name="address"]');
    if (!addrInput) return;

    // 이미 lat/lng input 있으면 사용, 없으면 hidden 추가
    var latInput = form.querySelector('[name="lat"]');
    var lngInput = form.querySelector('[name="lng"]');
    if (!latInput) {
      latInput = document.createElement('input');
      latInput.type = 'hidden';
      latInput.name = 'lat';
      form.appendChild(latInput);
    }
    if (!lngInput) {
      lngInput = document.createElement('input');
      lngInput.type = 'hidden';
      lngInput.name = 'lng';
      form.appendChild(lngInput);
    }

    // 주소 섹션 찾기 (.v297-sec-h 가 "주소 · 위치" 인 section)
    var addrSection = null;
    var sections = form.querySelectorAll('.v297-sec');
    for (var i = 0; i < sections.length; i++) {
      var h = sections[i].querySelector('.v297-sec-h');
      if (h && h.textContent.indexOf('주소') > -1) {
        addrSection = sections[i];
        break;
      }
    }
    if (!addrSection) addrSection = addrInput.closest('section') || addrInput.parentNode;

    // map wrap 생성
    var wrap = document.createElement('div');
    wrap.className = 'v395-map-wrap';
    wrap.innerHTML = [
      '<div class="v395-map-header">',
      '  <span>📍 위치 — 지도 click 또는 마커 drag 로 정확한 위치 지정</span>',
      '  <span class="v395-map-coord">lat: -, lng: -</span>',
      '</div>',
      '<div class="v395-map-canvas"></div>',
      '<div class="v395-map-actions">',
      '  <button type="button" class="v395-map-btn v395-search">🔍 주소로 검색</button>',
      '  <span class="v395-map-help">정확한 위치를 클릭하거나 마커를 드래그하세요</span>',
      '</div>',
    ].join('');

    addrSection.appendChild(wrap);

    var mapCanvas = wrap.querySelector('.v395-map-canvas');
    var coordEl = wrap.querySelector('.v395-map-coord');
    var searchBtn = wrap.querySelector('.v395-search');

    var mapInstance = null;
    var marker = null;

    function updateInputs(lat, lng) {
      latInput.value = String(lat);
      lngInput.value = String(lng);
      coordEl.textContent = 'lat: ' + lat.toFixed(6) + ', lng: ' + lng.toFixed(6);
      // change event fire (form 이 listening 할 수 있음)
      try {
        latInput.dispatchEvent(new Event('change', { bubbles: true }));
        lngInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}
    }

    function setMarkerPos(lat, lng) {
      if (!mapInstance || !window.kakao) return;
      var pos = new kakao.maps.LatLng(lat, lng);
      if (!marker) {
        marker = new kakao.maps.Marker({ position: pos, map: mapInstance, draggable: true });
        kakao.maps.event.addListener(marker, 'dragend', function () {
          var p = marker.getPosition();
          updateInputs(p.getLat(), p.getLng());
        });
      } else {
        marker.setPosition(pos);
      }
      mapInstance.setCenter(pos);
      updateInputs(lat, lng);
    }

    function searchAddress() {
      var addr = addrInput.value.trim();
      if (!addr) return;
      geocodeAddress(addr, function (result) {
        if (result) {
          setMarkerPos(result.lat, result.lng);
          mapInstance.setLevel(3);
        } else {
          alert('주소 검색 실패. 지도에서 직접 클릭해주세요.');
        }
      });
    }

    loadKakao(function () {
      var initLat = parseFloat(latInput.value) || 37.5665;
      var initLng = parseFloat(lngInput.value) || 126.9780;
      var initLevel = (latInput.value && lngInput.value) ? 3 : 8;
      mapInstance = new kakao.maps.Map(mapCanvas, {
        center: new kakao.maps.LatLng(initLat, initLng),
        level: initLevel,
      });

      // 기존 lat/lng 있으면 마커 표시
      if (latInput.value && lngInput.value) {
        setMarkerPos(initLat, initLng);
      } else if (addrInput.value) {
        // 주소 있으면 자동 geocoding
        searchAddress();
      }

      // 지도 click → 마커 이동
      kakao.maps.event.addListener(mapInstance, 'click', function (mouseEvent) {
        var p = mouseEvent.latLng;
        setMarkerPos(p.getLat(), p.getLng());
      });

      // 검색 버튼
      searchBtn.addEventListener('click', searchAddress);

      // 주소 input 변경 시 자동 geocoding (debounce 800ms)
      var t = null;
      addrInput.addEventListener('input', function () {
        if (t) clearTimeout(t);
        t = setTimeout(searchAddress, 800);
      });

      log('map picker installed in form');
    });
  }

  function scan() {
    // v297-edit modal form 감지
    var forms = document.querySelectorAll('form, .v297-grid');
    forms.forEach(function (f) {
      if (f.querySelector && f.querySelector('[name="address"]') && !f.dataset.v395Done) {
        // form 또는 form 의 parent 가 모달 안인지 확인
        var modal = f.closest('.v297-modal, [class*="modal"]') || f;
        injectStyle();
        injectMapPicker(modal === f ? f : modal.querySelector('form') || f);
      }
    });
  }

  function init() {
    scan();
    // MutationObserver — 모달 동적 추가 감지
    try {
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.addedNodes && m.addedNodes.length > 0) {
            scan();
            break;
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    log('v395 installed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
