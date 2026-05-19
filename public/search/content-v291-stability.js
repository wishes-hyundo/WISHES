/* ============================================================
 * content-v291-stability.js — WISHES /search 안정성 핫픽스
 * Deployed: 2026-04-20
 *
 * 작성 배경:
 *   v290 배포 후 정밀 검수 중 모바일 뷰포트(390×844)에서
 *   img.ws-listing-image 5개 전원이 opacity:0 상태로 고착되는
 *   현상 발견. inline style="opacity:1 !important" 을 강제
 *   세팅해도 computed opacity=0 으로 유지되는 비정상 상태.
 *   원인 특정 불가한 영역 — 렌더 파이프라인의 경합으로 추정.
 *
 *   사용자 지시: "기능보단 안정성" → 페이드 효과를 과감히 포기하고
 *   이미지는 무조건 즉시 full opacity 로 강제 표시.
 *
 * 적용 범위:
 *   [S1] v290 applyImageFade 무력화 — opacity 1 !important 고정
 *   [S2] data-ws-fade-applied 초기화 (누적 누수 방지)
 *   [S3] v290 불완전 상태로 남긴 transition/opacity:0 청소
 *   [S4] visibilitychange 시 safetyInterval 일시정지 (배터리)
 *   [S5] vibrate iOS 가드 — 'vibrate' in navigator 체크
 *   [S6] overscroll-behavior-y: contain — 네이티브 PTR 충돌 차단
 *   [S7] prefers-reduced-motion 전 애니메이션 제거
 *   [S8] MutationObserver 대상 축소 (.ws-listings 로 제한)
 *   [S9] aria-live 라이브 리전 — 검색결과 개수 변경 고지
 *
 * 보존 원칙:
 *   - v280 의 이미지 hydrate / G·O 배지 제거는 절대 건드리지 않음
 *   - v290 의 SVG 플레이스홀더 치환 / 빈상태 UI / 스크롤 복원 유지
 *   - 신규 기능 추가 없음 (안정성 수리 only)
 *
 * Rollback: window.__WS_V291_STABILITY__.rollback()
 * ============================================================ */
