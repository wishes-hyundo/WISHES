/**
 * content-v294-scope.js (2026-04-22, hardened build d)
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
  //   → scope=mine 일 때 한해 세션/로컬 저장소의 ws_token 을 Bearer 로 주입.
  function getWsToken() {
    try {
      var t = null;
      try { t = sessionStorage.getItem('ws_token'); } catch (_) {}
      if (!t) { try { t = localStorage.getItem('ws_token'); } catch (_) {} }
      return (t && typeof t === 'string') ? t : '';
    } catch (_) { return ''; }
  }

  function wrappedFetch(input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (scope === 'mine' && SCOPE_TARGET_RE.test(url)) {
        var hasQS = url.indexOf('?') >= 0;
        var sep = hasQS ? '&' : '?';
        var newUrl = url.indexOf('scope=') >= 0
          ? url.replace(/scope=[^&]*/, 'scope=mine')
          : url + sep + 'scope=mine';
        var tok = getWsToken();
        // build d: admin_bridge_ prefix 로 통일 — 서버 verifyAdminAuth #3
        // (prefix 인식 후 JWT 경로 fall-through) 와 wsAdminFetch 헬퍼와 일치.
        var authVal = tok ? ('Bearer admin_bridge_' + tok) : '';
        if (typeof input === 'string') {
          input = newUrl;
          if (authVal) {
            init = init || {};
            var h1 = null;
            try { h1 = new Headers((init && init.headers) || {}); }
            catch (_) { try { h1 = new Headers(); } catch (__) { h1 = null; } }
            if (h1) { h1.set('Authorization', authVal); init.headers = h1; }
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
              reqInit.body = input.body;
            }
            input = new Request(newUrl, reqInit);
          } catch (_) {
            try { input = new Request(newUrl, input); } catch (__) {}
          }
        }
      }
    } catch (_) {}
    return origFetch.call(this, input, init);
  }
  // ── fetch wrap 보호 (build d, 2026-04-22) ─────────────────────────
  // Phase 1: defineProperty 로 setter 가드 — 다른 wrapper 가
  //   `window.fetch = X` 로 덮어쓰려 하면 X 를 origFetch 로 채택하고
  //   wrappedFetch 가 그 위에 layer 를 유지한다.
  // Phase 2: setInterval(1s) self-heal — defineProperty 가 환경적으로
  //   실패했거나 누군가 configurable:true 상태에서 다시 defineProperty
  //   해버렸을 때를 대비한 안전망.
  var __v294_installed = false;
  function installWrappedFetch() {
    try {
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        enumerable: true,
        get: function () { return wrappedFetch; },
        set: function (newFn) {
          if (typeof newFn === 'function' && newFn !== wrappedFetch) {
            // 다른 wrapper 가 set → 그것을 새 origFetch 로 채택
            origFetch = newFn;
          }
        },
      });
      __v294_installed = true;
    } catch (_) {
      // 폴백: 단순 대입
      try { window.fetch = wrappedFetch; } catch (__) {}
    }
  }
  installWrappedFetch();
  // self-heal: 1초마다 window.fetch 가 wrappedFetch 가 아니면 재설치
  try {
    setInterval(function () {
      try {
        if (window.fetch !== wrappedFetch) {
          if (typeof window.fetch === 'function') origFetch = window.fetch;
          installWrappedFetch();
        }
      } catch (_) {}
    }, 1000);
  } catch (_) {}

  // ── wsAdminFetch 명시 헬퍼 (build d) ───────────────────────────────
  // window.fetch 가 어떤 wrapper 에 잠식되어도 항상 Bearer+scope=mine 보장.
  // 토글 클릭 시 자동으로 호출되며, 외부 코드(WS.loadData 등) 도 사용 가능.
  window.wsAdminFetch = function (url, init) {
    var i = init || {};
    try {
      if (scope === 'mine' && SCOPE_TARGET_RE.test(url)) {
        var hasQS = url.indexOf('?') >= 0;
        var sep = hasQS ? '&' : '?';
        url = url.indexOf('scope=') >= 0
          ? url.replace(/scope=[^&]*/, 'scope=mine')
          : url + sep + 'scope=mine';
        var tok = getWsToken();
        if (tok) {
          var h = null;
          try { h = new Headers(i.headers || {}); } catch (_) { h = null; }
          if (h) {
            // 서버 verifyAdminAuth 가 admin_bridge_<JWT> prefix 를 인식
            h.set('Authorization', 'Bearer admin_bridge_' + tok);
            i.headers = h;
          }
        }
      }
    } catch (_) {}
    // origFetch 로 직접 호출 — wrappedFetch 를 거치지 않음(중복 주입 방지)
    return origFetch.call(window, url, i);
  };

  window.__WS_V294_ROLLBACK__ = function () {
    try {
      // defineProperty 자체를 해제하기 위해 다시 정의
      Object.defineProperty(window, 'fetch', {
        configurable: true, enumerable: true, writable: true, value: origFetch,
      });
    } catch (_) {
      try { window.fetch = origFetch; } catch (__) {}
    }
    try { delete window.wsAdminFetch; } catch (_) { window.wsAdminFetch = undefined; }
    var el = document.getElementById('ws-v294-scope-root');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };

  // ── 토글 UI ──
  function render() {
    var host = document.getElementById('ws-v294-scope-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ws-v294-scope-root';
      // P0 #1 fix (2026-04-22): top:8px right:12px 은 초기화(x=1297)·검색(x=1367)
      //   버튼을 완전히 덮는다 → 좌상단으로 이동하여 헤더 영역을 비워둔다.
      //   left:12px, top:42px 로 고정해 검색바(상단 50px) 아래로 밀어낸다.
      host.style.cssText = [
        'position:fixed',
        'top:52px',
        'left:12px',
        'z-index:99999',
        'display:inline-flex',
        'gap:4px',
        'padding:3px',
        'background:rgba(255,255,255,0.97)',
        'border:1px solid #d5e5d5',
        'border-radius:999px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.08)',
        'font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif',
        'font-size:11px',
      ].join(';');
      host.innerHTML = (
        '<button type="button" data-scope="all" style="border:0;padding:4px 10px;border-radius:999px;cursor:pointer;font-weight:600">전체</button>' +
        '<button type="button" data-scope="mine" style="border:0;padding:4px 10px;border-radius:999px;cursor:pointer;font-weight:600">내 매물</button>'
      );
      document.body.appendChild(host);

      host.addEventListener('click', function (e) {
        var t = e.target;
        if (!(t instanceof HTMLElement)) return;
        var next = t.getAttribute('data-scope');
        if (next !== 'all' && next !== 'mine') return;
        if (next === scope) return;
        scope = next;
        try { localStorage.setItem(STORAGE_KEY, scope); } catch (_) {}
        paint();
        reload();
      });
    }
    paint();
  }

  function paint() {
    var host = document.getElementById('ws-v294-scope-root');
    if (!host) return;
    var btns = host.querySelectorAll('button[data-scope]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var active = b.getAttribute('data-scope') === scope;
      b.style.background = active ? '#2D5A27' : 'transparent';
      b.style.color = active ? '#fff' : '#2D5A27';
    }
  }

  function reload() {
    try {
      var W = window;
      if (W.WS && typeof W.WS.loadData === 'function') {
        // P0 #2 fix (2026-04-22): 실제 캐시 변수는 W.WS.allListings 이고,
        //   content.js 는 추가로 IndexedDB('wishes_cache', 'listings', 'all_listings_v1')
        //   에 데이터를 보관한다. scope 변경 시 서버가 다른 집합을 내려주므로
        //   (a) allListings 초기화, (b) IDB 캐시 삭제, (c) _loadingData=false,
        //   (d) loadData() 순서로 강제 재조회해야 리스트가 실제로 갱신된다.
        try { W.WS.allListings = null; } catch (_) {}
        try { W.WS.filtered = null; } catch (_) {}
        try { W.WS._loadingData = false; } catch (_) {}
        // IndexedDB 캐시 지우기 (best-effort — Promise 해결 전에도 loadData 실행)
        try {
          var req = indexedDB.open('wishes_cache', 1);
          req.onsuccess = function (e) {
            try {
              var db = e.target.result;
              var tx = db.transaction('listings', 'readwrite');
              tx.objectStore('listings').delete('all_listings_v1');
            } catch (_) {}
          };
        } catch (_) {}
        W.WS.loadData();
        return;
      }
    } catch (_) {}
    // WS.loadData 가 없으면 완전 새로고침
    try { location.reload(); } catch (_) {}
  }

  // WS 준비 대기 (최대 10초)
  var tries = 0;
  function boot() {
    if (document.body) {
      render();
      return;
    }
    if (tries++ > 100) return;
    setTimeout(boot, 100);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
