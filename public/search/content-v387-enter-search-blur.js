/**
 * v387 v3 — Enter 키 검색 + 모바일 키보드 내림 + auto-refresh 일시 정지
 * 사장님 명령 2026-05-14.
 *
 * v3 변경:
 *   - v391 제거 (setInterval freeze 위험)
 *   - 대신 검색 시 직접 WS.stopAutoRefresh / WS._stopAutoRefresh 한 번만 호출
 *   - 검색 reset 시 WS.startAutoRefresh 한 번만 재개
 *   - setInterval / Object.defineProperty 등 위험한 방식 X
 */
(function () {
  'use strict';
  if (window.__WS_V387_ENTER_SEARCH__) return;
  window.__WS_V387_ENTER_SEARCH__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var ENDPOINT = '/api/admin/listings/search';
  var SERVER_LIMIT = 500;
  var lastEnterAt = 0;
  var inflightController = null;
  var pausedAR = false;

  function getToken() {
    try {
      return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch (_) { return ''; }
  }

  function refreshUI() {
    try {
      if (window.WS && typeof window.WS.refresh === 'function') window.WS.refresh();
      else if (window.WS && typeof window.WS.renderAll === 'function') window.WS.renderAll();
    } catch (_) {}
  }

  function pauseAutoRefresh() {
    if (pausedAR) return;
    pausedAR = true;
    try {
      if (window.WS && typeof window.WS.stopAutoRefresh === 'function') {
        window.WS.stopAutoRefresh();
      }
    } catch (_) {}
    try {
      if (window.WS && typeof window.WS._stopAutoRefresh === 'function') {
        window.WS._stopAutoRefresh();
      }
    } catch (_) {}
  }

  function resumeAutoRefresh() {
    if (!pausedAR) return;
    pausedAR = false;
    try {
      if (window.WS && typeof window.WS.startAutoRefresh === 'function') {
        window.WS.startAutoRefresh();
      }
    } catch (_) {}
  }

  function setSearchActive(active, keyword) {
    try {
      window.WS = window.WS || {};
      window.WS.__searchActive = !!active;
      window.WS.__searchKeyword = active ? keyword : '';
    } catch (_) {}
    if (active) pauseAutoRefresh();
    else resumeAutoRefresh();
  }

  function callServerSearch(keyword) {
    if (inflightController) {
      try { inflightController.abort(); } catch (_) {}
    }
    var ctrl = new AbortController();
    inflightController = ctrl;
    var url = ENDPOINT + '?q=' + encodeURIComponent(keyword) + '&limit=' + SERVER_LIMIT;
    var token = getToken();
    var headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { headers: headers, signal: ctrl.signal })
      .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
      .then(function (d) { return (d && d.data) || []; })
      .catch(function (e) {
        if (e && e.name === 'AbortError') return null;
        try { console.warn('[v387] server fail', e && e.message); } catch (_) {}
        return null;
      })
      .finally(function () { if (inflightController === ctrl) inflightController = null; });
  }

  function triggerSearch(keyword) {
    var kw = (keyword || '').trim();
    if (!kw) {
      setSearchActive(false, '');
      return;
    }
    setSearchActive(true, kw);
    callServerSearch(kw).then(function (results) {
      if (!results) {
        setSearchActive(false, '');
        return;
      }
      if (!window.WS) return;
      window.WS.allListings = results;
      refreshUI();
      try { console.log('[v387] search', JSON.stringify(kw), '→', results.length); } catch (_) {}
    });
  }

  function isSearchInput(t) {
    if (!t || !t.matches) return false;
    return t.matches('.ws-global-search, #ws-keyword, input[name="keyword"], .ws-search-input');
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter') return;
    var t = e.target;
    if (!isSearchInput(t)) return;
    var now = Date.now();
    if (now - lastEnterAt < 100) {
      try { e.preventDefault(); } catch (_) {}
      try { t.blur(); } catch (_) {}
      return;
    }
    lastEnterAt = now;
    try { e.preventDefault(); } catch (_) {}
    try { e.stopPropagation(); } catch (_) {}
    try { t.blur(); } catch (_) {}
    triggerSearch(t.value);
  }

  function init() {
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (!f || f.tagName !== 'FORM') return;
      var inp = f.querySelector('.ws-global-search, #ws-keyword, input[name="keyword"], .ws-search-input');
      if (!inp) return;
      try { e.preventDefault(); } catch (_) {}
      try { inp.blur(); } catch (_) {}
      triggerSearch(inp.value);
    }, true);
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      var id = t.id || (t.closest && t.closest('button') && t.closest('button').id);
      if (id === 'ws-btn-reset-filters' || id === 'ws-btn-reset-region' || id === 'ws-btn-clear-keyword' || id === 'ws-btn-init') {
        setTimeout(function () { setSearchActive(false, ''); }, 50);
      }
    }, true);
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!isSearchInput(t)) return;
      // 입력 중에는 search active 상태 유지 (다른 patch 가 polling 으로 덮어쓰기 방지)
      try {
        var v = (t.value || '').trim();
        if (v) setSearchActive(true, v);
      } catch (_) {}
    }, true);

    try { console.log('[v387-enter-search-blur v3] installed - input/click/enter handlers'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
