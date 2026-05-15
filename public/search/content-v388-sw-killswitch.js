/**
 * v388 — Service Worker 강제 제거 + cache 삭제 (모바일 reload 원인 차단)
 * 사장님 명령 2026-05-14.
 *
 * 진단:
 *   - public/sw.js (v4.0.0) 가 activate 시 client.navigate(client.url) 호출
 *     → 모바일 첫 진입 시 자동 reload (예전 PWA cache 죽이려는 의도였지만)
 *   - 사장님 모바일에 옛 SW 가 등록된 상태로 남아있을 가능성
 *   - 또한 caches API 의 옛 cache 가 stale data 응답 → 빈 화면
 *
 * v388 fix (사장님 모바일 강제 cleanup):
 *   1. navigator.serviceWorker.getRegistrations() → 모든 SW 강제 unregister
 *   2. caches.keys() → 모든 cache 삭제
 *   3. 한 번만 실행 (localStorage flag 로 중복 방지)
 *   4. 작업 완료 후 console log (사장님 모바일 진단 가능)
 */
(function () {
  'use strict';
  if (window.__WS_V388_SW_KILL__) return;
  window.__WS_V388_SW_KILL__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;

  // 한 번만 실행 (재실행 방지)
  var FLAG_KEY = 'ws_v388_sw_killed_at';
  try {
    var lastKilled = parseInt(localStorage.getItem(FLAG_KEY) || '0', 10);
    var oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (lastKilled > oneDayAgo) {
      // 24시간 안에 이미 cleanup → skip
      return;
    }
  } catch (_) {}

  function killAll() {
    var promises = [];

    // 1. 모든 SW unregister
    if ('serviceWorker' in navigator) {
      try {
        promises.push(
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            var killed = 0;
            return Promise.all(regs.map(function (r) {
              return r.unregister().then(function () { killed++; });
            })).then(function () {
              if (killed > 0) {
                try { console.log('[v388] unregistered', killed, 'service workers'); } catch (_) {}
              }
            });
          }).catch(function () {})
        );
      } catch (_) {}
    }

    // 2. 모든 cache 삭제
    if ('caches' in window) {
      try {
        promises.push(
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
              return caches.delete(k);
            })).then(function () {
              if (keys.length > 0) {
                try { console.log('[v388] deleted', keys.length, 'caches'); } catch (_) {}
              }
            });
          }).catch(function () {})
        );
      } catch (_) {}
    }

    return Promise.all(promises).then(function () {
      try { localStorage.setItem(FLAG_KEY, String(Date.now())); } catch (_) {}
      try { console.log('[v388-sw-killswitch] cleanup complete'); } catch (_) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', killAll);
  } else {
    killAll();
  }
})();
