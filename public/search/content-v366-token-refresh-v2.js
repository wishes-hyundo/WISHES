/**
 * v366 — Silent token refresh v2 (sb-xxx-auth-token 포함 전체 동기화)
 * 사장님 명령 2026-05-12.
 *
 * 배경 (v362 v1 의 한계):
 *   - v362 v1 은 /api/auth/refresh-session 호출 후 ws_token / ws_refresh_token 만 갱신.
 *   - localStorage 의 sb-<projref>-auth-token (Supabase native session JSON) 은 그대로.
 *   - 결과: 사장님 재로그인 직후에도 sb-xxx-auth-token 만료 (-4.2 시간) 상태.
 *     verifyAdminAuth 의 supabase.auth.getUser(token) 검증은 ws_token 으로 통과하지만,
 *     일부 서버 코드 (특히 작업 진행 중 timeout 이후) 가 stale sb-xxx-auth-token 을
 *     읽으면 401 으로 보임.
 *
 * v2 변경:
 *   - sb-<projref>-auth-token 의 access_token / refresh_token / expires_at / expires_in
 *     모두 새 session 으로 교체.
 *   - ws_token, ws_refresh_token, ws_login_time 동시 갱신.
 *   - 주기: 25분 interval + visibility resume + 첫 로드 시 stale 검사 (30분 이상).
 *
 * 회귀 회피 (v362 / v359 RangeError 교훈):
 *   - fetch wrap 0 → v294-scope wrappedFetch 와 충돌 X.
 *   - setInterval + plain fetch.
 *   - 401/실패 시 retry/wrap 안 함 — 무한 루프 회피.
 *   - 새 파일 → 기존 patch 안 건드림.
 *
 * 안전 가드:
 *   - refreshing mutex (concurrent refresh 회피).
 *   - cooldown: 마지막 refresh 후 최소 5분.
 *   - refresh_token 없으면 silent skip.
 *   - sb 키 없으면 sb 갱신 skip (ws 만 갱신).
 *   - 401 = 진짜 expired session → silent (사용자 reload 시 자연 로그인).
 */
