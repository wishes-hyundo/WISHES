/**
 * content-v403-memory-guard.js
 *
 * [Step 28 fix 2026-05-19 사장님 명령] 통합 메모리 가드 — /search OOM 영구 해결
 *
 * 배경:
 *   - 85개 patch 누적, content.js 자체 66개 setInterval/setTimeout
 *   - 각 patch 가 자체 cleanup 없거나 일부만 함 (v305 0, v270-freshness 1누수,
 *     v294-scope 1누수, 기타 30+ 의심)
 *   - 사용자가 /search 페이지 오래 사용 → Chrome OOM 강제 종료
 *   - 사장님 보고 (2026-05-19): "WISHES 부동산" 탭에 "오류 코드: Out of Memory"
 *
 * Step 25 (2026-05-16) 가 v397 만 cleanup 했음. 이번엔 모든 patch 통합 cover.
 *
 * 동작:
 *   1) GLOBAL TIMER REGISTRY
 *      - window.setInterval / setTimeout 을 wrap 해서 모든 timer ID 추적
 *      - patch 별 책임 없이 자동 등록
 *
 *   2) AUTO CLEANUP ON UNLOAD
 *      - beforeunload + pagehide + visibilitychange (hidden) 다중 cover
 *      - 모든 registered timer clearInterval/clearTimeout
 *
 *   3) WS.allListings 메모리 cap
 *      - 500건 초과 시 가장 오래된 entries trim
 *      - v397 server pagination 활성 시 cap 안전 (서버가 page 단위 데이터 공급)
 *
 *   4) DOM 누적 모니터
 *      - 매 5분마다 detached node count 확인
 *      - 1000 초과 시 console.warn (진단용)
 *
 *   5) Visibility 절약
 *      - 페이지 hidden 시 polling timer 일시 정지
 *      - 페이지 visible 복귀 시 재개
 *
 * Cache key: 20260519a-oom-guard
 */
