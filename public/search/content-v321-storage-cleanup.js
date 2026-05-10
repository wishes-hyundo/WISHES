/**
 * Wishes /search — v3.2.1 localStorage 자동 정리 + Quota Safety
 *
 * 목적:
 *   - "저장공간이 부족합니다" 토스트 무한 반복 영구 차단
 *   - 변동 감지 캐시 (ws_data_snapshot, ws_price_snapshots) 자동 정리
 *   - 사장님 데이터 (즐겨찾기/메모/연락처/폴더 등) 절대 보존
 *   - 매물 본 데이터는 DB → memory 라 localStorage 와 무관 (영향 0)
 *
 * 동작:
 *   1) localStorage.setItem prototype 래핑 → quota 시 자동 cleanup 후 재시도
 *   2) 큰 cache 키 우선 정리 (snapshot, alerts, changelog 등)
 *   3) 사장님 데이터 whitelist 절대 보호
 *   4) cleanup 후에도 실패 시에만 토스트 — 10분 throttle
 *   5) 페이지 로드 시 사전 진단 (4MB+ 도달 시 미리 cleanup)
 *
 * v321b (2026-05-09 사장님 발견 직후):
 *   cleanup 이후 ws_data_snapshot 비어있는 상태에서 _autoRefreshTimer 가
 *   trackChanges 호출 → 모든 매물이 "신규" 로 잘못 인식 → 자동 AI 트리거 폭주
 *   (/api/admin/auto-generate 500 100+건). 부작용 fix:
 *   1) trackChanges wrapper — snapshot 비어있으면 baseline 만 채우고 AI 트리거 skip
 *   2) cleanup 직후 즉시 allListings 로 baseline 자동 재구성 (사전 보호)
 *
 * 콘솔 진단:
 *   window.WS._lsUsage()       → 현재 키별 사용량 표시
 *   window.WS._lsCleanup()     → 수동 cleanup 실행
 *   window.WS._refillBaseline()→ 수동 baseline 재구성 (allListings → snapshot)
 *
 * INVARIANT (CLAUDE.md):
 *   - SAFE_PRESERVE 키는 어떤 경우에도 삭제 X
 *   - CLEANABLE_CACHE 키만 quota 시 자동 정리 (재생성됨)
 *   - 매물 데이터는 localStorage X (DB + memory)
 */
