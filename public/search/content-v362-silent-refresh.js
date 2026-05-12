/**
 * v362 — Silent token refresh (proactive)
 * 사장님 명령 2026-05-12.
 *
 * 배경:
 *   v359 자동 retry-on-401 patch 가 v294-scope fetch wrap 과 RangeError 충돌 → unregister.
 *   그 결과 자동 token 갱신 메커니즘 부재 → 직원 PC token 자연 만료 시 401 → 로그아웃.
 *
 * 동작 (v359 와 다른 접근):
 *   - fetch wrap 안 함 (v294 충돌 회피).
 *   - 매 25분 setInterval 로 /api/auth/refresh-session 호출 — proactive, 만료 전 미리 갱신.
 *   - 페이지 첫 로드 시: ws_login_time 기준 30분 이상 경과 시 즉시 한 번 refresh.
 *   - tab visible 으로 돌아왔을 때 마지막 refresh 후 25분 이상 경과 시 즉시 refresh.
 *   - 401/실패 silent — 진짜 만료된 session 은 사용자 reload 시 자연스럽게 로그인 화면.
 *
 * 결과:
 *   - 한 번 로그인 후 영구 세션 (사용자 모르게 background 갱신).
 *   - 매물 작업 중 갑자기 로그아웃 안 됨.
 *
 * 회귀 회피 (v359 RangeError 교훈):
 *   - fetch wrap 0 → v294-scope wrappedFetch 와 충돌 X.
 *   - setInterval + plain fetch.
 *   - 401/실패 시 retry/wrap 안 함 — 무한 루프 회피.
 */
(function () {
  'use strict';
  if (window.__WS_V362_SILENT_REFRESH__) return;
  window.__WS_V362_SILENT_REFRESH__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var REFRESH_INTERVAL_MS = 25 * 60 * 1000;
  var FIRST_CHECK_DELAY_MS = 10 * 1000;
  var COOLDOWN_MS = 5 * 60 * 1000;
  var STALE_LOGIN_MIN = 30;
  var ENDPOINT = '/api/auth/refresh-session';

  var refreshing = false;
  var lastRefreshAt = 0;
  var refreshCount = 0;

  function log() {
    if (!DEBUG) return;
    var args = ['[v362-silent-refresh]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function getRefreshToken() {
    try {
      return sessionStorage.getItem('ws_refresh_token')
          || localStorage.getItem('ws_refresh_token')
          || '';
    } catch (_) { return ''; }
  }

  function storeNewSession(j) {
    try {
      if (j.access_token) {
        try { sessionStorage.setItem('ws_token', j.access_token); } catch (_) {}
        try { localStorage.setItem('ws_token', j.access_token); } catch (_) {}
      }
      if (j.refresh_token) {
        try { sessionStorage.setItem('ws_refresh_token', j.refresh_token); } catch (_) {}
        try { localStorage.setItem('ws_refresh_token', j.refresh_token); } catch (_) {}
      }
      try { localStorage.setItem('ws_login_time', String(Date.now())); } catch (_) {}
    } catch (e) {
      log('storeNewSession err:', e && e.message);
    }
  }

  async function refreshOnce(reason) {
    if (refreshing) return;
    var sinceLast = Date.now() - lastRefreshAt;
    if (lastRefreshAt > 0 && sinceLast < COOLDOWN_MS) return;

    var refreshToken = getRefreshToken();
    if (!refreshToken) {
      log('skip: no refresh_token in storage');
      return;
    }

    refreshing = true;
    refreshCount++;
    var t0 = Date.now();
    try {
      var r = await fetch(ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      var ms = Date.now() - t0;
      if (!r.ok) {
        log('refresh #' + refreshCount + ' (' + reason + ') failed:', r.status, 'in', ms, 'ms');
        return;
      }
      var j = await r.json();
      if (j && (j.access_token || j.session)) {
        var session = j.session || j;
        storeNewSession(session);
        lastRefreshAt = Date.now();
        log('refresh #' + refreshCount + ' (' + reason + ') OK in', ms, 'ms');
      } else {
        log('refresh #' + refreshCount + ' (' + reason + ') unexpected response shape');
      }
    } catch (e) {
      log('refresh #' + refreshCount + ' (' + reason + ') err:', e && e.message);
    } finally {
      refreshing = false;
    }
  }

  function firstCheck() {
    try {
      var loginTime = parseInt(localStorage.getItem('ws_login_time') || '0', 10);
      if (loginTime > 0) {
        var elapsedMin = (Date.now() - loginTime) / 60000;
        if (elapsedMin >= STALE_LOGIN_MIN) {
          log('first check: login was', Math.round(elapsedMin), 'min ago → refresh');
          refreshOnce('stale-on-load');
          return;
        }
        log('first check: login was', Math.round(elapsedMin), 'min ago → skip (fresh)');
      } else {
        log('first check: no login_time marker → skip');
      }
    } catch (e) {
      log('firstCheck err:', e && e.message);
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    var sinceLast = Date.now() - lastRefreshAt;
    if (lastRefreshAt === 0 || sinceLast >= REFRESH_INTERVAL_MS) {
      log('visibility → visible, last refresh', Math.round(sinceLast / 60000), 'min ago → refresh');
      refreshOnce('visibility-resume');
    }
  }

  function init() {
    setTimeout(firstCheck, FIRST_CHECK_DELAY_MS);
    setInterval(function () { refreshOnce('interval'); }, REFRESH_INTERVAL_MS);
    try { document.addEventListener('visibilitychange', onVisibilityChange); } catch (_) {}
    log('installed (interval', REFRESH_INTERVAL_MS / 60000, 'min, cooldown',
        COOLDOWN_MS / 60000, 'min, stale threshold', STALE_LOGIN_MIN, 'min)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
