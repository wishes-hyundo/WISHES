/* /search content-v331 — onhouse 매물 모달 이미지 placeholder
 *
 * 사장님 보고 (2026-04-29):
 *   "온하우스에 썸네일이랑 사진 안나오고 검정 화면만 나옴"
 *
 * 원인:
 *   onhouse 크롤러가 사진 URL 미수집 → listing_images 0건 → 모달 hero 이미지
 *   영역이 빈 swiper → 검은 background 만 표시.
 *
 * 동작:
 *   매물 모달 (.ws-detail-container) 의 hero 이미지 영역이 비어있으면
 *   placeholder div 삽입 — onhouse logo 색 + "사진 준비중" 안내.
 *
 * 데이터: window.WS.allListings — listing.images / listing.listing_images
 */
(function () {
  'use strict';
  var V = 'v331-onhouse-image-placeholder';

  function getListing(id) {
    var arr = (window.WS && window.WS.allListings) || [];
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].id) === String(id)) return arr[i];
    }
    return null;
  }

  function imageCount(l) {
    if (!l) return 0;
    var imgs = (l.images && l.images.length) ? l.images
              : (l.listing_images && l.listing_images.length) ? l.listing_images
              : [];
    return imgs.length;
  }

  function applyToModal() {
    var modal = document.getElementById('ws-detail-container') ||
                document.querySelector('.ws-detail-container');
    if (!modal) return;
    var idEl = modal.querySelector('[data-listing-id]');
    var id = idEl ? idEl.getAttribute('data-listing-id') : null;
    if (!id) {
      // hero 안 매물번호 텍스트에서 추출
      var t = modal.textContent || '';
      var m = t.match(/매물번호\s*(\d+)/);
      if (m) id = m[1];
    }
    if (!id) return;
    var l = getListing(id);
    if (!l) return;

    var src = l.source_site || '';
    if (src !== 'onhouse') return; // onhouse 만 처리
    if (imageCount(l) > 0) return; // 사진 있으면 skip

    // 모달 안 검정 hero 이미지 영역 찾기 — class 패턴 다양
    var heroImg = modal.querySelector('.v240-hero-image, .ws-detail-image, .v240-main-image, [class*="image-main"], [data-images]');
    if (!heroImg) {
      // fallback — 큰 검은 빈 div 찾기 (background 검정 + 큰 사이즈)
      var divs = modal.querySelectorAll('div');
      for (var i = 0; i < divs.length; i++) {
        var d = divs[i];
        if (!d.children.length) continue;
        var st = window.getComputedStyle(d);
        if (st.background.indexOf('black') !== -1 && d.offsetHeight > 200) {
          heroImg = d; break;
        }
      }
    }
    if (!heroImg) return;
    if (heroImg.dataset.v331 === '1') return;

    // placeholder 마운트
    heroImg.innerHTML =
      '<div class="ws-img-placeholder-v331" style="' +
      'width:100%;height:100%;min-height:280px;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:14px;' +
      'background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);' +
      'color:#92400e;border-radius:8px;padding:32px;">' +
        '<div style="font-size:48px;opacity:0.6;">🏠</div>' +
        '<div style="font-size:15px;font-weight:700;letter-spacing:-0.3px;">사진 준비중</div>' +
        '<div style="font-size:12px;color:#a16207;line-height:1.5;text-align:center;max-width:260px;">' +
          '온하우스 원본은 로그인이 필요해 자동 수집되지 않은 상태입니다.<br>' +
          (l.source_url ? '<a href="' + l.source_url + '" target="_blank" rel="noopener" style="color:#1976d2;font-weight:600;text-decoration:underline;margin-top:6px;display:inline-block;">원본 페이지에서 보기 →</a>' : '') +
        '</div>' +
      '</div>';
    heroImg.style.background = 'transparent';
    heroImg.dataset.v331 = '1';
  }

  function applyToCards() {
    // 카드 좌측 검정 placeholder 도 같은 톤으로 (이미 "이미지 준비중" 표시되니 skip)
    // 모달만 처리.
  }

  function sweep() {
    try { applyToModal(); applyToCards(); }
    catch (e) { try { console.warn('[' + V + ']', e); } catch (_) {} }
  }

  var t = null;
  function scheduleSweep() {
    if (t) return;
    t = setTimeout(function () { t = null; sweep(); }, 80);
  }

  var __mo_throttle = null;
  var mo = new MutationObserver(function (mutations) {
    // [Step 37 fix 2026-05-19 사장님 명령] throttle 250ms — Observer cascade freeze 차단
    if (__mo_throttle) return;
    __mo_throttle = setTimeout(function() { __mo_throttle = null; }, 250);
    var hit = false;
    for (var i = 0; i < mutations.length && !hit; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.classList && (n.classList.contains('ws-detail-container') ||
                            n.classList.contains('v240-hero'))) { hit = true; break; }
        if (n.querySelector && n.querySelector('.ws-detail-container, .v240-hero')) { hit = true; break; }
      }
    }
    if (hit) scheduleSweep();
  });

  function init() {
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    sweep();
    setTimeout(sweep, 500);
    setTimeout(sweep, 1500);
    setTimeout(sweep, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
