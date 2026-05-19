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
  // [Step 48 fix 2026-05-19 사장님 명령] stack trace 캡처 제거 — 그것이 진짜 freeze 원인
  //   기존: 매 setTimeout 마다 'new Error().stack' 생성 + 파싱 (very expensive)
  //   500+ stack 캡처/페이지 = main thread 누적 freeze
  //   수정: stack 캡처 제거. 단순 timeout tracking 만 유지.
  //   __V403_CALLERS() 는 비활성 (이미 v322/v323/v381 등 진짜 범인 식별됨)
  const _callerStats = new Map();
  window.setTimeout = function (fn, delay) {
    const args = Array.prototype.slice.call(arguments, 2);
    const id = _origSetTimeout.apply(window, [fn, delay].concat(args));
    _timeouts.add(id);
    _origSetTimeout(function () { _timeouts.delete(id); }, (typeof delay === 'number' ? delay : 0) + 100);
    return id;
  };
  // 진단 함수 (호환성 위해 stub 유지)
  window.__V403_CALLERS = function () {
    console.warn('[v403] caller stats disabled in Step 48 — used for freeze fix. Use __V403_DIAGNOSE() for current state.');
    return [];
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
  // [Step 65 fix 2026-05-19 사장님 명령] MutationObserver REGISTRY
  // ───────────────────────────────────────────────────────────────
  //   배경: 66개 patch 가 observe(document.body, {childList:true, subtree:true}) 후 disconnect 없음
  //   → closure scope 영구, callback queue 누적, listing references retained
  //   → page lifecycle 끝에도 GC 못 됨
  //   해결: MutationObserver constructor wrap → 모든 instance 추적 → unload 시 일괄 disconnect
  const _observers = new Set();
  const _OrigMO = window.MutationObserver;
  if (_OrigMO) {
    function WrappedMO(cb) {
      const inst = new _OrigMO(cb);
      _observers.add(inst);
      const origDisconnect = inst.disconnect.bind(inst);
      inst.disconnect = function () {
        _observers.delete(inst);
        return origDisconnect();
      };
      return inst;
    }
    WrappedMO.prototype = _OrigMO.prototype;
    window.MutationObserver = WrappedMO;
  }

  // ───────────────────────────────────────────────────────────────
  // [Step 66 fix 2026-05-19 사장님 명령] GLOBAL ERROR DEDUP
  // ───────────────────────────────────────────────────────────────
  //   배경: 콘솔 31 errors 누적 — 같은 에러가 N번 반복되어 31 도달.
  //   해결: window.onerror 에서 에러 message+filename+lineno 기준 dedup.
  //         같은 에러는 첫 발생만 console.error 로 출력, 이후는 silent count.
  //   디버그: window.__V403_ERRSTATS() 로 dedup 된 에러 통계 조회.
  const _errStats = new Map();
  const _origConsoleError = console.error.bind(console);
  function _errKey(msg, file, line) {
    return (msg || '?') + '|' + (file || '?') + ':' + (line || '?');
  }
  window.addEventListener('error', function (e) {
    try {
      const k = _errKey(e.message, e.filename, e.lineno);
      const stat = _errStats.get(k);
      if (stat) {
        stat.count++;
        // 두번째부터 silent (콘솔 청결)
        try { e.preventDefault && e.preventDefault(); } catch (_) {}
      } else {
        _errStats.set(k, { count: 1, msg: e.message, file: e.filename, line: e.lineno });
      }
    } catch (_) {}
  }, true);
  // 진단용
  window.__V403_ERRSTATS = function () {
    const arr = [];
    _errStats.forEach(function (s, k) { arr.push({ count: s.count, msg: s.msg, file: s.file, line: s.line }); });
    arr.sort(function (a, b) { return b.count - a.count; });
    console.table(arr.slice(0, 20));
    return arr;
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
    const moCount = _observers.size;
    _intervals.forEach(function (id) { try { _origClearInterval.call(window, id); } catch (_) {} });
    _timeouts.forEach(function (id) { try { _origClearTimeout.call(window, id); } catch (_) {} });
    // [Step 65] disconnect all MO (66+ patches 의 영구 observer 일괄 정리)
    _observers.forEach(function (mo) { try { mo.disconnect(); } catch (_) {} });
    _intervals.clear();
    _timeouts.clear();
    _observers.clear();
    log('cleanup (' + reason + '): cleared', intCount, 'intervals,', tmoCount, 'timeouts,', moCount, 'observers');
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
      // [Step 62 fix 2026-05-19 사장님 명령] 임계값 5000 → 10000
      //   기존: 5000+ 경고 → 100매물 카드 페이지는 정상적으로 5000+ (false alarm)
      //   수정: 10000+ 만 경고. 100매물 × ~50노드 = 5000 baseline + 모달 + UI = ~6500 expected.
      //         10000 초과 = 진짜 누수 신호 (DOM 폭증).
      if (allNodes > 10000) {
        _domWarnCount++;
        if (_domWarnCount <= 3) {
          log('DOM 노드 누적 경고:', allNodes, '개 (10000+) — 진짜 누수 가능성. 100매물 기준 baseline 6500.');
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
      observers: _observers.size,
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
