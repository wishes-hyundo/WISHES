/* ============================================================
 * content-v292-global-search.js — WISHES /search 상단 통합검색 복원
 * Deployed: 2026-04-20 (rev b — bubble phase + deferred override)
 *
 * 작성 배경:
 *   상단 헤더의 "검색어를 입력하세요" 입력창(input.ws-global-search)이
 *   존재는 하나 필터 로직에 전혀 연결되어 있지 않아, "비룡" 등
 *   키워드를 입력하고 [검색] 버튼(#ws-btn-search)을 눌러도
 *   WS.filtered 가 변경되지 않고 전체 813건이 그대로 표기됨.
 *
 *   현상:
 *     - [검색] 클릭 시 traces = renderListings → renderPagination → saveFilterToURL
 *     - applyFilters 호출 누락, 입력값 참조 누락
 *     - ws-keyword (특이사항 옆 입력창)만 filter 체인에 연결됨
 *
 *   방침:
 *     ws-global-search 입력을 WS.allListings 에 대해 광역 substring
 *     매칭시켜 WS.filtered 를 재구성. WS 의 다른 필터와 직교(orthogonal)
 *     로 적용되며, 기존 ws-keyword 동작은 건드리지 않음.
 *
 * 적용 범위:
 *   [G1] #ws-btn-search 클릭 시 통합검색 실행 (capture phase)
 *   [G2] input.ws-global-search 엔터키 지원 (IME 가드 포함)
 *   [G3] 초기화 버튼(#ws-btn-reset-all) 클릭 시 입력값도 동반 리셋
 *   [G4] 매칭 대상 필드:
 *          id, title, address, address_detail, building_name,
 *          ai_description, dong, gu, features, seo_keywords,
 *          seo_tags, source_id
 *   [G5] 빈 쿼리 시 전체 복원 (all → filtered 복사)
 *   [G6] 페이지네이션 1페이지로 초기화
 *   [G7] MutationObserver — SPA 재마운트 대비, 핸들러 재바인딩
 *
 * 보존 원칙:
 *   - WS.applyFilters / _origApply 체인 일체 미수정
 *   - ws-keyword 특이사항 필드 동작 미변경
 *   - 지역·유형·방수 등 모든 기존 필터 공존
 *
 * Rollback: window.__WS_V292_GLOBAL_SEARCH__.rollback()
 * ============================================================ */
