/**
 * content-v294-scope.js (2026-04-22)
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
 * 안전장치
 *   - 중복 주입 방지 (#ws-v294-scope-root 확인)
 *   - WS.loadData 부재 시 fallback 처리
 *   - fetch 래핑 복구(rollback) API: window.__WS_V294_ROLLBACK__()
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
  function wrappedFetch(input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (scope === 'mine' && SCOPE_TARGET_RE.test(url)) {
        var hasQS = url.indexOf('?') >= 0;
        var sep = hasQS ? '&' : '?';
        var newUrl = url.indexOf('scope=') >= 0
          ? url.replace(/scope=[^&]*/, 'scope=mine')
          : url + sep + 'scope=mine';
        if (typeof input === 'string') {
          input = newUrl;
        } else if (input && 'url' in input) {
          // Request 객체: 새 Request 생성
          try { input = new Request(newUrl, input); } catch (_) {}
        }
      }
    } catch (_) {}
    return origFetch.call(this, input, init);
  }
  window.fetch = wrappedFetch;
  window.__WS_V294_ROLLBACK__ = function () {
    if (window.fetch === wrappedFetch) window.fetch = origFetch;
    var el = document.getElementById('ws-v294-scope-root');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };

  // ── 토글 UI ──
  function render() {
    var host = document.getElementById('ws-v294-scope-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ws-v294-scope-root';
      host.style.cssText = [
        'position:fixed',
        'top:8px',
        'right:12px',
        'z-index:99999',
        'display:inline-flex',
        'gap:4px',
        'padding:4px',
        'background:rgba(255,255,255,0.95)',
        'border:1px solid #d5e5d5',
        'border-radius:999px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.08)',
        'font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif',
        'font-size:12px',
      ].join(';');
      host.innerHTML = (
        '<button type="button" data-scope="all" style="border:0;padding:6px 12px;border-radius:999px;cursor:pointer;font-weight:600">전체</button>' +
        '<button type="button" data-scope="mine" style="border:0;padding:6px 12px;border-radius:999px;cursor:pointer;font-weight:600">내 매물</button>'
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
        // 캐시 무효화용 플래그
        if (W.WS._allListingsCache) W.WS._allListingsCache = null;
        W.WS._loadingData = false;
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
