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
 * 콘솔 진단:
 *   window.WS._lsUsage()    → 현재 키별 사용량 표시
 *   window.WS._lsCleanup()  → 수동 cleanup 실행
 *
 * INVARIANT (CLAUDE.md):
 *   - SAFE_PRESERVE 키는 어떤 경우에도 삭제 X
 *   - CLEANABLE_CACHE 키만 quota 시 자동 정리 (재생성됨)
 *   - 매물 데이터는 localStorage X (DB + memory)
 */
(function () {
  'use strict';

  // /search 전용
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // ────────────────────────────────────────────────
  // 키 분류
  // ────────────────────────────────────────────────
  // 사장님 데이터 — 절대 삭제 X
  var SAFE_PRESERVE = {
    'ws-favorites': 1,         // 즐겨찾기 매물
    'ws-memos': 1,             // 메모
    'ws-contacts': 1,          // 연락처
    'ws_customer_folders': 1,  // 고객 폴더
    'ws_filter_presets': 1,    // 필터 프리셋
    'ws_dark_mode': 1,         // 다크모드
    'ws_dark_auto': 1,
    'ws_customer_prefs': 1,
    'ws_fav_categories': 1,
    'ws_noti_settings': 1,     // 알림 설정
    'ws_token': 1,             // 인증
    'ws_user': 1,
    'ws_login_time': 1,
    'ws_refresh_token': 1,
    'ws-search-history': 1,    // 검색 기록 (사장님 작업 흔적)
    'ws_autorefresh_min': 1,
    'wp-pal-frecent': 1,       // 자주 쓰는 명령
  };

  // 변동 감지 캐시 — 자동 정리 가능 (다음 새로고침 시 자동 재생성)
  var CLEANABLE_CACHE = [
    'ws_data_snapshot',     // trackChanges 변동 감지 (가장 큼)
    'ws_price_snapshots',   // _autoSnapshot 가격 변동 (가장 큼)
    'ws_changelog',         // 변경 로그 (200 cap)
    'ws_alerts',            // 알림 (자동 갱신)
    'ws_alert_log_v1',      // 알림 로그 (200 cap)
    'ws_alert_log_unread_v1', // 미확인 카운트
  ];

  var TOAST_THROTTLE_MS = 10 * 60 * 1000;   // 토스트 10분 1회만
  var PRECLEANUP_THRESHOLD = 4 * 1024 * 1024; // 4MB 도달 시 사전 cleanup

  var _lastQuotaToastAt = 0;

  // ────────────────────────────────────────────────
  // 사용량 측정
  // ────────────────────────────────────────────────
  function _byteSize(s) {
    try { return new Blob([s == null ? '' : s]).size; }
    catch (e) { return (s == null ? 0 : String(s).length * 2); }
  }
  function _measureLS() {
    var entries = [];
    var total = 0;
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

  // ────────────────────────────────────────────────
  // 자동 cleanup — quota 발생 또는 사전 임계 도달 시
  // ────────────────────────────────────────────────
  function _cleanupCache(triggerKey) {
    var freed = 0;
    var details = [];

    // Phase 1: 변동 감지 캐시 정리 (트리거 키 제외 — 본인 자체는 마지막에)
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

    // Phase 2: 트리거 키 자체도 정리 (cleanable 인 경우만)
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

    // Phase 3: unknown 큰 키 (>= 500KB) — 사장님 데이터 아니면 정리
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

  // ────────────────────────────────────────────────
  // localStorage.setItem prototype 가로채기
  //   → quota 시 자동 cleanup + 재시도
  //   → cleanup 으로 복구되면 throw X (조용히 통과)
  //   → cleanup 후에도 실패 시 원 에러 throw (caller catch 동작 보존)
  // ────────────────────────────────────────────────
  function _installLocalStorageGuard() {
    if (window.__WS_LS_GUARDED) return;

    var origSet;
    try { origSet = Storage.prototype.setItem; }
    catch (e) { return; }
    if (typeof origSet !== 'function') return;

    Storage.prototype.setItem = function (key, value) {
      // localStorage 만 가로채고 sessionStorage 는 통과
      if (this !== window.localStorage) {
        return origSet.apply(this, arguments);
      }
      try {
        return origSet.call(this, key, value);
      } catch (e) {
        var isQuota = e && (
          e.name === 'QuotaExceededError' ||
          e.code === 22 ||
          e.code === 1014 ||  // Firefox NS_ERROR_DOM_QUOTA_REACHED
          (e.name && e.name.indexOf('Quota') >= 0)
        );
        if (!isQuota) throw e;

        // 자동 cleanup
        var result;
        try { result = _cleanupCache(key); }
        catch (cleanErr) { result = { freed: 0, details: [] }; }

        // 재시도
        try {
          origSet.call(this, key, value);
          try {
            console.log('[ws-storage-cleanup] quota recovered for "' + key +
              '" (freed ' + Math.round(result.freed / 1024) + 'KB): ' +
              result.details.join(', '));
          } catch (_) {}
          return; // success — 토스트 없음
        } catch (e2) {
          // cleanup 후에도 실패 → 원 에러 throw (caller _safeSetItem catch 동작)
          // 토스트 throttle 은 _installToastThrottle 에서 처리
          throw e;
        }
      }
    };

    window.__WS_LS_GUARDED = true;
  }

  // ────────────────────────────────────────────────
  // showToast 래핑 — quota 메시지만 10분 throttle
  //   v293-alert-log.js wrapper 위에 또 wrap (outer)
  //   → throttle 통과 못한 토스트는 alert log 에도 push 안 됨
  // ────────────────────────────────────────────────
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
              // throttle — 조용히 swallow (alert log 에도 push 안 됨)
              try {
                console.warn('[ws-storage-cleanup] quota toast throttled (10min)');
              } catch (_) {}
              return;
            }
            _lastQuotaToastAt = now;
          }
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      // v293 wrapper 의 _alertWrapped 등 속성 복사 (재 wrap 방지)
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

  // ────────────────────────────────────────────────
  // 진단 헬퍼 (콘솔용)
  // ────────────────────────────────────────────────
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
      if (console.table) console.table(rows);
      else console.log(rows);
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

  // ────────────────────────────────────────────────
  // 부트
  // ────────────────────────────────────────────────
  _installLocalStorageGuard();
  _installToastThrottle();

  // 페이지 로드 후 진단 + 임계 도달 시 사전 cleanup
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
      }
    } catch (e) {
      try { console.warn('[ws-storage-cleanup] init diagnostic failed', e); } catch (_) {}
    }
  }, 2000);

  try {
    console.log(
      '[ws-storage-cleanup] v321 ready — ' +
      'quota 자동 정리 + 토스트 10분 throttle. ' +
      '진단: window.WS._lsUsage() / 수동 정리: window.WS._lsCleanup()'
    );
  } catch (e) {}
})();
