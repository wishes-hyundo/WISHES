/**
 * content-v336-img-thumbnail.js (2026-05-09)
 *
 * Wishes /search — Step L Phase 1.2: 카드 썸네일 size 강제 ?w=400
 *
 * 진단 (사장님 측정 2026-05-09):
 *   /search Network 분석 → Finish 26.26s 의 큰 부분 = img-proxy 이미지 다운로드
 *   - 카드 썸네일 1장 = 2-6 MB (img-proxy?url=...&w=1920)
 *   - 매물 100개 첫 화면 → 100장 × 평균 3MB = 300 MB 다운로드 시도
 *   - 결과: 사장님 26초 로딩 의 70-80% = 이미지 다운로드 시간
 *
 * 해결:
 *   1. MutationObserver 로 DOM 의 모든 img element 감시
 *   2. src 가 /api/img-proxy?url=...&w=1920 형식이면 자동 ?w=400 변환
 *   3. 카드 썸네일 size 100KB-300KB (1920 의 1/10~1/15)
 *   4. 모달 hero 이미지 (큰 사진) 는 변환 X — popup/modal 안 element 는 skip
 *
 * 효과:
 *   - 카드 첫 화면 100장 = 5-15 MB (1920 200-300MB 의 1/30)
 *   - 다운로드 시간 26초 → 약 2-3초 (이미지 부분)
 *   - 사장님 체감 매물 카드 즉시 표시
 *   - 첫 viewport 만 lazy load 하면 추가 단축 가능 (Step M 에서)
 *
 * 위험: 0% (DOM observer 만, content.js 무영향, 망가져도 patch 1개 제거 = 5초 fix)
 *
 * INVARIANT:
 *   - 모달 hero img (크게 보기) 는 원본 size 유지
 *   - 카드 썸네일만 ?w=400 변환
 *   - data-ws-thumb-converted 속성으로 중복 변환 차단
 */
(function () {
  'use strict';

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var THUMB_W = 400; // 카드 썸네일 width (display 80-200px 의 retina 2x)
  var TAG = 'data-ws-thumb-converted';
  var SKIP_PARENT_SELECTORS = [
    '.v240-hero',           // 모달 메인 사진
    '.v240-gallery',        // 모달 갤러리
    '.v240-detail-img',     // 모달 상세 이미지
    '.v240-modal',          // 모달 전체 영역 (안전 wildcard)
    '.ws-listing-detail',   // 상세 페이지
    '#v240-photo-modal',    // 사진 클릭 시 popup
    '[data-ws-img-original]', // 명시 원본 보존 표시
  ];

  function _isInsideSkipZone(el) {
    if (!el) return false;
    var node = el;
    var depth = 0;
    while (node && depth < 10) {
      if (node.matches) {
        for (var i = 0; i < SKIP_PARENT_SELECTORS.length; i++) {
          try {
            if (node.matches(SKIP_PARENT_SELECTORS[i])) return true;
          } catch (e) {}
        }
      }
      node = node.parentNode;
      depth++;
    }
    return false;
  }

  function _convertImg(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.getAttribute(TAG)) return false;
    var src = img.getAttribute('src') || '';
    if (!src) return false;
    if (_isInsideSkipZone(img)) {
      img.setAttribute(TAG, 'skip-modal');
      return false;
    }
    // /api/img-proxy?url=...&w=1920 형식만 변환
    if (src.indexOf('/api/img-proxy') < 0 && src.indexOf('img-proxy') < 0) {
      img.setAttribute(TAG, 'skip-non-proxy');
      return false;
    }
    var match = src.match(/[?&]w=(\d+)/);
    var currentW = match ? parseInt(match[1], 10) : null;
    if (currentW && currentW <= THUMB_W) {
      img.setAttribute(TAG, 'already-small');
      return false; // 이미 작음
    }
    var newSrc;
    if (match) {
      newSrc = src.replace(/([?&])w=\d+/, '$1w=' + THUMB_W);
    } else if (src.indexOf('?') >= 0) {
      newSrc = src + '&w=' + THUMB_W;
    } else {
      newSrc = src + '?w=' + THUMB_W;
    }
    img.src = newSrc;
    img.setAttribute(TAG, 'converted');
    return true;
  }

  var _convertedCount = 0;
  function _scanAll() {
    try {
      var imgs = document.querySelectorAll('img:not([' + TAG + '])');
      for (var i = 0; i < imgs.length; i++) {
        if (_convertImg(imgs[i])) _convertedCount++;
      }
    } catch (e) {}
  }

  // MutationObserver 로 새 추가 img 감시
  function _installObserver() {
    if (!window.MutationObserver) return;
    if (window.__WS_THUMB_OBS) return;
    var obs = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var added = mutations[m].addedNodes;
        if (!added) continue;
        for (var n = 0; n < added.length; n++) {
          var node = added[n];
          if (!node || node.nodeType !== 1) continue;
          if (node.tagName === 'IMG') {
            if (_convertImg(node)) _convertedCount++;
          } else if (node.querySelectorAll) {
            try {
              var inner = node.querySelectorAll('img:not([' + TAG + '])');
              for (var i = 0; i < inner.length; i++) {
                if (_convertImg(inner[i])) _convertedCount++;
              }
            } catch (e) {}
          }
        }
        // attribute change (src 동적 변경)
        if (mutations[m].type === 'attributes' &&
            mutations[m].attributeName === 'src' &&
            mutations[m].target.tagName === 'IMG') {
          var t = mutations[m].target;
          t.removeAttribute(TAG);
          if (_convertImg(t)) _convertedCount++;
        }
      }
    });
    obs.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
    window.__WS_THUMB_OBS = obs;
  }

  // 진단 helper
  window.WS = window.WS || {};
  window.WS._thumbStats = function () {
    try {
      var all = document.querySelectorAll('img');
      var conv = document.querySelectorAll('img[' + TAG + '="converted"]');
      var skip = document.querySelectorAll('img[' + TAG + '="skip-modal"]');
      var sma = document.querySelectorAll('img[' + TAG + '="already-small"]');
      console.log('[ws-thumb] total imgs:', all.length,
        '| converted:', conv.length,
        '| skip-modal:', skip.length,
        '| already-small:', sma.length);
      return { total: all.length, converted: conv.length, skipModal: skip.length };
    } catch (e) { return null; }
  };

  // 부트
  _scanAll();
  _installObserver();

  // 페이지 로드 후 추가 scan (지연 추가 element 처리)
  setTimeout(_scanAll, 500);
  setTimeout(_scanAll, 2000);
  setTimeout(function () {
    try {
      console.log('[ws-thumb] v336 ready — ' + _convertedCount +
        ' card thumbnails converted to ?w=' + THUMB_W +
        ' (modal hero excluded). 진단: window.WS._thumbStats()');
    } catch (_) {}
  }, 3000);
})();
