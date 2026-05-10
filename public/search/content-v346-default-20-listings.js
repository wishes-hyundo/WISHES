/**
 * content-v346-default-20-listings.js (2026-05-10)
 *
 * Fix 23 (사장님 명령): 첫 표시 매물 100건 → 20건.
 *   - WS.state.perPage = 20 강제 set
 *   - select#ws-per-page dropdown 의 selected 변경
 *   - renderAll 다시 호출 (page reset)
 *
 * 안전:
 *   - 사용자가 select 다른 값 (50/100) 으로 변경 가능 (영구 명령 X)
 *   - 매 진입 시 default 20 다시 set
 */
(function () {
  'use strict';
  if (window.__WS_V346_DEFAULT_20__) return;
  window.__WS_V346_DEFAULT_20__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEFAULT_PER_PAGE = 20;

  function _applyDefault() {
    try {
      // 1. WS.state.perPage 변경
      if (window.WS && window.WS.state) {
        if (window.WS.state.perPage !== DEFAULT_PER_PAGE && !window.__WS_V346_USER_CHANGED__) {
          window.WS.state.perPage = DEFAULT_PER_PAGE;
        }
      }

      // 2. select dropdown 의 selected 변경
      var sel = document.getElementById('ws-per-page');
      if (sel && sel.value !== String(DEFAULT_PER_PAGE) && !window.__WS_V346_USER_CHANGED__) {
        sel.value = String(DEFAULT_PER_PAGE);
        // 사용자가 변경 시 추적
        if (!sel.__v346Bound) {
          sel.__v346Bound = true;
          sel.addEventListener('change', function () {
            window.__WS_V346_USER_CHANGED__ = true;
          });
        }
      }

      // 3. renderAll 호출 (paginate 다시)
      if (window.WS && typeof window.WS.renderAll === 'function') {
        // 무한 루프 회피 — perPage 가 이미 20 이면 skip
        if (sel && sel.value === String(DEFAULT_PER_PAGE)) {
          // 첫 렌더 후만 한 번 더 (이미 100 으로 렌더된 경우 다시)
          if (!window.__WS_V346_APPLIED_ONCE__) {
            window.__WS_V346_APPLIED_ONCE__ = true;
            try { window.WS.renderAll(); } catch (_) {}
          }
        }
      }
    } catch (e) {
      try { console.warn('[v346]', e); } catch (_) {}
    }
  }

  // 첫 진입 시 다양한 timing 으로 적용
  function _init() {
    _applyDefault();
    setTimeout(_applyDefault, 500);
    setTimeout(_applyDefault, 1500);
    setTimeout(_applyDefault, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  try { console.log('[v346-default-20] 첫 표시 매물 ' + DEFAULT_PER_PAGE + '건'); } catch (_) {}
})();
