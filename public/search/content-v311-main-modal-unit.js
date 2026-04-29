/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v311 — 메인 모달 전유부 표시 + Hero 밸런스 fix
 * 작성: 2026-04-29 — 사장님 발견 P0/P1
 *
 * P0 (전유부): 사장님이 모달 메인 영역 (.v240-info2 기본정보·옵션) 에서
 *   바로 전용/공용/총면적을 보고 싶음. 현재는 건축물대장 조회 모달 (#v245)
 *   안에서만 표시. v311 가 메인 모달 등장 감지 → 같은 데이터 fetch (server
 *   cache hit ~50ms) → .v240-info2 안에 새 row 삽입.
 *
 * P1 (Hero 밸런스): v297-edit 의 "매물 수정" 버튼이 .v240-hero 의 grid
 *   (1fr auto) 사이에 끼어 들어가서 priceBox + amt 레이아웃이 깨짐. CSS
 *   override 로 grid 3-col + 매물수정 버튼 inline align + 우측 priceBox
 *   원위치 정렬.
 *
 * 정책 (사장님 영구 규칙):
 *   - 모든 매물 보편 적용 — 특정 매물 hardcode 0
 *   - /search → /map 파이프라인 (이미 Phase 2 에서 /map 통합 완료)
 *   - cache 활용 — 5분 client + 24h server
 *
 * 의존:
 *   - window.WS.__lastListing.raw_fields / building_dong / building_ho / address
 *   - /api/admin/building-registry-full 엔드포인트
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v311-main-modal-unit';
  var CACHE_PREFIX = 'wsBldgMainV3:';
  var CACHE_TTL_MS = 5 * 60 * 1000;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 주소에서 동/호 추출 (v306-rev3 와 동일 로직 — 보편)
  function extractDongHo(addr) {
    if (!addr) return { dongNm: '', hoNm: '' };
    var s = String(addr);
    var dongNm = '';
    var hoNm = '';
    var dm = s.match(/(\d{1,4})\s*동(?!시|구|군|도)/);
    if (dm) dongNm = dm[1];
    var hoMatches = s.match(/(\d{1,5})\s*호(?:\s|$)/g);
    if (hoMatches && hoMatches.length > 0) {
      var lastHo = hoMatches[hoMatches.length - 1];
      var m = lastHo.match(/(\d{1,5})/);
      if (m) hoNm = m[1];
    }
    return { dongNm: dongNm, hoNm: hoNm };
  }

  function getRealAdminToken() {
    try {
      var t = sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
      while (t && t.indexOf('admin_bridge_') === 0) t = t.slice('admin_bridge_'.length);
      if (t && t.indexOf('eyJ') === 0 && t.split('.').length === 3) return t;
    } catch (_) {}
    return '';
  }

  function getCached(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && o.ts && Date.now() - o.ts < CACHE_TTL_MS) return o.payload;
    } catch (_) {}
    return null;
  }
  function setCached(key, payload) {
    try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), payload: payload })); } catch (_) {}
  }

  // ── P0: .v240-info2 에 전유부 row 삽입 ────────────────────
  function insertUnitRow(modal, sel) {
    var info2 = modal.querySelector('.v240-info2');
    if (!info2 || info2.dataset.v311unit === '1') return;

    var exclusive = sel.exclusiveArea ? Number(sel.exclusiveArea).toFixed(2) + ' m²' : '-';
    var common = (sel.commonArea && sel.commonArea > 0) ? Number(sel.commonArea).toFixed(2) + ' m²' : '-';
    var total = (sel.totalArea && sel.totalArea > 0) ? Number(sel.totalArea).toFixed(2) + ' m²' : '-';

    // 면적 row (타입/면적 row) 다음에 삽입 시도, 없으면 끝에
    var rows = info2.querySelectorAll('.v240-r');
    var anchor = null;
    rows.forEach(function (r) {
      var k = r.querySelector('.v240-k');
      if (!k) return;
      if (/면적|평수|공급/.test(k.textContent || '')) anchor = r;
    });

    var row = document.createElement('div');
    row.className = 'v240-r v311-unit-row';
    row.innerHTML =
      '<div class="v240-k">전용/공용</div>' +
      '<div class="v240-v">' + esc(exclusive) + ' / ' + esc(common) + '</div>' +
      '<div class="v240-k">총면적</div>' +
      '<div class="v240-v">' + esc(total) + (sel.flrNoNm ? ' <span style="color:#888;font-weight:400;font-size:11px;margin-left:6px">· ' + esc(sel.flrNoNm) + '</span>' : '') + '</div>';

    if (anchor && anchor.nextSibling) {
      anchor.parentNode.insertBefore(row, anchor.nextSibling);
    } else if (anchor) {
      anchor.parentNode.appendChild(row);
    } else {
      info2.appendChild(row);
    }
    info2.dataset.v311unit = '1';

    // 출처 표기 (작은 글씨)
    var note = document.createElement('div');
    note.className = 'v311-unit-note';
    note.style.cssText = 'font-size:10.5px;color:#9aa39e;text-align:right;margin-top:4px;padding-right:8px';
    note.innerHTML = '※ 정부 건축물대장 ' + esc(sel.dongNm ? sel.dongNm + ' ' : '') + esc(sel.hoNm) + '호';
    info2.parentNode.insertBefore(note, info2.nextSibling);
  }

  function fetchAndEnrich(modal) {
    if (modal.dataset.v311fetched === '1') return;
    var L = window.WS && window.WS.__lastListing;
    if (!L) return;

    var addr = String(L.address || '').trim();
    if (!addr) return;
    var dong = String(L.building_dong || '').trim();
    var ho = String(L.building_ho || '').trim();
    if (!ho) {
      // address 에서 추출 시도
      var ext = extractDongHo(addr);
      dong = dong || ext.dongNm;
      ho = ho || ext.hoNm;
    }
    if (!ho) return; // 호 없으면 전유부 표시 X (단독·다가구 등)

    modal.dataset.v311fetched = '1';

    var key = CACHE_PREFIX + (L.id || '') + ':' + addr + ':' + dong + ':' + ho;
    var cached = getCached(key);
    if (cached && cached.success && cached.selected_unit) {
      insertUnitRow(modal, cached.selected_unit);
      return;
    }

    var token = getRealAdminToken();
    var url = '/api/admin/building-registry-full?address=' + encodeURIComponent(addr) +
      (L.id ? '&lid=' + encodeURIComponent(L.id) : '') +
      (dong ? '&dongNm=' + encodeURIComponent(dong) : '') +
      ('&hoNm=' + encodeURIComponent(ho));
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer admin_bridge_' + token;

    var ctrl = new AbortController();
    var tid = setTimeout(function () { ctrl.abort(); }, 12000);
    fetch(url, { headers: headers, credentials: 'include', signal: ctrl.signal })
      .then(function (r) { clearTimeout(tid); return r.ok ? r.json() : null; })
      .then(function (payload) {
        if (!payload || !payload.success) return;
        if (!document.body.contains(modal)) return;
        setCached(key, payload);
        if (payload.selected_unit) insertUnitRow(modal, payload.selected_unit);
      })
      .catch(function (e) { console.warn('[' + V + '] fetch failed', e); });
  }

  // ── P1: Hero 밸런스 CSS ─────────────────────────────────
  function injectHeroCss() {
    if (document.getElementById('v311-hero-balance-css')) return;
    var s = document.createElement('style');
    s.id = 'v311-hero-balance-css';
    s.textContent =
      // hero grid 를 3-column 으로 — left | edit-btn | priceBox
      '#ws-detail-container .v240-hero{grid-template-columns:1fr auto auto !important;gap:14px !important;align-items:center !important}' +
      // hero-left 가 가능한 한 넓게
      '#ws-detail-container .v240-hero-left{min-width:0 !important}' +
      '#ws-detail-container .v240-hero-left h1{white-space:normal !important;word-break:keep-all}' +
      // 매물 수정 버튼 inline align — priceBox 보다 살짝 작게, 우측 정렬
      '#ws-detail-container .v297-edit-btn{margin:0 !important;padding:8px 14px !important;border-radius:8px !important;font-size:12.5px !important;align-self:center !important;height:40px !important;white-space:nowrap}' +
      // priceBox 우측 끝, 적절한 padding + 너비
      '#ws-detail-container .v240-price-box{padding:14px 22px !important;min-width:200px !important;align-self:center !important}' +
      '#ws-detail-container .v240-amt{font-size:24px !important;line-height:1.2 !important;white-space:nowrap}' +
      '#ws-detail-container .v240-mgmt{margin-top:4px !important;line-height:1.4}' +
      // 모바일: 세로 stack
      '@media (max-width:768px){' +
        '#ws-detail-container .v240-hero{grid-template-columns:1fr !important;gap:10px !important}' +
        '#ws-detail-container .v297-edit-btn{justify-self:flex-start !important;width:auto !important}' +
        '#ws-detail-container .v240-price-box{align-self:stretch !important;text-align:center !important}' +
      '}';
    document.head.appendChild(s);
  }

  // ── observer ─────────────────────────────────────────
  function applyAll() {
    try {
      injectHeroCss();
      var modal = document.getElementById('ws-detail-container') ||
                  document.querySelector('.ws-detail-container') ||
                  document.querySelector('[id^="ws-detail-modal"]') ||
                  document.querySelector('#ws-detail-content');
      if (!modal) return;
      fetchAndEnrich(modal);
    } catch (e) {
      console.warn('[' + V + '] applyAll failed:', e && e.message);
    }
  }

  var debounceTimer = null;
  function scheduleApply() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyAll, 120);
  }

  var mo = new MutationObserver(function (muts) {
    var hit = false;
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].addedNodes && muts[i].addedNodes.length) { hit = true; break; }
    }
    if (hit) scheduleApply();
  });

  function start() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      scheduleApply();
      console.log('[' + V + '] observer 시작 — 메인 모달 전유부 + Hero 밸런스');
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