(function () {
  'use strict';

  if (window.__WS_V292_GLOBAL_SEARCH__) {
    try { window.__WS_V292_GLOBAL_SEARCH__.rollback && window.__WS_V292_GLOBAL_SEARCH__.rollback(); } catch (e) {}
  }

  var STATE = {
    bound: false,
    observer: null,
    btnHandler: null,
    inpHandler: null,
    resetHandler: null,
    composing: false,
    compStart: null,
    compEnd: null
  };

  var SEARCH_FIELDS = [
    'id', 'title', 'address', 'address_detail', 'building_name',
    'ai_description', 'dong', 'gu', 'features',
    'seo_keywords', 'seo_tags', 'source_id'
  ];

  function norm(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) return v.join(' ');
    try { return JSON.stringify(v); } catch (e) { return ''; }
  }

  function doGlobalSearch() {
    var WS = window.WS;
    if (!WS || !WS.allListings) return;

    var inp = document.querySelector('input.ws-global-search');
    var q = (inp && inp.value || '').trim().toLowerCase();

    var all = WS.allListings;
    if (!q) {
      WS.filtered = all.slice();
    } else {
      WS.filtered = all.filter(function (l) {
        for (var i = 0; i < SEARCH_FIELDS.length; i++) {
          var s = norm(l[SEARCH_FIELDS[i]]);
          if (s && s.toLowerCase().indexOf(q) >= 0) return true;
        }
        return false;
      });
    }

    if (WS.state) WS.state.page = 1;
    try { if (typeof WS.renderListings === 'function') WS.renderListings(); } catch (e) {}
    try { if (typeof WS.renderPagination === 'function') WS.renderPagination(); } catch (e) {}
    // 검색 결과 aria-live (v291 과 호환)
    try {
      var aria = document.getElementById('ws-search-live') || (function () {
        var el = document.createElement('div');
        el.id = 'ws-search-live';
        el.setAttribute('aria-live', 'polite');
        el.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(el);
        return el;
      })();
      aria.textContent = '검색결과 ' + (WS.filtered ? WS.filtered.length : 0) + '건';
    } catch (e) {}
  }

  function onBtnClick(e) {
    // [rev b] 원본 클릭 핸들러는 ws-global-search 입력을 무시하고 WS.filtered 를
    // 재구성해버리므로, capture 단계에서 먼저 실행되면 bubble 단계에서 덮여버린다.
    // 따라서 bubble 단계에 등록하고 추가로 setTimeout 으로 원본 렌더 사이클 이후에
    // 최종 오버라이드를 보장한다. 150ms 백업은 원본이 비동기 렌더를 하는 경우 대비.
    setTimeout(doGlobalSearch, 0);
    setTimeout(doGlobalSearch, 150);
  }

  function onInpKeydown(e) {
    // [G2] IME 조합 중에는 무시 (한글 자음/모음 중 Enter 방지)
    if (STATE.composing) return;
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      // [rev b] Enter 역시 원본 submit/click 플로우 이후에 적용
      setTimeout(doGlobalSearch, 0);
      setTimeout(doGlobalSearch, 150);
    }
  }

  function onCompStart() { STATE.composing = true; }
  function onCompEnd() { STATE.composing = false; }

  function onResetClick() {
    // [G3] 초기화 시 통합검색 입력도 비움
    try {
      var inp = document.querySelector('input.ws-global-search');
      if (inp) inp.value = '';
    } catch (e) {}
    // 다른 초기화 로직이 WS.filtered 를 복원한 뒤 한번 더 보정
    setTimeout(doGlobalSearch, 50);
  }

  function bind() {
    if (STATE.bound) return;
    var btn = document.getElementById('ws-btn-search');
    var inp = document.querySelector('input.ws-global-search');
    var rst = document.getElementById('ws-btn-reset-all');
    if (!btn || !inp) return; // 아직 DOM 미준비

    STATE.btnHandler = onBtnClick;
    STATE.inpHandler = onInpKeydown;
    STATE.resetHandler = onResetClick;
    STATE.compStart = onCompStart;
    STATE.compEnd = onCompEnd;

    // [rev b] capture → bubble 로 변경. 원본 핸들러 이후에 실행되도록.
    btn.addEventListener('click', STATE.btnHandler, false);
    inp.addEventListener('keydown', STATE.inpHandler, false);
    inp.addEventListener('compositionstart', STATE.compStart, true);
    inp.addEventListener('compositionend', STATE.compEnd, true);
    if (rst) rst.addEventListener('click', STATE.resetHandler, true);

    STATE.bound = true;
  }

  function unbind() {
    try {
      var btn = document.getElementById('ws-btn-search');
      var inp = document.querySelector('input.ws-global-search');
      var rst = document.getElementById('ws-btn-reset-all');
      if (btn && STATE.btnHandler) btn.removeEventListener('click', STATE.btnHandler, true);
      if (inp && STATE.inpHandler) inp.removeEventListener('keydown', STATE.inpHandler, true);
      if (inp && STATE.compStart) inp.removeEventListener('compositionstart', STATE.compStart, true);
      if (inp && STATE.compEnd) inp.removeEventListener('compositionend', STATE.compEnd, true);
      if (rst && STATE.resetHandler) rst.removeEventListener('click', STATE.resetHandler, true);
    } catch (e) {}
    STATE.bound = false;
  }

  function tryBindUntilReady() {
    // SPA 하이드레이션 타이밍 대비 — 최대 20회, 250ms 간격
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      bind();
      if (STATE.bound || tries > 20) clearInterval(t);
    }, 250);
  }

  function startObserver() {
    // [G7] SPA 재렌더 대비 — 헤더 버튼 재마운트 시 재바인딩
    if (STATE.observer) return;
    try {
      STATE.observer = new MutationObserver(function () {
        if (!STATE.bound) bind();
      });
      STATE.observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  function init() {
    tryBindUntilReady();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.__WS_V292_GLOBAL_SEARCH__ = {
    version: '2.9.2',
    state: STATE,
    doGlobalSearch: doGlobalSearch,
    bind: bind,
    rollback: function () {
      unbind();
      try { if (STATE.observer) STATE.observer.disconnect(); } catch (e) {}
      STATE.observer = null;
      try { delete window.__WS_V292_GLOBAL_SEARCH__; } catch (e) { window.__WS_V292_GLOBAL_SEARCH__ = undefined; }
    }
  };
})();
