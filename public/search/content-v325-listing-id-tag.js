/* /search content-v325 — 매물번호 강조 뱃지 (층수 앞 고정 배치)
 *
 * 사장님 명령 (2026-04-29):
 *   "매물번호가 너무 안보이는데 좀 눈에띄게 해서 층수 앞쪽으로 고정배치해줘"
 *
 * 동작:
 *   카드 .ws-listing-tags (층수/방/욕실/주차/EV/공실 가 들어있는 태그 stripe)
 *   의 첫 자식으로 "매물 {id}" 뱃지 강제 prepend.
 *   - 색깔: #2D5A27 (사이트 브랜드 짙은 녹색) + 흰 글씨 + font-weight 800
 *   - 크기: 다른 태그(.ws-tag-small)보다 약간 굵고 진하게
 *   - 클래스: ws-tag-listing-id ws-copy-id
 *     → content.js 의 클릭 핸들러(.ws-copy-id)가 자동으로 클립보드 복사 처리
 *   - data-copy: 매물번호
 *
 * 적용:
 *   - 카드 신규 생성 / 가상스크롤 재렌더링 / 비동기 데이터 로드 모두 cover
 *   - MutationObserver + 초기/0.5/1.5/3초 sweep
 *   - 첫 자리 보장: 태그 영역의 첫 자식이 우리 뱃지가 아니면 다시 맨 앞으로 이동
 *
 * 디자인 컨벤션: content.js 라인 3928 의 hero 매물번호 뱃지 색상(#2D5A27) 차용.
 */
(function () {
  'use strict';
  var V = 'v325-listing-id-tag';

  function applyToCard(card) {
    if (!card) return;
    var id = card.getAttribute('data-listing-id');
    if (!id) {
      var inner = card.querySelector('[data-listing-id]');
      if (inner) id = inner.getAttribute('data-listing-id');
    }
    if (!id) return;

    var tags = card.querySelector('.ws-listing-tags');
    if (!tags) return;

    var existing = tags.querySelector(':scope > .ws-tag-listing-id');
    if (existing) {
      // 매물번호 동기화
      if (existing.dataset.copy !== String(id)) {
        existing.dataset.copy = String(id);
        existing.textContent = '매물 ' + id;
      }
      // 항상 첫 자식 위치 보장
      if (tags.firstElementChild !== existing) {
        try { tags.insertBefore(existing, tags.firstElementChild); } catch (_) {}
      }
      return;
    }

    var tag = document.createElement('span');
    tag.className = 'ws-tag-listing-id ws-copy-id';
    tag.dataset.copy = String(id);
    tag.title = '매물번호 — 클릭하면 복사됩니다';
    tag.style.cssText = [
      'display:inline-block',
      'background:#2D5A27',
      'color:#fff',
      'padding:2px 9px',
      'border-radius:4px',
      'font-size:12px',
      'font-weight:800',
      'margin-right:6px',
      'cursor:pointer',
      'letter-spacing:-0.2px',
      'box-shadow:0 1px 2px rgba(0,0,0,.15)',
      'vertical-align:middle',
      'line-height:1.45'
    ].join(';');
    tag.textContent = '매물 ' + id;

    try { tags.insertBefore(tag, tags.firstElementChild); } catch (_) {}
  }

  function sweep() {
    try {
      var cards = document.querySelectorAll('.ws-listing-card');
      cards.forEach(applyToCard);
    } catch (e) {
      try { console.warn('[' + V + '] sweep error:', e); } catch (_) {}
    }
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
    __mo_throttle = setTimeout(function() { __mo_throttle = null; }, 1000);
    var hit = false;
    for (var i = 0; i < mutations.length && !hit; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.classList && (n.classList.contains('ws-listing-card') ||
                            n.classList.contains('ws-listing-tags'))) { hit = true; break; }
        if (n.querySelector && n.querySelector('.ws-listing-card, .ws-listing-tags')) { hit = true; break; }
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
    setTimeout(sweep, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try { window.WS = window.WS || {}; window.WS._v325 = { sweep: sweep }; } catch (_) {}
})();
