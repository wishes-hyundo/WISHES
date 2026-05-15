/**
 * v387 — Enter 키 검색 트리거 + 모바일 키보드 내림
 * 사장님 명령 2026-05-14.
 *
 * 동작:
 *   1. 검색 input 에 Enter 누름 (데스크탑/모바일 동일)
 *   2. preventDefault — form submit / page reload 방지
 *   3. input.blur() — 모바일 가상 키보드 내림
 *   4. server search 직접 호출 — /api/admin/listings/search?q=KEYWORD
 *      ID 검색 (115050 같은 매물번호) 도 server endpoint 의 ID lookup boost 가 처리
 *   5. 결과 받으면 WS.allListings 에 set + refresh
 *   6. fail 시에도 input.blur() 는 작동 (UX 우선)
 *
 * 회귀 회피:
 *   - v349 의 keypress listener 는 capture phase 라 먼저 fire — 그건 그대로 두고
 *     v387 은 keydown listener (keypress 와 별도) 로 fallback / blur 처리
 *   - keypress 와 keydown 둘 다 e.key='Enter' — 같은 사용자 액션 한 번에 둘 다 fire
 *     중복 호출 방지 위해 lastEnterAt timestamp 로 100ms 이내 중복 skip
 *   - WS.allListings update 후 refresh / renderAll 호출 (v349 와 동일 pattern)
 *
 * 매물카드 영향 0 — listener 만 추가, DOM 변경 X.
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
    if (!kw) return; // 빈 keyword 는 v349 가 cache restore 처리
    callServerSearch(kw).then(function (results) {
      if (!results) return;
      if (!window.WS) return;
      window.WS.allListings = results;
      refreshUI();
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
    // 100ms 이내 중복 호출 skip (keypress + keydown 둘 다 fire 가능성)
    var now = Date.now();
    if (now - lastEnterAt < 100) {
      // 모바일 키보드 내림 + form submit 방지만
      try { e.preventDefault(); } catch (_) {}
      try { t.blur(); } catch (_) {}
      return;
    }
    lastEnterAt = now;

    try { e.preventDefault(); } catch (_) {}
    try { e.stopPropagation(); } catch (_) {}
    // 모바일 가상 키보드 내림
    try { t.blur(); } catch (_) {}

    // server search 호출
    triggerSearch(t.value);
  }

  function init() {
    // capture phase — 모든 다른 listener 보다 먼저 fire
    document.addEventListener('keydown', onKeyDown, true);
    // form submit 도 잡기 (모바일에서 검색 키 → form submit 이 트리거되는 경우)
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (!f || f.tagName !== 'FORM') return;
      var inp = f.querySelector('.ws-global-search, #ws-keyword, input[name="keyword"], .ws-search-input');
      if (!inp) return;
      try { e.preventDefault(); } catch (_) {}
      try { inp.blur(); } catch (_) {}
      triggerSearch(inp.value);
    }, true);
    try { console.log('[v387-enter-search-blur] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
