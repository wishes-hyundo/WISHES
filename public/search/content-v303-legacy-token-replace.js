/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v303 — Legacy Token Replace (사장님 critical fix)
 * 작성: 2026-04-28 사장님 격노 — "이미 있는 기능 작동 안 함" 진짜 원인 fix
 *
 * 진단:
 *   /search 의 옛 content.js + 14 patch 가 모두 'Authorization: Bearer <legacy>' 로
 *   admin endpoint 호출. 이는 옛날 Chrome Extension 이 fetch intercept 해서
 *   진짜 admin JWT 로 치환하던 가정이었음. extension 없는 지금은 literal '<legacy>'
 *   그대로 전송 → 401 Unauthorized → AI 생성/건축물대장/매물수정 등 모든 admin 기능 무작동.
 *
 * 영향 받은 기능 (확인됨):
 *   - ✨ AI 매물 콘텐츠 생성 (POST /api/admin/auto-generate)
 *   - 🏛️ 건축물대장 조회 (GET /api/admin/building-registry-full)
 *   - /api/admin/listings/{id} 단건 조회
 *   - 기타 모든 admin endpoint 호출 (총 14곳 literal '<legacy>' 발견)
 *
 * SOTA 수정 패턴:
 *   window.fetch monkey-patch (Chrome Extension 대체) — 모든 fetch 호출 시
 *   Authorization 헤더가 'Bearer <legacy>' 인 경우 → sessionStorage 의 진짜 JWT 로 즉시 치환.
 *   1줄 changeset 으로 14곳 모두 fix.
 *
 * 정책: /search HTML/CSS 무손상 (vanilla patch only). 옛날 가게 코드 직접 손대지 않음.
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const V = 'v303-legacy-token';

  // ────────── 진짜 admin JWT 추출 (mobile-photo.html 와 동일 패턴) ──────────
  function getRealAdminToken() {
    // 1) 표준 키 우선
    const direct = sessionStorage.getItem('ws_token') || '';
    if (direct) {
      const t = direct.startsWith('admin_bridge_') ? direct.slice('admin_bridge_'.length) : direct;
      if (t.startsWith('eyJ') && t.split('.').length === 3) return t;
      if (t) return t;  // JWT 아니어도 있으면 사용 (일부 환경)
    }
    // 2) admin_bridge_<JWT> 패턴 (sessionStorage key 자체에 JWT 박힌 케이스)
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('admin_bridge_')) {
          const inner = k.slice('admin_bridge_'.length);
          if (inner.startsWith('eyJ') && inner.split('.').length === 3) return inner;
        }
        // value 에 JWT 가 있을 수도
        const v = sessionStorage.getItem(k);
        if (v && v.startsWith('eyJ') && v.split('.').length === 3) return v;
      }
    } catch (_) {}
    // 3) localStorage fallback
    try {
      const l = localStorage.getItem('ws_token') || localStorage.getItem('admin_bridge_token') || '';
      if (l) {
        const t = l.startsWith('admin_bridge_') ? l.slice('admin_bridge_'.length) : l;
        return t;
      }
    } catch (_) {}
    // 4) cookie 의 sb-access-token (Supabase Auth)
    try {
      const m = document.cookie.match(/(?:^|;\s*)sb-[^=]+-auth-token=([^;]+)/);
      if (m) {
        const decoded = decodeURIComponent(m[1]);
        // Supabase cookie 는 JSON 배열이거나 base64 직접
        try {
          const arr = JSON.parse(decoded);
          if (Array.isArray(arr) && arr[0]) return arr[0];
        } catch (_) { return decoded; }
      }
    } catch (_) {}
    return '';
  }

  // ────────── window.fetch monkey-patch ──────────
  const _origFetch = window.fetch.bind(window);
  let _replaceCount = 0;

  window.fetch = function (input, init) {
    init = init || {};
    // Headers 정규화 (다양한 형태 지원)
    let headers;
    if (init.headers instanceof Headers) {
      headers = init.headers;
    } else if (Array.isArray(init.headers)) {
      headers = new Headers(init.headers);
    } else if (init.headers && typeof init.headers === 'object') {
      headers = new Headers(init.headers);
    } else {
      headers = new Headers();
    }

    // Authorization 'Bearer <legacy>' 패턴 감지 → 진짜 토큰 치환
    const auth = headers.get('Authorization') || headers.get('authorization') || '';
    if (auth === 'Bearer <legacy>' || auth === 'bearer <legacy>') {
      const realToken = getRealAdminToken();
      if (realToken) {
        headers.set('Authorization', 'Bearer ' + realToken);
        init.headers = headers;
        _replaceCount++;
        if (_replaceCount <= 3 || _replaceCount % 10 === 0) {
          console.log('[' + V + '] <legacy> → real token 치환 (#' + _replaceCount + ') — ' +
            (typeof input === 'string' ? input : (input && input.url) || '').slice(0, 80));
        }
      } else {
        // 토큰 없음 — 명확한 경고
        console.warn('[' + V + '] <legacy> 감지했으나 진짜 토큰 없음. /admin 로그인 후 재시도 필요. URL=',
          typeof input === 'string' ? input : (input && input.url));
      }
    }

    return _origFetch(input, init);
  };

  // ────────── XMLHttpRequest 도 동일 처리 (legacy 코드가 XHR 사용 시) ──────────
  const _origXhrSetReq = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (name && name.toLowerCase() === 'authorization' && value === 'Bearer <legacy>') {
      const realToken = getRealAdminToken();
      if (realToken) {
        return _origXhrSetReq.call(this, name, 'Bearer ' + realToken);
      }
    }
    return _origXhrSetReq.call(this, name, value);
  };

  console.log('[' + V + '] window.fetch + XMLHttpRequest monkey-patch 활성 — ' +
    'Bearer <legacy> 자동 치환 (Chrome Extension 대체)');
})();
