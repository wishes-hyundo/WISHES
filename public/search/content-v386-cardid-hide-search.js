/**
 * v386 — 매물카드 회색 매물번호 제거 + 매물번호 검색 강화
 * 사장님 명령 2026-05-14.
 *
 * 1. 매물카드 의 .ws-listing-id (옅은 회색 "매물번호 XXXX") 제거
 *    - 카드 옆 v325 녹색 뱃지와 중복 → 사장님 명령으로 카드 회색 표시 숨김
 *    - CSS display:none + 동적 카드 추가 시 MutationObserver
 *
 * 2. 검색바 매물번호 검색 강화
 *    - 사용자가 숫자만 입력 시 server endpoint 직접 호출 (v349 fallback)
 *    - server 결과에 id match 가 있으면 우선 표시
 *    - cache miss 시에도 작동 보장
 */
(function () {
  'use strict';
  if (window.__WS_V386_CARDID_HIDE_SEARCH__) return;
  window.__WS_V386_CARDID_HIDE_SEARCH__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // ── 1) 회색 .ws-listing-id 영구 숨김 ─────────────────────────
  function injectHideStyle() {
    if (document.getElementById('ws-v386-hide-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v386-hide-style';
    style.textContent = [
      // 매물카드 옆 회색 매물번호 — v325 녹색 뱃지와 중복
      '.ws-listing-id{display:none!important;}',
      // 모달 hero 의 회색 매물번호 (.ws-qp-id) — 모달 헤더 큰 매물번호와 중복
      // (옵션 — 사장님 더 원하면 주석 해제)
      // '.ws-qp-id{display:none!important;}',
    ].join('');
    document.head.appendChild(style);
  }

  // 동적으로 추가된 .ws-listing-id 도 보장 (CSS 로 충분하지만 안전)
  function removeAll() {
    try {
      var els = document.querySelectorAll('.ws-listing-id');
      for (var i = 0; i < els.length; i++) {
        els[i].style.display = 'none';
      }
    } catch (_) {}
  }

  // ── 2) 매물번호 검색 강화 ─────────────────────────
  var lastNumericKeyword = '';
  var lastFetchedId = null;

  function getToken() {
    try {
      return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch (_) { return ''; }
  }

  function fetchListingById(id) {
    if (!/^\d+$/.test(String(id))) return Promise.resolve(null);
    var token = getToken();
    if (!token) return Promise.resolve(null);
    return fetch('/api/admin/listings/search?q=' + id + '&limit=10', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (d) {
      var rows = (d && d.data) || [];
      // id 정확히 일치하는 row 찾기
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].id) === String(id)) return rows[i];
      }
      return null;
    }).catch(function () { return null; });
  }

  function ensureIdInList(id) {
    if (!window.WS || !window.WS.allListings) return;
    var has = window.WS.allListings.some(function (l) { return String(l.id) === String(id); });
    if (has) return;
    // 매물번호 매물 fetch + WS.allListings 에 prepend
    fetchListingById(id).then(function (row) {
      if (!row) return;
      if (!window.WS || !window.WS.allListings) return;
      // 다시 한번 check (race)
      if (window.WS.allListings.some(function (l) { return String(l.id) === String(id); })) return;
      window.WS.allListings = [row].concat(window.WS.allListings);
      lastFetchedId = id;
      try {
        if (typeof window.WS.refresh === 'function') window.WS.refresh();
        else if (typeof window.WS.renderAll === 'function') window.WS.renderAll();
      } catch (_) {}
    });
  }

  function onKeywordInput(e) {
    try {
      var input = e.target;
      if (!input || !input.value) return;
      var v = String(input.value).trim();
      // 매물번호 패턴: 숫자만 또는 W- 접두사
      var idMatch = v.match(/^[Ww]-?(\d+)$/);
      var isNum = /^\d+$/.test(v);
      if (!idMatch && !isNum) return;
      var id = idMatch ? idMatch[1] : v;
      if (id === lastNumericKeyword) return;
      lastNumericKeyword = id;
      // v349 server search 가 같이 호출되긴 하지만 fallback 으로 직접 fetch
      setTimeout(function () { ensureIdInList(id); }, 250);
    } catch (_) {}
  }

  function attachKeywordListener() {
    var inputs = document.querySelectorAll('.ws-global-search, #ws-keyword, input[name="keyword"]');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      if (inp.dataset.v386attached) continue;
      inp.dataset.v386attached = '1';
      inp.addEventListener('input', onKeywordInput, true);
    }
  }

  function init() {
    injectHideStyle();
    removeAll();
    attachKeywordListener();
    try {
      new MutationObserver(function () {
        removeAll();
        attachKeywordListener();
      }).observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    try { console.log('[v386-cardid-hide-search] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
