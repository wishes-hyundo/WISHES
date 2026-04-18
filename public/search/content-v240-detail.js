/**
 * WISHES Search Detail — Single-Scroll Layout Patch v2.4.0
 * ================================================================
 * 대상      : /public/search/content.js v2.2.6 + v2.3.0 patch
 * 배포방식  : /public/search/content-v240-detail.js 로 배치 후
 *            src/app/search/page.tsx 에서 v230 패치 직후 async:false 로드
 * 적용원리  : window.WS.showDetail 을 한번 더 래핑하여 단일 스크롤 페이지로
 *            전면 재구성. v2.3.0 의 5탭 레이아웃을 건너뛰고 __orig_showDetail
 *            만 호출 후 container.innerHTML 교체.
 *
 * 디자인 근거 : /sessions/zealous-epic-brown/mnt/Desktop/
 *               WISHES_상세보기_재구성/45913_혜성빌딩_단일페이지.html
 *               (2026-04-17 승인본)
 *
 * 보존 필드  : 크롤링 17 라벨 · UI 파생 16 필드 · 중개사 입력 8 액션 = 41/41 (100%)
 * 보존 클래스: ws-gallery-main, ws-gallery-thumbs, ws-thumb, ws-thumb-active,
 *             ws-copy-id, ws-memo-input, ws-memo-save-btn, ws-similar-section
 *             (기존 이벤트 델리게이션 · lazy image fetch · 메모 저장 전부 재사용)
 *
 * 변경 사항
 *   A. 상단 갤러리 + 매물번호 topbar + ★관심 이동
 *   B. Hero : 주소 h1 + 도로명 placeholder + 가격 박스
 *   C. 기본정보 2단 배열 (4열 grid : k v k v)
 *   D. 옵션 칩 + 상세 설명 (AI SEO 버튼 제거 — 게시 준비 단계로 이관)
 *   E. 위치 · 유사매물
 *   F. 🔒 중개사 전용 (기본 접힘) — 이력·연락처·메모태그·원본
 *
 * 롤백 : <script> 태그 1개 제거 후 Vercel 재배포 시 v230 5탭으로 원상복구
 *
 * @version 2.4.0
 * @build 2026-04-17
 * @author WISHES · 사장님 승인 단일스크롤 재구성
 * ================================================================
 */

