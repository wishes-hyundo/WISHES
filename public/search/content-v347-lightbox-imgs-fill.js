/**
 * content-v347-lightbox-imgs-fill.js (2026-05-11)
 *
 * 사장님 발견 (캡처 2): 모달 사진 클릭하여 확대 모드 진입 시 1/1 표시 + 좌/우 화살표 사라짐.
 * 모달 자체 (v250) 는 1/8 정상 — 즉 모달 갤러리 navigation 은 OK.
 * 회귀 부분 = 확대 모드 (v247 lightbox).
 *
 * 진짜 원인:
 *   v247 line 1344: imgs = JSON.parse(mainEl.getAttribute('data-images') || '[]');
 *   data-images attribute 가 1 entry 만 가짐 (route.ts 가 listing_images 1개만 응답하므로).
 *   v250 은 fallback 으로 .ws-thumb[data-url] 사용 → 8장. v247 은 fallback X.
 *
 * Fix:
 *   capture phase 에서 #ws-gallery-main 클릭 가로챔.
 *   .ws-thumb[data-url] DOM 에서 모든 사진 URL 수집.
 *   data-images attribute 강제 set (v247 보다 먼저 실행).
 *   v247 가 이 fresh attribute 사용 → 모든 사진 표시.
 *
 * 안전 가드:
 *   - capture phase = v247 의 listener 보다 먼저 실행 (v247 도 capture true)
 *   - 우리 listener 는 attribute 만 set, click 흐름 계속 (preventDefault X)
 *   - .ws-thumb 없으면 attribute set 안 함 (original v247 동작 유지)
 *   - 1 entry 매물 (사진 1장) 도 정상 (urls.length <= 1 이면 set 안 함)
 *   - 위험 매우 낮음 — DOM attribute set 만, 다른 동작 영향 0
 *
 * 검증:
 *   - 매물 112552 (사진 8장): 확대 모드 1/8 + 화살표 표시
 *   - 매물 102644 (사진 20장): 확대 모드 1/20 + 화살표 표시
 *   - 사진 1장 매물: 확대 모드 1/1 (원래 그래야 함)
 */
(function () {
  'use strict';
  if (window.__WS_V347_LIGHTBOX_FIX__) return;
  window.__WS_V347_LIGHTBOX_FIX__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // Capture phase 로 v247 의 listener 보다 먼저 실행
  document.addEventListener('click', function (ev) {
    try {
      // v248 nav button 은 v247 가 skip — 우리도 skip
      if (ev.target && ev.target.closest && ev.target.closest('.v248-nav-btn')) return;
      if (ev.target && ev.target.closest && ev.target.closest('.v250-nav-btn')) return;

      var m = ev.target && ev.target.closest ? ev.target.closest('#ws-gallery-main') : null;
      if (!m) return;

      // .ws-thumb[data-url] 에서 모든 사진 URL 수집 (v250 collectImgs 와 동일 logic)
      var root = m.closest('.v240-body') || document;
      var thumbs = root.querySelectorAll('.ws-thumb[data-url]');
      if (!thumbs || thumbs.length <= 1) return; // 1장 이하면 원래 동작 유지

      var urls = [];
      for (var i = 0; i < thumbs.length; i++) {
        var u = thumbs[i].getAttribute('data-url');
        if (u) urls.push(u);
      }
      if (urls.length <= 1) return;

      // data-images attribute 강제 set (v247 가 이걸 사용)
      m.setAttribute('data-images', JSON.stringify(urls));
    } catch (e) {
      try { console.warn('[v347-lightbox-fix]', e); } catch (_) {}
    }
  }, true); // capture phase

  try { console.log('[v347-lightbox-fix] active'); } catch (_) {}
})();
