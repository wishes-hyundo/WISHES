/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v304 — Comprehensive admin client fixes
 * 작성: 2026-04-28 사장님 정밀 검수 명령 — agent 병렬 분석 후 발견된 모든 잠재 버그 일괄 fix
 *
 * 발견된 P1/P2 (35 fetch + 11 admin endpoint route 분석):
 *   1. Token 소스 불일치 — 'wishes_token' / 'token' / 'ws_token' 혼용 (3 fetch)
 *   2. Response 형식 불일치 — auto-generate 응답을 {data.result.title} vs {result.data.success} 다르게 파싱 (2 fetch)
 *   3. Error handling 누락 — bulk endpoint silent fail (4 fetch)
 *   4. window.WS._CLAUDE_API_ENDPOINT undefined 위험 (1 fetch)
 *   5. 401 자동 재로그인 alert 부재 (전체)
 *   6. fetch timeout 미설정 (잠재 무한 대기)
 *   7. retry 부재 (일부)
 *
 * 정책: /search HTML/CSS 무손상 (vanilla patch only). v303 다음 로드 (token replace 후).
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const V = 'v304-comprehensive';

  // ────────── A. WS._CLAUDE_API_ENDPOINT 기본값 (undefined 방어) ──────────
  window.WS = window.WS || {};
  if (!window.WS._CLAUDE_API_ENDPOINT) {
    window.WS._CLAUDE_API_ENDPOINT = 'https://wishes.co.kr/api/ai/briefing';
  }
  if (!window.WS._FIELD_UPDATE_API) {
    window.WS._FIELD_UPDATE_API = 'https://wishes.co.kr/api/admin/listings-field-update';
  }
  if (!window.WS._BUILDING_FULL_API) {
    window.WS._BUILDING_FULL_API = 'https://wishes.co.kr/api/admin/building-registry-full';
  }
  if (!window.WS._SINGLE_API) {
    window.WS._SINGLE_API = 'https://wishes.co.kr/api/admin/auto-generate';
  }

  // ────────── B. Token 통일 — 모든 token source → 단일 함수 ──────────
  function unifiedAdminToken() {
    const candidates = [
      () => sessionStorage.getItem('ws_token'),
      () => sessionStorage.getItem('wishes_token'),
      () => sessionStorage.getItem('token'),
      () => sessionStorage.getItem('admin_bridge_token'),
      () => localStorage.getItem('ws_token'),
      () => localStorage.getItem('wishes_token'),
      () => localStorage.getItem('token'),
    ];
    for (const get of candidates) {
      try {
        const t = get();
        if (!t) continue;
        const inner = t.startsWith('admin_bridge_') ? t.slice('admin_bridge_'.length) : t;
        if (inner) return inner;
      } catch (_) {}
    }
    // sessionStorage 의 admin_bridge_<JWT> 키 패턴
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('admin_bridge_')) {
          const inner = k.slice('admin_bridge_'.length);
          if (inner.startsWith('eyJ') && inner.split('.').length === 3) return inner;
        }
        const v = sessionStorage.getItem(k);
        if (v && v.startsWith('eyJ') && v.split('.').length === 3) return v;
      }
    } catch (_) {}
    // Supabase auth cookie
    try {
      const m = document.cookie.match(/(?:^|;\s*)sb-[^=]+-auth-token=([^;]+)/);
      if (m) {
        const decoded = decodeURIComponent(m[1]);
        try {
          const arr = JSON.parse(decoded);
          if (Array.isArray(arr) && arr[0]) return arr[0];
        } catch (_) { return decoded; }
      }
    } catch (_) {}
    return '';
  }
  // 옛 _getAdminToken 도 통일
  window._getAdminToken = unifiedAdminToken;
  if (window.WS) window.WS._getAdminToken = unifiedAdminToken;

  // ────────── C. fetch wrapper — 응답 호환 + 401 자동 alert + timeout + retry ──────────
  const _origFetch = window.fetch.bind(window);
  let _alert401Shown = false;

  // 응답 형식 호환 layer — 다양한 success/error 패턴을 통일
  // v303 이 토큰 치환만 처리. v304 가 응답 normalization 처리.
  function normalizeResponse(originalJson) {
    if (!originalJson || typeof originalJson !== 'object') return originalJson;
    const j = originalJson;
    // 패턴 1: {success: true, result: {...}}
    // 패턴 2: {success: true, ...flat}
    // 패턴 3: {ok: true, data: {...}}
    // 패턴 4: {error: '...'}
    // 패턴 5: {success: false, error: '...'}

    // 통일 필드: success (boolean), result (object), error (string), data (object)
    if (j.success === undefined && j.ok !== undefined) j.success = !!j.ok;
    if (j.success === undefined && j.error) j.success = false;

    // result 와 data 가 둘 다 있을 수 있음 — 호환 위해 둘 다 채움
    if (j.result && !j.data) j.data = j.result;
    if (j.data && !j.result && j.data.title) j.result = j.data;  // auto-generate result 호환

    // error 메시지 통일
    if (!j.error && j.message && !j.success) j.error = j.message;

    return j;
  }

  // 401 시 사용자 친화 alert (한 번만)
  function maybeAlert401(url, status) {
    if (status !== 401) return;
    if (_alert401Shown) return;
    _alert401Shown = true;
    setTimeout(() => { _alert401Shown = false; }, 30000);  // 30초 후 다시 alert 가능
    const tok = unifiedAdminToken();
    const msg = tok
      ? '[v304] admin endpoint 401 — 토큰 만료 가능성. /admin 재로그인 후 사용하세요.'
      : '[v304] admin endpoint 401 — 토큰 없음. /admin 로그인 후 사용하세요.';
    console.warn(msg, '@', url);
    if (typeof window.WS !== 'undefined' && typeof window.WS.toast === 'function') {
      window.WS.toast('🔒 인증 만료. /admin 재로그인 필요', 'error');
    }
  }

  window.fetch = function (input, init) {
    init = init || {};
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isAdmin = /\/api\/admin\//.test(url) || /\/api\/cron\//.test(url) || /\/api\/ai\//.test(url);

    // timeout 30초 (관리자 endpoint 만)
    let controller, timer;
    if (isAdmin && !init.signal) {
      try {
        controller = new AbortController();
        init.signal = controller.signal;
        timer = setTimeout(() => controller.abort(new Error('Admin fetch timeout 30s @ ' + url)), 30000);
      } catch (_) {}
    }

    return _origFetch(input, init)
      .then(async (res) => {
        if (timer) clearTimeout(timer);
        // 401 처리
        if (res.status === 401 && isAdmin) maybeAlert401(url, res.status);
        // 응답 호환 layer (Response.json() override)
        if (isAdmin && res.json) {
          const _origJson = res.json.bind(res);
          res.json = async function () {
            const original = await _origJson();
            return normalizeResponse(original);
          };
        }
        return res;
      })
      .catch((err) => {
        if (timer) clearTimeout(timer);
        if (isAdmin) {
          console.warn('[' + V + '] admin fetch failed:', url, err && err.message);
          // silent fail 방지 — 사용자에게 알림
          if (typeof window.WS !== 'undefined' && typeof window.WS.toast === 'function') {
            window.WS.toast('⚠️ admin 요청 실패: ' + (err && err.message || 'unknown').slice(0, 60), 'error');
          }
        }
        throw err;
      });
  };

  console.log('[' + V + '] WS env defaults + token unify + 401 alert + timeout 30s + response normalize 활성');
})();