(function __v240Boot() {
  'use strict';

  var VERSION='2.5.0';
  var TAG = '[WP v' + VERSION + ']';

  // 도메인/경로 화이트리스트
  if (location.hostname !== 'wishes.co.kr' && location.hostname !== 'www.wishes.co.kr') return;
  if (location.pathname.indexOf('admin-auth') !== -1) return;
  if (location.pathname.indexOf('command-center') !== -1) return;

  // 중복 설치 방어
  if (window.WS && window.WS.__v240Applied) {
    console.log(TAG + ' already applied — skip');
    return;
  }

  // WS + v230 준비 대기 (최대 20초)
  var tries = 0;
  var timer = setInterval(function() {
    tries++;
    if (window.WS && typeof window.WS.showDetail === 'function'
        && typeof window.WS.__orig_showDetail === 'function') {
      clearInterval(timer);
      install();
    } else if (tries >= 200) {
      clearInterval(timer);
      console.warn(TAG + ' aborted — WS or v230 not ready');
    }
  }, 100);

  // ====================================================================
  // INSTALL
  // ====================================================================
  function install() {
    try {
      injectStyles();
      window.WS.__v230_showDetail = window.WS.showDetail;       // v2.3.0 래퍼 백업
      window.WS.showDetail = renderDetailV240;                  // 단일 스크롤 래퍼로 교체
      window.WS.__v240Applied = true;
      window.WS.__v240Version = VERSION;
      console.log(TAG + ' single-scroll detail installed');
    } catch (e) {
      console.error(TAG + ' install failed', e);
    }
  }

  // ====================================================================
  // RENDER — showDetail 래퍼
  // ====================================================================
  function renderDetailV240(listing) {
    // 1) 원본 showDetail 호출 (lazy image fetch 트리거용 — v230 5탭은 건너뜀)
    try { window.WS.__orig_showDetail(listing); } catch (e) {}

    var modal = document.getElementById('ws-modal-detail');
    var container = document.getElementById('ws-detail-container');
    if (!modal || !container) return;

    // 2) 단일 스크롤 HTML 주입
    container.innerHTML = buildHTML(listing);

    // 2.5) 썸네일 클릭 → 메인 이미지 교체 명시 바인딩 (v2.4.5, innerHTML 교체 후 안전장치)
    try { v245BindThumbs(container); } catch (e) { console.warn(TAG + ' thumb bind failed', e); }

    // 3) 유사매물 삽입 (기존 함수 재사용)
    var similarHtml = window.WS.showSimilarListings ? window.WS.showSimilarListings(listing) : '';
    var simMount = document.getElementById('ws-similar-section');
    if (simMount && similarHtml) simMount.innerHTML = similarHtml;

    // 4) 컨테이너 · 모달 스크롤 모두 초기화 (갤러리가 최상단에 보이도록)
    try { container.scrollTop = 0; } catch (e) {}
    try { modal.scrollTop = 0; } catch (e) {}
    try {
      var inner = modal.querySelector('.ws-modal-content, .ws-modal-body, .ws-modal-inner');
      if (inner) inner.scrollTop = 0;
    } catch (e) {}

    // 5) 카카오맵 + 도로명 geocode (비동기)
    try { renderKakaoMap(listing); } catch (e) { console.warn('[WP v' + VERSION + '] map init failed', e); }
  }

  // ====================================================================
  // KAKAO MAP + ROAD ADDRESS
  // ====================================================================
  function renderKakaoMap(L) {
    var mapEl = document.getElementById('v240-kakao-map');
    if (!mapEl) return;
    var lat = Number(L.lat), lng = Number(L.lng);
    var hasCoord = isFinite(lat) && isFinite(lng) && Math.abs(lat) > 0.1;

    var kakao = window.kakao;
    if (!kakao || !kakao.maps) {
      mapEl.innerHTML = '<div class="v240-map-fallback">카카오맵 SDK 로드 대기 중</div>';
      return;
    }

    kakao.maps.load(function() {
      if (!hasCoord) {
        // 주소 기반 지오코딩 (fallback)
        if (kakao.maps.services && kakao.maps.services.Geocoder && L.address) {
          var geoA = new kakao.maps.services.Geocoder();
          geoA.addressSearch(L.address, function(res, status) {
            if (status === kakao.maps.services.Status.OK && res[0]) {
              L.lat = parseFloat(res[0].y);
              L.lng = parseFloat(res[0].x);
              renderKakaoMap(L);
            } else {
              mapEl.innerHTML = '<div class="v240-map-fallback">좌표 정보가 없어 지도를 표시할 수 없습니다</div>';
            }
          });
        } else {
          mapEl.innerHTML = '<div class="v240-map-fallback">좌표 정보가 없어 지도를 표시할 수 없습니다</div>';
        }
        return;
      }

      var center = new kakao.maps.LatLng(lat, lng);
      var map = new kakao.maps.Map(mapEl, { center: center, level: 3 });
      new kakao.maps.Marker({ position: center, map: map });

      // 줌 컨트롤
      try { map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT); } catch (e) {}

      // 도로명 조회 (coord2Address)
      if (kakao.maps.services && kakao.maps.services.Geocoder) {
        var geo = new kakao.maps.services.Geocoder();
        geo.coord2Address(lng, lat, function(result, status) {
          if (status !== kakao.maps.services.Status.OK) return;
          var road = (result[0] && result[0].road_address && result[0].road_address.address_name) || '';
          var heroEl = document.getElementById('v240-hero-road');
          if (heroEl) heroEl.textContent = road ? '📍 ' + road : '';
        });
      }
    });
  }

  // ====================================================================
  // 전용 액션 (건축물대장 · AI 콘텐츠) — v2.4.3
  // ====================================================================
  function v243Toast(msg) {
    var t = document.createElement('div');
    t.className = 'v240-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.classList.add('show'); }, 10);
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 300); }, 1800);
  }
  function v243OpenBldgRegister(addr, useTxt) {
    // v2.4.6 — FULL API(/api/admin/building-registry-full) 사용 (주소 그대로 전달 → 서버가 Kakao로 bjdongCd 해석)
    console.log('[WP v2.5.0] 건축물대장 조회 시작: addr=', addr, 'useTxt=', useTxt);

    var box = document.createElement('div');
    box.className = 'v240-ai-modal';
    box.innerHTML =
      '<div class="box">' +
        '<h3>🏛️ 건축물대장 조회</h3>' +
        '<div class="sub">' + v243EscHtml(addr || '-') + ' · ' + v243EscHtml(useTxt || '-') + '</div>' +
        '<div id="v245-bldg-body" class="block"><div class="bval">⏳ 조회 중... (Kakao geocoding → 건축물대장 API)</div></div>' +
        '<button class="close">닫기</button>' +
      '</div>';
    document.body.appendChild(box);
    box.addEventListener('click', function(e){
      if (e.target.classList.contains('close') || e.target === box) box.remove();
    });

    if (!addr || !addr.trim()) {
      var body0 = document.getElementById('v245-bldg-body');
      if (body0) body0.innerHTML =
        '<div class="blabel">조회 불가</div>' +
        '<div class="bval">주소 정보가 비어 있습니다.</div>';
      return;
    }

    var fullApi = 'https://wishes.co.kr/api/admin/building-registry-full';
    var qs = 'address=' + encodeURIComponent(addr.trim());
    console.log('[WP v2.5.0] GET ' + fullApi + '?' + qs);

    fetch(fullApi + '?' + qs, {
      credentials: 'include',
      headers: { 'Authorization': 'Bearer wishes2026' }
    })
      .then(function(r){
        console.log('[WP v2.5.0] 건축물대장 응답 status=', r.status);
        return r.json().catch(function(){ return { success:false, error:'HTTP ' + r.status }; });
      })
      .then(function(j){
        console.log('[WP v2.5.0] 건축물대장 응답 데이터:', j);
        var body = document.getElementById('v245-bldg-body');
        if (!body) return;
        if (!j || !j.success || !j.data) {
          body.innerHTML =
            '<div class="blabel">조회 결과 없음</div>' +
            '<div class="bval">해당 주소의 건축물대장 정보를 찾을 수 없습니다.<br>' +
            '응답: ' + v243EscHtml((j && (j.error||j.message)) || '데이터 없음') + '</div>';
          return;
        }
        var d = j.data;
        // FULL API 필드명 (content.js 12906~12931 라인 참조) + 구식 필드명 fallback
        var rows = [
          ['건물명', d.buildingName || d.bldNm || '-'],
          ['주용도', d.buildingPurpose || d.mainPurpsCdNm || d.mainPurpose || '-'],
          ['건물구조', d.buildingStructure || d.strctCdNm || '-'],
          ['건축면적', (d.buildingArea) ? (d.buildingArea + ' m²') : '-'],
          ['연면적', (d.totalFloorArea || d.totArea) ? ((d.totalFloorArea || d.totArea) + ' m²') : '-'],
          ['대지면적', d.platArea ? (d.platArea + ' m²') : '-'],
          ['지상층수', (d.totalFloors || d.totalFloorCount || d.grndFlrCnt) ? ((d.totalFloors || d.totalFloorCount || d.grndFlrCnt) + '층') : '-'],
          ['지하층수', (d.ugrndFlrCnt != null) ? (d.ugrndFlrCnt + '층') : '-'],
          ['엘리베이터', (d.elevatorCount && parseInt(d.elevatorCount,10) > 0) ? (d.elevatorCount + '대') : '없음'],
          ['주차대수', (d.parkingCount != null) ? (d.parkingCount + '대') : '-'],
          ['사용승인일', d.approvalDate || d.useApproveDay || '-']
        ];
        var rowHtml = rows.map(function(r){
          return '<div class="v245-bldg-row"><span class="v245-bldg-k">' + v243EscHtml(r[0]) + '</span><span class="v245-bldg-v">' + v243EscHtml(r[1]) + '</span></div>';
        }).join('');
        body.innerHTML =
          '<div class="blabel">✅ 조회 완료 (FULL API · Kakao geocode)</div>' +
          '<div class="bval">' + rowHtml + '</div>';
      })
      .catch(function(err){
        console.error('[WP v2.5.0] 건축물대장 fetch 실패:', err);
        var body = document.getElementById('v245-bldg-body');
        if (body) body.innerHTML =
          '<div class="blabel">조회 오류</div>' +
          '<div class="bval">' + v243EscHtml((err && err.message) || String(err)) + '<br>(콘솔 F12 에서 자세한 오류 확인)</div>';
      });
  }
  function v243EscHtml(s) { return String(s||'').replace(/[&<>\"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c]; }); }
  function v243OpenAIModal(L) {
    // v2.4.6 — 자체 함수 window.WS._runAutoGenerate 직접 호출 (모달 열자마자 자동 생성 시작)
    L = L || {};
    var lid = String(L.id || '');
    console.log('[WP v2.5.0] AI 모달 오픈: lid=', lid, 'L=', L);
    if (!lid) { v243Toast('매물 ID 없음'); return; }

    // v2.4.8 — 이미 저장된 AI 결과 재사용 (모달 열 때마다 재생성 방지)
    var v248Saved = !!(L && (L.ai_title || L.ai_description || (L.ai_tags && L.ai_tags.length)));
    console.log('[WP v2.5.0] AI 저장값 존재?', v248Saved, { title: L && L.ai_title, desc: L && L.ai_description });

    var lidEsc = v243EscHtml(lid);
    var box = document.createElement('div');
    box.className = 'v240-ai-modal';
    box.innerHTML =
      '<div class="box">' +
        '<h3>✨ AI 매물 콘텐츠 생성 · 매물번호 ' + lidEsc + '</h3>' +
        '<div class="sub">자체 API /api/admin/auto-generate · 건축물대장 연동 · SEO 최적화</div>' +
        '<div id="ws-ai-status-' + lidEsc + '" class="block"><div class="bval">⏳ AI 호출 준비 중... 약 10~15초 소요됩니다.</div></div>' +
        '<div class="block"><div class="blabel">현재 설명 (생성 후 자동 교체)</div>' +
          '<div id="ws-description-text-' + lidEsc + '" class="bval">' + v243EscHtml(L.description || '-') + '</div></div>' +
        '<div style="display:flex;gap:10px;margin-top:12px">' +
          '<button type="button" id="ws-ai-generate-' + lidEsc + '" class="v245-run">✨ 다시 생성</button>' +
          '<button class="close">닫기</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(box);

    // v2.4.8 — 저장값 있으면 즉시 표시, 버튼 텍스트 '다시 생성'으로
    if (v248Saved) {
      var _s = document.getElementById('ws-ai-status-' + lid);
      if (_s) {
        var _tags = (L.ai_tags||[]).map(function(t){ return '<span style="display:inline-block;padding:3px 9px;background:#e8eaf6;color:#3f51b5;border-radius:12px;font-size:11px;margin:2px;">' + v243EscHtml(t) + '</span>'; }).join('');
        _s.innerHTML = '<div style="padding:14px;background:#f0fff0;border-radius:8px;border:1px solid #c8e6c9;">' +
          '<div style="font-size:14px;color:#2e7d32;font-weight:700;margin-bottom:8px;">💾 저장된 AI 콘텐츠 (재사용 중)</div>' +
          '<div style="font-size:13px;color:#333;margin-bottom:6px;"><strong>제목:</strong> ' + v243EscHtml(L.ai_title||'') + '</div>' +
          (_tags ? '<div style="margin-bottom:6px;"><strong style="font-size:11px;">태그:</strong> ' + _tags + '</div>' : '') +
          '<div style="font-size:11px;color:#888;margin-top:6px;">※ 재생성 시 기존 콘텐츠는 덮어씌워집니다.</div>' +
          '</div>';
      }
      var _d = document.getElementById('ws-description-text-' + lid);
      if (_d && L.ai_description) _d.innerHTML = v243EscHtml(L.ai_description);
      var _b = document.getElementById('ws-ai-generate-' + lid);
      if (_b) _b.textContent = '🔄 다시 생성 (덮어쓰기)';
    }

    box.addEventListener('click', function(e){
      var tgt = e.target;
      if (tgt.classList.contains('close') || tgt === box) { box.remove(); return; }
      if (tgt.id === ('ws-ai-generate-' + lid)) {
        v245RunAutoGen(lid, L);
      }
    });

    // 모달이 DOM 에 붙고 ID 가 유효해진 직후에 바로 AI 생성 시작 (저장값 없을 때만)
    if (!v248Saved) {
      setTimeout(function(){ v245RunAutoGen(lid, L); }, 80);
    } else {
      console.log('[WP v2.5.0] AI 저장값 존재 → 자동 재생성 스킵');
    }
  }
  function v245RunAutoGen(lid, L) {
    // v2.4.6 — 확장프로그램 없어도 동작하도록 자체 fetch 구현
    console.log('[WP v2.5.0] AI 자체 fetch 호출: /api/admin/auto-generate lid=' + lid);
    var statusEl = document.getElementById('ws-ai-status-' + lid);
    var descEl = document.getElementById('ws-description-text-' + lid);
    var btnEl = document.getElementById('ws-ai-generate-' + lid);
    if (statusEl) statusEl.innerHTML = '<div class="bval" style="padding:14px;background:#f0f0ff;border-radius:8px;text-align:center;">' +
      '<div style="font-size:14px;color:#667eea;font-weight:600;">✨ AI SEO 콘텐츠 생성 중...</div>' +
      '<div style="font-size:11px;color:#999;margin-top:4px;">서버에서 건축물대장 조회 → 최신 AI 분석 → SEO 최적화 (약 10~15초)</div></div>';
    if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.6'; btnEl.textContent = '생성 중...'; }

    fetch('https://wishes.co.kr/api/admin/auto-generate', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wishes2026'
      },
      body: JSON.stringify({ listingId: String(lid), style: 'trendy', aiModel: 'latest' })
    })
    .then(function(r){
      console.log('[WP v2.5.0] auto-generate 응답 status=' + r.status);
      return r.json().catch(function(){ return { success:false, error:'HTTP ' + r.status }; });
    })
    .then(function(data){
      console.log('[WP v2.5.0] auto-generate 응답 데이터:', data);
      if (data && data.success && data.result) {
        var R = data.result;
        // v2.4.8 — AI 결과를 L 객체 + allListings 에 저장 (재모달 오픈 시 재사용)
        try {
          if (L) {
            L.ai_title = R.title || '';
            L.ai_description = R.description || '';
            L.ai_tags = R.tags || [];
            L.ai_keywords = R.keywords || [];
            L.ai_meta_description = R.meta_description || '';
            L.ai_generated_at = new Date().toISOString();
            if (R.description) L.description = R.description;
            if (R.title) L.title = R.title;
          }
          if (window.WS && Array.isArray(window.WS.allListings)) {
            var _target = window.WS.allListings.find(function(x){ return String(x && x.id) === String(lid); });
            if (_target) {
              _target.ai_title = R.title || '';
              _target.ai_description = R.description || '';
              _target.ai_tags = R.tags || [];
              _target.ai_keywords = R.keywords || [];
              _target.ai_meta_description = R.meta_description || '';
              _target.ai_generated_at = new Date().toISOString();
              if (R.description) _target.description = R.description;
              if (R.title) _target.title = R.title;
              console.log('[WP v2.5.0] allListings 동기화 완료 lid=' + lid);
            }
          }
        } catch(e){ console.warn('[WP v2.5.0] AI 저장 동기화 실패', e); }
        if (descEl) descEl.innerHTML = v243EscHtml(R.description || '');
        if (statusEl) {
          var tagsHtml = (R.tags||[]).map(function(t){ return '<span style="display:inline-block;padding:3px 9px;background:#e8eaf6;color:#3f51b5;border-radius:12px;font-size:11px;margin:2px;">' + v243EscHtml(t) + '</span>'; }).join('');
          var kwHtml = (R.keywords||[]).map(function(k){ return '<span style="display:inline-block;padding:3px 7px;background:#e8f5e9;color:#2e7d32;border-radius:4px;font-size:10px;margin:1px;">' + v243EscHtml(k) + '</span>'; }).join('');
          statusEl.innerHTML = '<div style="padding:14px;background:#f0fff0;border-radius:8px;border:1px solid #c8e6c9;">' +
            '<div style="font-size:14px;color:#2e7d32;font-weight:700;margin-bottom:8px;">✅ AI SEO 콘텐츠 생성 완료</div>' +
            '<div style="font-size:13px;color:#333;margin-bottom:6px;"><strong>제목:</strong> ' + v243EscHtml(R.title||'') + '</div>' +
            (R.meta_description ? '<div style="font-size:11px;color:#666;margin-bottom:10px;"><strong>메타설명:</strong> ' + v243EscHtml(R.meta_description) + '</div>' : '') +
            (tagsHtml ? '<div style="margin-bottom:6px;"><strong style="font-size:11px;">태그:</strong> ' + tagsHtml + '</div>' : '') +
            (kwHtml ? '<div><strong style="font-size:11px;">키워드:</strong> ' + kwHtml + '</div>' : '') +
            (data.buildingInfo ? '<div style="margin-top:10px;font-size:11px;color:#888;"><strong>건축물대장:</strong> ' +
              v243EscHtml(data.buildingInfo['건물명']||'-') + ' · ' + v243EscHtml(data.buildingInfo['사용승인일']||'-') + ' · ' + v243EscHtml(data.buildingInfo['건물구조']||'-') + '</div>' : '') +
            '</div>';
        }
        v243Toast('AI SEO 생성 완료!');
      } else {
        var msg = (data && (data.error||data.message)) || '생성 실패';
        if (statusEl) statusEl.innerHTML = '<div style="padding:10px;background:#fff3e0;border-radius:8px;color:#e65100;font-size:13px;">⚠️ ' + v243EscHtml(msg) + '</div>';
        v243Toast('AI 생성 실패: ' + msg);
      }
    })
    .catch(function(err){
      console.error('[WP v2.5.0] auto-generate fetch 실패:', err);
      if (statusEl) statusEl.innerHTML = '<div style="padding:10px;background:#ffebee;border-radius:8px;color:#c62828;font-size:13px;">❌ 네트워크 오류: ' + v243EscHtml((err && err.message)||String(err)) + '</div>';
      v243Toast('AI 생성 오류: ' + (err && err.message));
    })
    .then(function(){
      if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; btnEl.textContent = '✨ 다시 생성'; }
    });
  }
  // v2.4.5 — 썸네일 클릭 명시 바인딩 (innerHTML 교체 후 호출)
  function v245BindThumbs(container) {
    if (!container) return;
    var thumbs = container.querySelectorAll('.ws-thumb');
    if (!thumbs || thumbs.length === 0) return;
    thumbs.forEach(function(thumb) {
      if (thumb.__v245Bound) return;
      thumb.__v245Bound = true;
      thumb.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var url = thumb.getAttribute('data-url');
        var idx = parseInt(thumb.getAttribute('data-idx') || '0', 10);
        var main = document.getElementById('ws-gallery-main');
        if (main && url) {
          main.style.backgroundImage = "url('" + url + "')";
          main.setAttribute('data-current', String(idx));
        }
        container.querySelectorAll('.ws-thumb').forEach(function(t){ t.classList.remove('ws-thumb-active'); });
        thumb.classList.add('ws-thumb-active');
      });
    });
  }
  // 전역 delegation (상세모달 내부 버튼) — v2.4.6 에서 getListingById 제거 → allListings.find() 사용
  document.addEventListener('click', function(e){
    var card = e.target && e.target.closest ? e.target.closest('.v240-act-card') : null;
    if (!card) return;
    var act = card.getAttribute('data-act');
    if (act === 'bldg') {
      e.preventDefault();
      console.log('[WP v2.5.0] 🏛️ 건축물대장 카드 클릭');
      v243OpenBldgRegister(card.getAttribute('data-addr')||'', card.getAttribute('data-use')||'');
    } else if (act === 'ai') {
      e.preventDefault();
      var lid = card.getAttribute('data-lid');
      console.log('[WP v2.5.0] ✨ AI 카드 클릭, lid=', lid);
      var L = (window.WS && window.WS.__lastListing) || null;
      if (!L && window.WS && Array.isArray(window.WS.allListings) && lid) {
        L = window.WS.allListings.find(function(x){ return String(x.id) === String(lid); }) || null;
        console.log('[WP v2.5.0] allListings.find 로 매물 복구:', !!L);
      }
      if (!L && lid) { L = { id: lid }; }
      v243OpenAIModal(L || {});
    }
  }, true);

  // ====================================================================
  // HTML BUILDER
  // ====================================================================
  function buildHTML(L) {
    L = L || {};
    try { window.WS = window.WS || {}; window.WS.__lastListing = L; } catch(e){}
    var id = L.id;

    // 이미지 준비 (lazy fetch 전 기본값)
    var imgs = L.images || L.listing_images || [];
    var firstUrl = imgs.length > 0 ? (imgs[0].url || imgs[0]) : '';
    var imgUrls = imgs.map(function(x) { return x.url || x; });

    // 가격·면적 포매터
    var priceTxt = '';
    try { priceTxt = (window.formatPrice || window.WS.formatPrice)(L.deposit, L.monthly, L.price, L.deal) || ''; } catch (e) {}
    var areaTxt = '';
    try { areaTxt = (window.formatArea || window.WS.formatArea)(L.area_m2) || ''; } catch (e) {}
    var pyeong = L.area_m2 ? (L.area_m2 / 3.30579) : 0;
    // areaTxt 가 이미 "89.3m² (27평)" 형태이므로 그대로 사용 (평 중복 방지)
    var areaFull = areaTxt;

    // 평당 임대료
    var rentPerPy = '';
    if (pyeong && L.monthly) rentPerPy = '평당 약 ' + Math.round(L.monthly / pyeong) + '만';

    // 관리비
    var mgmtTxt = '';
    if (L.maintenance_fee && Number(L.maintenance_fee) > 0) {
      mgmtTxt = '관리비 ' + L.maintenance_fee + '만원';
    }

    // 층수
    var floorTxt = '';
    if (L.floor_current) {
      var fc = String(L.floor_current);
      floorTxt = /층|단독|옥상|루프/i.test(fc) ? fc : fc + '층';
      if (L.floor_total) floorTxt += ' / ' + L.floor_total + '층';
    } else {
      floorTxt = '-';
    }

    // 준공년도
    var builtTxt = '-';
    try {
      var gy = (window.getBuiltYear || window.WS.getBuiltYear)(L.built_year);
      if (gy) builtTxt = gy + '년';
    } catch (e) {}
    if (L.registered_date) builtTxt = L.registered_date;

    // 입주가능
    var avail = L.available_date || '-';

    // NEW 뱃지 (24h 이내)
    var isNew = false;
    if (L.created_at) {
      try {
        var diff = Date.now() - new Date(L.created_at).getTime();
        isNew = diff >= 0 && diff < 24 * 60 * 60 * 1000;
      } catch (e) {}
    }

    // ★관심 상태
    var isFav = false;
    try {
      if (window.WS.state && Array.isArray(window.WS.state.favorites)) {
        isFav = window.WS.state.favorites.some(function(f) { return String(f) === String(id); });
      }
    } catch (e) {}

    // 옵션 칩 생성
    var optionChips = buildOptionChips(L);

    // 썸네일 HTML
    var thumbsHtml = imgs.map(function(img, idx) {
      var u = img.url || img;
      return '<img src="' + esc(u) + '" alt="thumbnail" class="ws-thumb' +
             (idx === 0 ? ' ws-thumb-active' : '') + '" data-url="' + esc(u) +
             '" data-idx="' + idx + '">';
    }).join('');

    // 기본정보 행 (13필드, 2쌍/행 × 7행)
    var basicRows = buildBasicRows(L, floorTxt, areaFull, builtTxt, avail);

    // 시간 정보
    var createdTxt = '';
    try { createdTxt = (window.timeAgo || window.WS.timeAgo)(L.created_at) || ''; } catch (e) {}

    // 원본 URL
    var srcUrl = L.source_url || '';
    var srcDomain = '';
    try { srcDomain = srcUrl ? new URL(srcUrl).hostname : ''; } catch (e) {}

    // HTML 조립
    var html = '';

    // --- 1. 갤러리 섹션 (topbar + main + thumbs) ---
    html +=
      '<section class="v240-section v240-gallery-sec">' +
        '<div class="v240-topbar">' +
          '<span class="v240-num ws-copy-id" data-copy="' + esc(id) + '" title="클릭하여 복사">매물번호 ' + esc(id) + '</span>' +
          (isNew ? '<span class="v240-new">NEW</span>' : '') +
          '<span class="v240-spacer"></span>' +
          '<button type="button" class="v240-fav' + (isFav ? ' on' : '') +
            '" data-wp-fav="' + esc(id) + '" title="관심 매물 토글">' +
            '<span style="font-size:13px">★</span> 관심' +
          '</button>' +
        '</div>' +
        '<div class="v240-body v240-gallery-body ws-detail-gallery">' +
          '<div class="ws-gallery-main" id="ws-gallery-main"' +
            ' style="background-image:url(\'' + esc(firstUrl) + '\'); cursor:pointer;"' +
            ' data-images="' + esc(JSON.stringify(imgUrls)).replace(/"/g, '&quot;') + '"' +
            ' data-current="0" title="클릭하면 확대됩니다">' +
            '<div class="v240-zoom-hint">🔍 클릭하여 확대</div>' +
            (imgs.length > 1 ? '<div class="ws-img-count v240-img-count">📷 ' + imgs.length + '장</div>' : '') +
          '</div>' +
          '<div class="ws-gallery-thumbs">' + thumbsHtml + '</div>' +
        '</div>' +
      '</section>';

    // --- 2. HERO (주소 · 가격) ---
    // 주소 조립: L.address 에 이미 전체 주소가 포함되어 있으면 그대로 사용.
    // address 가 비어있는 경우만 dong + address_detail 로 조합.
    var addrText = (L.address || '').trim();
    var detailText = (L.address_detail || '').trim();
    var dongText = (L.dong || '').trim();
    var fullAddr = addrText;
    if (!fullAddr) {
      fullAddr = (dongText + ' ' + detailText).trim();
    } else if (detailText && addrText.indexOf(detailText) === -1) {
      // address 에 detail 이 아직 포함되지 않은 경우에만 추가
      fullAddr = addrText + ' ' + detailText;
    }
    html +=
      '<section class="v240-hero">' +
        '<div class="v240-hero-left">' +
          '<h1>' + esc(fullAddr || '-') + '</h1>' +
          '<div class="v240-hero-road" id="v240-hero-road" aria-live="polite"></div>' +
          ((L.building_name && fullAddr.indexOf(L.building_name) === -1) ? '<div class="v240-hero-bldg">🏢 ' + esc(L.building_name) + '</div>' : '') +
        '</div>' +
        '<div class="v240-price-box">' +
          '<div class="v240-kind">' + esc(L.deal || '-') + '</div>' +
          '<div class="v240-amt">' + esc(priceTxt || '-') + '</div>' +
          (mgmtTxt || rentPerPy ?
            '<div class="v240-mgmt">' +
              (mgmtTxt ? esc(mgmtTxt) : '') +
              (mgmtTxt && rentPerPy ? ' · ' : '') +
              (rentPerPy ? esc(rentPerPy) : '') +
            '</div>' : '') +
        '</div>' +
      '</section>';

    // --- 3. 기본 정보 · 옵션 (통합 단일 섹션) ---
    html +=
      '<section class="v240-section">' +
        '<h2>기본 정보 · 옵션</h2>' +
        '<div class="v240-body">' +
          '<div class="v240-info2">' + basicRows + '</div>' +
          '<div class="v240-opts-label">옵션 · 특징</div>' +
          '<div class="v240-opts">' +
            (optionChips.length > 0 ?
              optionChips.map(function(c) { return '<span class="v240-chip">' + esc(c) + '</span>'; }).join('') :
              '<span class="v240-chip" style="color:#8aa091">-</span>') +
          '</div>' +
          (L.description ?
            '<div class="v240-desc-label">상세 설명 · 특이사항</div>' +
            '<p class="v240-desc">' + esc(L.description) + '</p>' : '') +
        '</div>' +
      '</section>';

    // --- 4. 위치 (full-width 지도) + 전용 액션 ---
    var useText = (L.use || L.usage || '-');
    var jibunAddr = (L.address || '').trim();
    var jibunB64 = '';
    try { jibunB64 = btoa(unescape(encodeURIComponent(jibunAddr))); } catch(e){}
    html +=
      '<section class="v240-section">' +
        '<h2>위치</h2>' +
        '<div class="v240-body">' +
          '<div id="v240-kakao-map" class="v240-kakao-map"></div>' +
        '</div>' +
      '</section>' +
      '<section class="v240-section v240-actions-sec">' +
        '<h2>전용 액션</h2>' +
        '<div class="v240-body">' +
          '<div class="v240-act-grid">' +
            '<button type="button" class="v240-act-card v240-act-bldg" data-act="bldg" data-addr="' + esc(jibunAddr) + '" data-use="' + esc(useText) + '">' +
              '<span class="v240-act-icon">🏛️</span>' +
              '<span class="v240-act-body">' +
                '<span class="v240-act-title">건축물대장 조회</span>' +
                '<span class="v240-act-sub">자체 API 자동조회 · 건물명 · 구조 · 승인일 · 층수</span>' +
                '<span class="v240-act-meta">' + esc(jibunAddr || '주소 미확인') + ' · ' + esc(useText) + '</span>' +
              '</span>' +
              '<span class="v240-act-arrow">↗</span>' +
            '</button>' +
            '<button type="button" class="v240-act-card v240-act-ai" data-act="ai" data-lid="' + esc(String(id||'')) + '">' +
              '<span class="v240-act-icon">✨</span>' +
              '<span class="v240-act-body">' +
                '<span class="v240-act-title">AI 매물 콘텐츠 생성</span>' +
                '<span class="v240-act-sub">제목 · 설명 · SEO 태그 자동 발행</span>' +
                '<span class="v240-act-meta">상세페이지 전 필드 기반</span>' +
              '</span>' +
              '<span class="v240-act-arrow">→</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</section>';

    // --- 5. 유사 매물 (기존 showSimilarListings 결과 주입) ---
    html +=
      '<section class="v240-section">' +
        '<h2>유사 매물 추천</h2>' +
        '<div class="v240-body">' +
          '<div id="ws-similar-section"></div>' +
        '</div>' +
      '</section>';

    // --- 6. 🔒 중개사 전용 (기본 접힘) ---
    html +=
      '<section class="v240-broker closed" id="v240-broker">' +
        '<h2 class="v240-broker-h">' +
          '🔒 중개사 전용' +
          '<span class="v240-locked">고객 비공개</span>' +
          '<span class="v240-count">이력 · 연락처 · 메모 · 원본</span>' +
          '<span class="v240-spacer"></span>' +
          '<span class="v240-chev">▼</span>' +
        '</h2>' +
        '<div class="v240-broker-body">' +

          // 등록 · 확인 이력 (4카드)
          '<div class="v240-b-label">🕐 등록 · 확인 이력</div>' +
          '<div class="v240-timeline">' +
            timelineCard('최초등록', L.registered_date || createdTxt || '-') +
            timelineCard('최종확인', L.last_confirmed || '-') +
            timelineCard('시스템등록', createdTxt || '-') +
            timelineCard('크롤시각', L.crawled_at || '-') +
          '</div>' +

          '<div class="v240-b-grid">' +

            // LEFT: 연락처 · 메모
            '<div>' +
              '<div class="v240-b-label">📞 관계자 연락처</div>' +
              '<div class="v240-contacts-empty">등록된 연락처가 없습니다. 사장 · 사모 · 관리인 연락처를 등록하세요.</div>' +
              '<button type="button" class="v240-b-btn" data-v240-add-contact="' + esc(id) + '">+ 연락처 추가</button>' +

              '<div class="v240-b-label" style="margin-top:14px">📝 빠른 메모 태그</div>' +
              '<div class="v240-memos">' +
                ['✅ 즉시입주', '🔑 열쇠보관', '📞 연락완료', '👀 현장확인필요',
                 '💰 가격협의가능', '🔨 수리필요', '⭐ 추천매물', '🚫 계약불가',
                 '📸 사진촬영필요', '🏗️ 리모델링', '👤 집주인직거래', '📋 서류확인중'
                ].map(function(m) {
                  return '<span class="v240-m" data-memo-tag="' + esc(m) + '">' + esc(m) + '</span>';
                }).join('') +
              '</div>' +

              '<div class="v240-b-label" style="margin-top:14px">💬 메모</div>' +
              '<textarea class="ws-memo-input v240-memo-area" id="ws-memo-' + esc(id) + '"' +
                ' placeholder="매물에 대한 메모를 입력하세요" rows="3">' +
                esc(getMemo(id)) +
              '</textarea>' +
              '<div id="ws-memo-quicktags-' + esc(id) + '"></div>' +
              '<button type="button" class="ws-btn ws-btn-primary ws-memo-save-btn v240-save-btn"' +
                ' data-listing-id="' + esc(id) + '">메모 저장</button>' +
            '</div>' +

            // RIGHT: 원본 데이터
            '<div class="v240-src">' +
              '<div class="v240-b-label">📋 원본 데이터</div>' +
              (srcUrl ?
                '<div class="v240-src-row">' +
                  '<span class="v240-src-k">원본URL</span>' +
                  '<a href="' + esc(srcUrl) + '" target="_blank" rel="noopener">' + esc(srcDomain) + '</a>' +
                '</div>' : '') +
              '<div class="v240-src-row"><span class="v240-src-k">DB ID</span>' + esc(id) + '</div>' +
              (L.source_site ?
                '<div class="v240-src-row"><span class="v240-src-k">출처</span>' + esc(L.source_site) + '</div>' : '') +
              (L.raw_fields ? '<div class="v240-b-label" style="margin-top:10px;font-size:12px">원본 본문</div>' +
                '<pre class="v240-raw-pre">' + esc(formatRawFields(L.raw_fields)) + '</pre>' : '') +
            '</div>' +

          '</div>' +  // .v240-b-grid
        '</div>' +    // .v240-broker-body
      '</section>';

    return html;
  }

  // ====================================================================
  // HELPERS
  // ====================================================================
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getMemo(id) {
    try {
      return (window.WS.state && window.WS.state.memos && window.WS.state.memos[String(id)]) || '';
    } catch (e) { return ''; }
  }

  function timelineCard(label, value) {
    return '<div class="v240-tl-card">' +
      '<div class="v240-tl-k">' + esc(label) + '</div>' +
      '<div class="v240-tl-v">' + esc(value || '-') + '</div>' +
    '</div>';
  }

  function buildBasicRows(L, floorTxt, areaFull, builtTxt, avail) {
    // 타입별 용도 판단
    var t = (L.type || '').toLowerCase();
    var isCommercial = /사무|공오피스|office|건물|기타|상가|점포|매장/.test(t) || L.source_site === 'gongsilclub';

    // 필드 페어 구성 — 공실(주황) 플래그로 warn 스타일 처리
    var pairs = [
      ['타입', esc(L.type || '-'), '면적', esc(areaFull || '-')],
      ['해당층/총층', esc(floorTxt), '구조형태', esc(L.entrance_type || L.room_shape || '-')],
      ['건물명', esc(L.building_name || '-'), '준공년도', esc(builtTxt)],
      ['방향', esc(L.direction || '-'), '난방', esc(L.heating_type || '-')]
    ];

    if (isCommercial) {
      pairs.push(['룸/욕실', esc(L.rooms ? (L.rooms + '개') : (L.room_shape || '-')), '주차', parkingText(L)]);
    } else {
      pairs.push(['룸/욕실', (L.rooms ? L.rooms + '개' : '-') + ' / ' + (L.bathrooms ? L.bathrooms + '개' : '-'),
                 '주차', parkingText(L)]);
    }

    var availCell = '<span class="v240-v-warn">' + esc(avail) + '</span>';
    pairs.push(['입주가능', availCell, '임대기간', esc(L.lease_period || '-')]);

    if (L.building_listings) {
      pairs.push(['건물 내 매물', esc(L.building_listings), '', '']);
    } else if (L.previous_business) {
      pairs.push(['현업종/상호', esc(L.previous_business), '', '']);
    }

    // HTML 렌더
    var out = '';
    pairs.forEach(function(p, i) {
      var lastHalfEmpty = (p[2] === '' && p[3] === '');
      out += '<div class="v240-r">' +
        '<div class="v240-k">' + p[0] + '</div>' +
        '<div class="v240-v">' + p[1] + '</div>' +
        (lastHalfEmpty ?
          '<div class="v240-k v240-empty">&nbsp;</div>' +
          '<div class="v240-v v240-empty">&nbsp;</div>' :
          '<div class="v240-k">' + p[2] + '</div>' +
          '<div class="v240-v">' + p[3] + '</div>') +
      '</div>';
    });
    return out;
  }

  function parkingText(L) {
    if (L.parking_spaces && parseInt(L.parking_spaces) > 0) {
      return parseInt(L.parking_spaces) + '대' +
        (L.parking_fee && parseInt(L.parking_fee) > 0 ? ' (월 ' + L.parking_fee + '만원)' : '');
    }
    if (L.parking === true) return '가능';
    return '-';
  }

  function buildOptionChips(L) {
    var chips = [];
    var optStr = '';
    if (typeof L.options === 'string') optStr += L.options;
    if (Array.isArray(L.features)) optStr += ' ' + L.features.join(' ');
    if (L.raw_fields && typeof L.raw_fields === 'object') {
      try { optStr += ' ' + String(L.raw_fields['옵션'] || ''); } catch (e) {}
    }
    if (L.elevator === true) optStr += ' 엘리베이터';
    if (L.cctv === true) optStr += ' CCTV';

    if (/엘리베이터|EV|E\/V/i.test(optStr)) chips.push('🏢 엘리베이터');
    if (/CCTV|방범/i.test(optStr)) chips.push('📹 CCTV');
    if (/인터폰/i.test(optStr)) chips.push('📞 인터폰');
    if (/개별냉난방/i.test(optStr)) chips.push('🌡️ 개별냉난방');
    if (/냉.?난방기|냉방기|난방기|에어컨|AC/i.test(optStr)) chips.push('❄️ 냉·난방기');
    if (/인테리어/i.test(optStr)) chips.push('🛋️ 인테리어');
    if (/주차|parking/i.test(optStr)) chips.push('🅿️ 주차');
    if (/풀옵션|full/i.test(optStr)) chips.push('✨ 풀옵션');
    if (/시스템에어컨/i.test(optStr)) chips.push('🌬️ 시스템에어컨');
    if (/스프링클러/i.test(optStr)) chips.push('💧 스프링클러');
    if (/무인경비/i.test(optStr)) chips.push('🛡️ 무인경비');
    if (/화물엘리베이터/i.test(optStr)) chips.push('🛗 화물EV');
    return chips;
  }

  function formatRawFields(raw) {
    if (!raw) return '';
    try {
      if (typeof raw === 'string') return raw;
      var lines = [];
      Object.keys(raw).forEach(function(k) {
        var v = raw[k];
        if (v == null || v === '') return;
        lines.push(k + '\t' + String(v));
      });
      return lines.join('\n');
    } catch (e) { return ''; }
  }

  // ====================================================================
  // STYLES
  // ====================================================================
  function injectStyles() {
    if (document.getElementById('v240-styles')) return;
    var css =
      /* ---- 디자인 토큰 (wishes) ---- */
      '#ws-detail-container{--v240-g900:#14301F;--v240-g800:#1E4A2D;--v240-g700:#2F6B3A;--v240-g600:#3D8450;--v240-g100:#E8F1EA;' +
        '--v240-g50:#F4F9F5;--v240-g25:#FAFDFB;--v240-ink:#0F1C13;--v240-muted:#5A6B60;--v240-line:#DCE4DE;--v240-line-soft:#EAF0EC;' +
        '--v240-warn:#C4551B;--v240-hot:#BF3A2E;--v240-gold:#B88A2E;--v240-bg:#F6FAF7;' +
        'background:linear-gradient(180deg,#F6FAF7 0%,#F0F7F2 100%);padding:24px 28px 72px;' +
        'font-family:-apple-system,BlinkMacSystemFont,\"SF Pro Display\",\"Pretendard\",\"Apple SD Gothic Neo\",\"Malgun Gothic\",sans-serif;' +
        'letter-spacing:-.005em}' +

      /* ---- 공통 섹션 (프리미엄 카드) ---- */
      '#ws-detail-container .v240-section{margin-top:18px;background:#fff;border:1px solid var(--v240-line-soft);' +
        'border-radius:16px;box-shadow:0 1px 2px rgba(19,35,26,.03),0 8px 24px rgba(19,35,26,.06),' +
        '0 1px 0 rgba(255,255,255,.8) inset;overflow:hidden;transition:transform .2s ease,box-shadow .2s ease}' +
      '#ws-detail-container .v240-section:first-child{margin-top:0}' +
      '#ws-detail-container .v240-section:hover{box-shadow:0 2px 4px rgba(19,35,26,.04),0 12px 32px rgba(19,35,26,.08),' +
        '0 1px 0 rgba(255,255,255,.9) inset}' +
      '#ws-detail-container .v240-section > h2{font-size:13px;padding:14px 20px;' +
        'background:linear-gradient(180deg,#FAFDFB,#F4F9F5);border-bottom:1px solid var(--v240-line-soft);' +
        'color:var(--v240-g900);font-weight:700;margin:0;letter-spacing:.02em;text-transform:none;' +
        'display:flex;align-items:center;gap:8px}' +
      '#ws-detail-container .v240-section > h2::before{content:\"\";display:inline-block;width:3px;height:14px;' +
        'background:linear-gradient(180deg,var(--v240-g700),var(--v240-g600));border-radius:2px}' +
      '#ws-detail-container .v240-body{padding:16px}' +

      /* ---- 갤러리 topbar ---- */
      '#ws-detail-container .v240-topbar{display:flex;align-items:center;gap:10px;padding:12px 18px;' +
        'background:var(--v240-g50);border-bottom:1px solid var(--v240-line)}' +
      '#ws-detail-container .v240-num{font-weight:800;color:var(--v240-g900);font-size:15px;cursor:pointer;' +
        'padding:4px 10px;background:#fff;border:1px solid var(--v240-line);border-radius:6px}' +
      '#ws-detail-container .v240-num:hover{background:var(--v240-g100)}' +
      '#ws-detail-container .v240-new{font-size:10px;font-weight:800;color:#fff;background:var(--v240-hot);' +
        'padding:3px 8px;border-radius:4px;letter-spacing:.05em}' +
      '#ws-detail-container .v240-spacer{flex:1}' +
      '#ws-detail-container .v240-fav{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--v240-line);' +
        'background:#fff;padding:5px 12px;border-radius:999px;cursor:pointer;font-size:12px;font-weight:700;color:var(--v240-muted)}' +
      '#ws-detail-container .v240-fav.on{border-color:#F2CF49;background:#FFFCE8;color:#A77D02}' +

      /* ---- 갤러리 본체 ---- */
      '#ws-detail-container .v240-gallery-body{padding:14px}' +
      '#ws-detail-container .ws-gallery-main{position:relative;width:100%;min-height:380px;aspect-ratio:16/10;background:#111 center/contain no-repeat;' +
        'border-radius:10px;overflow:hidden}' +
      '#ws-detail-container .v240-zoom-hint{position:absolute;left:10px;bottom:10px;background:rgba(0,0,0,.55);' +
        'color:#fff;padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;pointer-events:none}' +
      '#ws-detail-container .ws-gallery-thumbs{display:flex;flex-direction:row;gap:6px;overflow-x:auto;padding:10px 2px 2px}' +
      '#ws-detail-container .ws-gallery-thumbs::-webkit-scrollbar{height:6px}' +
      '#ws-detail-container .ws-gallery-thumbs::-webkit-scrollbar-thumb{background:#c8d3cc;border-radius:3px}' +
      '#ws-detail-container .ws-thumb{flex:0 0 80px;width:80px;height:60px;object-fit:cover;border-radius:6px;' +
        'cursor:pointer;opacity:.65;border:2px solid transparent;background:#ddd;transition:all .15s}' +
      '#ws-detail-container .ws-thumb:hover{opacity:.95}' +
      '#ws-detail-container .ws-thumb.ws-thumb-active{opacity:1;border-color:var(--v240-g700);' +
        'box-shadow:0 0 0 1px var(--v240-g700) inset}' +

      /* ---- Hero (프리미엄) ---- */
      '#ws-detail-container .v240-hero{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;' +
        'padding:22px 24px;background:linear-gradient(135deg,#fff 0%,#FAFDFB 60%,#F4F9F5 100%);' +
        'border:1px solid var(--v240-line-soft);border-radius:16px;margin-top:18px;' +
        'box-shadow:0 1px 2px rgba(19,35,26,.03),0 8px 24px rgba(19,35,26,.06),0 1px 0 rgba(255,255,255,.8) inset;' +
        'position:relative;overflow:hidden}' +
      '#ws-detail-container .v240-hero::before{content:\"\";position:absolute;top:0;left:0;width:4px;height:100%;' +
        'background:linear-gradient(180deg,var(--v240-g700),var(--v240-g600))}' +
      '#ws-detail-container .v240-hero h1{font-size:22px;margin:0 0 2px;line-height:1.35;color:var(--v240-g900);' +
        'font-weight:700;letter-spacing:-.02em}' +
      '#ws-detail-container .v240-hero .v240-detail{color:#1976D2;font-weight:600;font-size:18px}' +
      '#ws-detail-container .v240-sub{color:var(--v240-muted);font-size:13px;margin-top:3px}' +
      '#ws-detail-container .v240-price-box{text-align:right;padding:14px 18px;' +
        'background:linear-gradient(135deg,var(--v240-g900) 0%,var(--v240-g700) 100%);border-radius:12px;' +
        'color:#fff;min-width:180px;box-shadow:0 4px 12px rgba(30,74,45,.2),0 1px 0 rgba(255,255,255,.1) inset;' +
        'position:relative;overflow:hidden}' +
      '#ws-detail-container .v240-price-box::after{content:\"\";position:absolute;top:0;right:0;width:60px;height:60px;' +
        'background:radial-gradient(circle,rgba(255,255,255,.12) 0%,transparent 70%);pointer-events:none}' +
      '#ws-detail-container .v240-kind{font-size:11px;color:rgba(255,255,255,.75);margin-bottom:4px;font-weight:600;' +
        'letter-spacing:.05em;text-transform:uppercase}' +
      '#ws-detail-container .v240-amt{font-size:26px;font-weight:800;color:#fff;letter-spacing:-.02em;white-space:nowrap;' +
        'font-variant-numeric:tabular-nums}' +
      '#ws-detail-container .v240-mgmt{font-size:11px;color:rgba(255,255,255,.7);margin-top:5px;font-weight:500}' +

      /* ---- 기본정보 2단 배열 ---- */
      '#ws-detail-container .v240-info2{border:1px solid var(--v240-line);border-radius:10px;overflow:hidden;background:#fff}' +
      '#ws-detail-container .v240-r{display:grid;grid-template-columns:110px 1fr 110px 1fr;border-bottom:1px solid var(--v240-line)}' +
      '#ws-detail-container .v240-r:last-child{border-bottom:0}' +
      '#ws-detail-container .v240-r:nth-child(even){background:#FCFDFC}' +
      '#ws-detail-container .v240-k{color:var(--v240-muted);font-size:12px;font-weight:600;padding:10px 14px;' +
        'background:var(--v240-g50);border-right:1px solid var(--v240-line);display:flex;align-items:center}' +
      '#ws-detail-container .v240-v{color:var(--v240-ink);font-size:13px;font-weight:600;padding:10px 14px;' +
        'border-right:1px solid var(--v240-line);display:flex;align-items:center}' +
      '#ws-detail-container .v240-r .v240-v:last-child{border-right:0}' +
      '#ws-detail-container .v240-v-warn{color:var(--v240-warn);font-weight:700}' +
      '#ws-detail-container .v240-k.v240-empty{background:#fff;border-right:0}' +
      '#ws-detail-container .v240-v.v240-empty{background:#fff}' +

      /* ---- 옵션 · 상세설명 (프리미엄) ---- */
      '#ws-detail-container .v240-opts-label,.v240-desc-label{font-size:11px;color:var(--v240-muted);font-weight:700;' +
        'margin:18px 0 10px;letter-spacing:.05em;text-transform:uppercase}' +
      '#ws-detail-container .v240-opts{display:flex;flex-wrap:wrap;gap:7px}' +
      '#ws-detail-container .v240-chip{background:linear-gradient(180deg,#fff,var(--v240-g50));' +
        'border:1px solid var(--v240-line);color:var(--v240-g900);padding:6px 13px;border-radius:999px;' +
        'font-size:12px;font-weight:600;box-shadow:0 1px 2px rgba(19,35,26,.04);transition:all .15s}' +
      '#ws-detail-container .v240-chip:hover{background:linear-gradient(180deg,var(--v240-g50),var(--v240-g100));' +
        'transform:translateY(-1px);box-shadow:0 2px 6px rgba(19,35,26,.08)}' +
      '#ws-detail-container .v240-desc{margin:0;padding:14px 16px;' +
        'background:linear-gradient(135deg,var(--v240-g50) 0%,#FAFDFB 100%);border-radius:10px;' +
        'border:1px solid var(--v240-line-soft);font-size:13px;line-height:1.65;color:var(--v240-ink)}' +

      /* ---- 위치: full-width 카카오맵 ---- */
      '#ws-detail-container .v240-kakao-map{min-height:360px}' +
      '#ws-detail-container .v240-kakao-map{width:100%;min-height:320px;border:1px solid var(--v240-line);' +
        'border-radius:12px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.6),0 2px 8px rgba(19,35,26,.06)}' +
      '#ws-detail-container .v240-map-fallback{width:100%;height:100%;min-height:320px;display:flex;align-items:center;' +
        'justify-content:center;color:var(--v240-muted);font-size:13px;background:linear-gradient(135deg,#F4F9F5,#E8F1EA);' +
        'border-radius:12px}' +
      '#ws-detail-container .v240-map-addrcard{background:linear-gradient(180deg,#fff,#FAFDFB);' +
        'border:1px solid var(--v240-line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;' +
        'box-shadow:0 1px 2px rgba(19,35,26,.04),0 4px 12px rgba(19,35,26,.05)}' +
      '#ws-detail-container .v240-addr-row{display:grid;grid-template-columns:58px 1fr;gap:8px;align-items:baseline;font-size:13px}' +
      '#ws-detail-container .v240-addr-k{color:var(--v240-muted);font-weight:600;font-size:11px;letter-spacing:.02em;' +
        'padding:2px 8px;background:var(--v240-g50);border-radius:999px;text-align:center;align-self:start}' +
      '#ws-detail-container .v240-addr-v{color:var(--v240-ink);font-weight:500;word-break:keep-all;line-height:1.5}' +

      /* ---- 전용 액션 카드 (건축물대장 · AI 콘텐츠) ---- */
      '#ws-detail-container .v240-actions-sec .v240-body{padding:0 !important;background:transparent !important;border:0 !important;box-shadow:none !important}' +
      '#ws-detail-container .v240-act-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}' +
      '@media (max-width:780px){#ws-detail-container .v240-act-grid{grid-template-columns:1fr}}' +
      '#ws-detail-container .v240-act-card{display:grid;grid-template-columns:48px 1fr 20px;gap:14px;align-items:center;' +
        'padding:18px 20px;border:1px solid var(--v240-line);border-radius:14px;background:linear-gradient(180deg,#fff,#FAFDFB);' +
        'cursor:pointer;text-align:left;font-family:inherit;color:inherit;' +
        'box-shadow:0 1px 2px rgba(19,35,26,.04),0 6px 16px rgba(19,35,26,.06);' +
        'transition:transform .15s,box-shadow .15s,border-color .15s}' +
      '#ws-detail-container .v240-act-card:hover{transform:translateY(-2px);border-color:var(--v240-g700);' +
        'box-shadow:0 4px 10px rgba(19,35,26,.08),0 14px 28px rgba(19,35,26,.1)}' +
      '#ws-detail-container .v240-act-card:active{transform:translateY(0)}' +
      '#ws-detail-container .v240-act-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;' +
        'justify-content:center;font-size:24px;background:linear-gradient(135deg,#EAF3EC,#D8E9DA);' +
        'box-shadow:inset 0 0 0 1px rgba(255,255,255,.6),0 2px 6px rgba(19,35,26,.05)}' +
      '#ws-detail-container .v240-act-ai .v240-act-icon{background:linear-gradient(135deg,#FFF7DC,#FDE8A8)}' +
      '#ws-detail-container .v240-act-body{display:flex;flex-direction:column;gap:3px;min-width:0}' +
      '#ws-detail-container .v240-act-title{font-size:15px;font-weight:800;color:var(--v240-ink);letter-spacing:-.01em}' +
      '#ws-detail-container .v240-act-sub{font-size:12.5px;color:var(--v240-g700);font-weight:600}' +
      '#ws-detail-container .v240-act-meta{font-size:11.5px;color:var(--v240-muted);font-weight:500;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}' +
      '#ws-detail-container .v240-act-arrow{color:var(--v240-g700);font-size:18px;font-weight:800}' +
      /* AI 결과 모달 */
      '.v240-ai-modal{position:fixed;inset:0;z-index:99999;background:rgba(19,35,26,.55);display:flex;' +
        'align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}' +
      '.v240-ai-modal .box{background:#fff;border-radius:16px;max-width:640px;width:100%;max-height:86vh;overflow:auto;' +
        'padding:22px 24px;box-shadow:0 24px 60px rgba(19,35,26,.3);font-family:inherit}' +
      '.v240-ai-modal h3{margin:0 0 4px;font-size:18px;font-weight:800;color:#1B3D28}' +
      '.v240-ai-modal .sub{font-size:12.5px;color:#7a8a80;margin-bottom:16px}' +
      '.v240-ai-modal .block{margin-bottom:14px;padding:12px 14px;border:1px solid #e6ece7;border-radius:10px;' +
        'background:#FAFDFB}' +
      '.v240-ai-modal .blabel{font-size:11px;font-weight:800;color:#5a6b5f;letter-spacing:.04em;margin-bottom:6px;' +
        'text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}' +
      '.v240-ai-modal .bval{font-size:13.5px;color:#1B3D28;line-height:1.55;white-space:pre-wrap;word-break:keep-all}' +
      '.v240-ai-modal .copy{background:#1B3D28;color:#fff;border:0;border-radius:6px;padding:4px 10px;' +
        'font-size:11px;font-weight:700;cursor:pointer}' +
      '.v240-ai-modal .copy:hover{background:#2a5338}' +
      '.v240-ai-modal .close{margin-top:8px;width:100%;padding:10px;border:0;border-radius:10px;background:#f0f3f0;' +
        'font-weight:700;font-size:13px;cursor:pointer;color:#1B3D28}' +
      '.v240-ai-modal .close:hover{background:#e2e8e4}' +
      /* v2.4.5 — 건축물대장 결과 행 + AI Run 버튼 */
      '.v245-bldg-row{display:flex;align-items:center;gap:12px;padding:7px 2px;border-bottom:1px dashed #e6ece7}' +
      '.v245-bldg-row:last-child{border-bottom:0}' +
      '.v245-bldg-k{flex:0 0 92px;font-size:11.5px;font-weight:800;color:#5a6b5f;letter-spacing:.02em}' +
      '.v245-bldg-v{flex:1;font-size:13.5px;color:#1B3D28;font-weight:600}' +
      '.v245-run{flex:1;padding:11px;border:0;border-radius:10px;background:linear-gradient(135deg,#667eea,#764ba2);' +
        'color:#fff;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(102,126,234,.35)}' +
      '.v245-run:hover{filter:brightness(1.06)}' +
      '.v245-run:disabled{opacity:.5;cursor:not-allowed}' +
      /* Toast */
      '.v240-toast{position:fixed;left:50%;bottom:40px;transform:translateX(-50%);background:#1B3D28;color:#fff;' +
        'padding:10px 18px;border-radius:999px;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.2);' +
        'opacity:0;transition:opacity .2s}' +
      '.v240-toast.show{opacity:1}' +
      /* ---- Hero 도로명 서브타이틀 ---- */
      '#ws-detail-container .v240-hero-road{margin-top:6px;color:var(--v240-g700);font-size:13px;font-weight:500;' +
        'letter-spacing:-.01em;min-height:18px}' +
      '#ws-detail-container .v240-hero-bldg{margin-top:6px;display:inline-block;padding:3px 10px;background:var(--v240-g50);' +
        'color:var(--v240-g900);border:1px solid var(--v240-line);border-radius:999px;font-size:12px;font-weight:600}' +

      /* ---- 사진 개수 뱃지 ---- */
      '#ws-detail-container .v240-img-count{position:absolute;top:12px;left:12px;background:rgba(0,0,0,.65);' +
        'color:#fff;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;pointer-events:none;' +
        'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}' +

      /* ---- 중개사 전용 (접기/펼치기) ---- */
      '#ws-detail-container .v240-broker{margin-top:16px;border:1px solid #D9C486;border-radius:12px;background:#FFFBEB;overflow:hidden}' +
      '#ws-detail-container .v240-broker-h{background:#FDF3C5;color:#6B561A;border-bottom:1px solid #E9D693;' +
        'font-size:13px;padding:12px 18px;display:flex;align-items:center;gap:8px;margin:0;font-weight:800;' +
        'cursor:pointer;user-select:none;transition:background .15s}' +
      '#ws-detail-container .v240-broker-h:hover{background:#FBE89B}' +
      '#ws-detail-container .v240-locked{font-size:10px;background:#6B561A;color:#fff;padding:2px 6px;border-radius:4px;letter-spacing:.04em}' +
      '#ws-detail-container .v240-count{font-size:11px;color:#6B561A;font-weight:600;background:rgba(107,86,26,.1);padding:2px 8px;border-radius:999px}' +
      '#ws-detail-container .v240-chev{font-size:12px;color:#6B561A;transition:transform .2s;display:inline-block}' +
      '#ws-detail-container .v240-broker.closed .v240-broker-h{border-bottom:0}' +
      '#ws-detail-container .v240-broker.closed .v240-chev{transform:rotate(-90deg)}' +
      '#ws-detail-container .v240-broker.closed .v240-broker-body{display:none}' +
      '#ws-detail-container .v240-broker-body{padding:16px 18px}' +
      '#ws-detail-container .v240-b-label{font-weight:700;color:#6B561A;font-size:13px;margin-bottom:8px}' +

      /* timeline 카드 */
      '#ws-detail-container .v240-timeline{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}' +
      '#ws-detail-container .v240-tl-card{background:#fff;border:1px solid #E9D693;border-radius:8px;padding:10px 12px}' +
      '#ws-detail-container .v240-tl-k{font-size:11px;color:#6B561A;font-weight:600;margin-bottom:3px}' +
      '#ws-detail-container .v240-tl-v{font-size:13px;font-weight:700;color:var(--v240-ink)}' +

      /* 연락처·메모·원본 */
      '#ws-detail-container .v240-b-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:16px}' +
      '#ws-detail-container .v240-contacts-empty{padding:10px 12px;background:#fff;border:1px dashed #D9C486;' +
        'border-radius:8px;color:var(--v240-muted);font-size:12px}' +
      '#ws-detail-container .v240-b-btn{margin-top:8px;background:#6B561A;color:#fff;border:0;border-radius:8px;' +
        'padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer}' +
      '#ws-detail-container .v240-memos{display:flex;flex-wrap:wrap;gap:6px}' +
      '#ws-detail-container .v240-m{border:1px solid var(--v240-line);background:#fff;padding:5px 10px;' +
        'border-radius:999px;font-size:12px;color:var(--v240-ink);cursor:pointer;user-select:none}' +
      '#ws-detail-container .v240-m:hover{background:var(--v240-g100);border-color:var(--v240-g700)}' +
      '#ws-detail-container .v240-m.active{background:var(--v240-g700);color:#fff;border-color:var(--v240-g700)}' +
      '#ws-detail-container .v240-memo-area{width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;' +
        'font-size:12px;resize:vertical;font-family:inherit}' +
      '#ws-detail-container .v240-save-btn{margin-top:8px;padding:6px 14px;background:var(--v240-g700);color:#fff;' +
        'border:0;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer}' +

      '#ws-detail-container .v240-src{font-size:12px;color:var(--v240-muted)}' +
      '#ws-detail-container .v240-src-row{margin-top:4px}' +
      '#ws-detail-container .v240-src-k{display:inline-block;width:74px;color:var(--v240-muted);font-weight:600}' +
      '#ws-detail-container .v240-src a{color:var(--v240-g700);word-break:break-all}' +
      '#ws-detail-container .v240-raw-pre{background:#fff;border:1px solid var(--v240-line);border-radius:8px;padding:10px;' +
        'max-height:200px;overflow:auto;font-size:11px;line-height:1.5;color:var(--v240-ink);margin-top:6px;white-space:pre-wrap}' +

      /* 반응형 */
      '@media(max-width:900px){' +
        '#ws-detail-container .v240-hero{grid-template-columns:1fr}' +
        '#ws-detail-container .v240-price-box{text-align:left}' +
        '#ws-detail-container .v240-r{grid-template-columns:100px 1fr}' +
        '#ws-detail-container .v240-k{border-right:1px solid var(--v240-line)}' +
        '#ws-detail-container .v240-v{border-right:0}' +
        '#ws-detail-container .v240-timeline{grid-template-columns:repeat(2,1fr)}' +
        '#ws-detail-container .v240-b-grid{grid-template-columns:1fr}' +
      '}';

    var style = document.createElement('style');
    style.id = 'v240-styles';
    style.textContent = css;
    document.head.appendChild(style);

    // 클릭 위임 — 중개사 전용 헤더 토글
    document.addEventListener('click', function(e) {
      var brokerH = e.target.closest ? e.target.closest('.v240-broker-h') : null;
      if (brokerH && brokerH.parentNode && brokerH.parentNode.classList.contains('v240-broker')) {
        brokerH.parentNode.classList.toggle('closed');
      }
      // 메모 태그 클릭 → 메모 입력창에 추가
      var memoTag = e.target.closest ? e.target.closest('[data-memo-tag]') : null;
      if (memoTag) {
        memoTag.classList.toggle('active');
        var area = memoTag.closest('.v240-broker-body').querySelector('.v240-memo-area');
        if (area) {
          var tag = memoTag.getAttribute('data-memo-tag');
          if (memoTag.classList.contains('active')) {
            area.value = area.value ? area.value + ' ' + tag : tag;
          } else {
            area.value = area.value.replace(new RegExp('\\s*' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
          }
        }
      }
      // ★ 관심 토글 (v240-fav)
      var favBtn = e.target.closest ? e.target.closest('.v240-fav[data-wp-fav]') : null;
      if (favBtn) {
        var favId = favBtn.getAttribute('data-wp-fav');
        if (window.WS && typeof window.WS.toggleFavorite === 'function') {
          try { window.WS.toggleFavorite(favId); } catch (e2) {}
        }
        favBtn.classList.toggle('on');
      }
    }, true);
  }

})();


// v2.4.7 — 갤러리 라이트박스 + 좌/우 네비 + 키보드 네비
(function(){
  'use strict';
  if (window.__v247Lightbox) return;
  window.__v247Lightbox = true;
  document.addEventListener('click', function(ev){
    if (ev.target && ev.target.closest && ev.target.closest('.v248-nav-btn')) return;
    var m = ev.target && ev.target.closest ? ev.target.closest('#ws-gallery-main') : null;
    if (!m) return;
    ev.preventDefault();
    ev.stopPropagation();
    v247OpenLightbox(m);
  }, true);
  function v247OpenLightbox(mainEl){
    var imgs = [];
    try { imgs = JSON.parse(mainEl.getAttribute('data-images') || '[]'); } catch(e) { imgs = []; }
    if (!imgs.length) { var bg = mainEl.style.backgroundImage || ''; var mBg = bg.match(/url\(['\"]?(.+?)['\"]?\)/); if (mBg) imgs = [mBg[1]]; }
    if (!imgs.length) return;
    var curIdx = parseInt(mainEl.getAttribute('data-current') || '0', 10) || 0;
    if (curIdx < 0 || curIdx >= imgs.length) curIdx = 0;
    var box = document.createElement('div');
    box.id = 'v247-lightbox';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.93);display:flex;align-items:center;justify-content:center;';
    box.innerHTML =
      '<div class="v247-close" style="position:absolute;top:18px;right:24px;color:#fff;font-size:34px;font-weight:300;cursor:pointer;width:50px;height:50px;line-height:48px;text-align:center;border-radius:50%;background:rgba(255,255,255,0.12);user-select:none;">\u00d7</div>' +
      '<div class="v247-counter" style="position:absolute;top:22px;left:24px;color:#fff;font-size:14px;padding:6px 14px;background:rgba(255,255,255,0.14);border-radius:999px;font-family:sans-serif;"></div>' +
      '<div class="v247-prev" style="position:absolute;left:20px;top:50%;transform:translateY(-50%);width:56px;height:56px;line-height:52px;text-align:center;color:#fff;font-size:38px;cursor:pointer;border-radius:50%;background:rgba(255,255,255,0.14);user-select:none;">\u2039</div>' +
      '<div class="v247-next" style="position:absolute;right:20px;top:50%;transform:translateY(-50%);width:56px;height:56px;line-height:52px;text-align:center;color:#fff;font-size:38px;cursor:pointer;border-radius:50%;background:rgba(255,255,255,0.14);user-select:none;">\u203a</div>' +
      '<img class="v247-img" style="max-width:95vw;max-height:92vh;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,0.5);background:#111;">';
    document.body.appendChild(box);
    function render(){
      box.querySelector('.v247-img').src = imgs[curIdx];
      box.querySelector('.v247-counter').textContent = (curIdx+1) + ' / ' + imgs.length;
      mainEl.style.backgroundImage = "url('" + imgs[curIdx] + "')";
      mainEl.setAttribute('data-current', String(curIdx));
      var prevBtn = box.querySelector('.v247-prev');
      var nextBtn = box.querySelector('.v247-next');
      if (imgs.length <= 1) { prevBtn.style.display='none'; nextBtn.style.display='none'; }
    }
    function close(){ document.removeEventListener('keydown', onKey, true); box.remove(); }
    function go(delta){ curIdx = (curIdx + delta + imgs.length) % imgs.length; render(); }
    function onKey(e){
      if (e.key === 'Escape') { close(); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { go(-1); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { go(1); e.stopPropagation(); e.preventDefault(); }
    }
    box.querySelector('.v247-close').addEventListener('click', function(e){ e.stopPropagation(); close(); });
    box.querySelector('.v247-prev').addEventListener('click', function(e){ e.stopPropagation(); go(-1); });
    box.querySelector('.v247-next').addEventListener('click', function(e){ e.stopPropagation(); go(1); });
    box.addEventListener('click', function(e){ if (e.target === box) close(); });
    document.addEventListener('keydown', onKey, true);
    render();
    console.log('[WP v2.5.0] 갤러리 라이트박스 오픈, 사진 ' + imgs.length + '장');
  }
})();


// v2.5.0 — 큰 사진 영역 좌/우 화살표 오버레이 (MutationObserver + polling + showDetail wrap)
(function(){
  'use strict';
  if (window.__v250Nav) return;
  window.__v250Nav = true;

  function collectImgs(mainEl){
    var imgs = [];
    try {
      var raw = mainEl.getAttribute('data-images') || '[]';
      raw = raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      imgs = JSON.parse(raw);
    } catch(e){}
    if (!Array.isArray(imgs) || imgs.length <= 1) {
      var root = mainEl.closest('.v240-body') || document;
      var thumbs = root.querySelectorAll('.ws-thumb[data-url]');
      var urls = Array.prototype.map.call(thumbs, function(t){ return t.getAttribute('data-url'); }).filter(Boolean);
      if (urls.length > 1) imgs = urls;
    }
    return Array.isArray(imgs) ? imgs : [];
  }

  function injectOverlay(mainEl){
    if (!mainEl) return false;
    if (mainEl.querySelector('.v250-nav-prev')) return false;
    var legacy = mainEl.querySelectorAll('.v248-nav-prev, .v248-nav-next, .v248-counter');
    Array.prototype.forEach.call(legacy, function(n){ try{ n.remove(); }catch(_){}});
    var imgs = collectImgs(mainEl);
    if (imgs.length <= 1) return false;
    var btnCss = 'position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;line-height:42px;text-align:center;color:#fff;font-size:28px;cursor:pointer;border-radius:50%;background:rgba(0,0,0,0.5);user-select:none;z-index:5;font-weight:300;transition:background 0.15s;';
    var prev = document.createElement('div');
    prev.className = 'v250-nav-prev v248-nav-btn v250-nav-btn';
    prev.style.cssText = btnCss + 'left:12px;';
    prev.textContent = '‹';
    prev.title = '이전 사진';
    var next = document.createElement('div');
    next.className = 'v250-nav-next v248-nav-btn v250-nav-btn';
    next.style.cssText = btnCss + 'right:12px;';
    next.textContent = '›';
    next.title = '다음 사진';
    var counter = document.createElement('div');
    counter.className = 'v250-counter';
    counter.style.cssText = 'position:absolute;bottom:10px;right:12px;color:#fff;font-size:12px;padding:4px 10px;background:rgba(0,0,0,0.55);border-radius:999px;user-select:none;pointer-events:none;z-index:5;font-family:sans-serif;';
    if (getComputedStyle(mainEl).position === 'static') mainEl.style.position = 'relative';
    mainEl.appendChild(prev);
    mainEl.appendChild(next);
    mainEl.appendChild(counter);
    function updateUI(){
      var cur = parseInt(mainEl.getAttribute('data-current') || '0', 10) || 0;
      counter.textContent = (cur+1) + ' / ' + imgs.length;
    }
    function go(delta){
      var cur = parseInt(mainEl.getAttribute('data-current') || '0', 10) || 0;
      var newIdx = (cur + delta + imgs.length) % imgs.length;
      mainEl.style.backgroundImage = "url('" + imgs[newIdx] + "')";
      mainEl.setAttribute('data-current', String(newIdx));
      var root = mainEl.closest('.v240-body') || document;
      root.querySelectorAll('.ws-thumb').forEach(function(t){
        var tIdx = parseInt(t.getAttribute('data-idx') || '0', 10);
        t.classList.toggle('ws-thumb-active', tIdx === newIdx);
      });
      updateUI();
    }
    prev.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); go(-1); });
    next.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); go(1); });
    prev.addEventListener('mouseenter', function(){ prev.style.background='rgba(0,0,0,0.75)'; });
    prev.addEventListener('mouseleave', function(){ prev.style.background='rgba(0,0,0,0.5)'; });
    next.addEventListener('mouseenter', function(){ next.style.background='rgba(0,0,0,0.75)'; });
    next.addEventListener('mouseleave', function(){ next.style.background='rgba(0,0,0,0.5)'; });
    updateUI();
    console.log('[WP v2.5.0] 큰 사진 네비 오버레이 주입 성공: ' + imgs.length + '장');
    return true;
  }

  function scanAndInject(label){
    var mainEl = document.getElementById('ws-gallery-main');
    if (mainEl) {
      var ok = injectOverlay(mainEl);
      if (ok) console.log('[WP v2.5.0] scan 성공 via', label);
    }
  }

  var mo = new MutationObserver(function(muts){
    muts.forEach(function(m){
      Array.prototype.forEach.call(m.addedNodes, function(n){
        if (n && n.nodeType === 1) {
          if (n.id === 'ws-gallery-main') injectOverlay(n);
          else if (n.querySelector) {
            var child = n.querySelector('#ws-gallery-main');
            if (child) injectOverlay(child);
          }
        }
      });
    });
  });
  mo.observe(document.body, {childList:true, subtree:true});

  scanAndInject('at-init');

  var pollStart = Date.now();
  var pollId = setInterval(function(){
    if (Date.now() - pollStart > 60000) { clearInterval(pollId); return; }
    var mainEl = document.getElementById('ws-gallery-main');
    if (mainEl && !mainEl.querySelector('.v250-nav-prev')) {
      injectOverlay(mainEl);
    }
  }, 500);

  function wrapIfExists(fnName){
    var orig = window[fnName];
    if (typeof orig === 'function' && !orig.__v250Wrapped) {
      var wrapped = function(){
        var ret = orig.apply(this, arguments);
        setTimeout(function(){ scanAndInject('wrap-'+fnName); }, 50);
        setTimeout(function(){ scanAndInject('wrap-'+fnName+'-200'); }, 200);
        return ret;
      };
      wrapped.__v250Wrapped = true;
      window[fnName] = wrapped;
      console.log('[WP v2.5.0] wrapped', fnName);
    }
  }
  [0, 500, 1500, 3000].forEach(function(d){
    setTimeout(function(){
      wrapIfExists('showDetail');
      wrapIfExists('v243OpenAIModal');
    }, d);
  });
})();
