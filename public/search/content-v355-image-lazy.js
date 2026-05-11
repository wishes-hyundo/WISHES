/**
 * v355 — Image lazy loading patch (옵션 Z Step 2A)
 * 사장님 명령 2026-05-11.
 *
 * 진단 결과:
 *   v354 streaming 이후: 매물 카드 빠르게 표시 → 사진은 차례대로 천천히 로드.
 *   60K 매물 이미지가 viewport 밖에서도 동시 로드 → 브라우저 connection pool exhaust.
 *
 * 목적:
 *   모든 매물 카드 이미지에 native `loading="lazy"` + `decoding="async"` 자동 적용.
 *   viewport 진입 직전 이미지만 로드 → 사진 1초 안에 보임.
 *
 * 동작:
 *   1. 페이지 로드 시 기존 img 일괄 처리 (scanAll).
 *   2. MutationObserver 로 새 img element 추가 시 자동 lazy 적용.
 *      - v354 streaming 으로 매물 카드 점진 추가 → 매번 lazy 적용.
 *   3. 이미 lazy 인 img 는 skip (idempotent).
 *
 * 효과 예상:
 *   - 사장님 viewport: ~30개 이미지만 즉시 로드 → 1초 안 표시
 *   - 스크롤 시: 추가 이미지가 viewport 진입 직전 lazy 로드
 *   - 전체 60K 이미지 동시 로드 제거 → 브라우저 connection pool 정상
 *
 * 회귀 회피 (회귀 9번 학습):
 *   - 새 파일 → 기존 patch (v349, v354, v346 등) 안 건드림
 *   - native loading attr 만 set → JS overhead X
 *   - img.src 동작 그대로 (browser-native lazy)
 *   - 이미 lazy / loading attr 있으면 skip (idempotent)
 *   - 사용 안 되면 prod 영향 0 (등록 X 시 비활성)
 *
 * 안전 가드:
 *   - data-v355-applied attr 로 중복 처리 회피
 *   - try/catch 로 모든 DOM mutation 안전
 *   - MutationObserver disconnect 조건 X (영구 작동)
 *
 * 호환성:
 *   - native loading="lazy": 2022+ 모든 메이저 브라우저 (Chrome 77+, Firefox 75+, Safari 15.4+)
 *   - decoding="async": 모든 브라우저
 *   - fallback 불필요 (사장님 환경 Chrome 최신)
 */
(function () {
  'use strict';
  if (window.__WS_V355_IMAGE_LAZY__) return;
  window.__WS_V355_IMAGE_LAZY__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var stats = {
    initialScanned: 0,
    mutationApplied: 0,
    skipped: 0,
  };

  function log() {
    if (!DEBUG) return;
    var args = ['[v355-image-lazy]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function makeImgLazy(img, source) {
    if (!img || img.nodeType !== 1 || img.tagName !== 'IMG') return false;
    if (img.dataset && img.dataset.v355Applied) {
      stats.skipped++;
      return false;
    }
    try {
      // Native lazy loading (browser-native, no JS overhead, no Intersection Observer needed)
      if (!img.loading || img.loading === 'eager') {
        img.loading = 'lazy';
      }
      // Async decode (offload from main thread)
      if (!img.decoding) {
        img.decoding = 'async';
      }
      // Mark applied
      if (img.dataset) {
        img.dataset.v355Applied = source || '1';
      }
      if (source === 'initial') stats.initialScanned++;
      else stats.mutationApplied++;
      return true;
    } catch (e) {
      log('makeImgLazy error:', e && e.message);
      return false;
    }
  }

  // Initial scan — process all existing imgs on page load
  function scanAll() {
    try {
      var imgs = document.querySelectorAll('img');
      var applied = 0;
      for (var i = 0; i < imgs.length; i++) {
        if (makeImgLazy(imgs[i], 'initial')) applied++;
      }
      log('initial scan:', applied, 'of', imgs.length, 'imgs converted to lazy');
    } catch (e) {
      log('scanAll error:', e && e.message);
    }
  }

  // MutationObserver — handle dynamically added imgs (v354 streaming 으로 매물 카드 추가 시)
  var observer = null;
  function setupObserver() {
    if (observer) return;
    try {
      observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          var added = m.addedNodes;
          if (!added || !added.length) continue;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (!node || node.nodeType !== 1) continue;
            // Direct img element
            if (node.tagName === 'IMG') {
              makeImgLazy(node, 'mutation');
              continue;
            }
            // Container — check descendants
            if (node.querySelectorAll) {
              try {
                var inner = node.querySelectorAll('img');
                for (var k = 0; k < inner.length; k++) {
                  makeImgLazy(inner[k], 'mutation');
                }
              } catch (_) {}
            }
          }
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
      log('MutationObserver installed');
    } catch (e) {
      log('setupObserver error:', e && e.message);
    }
  }

  // Periodic stats log (debug only — first 30s)
  function logStats() {
    var t0 = Date.now();
    var iv = setInterval(function () {
      var elapsed = Math.round((Date.now() - t0) / 1000);
      log('stats @', elapsed, 's:', 'initial=' + stats.initialScanned,
        'mutation=' + stats.mutationApplied, 'skipped=' + stats.skipped);
      if (elapsed >= 30) clearInterval(iv);
    }, 5000);
  }

  function init() {
    scanAll();
    setupObserver();
    if (DEBUG) logStats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('installed (native loading=lazy + MutationObserver)');
})();
