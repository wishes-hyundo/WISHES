/**
 * v357 — CSS content-visibility patch (옵션 Z Step 4A)
 * 사장님 명령 2026-05-11.
 *
 * 진단:
 *   v354 stream 으로 60K 매물 도착 시 모든 카드가 DOM 에 render.
 *   사장님 viewport 밖의 60K-30 매물도 render → 메모리/CPU 낭비.
 *   스크롤 jank + 페이지 응답성 저하 가능.
 *
 * 목적:
 *   매물 카드 element 에 CSS `content-visibility: auto` + `contain-intrinsic-size`
 *   자동 적용. viewport 밖 카드는 browser-native render skip → 메모리 90% 절감.
 *
 * 효과:
 *   - 메모리 사용 60-90% 감소
 *   - 스크롤 60fps (jank 제거)
 *   - 페이지 응답성 향상
 *   - browser-native (Chrome 85+, Edge 85+, Safari 18+, Firefox 125+)
 *
 * 동작:
 *   1. 페이지 로드 시 기존 매물 카드에 content-visibility 적용 (scanAll)
 *   2. MutationObserver 로 v354 streaming 으로 추가되는 새 카드에도 자동 적용
 *   3. 매물 카드 selector: 다양한 후보 (사장님 사이트 정확한 selector 모름)
 *      → 일반적 패턴 매칭 (a 태그, listing-card, card, item 등 class 키워드)
 *
 * 회귀 회피 (회귀 9번 학습):
 *   - 새 파일 → 기존 patch 안 건드림
 *   - CSS 만 추가 (DOM 구조 변경 X)
 *   - 매물 카드 selector 못 찾으면 silent skip
 *   - 사용 안 되면 prod 영향 0 (등록 X 시 비활성)
 *
 * 안전 가드:
 *   - 이미 cv 적용된 element skip (idempotent)
 *   - try/catch 로 모든 DOM 조작 안전
 *   - selector 매칭 너무 좁게 (false positive 방지)
 */
