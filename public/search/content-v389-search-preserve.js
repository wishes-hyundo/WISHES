/**
 * v389 — 검색 결과 보존 (auto refresh 가 검색 풀지 못하게)
 * 사장님 명령 2026-05-14.
 *
 * 진단:
 *   - v387 가 검색 후 WS.__searchActive = true 설정
 *   - 그런데 content.js 의 startAutoRefresh / _startAutoRefresh 가
 *     주기적으로 WS.allListings = newData 로 덮음
 *   - 결과: 검색 결과 → 일정 시간 후 전체 list 로 풀림
 *
 * v389 fix:
 *   - WS.startAutoRefresh wrap — timer callback 안에서 __searchActive check
 *   - WS._startAutoRefresh wrap — 동일
 *   - WS.refresh / WS.renderAll wrap — 검색 중이면 stored 결과 유지
 *   - 가장 안전 방법: WS.allListings setter hijack — 검색 중 set 차단
 *
 * 회귀 회피:
 *   - 새 매물 알림 (showToast) 등 다른 부분 영향 X
 *   - 단순히 list 덮기만 차단
 *   - 사용자가 검색 clear 시 자동 정상화
 */
(function () {
  'use strict';
  if (window.__WS_V389_SEARCH_PRESERVE__) return;
  window.__WS_V389_SEARCH_PRESERVE__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function log() {
    try { console.log.apply(console, ['[v389-search-preserve]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function isSearchActive() {
    return !!(window.WS && window.WS.__searchActive);
  }

  // 검색 결과 백업
  var searchResults = null;

  function setSearchSnapshot() {
    if (!window.WS || !Array.isArray(window.WS.allListings)) return;
    searchResults = window.WS.allListings.slice();
  }

  function restoreSearchSnapshot() {
    if (!searchResults || !window.WS) return;
    window.WS.allListings = searchResults;
    if (typeof window.WS.renderAll === 'function') {
      try { window.WS.renderAll(); } catch (_) {}
    }
  }

  function installHooks() {
    if (!window.WS) return setTimeout(installHooks, 100);
    if (window.WS.__v389Hooked) return;
    window.WS.__v389Hooked = true;

    // 1) WS.startAutoRefresh wrap — timer 안 callback 차단
    if (typeof window.WS.startAutoRefresh === 'function') {
      var origStartAR = window.WS.startAutoRefresh;
      window.WS.startAutoRefresh = function () {
        var result = origStartAR.apply(this, arguments);
        // timer callback 안 fetch 실행 후 setter 가 list 변경
        // 우리는 그 setter 자체를 catch
        return result;
      };
    }

    // 2) WS._startAutoRefresh wrap — 동일
    if (typeof window.WS._startAutoRefresh === 'function') {
      var origStartAR2 = window.WS._startAutoRefresh;
      window.WS._startAutoRefresh = function () {
        if (isSearchActive()) {
          log('block _startAutoRefresh (searchActive)');
          return;
        }
        return origStartAR2.apply(this, arguments);
      };
    }

    // 3) WS.allListings setter hijack — 검색 중 set 차단 (가장 안전)
    try {
      var current = window.WS.allListings;
      var locked = false;
      Object.defineProperty(window.WS, 'allListings', {
        configurable: true,
        get: function () { return current; },
        set: function (v) {
          if (locked) {
            // 다른 wrap 안 호출 — 직접 set
            current = v;
            return;
          }
          if (isSearchActive() && Array.isArray(current) && Array.isArray(v) && v.length !== current.length) {
            // 검색 결과 (1건 또는 적은 수) 와 다른 size 의 set 시도 → 차단
            // 하지만 검색 직후 v387 의 set 은 허용해야 — searchSnapshot 아직 없으면 허용
            if (searchResults && current === searchResults) {
              log('block WS.allListings set', v.length, '!=', current.length, '(searchActive)');
              return;
            }
          }
          locked = true;
          try { current = v; } finally { locked = false; }
        }
      });
      log('WS.allListings setter hijacked');
    } catch (e) {
      log('setter hijack fail (probably already defined):', e && e.message);
    }

    // 4) v387 호출 후 결과 백업 — __searchActive 변경 감지
    try {
      var lastActive = false;
      setInterval(function () {
        var nowActive = isSearchActive();
        if (nowActive && !lastActive) {
          // 검색 시작 — 잠시 후 결과 백업 (v387 의 set 완료 후)
          setTimeout(setSearchSnapshot, 500);
          log('search started → snapshot scheduled');
        } else if (!nowActive && lastActive) {
          // 검색 종료 — snapshot clear
          searchResults = null;
          log('search ended → snapshot cleared');
        }
        lastActive = nowActive;
      }, 200);
    } catch (_) {}

    log('hooks installed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installHooks);
  } else {
    installHooks();
  }
})();
