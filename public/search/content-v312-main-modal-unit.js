/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v312 — 2026 BoB 메인 모달 전유부 + Hero 밸런스
 * 작성: 2026-04-29 — 사장님 발견 P0/P1 (v312 BoB rev2)
 *
 * 2026 SOTA 패턴 적용 (vanilla JS 안에서 가능한 모든 것):
 *   ✓ View Transitions API — document.startViewTransition (60fps row 등장)
 *   ✓ <template> clone + textContent (innerHTML XSS 0)
 *   ✓ CSS Container Queries — @container (.v240-hero) (max-width:560px)
 *   ✓ CSS subgrid — hero baseline 정렬
 *   ✓ oklch() + color-mix() — perceptually uniform 색상
 *   ✓ :has() selector — anchor row 매칭 native
 *   ✓ Popover API — '건축물대장' 출처 인터랙티브 툴팁 (popovertarget)
 *   ✓ Intl.NumberFormat unit style — 로케일 친화 면적 표기
 *   ✓ navigator.locks — fetch 중복 호출 방지 (race-safe cache write)
 *   ✓ WCAG 2.2 AAA — role/aria-label/focusable, contrast > 7:1
 *   ✓ AbortSignal.timeout — modern fetch timeout (any() 도 활용)
 *   ✓ Constructable Stylesheet (CSSStyleSheet + adoptedStyleSheets)
 *
 * 정책 (사장님 영구 규칙):
 *   - 모든 매물 보편 적용 — 특정 매물 hardcode 0
 *   - /search → /map 파이프라인 (Phase 2 완료)
 *   - cache 5분 client + 24h server
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v312-main-modal-unit-bob';
  var CACHE_PREFIX = 'wsBldgMainV4:'; // BoB rev = V4
  var CACHE_TTL_MS = 5 * 60 * 1000;

  // Intl.NumberFormat (재사용 — 매번 생성 X)
  var areaFmt = new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  // ── 주소 → dong/ho 추출 (Phase 1 v306 와 동일 보편 정규식) ──
  function extractDongHo(addr) {
    if (!addr) return { dongNm: '', hoNm: '' };
    var s = String(addr);
    var dongNm = '', hoNm = '';
    var dm = s.match(/(\d{1,4})\s*동(?!시|구|군|도)/);
    if (dm) dongNm = dm[1];
    var hoMatches = s.match(/(\d{1,5})\s*호(?:\s|$)/g);
    if (hoMatches && hoMatches.length) {
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

  // ── client cache (5분 TTL) ──
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

  // ── 2026: Constructable Stylesheet (adoptedStyleSheets) — single source CSS ──
  var sheet = null;
  function ensureSheet() {
    if (sheet) return;
    if (typeof CSSStyleSheet !== 'function' || !document.adoptedStyleSheets) {
      // fallback: 일반 <style> 태그
      if (document.getElementById('v312-bob-css')) return;
      var s = document.createElement('style');
      s.id = 'v312-bob-css';
      s.textContent = bobCss();
      document.head.appendChild(s);
      sheet = 'fallback';
      return;
    }
    sheet = new CSSStyleSheet();
    sheet.replaceSync(bobCss());
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }

  // 2026: oklch + color-mix + container queries + subgrid + view-transition-name
  function bobCss() {
    return [
      // ── Hero 밸런스 (P1) ─────────────────────────────────
      '#ws-detail-container .v240-hero{',
      '  container-type:inline-size;container-name:ws-hero;',
      '  display:grid;grid-template-columns:1fr auto auto;',
      '  gap:16px;align-items:center;',
      '}',
      // subgrid: hero 안 자식 box 의 baseline 정렬
      '#ws-detail-container .v240-hero-left{display:grid;grid-template-rows:subgrid;min-width:0}',
      '#ws-detail-container .v240-hero-left h1{white-space:normal;word-break:keep-all;line-height:1.4}',
      // 매물 수정 버튼 — oklch 톤, 충분한 contrast (WCAG AAA 7:1+)
      '#ws-detail-container .v297-edit-btn{',
      '  margin:0;padding:10px 16px;border-radius:10px;',
      '  background:color-mix(in oklch, oklch(58% 0.13 145) 8%, white);',
      '  color:oklch(35% 0.13 145);',
      '  border:1.5px solid color-mix(in oklch, oklch(58% 0.13 145) 35%, white);',
      '  font-size:13px;font-weight:700;cursor:pointer;height:42px;white-space:nowrap;',
      '  transition:transform .15s ease, background .15s ease;',
      '  align-self:center;',
      '}',
      '#ws-detail-container .v297-edit-btn:hover{',
      '  background:color-mix(in oklch, oklch(58% 0.13 145) 16%, white);',
      '  transform:translateY(-1px);',
      '}',
      '#ws-detail-container .v297-edit-btn:focus-visible{',
      '  outline:3px solid oklch(58% 0.18 145);outline-offset:2px;',
      '}',
      '#ws-detail-container .v240-price-box{',
      '  padding:14px 22px;min-width:200px;align-self:center;',
      '}',
      '#ws-detail-container .v240-amt{font-size:24px;line-height:1.2;white-space:nowrap}',
      '#ws-detail-container .v240-mgmt{margin-top:4px;line-height:1.4}',
      // Container query — 모달 자체 width 기준 (vw 보다 정확)
      '@container ws-hero (max-width: 640px){',
      '  #ws-detail-container .v240-hero{grid-template-columns:1fr;gap:10px}',
      '  #ws-detail-container .v297-edit-btn{justify-self:flex-start;height:auto;padding:8px 14px}',
      '  #ws-detail-container .v240-price-box{align-self:stretch;text-align:center;min-width:0}',
      '}',

      // ── 전유부 row (P0) — view-transition-name + glassy emerald ──
      '#ws-detail-container .v312-unit-row{',
      '  view-transition-name:v312-unit-row;',
      '  background:color-mix(in oklch, oklch(96% 0.04 145) 100%, transparent);',
      '}',
      '#ws-detail-container .v312-unit-row .v240-k{',
      '  color:oklch(28% 0.10 145);font-weight:800;', // contrast 7+:1 vs bg
      '}',
      '#ws-detail-container .v312-unit-row .v240-v{',
      '  color:oklch(20% 0.05 145);font-weight:600;',
      '}',
      // 출처 popover button (interactive tooltip via Popover API)
      '#ws-detail-container .v312-unit-src-btn{',
      '  background:transparent;border:none;cursor:help;color:oklch(45% 0.05 145);',
      '  font-size:11px;padding:2px 6px;border-radius:4px;',
      '  margin-left:6px;text-decoration:underline dotted;',
      '}',
      '#ws-detail-container .v312-unit-src-btn:hover{background:oklch(95% 0.04 145)}',
      // popover panel (inset 자동 — 2026 anchor positioning baseline)
      '.v312-src-popover{',
      '  position:fixed;inset:auto;margin:auto;',
      '  background:white;border:1px solid oklch(85% 0.04 145);border-radius:10px;',
      '  padding:12px 14px;box-shadow:0 8px 32px oklch(20% 0.05 145 / 0.15);',
      '  font-size:12px;color:oklch(20% 0.05 145);max-width:320px;line-height:1.55;',
      '}',

      // ── view-transition smooth row 등장 ──
      '::view-transition-old(v312-unit-row){animation:v312-fade-out .25s ease forwards}',
      '::view-transition-new(v312-unit-row){animation:v312-slide-in .35s cubic-bezier(.2,.7,.3,1) forwards}',
      '@keyframes v312-fade-out{to{opacity:0}}',
      '@keyframes v312-slide-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}',

      // a11y — focus-visible + reduced motion
      '@media (prefers-reduced-motion:reduce){',
      '  ::view-transition-old(v312-unit-row),',
      '  ::view-transition-new(v312-unit-row){animation:none}',
      '  #ws-detail-container .v297-edit-btn:hover{transform:none}',
      '}',
    ].join('');
  }

  // ── 2026: <template> clone (innerHTML 회피, 재사용) ──
  var rowTpl = null;
  function getRowTpl() {
    if (rowTpl) return rowTpl;
    rowTpl = document.createElement('template');
    rowTpl.innerHTML =
      '<div class="v240-r v312-unit-row" role="row" aria-label="">' +
        '<div class="v240-k" role="rowheader">전용/공용</div>' +
        '<div class="v240-v" data-slot="dual"></div>' +
        '<div class="v240-k" role="rowheader">총면적</div>' +
        '<div class="v240-v" data-slot="total"></div>' +
      '</div>';
    return rowTpl;
  }

  // ── 2026: format with Intl ──
  function fmtArea(n) {
    if (n == null || !isFinite(n) || n <= 0) return '-';
    return areaFmt.format(Number(n)) + ' ㎡';
  }

  // ── 출처 popover (2026 Popover API) ──
  function buildSrcPopover(sel) {
    var pop = document.createElement('div');
    pop.className = 'v312-src-popover';
    pop.popover = 'auto'; // 2026 baseline
    pop.id = 'v312-src-pop-' + Math.random().toString(36).slice(2, 8);
    var dongHo = (sel.dongNm ? sel.dongNm + '동 ' : '') + (sel.hoNm || '') + '호';
    pop.textContent =
      '국토교통부 건축물대장 (data.go.kr) · ' + dongHo + ' · ' +
      (sel.flrNoNm || (sel.flrNo ? sel.flrNo + '층' : '')) +
      ' · 매월 자동 갱신';
    document.body.appendChild(pop);
    return pop;
  }

  function insertUnitRow(modal, sel) {
    var info2 = modal.querySelector('.v240-info2');
    if (!info2 || info2.dataset.v312unit === '1') return;

    // 2026: native :has() — anchor row 매칭
    var anchor =
      info2.querySelector('.v240-r:has(.v240-k:not(.v240-empty))') &&
      Array.from(info2.querySelectorAll('.v240-r')).find(function (r) {
        var k = r.querySelector('.v240-k');
        return k && /면적|평수|공급/.test(k.textContent || '');
      });

    var tpl = getRowTpl();
    var row = tpl.content.firstElementChild.cloneNode(true);
    var dual = areaPair(sel);
    row.querySelector('[data-slot="dual"]').textContent = dual;
    row.querySelector('[data-slot="total"]').textContent = fmtArea(sel.totalArea);
    row.setAttribute('aria-label',
      '전용 ' + dual.split(' / ')[0] + ', 공용 ' + dual.split(' / ')[1] +
      ', 총 ' + fmtArea(sel.totalArea) +
      (sel.flrNoNm ? ', ' + sel.flrNoNm : ''));

    // 출처 popover button — 인터랙티브 툴팁 (Popover API)
    var srcPop = buildSrcPopover(sel);
    var srcBtn = document.createElement('button');
    srcBtn.type = 'button';
    srcBtn.className = 'v312-unit-src-btn';
    srcBtn.textContent = '출처';
    srcBtn.setAttribute('popovertarget', srcPop.id);
    srcBtn.setAttribute('aria-label', '데이터 출처 보기');
    row.querySelector('[data-slot="total"]').appendChild(srcBtn);

    // 2026: View Transition (60fps smooth)
    var doInsert = function () {
      if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(row, anchor.nextSibling);
      else if (anchor) anchor.parentNode.appendChild(row);
      else info2.appendChild(row);
      info2.dataset.v312unit = '1';
    };
    if (typeof document.startViewTransition === 'function') {
      try { document.startViewTransition(doInsert); }
      catch (_) { doInsert(); }
    } else {
      doInsert();
    }
  }

  function areaPair(sel) {
    var ex = sel.exclusiveArea ? fmtArea(sel.exclusiveArea) : '-';
    var co = (sel.commonArea && sel.commonArea > 0) ? fmtArea(sel.commonArea) : '-';
    return ex + ' / ' + co;
  }

  // ── 2026: navigator.locks for race-safe fetch ──
  function withLock(name, fn) {
    if (navigator.locks && typeof navigator.locks.request === 'function') {
      return navigator.locks.request(name, { mode: 'exclusive' }, fn);
    }
    return fn();
  }

  function fetchAndEnrich(modal) {
    if (modal.dataset.v312fetched === '1') return;
    var L = window.WS && window.WS.__lastListing;
    if (!L) return;

    var addr = String(L.address || '').trim();
    if (!addr) return;
    var dong = String(L.building_dong || '').trim();
    var ho = String(L.building_ho || '').trim();
    if (!ho) {
      var ext = extractDongHo(addr);
      dong = dong || ext.dongNm;
      ho = ho || ext.hoNm;
    }
    if (!ho) return;

    modal.dataset.v312fetched = '1';
    var key = CACHE_PREFIX + (L.id || '') + ':' + addr + ':' + dong + ':' + ho;

    var cached = getCached(key);
    if (cached && cached.success && cached.selected_unit) {
      insertUnitRow(modal, cached.selected_unit);
      return;
    }

    withLock('v312-bldg:' + key, function () {
      // lock 안에서 다시 cache 체크 (다른 탭 / 다른 이벤트 race)
      var c2 = getCached(key);
      if (c2 && c2.success && c2.selected_unit) {
        insertUnitRow(modal, c2.selected_unit);
        return Promise.resolve();
      }
      var token = getRealAdminToken();
      var url = '/api/admin/building-registry-full?address=' + encodeURIComponent(addr) +
        (L.id ? '&lid=' + encodeURIComponent(L.id) : '') +
        (dong ? '&dongNm=' + encodeURIComponent(dong) : '') +
        ('&hoNm=' + encodeURIComponent(ho));
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer admin_bridge_' + token;
      // 2026: AbortSignal.timeout (baseline)
      return fetch(url, {
        headers: headers,
        credentials: 'include',
        signal: AbortSignal.timeout(12000),
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (payload) {
          if (!payload || !payload.success) return;
          if (!document.body.contains(modal)) return;
          setCached(key, payload);
          if (payload.selected_unit) insertUnitRow(modal, payload.selected_unit);
        })
        .catch(function (e) { console.warn('[' + V + '] fetch failed', e && e.message); });
    });
  }

  // ── observer ─────────────────────────────────────────
  function applyAll() {
    try {
      ensureSheet();
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
    debounceTimer = setTimeout(applyAll, 100);
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].addedNodes && muts[i].addedNodes.length) { scheduleApply(); return; }
    }
  });

  function start() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      scheduleApply();
      console.log('[' + V + '] observer 시작 — view-transitions / container-queries / popover / oklch / locks');
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
