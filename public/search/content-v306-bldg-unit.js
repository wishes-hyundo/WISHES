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
        var lid = extractListingId();
        setTimeout(function () { enrichModal(body, addr, lid); }, 200);
      }
    }, 300);
  }

  try {
    var obs = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes || [];
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (!(n instanceof HTMLElement)) continue;
          if (n.classList && n.classList.contains('v240-ai-modal')) {
            var h3 = n.querySelector('h3');
            if (h3 && /건축물대장/.test(h3.textContent || '')) {
              onModalAppear(n);
            }
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: false });
  } catch (e) {
    console.warn('[' + V + '] observer failed', e);
  }

  console.log('[' + V + '] 건축물대장 전유부 표시 활성 (v294 충돌 회피)');
})();
