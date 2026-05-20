/* /search content-v407 — 공유 MutationObserver 허브 (근본 통합 1단계)
 *
 * 대표님 명령 (2026-05-20): "근본 통합" — 패치 85개가 각자 만든
 *   document.body 전체 감시 observer 65개가 DOM 변경 때마다 동시 폭주 →
 *   7분 멈춤. 이 파일이 그 observer 들을 1개로 통합한다.
 *
 * 동작:
 *   - window.MutationObserver 를 래퍼로 교체 (맨 먼저 로드되어야 함).
 *   - target === document.body 이고 {childList, subtree} 인 관찰은
 *     단 1개의 진짜 observer 로 모음.
 *   - 변경 record 는 rAF 로 한 박자 모았다가 한 번에 각 패치 콜백에 전달
 *     → 동기 연쇄 폭주를 프레임 단위로 분산 → 멈춤 해소.
 *   - 그 외 관찰(다른 element, attributes/characterData 등)은 네이티브 그대로.
 *
 * 안전:
 *   - 기존 85개 패치 파일은 한 줄도 수정 안 함.
 *   - ?nohub=1 또는 window.__WS_HUB_OFF__=true 로 즉시 비활성화.
 *   - 콜백 개별 try/catch — 한 패치 오류가 다른 패치에 전파 안 됨.
 *   - 진단: window.__WS_HUB_STATS__()
 */
(function () {
  'use strict';
  if (window.__WS_V407_HUB__) return;
  window.__WS_V407_HUB__ = true;

  try {
    if (location.search.indexOf('nohub=1') !== -1) {
      console.warn('[v407-hub] ?nohub=1 — 허브 비활성화 (네이티브 observer 사용)');
      return;
    }
  } catch (_) {}

  var Native = window.MutationObserver || window.WebKitMutationObserver;
  if (!Native) return;

  var bodySubs = [];        // { cb, instance, active }
  var realBodyObs = null;
  var pending = [];
  var flushScheduled = false;
  var stats = { dispatches: 0, records: 0, subs: 0, flushes: 0 };

  var raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : function (f) { return setTimeout(f, 16); };

  function flush() {
    flushScheduled = false;
    if (window.__WS_HUB_OFF__) return;
    var records = pending;
    pending = [];
    if (!records.length) return;
    stats.flushes++;
    stats.records += records.length;
    var subs = bodySubs;
    for (var i = 0; i < subs.length; i++) {
      var s = subs[i];
      if (!s.active) continue;
      stats.dispatches++;
      try {
        s.cb(records, s.instance);
      } catch (e) {
        try { console.warn('[v407-hub] 콜백 오류 (무시):', e && e.message); } catch (_) {}
      }
    }
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    raf(flush);
  }

  function ensureRealBodyObs() {
    if (realBodyObs) return;
    realBodyObs = new Native(function (records) {
      for (var i = 0; i < records.length; i++) pending.push(records[i]);
      scheduleFlush();
    });
    try {
      realBodyObs.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      try { console.warn('[v407-hub] body observe 실패:', e && e.message); } catch (_) {}
    }
  }

  // 허브로 보낼 관찰인지 판정: document.body 의 단순 childList+subtree 만.
  function isBodyChildList(target, opts) {
    return target === document.body &&
           !!(opts && opts.childList && opts.subtree) &&
           !opts.attributes && !opts.characterData &&
           !opts.attributeOldValue && !opts.characterDataOldValue &&
           !opts.attributeFilter;
  }

  function HubObserver(cb) {
    this._cb = (typeof cb === 'function') ? cb : function () {};
    this._native = null;
    this._sub = null;
  }
  HubObserver.prototype.observe = function (target, opts) {
    if (window.__WS_HUB_OFF__) {
      if (!this._native) this._native = new Native(this._cb);
      try { this._native.observe(target, opts); } catch (_) {}
      return;
    }
    if (isBodyChildList(target, opts)) {
      ensureRealBodyObs();
      if (!this._sub) {
        this._sub = { cb: this._cb, instance: this, active: true };
        bodySubs.push(this._sub);
        stats.subs = bodySubs.length;
      } else {
        this._sub.active = true;
      }
      return;
    }
    // 그 외 — 네이티브 그대로
    if (!this._native) this._native = new Native(this._cb);
    try { this._native.observe(target, opts); } catch (_) {}
  };
  HubObserver.prototype.disconnect = function () {
    if (this._sub) this._sub.active = false;
    if (this._native) { try { this._native.disconnect(); } catch (_) {} }
  };
  HubObserver.prototype.takeRecords = function () {
    if (this._native) { try { return this._native.takeRecords(); } catch (_) {} }
    return [];
  };

  window.MutationObserver = HubObserver;
  try { window.WebKitMutationObserver = HubObserver; } catch (_) {}

  window.__WS_HUB_STATS__ = function () {
    return {
      activeSubs: bodySubs.filter(function (s) { return s.active; }).length,
      totalSubs: bodySubs.length,
      flushes: stats.flushes,
      totalRecords: stats.records,
      totalDispatches: stats.dispatches
    };
  };

  try {
    console.log('[v407-observer-hub] active — body observer 통합 (1개), rAF batch');
  } catch (_) {}
})();
