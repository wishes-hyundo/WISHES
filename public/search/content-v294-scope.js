/**
 * content-v294-scope.js (2026-04-22, hardened build f)
 * ─────────────────────────────────────────────
 * v7 §4 — 내 매물 / 전체 scope 토글을 /search 중개사 포털에 통합
 *
 * 배경
 *   v7 wireframe handoff 시 /admin/search 에 ScopeToggle React 컴포넌트를 올렸는데,
 *   사용자 피드백 "search 하나면 돼, 여기에 통합을 해야지" 에 따라
 *   중개사 포털 단일 진입점인 /search 로 기능을 재배치.
 *
 *   /search 는 /public/search/content.js 레거시 번들이 직접 DOM 을 그리므로
 *   React 컴포넌트를 끼워 넣을 수 없다 → 기존 v2.x 패치 패턴(window.WS 래핑) 을
 *   그대로 따라 토글 UI 를 주입하고 fetch 에 scope=mine 파라미터를 합성한다.
 *
 * 동작
 *   1. 상단 검색바(#ws-global-search 근처) 또는 #ws-search-overlay 최상단에
 *      '내 매물 / 전체' 2-state 세그먼트 버튼 삽입.
 *   2. localStorage 'ws_v7_scope' 에 선택값 영속화 ('all' | 'mine').
 *   3. window.fetch 를 monkey-patch — '/api/listings' 또는 '/api/admin/listings'
 *      요청에 한해 scope=mine 토글 시 querystring 에 scope=mine 추가.
 *      다른 도메인/엔드포인트는 원본 그대로 통과.
 *   4. 토글 전환 시 WS.loadData() 가 있으면 호출해 재조회. 없으면 location.reload 폴백.
 *
 * 안전장치 (build d, 2026-04-22)
 *   - 중복 주입 방지 (#ws-v294-scope-root 확인)
 *   - WS.loadData 부재 시 fallback 처리
 *   - fetch 래핑 복구(rollback) API: window.__WS_V294_ROLLBACK__()
 *   - **fetch wrap 영구 보호**: Object.defineProperty(window,'fetch',{...}) setter
 *     가드 + 1초 간격 self-heal interval. 다른 wrapper 가 window.fetch 를 덮어
 *     써도 v294 wrappedFetch 가 항상 최외곽 layer 로 유지된다.
 *   - **window.wsAdminFetch(url, init)** 명시 헬퍼 노출: defineProperty 가 실패한
 *     환경에서도 토글 클릭 핸들러가 직접 호출하면 Bearer + scope=mine 보장.
 */
(function () {
  'use strict';

  if (document.getElementById('ws-v294-scope-root')) return;

  var STORAGE_KEY = 'ws_v7_scope';
  var scope = 'all';
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'mine' || saved === 'all') scope = saved;
  } catch (_) {}

  // ── fetch 래퍼 ──
  // /api/listings 또는 /api/admin/listings 경로에만 scope=mine 주입
  var SCOPE_TARGET_RE = /\/api\/(?:admin\/)?listings(?:\/stats)?(?:\?|$)/;
  var origFetch = window.fetch;

  // L-v7-p3 (2026-04-22): scope=mine 은 서버에서 auth.getUser(token) 로
  //   UID 를 추출해 created_by 필터를 걸기 때문에, content.js 레거시 번들이
  //   Authorization 헤더 없이 /api/admin/listings 를 치면 서버가 UID 를
  //   못 꺼내 빈 결과(scope_auth:'failed') 를 반환한다.
  //   → scope=mine 일 때 한해 세션/로컬 저장소의 토큰을 Bearer 로 주입.
  //
  // build e (2026-04-22): 토큰 소스 확장.
  //   중개사 포털에서 Supabase 로그인 시 JWT 가 저장되는 표준 키는
  //   `sb-<project-ref>-auth-token` (JSON {access_token,refresh_token,...}).
  //   레거시 `ws_token` 이 비어있거나 JWT 형식이 아니면 Supabase 키에서
  //   access_token 을 꺼내 Bearer 로 사용한다.
  function isJwtLike(s) {
    return !!s && typeof s === 'string' && s.indexOf('eyJ') === 0 && s.split('.').length === 3;
  }
  function extractSupabaseAccessToken() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (!/^sb-.*-auth-token$/.test(k)) continue;
        var raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          var o = JSON.parse(raw);
          // Supabase v2 shape: { access_token, refresh_token, expires_at, ... }
          var at = o && (o.access_token
            || (o.currentSession && o.currentSession.access_token));
          if (isJwtLike(at)) return at;
        } catch (_) { /* raw string fallback */
          if (isJwtLike(raw)) return raw;
        }
      }
    } catch (_) {}
    return '';
  }
  function getWsToken() {
    try {
      // 1) 레거시 ws_token (session → local)
      var t = null;
      try { t = sessionStorage.getItem('ws_token'); } catch (_) {}
      if (!t) { try { t = localStorage.getItem('ws_token'); } catch (_) {} }
      if (isJwtLike(t)) return t;
      // 2) Supabase sb-*-auth-token.access_token
      var sb = extractSupabaseAccessToken();
      if (sb) return sb;
      // 3) fallback: ws_token 이 비-JWT 라도 그대로 반환 (MASTER_PASSWORD 등)
      return (t && typeof t === 'string') ? t : '';
    } catch (_) { return ''; }
  }

  function wrappedFetch(input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      // build f (2026-04-22): SCOPE_TARGET_RE 매치되는 admin 엔드포인트는
      //   scope=all/mine 무관 항상 Bearer 주입. 레거시 content.js 의 자체 auth
      //   경로가 wrapper 충돌로 불안정해서 기본 로딩도 401 터지던 P0 수정.
      //   URL 재작성은 scope==='mine' 일 때만.
      if (SCOPE_TARGET_RE.test(url)) {
        var newUrl = url;
        if (scope === 'mine') {
          var hasQS = url.indexOf('?') >= 0;
          var sep = hasQS ? '&' : '?';
          newUrl = url.indexOf('scope=') >= 0
            ? url.replace(/scope=[^&]*/, 'scope=mine')
            : url + sep + 'scope=mine';
        }
        var tok = getWsToken();
        var authVal = tok ? ('Bearer admin_bridge_' + tok) : '';
        if (typeof input === 'string') {
          input = newUrl;
          if (authVal) {
            init = init || {};
            var h1 = null;
            try { h1 = new Headers((init && init.headers) || {}); }
            catch (_) { try { h1 = new Headers(); } catch (__) { h1 = null; } }
            if (h1) {
              // 기존 Authorization 이 admin_password/기타 값이면 덮어쓰기 —
              //   wrappedFetch 가 주입하는 admin_bridge_<JWT> 가 더 안전한 경로.
              h1.set('Authorization', authVal);
              init.headers = h1;
            }
          }
        } else if (input && 'url' in input) {
          // Request 객체: 새 Request 로 재구성해 Authorization 덮어쓰기
          try {
            var headers = new Headers(input.headers || {});
            if (authVal) headers.set('Authorization', authVal);
            var reqInit = {
              method: input.method,
              headers: headers,
              credentials: input.credentials,
              cache: input.cache,
              redirect: input.redirect,
              referrer: input.referrer,
              integrity: input.integrity,
              mode: input.mode,
            };
            if (input.method && input.method !== 'GET' && input.method !== 'HEAD') {
              r