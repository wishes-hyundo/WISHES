/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v314 — 매물수정 버튼 위치 이동 (사장님 제안)
 * 작성: 2026-04-29
 *
 * 사장님 지시: '기본 정보 옵션 우측 끝에 위치하면 좋을것 같은데'.
 *
 * 동작:
 *   1. 모달 등장 감지 (MutationObserver).
 *   2. v297-edit 가 .v240-hero 에 만든 .v297-edit-btn 을 찾음.
 *   3. .v240-section h2 중 textContent='기본 정보 · 옵션' 인 헤더 찾음.
 *   4. h2 를 flex 로 만들고 button 을 우측 끝에 이동 (DOM transfer — click handler 유지).
 *   5. v312 hero grid 도 정리 (button 빠진 자리 priceBox 가 자연 차지).
 *
 * 정책:
 *   - 모든 매물 보편 (특정 매물 hardcode 0)
 *   - v297 button click handler 보존 (DOM appendChild 는 핸들러 유지)
 *   - View Transitions API — 60fps 부드러운 이동
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v314-edit-btn-pos';

  function ensureCss() {
    if (document.getElementById('v314-css')) return;
    var s = document.createElement('style');
    s.id = 'v314-css';
    s.textContent =
      // h2 를 flex container 로 — 좌측 제목 + 우측 button
      '#ws-detail-container .v240-section h2.v314-with-btn{' +
      '  display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;' +
      '}' +
      // h2 안의 매물수정 button — 글자보다 작게, oklch + AAA contrast
      '#ws-detail-container h2.v314-with-btn .v297-edit-btn{' +
      '  margin:0 0 0 auto;padding:7px 14px;border-radius:8px;height:auto;' +
      '  background:color-mix(in oklch, oklch(58% 0.13 145) 8%, white);' +
      '  color:oklch(28% 0.13 145);' +
      '  border:1.5px solid color-mix(in oklch, oklch(58% 0.13 145) 35%, white);' +
      '  font-size:12.5px;font-weight:700;letter-spacing:.01em;cursor:pointer;' +
      '  transition:background .15s ease, transform .15s ease;' +
      '  view-transition-name:v297-edit-btn;' +
      '}' +
      '#ws-detail-container h2.v314-with-btn .v297-edit-btn:hover{' +
      '  background:color-mix(in oklch, oklch(58% 0.13 145) 18%, white);' +
      '  transform:translateY(-1px);' +
      '}' +
      '#ws-detail-container h2.v314-with-btn .v297-edit-btn:focus-visible{' +
      '  outline:3px solid oklch(58% 0.18 145);outline-offset:2px;' +
      '}' +
      // v312 hero grid → button 빠진 자리 priceBox 가 우측 차지
      '#ws-detail-container .v240-hero{grid-template-columns:1fr auto !important}' +
      '#ws-detail-container .v240-hero .v297-edit-btn{display:none !important}' +
      // 모바일: button 폭 자동
      '@container ws-hero (max-width: 640px){' +
      '  #ws-detail-container h2.v314-with-btn{flex-direction:row}' +
      '}' +
      // reduced motion
      '@media (prefers-reduced-motion:reduce){' +
      '  #ws-detail-container h2.v314-with-btn .v297-edit-btn:hover{transform:none}' +
      '}';
    document.head.appendChild(s);
  }

  function withTransition(fn) {
    if (typeof document.startViewTransition === 'function') {
      try { return document.startViewTransition(fn); } catch (_) { fn(); }
    } else {
      fn();
    }
  }

  function moveButton(modal) {
    var hero = modal.querySelector('.v240-hero');
    if (!hero) return;
    var btn = hero.querySelector('.v297-edit-btn');
    if (!btn) return;

    // h2 '기본 정보 · 옵션' 찾기 — 보편 매칭 (다양한 공백/문자)
    var targetH2 = null;
    modal.querySelectorAll('.v240-section h2').forEach(function (h) {
      if (targetH2) return;
      var t = String(h.textContent || '').replace(/\s+/g, '');
      if (/기본정보/.test(t) && /옵션/.test(t)) targetH2 = h;
    });
    if (!targetH2 || targetH2.dataset.v314 === '1') return;

    // 이미 다른 곳에 옮겨진 경우 (v314 기존 처리 매물) — skip
    if (btn.closest('h2')) return;

    // 60fps 이동 (DOM transfer = click handler 유지)
    withTransition(function () {
      targetH2.classList.add('v314-with-btn');
      targetH2.appendChild(btn);
      targetH2.dataset.v314 = '1';
    });
  }

  function applyAll() {
    try {
      ensureCss();
      var modal = document.getElementById('ws-detail-container') ||
                  document.querySelector('.ws-detail-container') ||
                  document.querySelector('[id^="ws-detail-modal"]') ||
                  document.querySelector('#ws-detail-content');
      if (!modal) return;
      moveButton(modal);
    } catch (e) {
      console.warn('[' + V + '] applyAll failed:', e && e.message);
    }
  }

  var debounceTimer = null;
  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyAll, 140); // v297 button 생성 대기
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].addedNodes && muts[i].addedNodes.length) { schedule(); return; }
    }
  });

  function start() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      schedule();
      console.log('[' + V + '] observer 시작 — 매물수정 버튼 → 기본정보·옵션 헤더 우측');
    } catch (e) { console.warn('[' + V + '] start failed:', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