(function () {
  'use strict';

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var SAFE_PRESERVE = {
    // Step D Plan A (2026-05-10): ws_data_snapshot 영구 보존.
    //   사장님 첫 진입 21초 fix — 한 번 fetch 후 snapshot 살려두면 다음 진입 즉시 표시.
    'ws_data_snapshot': 1,
    'ws-favorites': 1, 'ws-memos': 1, 'ws-contacts': 1,
    'ws_customer_folders': 1, 'ws_filter_presets': 1,
    'ws_dark_mode': 1, 'ws_dark_auto': 1, 'ws_customer_prefs': 1,
    'ws_fav_categories': 1, 'ws_noti_settings': 1,
    'ws_token': 1, 'ws_user': 1, 'ws_login_time': 1, 'ws_refresh_token': 1,
    'ws-search-history': 1, 'ws_autorefresh_min': 1, 'wp-pal-frecent': 1,
  };
  var CLEANABLE_CACHE = [
    // Step D Plan A: ws_data_snapshot 제거됨 (SAFE_PRESERVE 로 이동).
    'ws_price_snapshots', 'ws_changelog',
    'ws_alerts', 'ws_alert_log_v1', 'ws_alert_log_unread_v1',
  ];

  var TOAST_THROTTLE_MS = 10 * 60 * 1000;
  // L-step-j (2026-05-09 사장님 SOTA B Phase 1.1): 2MB to 8MB cache 보호 강화.
  //   진단: Step B 의 2MB cleanup 이 ws_data_snapshot (1-3MB) 매번 삭제 →
  //         content.js 의 wsCacheGet (2분 fresh = 즉시 표시) 동작 불가 →
  //         사장님 매번 30초 fetch.
  //   해결: PRECLEANUP 2MB to 8MB. localStorage 한계 ~10MB 의 80%.
  //         사장님 cache (~3MB) 거의 보존 → 2분 안 재방문 = 즉시 표시.
  //         실제 quota 도달 시 (8MB+) 만 cleanup → 토스트 spam 안전 유지.
  //   효과: 재방문 30초 → 즉시 (content.js 5667줄 cache 분기 활성화).
  //   위험: 0% (Step B 의 quota 보호 의도 유지, threshold 만 완화).
  var PRECLEANUP_THRESHOLD = 8 * 1024 * 1024;
  var _lastQuotaToastAt = 0;

  function _byteSize(s) {
    try { return new Blob([s == null ? '' : s]).size; }
    catch (e) { return (s == null ? 0 : String(s).length * 2); }
  }
  function _measureLS() {
    var entries = [], total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        var v = localStorage.getItem(k) || '';
        var sz = _byteSize(k) + _byteSize(v);
        total += sz;
        entries.push({ key: k, size: sz });
      }
    } catch (e) {}
    entries.sort(function (a, b) { return b.size - a.size; });
    return { total: total, entries: entries };
  }

  function _cleanupCache(triggerKey) {
    var freed = 0, details = [];
    CLEANABLE_CACHE.forEach(function (k) {
      if (k === triggerKey) return;
      try {
        var v = localStorage.getItem(k);
        if (v != null) {
          var sz = _byteSize(k) + _byteSize(v);
          localStorage.removeItem(k);
          freed += sz;
          details.push(k + '(' + Math.round(sz / 1024) + 'KB)');
        }
      } catch (e) {}
    });
    if (triggerKey && CLEANABLE_CACHE.indexOf(triggerKey) >= 0) {
      try {
        var tv = localStorage.getItem(triggerKey);
        if (tv != null) {
          var tsz = _byteSize(triggerKey) + _byteSize(tv);
          localStorage.removeItem(triggerKey);
          freed += tsz;
          details.push(triggerKey + '(' + Math.round(tsz / 1024) + 'KB,trigger)');
        }
      } catch (e) {}
    }
    var measure = _measureLS();
    measure.entries.forEach(function (e) {
      if (e.size < 500 * 1024) return;
      if (SAFE_PRESERVE[e.key]) return;
      if (CLEANABLE_CACHE.indexOf(e.key) >= 0) return;
      try {
        localStorage.removeItem(e.key);
        freed += e.size;
        details.push(e.key + '(' + Math.round(e.size / 1024) + 'KB,unknown)');
      } catch (err) {}
    });
    return { freed: freed, details: details };
  }

  // v321b: cleanup 후 baseline 자동 재구성
  function _refillBaselineSnapshot(reason) {
    try {
      var allData = (window.WS && window.WS.allListings) || [];
      if (!Array.isArray(allData) || allData.length === 0) return false;
      var baseline = {};
      allData.forEach(function (item) {
        if (!item) return;
        var id = String(item.id || '');
        if (!id) return;
        baseline[id] = {
          price: String(item.deposit || item.price || ''),
          status: item.status || '',
          name: item.title || item.address || '매물',
        };
      });
      try { localStorage.setItem('ws_data_snapshot', JSON.stringify(baseline)); }
      catch (e) { return false; }
      try {
        console.log('[ws-storage-cleanup] baseline 재구성 (' + (reason || 'manual') +
          '): ' + allData.length + '건 → 자동 AI 트리거 폭주 방지');
      } catch (_) {}
      return true;
    } catch (e) { return false; }
  }

  // v321b: trackChanges baseline-protection wrapper
  function _installTrackChangesGuard() {
    var attempts = 0;
    var iv = setInterval(function () {
      attempts++;
      if (attempts > 150) { clearInterval(iv); return; }
      if (!window.WS || typeof window.WS.trackChanges !== 'function') return;
      if (window.WS.trackChanges._v321Wrapped) { clearInterval(iv); return; }
      var orig = window.WS.trackChanges;
      var wrapped = function (newData) {
        try {
          var snap = (typeof window.WS._getSnapshot === 'function')
            ? window.WS._getSnapshot() : {};
          var snapEmpty = !snap || Object.keys(snap).length === 0;
          if (snapEmpty && Array.isArray(newData) && newData.length > 0) {
            _refillBaselineSnapshot('trackChanges first-call protection');
            return [];
          }
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      try {
        Object.keys(orig).forEach(function (k) {
          try { wrapped[k] = orig[k]; } catch (e) {}
        });
      } catch (e) {}
      wrapped._v321Wrapped = true;
      window.WS.trackChanges = wrapped;
      try {
        console.log('[ws-storage-cleanup] trackChanges baseline-protection 활성 (snapshot 빈 상태 → AI 폭주 방지)');
      } catch (_) {}
      clearInterval(iv);
    }, 200);
  }

  function _installLocalStorageGuard() {
    if (window.__WS_LS_GUARDED) return;
    var origSet;
    try { origSet = Storage.prototype.setItem; }
    catch (e) { return; }
    if (typeof origSet !== 'function') return;
    Storage.prototype.setItem = function (key, value) {
      if (this !== window.localStorage) {
        return origSet.apply(this, arguments);
      }
      try {
        return origSet.call(this, key, value);
      } catch (e) {
        var isQuota = e && (
          e.name === 'QuotaExceededError' ||
          e.code === 22 || e.code === 1014 ||
          (e.name && e.name.indexOf('Quota') >= 0)
        );
        if (!isQuota) throw e;
        var result;
        try { result = _cleanupCache(key); }
        catch (cleanErr) { result = { freed: 0, details: [] }; }
        try {
          origSet.call(this, key, value);
          try {
            console.log('[ws-storage-cleanup] quota recovered for "' + key +
              '" (freed ' + Math.round(result.freed / 1024) + 'KB): ' +
              result.details.join(', '));
          } catch (_) {}
          return;
        } catch (e2) {
          throw e;
        }
      }
    };
    window.__WS_LS_GUARDED = true;
  }

  function _installToastThrottle() {
    var QUOTA_PATTERN = /저장공간이\s*부족|quota|QuotaExceeded/i;
    var attempts = 0;
    var iv = setInterval(function () {
      attempts++;
      if (attempts > 100) { clearInterval(iv); return; }
      if (!window.WS || !window.WS.showToast) return;
      if (window.WS.showToast._storageThrottled) { clearInterval(iv); return; }
      var orig = window.WS.showToast;
      var wrapped = function (message, type) {
        try {
          if (typeof message === 'string' && QUOTA_PATTERN.test(message)) {
            var now = Date.now();
            if (now - _lastQuotaToastAt < TOAST_THROTTLE_MS) {
              try { console.warn('[ws-storage-cleanup] quota toast throttled (10min)'); } catch (_) {}
              return;
            }
            _lastQuotaToastAt = now;
          }
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      try {
        Object.keys(orig).forEach(function (k) {
          try { wrapped[k] = orig[k]; } catch (e) {}
        });
      } catch (e) {}
      wrapped._storageThrottled = true;
      window.WS.showToast = wrapped;
      clearInterval(iv);
    }, 200);
  }

  // 진단 헬퍼
  window.WS = window.WS || {};
  window.WS._lsUsage = function () {
    var m = _measureLS();
    try {
      console.log('[ws-storage] 총 사용량: ' + (m.total / 1024 / 1024).toFixed(2) + ' MB');
      var rows = m.entries.map(function (e) {
        var category = SAFE_PRESERVE[e.key] ? '🔒 보호' :
                       (CLEANABLE_CACHE.indexOf(e.key) >= 0 ? '🧹 정리가능' : '❓ unknown');
        return { key: e.key, kb: Math.round(e.size / 1024), category: category };
      });
      if (console.table) console.table(rows); else console.log(rows);
    } catch (e) {}
    return m;
  };
  window.WS._lsCleanup = function () {
    var r = _cleanupCache(null);
    try {
      console.log('[ws-storage] 정리 완료: ' + Math.round(r.freed / 1024) + 'KB freed');
      if (r.details.length > 0) console.log('[ws-storage] 정리 키: ' + r.details.join(', '));
    } catch (e) {}
    return r;
  };
  window.WS._refillBaseline = function () {
    return _refillBaselineSnapshot('manual');
  };

  // 부트
  _installLocalStorageGuard();
  _installToastThrottle();
  _installTrackChangesGuard();

  setTimeout(function () {
    try {
      var m = _measureLS();
      var totalMB = m.total / 1024 / 1024;
      try {
        console.log('[ws-storage-cleanup] 현재 localStorage: ' + totalMB.toFixed(2) + 'MB');
      } catch (_) {}
      if (m.total > PRECLEANUP_THRESHOLD) {
        var r = _cleanupCache(null);
        try {
          console.log('[ws-storage-cleanup] 사전 정리 (4MB+ 도달): ' +
            Math.round(r.freed / 1024) + 'KB freed (' + r.details.join(', ') + ')');
        } catch (_) {}
        // v321b: cleanup 후 baseline 즉시 재구성
        setTimeout(function () { _refillBaselineSnapshot('post-cleanup'); }, 3000);
      }
    } catch (e) {
      try { console.warn('[ws-storage-cleanup] init diagnostic failed', e); } catch (_) {}
    }
  }, 2000);

  try {
    console.log(
      '[ws-storage-cleanup] v321b ready — quota 자동 정리 + 토스트 10분 throttle + ' +
      'trackChanges baseline 보호. 진단: window.WS._lsUsage() / _lsCleanup() / _refillBaseline()'
    );
  } catch (e) {}
})();
