/**
 * v361 v2 — Auto refresh background poller
 * 사장님 명령 2026-05-12.
 *
 * v2: COUNT exact 가 504 timeout → latest_id (인덱스 hit 50-100ms) 기반 비교로 변경.
 *
 * 배경:
 *   매물 수집 진행 중일 때 직원 PC 가 페이지 안 닫고 계속 열어두면 새 매물 못 봄
 *   (한 번 fetch 후 메모리 캐시 stuck). 사장님 원칙: "매번 사용자에게 시키지 마,
 *   항상 자동으로 되는 시스템".
 *
 * 동작:
 *   - 매 30초 /api/admin/listings/latest-count 호출 (가벼움, 50-200ms 예상)
 *   - server.latest_id 가 WS.allListings 안에 없으면 → 새 매물 → 자동 refetch
 *   - tab 비활성 시 polling 중단 (visibility API)
 *   - 진행 중 refetch 시 overlap 회피 (mutex)
 *
 * 회귀 회피:
 *   - 새 파일 → 기존 patch 안 건드림
 *   - fetch wrap 0 → v294-scope 같은 wrap 충돌 없음
 *   - setInterval + plain fetch 만
 *   - WS.allListings 없으면 silent skip
 *   - tab inactive 시 polling 중단 (서버 부하 최소화)
 *
 * 안전 가드:
 *   - refetching mutex
 *   - first poll 15초 후 (초기 로드 흐름 방해 0)
 *   - cooldown: 마지막 refetch 후 최소 20초 간격
 *   - latest_id 매물 검색 O(N) 60K rows × every 30s = 부담 → Set 캐시
 */