(function () {
  'use strict';
  if (window.__WS_V366_TOKEN_REFRESH_V2__) return;
  window.__WS_V366_TOKEN_REFRESH_V2__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var REFRESH_INTERVAL_MS = 10 * 60 * 1000; // [2026-05-14 사장님] 25 → 10분    // 25분
  var FIRST_CHECK_DELAY_MS = 10 * 1000;        // 10초 후 첫 체크
  var COOLDOWN_MS = 5 * 60 * 1000;             // refresh 간 최소 5분
  var STALE_LOGIN_MIN = 5; // [2026-05-14 사장님] 30 → 5분                    // login 후 30분 지났으면 첫 즉시 refresh
  var ENDPOINT = '/api/auth/refresh-session';

  var refreshing = false;
  var lastRefreshAt = 0;
  var refreshCount = 0;

  function log() {
    if (!DEBUG) return;
    var args = ['[v366-token-refresh-v2]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function getRefreshToken() {
    try {
      // 1순위: sb-<projref>-auth-token 의 refresh_token (Supabase native, 정확함)
      var sbKey = findSbKey();
      if (sbKey) {
        var raw = localStorage.getItem(sbKey);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.refresh_token) return parsed.refresh_token;
        }
      }
    } catch (_) {}
    // 2순위: ws_refresh_token (v362 v1 fallback)
    try {
      return sessionStorage.getItem('ws_refresh_token')
          || localStorage.getItem('ws_refresh_token')
          || '';
    } catch (_) {}
    return '';
  }

  function findSbKey() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') > 0) return k;
      }
    } catch (_) {}
    return null;
  }

  function storeNewSession(j) {
    // j 는 refresh-session endpoint 응답 — { access_token, refresh_token, expires_in, expires_at }
    try {
      // 1) ws_token / ws_refresh_token 갱신 (Bearer 헤더 사용)
      if (j.access_token) {
        try { sessionStorage.setItem('ws_token', j.access_token); } catch (_) {}
        try { localStorage.setItem('ws_token', j.access_token); } catch (_) {}
      }
      if (j.refresh_token) {
        try { sessionStorage.setItem('ws_refresh_token', j.refresh_token); } catch (_) {}
        try { localStorage.setItem('ws_refresh_token', j.refresh_token); } catch (_) {}
      }
      // 2) ws_login_time marker — silent refresh 도 fresh login 으로 간주
      try { localStorage.setItem('ws_login_time', String(Date.now())); } catch (_) {}

      // 3) **핵심**: sb-<projref>-auth-token (Supabase native session JSON) 갱신
      var sbKey = findSbKey();
      if (sbKey) {
        try {
          var raw = localStorage.getItem(sbKey);
          var parsed = raw ? JSON.parse(raw) : {};
          // Supabase 세션 JSON 형식 유지 — access_token / refresh_token / expires_in / expires_at / token_type / user
          if (j.access_token) parsed.access_token = j.access_token;
          if (j.refresh_token) parsed.refresh_token = j.refresh_token;
          if (typeof j.expires_in === 'number') parsed.expires_in = j.expires_in;
          if (typeof j.expires_at === 'number') parsed.expires_at = j.expires_at;
          parsed.token_type = parsed.token_type || 'bearer';
          localStorage.setItem(sbKey, JSON.stringify(parsed));
          log('sb session updated (key=' + sbKey + ', new expires_at=' + parsed.expires_at + ')');
        } catch (e) {
          log('sb session update err:', e && e.message);
        }
      } else {
        log('sb key 없음 — ws 만 갱신');
      }
    } catch (e) {
      log('storeNewSession err:', e && e.message);
    }
  }

  async function refreshOnce(reason) {
    if (refreshing) return;
    var sinceLast = Date.now() - lastRefreshAt;
    if (lastRefreshAt > 0 && sinceLast < COOLDOWN_MS) {
      return;
    }

    var refreshToken = getRefreshToken();
    if (!refreshToken) {
      log('skip: no refresh_token');
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
        // 401 = real session expired — silent.
        return;
      }
      var j = await r.json();
      if (j && j.success && j.access_token) {
        storeNewSession(j);
        lastRefreshAt = Date.now();
        var ttlSec = j.expires_at ? (j.expires_at - Math.floor(Date.now()/1000)) : null;
        log('refresh #' + refreshCount + ' (' + reason + ') OK in', ms, 'ms (ttl=' + ttlSec + 's)');
      } else {
        log('refresh #' + refreshCount + ' (' + reason + ') unexpected response');
      }
    } catch (e) {
      log('refresh #' + refreshCount + ' (' + reason + ') err:', e && e.message);
    } finally {
      refreshing = false;
    }
  }

  function firstCheck() {
    try {
      // sb-xxx-auth-token expires_at 기준 stale 검사 (정확)
      var sbKey = findSbKey();
      if (sbKey) {
        var raw = localStorage.getItem(sbKey);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed.expires_at === 'number') {
            var ttlSec = parsed.expires_at - Math.floor(Date.now()/1000);
            if (ttlSec < 600) {
              // 10분 이하 또는 이미 만료 → 즉시 refresh
              log('first check: sb token ttl=' + ttlSec + 's → refresh');
              refreshOnce('sb-stale-on-load');
              return;
            }
            log('first check: sb token ttl=' + ttlSec + 's → fresh');
            return;
          }
        }
      }
      // Fallback: ws_login_time 기준
      var loginTime = parseInt(localStorage.getItem('ws_login_time') || '0', 10);
      if (loginTime > 0) {
        var elapsedMin = (Date.now() - loginTime) / 60000;
        if (elapsedMin >= STALE_LOGIN_MIN) {
          log('first check: login was', Math.round(elapsedMin), 'min ago → refresh');
          refreshOnce('login-stale-on-load');
        }
      }
    } catch (e) {
      log('firstCheck err:', e && e.message);
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    var sinceLast = Date.now() - lastRefreshAt;
    if (lastRefreshAt === 0 || sinceLast >= REFRESH_INTERVAL_MS) {
      log('visibility → visible (last refresh ' + Math.round(sinceLast/60000) + ' min ago) → check stale');
      // visibility 복귀 시 stale 검사 (sb 토큰 expires_at 보고 판단)
      firstCheck();
    }
  }

  function init() {
    setTimeout(firstCheck, FIRST_CHECK_DELAY_MS);
    setInterval(function () { refreshOnce('interval'); }, REFRESH_INTERVAL_MS);
    try { document.addEventListener('visibilitychange', onVisibilityChange); } catch (_) {}
    log('installed v2 (interval', REFRESH_INTERVAL_MS / 60000, 'min, cooldown',
        COOLDOWN_MS / 60000, 'min)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
