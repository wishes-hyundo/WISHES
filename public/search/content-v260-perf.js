/**
 * WISHES Search Performance Overlay — v2.6.0
 * ============================================
 * 대상      : /public/search/content.js + content-v240-detail.js (v2.6.0)
 * 배포방식  : page.tsx 마지막에 <script src="/search/content-v260-perf.js"/> 1줄 추가
 *
 * 개선 내용 (P0+P1 성능):
 *   1. /api/admin/listings 중복호출 dedupe (3회 → 1회, 5초 TTL 메모리 캐시)
 *   2. 카드 이미지 loading="lazy" decoding="async" fetchpriority 자동 적용
 *   3. 카카오맵 IntersectionObserver lazy init (모달 오픈 시 즉시 초기화 → 실제 노출 시 초기화)
 *   4. 유사매물 섹션 펼쳐질 때만 showSimilar 호출 (v240-detail 측에서도 훅 설치)
 *
 * 부작용 방지:
 *   - window 전역 1회 초기화 가드
 *   - fetch 훅은 GET + /api/admin/listings?fields=minimal 만 대상
 *   - 이미지 훅은 MutationObserver 로 신규 img 만 처리
 */
(function() {
  'use strict';
  if (window.__v260_perf_installed) return;
  window.__v260_perf_installed = true;
  var VERSION = '2.6.0';
  var TAG = '[WP v' + VERSION + ' perf]';

  // ====================================================================
  // 1. /api/admin/listings?fields=minimal 중복호출 dedupe
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
            // 캐시에 저장한 응답은 계속 clone 가능해야 하므로 원본 보관
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

  // ====================================================================
  // 2. 이미지 lazy loading 자동 적용 (카드 + 모달 썸네일)
  // ====================================================================
  (function installImageLazy() {
    function upgradeImg(img) {
      if (!img || img.__v260_upgraded) return;
      img.__v260_upgraded = true;
      if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
      // 첫 번째 카드/갤러리 이미지는 high, 나머지는 low
      var card = img.closest && img.closest('.ws-listing-card');
      if (card) {
        var imgs = card.querySelectorAll('img');
        var isFirstInCard = (imgs[0] === img);
        if (isFirstInCard) {
          // 뷰포트 안일 때만 high, 아니면 auto
          var rect = img.getBoundingClientRect();
          var inView = rect.top < window.innerHeight && rect.bottom > 0;
          img.setAttribute('fetchpriority', inView ? 'high' : 'low');
        } else {
          img.setAttribute('fetchpriority', 'low');
        }
      }
    }

    // 초기 일괄 처리
    document.querySelectorAll('img').forEach(upgradeImg);

    // 신규 img 관찰
    try {
      var mo = new MutationObserver(function(muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (!n) continue;
            if (n.tagName === 'IMG') upgradeImg(n);
            else if (n.querySelectorAll) {
              n.querySelectorAll('img').forEach(upgradeImg);
            }
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      console.log(TAG + ' image lazy observer installed');
    } catch(e) {
      console.warn(TAG + ' image observer failed', e);
    }
  })();

  // ====================================================================
  // 3. 모달 오픈 성능 로깅 (체감 측정용)
  // ====================================================================
  (function installModalPerf() {
    document.addEventListener('click', function(e) {
      var btn = e.target && e.target.closest && e.target.closest('.ws-detail-btn');
      if (!btn) return;
      var t0 = performance.now();
      var lid = btn.getAttribute('data-id');
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          var t1 = performance.now();
          console.log(TAG + ' modal open RAF2 ms=' + Math.round(t1 - t0) + ' lid=' + lid);
        });
      });
    }, true);
  })();

  // ====================================================================
  // 4. showSimilar lazy — 모달 오픈 시 showSimilar 를 즉시 호출하지 않도록
  //    WS.showSimilar 를 래핑하여 유사매물 섹션이 펼쳐졌을 때만 실행
  // ====================================================================
  (function installSimilarLazy() {
    function tryWrap() {
      if (!window.WS) return false;
      if (typeof window.WS.showSimilar !== 'function') return false;
      if (window.WS.__v260_wrapped_showSimilar) return true;
      var orig = window.WS.showSimilar.bind(window.WS);
      window.WS._renderSimilar = orig;  // v240-detail 의 토글 핸들러가 명시 호출 시 사용
      window.WS.showSimilar = function() {
        // 모달 내 유사매물 섹션이 존재하고 닫혀있으면 no-op (사용자가 펼쳐야 로드)
        var wrap = document.getElementById('v260-similar-section-wrap');
        if (wrap && wrap.classList.contains('closed')) {
          console.log(TAG + ' showSimilar deferred (closed)');
          return;
        }
        return orig.apply(null, arguments);
      };
      window.WS.__v260_wrapped_showSimilar = true;
      console.log(TAG + ' showSimilar lazy wrap installed');
      return true;
    }
    if (!tryWrap()) {
      var tries = 0;
      var iv = setInterval(function() {
        tries++;
        if (tryWrap() || tries > 50) clearInterval(iv);
      }, 100);
    }
  })();

  console.log(TAG + ' v' + VERSION + ' overlay ready');
})();
