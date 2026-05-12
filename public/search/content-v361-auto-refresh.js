/**
 * v361 — Auto refresh background poller
 * 사장님 명령 2026-05-12.
 *
 * 배경:
 *   매물 수집 진행 중일 때 직원 PC 가 페이지 안 닫고 계속 열어두면 새 매물 못 봄
 *   (한 번 fetch 후 메모리 캐시 stuck). 사장님 원칙: "매번 사용자에게 시키지 마,
 *   항상 자동으로 되는 시스템".
 *
 * 동작:
 *   - 매 30초 /api/admin/listings/latest-count 호출 (가벼움, 100-300ms)
 *   - DB total != WS.allListings.length 시 자동 fetchAllListings 재호출
 *   - tab 비활성 시 polling 중단 (visibility API)
 *   - 진행 중 refetch 시 overlap 회피 (mutex)
 *
 * 회귀 회피 (회귀 9번 + v359/v358 RangeError 학습):
 *   - 새 파일 → 기존 patch 안 건드림
 *   - fetch wrap 0 → v294-scope 같은 wrap 충돌 없음
 *   - setInterval + plain fetch 만
 *   - WS.allListings 없으면 silent skip
 *   - tab inactive 시 polling 중단 (서버 부하 최소화)
 *   - 등록 안 하면 prod 영향 0
 *
 * 안전 가드:
 *   - refetching mutex
 *   - first poll 15초 후 (초기 로드 흐름 방해 0)
 *   - DB count < memory count 큰 차이는 skip (filter 적용 등 false positive 회피)
 *   - 잦은 호출 throttle: 마지막 refetch 후 최소 20초 간격
 *
 * 효과:
 *   - 직원 PC: 페이지 안 닫아도 30-60초 안 새 매물 자동 반영
 *   - 사장님 PC: 동일
 *   - 매물 수집 idle 시간: count diff 0 → fetch 안 함 (서버 부하 0)
 *   - 매물 수집 active 시: 매 30초 새 매물 자동 표시
 */
(function () {
  'use strict';
  if (window.__WS_V361_AUTO_REFRESH__) return;
  window.__WS_V361_AUTO_REFRESH__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var POLL_INTERVAL_MS = 30000;       // 30초
  var FIRST_POLL_DELAY_MS = 15000;    // 첫 polling 15초 후 (초기 로드 안 방해)
  var REFETCH_COOLDOWN_MS = 20000;    // 마지막 refetch 후 최소 20초 간격
  var COUNT_ENDPOINT = '/api/admin/listings/latest-count';
  var ALL_ENDPOINT = '/api/admin/listings?fields=minimal';

  var refetching = false;
  var lastRefetchAt = 0;
  var pollCount = 0;
  var refetchCount = 0;

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

  async function pollDbCount() {
    pollCount++;
    if (!window.WS || !window.WS.allListings) {
      return;
    }
    if (typeof document.visibilityState === 'string' && document.visibilityState === 'hidden') {
      return;
    }
    if (refetching) return;

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
      var dbCount = j.total || 0;
      var memCount = (window.WS.allListings || []).length || 0;
      var diff = dbCount - memCount;

      if (diff > 0) {
        log('poll #' + pollCount + ': DB=' + dbCount, 'mem=' + memCount,
            '+' + diff, 'new (in', fetchMs, 'ms) → refetch');
        await refetchAll();
      } else if (diff < -50) {
        log('poll #' + pollCount + ': DB=' + dbCount, 'mem=' + memCount,
            '(mem > DB, skip — 필터 적용 가능성)');
      } else {
        if (pollCount === 1 || pollCount % 10 === 0) {
          log('poll #' + pollCount + ': sync OK (DB=' + dbCount + ', fetch=' + fetchMs + 'ms)');
        }
      }
    } catch (e) {
      log('poll #' + pollCount + ' err:', e && e.message);
    }
  }

  async function refetchAll() {
    if (refetching) return;
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
      lastRefetchAt = Date.now();
      log('refetch #' + refetchCount + ': mem ' + prevLen + ' → ' + data.length,
          '(+' + (data.length - prevLen) + ') in', Date.now() - t0, 'ms');
      if (typeof window.WS.renderAll === 'function') {
        try {
          window.WS.renderAll();
          log('renderAll done');
        } catch (e) {
          log('renderAll err:', e && e.message);
        }
      }
    } catch (e) {
      log('refetch err:', e && e.message);
    } finally {
      refetching = false;
    }
  }

  function init() {
    setTimeout(pollDbCount, FIRST_POLL_DELAY_MS);
    setInterval(pollDbCount, POLL_INTERVAL_MS);
    log('installed (poll every', POLL_INTERVAL_MS / 1000, 's,',
        'first poll in', FIRST_POLL_DELAY_MS / 1000, 's,',
        'cooldown', REFETCH_COOLDOWN_MS / 1000, 's)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
