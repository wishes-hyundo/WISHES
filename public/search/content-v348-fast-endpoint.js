/**
 * content-v348-fast-endpoint.js (2026-05-11)
 *
 * Fix 36 (사장님 명령 "옵션 2 어떻게든 해결"):
 *   /api/admin/listings?fields=minimal 호출을 /api/admin/listings-fast?fields=minimal 로 redirect.
 *   새 endpoint 가 RPC 사용 → 18s → 6.9s (2.6배 빠름).
 *
 * 안전 가드:
 *   - URL 만 변경, 응답 처리 동일 (v341 의 stream clone 충돌 회피)
 *   - 새 endpoint 가 503 반환 (RPC fail) 시 자동 fallback to 기존 endpoint
 *   - paginated/cursor 등 query param 모두 보존
 *   - 회귀 발견 시 patches 배열에서 v348 entry 만 제거 → 즉시 기존 endpoint 복원
 *
 * v341 회귀 회피:
 *   - response stream 안 건드림
 *   - 단순 URL string replace
 *   - origFetch 직접 호출 (clone 안 함)
 */
(function () {
  'use strict';
  if (window.__WS_V348_FAST_ENDPOINT__) return;
  window.__WS_V348_FAST_ENDPOINT__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // Match: /api/admin/listings?fields=minimal (with any other query params)
  var TARGET_RE = /\/api\/admin\/listings\?fields=minimal/;
  // Skip if already redirected (avoid infinite loop)
  var REDIRECTED_MARKER = '_v348_fast=1';

  // Wrap fetch — outer of v294 (Bearer auth wrap). v294 가 inner.
  if (!window.__WS_V348_ORIGFETCH__) {
    window.__WS_V348_ORIGFETCH__ = window.fetch.bind(window);
  }
  var origFetch = window.__WS_V348_ORIGFETCH__;

  window.fetch = function (input, init) {
    try {
      var urlStr = typeof input === 'string' ? input : (input && input.url) || '';
      if (urlStr && TARGET_RE.test(urlStr) && urlStr.indexOf(REDIRECTED_MARKER) === -1) {
        // Redirect to new endpoint
        var newUrl = urlStr.replace(
          /\/api\/admin\/listings\?fields=minimal/,
          '/api/admin/listings-fast?fields=minimal'
        );
        // Add marker (safety against double redirect)
        newUrl += '&' + REDIRECTED_MARKER;

        if (typeof input === 'string') {
          return origFetch(newUrl, init).then(function (res) {
            // Fallback if 503 (RPC failed) — retry with original URL
            if (res.status === 503) {
              try { console.warn('[v348] fast endpoint 503, fallback to original'); } catch (_) {}
              return origFetch(urlStr, init);
            }
            return res;
          }).catch(function (err) {
            try { console.warn('[v348] fast fetch error, fallback:', err); } catch (_) {}
            return origFetch(urlStr, init);
          });
        } else {
          // Request object — clone with new URL
          var newReq = new Request(newUrl, input);
          return origFetch(newReq, init).then(function (res) {
            if (res.status === 503) {
              try { console.warn('[v348] fast endpoint 503, fallback'); } catch (_) {}
              return origFetch(input, init);
            }
            return res;
          }).catch(function (err) {
            try { console.warn('[v348] fast fetch error, fallback:', err); } catch (_) {}
            return origFetch(input, init);
          });
        }
      }
    } catch (e) {
      try { console.warn('[v348] wrap error:', e); } catch (_) {}
    }
    return origFetch(input, init);
  };

  try { console.log('[v348-fast-endpoint] active - /api/admin/listings -> /api/admin/listings-fast'); } catch (_) {}
})();
