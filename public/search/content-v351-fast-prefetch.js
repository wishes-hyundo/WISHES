/**
 * v351 — Fast prefetch (옵션 K)
 * 사장님 명령 2026-05-11 (진단 후 진짜 root cause 기반).
 *
 * 목적:
 *   페이지 로드 시 즉시 /api/admin/listings/fast 호출 → 1-2초 안 200건 표시.
 *   사장님 시야: 1-2초 후 매물 카드 + 28초 후 통계 62,418 정확.
 *
 * 동작:
 *   1. 페이지 로드 후 200ms 대기 (v294 wrap 로드 대기)
 *   2. fetch '/api/admin/listings/fast' (별도 endpoint, cache 우회, 단순 query)
 *   3. 610ms 안 응답 받음 (사장님 검증: db 61ms / img 43ms / total 160ms server)
 *   4. WS.allListings 임시 set + WS.renderAll() → 사장님 시야 매물 카드 즉시
 *   5. content.js 의 정상 60K fetch 도 동시 진행 (28초 baseline)
 *   6. 60K 도착 시 finishLoad 가 WS.allListings 교체 + renderAll → 통계 정확
 *
 * 회귀 회피 (회귀 7번 학습):
 *   - server route.ts 안 건드림 (기존 listings minimal 응답 그대로) → 회귀 0
 *   - window.fetch wrap X → v294 충돌 회피 (Fix 36 학습)
 *   - response stream 안 건드림 → v260-perf, v341 충돌 회피
 *   - 새 endpoint (cache key 다름) → v350 fail 회피 (사장님 검증: 610ms)
 *   - cache_already_present check → cache 신선 흐름 영향 X
 *   - fullLoaded race → AbortController + threshold check
 *   - 사용 안 되면 prod 영향 0 (등록 안 하면 비활성)
 *
 * 안전 가드:
 *   - WS / WS.renderAll 없으면 skip
 *   - fast fetch 실패 시 silent fail (60K 흐름은 정상 작동)
 *   - WS.allListings 이미 큰 list (>400) 이면 swap X (cache 신선 흐름 영향 X)
 *   - 60K 도착 감지 시 fast 진행 중이면 abort
 *
 * 사장님 시야 비교:
 *   - 이전 (시크릿창/캐시 없음): 28초 동안 skeleton → 60K 카드 표시
 *   - 옵션 K 후: 1-2초 안 200건 카드 표시 → 28초 후 통계 62,418 정확 (사용자 인지 X)
 */
(function () {
  'use strict';
  if (window.__WS_V351_FAST_PREFETCH__) return;
  window.__WS_V351_FAST_PREFETCH__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var INIT_DELAY_MS = 200;       // v294 등 wrap 먼저 로드 대기
  var FULL_THRESHOLD = 400;      // WS.allListings 이 수치 초과 = 60K 도착
  var ENDPOINT = '/api/admin/listings/fast';  // ⭐ 옵션 K 의 새 endpoint

  var fastLoaded = false;
  var fullLoaded = false;
  var fastInflightCtrl = null;

  function log() {
    if (!DEBUG) return;
    var args = ['[v351-fast-prefetch]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function getToken() {
    try {
      return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch (_) { return ''; }
  }

  function refreshUI() {
    try {
      if (window.WS && typeof window.WS.renderAll === 'function') {
        window.WS.renderAll();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function fastFetch() {
    if (fastLoaded || fullLoaded) return;
    if (!window.WS) {
      log('WS missing — skip');
      return;
    }
    // 이미 60K 또는 cache 가 set 됐으면 swap X (UX 깨짐 회피)
    if (window.WS.allListings && window.WS.allListings.length > FULL_THRESHOLD) {
      log('WS.allListings already has', window.WS.allListings.length, '— skip fast fetch');
      fullLoaded = true;
      return;
    }
    fastInflightCtrl = new AbortController();
    var t0 = Date.now();
    fetch(ENDPOINT, {
      credentials: 'include',
      signal: fastInflightCtrl.signal,
      headers: { 'Authorization': 'Bearer ' + getToken() },
    }).then(function (r) {
      if (!r.ok) throw new Error('http_' + r.status);
      return r.json();
    }).then(function (d) {
      var ms = Date.now() - t0;
      if (!d || !d.success || !Array.isArray(d.data)) {
        log('fast invalid response in', ms, 'ms');
        return;
      }
      // race condition: 60K 가 먼저 도착했으면 swap X
      if (fullLoaded) {
        log('full already loaded — discard fast (', d.data.length, 'rows)');
        return;
      }
      if (window.WS && window.WS.allListings && window.WS.allListings.length > FULL_THRESHOLD) {
        log('WS.allListings already > threshold — discard fast');
        fullLoaded = true;
        return;
      }
      // 임시로 WS.allListings 에 set
      window.WS.allListings = d.data;
      fastLoaded = true;
      var rendered = refreshUI();
      log('fast', d.data.length, 'rows in', ms, 'ms — rendered:', rendered, 'server_timing:', d._timing);
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      log('fast fail:', e && e.message);
    }).finally(function () {
      fastInflightCtrl = null;
    });
  }

  // 60K 도착 감지 (content.js 의 finishLoad 후 WS.allListings.length 가 큼)
  function watchForFull() {
    var probeAttempts = 0;
    var probeMax = 60;  // 60s
    var intv = setInterval(function () {
      probeAttempts++;
      if (fullLoaded) {
        clearInterval(intv);
        return;
      }
      if (window.WS && window.WS.allListings && window.WS.allListings.length > FULL_THRESHOLD) {
        fullLoaded = true;
        clearInterval(intv);
        if (fastInflightCtrl) {
          try { fastInflightCtrl.abort(); } catch (_) {}
        }
        log('full received:', window.WS.allListings.length, 'rows after', probeAttempts, 's');
      } else if (probeAttempts >= probeMax) {
        clearInterval(intv);
        log('warning: full not detected within', probeMax, 's');
      }
    }, 1000);
  }

  function init() {
    setTimeout(function () {
      fastFetch();
      watchForFull();
    }, INIT_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('installed (endpoint', ENDPOINT, ', init delay', INIT_DELAY_MS, 'ms)');
})();
