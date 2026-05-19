/**
 * v391 — 검색 중 자동 새로고침 timer 정지 (안전 방식)
 * 사장님 명령 2026-05-14.
 *
 * v389 의 setter hijack 은 다른 patch 와 충돌 → 페이지 freeze 위험.
 * v391 는 setter 안 건드림 — content.js 의 stopAutoRefresh / _stopAutoRefresh
 * 함수를 호출해서 timer 자체를 정지. 안전 검증된 함수만 사용.
 *
 * 동작:
 *   1. window.WS.__searchActive watcher (setInterval 1초)
 *   2. searchActive=true 감지 시 → WS.stopAutoRefresh + WS._stopAutoRefresh 호출
 *   3. searchActive=false 감지 시 → WS.startAutoRefresh 재개
 *   4. defineProperty / setter hijack 등 위험한 방법 X
 *
 * 회귀 회피:
 *   - WS.stopAutoRefresh / WS._stopAutoRefresh 는 content.js 의 표준 함수
 *   - 사장님이 "10분 마다 자동 새로고침" 같은 설정도 정상 동작 (검색 종료 후 재개)
 *   - 페이지 freeze 위험 0 (간단한 함수 호출만)
 */
(function () {
  'use strict';
  if (window.__WS_V391_SEARCH_PAUSE__) return;
  window.__WS_V391_SEARCH_PAUSE__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v391-search-pause]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  var lastActive = false;
  var pausedAutoRefresh = false;

  function pauseTimers() {
    try {
      if (window.WS && typeof window.WS.stopAutoRefresh === 'function') {
        window.WS.stopAutoRefresh();
        pausedAutoRefresh = true;
        log('stopAutoRefresh called');
      }
    } catch (e) {
      log('stopAutoRefresh err:', e && e.message);
    }
    try {
      if (window.WS && typeof window.WS._stopAutoRefresh === 'function') {
        window.WS._stopAutoRefresh();
        log('_stopAutoRefresh called');
      }
    } catch (e) {
      log('_stopAutoRefresh err:', e && e.message);
    }
  }

  function resumeTimers() {
    if (!pausedAutoRefresh) return;
    pausedAutoRefresh = false;
    try {
      if (window.WS && typeof window.WS.startAutoRefresh === 'function') {
        window.WS.startAutoRefresh();
        log('startAutoRefresh resumed');
      }
    } catch (e) {
      log('startAutoRefresh err:', e && e.message);
    }
    // _startAutoRefresh 는 사용자 manual 설정 — 재개 하지 않음 (사용자가 다시 ON 하면 됨)
  }

  function watcher() {
    // [Step 74 fix 2026-05-19 사장님 명령] background tab 일 때 watcher skip
    if (typeof document !== 'undefined' && document.hidden) return;
    var nowActive = !!(window.WS && window.WS.__searchActive);
    if (nowActive === lastActive) return;
    if (nowActive) {
      pauseTimers();
      log('search active → timers paused');
    } else {
      resumeTimers();
      log('search ended → timers resumed');
    }
    lastActive = nowActive;
  }

  function init() {
    setInterval(watcher, 1000); // 1초마다 polling
    log('installed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
