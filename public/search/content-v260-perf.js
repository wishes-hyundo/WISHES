/**
 * WISHES Search Performance Overlay — v2.6.2
 * ==================================================
 * 대상      : /public/search/content.js + content-v240-detail.js (v2.5.3 롤백 상태)
 * 배포방식  : page.tsx <script src="/search/content-v260-perf.js"/>
 *
 * v2.6.1(SAFE) 대비 추가:
 *   + AI 결과 localStorage 영속 캐시 (listingId 별 · TTL 7일)
 *     - 모달 열 때마다 /api/admin/auto-generate 재호출되는 문제 해결
 *     - ai_generated_at 실제 값 유지 (renderCard 가 "now" 로 덮어쓰는 표시 버그 방지)
 *   + showDetail 훅: 캐시 히트 시 L 에 AI 주입 후 __v253_backfilled=true 로 백필 차단
 *   + auto-generate fetch 훅: 응답을 캐시에 저장 + inflight share + 캐시 히트시 가짜 Response 반환
 *   + __v251RenderAi 훅: renderCard 직접 호출 경로도 캐시에 박제
 *
 * 유지 (v2.6.1 SAFE):
 *   + /api/admin/listings?fields=minimal 중복호출 dedupe (5초 TTL)
 *
 * 제거(영구): 이미지 lazy, showSimilar lazy, 모달 오픈 로깅 — UX 파괴 사고 재발 방지
 *
 * 부작용 방지:
 *   - window 전역 1회 초기화 가드
 *   - fetch 훅은 특정 URL 패턴만 대상
 *   - localStorage 실패 시 조용히 폴백 (catch)
 */
