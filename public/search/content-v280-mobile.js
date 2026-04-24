/* ============================================================
 * content-v280-mobile.js — WISHES /search 모바일 최적화 런타임 패치
 * Deployed: 2026-04-20
 *
 * 목적:
 *   1) lazy 이미지 로더 실패 회피 — 즉시 src 세팅 + MutationObserver
 *   2) 크롤링 출처 G/O 배지 DOM 제거 (source_site 누설 차단)
 *   3) 모바일(<=768px) 필터 섹션 초기 접힘 + 토글
 *   4) type·region·bottom-bar 수평 스크롤 힌트 제거 (스크롤바 숨김)
 *
 * 보존 원칙:
 *   - 신규 기능 추가 없음 (폴리싱만)
 *   - 크롤링 소스명 UI 노출 금지 규칙 준수
 *   - 기존 이벤트 델리게이션/메모 저장 등 일절 건드리지 않음
 *
 * Rollback: window.__WS_V280_MOBILE__.rollback()
 * ============================================================ */
(function () {
  'use strict';

  if (window.__WS_V280_MOBILE__) {
    try { window.__WS_V280_MOBILE__.rollback && window.__WS_V280_MOBILE__.rollback(); } catch (e) {}
  }

  var STATE = {
    installedAt: Date.now(),
    imgMO: null,
    badgeMO: null,
    filterBound: false
  };

  // ------------------------------------------------------------------
  // 1. 이미지 즉시 로드 — data-src → src 전이
  //    원인: content.js 의 IntersectionObserver 가 Cloudflare/브라우저 이슈로
  //    콜백이 발화하지 않아 20/20 empty src 상태로 고착
  //    해결: 렌더 직후 즉시 src 세팅 + 네이티브 loading="lazy" 로 대체
  // ------------------------------------------------------------------
  function hydrateImages(root) {
    var scope = root || document;
    var imgs = scope.querySelectorAll('img.ws-lazy[data-src], img[data-src]');
    var n = 0;
    imgs.forEach(function (img) {
      var u = img.getAttribute('data-src');
      if (!u) return;
      img.src = u;
      img.removeAttribute('data-src');
      img.classList.remove('ws-lazy');
      if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
      n++;
    });
    return n;
  }

  // 최초 + 타이밍별 재시도 (SPA 렌더 안전망)
  [0, 120, 350, 800, 1600, 3000, 5500].forEach(function (ms) {
    setTimeout(function () { try { hydrateImages(); } catch (e) {} }, ms);
  });

  // MutationObserver: 새 카드 렌더 시 즉시 hydrate (SYNC — rAF 지연 제거)
  //  이전 버전은 rAF 로 배치했는데 탭 백그라운드·리사이즈 재렌더에서 rAF
  //  가 드롭되어 data-src 가 남는 현상 발견. 즉시 호출로 전환.
  try {
    var imgMO = new MutationObserver(function (mutations) {
      var hit = false;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].type === 'childList' && mutations[i].addedNodes.length) { hit = true; break; }
      }
      if (!hit) return;
      try { hydrateImages(); } catch (e) {}
    });
    // .ws-listings 은 SPA 에서 교체될 수 있으므로 body 까지 감시
    imgMO.observe(document.body, { childList: true, subtree: true });
    STATE.imgMO = imgMO;
  } catch (e) {}

  // scroll/resize 시에도 안전망 — 느슨한 디바운스
  var hydrateScrollT = null;
  window.addEventListener('scroll', function () {
    if (hydrateScrollT) return;
    hydrateScrollT = setTimeout(function () {
      hydrateScrollT = null;
      try { hydrateImages(); } catch (e) {}
    }, 250);
  }, { passive: true });

  // resize 에도 재수화 (content.js 가 리사이즈 후 리렌더)
  var hydrateResizeT = null;
  window.addEventListener('resize', function () {
    if (hydrateResizeT) return;
    hydrateResizeT = setTimeout(function () {
      hydrateResizeT = null;
      try { hydrateImages(); stripSourceBadges(); } catch (e) {}
    }, 300);
  }, { passive: true });

  // 궁극의 안전망 — 2초 인터벌 (저부하)
  var SAFETY_INTERVAL = setInterval(function () {
    try { hydrateImages(); stripSourceBadges(); } catch (e) {}
  }, 2000);
  STATE.safetyInterval = SAFETY_INTERVAL;

  // ------------------------------------------------------------------
  // 2. 크롤링 출처 G/O 배지 DOM 제거
  //    content.js line 2704-2708 에서 source_site → 4CAF50/FF9800 단일 글자
  //    배지를 ws-listing-addr 앞에 인라인 삽입. 정책상 UI 노출 금지.
  // ------------------------------------------------------------------
  function stripSourceBadges(root) {
    var scope = root || document;
    // 4CAF50 / FF9800 배경색을 가진 단일 글자 span
    var selectors = [
      '.ws-listing-addr > span[style*="4CAF50"]',
      '.ws-listing-addr > span[style*="FF9800"]',
      '.ws-listing-addr > span[style*="background:#4CAF50"]',
      '.ws-listing-addr > span[style*="background:#FF9800"]'
    ];
    var count = 0;
    scope.querySelectorAll(selectors.join(',')).forEach(function (el) {
      var t = (el.textContent || '').trim();
      if (t === 'G' || t === 'O') { el.remove(); count++; }
    });
    return count;
  }
  [0, 120, 350, 800, 1600, 3000].forEach(function (ms) {
    setTimeout(function () { try { stripSourceBadges(); } catch (e) {} }, ms);
  });

  try {
    var badgeMO = new MutationObserver(function (mutations) {
      var hit = false;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].type === 'childList' && mutations[i].addedNodes.length) { hit = true; break; }
      }
      if (!hit) return;
      try { stripSourceBadges(); } catch (e) {}
    });
    badgeMO.observe(document.body, { childList: true, subtree: true });
    STATE.badgeMO = badgeMO;
  } catch (e) {}

  // ------------------------------------------------------------------
  // 3. 모바일 필터 섹션 초기 접힘
  //    <=768px 에서 필터가 매번 펼쳐져 있어 매물 카드 진입 전까지
  //    긴 스크롤 필요 → 기본 접힘, 토글로 펼치기
  // ------------------------------------------------------------------
  function initMobileFilterCollapse() {
    if (STATE.filterBound) return;
    if (window.innerWidth > 768) return;

    var toggle = document.querySelector('.ws-filters-toggle');
    var grid = document.querySelector('.ws-filter-grid');
    if (!toggle || !grid) return;

    STATE.filterBound = true;

    var extras = document.querySelectorAll('.ws-filter-hrow, .ws-price-grid');
    var originalText = toggle.textContent;

    // 초기 접힘
    var collapsed = true;
    var apply = function () {
      grid.style.display = collapsed ? 'none' : '';
      extras.forEach(function (el) { el.style.display = collapsed ? 'none' : ''; });
      // 원문 텍스트에 chevron 만 덧붙임 (원문 훼손 금지)
      var marker = collapsed ? ' ▼' : ' ▲';
      toggle.textContent = originalText.replace(/\s*[▼▲]\s*$/, '') + marker;
    };
    apply();

    toggle.addEventListener('click', function () {
      collapsed = !collapsed;
      apply();
    });
  }
  [260, 900, 2100].forEach(function (ms) {
    setTimeout(function () { try { initMobileFilterCollapse(); } catch (e) {} }, ms);
  });

  // ------------------------------------------------------------------
  // 4. favorite/detail 버튼 접근성: aria-label 보강 (SR/키보드 사용자)
  // ------------------------------------------------------------------
  function a11yBoost(root) {
    var scope = root || document;
    scope.querySelectorAll('.ws-favorite-btn:not([aria-label])').forEach(function (b) {
      b.setAttribute('aria-label', '즐겨찾기');
      b.setAttribute('type', 'button');
    });
    scope.querySelectorAll('.ws-photo-upload-btn:not([aria-label])').forEach(function (b) {
      b.setAttribute('aria-label', '사진 등록');
      b.setAttribute('type', 'button');
    });
    scope.querySelectorAll('.ws-listing-checkbox:not([aria-label])').forEach(function (b) {
      b.setAttribute('aria-label', '매물 선택');
    });
    scope.querySelectorAll('.ws-modal-close:not([aria-label])').forEach(function (b) {
      b.setAttribute('aria-label', '닫기');
    });
  }
  [300, 1200, 3000].forEach(function (ms) {
    setTimeout(function () { try { a11yBoost(); } catch (e) {} }, ms);
  });

  // ------------------------------------------------------------------
  // Public rollback API
  // ------------------------------------------------------------------
  window.__WS_V280_MOBILE__ = {
    installedAt: STATE.installedAt,
    state: STATE,
    hydrateImages: hydrateImages,
    stripSourceBadges: stripSourceBadges,
    rollback: function () {
      try { STATE.imgMO && STATE.imgMO.disconnect(); } catch (e) {}
      try { STATE.badgeMO && STATE.badgeMO.disconnect(); } catch (e) {}
      try { STATE.safetyInterval && clearInterval(STATE.safetyInterval); } catch (e) {}
      STATE.imgMO = null;
      STATE.badgeMO = null;
      STATE.safetyInterval = null;
      STATE.filterBound = false;
      delete window.__WS_V280_MOBILE__;
    }
  };
})();
