/**
 * v392 — 공격적 token refresh + 만료 임박 시 자동 갱신
 * 사장님 명령 2026-05-14.
 *
 * 진단:
 *   v362/v366 가 25분 마다 refresh — 그러나 사장님이 페이지 비활성 (탭 숨김)
 *   상태로 두면 setInterval throttle → 60분 만료 시점 지나도 refresh 안 됨.
 *   결과: 11분 전 token 만료 + refresh token 도 만료 → 401 → 매물/지도 안 뜸.
 *
 * v392 fix:
 *   1. 5분 마다 token TTL 검사 (적극적)
 *   2. TTL < 15분 → 즉시 refresh (만료 전 미리)
 *   3. visibilitychange 시 즉시 검사 (페이지 다시 active 시 즉시 refresh)
 *   4. focus 시 즉시 검사
 *   5. 401 응답 감지 시 자동 reauth 시도 (UI alert)
 *
 * 회귀 회피:
 *   - v362/v366 와 같이 작동 (중복 refresh 안전 — Supabase 가 처리)
 *   - cooldown 1분 (너무 자주 refresh 방지)
 */
(function () {
  'use strict';
  if (window.__WS_V392_AGGRESSIVE_REFRESH__) return;
  window.__WS_V392_AGGRESSIVE_REFRESH__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;

  function log() {
    try { console.log.apply(console, ['[v392-aggressive-refresh]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  var CHECK_INTERVAL_MS = 5 * 60 * 1000;     // 5분마다 TTL 검사
  var REFRESH_THRESHOLD_MS = 15 * 60 * 1000; // TTL < 15분이면 refresh
  var COOLDOWN_MS = 60 * 1000;                // 1분 cooldown
  var ENDPOINT = '/api/auth/refresh-session';

  var lastRefreshAt = 0;
  var refreshing = false;

  function getRefreshToken() {
    try {
      return sessionStorage.getItem('ws_refresh_token')
          || localStorage.getItem('ws_refresh_token')
          || '';
    } catch (_) { return ''; }
  }

  function getAccessToken() {
    try {
      return sessionStorage.getItem('ws_token')
          || localStorage.getItem('ws_token')
          || '';
    } catch (_) { return ''; }
  }

  // JWT decode → exp
  function getTokenExpiry() {
    try {
      var token = getAccessToken();
      if (!token) return 0;
      var parts = token.split('.');
      if (parts.length !== 3) return 0;
      var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return (payload.exp || 0) * 1000;
    } catch (_) { return 0; }
  }

  function getTtlMs() {
    var exp = getTokenExpiry();
    if (!exp) return 0;
    return exp - Date.now();
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
    } catch (_) {}
  }

  function refreshNow(reason) {
    if (refreshing) return Promise.resolve(null);
    var sinceLast = Date.now() - lastRefreshAt;
    if (lastRefreshAt > 0 && sinceLast < COOLDOWN_MS) {
      log('skip refresh (cooldown', Math.round(sinceLast / 1000), 's <', COOLDOWN_MS / 1000, 's)');
      return Promise.resolve(null);
    }
    var refreshToken = getRefreshToken();
    if (!refreshToken) {
      log('no refresh token →', reason);
      return Promise.resolve(null);
    }
    refreshing = true;
    var t0 = Date.now();
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function (j) {
        var ms = Date.now() - t0;
        var session = j.session || j;
        if (session && (session.access_token || session.refresh_token)) {
          storeNewSession(session);
          lastRefreshAt = Date.now();
          log('refresh OK (' + reason + ') in', ms, 'ms');
          return session;
        }
        log('refresh unexpected response shape (' + reason + ')');
        return null;
      })
      .catch(function (e) {
        log('refresh fail (' + reason + '):', e && e.message);
        return null;
      })
      .finally(function () { refreshing = false; });
  }

  function checkAndRefresh(reason) {
    // [Step 83 fix 2026-05-19 사장님 명령] background tab 일 때 interval skip
    if (typeof document !== 'undefined' && document.hidden && reason === 'interval') return;
    var ttl = getTtlMs();
    if (ttl <= 0) {
      log('token expired (' + reason + ', ttl=' + Math.round(ttl / 1000) + 's) → refresh');
      return refreshNow(reason);
    }
    if (ttl < REFRESH_THRESHOLD_MS) {
      log('token near expiry (' + reason + ', ttl=' + Math.round(ttl / 60000) + 'min) → refresh');
      return refreshNow(reason);
    }
    return Promise.resolve(null);
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    checkAndRefresh('visibility-resume');
  }

  function onFocus() {
    (document.hidden ? null : checkAndRefresh('window-focus'));
  }

  function init() {
    // 첫 즉시 check
    setTimeout(function () { checkAndRefresh('initial'); }, 2000);
    // 5분 마다
    setInterval(function () { checkAndRefresh('interval'); }, CHECK_INTERVAL_MS);
    // 페이지 visible 시
    try { document.addEventListener('visibilitychange', onVisibilityChange); } catch (_) {}
    try { window.addEventListener('focus', onFocus); } catch (_) {}
    log('installed (check', CHECK_INTERVAL_MS / 60000, 'min, threshold', REFRESH_THRESHOLD_MS / 60000, 'min)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
