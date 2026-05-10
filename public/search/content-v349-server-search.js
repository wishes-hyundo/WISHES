/**
 * v349 — Server side search redirect (옵션 C Step 2)
 * 사장님 명령 2026-05-11.
 *
 * 목적:
 *   사용자가 검색어 입력 시 server `/api/admin/listings/search` 호출 →
 *   결과로 `WS.allListings` 임시 swap + WS.refresh() → 사용자가 server 60K 검색
 *   안에서 매물 본다. Step 4 default limit=200 적용 후에도 검색 항상 60K 모두 가능.
 *
 * 흐름:
 *   1. 페이지 로드 시 WS.allListings 가 set 되면 cachedFullList 에 capture (한 번만)
 *   2. 검색 input (.ws-global-search, #ws-keyword) 에 capture-phase listener 등록
 *   3. keyword 변경 → 200ms debounce → server endpoint 호출 (AbortController)
 *   4. 결과 받으면 WS.allListings = result + WS.refresh()
 *   5. 빈 keyword 또는 server fail → cachedFullList 로 복원 + refresh
 *   6. #ws-btn-reset-filters / #ws-btn-clear-keyword 클릭 시 cache 복원
 *
 * 회귀 회피 (이번 세션 5번 회귀 학습):
 *   - response stream 안 건드림 (URL hook + 별도 fetch만) → v260-perf, v341 충돌 X
 *   - window.fetch wrap X → v294 defineProperty 충돌 X (Fix 36 회귀 회피)
 *   - cachedFullList 는 한 번만 capture — swap 후 절대 갱신 X (혼선 X)
 *   - server fail 시 cache 복원 fallback — 검색 깨짐 0% (Fix 38 회귀 회피)
 *   - AbortController 로 race condition 회피 (빠른 keystroke 안전)
 *   - existing event handler 와 같이 작동 (capture phase 만 추가, 기존 handler 막지 X)
 *
 * 안전 가드:
 *   - cachedFullList 가 없으면 (페이지 로드 직후) → swap X (기존 흐름)
 *   - server response 가 빈 array 라도 valid (검색 결과 0건 정상)
 *   - WS.refresh / WS.renderAll 둘 중 있는 함수 호출
 *   - WS 객체 없으면 swap X
 *
 * Step 4 적용 (default limit=200) 후 효과:
 *   - 첫 진입 응답 200건 (1-2초)
 *   - cachedFullList = 200건 (이게 OK — 검색 reset 시 200건 복원, 검색 시 다시 60K)
 *   - 검색 시 server 60K 안에서 찾아 → WS.allListings = 결과 → 검색 OK
 *   - 검색 reset (input 비움 또는 reset 버튼) → cachedFullList 복원 (200건 list)
 *   - 사용자 다시 검색 → 다시 server 60K → 항상 모든 매물 검색 가능
 */
