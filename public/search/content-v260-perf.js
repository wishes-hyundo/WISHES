/**
 * WISHES Search Performance Overlay — v2.6.1 (SAFE)
 * ==================================================
 * 대상      : /public/search/content.js + content-v240-detail.js
 * 배포방식  : page.tsx <script src="/search/content-v260-perf.js"/>
 *
 * 이전 v2.6.0 에서 "사진이 안 보인다 / 유사매물이 안 나온다" 사고가 있어
 * UX 를 건드리지 않는 모듈 1개만 남기고 전부 제거.
 *
 * 남긴 것:
 *   1. /api/admin/listings?fields=minimal 중복호출 dedupe (3회 → 1회, 5초 TTL 메모리 캐시)
 *
 * 제거한 것:
 *   - 이미지 lazy loading (사진 안 보임 사고 원인)
 *   - showSimilar lazy wrap (유사매물 안 나옴 사고 원인)
 *   - 모달 오픈 성능 로깅 (콘솔만 노이즈)
 *
 * 부작용 방지:
 *   - window 전역 1회 초기화 가드
 *   - fetch 훅은 GET + /api/admin/listings?fields=minimal 만 대상
 */
(function() {
  'use strict';
  if (window.__v260_perf_installed) return;
  window.__v260_perf_installed = true;
  var VERSION = '2.6.1';
  var TAG = '[WP v' + VERSION + ' perf-safe]';

  // ====================================================================
  // /api/admin/listings?fields=minimal 중복호출 dedupe (핵심 속도 개선)
  // ====================================================================
  (function installFetchDedupe() {
    var origFetch = window.fetch;
    if (typeof origFetch !== 'function') return;
    var cache = {};  // url -> { ts, promise }
    var TTL_MS = 5000;

    window.fetch = function(input, init) {
      try {
        var method = (init && init.method) || 'GET';
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var targetMatch = /\/api\/admin\/listings(\?|$)/.test(url) &&
                          /fields=minimal/.test(url) &&
                          method.toUpperCase() === 'GET';
        if (targetMatch) {
          var now = Date.now();
          var key = url;
          var hit = cache[key];
          if (hit && (now - hit.ts) < TTL_MS) {
            console.log(TAG + ' dedupe HIT ' + key);
            return hit.promise.then(function(r) { return r.clone(); });
          }
          var promise = origFetch.call(this, input, init);
          cache[key] = { ts: now, promise: promise };
          promise.then(function(r) {
            // 원본 보관 (clone 가능해야 함)
          }, function() {
            try { delete cache[key]; } catch(e){}
          });
          return promise.then(function(r) { return r.clone(); });
        }
      } catch(e) {
        console.warn(TAG + ' fetch hook error', e);
      }
      return origFetch.call(this, input, init);
    };
    console.log(TAG + ' fetch dedupe installed');
  })();

  console.log(TAG + ' v' + VERSION + ' SAFE overlay ready (API dedupe only)');
})();