(function () {
  'use strict';

  if (window.__WS_V291_STABILITY__) {
    try { window.__WS_V291_STABILITY__.rollback && window.__WS_V291_STABILITY__.rollback(); } catch (e) {}
  }

  var STATE = {
    installedAt: Date.now(),
    safetyInterval: null,
    imgForceMO: null,
    liveRegion: null,
    prevCardCount: -1
  };

  // ------------------------------------------------------------------
  // [S1]+[S2]+[S3] 이미지 페이드 무력화 — 무조건 full opacity 고정
  // ------------------------------------------------------------------
  function forceImageVisible(root) {
    var scope = root || document;
    var imgs = scope.querySelectorAll('img.ws-listing-image, .ws-listing-image-wrap img');
    var n = 0;
    imgs.forEach(function (img) {
      // v290 이 심은 transition/opacity 상태를 말끔히 제거
      try {
        img.style.removeProperty('opacity');
        img.style.removeProperty('transition');
        // 아직 v290 의 다른 인라인 속성은 보존 (aspect-ratio 등)
      } catch (e) {}
      // 강제 full opacity (inline !important)
      img.style.setProperty('opacity', '1', 'important');
      // v290 의 페이드 가드 데이터셋 제거 (재적용 방지)
      if (img.dataset.wsFadeApplied) {
        try { delete img.dataset.wsFadeApplied; } catch (e) {
          img.removeAttribute('data-ws-fade-applied');
        }
      }
      n++;
    });
    return n;
  }

  // v290 의 applyImageFade 자체를 noop 으로 덮어써서 재감염 차단
  try {
    if (window.__WS_V290_POLISH__ && typeof window.__WS_V290_POLISH__.applyImageFade === 'function') {
      window.__WS_V290_POLISH__.applyImageFade = function () { /* disabled by v291 */ };
    }
  } catch (e) {}

  // 최초 + 재시도
  [0, 100, 400, 1000, 2200, 4000].forEach(function (ms) {
    setTimeout(function () { try { forceImageVisible(); } catch (e) {} }, ms);
  });

  // [S8] MutationObserver — 대상을 .ws-listings 로 제한하여 CPU 비용 축소
  function installImgForceMO() {
    var target = document.querySelector('.ws-listings') || document.body;
    try {
      // [Step 53 fix 2026-05-19 사장님 명령] throttle 300ms — img sweep 폭주 차단
      var __v291_throttle = null;
      var mo = new MutationObserver(function (muts) {
        var hit = false;
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].type === 'childList' && muts[i].addedNodes.length) { hit = true; break; }
        }
        if (!hit) return;
        if (__v291_throttle) return;
        __v291_throttle = setTimeout(function () { __v291_throttle = null; }, 300);
        try { forceImageVisible(); } catch (e) {}
      });
      mo.observe(target, { childList: true, subtree: true });
      STATE.imgForceMO = mo;
    } catch (e) {}
  }
  // .ws-listings 는 SPA 렌더 후 생기므로 확인 후 설치
  (function waitForListings(tries) {
    if (document.querySelector('.ws-listings')) {
      installImgForceMO();
      return;
    }
    if ((tries || 0) > 12) {
      // 타임아웃: body 로 폴백
      installImgForceMO();
      return;
    }
    setTimeout(function () { waitForListings((tries || 0) + 1); }, 400);
  })();

  // [S4] visibilitychange 로 safetyInterval 조절
  STATE.safetyInterval = setInterval(function () {
    try { forceImageVisible(); } catch (e) {}
  }, 3000);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (STATE.safetyInterval) {
        clearInterval(STATE.safetyInterval);
        STATE.safetyInterval = null;
      }
    } else {
      if (!STATE.safetyInterval) {
        STATE.safetyInterval = setInterval(function () {
          try { forceImageVisible(); } catch (e) {}
        }, 3000);
        // 즉시 1회 강제 실행
        try { forceImageVisible(); } catch (e) {}
      }
    }
  });

  // ------------------------------------------------------------------
  // [S5] navigator.vibrate iOS 가드 — v290 bindFavoriteHaptic 오버라이드
  // ------------------------------------------------------------------
  // v290 는 try/catch 로 감싸져 있어 오류는 없지만, iOS 에서 호출 자체가
  // "not a function" 에러를 낼 수 있어 상시 navigator.vibrate 체크로 전환.
  // 원 이벤트는 capture 단계에서 바인딩되어 있어 제거 불가 — 차단 불필요.
  // 대신 navigator.vibrate 가 undefined 인 경우 안전한 noop 로 대체.
  if (typeof navigator !== 'undefined' && !('vibrate' in navigator)) {
    try {
      // 일부 환경에서는 재정의가 막혀있을 수 있음 — 실패 무시
      Object.defineProperty(navigator, 'vibrate', { value: function () { return false; }, configurable: true });
    } catch (e) {}
  }

  // ------------------------------------------------------------------
  // [S6][S7] 안정성 CSS 주입
  // ------------------------------------------------------------------
  function injectStabilityCSS() {
    if (document.getElementById('ws-v291-css')) return;
    var st = document.createElement('style');
    st.id = 'ws-v291-css';
    st.textContent = [
      /* [S1 보강] CSS 레벨에서도 opacity 1 강제 — 최후의 안전판 */
      'img.ws-listing-image, .ws-listing-image-wrap img {',
      '  opacity: 1 !important;',
      '  visibility: visible !important;',
      '}',
      /* [S6] 네이티브 풀투리프레시 충돌 방지 */
      // [2026-05-14 사장님 명령] overscroll-behavior 제거 — 브라우저 native PTR 살림
      // 'html, body { overscroll-behavior-y: contain; }',
      // '.ws-search-container, .ws-listings { overscroll-behavior-y: contain; }',
      /* [S7] prefers-reduced-motion: 모든 애니메이션/전환 중단 */
      /* 2026-05-10 fix: animation-duration shorthand cascade 충돌 수정 */
      '@media (prefers-reduced-motion: reduce) {',
      '  *, *::before, *::after {',
      '    animation: none !important;',
      '    transition: none !important;',
      '    scroll-behavior: auto !important;',
      '  }',
      '}',
      /* [S9] 라이브 리전 시각적 숨김 (SR만 감지) */
      '.ws-sr-live {',
      '  position: absolute !important;',
      '  width: 1px !important; height: 1px !important;',
      '  padding: 0 !important; margin: -1px !important;',
      '  overflow: hidden !important; clip: rect(0,0,0,0) !important;',
      '  white-space: nowrap !important; border: 0 !important;',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }
  injectStabilityCSS();

  // ------------------------------------------------------------------
  // [S9] 검색결과 개수 변경을 SR 사용자에게 고지
  // ------------------------------------------------------------------
  function ensureLiveRegion() {
    if (STATE.liveRegion && document.body.contains(STATE.liveRegion)) return STATE.liveRegion;
    var el = document.createElement('div');
    el.id = 'ws-sr-live-v291';
    el.className = 'ws-sr-live';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
    STATE.liveRegion = el;
    return el;
  }

  function announceCardCount() {
    try {
      var cards = document.querySelectorAll('.ws-listing-card').length;
      if (cards === STATE.prevCardCount) return;
      STATE.prevCardCount = cards;
      var r = ensureLiveRegion();
      r.textContent = cards === 0
        ? '조건에 맞는 매물이 없습니다'
        : (cards + '건의 매물을 찾았습니다');
    } catch (e) {}
  }
  [1000, 2500, 5000].forEach(function (ms) {
    setTimeout(function () { try { announceCardCount(); } catch (e) {} }, ms);
  });
  // 주기적 감지 (저빈도)
  var announceT = setInterval(announceCardCount, 4000);
  STATE.announceT = announceT;

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  window.__WS_V291_STABILITY__ = {
    installedAt: STATE.installedAt,
    state: STATE,
    forceImageVisible: forceImageVisible,
    announceCardCount: announceCardCount,
    rollback: function () {
      try { STATE.imgForceMO && STATE.imgForceMO.disconnect(); } catch (e) {}
      try { STATE.safetyInterval && clearInterval(STATE.safetyInterval); } catch (e) {}
      try { STATE.announceT && clearInterval(STATE.announceT); } catch (e) {}
      try {
        var s = document.getElementById('ws-v291-css');
        if (s) s.remove();
      } catch (e) {}
      try {
        if (STATE.liveRegion) STATE.liveRegion.remove();
      } catch (e) {}
      STATE.imgForceMO = null;
      STATE.safetyInterval = null;
      STATE.announceT = null;
      STATE.liveRegion = null;
      delete window.__WS_V291_STABILITY__;
    }
  };
})();