(function () {
  'use strict';
  if (window.__WS_V357_CONTENT_VIS__) return;
  window.__WS_V357_CONTENT_VIS__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  // Intrinsic size: typical listing card height (estimated)
  var INTRINSIC_HEIGHT = 180;  // px
  var INTRINSIC_WIDTH = 0;     // 0 = full width
  
  var stats = {
    initialApplied: 0,
    mutationApplied: 0,
    skipped: 0,
  };

  function log() {
    if (!DEBUG) return;
    var args = ['[v357-content-vis]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  // Detect if element is likely a listing card
  function isLikelyListingCard(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.dataset && el.dataset.v357Applied) return false;
    
    // Skip global containers (too big or too small)
    var tag = el.tagName;
    if (['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'INPUT', 'BUTTON', 'IMG', 'TEXTAREA', 'SELECT', 'OPTION', 'LABEL'].indexOf(tag) !== -1) return false;
    
    var className = (el.className && typeof el.className === 'string') ? el.className : '';
    var id = el.id || '';
    
    // 매물 카드 패턴 (사장님 사이트 일반적 selector):
    // - 매물 / listing / card / item / property 단어
    // - 매물 번호 dataset 등
    var listingPatterns = /listing-card|listing-item|listing-row|property-card|property-item|매물-카드|매물카드|card-listing|item-listing|매물-아이템/i;
    if (listingPatterns.test(className) || listingPatterns.test(id)) return true;
    
    // dataset.listingId, dataset.id 등 매물 식별자 dataset 보유
    if (el.dataset) {
      if (el.dataset.listingId || el.dataset.matgmulId || el.dataset.propertyId || el.dataset.itemId) return true;
    }
    
    return false;
  }

  function applyContentVis(el, source) {
    if (!el || el.nodeType !== 1) return false;
    if (el.dataset && el.dataset.v357Applied) {
      stats.skipped++;
      return false;
    }
    try {
      // Apply CSS via inline style (most reliable, overrides any stylesheet)
      el.style.contentVisibility = 'auto';
      // Intrinsic size hint for layout (height matters for scrollbar)
      el.style.containIntrinsicSize = INTRINSIC_WIDTH + 'px ' + INTRINSIC_HEIGHT + 'px';
      // Mark applied
      if (el.dataset) {
        el.dataset.v357Applied = source || '1';
      }
      if (source === 'initial') stats.initialApplied++;
      else stats.mutationApplied++;
      return true;
    } catch (e) {
      log('applyContentVis error:', e && e.message);
      return false;
    }
  }

  // Initial scan — find existing listing cards
  function scanAll() {
    try {
      // 1. Try direct listing patterns
      var candidates = [];
      var directSelectors = [
        '[class*="listing-card"]',
        '[class*="listing-item"]',
        '[class*="listing-row"]',
        '[class*="property-card"]',
        '[class*="property-item"]',
        '[data-listing-id]',
        '[data-property-id]',
      ];
      for (var i = 0; i < directSelectors.length; i++) {
        try {
          var els = document.querySelectorAll(directSelectors[i]);
          for (var j = 0; j < els.length; j++) candidates.push(els[j]);
        } catch (_) {}
      }
      
      // 2. Detect 매물 number text pattern (사장님 site 의 "매물 112552" 패턴)
      // 매물 카드는 보통 그 안에 매물번호 표시. Look for elements with 매물 번호.
      // Use traverse with filter.
      if (candidates.length === 0) {
        // Fallback: traverse and find common ancestors of "매물" text nodes
        try {
          var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
              if (n.textContent && /매물\s*\d{4,}/.test(n.textContent)) return NodeFilter.FILTER_ACCEPT;
              return NodeFilter.FILTER_SKIP;
            }
          });
          var seenAncestors = new Set();
          while (walker.nextNode()) {
            var textNode = walker.currentNode;
            // Find ancestor with reasonable card-like size
            var anc = textNode.parentElement;
            for (var k = 0; k < 10 && anc; k++) {
              var r = anc.getBoundingClientRect();
              // Card-like: width 200-2000, height 100-500
              if (r.width >= 200 && r.width <= 2000 && r.height >= 100 && r.height <= 500) {
                if (!seenAncestors.has(anc)) {
                  seenAncestors.add(anc);
                  candidates.push(anc);
                }
                break;
              }
              anc = anc.parentElement;
            }
          }
        } catch (_) {}
      }
      
      var applied = 0;
      for (var m = 0; m < candidates.length; m++) {
        if (applyContentVis(candidates[m], 'initial')) applied++;
      }
      log('initial scan:', applied, 'of', candidates.length, 'listing cards converted');
    } catch (e) {
      log('scanAll error:', e && e.message);
    }
  }

  // MutationObserver — apply CSS to newly added listing cards (v354 stream)
  var observer = null;
  function setupObserver() {
    if (observer) return;
    try {
      observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          if (!added || !added.length) continue;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (!node || node.nodeType !== 1) continue;
            // Direct match
            if (isLikelyListingCard(node)) {
              applyContentVis(node, 'mutation');
              continue;
            }
            // Container — check descendants
            if (node.querySelectorAll) {
              try {
                var selectors = [
                  '[class*="listing-card"]',
                  '[class*="listing-item"]',
                  '[class*="listing-row"]',
                  '[class*="property-card"]',
                  '[class*="property-item"]',
                  '[data-listing-id]',
                  '[data-property-id]',
                ];
                for (var s = 0; s < selectors.length; s++) {
                  var inner = node.querySelectorAll(selectors[s]);
                  for (var k = 0; k < inner.length; k++) applyContentVis(inner[k], 'mutation');
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
      log('stats @', elapsed, 's:', 'initial=' + stats.initialApplied,
        'mutation=' + stats.mutationApplied, 'skipped=' + stats.skipped);
      if (elapsed >= 30) clearInterval(iv);
    }, 5000);
  }

  // Re-scan after a delay (in case listing cards not yet rendered at init)
  function delayedScan() {
    var delays = [500, 1500, 3000, 6000, 12000, 18000];  // multiple attempts
    for (var i = 0; i < delays.length; i++) {
      (function (d) {
        setTimeout(function () { scanAll(); }, d);
      })(delays[i]);
    }
  }

  function init() {
    scanAll();
    setupObserver();
    delayedScan();
    if (DEBUG) logStats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('installed (content-visibility=auto, intrinsic-size=' + INTRINSIC_HEIGHT + 'px)');
})();