(function () {
  'use strict';
  if (window.__WS_V361_AUTO_REFRESH__) return;
  window.__WS_V361_AUTO_REFRESH__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var POLL_INTERVAL_MS = 120000; // [Step 73] 30s → 2min — idle 폴링 빈도 1/4
  var FIRST_POLL_DELAY_MS = 15000;
  var REFETCH_COOLDOWN_MS = 20000;
  var COUNT_ENDPOINT = '/api/admin/listings/latest-count';
  var ALL_ENDPOINT = '/api/admin/listings?fields=minimal';

  var refetching = false;
  var lastRefetchAt = 0;
  var pollCount = 0;
  var refetchCount = 0;
  var idSetCache = null;       // Set<string> of mem ids (cache, invalidated on refetch)
  var idSetVersion = 0;        // version (allListings length 기준)

  function log() {
    if (!DEBUG) return;
    var args = ['[v361-auto-refresh]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function getToken() {
    try {
      return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch (_) { return ''; }
  }

  function getScope() {
    try {
      if (window.WS && window.WS.state && window.WS.state.scope === 'mine') return 'mine';
      var u = new URL(location.href);
      if ((u.searchParams.get('scope') || '').toLowerCase() === 'mine') return 'mine';
    } catch (_) {}
    return 'all';
  }

  function memHasId(id) {
    if (!window.WS || !window.WS.allListings) return false;
    var arr = window.WS.allListings;
    var v = arr.length;
    if (!idSetCache || idSetVersion !== v) {
      idSetCache = new Set();
      for (var i = 0; i < arr.length; i++) {
        var r = arr[i];
        if (r && r.id !== undefined && r.id !== null) idSetCache.add(String(r.id));
      }
      idSetVersion = v;
    }
    return idSetCache.has(String(id));
  }

  async function pollLatest() {
    // [Step 73 fix 2026-05-19] 페이지 hidden 일 때 폴링 skip (background tab CPU 절약)
    if (typeof document !== 'undefined' && document.hidden) return;
    pollCount++;
    if (!window.WS || !window.WS.allListings) return;
    if (typeof document.visibilityState === 'string' && document.visibilityState === 'hidden') return;
    if (refetching) return;
    // [2026-05-14 사장님 명령] 사용자가 검색 중일 때 list 덮지 않도록 skip
    if (window.WS.__searchActive) {
      if (pollCount % 10 === 0) log('poll #' + pollCount + ' skip (__searchActive)');
      return;
    }

    try {
      var scope = getScope();
      var t0 = Date.now();
      var r = await fetch(COUNT_ENDPOINT + '?scope=' + scope + '&_ts=' + Date.now(), {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + getToken() },
      });
      var fetchMs = Date.now() - t0;
      if (!r.ok) {
        log('poll #' + pollCount + ' http', r.status, 'in', fetchMs, 'ms');
        return;
      }
      var j = await r.json();
      if (!j || !j.success) {
        log('poll #' + pollCount + ' bad response:', j && j.error);
        return;
      }
      var latestId = j.latest_id;
      if (!latestId) {
        log('poll #' + pollCount + ': server has no latest_id (empty?)');
        return;
      }
      if (memHasId(latestId)) {
        if (pollCount === 1 || pollCount % 10 === 0) {
          log('poll #' + pollCount + ': sync OK (latest_id=' + latestId +
              ' in mem, mem=' + window.WS.allListings.length + ', fetch=' + fetchMs + 'ms)');
        }
      } else {
        log('poll #' + pollCount + ': new listing detected (latest_id=' + latestId +
            ' NOT in mem, mem=' + window.WS.allListings.length + ', fetch=' + fetchMs + 'ms) → refetch');
        await refetchAll();
      }
    } catch (e) {
      log('poll #' + pollCount + ' err:', e && e.message);
    }
  }

  async function refetchAll() {
    if (refetching) return;
    // [Step 73 fix 2026-05-19 사장님 명령] v397 server pagination 활성 시 73K refetch 차단
    //   배경: 사장님 idle 시 30초마다 v361 polling → new listing 있으면 73K 전체 refetch
    //        window.WS.allListings = data (73K 항목) → v399 _addToCache cap 500 우회
    //        → 메모리 5-50MB 폭증, renderAll() 가 73K 매물 카드 다시 그리려 main thread 점유
    //        → 가만히 둬도 freeze
    //   수정: v397 server pagination flag 켜져 있으면 refetchAll 즉시 skip
    //         (server pagination 이 이미 100매물씩 fresh 제공)
    try {
      if (window.WS && window.WS.__featureFlags && window.WS.__featureFlags.use_server_pagination === true) {
        log('refetch skip (v397 server pagination active — 73K refetch 차단)');
        return;
      }
      // 또는 localStorage feature flag 확인
      var flagStr = '';
      try { flagStr = localStorage.getItem('ws_feature_flags') || ''; } catch (_) {}
      if (flagStr.indexOf('use_server_pagination') !== -1 && flagStr.indexOf('true') !== -1) {
        log('refetch skip (v397 server pagination active — localStorage flag)');
        return;
      }
    } catch (_) {}
    // [2026-05-14 사장님 명령] 검색 중 refetch 차단
    if (window.WS && window.WS.__searchActive) {
      log('refetch skip (__searchActive)');
      return;
    }
    var sinceLast = Date.now() - lastRefetchAt;
    if (sinceLast < REFETCH_COOLDOWN_MS) {
      log('refetch skip (cooldown', sinceLast, 'ms <', REFETCH_COOLDOWN_MS, 'ms)');
      return;
    }
    refetching = true;
    refetchCount++;
    var t0 = Date.now();
    try {
      var scope = getScope();
      var url = ALL_ENDPOINT + (scope === 'mine' ? '&scope=mine' : '');
      var r = await fetch(url, {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + getToken() },
      });
      if (!r.ok) {
        log('refetch http', r.status);
        return;
      }
      var j = await r.json();
      var data = (j && (j.data || j.listings)) || (Array.isArray(j) ? j : null);
      if (!Array.isArray(data)) {
        log('refetch: response not array (keys=' + (j ? Object.keys(j).join(',') : 'null') + ')');
        return;
      }
      var prevLen = (window.WS.allListings || []).length;
      window.WS.allListings = data;
      idSetCache = null; // invalidate
      idSetVersion = 0;
      lastRefetchAt = Date.now();
      log('refetch #' + refetchCount + ': mem ' + prevLen + ' → ' + data.length,
          '(+' + (data.length - prevLen) + ') in', Date.now() - t0, 'ms');
      if (typeof window.WS.renderAll === 'function') {
        try { window.WS.renderAll(); log('renderAll done'); }
        catch (e) { log('renderAll err:', e && e.message); }
      }
    } catch (e) {
      log('refetch err:', e && e.message);
    } finally {
      refetching = false;
    }
  }

  function init() {
    setTimeout(pollLatest, FIRST_POLL_DELAY_MS);
    setInterval(pollLatest, POLL_INTERVAL_MS);
    log('v2 installed (poll every', POLL_INTERVAL_MS / 1000, 's,',
        'first poll in', FIRST_POLL_DELAY_MS / 1000, 's, cooldown',
        REFETCH_COOLDOWN_MS / 1000, 's, latest_id-based detection)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