(function () {
  'use strict';
  if (window.__WS_V349_SERVER_SEARCH__) return;
  window.__WS_V349_SERVER_SEARCH__ = true;

  var DEBUG = true;
  var DEBOUNCE_MS = 200;
  var SERVER_LIMIT = 500;  // server endpoint cap
  var CACHE_MIN_SIZE = 50;  // WS.allListings 가 이 수치 초과 시 cache 자격
  var ENDPOINT = '/api/admin/listings/search';

  var cachedFullList = null;       // 첫 set 된 WS.allListings (한 번만 capture)
  var inflightController = null;   // 진행 중 server search (race condition 회피)
  var debounceTimer = null;        // input 입력 debounce
  var lastDispatchedKeyword = '';  // 같은 keyword 중복 호출 회피
  var swapped = false;             // 현재 swap 상태인가

  function log() {
    if (!DEBUG) return;
    var args = ['[v349-server-search]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

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
    } catch (e) {
      log('refreshUI error', e);
    }
  }

  // 첫 set 된 WS.allListings 를 cache (한 번만)
  function ensureCached() {
    if (cachedFullList) return;
    if (!window.WS || !window.WS.allListings) return;
    if (window.WS.allListings.length < CACHE_MIN_SIZE) return;
    // shallow copy — listing 객체 자체는 공유 (메모리 절약)
    cachedFullList = window.WS.allListings.slice();
    log('cached', cachedFullList.length, 'listings');
  }

  // server endpoint 호출
  function callServerSearch(keyword) {
    // 기존 진행 중 호출 abort
    if (inflightController) {
      try { inflightController.abort(); } catch (_) {}
    }
    var ctrl = new AbortController();
    inflightController = ctrl;
    var t0 = Date.now();
    var url = ENDPOINT + '?q=' + encodeURIComponent(keyword) + '&limit=' + SERVER_LIMIT;
    return fetch(url, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
      signal: ctrl.signal,
    }).then(function (r) {
      if (!r.ok) throw new Error('http_' + r.status);
      return r.json();
    }).then(function (d) {
      var ms = Date.now() - t0;
      var rows = (d && d.data) || [];
      log('server', JSON.stringify(keyword), '→', rows.length, '/', d && d.total, 'in', ms, 'ms');
      return rows;
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return null;  // ignore aborted
      log('server fail', JSON.stringify(keyword), e && e.message);
      return null;  // null = fail → caller 가 cache fallback
    }).finally(function () {
      if (inflightController === ctrl) inflightController = null;
    });
  }

  // 검색 reset — cachedFullList 복원
  function restoreCache(reason) {
    if (!cachedFullList) return;
    if (!window.WS) return;
    if (!swapped && window.WS.allListings === cachedFullList) return;  // already restored
    window.WS.allListings = cachedFullList;
    swapped = false;
    log('restored', cachedFullList.length, '(' + reason + ')');
    refreshUI();
  }

  // server 결과로 swap
  function swapToServerResult(keyword, results) {
    if (!window.WS) return;
    if (!Array.isArray(results)) return;
    window.WS.allListings = results;
    swapped = true;
    log('swap', JSON.stringify(keyword), '→', results.length, 'rows');
    refreshUI();
  }

  // keyword 변경 처리 (debounce + dispatch)
  function onKeywordChange(rawKeyword, source) {
    ensureCached();
    var kw = (rawKeyword || '').trim();

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (!kw) {
      // 빈 keyword → cache 복원 (즉시, debounce 없음)
      lastDispatchedKeyword = '';
      restoreCache('empty keyword from ' + source);
      return;
    }

    if (kw === lastDispatchedKeyword) return;  // 동일 keyword 재호출 X

    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      lastDispatchedKeyword = kw;
      callServerSearch(kw).then(function (results) {
        if (results === null) {
          // server fail → cache 복원 (안전 fallback)
          restoreCache('server fail');
          return;
        }
        swapToServerResult(kw, results);
      });
    }, DEBOUNCE_MS);
  }

  // global search (top input) — Enter 키
  document.addEventListener('keypress', function (e) {
    if (e.key !== 'Enter') return;
    var t = e.target;
    if (!t || typeof t.matches !== 'function') return;
    if (t.matches('.ws-global-search') || t.id === 'ws-keyword') {
      onKeywordChange(t.value, 'keypress:' + (t.id || t.className));
    }
  }, true);  // capture phase — existing handler 보다 먼저 fire

  // sidebar keyword input — change event (focus out 또는 enter)
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || t.id !== 'ws-keyword') return;
    onKeywordChange(t.value, 'change:ws-keyword');
  }, true);

  // 초기화 버튼 click — 기존 handler 가 keyword='' set 후 renderAll 호출.
  // 그 후 우리는 cache 복원.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t) return;
    var id = t.id || (t.closest && t.closest('button') && t.closest('button').id);
    if (id === 'ws-btn-reset-filters' || id === 'ws-btn-reset-region' || id === 'ws-btn-clear-keyword') {
      // 기존 handler 후 cache 복원
      setTimeout(function () {
        lastDispatchedKeyword = '';
        restoreCache('reset button:' + id);
      }, 50);
    }
  }, true);

  // 페이지 로드 시 WS.allListings 가 set 되었는지 monitor (60K 받기 전 cache 시도 X)
  var probeAttempts = 0;
  var probeMax = 60;  // 60s
  var probeIntv = setInterval(function () {
    probeAttempts++;
    if (cachedFullList) {
      clearInterval(probeIntv);
      return;
    }
    ensureCached();
    if (cachedFullList) {
      clearInterval(probeIntv);
      log('initial cache acquired after', probeAttempts, 's');
    } else if (probeAttempts >= probeMax) {
      clearInterval(probeIntv);
      log('warning: WS.allListings 미수신 (60s) — cache fallback 비활성');
    }
  }, 1000);

  log('installed (debounce', DEBOUNCE_MS, 'ms, server limit', SERVER_LIMIT + ')');
})();
