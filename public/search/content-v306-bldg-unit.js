/**
 * /search content-v306 — 건축물대장 전유부 (호실) 정보 표시
 * 작성: 2026-04-28 (rev2 — fetch wrap 제거 + MutationObserver)
 *
 * v303/v304 와 동일한 v294 fetch wrap 충돌 (stack overflow) 회피.
 * v306 는 window.fetch wrap 안 함. 대신 MutationObserver 로 v240 모달 감지 →
 * 별도 fetch 로 building-registry-full?lid=N 호출 → 모달 body 에 새 섹션 append.
 */
(function () {
  'use strict';
  var V = 'v306-bldg-unit-rev2';
  var _processed = new WeakSet();

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatKrw(v) {
    if (v == null || v === '') return '-';
    var n = Number(v);
    if (!isFinite(n) || n === 0) return '-';
    if (n >= 10000) {
      var eok = Math.floor(n / 10000);
      var man = n % 10000;
      return eok + '억' + (man ? ' ' + man.toLocaleString() : '');
    }
    return n.toLocaleString() + '만';
  }
  function statBox(label, val, unit) {
    return '<div style="background:#f4f9f1;padding:6px 8px;border-radius:5px;text-align:center">' +
           '<div style="color:#888;font-size:10px">' + escHtml(label) + '</div>' +
           '<div style="font-weight:700;color:#2D5A27;font-size:12px">' +
           (val != null && isFinite(val) ? Number(val).toLocaleString() + (unit ? ' ' + escHtml(unit) : '') : '-') +
           '</div></div>';
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

  function extractListingId() {
    try {
      var el = document.querySelector('[data-listing-id]');
      if (el) {
        var lid = el.getAttribute('data-listing-id');
        if (lid && /^\d+$/.test(lid)) return lid;
      }
      var all = document.querySelectorAll('.v240-ai-modal, .v240-ai-modal *');
      for (var i = 0; i < all.length; i++) {
        var t = all[i].textContent || '';
        var m = t.match(/매물번호\s*(\d+)/);
        if (m) return m[1];
      }
    } catch (_) {}
    return '';
  }

  function extractAddress(modalEl) {
    try {
      var sub = modalEl.querySelector('.sub');
      if (!sub) return '';
      return (sub.textContent || '').split('·')[0].trim();
    } catch (_) { return ''; }
  }

  function renderUnitSection(modalBody, payload) {
    try {
      if (modalBody.querySelector('.v306-unit-section')) return;
      var sel = payload.selected_unit;
      var units = Array.isArray(payload.units) ? payload.units : [];
      var reqHo = (payload.query && payload.query.requestedHo) || '';

      var root = document.createElement('div');
      root.className = 'v306-unit-section';
      root.style.cssText = 'margin-top:16px;border-top:1px solid #e5e5e5;padding-top:14px';

      var html = '';
      if (sel) {
        html += '<div style="font-weight:700;font-size:14px;color:#2D5A27;margin-bottom:10px">' +
                '📐 ' + escHtml(sel.dongNm ? sel.dongNm + ' ' : '') + escHtml(sel.hoNm) + '호 전유부</div>';
        var r = [
          ['전용면적', sel.exclusiveArea ? sel.exclusiveArea.toFixed(2) + ' m²' : '-'],
          ['공용면적', sel.commonArea ? sel.commonArea.toFixed(2) + ' m²' : '-'],
          ['총면적', sel.totalArea ? sel.totalArea.toFixed(2) + ' m²' : '-'],
          ['층', sel.flrNoNm || (sel.flrNo + '층') || '-'],
          ['주용도', sel.mainPurpsCdNm || sel.etcPurps || '-'],
          ['구조', sel.strctCdNm || '-'],
        ];
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;font-size:12px;background:#f4f9f1;padding:10px;border-radius:6px">';
        for (var i = 0; i < r.length; i++) {
          html += '<div><span style="color:#888">' + escHtml(r[i][0]) + '</span> ' +
                  '<span style="font-weight:600;color:#222;margin-left:6px">' + escHtml(r[i][1]) + '</span></div>';
        }
        html += '</div>';
      } else if (reqHo) {
        html += '<div style="color:#a04;font-size:12px;background:#fff5f0;padding:8px;border-radius:6px">' +
                '⚠️ 매물 호실 (' + escHtml(reqHo) + '호) 의 전유부를 찾을 수 없습니다.</div>';
      }

      if (units.length > 1) {
        html += '<div style="font-weight:700;font-size:13px;color:#2D5A27;margin:14px 0 8px">' +
                '🏠 같은 건물 호실 (' + units.length + '개)</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;max-height:200px;overflow:auto">';
        for (var j = 0; j < Math.min(units.length, 50); j++) {
          var u = units[j];
          var isSel = sel && u.dongNm === sel.dongNm && u.hoNm === sel.hoNm;
          html += '<div style="padding:6px 8px;font-size:11px;border:1px solid ' +
                  (isSel ? '#2D5A27' : '#e5e5e5') + ';' +
                  'background:' + (isSel ? '#e8f5e3' : '#fff') + ';border-radius:4px">' +
                  '<div style="font-weight:600">' + escHtml(u.dongNm ? u.dongNm + ' ' : '') + escHtml(u.hoNm) + '호</div>' +
                  '<div style="color:#666">' + (u.exclusiveArea ? u.exclusiveArea.toFixed(1) : '-') + 'm²' +
                  (u.flrNoNm ? ' · ' + escHtml(u.flrNoNm) : '') + '</div>' +
                  '</div>';
        }
        html += '</div>';
      }

      // L-Layer5 (2026-04-29): 위반건축물 경고
      var data = payload.data || {};
      if (data.illegalBuilding === 'Y' || data.illegalBuilding === 'y') {
        html += '<div style="margin-top:14px;background:#fff0f0;border:2px solid #d04040;border-radius:8px;padding:12px">' +
                '<div style="font-weight:700;color:#d04040;font-size:13px;margin-bottom:6px">🚨 위반건축물 — 등재됨</div>' +
                '<div style="font-size:11px;color:#666;line-height:1.6">' +
                (data.illegalBuildingDate ? '등재일: ' + escHtml(data.illegalBuildingDate) + '<br>' : '') +
                (data.illegalLawName ? '법령: ' + escHtml(data.illegalLawName) + '<br>' : '') +
                (data.illegalLawArticle ? '조항: ' + escHtml(data.illegalLawArticle) : '') +
                '</div></div>';
      }

      // L-Layer8 (2026-04-29): 같은 주소 다른 매물
      var sameBuilding = Array.isArray(payload.same_building) ? payload.same_building : [];
      if (sameBuilding.length > 0) {
        html += '<div style="margin-top:14px;border-top:1px dashed #d0e0c8;padding-top:10px">' +
                '<div style="font-weight:700;font-size:13px;color:#2D5A27;margin-bottom:8px">🏘️ 같은 건물 다른 매물 (' + sameBuilding.length + '건)</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto">';
        for (var k = 0; k < sameBuilding.length; k++) {
          var m = sameBuilding[k];
          var dealLabel = m.deal_type === 'sale' ? '매매' : (m.deal_type === 'rent' ? '월세' : '전세');
          var priceTxt = m.deal_type === 'sale'
            ? formatKrw(m.price)
            : (formatKrw(m.deposit) + (m.monthly_rent ? ' / ' + formatKrw(m.monthly_rent) : ''));
          html += '<a href="/search?lid=' + encodeURIComponent(m.id) + '" target="_blank" rel="noopener" ' +
                  'style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid #e0e7d8;border-radius:6px;text-decoration:none;color:inherit;background:#fafefa">' +
                  '<div><div style="font-size:11px;color:#888">매물 #' + escHtml(m.listing_id || m.id) + '</div>' +
                  '<div style="font-weight:600;font-size:12px;color:#2D5A27">' + escHtml(dealLabel) + ' ' +
                  (m.building_dong ? escHtml(m.building_dong) + ' ' : '') +
                  (m.building_ho ? escHtml(m.building_ho) + '호 · ' : '') +
                  (m.area_m2 ? Number(m.area_m2).toFixed(1) + 'm² · ' : '') +
                  (m.floor_current != null ? escHtml(m.floor_current) + '층' : '') +
                  '</div></div>' +
                  '<div style="font-weight:700;font-size:13px;color:#2D5A27">' + priceTxt + '</div></a>';
        }
        html += '</div></div>';
      }

      // L-Layer6 (2026-04-29): RTMS 실거래가
      var rtms = payload.rtms;
      if (rtms && rtms.available && rtms.count > 0) {
        html += '<div style="margin-top:14px;border-top:1px dashed #d0e0c8;padding-top:10px">' +
                '<div style="font-weight:700;font-size:13px;color:#2D5A27;margin-bottom:8px">💹 RTMS 최근 실거래 (' + rtms.count + '건 · 최근 6개월)</div>' +
                '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:11px">' +
                statBox('중간값', rtms.median, '만원') +
                statBox('평균', rtms.avg, '만원') +
                statBox('최저', rtms.min, '만원') +
                statBox('최고', rtms.max, '만원') +
                '</div>';
        if (rtms.recent_3m_avg) {
          html += '<div style="margin-top:6px;font-size:11px;color:#666;text-align:right">최근 3개월 평균: <strong>' +
                  Number(rtms.recent_3m_avg).toLocaleString() + '만원</strong></div>';
        }
        html += '</div>';
      }

      // L-Layer-empty (2026-04-29): 데이터 0 일 때 안내 메시지 표시
      var hasNoExtras = (!sameBuilding || sameBuilding.length === 0)
        && (!rtms || !rtms.count || rtms.count === 0)
        && (!data.illegalBuilding || data.illegalBuilding === 'N');
      if (hasNoExtras) {
        html += '<div style="margin-top:14px;background:#f5f5f5;padding:10px;border-radius:6px;font-size:11px;color:#666;line-height:1.7">' +
                '<div style="font-weight:600;color:#444;margin-bottom:4px">📋 추가 정보 점검</div>' +
                '✅ <strong>위반건축물</strong>: 정상 건물 (등재 X)<br>' +
                'ℹ️ <strong>같은 주소 매물</strong>: 0건 (같은 건물 다른 호실 매물 등록 시 자동 표시)<br>' +
                'ℹ️ <strong>RTMS 실거래</strong>: 데이터 없음 (단독·상가 등 일부 유형 미공개)' +
                '</div>';
      }

      if (payload.cache && payload.cache !== 'none') {
        html += '<div style="margin-top:8px;font-size:10px;color:#aaa;text-align:right">cache: ' +
                escHtml(payload.cache) + '</div>';
      }

      root.innerHTML = html;
      modalBody.appendChild(root);
    } catch (e) {
      console.warn('[' + V + '] render error', e);
    }
  }

  function enrichModal(modalBody, address, lid) {
    if (!address) return;
    try {
      var token = getRealAdminToken();
      var url = '/api/admin/building-registry-full?address=' + encodeURIComponent(address);
      if (lid) url += '&lid=' + encodeURIComponent(lid);
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer admin_bridge_' + token;
      var ctrl = new AbortController();
      var tid = setTimeout(function () { ctrl.abort(); }, 12000);
      fetch(url, { headers: headers, credentials: 'include', signal: ctrl.signal })
        .then(function (res) { clearTimeout(tid); return res.ok ? res.json() : null; })
        .then(function (payload) {
          if (!payload || !payload.success) return;
          if (!document.body.contains(modalBody)) return;
          renderUnitSection(modalBody, payload);
        })
        .catch(function (e) { console.warn('[' + V + '] enrich failed', e); });
    } catch (e) {
      console.warn('[' + V + '] enrich error', e);
    }
  }

  function onModalAppear(modalEl) {
    if (_processed.has(modalEl)) return;
    _processed.add(modalEl);
    var attempts = 0;
    var checkInterval = setInterval(function () {
      attempts++;
      if (attempts > 100) { clearInterval(checkInterval); return; }
      var body = modalEl.querySelector('#v245-bldg-body');
      if (!body) return;
      if (body.querySelector('.v245-bldg-row, .blabel')) {
        clearInterval(checkInterval);
        var addr = extractAddress(modalEl);
        var