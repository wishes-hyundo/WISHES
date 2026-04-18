/**
 * WISHES Search Performance Overlay — v2.6.3
 * ==================================================
 * 대상      : /public/search/content.js + content-v240-detail.js (v2.5.3 롤백 상태)
 * 배포방식  : page.tsx <script src="/search/content-v260-perf.js"/>
 *
 * v2.6.3 핫픽스 추가:
 *   + 모듈 6: /api/listings/[id] 공개 상세 API 가 images=0 장 반환하는 서버 버그 회피
 *     - content.js line ~3907 lazyLoadFullImages 가 /api/listings/{id} 호출 → images 0장 → 갤러리 1장 고착
 *     - fetch 훅으로 GET /api/listings/{숫자} 를 /api/admin/listings/{숫자} 로 리디렉트
 *     - admin API 응답의 listing_images 를 images 로 동일 매핑하여 content.js 원본 로직 그대로 동작
 *
 * 유지 (v2.6.2):
 *   1. /api/admin/listings?fields=minimal dedupe (5초 TTL)
 *   2. AI 결과 localStorage 영속 캐시 (TTL 7일)
 *   3. /api/admin/auto-generate dedupe + 캐시 저장 훅
 *   4. showDetail 훅 — 캐시된 AI 가 있으면 L 에 주입 + 백필 차단
 *   5. __v251RenderAi 훅 — renderCard 직접 호출 경로도 캐시에 박제
 *
 * 부작용 방지:
 *   - window 전역 1회 초기화 가드
 *   - 각 fetch 훅은 특정 URL 패턴만 대상
 *   - localStorage 실패 시 조용히 폴백 (catch)
 */
