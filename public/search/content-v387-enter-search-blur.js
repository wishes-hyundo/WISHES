/**
 * v387 v2 — Enter 키 검색 + 모바일 키보드 내림 + search active flag
 * 사장님 명령 2026-05-14.
 *
 * v2 변경:
 *   - 검색 시 window.WS.__searchActive = true 설정
 *   - v361 polling 이 이 flag 보고 list refresh skip → 검색 풀림 방지
 *   - 사용자가 input clear / reset 시 flag 해제
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

  function getToken() {
    try {
      return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch (_) { return ''; }
  }

  function refreshUI() {
    try {
      if (window.WS && typeof window.WS.refresh === 'function') {
        window.WS.refresh();
      } else if (window.WS && typeof window.WS.renderAll === 'function') {
        window.WS.renderAll();
      }
    } catch (_) {}
  }

  function setSearchActive(active, keyword) {
    try {
      window.WS = window.WS || {};
      window.WS.__searchActive = !!active;
      window.WS.__searchKeyword = active ? keyword : '';
    } catch (_) {}
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
      .then(function (r) {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function (d) {
        var rows = (d && d.data) || [];
        return rows;
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') return null;
        try { console.warn('[v387] server fail', e && e.message); } catch (_) {}
        return null;
      })
      .finally(function () {
        if (inflightController === ctrl) inflightController = null;
      });
  }

  function triggerSearch(keyword) {
    var kw = (keyword || '').trim();
    if (!kw) {
      // 빈 keyword — 검색 종료
      setSearchActive(false, '');
      return;
    }
    // 검색 시작 — flag 설정 (v361 polling skip)
    setSearchActive(true, kw);
    callServerSearch(kw).then(function (results) {
      if (!results) {
        setSearchActive(false, '');
        return;
      }
      if (!window.WS) return;
      window.WS.allListings = results;
      refreshUI();
      try { console.log('[v387] search', JSON.stringify(kw), '→', results.length, 'results'); } catch (_) {}
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
    // form submit 도 잡기
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (!f || f.tagName !== 'FORM') return;
      var inp = f.querySelector('.ws-global-search, #ws-keyword, input[name="keyword"], .ws-search-input');
      if (!inp) return;
      try { e.preventDefault(); } catch (_) {}
      try { inp.blur(); } catch (_) {}
      triggerSearch(inp.value);
    }, true);

    // 검색 reset / clear 버튼 click — search active 해제
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      var id = t.id || (t.closest && t.closest('button') && t.closest('button').id);
      if (id === 'ws-btn-reset-filters' || id === 'ws-btn-reset-region' || id === 'ws-btn-clear-keyword' || id === 'ws-btn-init') {
        setTimeout(function () { setSearchActive(false, ''); }, 50);
      }
    }, true);

    // 초기화 버튼 (검색바 옆 X 또는 초기화 글자) 인식
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!isSearchInput(t)) return;
      // input 비워지면 search active 해제
      if (!t.value || t.value.trim() === '') {
        setSearchActive(false, '');
      }
    }, true);

    try { console.log('[v387-enter-search-blur v2] installed (with __searchActive flag)'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