(function() {
  'use strict';
  if (window.__v260_perf_installed) return;
  window.__v260_perf_installed = true;
  var VERSION = '2.6.2';
  var TAG = '[WP v' + VERSION + ' perf]';

  // ====================================================================
  // 1. /api/admin/listings?fields=minimal 중복호출 dedupe
  // ====================================================================
  (function installFetchDedupe() {
    var origFetch = window.fetch;
    if (typeof origFetch !== 'function') return;
    var cache = {};
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
          var hit = cache[url];
          if (hit && (now - hit.ts) < TTL_MS) {
            console.log(TAG + ' dedupe HIT ' + url);
            return hit.promise.then(function(r) { return r.clone(); });
          }
          var promise = origFetch.call(this, input, init);
          cache[url] = { ts: now, promise: promise };
          promise.then(null, function() { try { delete cache[url]; } catch(e){} });
          return promise.then(function(r) { return r.clone(); });
        }
      } catch(e) { console.warn(TAG + ' fetch hook error', e); }
      return origFetch.call(this, input, init);
    };
    console.log(TAG + ' fetch dedupe installed');
  })();

  // ====================================================================
  // 2. AI 결과 localStorage 영속 캐시 (TTL 7일)
  // ====================================================================
  var AI_CACHE_KEY = 'ws_ai_cache_v262';
  var AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function readAiCache() {
    try {
      var raw = localStorage.getItem(AI_CACHE_KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch(e) { return {}; }
  }
  function writeAiCache(obj) {
    try { localStorage.setItem(AI_CACHE_KEY, JSON.stringify(obj)); } catch(e){}
  }
  function getCachedAi(lid) {
    var c = readAiCache();
    var item = c[String(lid)];
    if (!item) return null;
    if ((Date.now() - item.ts) > AI_CACHE_TTL_MS) {
      try { delete c[String(lid)]; writeAiCache(c); } catch(e){}
      return null;
    }
    return item.R;
  }
  function setCachedAi(lid, R) {
    if (!R || (!R.title && !R.description)) return;
    var c = readAiCache();
    c[String(lid)] = { ts: Date.now(), R: R };
    // 용량 제한: 200개 초과 시 오래된 것부터 삭제
    var keys = Object.keys(c);
    if (keys.length > 200) {
      keys.sort(function(a,b){ return (c[a].ts||0) - (c[b].ts||0); });
      for (var i = 0; i < keys.length - 200; i++) { try { delete c[keys[i]]; } catch(e){} }
    }
    writeAiCache(c);
  }
  window.__v262_ai_cache = { read: readAiCache, get: getCachedAi, set: setCachedAi };

  // ====================================================================
  // 3. /api/admin/auto-generate dedupe + 캐시 저장 훅
  // ====================================================================
  (function installAutoGenerateHook() {
    var origFetch = window.fetch;
    if (typeof origFetch !== 'function') return;
    var inflight = {};

    window.fetch = function(input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var method = (init && init.method) || 'GET';
        var isAutoGen = /\/api\/admin\/auto-generate(\?|$)/.test(url) && method.toUpperCase() === 'POST';
        if (isAutoGen && init && init.body) {
          var body;
          try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch(e){ body = null; }
          var lid = body && body.listingId ? String(body.listingId) : null;
          if (lid) {
            // a) 로컬캐시 히트 → 가짜 Response
            var cached = getCachedAi(lid);
            if (cached) {
              console.log(TAG + ' AI cache HIT lid=' + lid);
              var fake = { success: true, result: cached, cached: true };
              return Promise.resolve(new Response(JSON.stringify(fake), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              }));
            }
            // b) 같은 lid in-flight 공유
            if (inflight[lid]) {
              console.log(TAG + ' AI inflight SHARE lid=' + lid);
              return inflight[lid].then(function(r){ return r.clone(); });
            }
            // c) 새 요청 + 응답 캐시
            var promise = origFetch.call(this, input, init);
            inflight[lid] = promise;
            promise.then(function(r){
              try {
                r.clone().json().then(function(data){
                  if (data && data.success && data.result) {
                    if (!data.result.ai_generated_at) data.result.ai_generated_at = new Date().toISOString();
                    setCachedAi(lid, data.result);
                    console.log(TAG + ' AI cached lid=' + lid);
                  }
                }).catch(function(){});
              } catch(e){}
              delete inflight[lid];
            }, function(){ delete inflight[lid]; });
            return promise.then(function(r){ return r.clone(); });
          }
        }
      } catch(e) { console.warn(TAG + ' autoGen hook error', e); }
      return origFetch.call(this, input, init);
    };
    console.log(TAG + ' AI autoGen cache hook installed');
  })();

  // ====================================================================
  // 4. showDetail 훅: 캐시된 AI 가 있으면 L 에 주입 + 백필 차단
  // ====================================================================
  (function installShowDetailAiInject() {
    function tryInstall() {
      var WS = window.WS;
      if (!WS || typeof WS.showDetail !== 'function') return false;
      if (WS.__v262_showDetail_wrapped) return true;
      var orig = WS.showDetail.bind(WS);
      WS.showDetail = function(L) {
        try {
          if (L && L.id != null) {
            var cached = getCachedAi(L.id);
            if (cached) {
              if (!L.ai_title && cached.title) L.ai_title = cached.title;
              if (!L.ai_description && cached.description) L.ai_description = cached.description;
              if ((!L.ai_tags || !L.ai_tags.length) && Array.isArray(cached.tags)) L.ai_tags = cached.tags;
              if ((!L.ai_keywords || !L.ai_keywords.length) && Array.isArray(cached.keywords)) L.ai_keywords = cached.keywords;
              if (!L.ai_meta_description && cached.meta_description) L.ai_meta_description = cached.meta_description;
              if (!L.ai_generated_at && cached.ai_generated_at) L.ai_generated_at = cached.ai_generated_at;
              L.__v253_backfilled = true;
              console.log(TAG + ' AI prefill from cache lid=' + L.id);
            }
          }
        } catch(e){ console.warn(TAG + ' showDetail prefill error', e); }
        return orig.apply(this, arguments);
      };
      WS.__v262_showDetail_wrapped = true;
      console.log(TAG + ' showDetail AI prefill wrap installed');
      return true;
    }
    if (!tryInstall()) {
      var n = 0;
      var iv = setInterval(function(){
        n++;
        if (tryInstall() || n > 60) clearInterval(iv);
      }, 150);
    }
  })();

  // ====================================================================
  // 5. __v251RenderAi 훅: renderCard 직접 호출 경로도 캐시에 박제
  // ====================================================================
  (function installRenderAiHook() {
    function tryInstall() {
      if (typeof window.__v251RenderAi !== 'function') return false;
      if (window.__v262_renderAi_wrapped) return true;
      var orig = window.__v251RenderAi;
      window.__v251RenderAi = function(lid, R, buildingInfo) {
        try {
          if (lid != null && R && (R.title || R.description)) {
            if (!R.ai_generated_at) R.ai_generated_at = new Date().toISOString();
            setCachedAi(lid, R);
          }
        } catch(e){}
        return orig.apply(this, arguments);
      };
      window.__v262_renderAi_wrapped = true;
      console.log(TAG + ' __v251RenderAi cache-save wrap installed');
      return true;
    }
    if (!tryInstall()) {
      var n = 0;
      var iv = setInterval(function(){
        n++;
        if (tryInstall() || n > 60) clearInterval(iv);
      }, 150);
    }
  })();

  console.log(TAG + ' v' + VERSION + ' overlay ready (AI cache + fetch dedupe)');
})();
