/**
 * v405 — 활성 필터 chip + 빠른 정렬 toggle (C-3)
 * 사장님 명령 2026-05-19: 적용된 필터 한눈에 보이고 chip 클릭으로 해제
 *
 * 동작:
 *   1. .ws-results-header 아래에 chip container 삽입
 *   2. WS.state 의 활성 필터를 chip 으로 표시
 *      (deals, typeTabs, roomCounts, builtYear, direction, parking, checks 등)
 *   3. chip 클릭 → 해당 필터 reset + WS.refresh()
 *   4. "모두 초기화" 버튼
 *   5. 정렬 toggle: 최신순 / 가격↓ / 면적↓ — 빠른 전환
 *
 * 안전:
 *   - MutationObserver 로 .ws-results-header 감지 + throttle
 *   - 동일 chip 재생성 안 하도록 idempotent
 */
(function () {
  'use strict';
  if (window.__WS_V405_FILTER_CHIPS__) return;
  window.__WS_V405_FILTER_CHIPS__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var CHIP_CONTAINER_ID = 'ws-v405-chips';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
    });
  }

  // 현재 활성 필터 추출
  function getActiveFilters() {
    var s = (window.WS && window.WS.state) ? window.WS.state : null;
    if (!s) return [];
    var list = [];
    // multi-select
    (s.deals || []).forEach(function (v) { list.push({ key: 'deal:' + v, label: v, reset: function () { s.deals = s.deals.filter(function (x) { return x !== v; }); } }); });
    (s.typeTabs || []).forEach(function (v) { list.push({ key: 'type:' + v, label: v, reset: function () { s.typeTabs = s.typeTabs.filter(function (x) { return x !== v; }); } }); });
    (s.roomCounts || []).forEach(function (v) { list.push({ key: 'room:' + v, label: v + '방', reset: function () { s.roomCounts = s.roomCounts.filter(function (x) { return x !== v; }); } }); });
    // single
    if (s.roomShape && s.roomShape !== '전체') list.push({ key: 'shape', label: s.roomShape, reset: function () { s.roomShape = '전체'; } });
    if (s.floor && s.floor !== '전체') list.push({ key: 'floor', label: s.floor, reset: function () { s.floor = '전체'; } });
    if (s.builtYear && s.builtYear !== '전체') list.push({ key: 'year', label: s.builtYear, reset: function () { s.builtYear = '전체'; } });
    if (s.direction && s.direction !== '전체') list.push({ key: 'dir', label: s.direction + '향', reset: function () { s.direction = '전체'; } });
    if (s.parking && s.parking !== '전체') list.push({ key: 'park', label: '주차 ' + s.parking, reset: function () { s.parking = '전체'; } });
    if (s.livingSize && s.livingSize !== '전체') list.push({ key: 'living', label: '거실 ' + s.livingSize, reset: function () { s.livingSize = '전체'; } });
    // address
    if (Array.isArray(s.selectedRegions) && s.selectedRegions.length > 0) {
      s.selectedRegions.forEach(function (v) { list.push({ key: 'region:' + v, label: v, reset: function () { s.selectedRegions = s.selectedRegions.filter(function (x) { return x !== v; }); } }); });
    }
    if (Array.isArray(s.selectedDongs) && s.selectedDongs.length > 0) {
      s.selectedDongs.forEach(function (v) { list.push({ key: 'dong:' + v, label: v, reset: function () { s.selectedDongs = s.selectedDongs.filter(function (x) { return x !== v; }); } }); });
    }
    // checks
    var checkLabels = {
      buildingPhoto: '건물사진', interiorPhoto: '내부사진', video: '동영상', shortTerm: '단기',
      parkingAvailable: '주차가능', emptyNow: '즉시공실', balcony: '베란다',
      noFullOption: '풀옵션제외', fullOptionOnly: '풀옵션만', elevator: 'EV',
      priceNego: '금액네고', loanAvailable: '전세대출가능'
    };
    if (s.checks) {
      Object.keys(checkLabels).forEach(function (k) {
        if (s.checks[k]) {
          (function (key) {
            list.push({ key: 'chk:' + key, label: checkLabels[key], reset: function () { s.checks[key] = false; } });
          })(k);
        }
      });
    }
    // price range
    if (s.minDeposit || s.maxDeposit) list.push({ key: 'dep', label: '보증금 ' + (s.minDeposit || '0') + '~' + (s.maxDeposit || '∞'), reset: function () { s.minDeposit = ''; s.maxDeposit = ''; } });
    if (s.minMonthly || s.maxMonthly) list.push({ key: 'mon', label: '월세 ' + (s.minMonthly || '0') + '~' + (s.maxMonthly || '∞'), reset: function () { s.minMonthly = ''; s.maxMonthly = ''; } });
    if (s.minSalePrice || s.maxSalePrice) list.push({ key: 'sale', label: '매매 ' + (s.minSalePrice || '0') + '~' + (s.maxSalePrice || '∞'), reset: function () { s.minSalePrice = ''; s.maxSalePrice = ''; } });
    if (s.minArea || s.maxArea) list.push({ key: 'area', label: '면적 ' + (s.minArea || '0') + '~' + (s.maxArea || '∞') + s.areaUnit, reset: function () { s.minArea = ''; s.maxArea = ''; } });
    // keyword
    if (s.keyword) list.push({ key: 'kw', label: '“' + s.keyword + '”', reset: function () { s.keyword = ''; var input = document.querySelector('#ws-search-input, [data-search-input]'); if (input) input.value = ''; } });
    return list;
  }

  function injectStyles() {
    if (document.getElementById('ws-v405-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v405-style';
    style.textContent = [
      '#ws-v405-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 12px;background:#f7f9f7;border-radius:8px;margin:8px 0;border:1px solid #e2ebe3}',
      '#ws-v405-chips .v405-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:14px;background:#e8f5e9;color:#1B5E20;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #c8e6c9;user-select:none;transition:background 0.1s}',
      '#ws-v405-chips .v405-chip:hover{background:#c8e6c9}',
      '#ws-v405-chips .v405-chip-close{font-size:11px;line-height:1;color:#388E3C;font-weight:700}',
      '#ws-v405-chips .v405-clear-all{background:#fff;color:#6b7280;border:1px solid #d1d5db;font-weight:600}',
      '#ws-v405-chips .v405-clear-all:hover{background:#f3f4f6;color:#dc2626;border-color:#fca5a5}',
      '#ws-v405-chips .v405-sort-group{display:inline-flex;gap:2px;margin-left:auto;padding-left:8px;border-left:1px solid #d1d5db}',
      '#ws-v405-chips .v405-sort-btn{padding:4px 10px;border-radius:6px;background:transparent;color:#6b7280;font-size:12px;font-weight:500;cursor:pointer;border:none}',
      '#ws-v405-chips .v405-sort-btn:hover{background:#fff}',
      '#ws-v405-chips .v405-sort-btn.active{background:#1B5E20;color:#fff}',
      '#ws-v405-chips .v405-empty{font-size:12px;color:#9ca3af;font-style:italic}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildChipsHtml(active) {
    var s = (window.WS && window.WS.state) ? window.WS.state : null;
    var sortBy = (s && s.sortBy) || 'latest';
    var chipsHtml = '';
    active.forEach(function (f, i) {
      chipsHtml += '<span class="v405-chip" data-chip-idx="' + i + '" title="클릭하여 제거">' + esc(f.label) + '<span class="v405-chip-close">✕</span></span>';
    });
    if (active.length === 0) {
      chipsHtml = '<span class="v405-empty">필터 없음 (전체 매물 보기)</span>';
    } else {
      chipsHtml += '<span class="v405-chip v405-clear-all" data-clear-all="1" title="모든 필터 초기화">모두 초기화</span>';
    }
    var sortHtml =
      '<div class="v405-sort-group">' +
        '<button class="v405-sort-btn ' + (sortBy === 'latest' ? 'active' : '') + '" data-sort="latest">최신순</button>' +
        '<button class="v405-sort-btn ' + (sortBy === 'priceAsc' ? 'active' : '') + '" data-sort="priceAsc">가격↑</button>' +
        '<button class="v405-sort-btn ' + (sortBy === 'priceDesc' ? 'active' : '') + '" data-sort="priceDesc">가격↓</button>' +
        '<button class="v405-sort-btn ' + (sortBy === 'areaDesc' ? 'active' : '') + '" data-sort="areaDesc">면적↓</button>' +
      '</div>';
    return chipsHtml + sortHtml;
  }

  var _activeCache = '';
  function render() {
    var s = (window.WS && window.WS.state) ? window.WS.state : null;
    if (!s) return;
    var anchor = document.querySelector('.ws-results-header');
    if (!anchor) return;
    var container = document.getElementById(CHIP_CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = CHIP_CONTAINER_ID;
      anchor.parentNode.insertBefore(container, anchor.nextSibling);
    }
    var active = getActiveFilters();
    // dedup: 같은 state 면 re-render skip
    var sig = JSON.stringify({ a: active.map(function (f) { return f.key; }), sort: s.sortBy });
    if (sig === _activeCache) return;
    _activeCache = sig;
    container.innerHTML = buildChipsHtml(active);
    // bind chip click
    container.querySelectorAll('.v405-chip[data-chip-idx]').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(el.getAttribute('data-chip-idx'), 10);
        var current = getActiveFilters();
        if (current[idx]) {
          try { current[idx].reset(); } catch (_) {}
          if (window.WS && typeof window.WS.refresh === 'function') {
            try { window.WS.state.page = 1; } catch (_) {}
            window.WS.refresh();
          }
          _activeCache = ''; // force re-render
          setTimeout(render, 50);
        }
      });
    });
    var clearAll = container.querySelector('[data-clear-all]');
    if (clearAll) {
      clearAll.addEventListener('click', function () {
        var s2 = window.WS.state;
        s2.deals = []; s2.typeTabs = []; s2.roomCounts = [];
        s2.roomShape = '전체'; s2.floor = '전체'; s2.builtYear = '전체';
        s2.direction = '전체'; s2.parking = '전체'; s2.livingSize = '전체';
        s2.selectedRegions = []; s2.selectedDongs = [];
        Object.keys(s2.checks || {}).forEach(function (k) { s2.checks[k] = false; });
        s2.minDeposit = s2.maxDeposit = s2.minMonthly = s2.maxMonthly = '';
        s2.minSalePrice = s2.maxSalePrice = s2.minArea = s2.maxArea = s2.minBasePrice = s2.maxBasePrice = '';
        s2.keyword = '';
        var input = document.querySelector('#ws-search-input, [data-search-input]');
        if (input) input.value = '';
        if (typeof window.WS.refresh === 'function') {
          try { s2.page = 1; } catch (_) {}
          window.WS.refresh();
        }
        _activeCache = '';
        setTimeout(render, 50);
      });
    }
    container.querySelectorAll('.v405-sort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var newSort = btn.getAttribute('data-sort');
        if (newSort && window.WS && window.WS.state) {
          window.WS.state.sortBy = newSort;
          if (typeof window.WS.refresh === 'function') {
            try { window.WS.state.page = 1; } catch (_) {}
            window.WS.refresh();
          }
          _activeCache = '';
          setTimeout(render, 50);
        }
      });
    });
  }

  // 초기 + 주기 재 render (state 변화 자동 감지)
  function init() {
    injectStyles();
    render();
    var __t = null;
    var mo = new MutationObserver(function () {
      if (__t) return;
      __t = setTimeout(function () { __t = null; render(); }, 300);
    });
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    // state 변경 polling (필터 클릭 후 state 만 변경된 경우 cover)
    setInterval(render, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try { console.log('[v405-active-filter-chips] installed (chip + sort toggle)'); } catch (_) {}
})();
