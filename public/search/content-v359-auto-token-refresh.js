/**
 * v359 — Auto token refresh on 401 (사장님 명령 2026-05-12)
 *
 * 진단 (Supabase auth logs):
 *   직원 PC: refresh_token_already_used 에러 다수 (status 400) + Possible abuse attempt.
 *   원인: multi-tab race condition 으로 같은 refresh_token 이 동시에 사용됨.
 *   결과: 새 JWT 못 받음 → stale token 으로 admin endpoint 호출 → 401.
 *   사장님 사이트의 직원 사진 업로드 / 매물 수정 시 무한 401 반복.
 *
 * 목적:
 *   admin / listings endpoint 401 받으면 자동으로:
 *     1. /api/auth/refresh-session 호출 (refresh_token 사용)
 *     2. 새 access_token + refresh_token 받음
 *     3. localStorage / sessionStorage 업데이트
 *     4. 원 요청 retry
 *   mutex 로 multi-call race 회피 (1번만 refresh).
 *
 * 회귀 회피:
 *   - 새 파일 → 기존 patch 안 건드림
 *   - 401 케이스만 처리 (다른 status 영향 X)
 *   - mutex 로 동시 refresh 1번 보장
 *   - refresh fail 시 silent (원 401 그대로 반환 → 기존 동작)
 *   - 사용 안 되면 prod 영향 0
 *
 * 안전 가드:
 *   - retry 1번만 (무한 loop 회피)
 *   - try/catch 로 모든 fetch 안전
 *   - refresh_token 없으면 skip
 */
(function () {
  'use strict';
  if (window.__WS_V359_AUTO_REFRESH__) return;
  window.__WS_V359_AUTO_REFRESH__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;

  var DEBUG = true;
  var refreshingPromise = null;  // mutex: 동시 refresh 1번만
  var refreshedTokens = { count: 0, retried: 0, failed: 0 };

  function log() {
    if (!DEBUG) return;
    var args = ['[v359-auto-refresh]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function getRefreshToken() {
    try {
      // 사장님 사이트의 가능한 refresh_token 저장 위치 (여러 keys 시도)
      var candidates = [
        sessionStorage.getItem('ws_refresh_token'),
        localStorage.getItem('ws_refresh_token'),
        sessionStorage.getItem('refresh_token'),
        localStorage.getItem('refresh_token'),
      ];
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i] && candidates[i].length > 10) return candidates[i];
      }
      // Supabase v2 standard storage key
      var keys = Object.keys(localStorage).filter(function (k) { return /^sb-.*-auth-token$/.test(k); });
      for (var j = 0; j < keys.length; j++) {
        try {
          var v = JSON.parse(localStorage.getItem(keys[j]));
          if (v && v.refresh_token) return v.refresh_token;
        } catch (e) {}
      }
      return '';
    } catch (e) { return ''; }
  }

  function setTokens(access, refresh) {
    try {
      if (access) {
        sessionStorage.setItem('ws_token', access);
        localStorage.setItem('ws_token', access);
      }
      if (refresh) {
        sessionStorage.setItem('ws_refresh_token', refresh);
        localStorage.setItem('ws_refresh_token', refresh);
      }
      // Supabase v2 standard key 도 업데이트
      try {
        var keys = Object.keys(localStorage).filter(function (k) { return /^sb-.*-auth-token$/.test(k); });
        for (var i = 0; i < keys.length; i++) {
          var v = JSON.parse(localStorage.getItem(keys[i]));
          if (v) {
            if (access) v.access_token = access;
            if (refresh) v.refresh_token = refresh;
            if (access) {
              // Decode JWT exp for expires_at
              try {
                var payload = JSON.parse(atob(access.split('.')[1]));
                if (payload.exp) v.expires_at = payload.exp;
              } catch (e) {}
            }
            localStorage.setItem(keys[i], JSON.stringify(v));
          }
        }
      } catch (e) {}
    } catch (e) {}
  }

  var origFetch = window.fetch;
  if (typeof origFetch !== 'function') return;

  async function refreshSession() {
    if (refreshingPromise) return refreshingPromise;
    refreshingPromise = (async function () {
      var rt = getRefreshToken();
      if (!rt) {
        log('refresh skip — no refresh_token');
        return null;
      }
      try {
        var r = await origFetch('/api/auth/refresh-session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (!r.ok) {
          log('refresh failed status=' + r.status);
          refreshedTokens.failed++;
          return null;
        }
        var d = await r.json();
        if (d && d.success && d.access_token) {
          setTokens(d.access_token, d.refresh_token);
          refreshedTokens.count++;
          log('token refreshed #' + refreshedTokens.count + ' (expires_in=' + (d.expires_in || '?') + ')');
          return d.access_token;
        }
        refreshedTokens.failed++;
        return null;
      } catch (e) {
        refreshedTokens.failed++;
        log('refresh error:', e && e.message);
        return null;
      }
    })();
    refreshingPromise.finally(function () {
      setTimeout(function () { refreshingPromise = null; }, 500);
    });
    return refreshingPromise;
  }

  window.fetch = async function (input, init) {
    var response;
    try {
      response = await origFetch.call(this, input, init);
    } catch (e) {
      throw e;
    }
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var method = ((init && init.method) || 'GET').toUpperCase();
      // /api/admin/* OR /api/listings/* 401 + retry 안 한 요청만
      var isTargetUrl = /\/api\/(admin\/|listings\/)/.test(url);
      var alreadyRetried = init && init.__v359_retried;
      if (response.status === 401 && isTargetUrl && !alreadyRetried) {
        var newToken = await refreshSession();
        if (newToken) {
          // Retry with new token
          var newInit = Object.assign({}, init || {});
          var headers = Object.assign({}, (init && init.headers) || {});
          headers['Authorization'] = 'Bearer ' + newToken;
          newInit.headers = headers;
          newInit.__v359_retried = true;  // prevent infinite loop
          refreshedTokens.retried++;
          log('retry #' + refreshedTokens.retried + ' after 401: ' + url.substring(0, 100));
          return await origFetch.call(this, input, newInit);
        }
      }
    } catch (e) {}
    return response;
  };

  // Periodic stats log (debug)
  setInterval(function () {
    if (refreshedTokens.count > 0 || refreshedTokens.retried > 0 || refreshedTokens.failed > 0) {
      log('stats: refreshed=' + refreshedTokens.count + ' retried=' + refreshedTokens.retried + ' failed=' + refreshedTokens.failed);
    }
  }, 60000);

  log('installed (auto refresh on 401 for /api/admin and /api/listings)');
})();