(function() {
  'use strict';
  if (window.__v260_perf_installed) return;
  window.__v260_perf_installed = true;
  var VERSION = '2.6.6';
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
  //    v2.6.4 HARDENING (2026-04-18):
  //      자동 모드(autoMode:true)는 상세 모달 열기만 해도 트리거되어 토큰이 낭비된다.
  //      → DB 의 window.WS.allListings 에서 해당 매물의 description/title 이 이미 있으면
  //        자동 모드 호출을 즉시 차단하고 로컬 데이터로 fake success 를 반환한다.
  //      → 캐시조차 없고 DB 도 비어있는 매물만 최초 1회 실제 호출 허용.
  //      → 수동 버튼(_runAutoGenerate, autoMode 플래그 없음)은 그대로 통과.
  // ====================================================================
  (function installAutoGenerateHook() {
    var origFetch = window.fetch;
    if (typeof origFetch !== 'function') return;
    var inflight = {};

    function findLocalListing(lid) {
      try {
        var list = (window.WS && window.WS.allListings) || [];
        for (var i = 0; i < list.length; i++) {
          if (String(list[i].id) === String(lid)) return list[i];
        }
      } catch(e){}
      return null;
    }

    window.fetch = function(input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var method = (init && init.method) || 'GET';
        var isAutoGen = /\/api\/admin\/auto-generate(\?|$)/.test(url) && method.toUpperCase() === 'POST';
        if (isAutoGen && init && init.body) {
          var body;
          try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch(e){ body = null; }
          var lid = body && body.listingId ? String(body.listingId) : null;
          var isAutoMode = !!(body && body.autoMode === true);

          if (lid) {
            // 3-A) localStorage 7일 캐시 HIT
            var cached = getCachedAi(lid);
            if (cached) {
              console.log(TAG + ' AI cache HIT lid=' + lid + (isAutoMode ? ' (auto)' : ' (manual)'));
              var fake = { success: true, result: cached, cached: true };
              return Promise.resolve(new Response(JSON.stringify(fake), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              }));
            }

            // 3-B) 자동 모드 차단 조건: ai_description ★AND★ seo_tags 둘 다 채워진 경우만
            //       v2.6.5 에서 OR 로 하니 "ai_description 만 있고 seo_tags 비어있는" 구버전 매물이
            //       영영 SEO 필드를 못 채우는 새 문제가 발생. (b3b3cee 이전에 생성된 매물들이 해당)
            //       v2.6.6 부터는 AND 로: AI 콘텐츠 세트 전부가 채워져야 차단.
            //       반만 채워진 매물은 1회 추가 호출로 SEO 필드까지 완전 박제 → 이후 차단.
            //       수동 버튼(_runAutoGenerate)은 autoMode 플래그 없이 오므로 이 분기 통과.
            if (isAutoMode) {
              var L = findLocalListing(lid);
              var hasAiDesc = L && L.ai_description && String(L.ai_description).trim().length > 0;
              var hasAiTags = L && Array.isArray(L.seo_tags) && L.seo_tags.length > 0;
              var hasFullAiSet = hasAiDesc && hasAiTags; // AND 조건
              if (hasFullAiSet) {
                var synthetic = {
                  title: L.ai_title || L.title || '',
                  description: L.ai_description || '',
                  keywords: Array.isArray(L.seo_keywords) ? L.seo_keywords : [],
                  tags: Array.isArray(L.seo_tags) ? L.seo_tags : [],
                  meta_description: L.seo_meta_description || '',
                  ai_generated_at: L.ai_generated_at || new Date().toISOString(),
                };
                setCachedAi(lid, synthetic);
                console.log(TAG + ' AI auto BLOCKED (full AI set present) lid=' + lid);
                var blocked = { success: true, result: synthetic, cached: true, blocked_reason: 'db_has_full_ai_set' };
                return Promise.resolve(new Response(JSON.stringify(blocked), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                }));
              }
              console.log(TAG + ' AI auto PASS (incomplete AI set: desc=' + !!hasAiDesc + ' tags=' + !!hasAiTags + ') lid=' + lid);
            }

            // 3-C) dedupe — 같은 lid 로 동시에 여러 호출이 뜨면 첫 호출만 진짜 요청
            if (inflight[lid]) {
              console.log(TAG + ' AI inflight SHARE lid=' + lid);
              return inflight[lid].then(function(r){ return r.clone(); });
            }
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
    console.log(TAG + ' AI autoGen cache hook installed (v2.6.6 full-set AND guard)');
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

  // ====================================================================
  // 6. /api/listings/[id] → /api/admin/listings/[id] 리디렉트 (서버 버그 회피)
  //    공개 상세 API 가 images=0장 반환하는 버그로 갤러리 1장 고착 현상 차단
  // ====================================================================
  (function installListingDetailRedirect() {
    var origFetch = window.fetch;
    if (typeof origFetch !== 'function') return;

    window.fetch = function(input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var method = (init && init.method) || 'GET';
        // /api/listings/숫자  (admin 경로 제외, GET 만 대상)
        var m = url.match(/^\/api\/listings\/(\d+)(?:[\?#]|$)/);
        if (m && method.toUpperCase() === 'GET' && url.indexOf('/api/admin/') === -1) {
          var lid = m[1];
          var newUrl = '/api/admin/listings/' + lid;
          console.log(TAG + ' listing detail redirect lid=' + lid);
          var newInit = Object.assign({}, init || {});
          var h = Object.assign({}, (init && init.headers) || {});
          h['Authorization'] = 'Bearer wishes2026';
          newInit.headers = h;
          return origFetch.call(this, newUrl, newInit).then(function(resp) {
            // admin API: data.listing_images 만 있음 → data.images 로 미러링 (content.js 호환)
            return resp.clone().json().then(function(j) {
              try {
                if (j && j.success && j.data) {
                  if ((!j.data.images || j.data.images.length === 0) && Array.isArray(j.data.listing_images)) {
                    j.data.images = j.data.listing_images;
                  }
                }
              } catch(e){}
              return new Response(JSON.stringify(j), {
                status: resp.status,
                headers: { 'Content-Type': 'application/json' }
              });
            }).catch(function(){ return resp; });
          });
        }
      } catch(e) { console.warn(TAG + ' detail redirect hook error', e); }
      return origFetch.call(this, input, init);
    };
    console.log(TAG + ' /api/listings/[id] redirect installed');
  })();

  console.log(TAG + ' v' + VERSION + ' overlay ready (AI cache + fetch dedupe + detail redirect)');
})();
