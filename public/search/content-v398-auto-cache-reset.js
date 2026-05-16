/**
 * v398 — 자동 cache reset (deploy 변경 감지)
 * 사장님 명령 2026-05-15:
 *   "강제 새로고침/시크릿모드 매번 해야 되는거 좀 해결해줘"
 *
 * 동작:
 *   1. 페이지 진입 시 /api/version 호출 → 현재 commit SHA 받음
 *   2. localStorage.ws_last_deploy 와 비교
 *   3. 다르면 stale storage 자동 정리:
 *      - localStorage (사용자 데이터 제외)
 *      - sessionStorage (auth 제외)
 *      - IndexedDB (모두)
 *      - Caches API (모두)
 *      - Service Worker (unregister)
 *   4. 새 commit SHA 저장
 *   5. 5분마다 재체크 (deploy 진행 중 감지)
 *
 * 보존:
 *   - ws_token (로그인)
 *   - ws-memos (메모)
 *   - ws-contacts (연락처)
 *   - ws-favorites (관심목록)
 *   - ws_last_deploy (자기 자신)
 */
(function () {
  'use strict';
  if (window.__WS_V398_AUTO_CACHE_RESET__) return;
  window.__WS_V398_AUTO_CACHE_RESET__ = true;

  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;

  var KEEP_LOCAL = [
    'ws_token',
    'ws-token',
    'ws_last_deploy',
    'ws-memos',
    'ws-contacts',
    'ws-favorites',
    'ws-fav',
  ];

  function log() {
    try { console.log.apply(console, ['[v398-cache-reset]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  async function clearStaleStorage() {
    // 1) ws_token 백업
    var token = null;
    try { token = sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token'); } catch (_) {}

    // 2) localStorage — 보존 키 제외하고 모두 삭제
    try {
      var lsKeys = Object.keys(localStorage);
      for (var i = 0; i < lsKeys.length; i++) {
        var k = lsKeys[i];
        if (KEEP_LOCAL.indexOf(k) === -1) {
          try { localStorage.removeItem(k); } catch (_) {}
        }
      }
    } catch (_) {}

    // 3) sessionStorage 클리어 + token 복원
    // [Step 14 fix 2026-05-16] token 복원 실패 시 localStorage fallback (강제 로그아웃 방지)
    try {
      sessionStorage.clear();
      if (token) {
        try {
          sessionStorage.setItem('ws_token', token);
        } catch (e1) {
          // sessionStorage 가득 찼거나 disabled — localStorage fallback
          try { localStorage.setItem('ws_token', token); } catch (e2) {
            try { console.warn('[v398] token 복원 실패 (sessionStorage + localStorage 모두 실패):', e2 && e2.message); } catch (_) {}
          }
        }
      }
    } catch (_) {}

    // 4) IndexedDB 모두 삭제
    try {
      if (window.indexedDB && typeof indexedDB.databases === 'function') {
        var dbs = await indexedDB.databases();
        for (var j = 0; j < dbs.length; j++) {
          var db = dbs[j];
          if (db && db.name) {
            try { indexedDB.deleteDatabase(db.name); } catch (_) {}
          }
        }
      }
    } catch (_) {}

    // 5) Caches API
    try {
      if (window.caches) {
        var cacheKeys = await caches.keys();
        for (var c = 0; c < cacheKeys.length; c++) {
          try { await caches.delete(cacheKeys[c]); } catch (_) {}
        }
      }
    } catch (_) {}

    // 6) Service Worker unregister
    try {
      if (navigator.serviceWorker) {
        var regs = await navigator.serviceWorker.getRegistrations();
        for (var r = 0; r < regs.length; r++) {
          try { await regs[r].unregister(); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  function showToast(msg) {
    try {
      var t = document.createElement('div');
      t.style.cssText = [
        'position:fixed;top:80px;right:20px;z-index:99999;',
        'background:#1d1d1f;color:#fff;padding:14px 18px;border-radius:10px;',
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:600;',
        'box-shadow:0 4px 14px rgba(0,0,0,0.30);',
        'max-width:320px;line-height:1.4;'
      ].join('');
      t.innerHTML = msg;
      document.body.appendChild(t);
      setTimeout(function () { try { t.remove(); } catch (_) {} }, 6000);
    } catch (_) {}
  }

  async function checkVersion(isInitial) {
    try {
      var r = await fetch('/api/version', { cache: 'no-store' });
      if (!r.ok) return;
      var v = await r.json();
      var currentCommit = v.commitShort || (v.commit ? v.commit.slice(0, 7) : '');
      if (!currentCommit) return;

      var stored = null;
      try { stored = localStorage.getItem('ws_last_deploy'); } catch (_) {}

      if (stored === currentCommit) {
        return;
      }

      // [2026-05-15 v2 수정] 첫 방문도 stale storage 정리 (이전 세션 잔재 제거)
      //   원래 첫 방문은 정리 skip 했는데, 사장님 케이스 (오랫동안 쌓인 IDB/cache)
      //   가 그대로 남아서 시크릿모드 처럼 깨끗하게 시작 안 됨. 첫 방문도 정리해야
      //   regular Chrome 이 incognito 처럼 동작함. 사용자 데이터 (token/memos/contacts/favorites)
      //   는 KEEP_LOCAL 로 보존되므로 안전.
      var isFirstVisit = !stored;
      log(isFirstVisit ? 'first visit — clearing legacy stale storage' :
          'NEW DEPLOY detected: ' + stored + ' → ' + currentCommit + ' — clearing stale storage');

      await clearStaleStorage();
      try { localStorage.setItem('ws_last_deploy', currentCommit); } catch (_) {}

      if (!isInitial && !isFirstVisit) {
        showToast(
          '🆕 새 버전 감지<br>' +
          '<span style="font-weight:400;font-size:12px;color:#a1a1a6;">' +
          stored + ' → ' + currentCommit + '<br>' +
          '캐시 자동 정리 완료. 페이지 새로고침 권장.</span>'
        );
      }
    } catch (e) {
      log('check failed:', e && e.message);
    }
  }

  checkVersion(true);
  setInterval(function () { checkVersion(false); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) checkVersion(false);
  });

  log('v398 installed — auto cache reset on deploy change');
})();
