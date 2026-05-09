/**
 * content-v337-cookie-issue.js (2026-05-10)
 *
 * Step T (사장님 명령 — 1분 로딩 fix):
 *   /search 페이지 로드 시 /api/auth/cookie-issue POST → ws_session HttpOnly 쿠키 발급.
 *   이후 모든 /api/admin/listings GET 요청에 ws_session 동반 →
 *   middleware Step T strip 가 Authorization 헤더 제거 →
 *   Vercel CDN 의 cacheable response criteria "Request doesn't contain Authorization header" 충족 →
 *   두 번째 새로고침부터 x-vercel-cache: HIT < 100ms.
 *
 * INVARIANT (I-CDN-1, 2026-05-10):
 *   /api/admin/listings GET 의 Authorization 헤더는 Vercel CDN BYPASS 의 단독 원인.
 */
(function () {
  'use strict';

  if (location.pathname.indexOf('/search') !== 0) return;
  if (window.__WS_V337_COOKIE_ISSUE__) return;
  window.__WS_V337_COOKIE_ISSUE__ = true;

  function isJwtLike(s) {
    return !!s && typeof s === 'string' && s.indexOf('eyJ') === 0 && s.split('.').length === 3;
  }

  function getCookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|;\s*)' + name + '=([^;]+)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (_) { return ''; }
  }

  function stripBridgePrefix(s) {
    if (!s || typeof s !== 'string') return s;
    while (s.indexOf('admin_bridge_') === 0) s = s.slice('admin_bridge_'.length);
    return s;
  }

  function getAccessToken() {
    try {
      var t = '';
      try { t = sessionStorage.getItem('ws_token') || ''; } catch (_) {}
      if (!t) { try { t = localStorage.getItem('ws_token') || ''; } catch (_) {} }
      var bare = stripBridgePrefix(t);
      if (isJwtLike(bare)) return bare;

      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || !/^sb-.*-auth-token$/.test(k)) continue;
        var raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          var o = JSON.parse(raw);
          var at = o && (o.access_token || (o.currentSession && o.currentSession.access_token));
          if (isJwtLike(at)) return at;
        } catch (_) {
          if (isJwtLike(raw)) return raw;
        }
      }
    } catch (_) {}
    return '';
  }

  var DONE_KEY = 'ws_v337_cookie_issued_at';
  var THROTTLE_MS = 30 * 60 * 1000;

  function shouldThrottle() {
    try {
      var last = parseInt(sessionStorage.getItem(DONE_KEY) || '0', 10) || 0;
      if (last && (Date.now() - last) < THROTTLE_MS) return true;
    } catch (_) {}
    return false;
  }

  function markDone() {
    try { sessionStorage.setItem(DONE_KEY, String(Date.now())); } catch (_) {}
  }

  function issueCookie() {
    if (getCookie('ws_session')) {
      markDone();
      try { console.log('[ws-cookie-issue] ws_session already issued'); } catch (_) {}
      return;
    }
    if (shouldThrottle()) return;

    var at = getAccessToken();
    if (!at) {
      try { console.log('[ws-cookie-issue] no access_token'); } catch (_) {}
      return;
    }

    fetch('/api/auth/cookie-issue', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: at }),
    }).then(function (r) {
      if (r.ok) {
        markDone();
        try { console.log('[ws-cookie-issue] ws_session issued - CDN cache active on next reload'); } catch (_) {}
      } else {
        try { console.warn('[ws-cookie-issue] failed status=' + r.status); } catch (_) {}
      }
    }).catch(function (err) {
      try { console.warn('[ws-cookie-issue] network error', err); } catch (_) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', issueCookie, { once: true });
  } else {
    setTimeout(issueCookie, 100);
  }

  window.WS = window.WS || {};
  window.WS._cookieStatus = function () {
    try {
      var sess = getCookie('ws_session');
      var csrf = getCookie('ws_csrf');
      console.log('[ws-cookie-issue] ws_session:', sess ? 'present' : 'absent', '| ws_csrf:', csrf ? 'present' : 'absent');
      return { hasSession: !!sess, hasCsrf: !!csrf };
    } catch (e) { return null; }
  };
})();
