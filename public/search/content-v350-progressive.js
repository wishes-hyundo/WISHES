/**
 * v350 — Progressive client patch (옵션 F)
 * 사장님 명령 2026-05-11 (회귀 6번째 후 신중 모드).
 *
 * 목적:
 *   첫 진입 시 사장님 시야에 매물 카드를 1-2초 안 표시.
 *   server response 60K 자체는 그대로 (28초 baseline 유지) → 회귀 위험 0.
 *
 * 동작:
 *   1. 페이지 로드 후 200ms 대기 (v294 fetch wrap 등 먼저 로드)
 *   2. 별도 fetch `/api/admin/listings?fields=minimal&limit=200`
 *   3. 1-2초 안 응답 받으면 → WS.allListings 임시 set + WS.renderAll()
 *      → 사장님 시야: 200건 카드 즉시 표시 (v346 의 perPage=20 으로 첫 20건 paint)
 *   4. content.js 의 정상 흐름 (loadData → fetchAllListings 60K → finishLoad) 도 동시 진행
 *   5. 60K 도착 시 finishLoad 가 WS.allListings = 60K + renderAll → 자동 교체
 *      → 통계 박스 (62,418), 검색 가능 매물 (60K 모두) 정확
 *
 * 회귀 회피 (이번 세션 6번 회귀 학습):
 *   - server route.ts 안 건드림 (응답 그대로) → 60K 응답 = 그대로 = Fix 38/Step 4 회귀 회피
 *   - window.fetch wrap 절대 X → v294 defineProperty 충돌 회피 (Fix 36 회귀 회피)
 *   - response stream 안 건드림 → v260-perf, v341 stream tee 충돌 회피
 *   - 별도 fetch 호출 (content.js 의 fetchAllListings 와 독립적) → 코드 흐름 변경 X
 *   - fullLoaded 감지 후엔 swap X → race condition 회피
 *   - WS.allListings.length > 200 이면 swap X → cache 신선 흐름 영향 X
 *   - 사용 안 되면 prod 영향 0 (등록 안 하면 비활성)
 *
 * 안전 가드:
 *   - WS / WS.renderAll 없으면 skip
 *   - 200 fetch 실패 시 silent fail (60K 흐름은 정상 작동)
 *   - 200 fetch 시작 전 WS.allListings 가 이미 있으면 (캐시 흐름) skip
 *   - 60K 도착 감지 = WS.allListings.length > FAST_LIMIT × 2 (= 400) 이면 full
 *
 * 사장님 시야 비교:
 *   - 이전 (시크릿창/캐시 없음): 28초 동안 skeleton → 60K 카드 표시
 *   - 옵션 F 후: 1-2초 안 200건 카드 표시 → 28초 후 통계 박스 60K 정확 (사용자 인지 X)
 */
(function () {
  'use strict';
  if (window.__WS_V350_PROGRESSIVE__) return;
  window.__WS_V350_PROGRESSIVE__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var FAST_LIMIT = 200;       // 빠른 첫 응답 row 수
  var FULL_THRESHOLD = 400;   // 이 수치 초과 = 60K 도착 신호 (200 보다 큼)
  var INIT_DELAY_MS = 200;    // v294 등 wrap 먼저 로드 대기
  var ENDPOINT = '/api/admin/listings?fields=minimal&limit=' + FAST_LIMIT;

  var fastLoaded = false;
  var fullLoaded = false;
  var fastInflightCtrl = null;

  function log() {
    if (!DEBUG) return;
    var args = ['[v350-progressive]'].concat([].slice.call(arguments));
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
      log('fast', d.data.length, 'rows in', ms, 'ms — rendered:', rendered);
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
        // fast fetch 가 진행 중이면 abort (race 회피)
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

  log('installed (fast limit', FAST_LIMIT, ', init delay', INIT_DELAY_MS, 'ms)');
})();