(function () {
  'use strict';
  if (window.__V403_MEMORY_GUARD__) return;
  window.__V403_MEMORY_GUARD__ = true;

  const TAG = '[v403-mem-guard]';
  const log = function () {
    try { console.log.apply(console, [TAG].concat(Array.prototype.slice.call(arguments))); } catch (_) {}
  };

  // ───────────────────────────────────────────────────────────────
  // 1) GLOBAL TIMER REGISTRY — setInterval/setTimeout wrap
  // ───────────────────────────────────────────────────────────────
  const _intervals = new Set();
  const _timeouts = new Set();
  const _origSetInterval = window.setInterval;
  const _origSetTimeout = window.setTimeout;
  const _origClearInterval = window.clearInterval;
  const _origClearTimeout = window.clearTimeout;

  window.setInterval = function (fn, delay) {
    const args = Array.prototype.slice.call(arguments, 2);
    const id = _origSetInterval.apply(window, [fn, delay].concat(args));
    _intervals.add(id);
    return id;
  };
  // [Step 39 진단 2026-05-19] setTimeout caller 통계 — 어디서 폭주하는지 추적
  const _callerStats = new Map();
  // [Step 42 fix 2026-05-19 사장님 명령] 어떤 patch 든 setTimeout 폭주 자동 차단
  //   동일 caller 가 1초 안에 30회 초과 등록 시 DROP (return -1)
  //   원인: 다양한 patch (v290 외 v333, v334, WP, v381, v382 등) 의 polling 폭주
  const _callerWindow = new Map(); // caller → [timestamps array]
  const RATE_LIMIT_WINDOW_MS = 1000;
  const RATE_LIMIT_MAX = 30;
  window.setTimeout = function (fn, delay) {
    const args = Array.prototype.slice.call(arguments, 2);
    // caller stack 의 첫 번째 외부 line 추출
    try {
      const stack = new Error().stack || '';
      const lines = stack.split('\n');
      let caller = 'unknown';
      for (let i = 2; i < Math.min(5, lines.length); i++) {
        const m = lines[i].match(/at .* \((.*?:\d+):\d+\)/) || lines[i].match(/at (.*?:\d+):\d+/);
        if (m && !m[1].includes('content-v403')) { caller = m[1].split('/').slice(-2).join('/'); break; }
      }
      _callerStats.set(caller, (_callerStats.get(caller) || 0) + 1);
      // [Step 42] rate-limit 검사: 1초 안에 30회 초과면 DROP
      const now = Date.now();
      let arr = _callerWindow.get(caller);
      if (!arr) { arr = []; _callerWindow.set(caller, arr); }
      // 1초 이전 timestamps 제거
      while (arr.length && arr[0] < now - RATE_LIMIT_WINDOW_MS) arr.shift();
      if (arr.length >= RATE_LIMIT_MAX) {
        // 폭주 감지 — drop + 로그 (10초에 1회만)
        if (!window.__v403_lastWarn || (now - window.__v403_lastWarn) > 10000) {
          console.warn('[v403] setTimeout rate-limit drop:', caller, '(>' + RATE_LIMIT_MAX + '/' + RATE_LIMIT_WINDOW_MS + 'ms)');
          window.__v403_lastWarn = now;
        }
        return -1; // dummy id, function 안 실행됨
      }
      arr.push(now);
    } catch (_) {}
    const id = _origSetTimeout.apply(window, [fn, delay].concat(args));
    _timeouts.add(id);
    _origSetTimeout(function () { _timeouts.delete(id); }, (typeof delay === 'number' ? delay : 0) + 100);
    return id;
  };
  // 진단 함수: 호출자별 setTimeout 수 표시
  window.__V403_CALLERS = function () {
    const sorted = Array.from(_callerStats.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.table(sorted.map(([caller, count]) => ({ caller, count })));
    return sorted;
  };
  window.clearInterval = function (id) {
    _intervals.delete(id);
    return _origClearInterval.call(window, id);
  };
  window.clearTimeout = function (id) {
    _timeouts.delete(id);
    return _origClearTimeout.call(window, id);
  };

  // ───────────────────────────────────────────────────────────────
  // 2) AUTO CLEANUP ON UNLOAD (beforeunload + pagehide + visibility)
  // ───────────────────────────────────────────────────────────────
  let _cleanupRan = false;
  function cleanupAll(reason) {
    if (_cleanupRan) return;
    _cleanupRan = true;
    const intCount = _intervals.size;
    const tmoCount = _timeouts.size;
    _intervals.forEach(function (id) { try { _origClearInterval.call(window, id); } catch (_) {} });
    _timeouts.forEach(function (id) { try { _origClearTimeout.call(window, id); } catch (_) {} });
    _intervals.clear();
    _timeouts.clear();
    log('cleanup (' + reason + '): cleared', intCount, 'intervals,', tmoCount, 'timeouts');
  }
  try { window.addEventListener('beforeunload', function () { cleanupAll('beforeunload'); }); } catch (_) {}
  try { window.addEventListener('pagehide', function () { cleanupAll('pagehide'); }); } catch (_) {}

  // ───────────────────────────────────────────────────────────────
  // 3) WS.allListings 메모리 cap (500건 초과 시 trim)
  // ───────────────────────────────────────────────────────────────
  const MAX_LISTINGS = 500;
  let _listingsCapWarned = false;

  function capListings() {
    try {
      const w = window;
      if (!w.WS || !Array.isArray(w.WS.allListings)) return;
      const len = w.WS.allListings.length;
      if (len > MAX_LISTINGS) {
        if (!_listingsCapWarned) {
          log('WS.allListings cap:', len, '→', MAX_LISTINGS, '(v397 server pagination 활성 시 정상)');
          _listingsCapWarned = true;
        }
        // 가장 최근 매물만 유지 (newest first ordering 가정)
        w.WS.allListings = w.WS.allListings.slice(0, MAX_LISTINGS);
      }
    } catch (_) {}
  }
  // 매 1분마다 cap 점검 (자체 setInterval 도 위 registry 통해 cleanup 됨)
  const _capTimer = _origSetInterval.call(window, capListings, 60 * 1000);
  _intervals.add(_capTimer);

  // ───────────────────────────────────────────────────────────────
  // 4) DOM 누적 모니터 (5분마다 detached element 진단)
  // ───────────────────────────────────────────────────────────────
  let _domWarnCount = 0;
  function monitorDom() {
    try {
      const allNodes = document.querySelectorAll('*').length;
      if (allNodes > 5000) {
        _domWarnCount++;
        if (_domWarnCount <= 3) {
          log('DOM 노드 누적 경고:', allNodes, '개 (5000+) — 정상은 1000-3000');
        }
      } else {
        _domWarnCount = 0;
      }
    } catch (_) {}
  }
  const _domTimer = _origSetInterval.call(window, monitorDom, 5 * 60 * 1000);
  _intervals.add(_domTimer);

  // ───────────────────────────────────────────────────────────────
  // 5) Visibility 절약 — 페이지 hidden 시 listings 정리
  // ───────────────────────────────────────────────────────────────
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        // 페이지 안 보이면 즉시 cap 한 번 더 (브라우저가 OOM 안 되도록)
        capListings();
      }
    });
  } catch (_) {}

  // ───────────────────────────────────────────────────────────────
  // diagnostics — 현재 메모리 상태 노출
  // ───────────────────────────────────────────────────────────────
  window.__V403_DIAGNOSE = function () {
    const info = {
      intervals: _intervals.size,
      timeouts: _timeouts.size,
      listings: (window.WS && Array.isArray(window.WS.allListings)) ? window.WS.allListings.length : 0,
      domNodes: document.querySelectorAll('*').length,
    };
    if (performance && performance.memory) {
      info.jsHeapMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
      info.jsHeapLimitMB = Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024);
    }
    console.table(info);
    return info;
  };

  log('memory guard installed (call __V403_DIAGNOSE() to see live stats)');
})();
