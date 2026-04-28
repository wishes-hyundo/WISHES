/**
 * /search content-v306 — 건축물대장 전유부 (호실) 정보 표시
 * 작성: 2026-04-28 (rev2 — fetch wrap 제거 + MutationObserver)
 * 갱신: 2026-04-29 rev3 — truncated EOF 복구 + hoNm/dongNm 자동 추출
 *
 * v303/v304 와 동일한 v294 fetch wrap 충돌 (stack overflow) 회피.
 * v306 는 window.fetch wrap 안 함. 대신 MutationObserver 로 v240 모달 감지 →
 * 별도 fetch 로 building-registry-full?lid=N 호출 → 모달 body 에 새 섹션 append.
 */
(function () {
  'use strict';
  var V = 'v306-bldg-unit-rev3';
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
        html += '<div style="color:#a04;font-size:12px;background:#fff5f0;padding:8px;border-radius:6px;line-height:1.6">' +
                '⚠️ 매물 호실 (' + escHtml(reqHo) + '호) 의 전유부를 찾을 수 없습니다.<br>' +
                '<span style="font-size:11px;color:#666">' +
                '- 단독·다가구주택은 전유부 미발급 (정상)<br>' +
                '- 일부 신축 건물은 정부 DB 등재 지연 (수개월 소요)<br>' +
                '- 호번호 형식 차이 (예: \'4층 403호\' vs \'403\')</span></div>';
      } else if (units.length === 0) {
        html += '<div style="color:#888;font-size:12px;background:#f5f5f5;padding:8px;border-radius:6px;line-height:1.6">' +
                'ℹ️ 이 건물은 전유부(호별 면적) 데이터가 없습니다.<br>' +
                '<span style="font-size:11px">단독주택 / 다가구 / 일부 신축 건물 = 정부 DB 미발급 (정상)</span></div>';
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

  // L-cache (2026-04-29): client sessionStorage 1시간 캐시 — 사장님 매번 새로 조회 X
  function getCachedPayload(cacheKey) {
    try {
      var raw = sessionStorage.getItem(cacheKey);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj && obj.ts && Date.now() - obj.ts < 60 * 60 * 1000) {
        return obj.payload;
      }
    } catch (_) {}
    return null;
  }
  function setCachedPayload(cacheKey, payload) {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), payload: payload }));
    } catch (_) {}
  }

  // L-v306-rev3 (2026-04-29): 주소에서 동/호 추출 → API 에 전달 → selected_unit 매칭
  // 예: "서울 관악구 신림동 1423-3 로사이신림 4층 403호" → hoNm="403"
  //     "서울 강남구 역삼동 123 어쩌구아파트 101동 1502호" → dongNm="101", hoNm="1502"
  function extractDongHoFromAddress(addr) {
    if (!addr) return { dongNm: '', hoNm: '' };
    var s = String(addr);
    var dongNm = '';
    var hoNm = '';
    // "101동 1502호" 또는 "101동" 형태
    var dm = s.match(/(\d{1,4})\s*동(?!시|구|군|도)/);
    if (dm) dongNm = dm[1];
    // "403호" / "1502호" / "B1호" — 가장 마지막 N호 매칭 (앞쪽 층수와 혼동 X)
    var hoMatches = s.match(/(\d{1,5})\s*호(?:\s|$)/g);
    if (hoMatches && hoMatches.length > 0) {
      var lastHo = hoMatches[hoMatches.length - 1];
      var m = lastHo.match(/(\d{1,5})/);
      if (m) hoNm = m[1];
    }
    return { dongNm: dongNm, hoNm: hoNm };
  }

  function enrichModal(modalBody, address, lid) {
    if (!address) return;
    try {
      var dh = extractDongHoFromAddress(address);
      var cacheKey = 'wsBldg:' + (lid || '') + ':' + address + ':' + dh.dongNm + ':' + dh.hoNm;
      var cached = getCachedPayload(cacheKey);
      if (cached && cached.success) {
        renderUnitSection(modalBody, cached);
        return;
      }
      var token = getRealAdminToken();
      var url = '/api/admin/building-registry-full?address=' + encodeURIComponent(address);
      if (lid) url += '&lid=' + encodeURIComponent(lid);
      // L-v306-rev3: hoNm 없으면 selected_unit 항상 null → 전유부 표시 X. 보편 fix.
      if (dh.dongNm) url += '&dongNm=' + encodeURIComponent(dh.dongNm);
      if (dh.hoNm) url += '&hoNm=' + encodeURIComponent(dh.hoNm);
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer admin_bridge_' + token;
      var ctrl = new AbortController();
      var tid = setTimeout(function () { ctrl.abort(); }, 12000);
      fetch(url, { headers: headers, credentials: 'include', signal: ctrl.signal })
        .then(function (res) { clearTimeout(tid); return res.ok ? res.json() : null; })
        .then(function (payload) {
          if (!payload || !payload.success) return;
          if (!document.body.contains(modalBody)) return;
          setCachedPayload(cacheKey, payload);
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
        enrichModal(body, addr, lid);
      }
    }, 200);
  }

  // ── observer ─────────────────────────────────────────
  // v240-detail.js 가 .v240-ai-modal class 를 가진 모달을 body 에 append.
  // 이 옵저버가 그 모달이 추가될 때 onModalAppear 호출.
  var observer = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (!m.addedNodes) continue;
      for (var j = 0; j < m.addedNodes.length; j++) {
        var n = m.addedNodes[j];
        if (!n || n.nodeType !== 1) continue;
        if (n.classList && n.classList.contains('v240-ai-modal')) {
          onModalAppear(n);
        } else if (n.querySelectorAll) {
          var nested = n.querySelectorAll('.v240-ai-modal');
          for (var k = 0; k < nested.length; k++) onModalAppear(nested[k]);
        }
      }
    }
  });

  function start() {
    try {
      observer.observe(document.body, { childList: true, subtree: true });
      // 이미 열려있는 모달도 처리 (페이지 로드 후 patch 가 늦게 attach 된 경우)
      var existing = document.querySelectorAll('.v240-ai-modal');
      for (var i = 0; i < existing.length; i++) onModalAppear(existing[i]);
      console.log('[' + V + '] observer 시작 (rev3 hoNm/dongNm)');
    } catch (e) {
      console.warn('[' + V + '] start failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
