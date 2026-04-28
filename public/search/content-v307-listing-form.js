/**
 * /search content-v307 — 매물 등록 모달 enhance (Tier 4 Phase 1)
 * 작성: 2026-04-28
 *
 * content.js 의 _showNewListingModal (line ~12454) 모달을 enhance:
 *   1. 주소 입력 → debounce 800ms → 자동 건축물대장 조회
 *   2. 전유부 있으면 호실 선택 그리드 자동 팝업
 *   3. 면적 input 을 전용/공급 2칸으로 분리 (DOM injection)
 *   4. 호실 선택 시 면적/층/주용도 자동 채움
 *   5. building_dong, building_ho 자동 백엔드 전송
 *
 * v294 fetch wrap 충돌 회피: 별도 fetch 1회 (MutationObserver 패턴)
 */
(function () {
  'use strict';
  var V = 'v307-listing-form';
  var _processed = new WeakSet();
  var _debounceTimer = null;
  var _lastFetchedAddr = '';

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getRealAdminToken() {
    try {
      var t = sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
      while (t && t.indexOf('admin_bridge_') === 0) t = t.slice('admin_bridge_'.length);
      if (t && t.indexOf('eyJ') === 0 && t.split('.').length === 3) return t;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || !/^sb-.*-auth-token$/.test(k)) continue;
        try {
          var o = JSON.parse(localStorage.getItem(k) || 'null');
          var at = o && (o.access_token || (o.currentSession && o.currentSession.access_token));
          if (at && at.indexOf('eyJ') === 0) return at;
        } catch (_) {}
      }
    } catch (_) {}
    return '';
  }

  // 모달이 열린 후 input enhance
  function enhanceModal(modal) {
    if (_processed.has(modal)) return;
    _processed.add(modal);

    var addrInput = modal.querySelector('#ws-new-address');
    var areaInput = modal.querySelector('#ws-new-area');
    var detailInput = modal.querySelector('#ws-new-detail');
    if (!addrInput || !areaInput) return;

    // ──── 면적 input 을 전용/공급 2칸으로 분리 ────
    var areaParent = areaInput.parentNode;
    var supplyDiv = document.createElement('div');
    supplyDiv.innerHTML =
      '<label style="font-size:12px;color:#666;font-weight:600;">공급면적 (m²)</label>' +
      '<input type="number" id="ws-new-area-supply" step="0.1" placeholder="33"' +
      ' style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">';
    areaParent.parentNode.insertBefore(supplyDiv, areaParent.nextSibling);

    // 전용면적 라벨로 변경
    var areaLabel = areaParent.querySelector('label');
    if (areaLabel) areaLabel.textContent = '전용면적 (m²)';
    areaInput.placeholder = '예: 33.5';

    // ──── 자동 조회 status 표시 영역 ────
    var statusDiv = document.createElement('div');
    statusDiv.id = 'ws-v307-status';
    statusDiv.style.cssText = 'grid-column:span 2;font-size:11px;color:#888;padding:6px 0;display:none;';
    addrInput.parentNode.parentNode.appendChild(statusDiv);

    // ──── 호실 선택 그리드 영역 ────
    var unitsDiv = document.createElement('div');
    unitsDiv.id = 'ws-v307-units';
    unitsDiv.style.cssText = 'grid-column:span 2;display:none;background:#f4f9f1;border:1px solid #d5e5d5;border-radius:8px;padding:10px;margin-top:8px;';
    addrInput.parentNode.parentNode.appendChild(unitsDiv);

    // ──── 주소 입력 → debounce → 자동 건축물대장 조회 ────
    addrInput.addEventListener('input', function () {
      if (_debounceTimer) clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(function () {
        var addr = (addrInput.value || '').trim();
        if (addr.length < 8) return; // 너무 짧으면 skip
        if (addr === _lastFetchedAddr) return;
        _lastFetchedAddr = addr;
        fetchRegistry(addr);
      }, 800);
    });

    function fetchRegistry(addr) {
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '⏳ 건축물대장 자동 조회 중... <span style="color:#aaa">(' + escHtml(addr) + ')</span>';

      var token = getRealAdminToken();
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer admin_bridge_' + token;

      var ctrl = new AbortController();
      setTimeout(function () { ctrl.abort(); }, 12000);

      fetch('/api/admin/building-registry-full?address=' + encodeURIComponent(addr), {
        headers: headers, credentials: 'include', signal: ctrl.signal,
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || !j.success || !j.data) {
            statusDiv.innerHTML = '⚠️ 건축물대장 정보를 찾을 수 없습니다. 수동 입력해주세요.';
            return;
          }
          var d = j.data;
          var info = '✅ ' + escHtml(d.buildingName || '건물') + ' · ' +
                     escHtml(d.buildingPurpose || '-') +
                     (d.totalFloors ? ' · 지상 ' + d.totalFloors + '층' : '') +
                     (d.elevatorCount && parseInt(d.elevatorCount) > 0 ? ' · 엘베' : '') +
                     (d.parkingCount ? ' · 주차 ' + d.parkingCount + '대' : '');
          statusDiv.innerHTML = info + ' <span style="color:#aaa;font-size:10px">cache:' + escHtml(j.cache || 'none') + '</span>';

          // 호실 그리드 (전유부 있을 때만)
          var units = Array.isArray(j.units) ? j.units : [];
          if (units.length > 0) {
            renderUnitGrid(units);
          } else {
            unitsDiv.style.display = 'none';
          }
        })
        .catch(function () {
          statusDiv.innerHTML = '⚠️ 건축물대장 자동 조회 실패. 수동 입력해주세요.';
        });
    }

    function renderUnitGrid(units) {
      unitsDiv.style.display = 'block';
      var html = '<div style="font-weight:700;font-size:12px;color:#2D5A27;margin-bottom:6px">' +
                 '🏠 호실 선택 (자동 채움) — ' + units.length + '개 호실</div>' +
                 '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:5px;max-height:160px;overflow:auto">';
      units.slice(0, 100).forEach(function (u, idx) {
        html += '<button type="button" data-unit-idx="' + idx + '"' +
                ' style="padding:6px;font-size:11px;border:1px solid #d5e5d5;background:#fff;border-radius:4px;cursor:pointer;text-align:left">' +
                '<div style="font-weight:600">' + escHtml(u.dongNm ? u.dongNm + ' ' : '') + escHtml(u.hoNm) + '호</div>' +
                '<div style="color:#666;font-size:10px">' + (u.exclusiveArea ? u.exclusiveArea.toFixed(1) : '-') + 'm²' +
                (u.flrNoNm ? ' · ' + escHtml(u.flrNoNm) : '') + '</div>' +
                '</button>';
      });
      html += '</div>';
      unitsDiv.innerHTML = html;

      var btns = unitsDiv.querySelectorAll('button[data-unit-idx]');
      btns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = parseInt(btn.getAttribute('data-unit-idx'), 10);
          var u = units[idx];
          if (!u) return;
          // 자동 채움
          var supplyEl = modal.querySelector('#ws-new-area-supply');
          if (areaInput) areaInput.value = u.exclusiveArea || '';
          if (supplyEl) supplyEl.value = u.totalArea || '';
          if (detailInput && u.hoNm) {
            detailInput.value = (u.dongNm ? u.dongNm + ' ' : '') + u.hoNm + '호';
          }
          var floorEl = modal.querySelector('#ws-new-floor');
          if (floorEl && u.flrNo) floorEl.value = u.flrNo;
          // 시각 피드백
          btns.forEach(function (b) { b.style.background = '#fff'; b.style.borderColor = '#d5e5d5'; });
          btn.style.background = '#e8f5e3';
          btn.style.borderColor = '#2D5A27';
          // status 갱신
          statusDiv.innerHTML = '✅ <strong>' + escHtml((u.dongNm ? u.dongNm + ' ' : '') + u.hoNm + '호') + '</strong> 자동 채움 완료 — ' +
                                '전용 ' + u.exclusiveArea + 'm² / 공급 ' + u.totalArea + 'm²' +
                                (u.mainPurpsCdNm ? ' · ' + escHtml(u.mainPurpsCdNm) : '');
        });
      });
    }
  }

  // ──── MutationObserver: 모달 mount 감지 ────
  try {
    var obs = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes || [];
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (!(n instanceof HTMLElement)) continue;
          if (n.id === 'ws-new-listing-modal') {
            enhanceModal(n);
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: false });
  } catch (e) {
    console.warn('[' + V + '] observer failed', e);
  }

  // ──── /admin/listings/new 에서 redirect 시 자동 모달 오픈 ────
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get('action') === 'new-listing') {
      setTimeout(function () {
        try { if (window.WS && window.WS._showNewListingModal) window.WS._showNewListingModal(); } catch (_) {}
      }, 500);
    }
  } catch (_) {}

  console.log('[' + V + '] 매물 등록 모달 enhance 활성 (자동 건축물대장 + 호실 선택 + 면적 분리)');
})();
