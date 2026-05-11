/**
 * v352 - MV prefetch (옵션 R Phase 3)
 * 사장님 명령 2026-05-11.
 *
 * mv-test 검증 (10f3a69): rows 66214, time 6956ms, has_thumb true
 * mv production 검증 (54095e9): rows 66214, time 12667ms, listing_images 변환 OK
 *
 * 목적:
 *   /api/admin/listings/mv 호출 → 12-13초 안 60K 매물 도착 → 모든 필터/검색 60K 안 정상.
 *
 * v351 fast prefetch (1초 200건) 와 조합:
 *   - 0초: 페이지 로드
 *   - 1초:  v351 fast 200건 표시 (사장님 시야 매물 즉시)
 *   - 12.6초: v352 mv 60K 도착 → 자동 교체 → 모든 필터 정상
 *   - 28초: content.js 정상 fetch 도착 (자동 교체, 같은 data, UX 영향 X)
 *
 * 회귀 회피 (회귀 7번 학습):
 *   - 기존 content.js fetchAllListings 안 건드림 → 회귀 0
 *   - window.fetch wrap X → v294 충돌 회피 (Fix 36 학습)
 *   - response stream 안 건드림 → v260-perf, v341 충돌 회피
 *   - 새 endpoint (cache key 다름) → v350 fail 회피 (사장님 검증: 12.6초)
 *   - mv direct (mv-test + production 검증됨) → Fix 34 회피
 *   - 사용 안 되면 prod 영향 0 (등록 X 시 비활성)
 *
 * 안전 가드:
 *   - WS / WS.renderAll 없으면 skip
 *   - mv fetch 실패 시 silent fail (60K 흐름은 정상 작동 → content.js 의 28초 fetch 가 fallback)
 *   - WS.allListings 가 이미 큰 list (>1000) 이면 swap X (cache 신선 흐름 영향 X)
 *
 * 사장님 시야 비교:
 *   - 이전 (시크릿창/캐시 없음): 28초 동안 skeleton → 60K 카드 표시
 *   - 옵션 K + R 후: 1초 안 200건 + 12.6초 후 60K (모든 필터 정상)
 */
(function () {
  'use strict';
  if (window.__WS_V352_MV_PREFETCH__) return;
  window.__WS_V352_MV_PREFETCH__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var INIT_DELAY_MS = 300;        // v294 등 wrap 먼저 로드 대기 (v351 보다 약간 늦게)
  var FULL_THRESHOLD = 1000;      // WS.allListings 이 수치 초과 = 이미 60K 도착
  var ENDPOINT = '/api/admin/listings/mv';

  var mvLoaded = false;
  var fullLoaded = false;
  var mvInflightCtrl = null;

  function log() {
    if (!DEBUG) return;
    var args = ['[v352-mv-prefetch]'].concat([].slice.call(arguments));
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

  function mvFetch() {
    if (mvLoaded || fullLoaded) return;
    if (!window.WS) {
      log('WS missing — skip');
      return;
    }
    // 이미 cache 60K 가 set 됐으면 swap X
    if (window.WS.allListings && window.WS.allListings.length > FULL_THRESHOLD) {
      log('WS.allListings already has', window.WS.allListings.length, '— skip mv fetch');
      fullLoaded = true;
      return;
    }
    mvInflightCtrl = new AbortController();
    var t0 = Date.now();
    fetch(ENDPOINT, {
      credentials: 'include',
      signal: mvInflightCtrl.signal,
      headers: { 'Authorization': 'Bearer ' + getToken() },
    }).then(function (r) {
      if (!r.ok) throw new Error('http_' + r.status);
      return r.json();
    }).then(function (d) {
      var ms = Date.now() - t0;
      if (!d || !d.success || !Array.isArray(d.data)) {
        log('mv invalid response in', ms, 'ms', d && d.error);
        return;
      }
      // race condition: content.js 의 60K 도착이 더 빠르면 swap X (희박 케이스)
      if (fullLoaded) {
        log('full already loaded — discard mv (', d.data.length, 'rows)');
        return;
      }
      if (window.WS && window.WS.allListings && window.WS.allListings.length > FULL_THRESHOLD) {
        log('WS.allListings already > threshold — discard mv');
        fullLoaded = true;
        return;
      }
      // 60K 로 WS.allListings 교체 (v351 의 200건 보다 큼)
      window.WS.allListings = d.data;
      mvLoaded = true;
      fullLoaded = true;
      var rendered = refreshUI();
      log('mv', d.data.length, 'rows in', ms, 'ms — rendered:', rendered, 'server_timing:', d._timing);
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      log('mv fail:', e && e.message);
    }).finally(function () {
      mvInflightCtrl = null;
    });
  }

  // content.js 의 fetchAllListings 가 60K 먼저 도착하면 mv fetch abort (race 회피)
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
        if (mvInflightCtrl) {
          try { mvInflightCtrl.abort(); } catch (_) {}
        }
        log('content.js full received first:', window.WS.allListings.length, 'rows after', probeAttempts, 's');
      } else if (probeAttempts >= probeMax) {
        clearInterval(intv);
      }
    }, 1000);
  }

  function init() {
    setTimeout(function () {
      mvFetch();
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
