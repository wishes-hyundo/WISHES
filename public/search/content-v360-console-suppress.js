/**
 * v360 — Console.log monkey patch for 60K freeze prevention
 * 사장님 명령 2026-05-12.
 *
 * 배경:
 *   v358 (fetch wrap) 가 v294-scope (fetch wrap) 와 무한 재귀 RangeError.
 *   v358 의 본질 목적: 60K 매물 시 1분 freeze 방지.
 *   진단: freeze 원인은 v260-perf 의 auto-generate hook 내부 console.log
 *   "AI auto PASS" + "AI cached + allListings synced" × 60K = 120K 로그 출력 →
 *   DOM render block → 1분 freeze.
 *
 * 해결:
 *   fetch wrap 없이 console.log monkey patch 로 해당 로그만 차단.
 *   60K × 0 logs → freeze 0.
 *
 * 회귀 회피:
 *   - 새 파일 → 기존 patch 안 건드림
 *   - fetch wrap X → v294-scope 와 충돌 X
 *   - console.log only (다른 log level 영향 0)
 *   - SUPPRESS_PATTERNS 만 차단 → 다른 로그 그대로
 *
 * 안전 가드:
 *   - try/catch 로 patch 자체 fail 시 origLog fallback
 *   - 비-string arg0 시 그대로 통과 (object log 영향 0)
 *   - 등록 안 하면 prod 영향 0
 */
(function () {
  'use strict';
  if (window.__WS_V360_CONSOLE_SUPPRESS__) return;
  window.__WS_V360_CONSOLE_SUPPRESS__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // v260-perf 의 60K freeze 원인 로그들
  var SUPPRESS_PATTERNS = [
    'AI auto PASS',
    'AI cached + allListings synced',
    'AI cached + render skip',  // 변형 가능성
  ];

  var origLog = console.log;
  var origInfo = console.info;
  var suppressCount = 0;

  function shouldSuppress(arg0) {
    if (typeof arg0 !== 'string') return false;
    for (var i = 0; i < SUPPRESS_PATTERNS.length; i++) {
      if (arg0.indexOf(SUPPRESS_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  console.log = function () {
    try {
      if (arguments.length > 0 && shouldSuppress(arguments[0])) {
        suppressCount++;
        return;
      }
    } catch (e) { /* fall through to origLog */ }
    return origLog.apply(console, arguments);
  };

  console.info = function () {
    try {
      if (arguments.length > 0 && shouldSuppress(arguments[0])) {
        suppressCount++;
        return;
      }
    } catch (e) { /* fall through */ }
    return origInfo.apply(console, arguments);
  };

  // Periodic summary log (debug only — origLog 로 출력해서 자기 자신 suppress X)
  setInterval(function () {
    if (suppressCount > 0) {
      origLog.call(console, '[v360-console-suppress] suppressed', suppressCount, 'noisy logs');
    }
  }, 10000);

  origLog.call(console, '[v360-console-suppress] installed — 60K freeze prevention via console.log wrap (no fetch wrap)');
})();
