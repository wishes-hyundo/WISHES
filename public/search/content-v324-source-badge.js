/* /search content-v324 — 출처 뱃지(공실=파랑G / 온하우스=빨강O)
 *
 * 사장님 명령 (2026-04-29):
 *   "공실 파란색 온하우스 빨간색으로 하고 G O 아이콘으로 심플하게 구분짓게 해줘"
 *
 * 동작:
 *   1) 매물 카드 (.ws-listing-card) 의 .ws-listing-addr 첫 자식으로 G/O 뱃지 강제 보장
 *      - 공실클럽: 파랑 #1976D2 + G
 *      - 온하우스: 빨강 #E53935 + O
 *      - 자체 매물(source_site null): 뱃지 없음
 *   2) [v324b 2026-04-29] 매물번호 옆 mini 뱃지 제거 — 주소 옆과 중복이라 사장님 요청.
 *      이전 버전이 박았던 .ws-src-badge-mini 자동 청소.
 *   3) 매물 상세 모달 hero 주소 라인의 기존 'G 공실클럽' / 'O 온하우스' 뱃지를 동일 색 + G/O 단일 글자로 단순화
 *   4) 빠른 매물 패널(.ws-qp-id 주변)도 동일 처리 (있으면)
 *
 * 데이터: window.WS.allListings (id → source_site)
 * 안전장치: content.js 가 자체 카드 렌더링에서 다른 색(녹색/주황)으로 sourceBadge 를 prepend 해도
 *           MutationObserver + 정기 sweep 로 우리 뱃지로 재교체.
 */
(function () {
  'use strict';
  var V = 'v324-source-badge';
  var COLOR_G = '#1976D2'; // 공실클럽 파랑
  var COLOR_O = '#E53935'; // 온하우스 빨강

  // -------- helpers --------
  function getSourceById(id) {
    var arr = (window.WS && window.WS.allListings) || [];
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].id) === String(id)) return arr[i].source_site || '';
    }
    return '';
  }

  function badgeHtml(src, mini) {
    var sz = mini ? 14 : 18;
    var fs = mini ? 9 : 11;
    var common = 'display:inline-block;width:' + sz + 'px;height:' + sz + 'px;line-height:' + sz +
                 'px;text-align:center;border-radius:4px;color:#fff;font-size:' + fs +
                 'px;font-weight:800;margin-right:4px;vertical-align:middle;letter-spacing:-0.5px;';
    if (src === 'gongsilclub') {
      return '<span class="ws-src-badge ws-src-g" data-src="g" title="공실클럽 매물" style="background:' + COLOR_G + ';' + common + '">G</span>';
    }
    if (src === 'onhouse') {
      return '<span class="ws-src-badge ws-src-o" data-src="o" title="온하우스 매물" style="background:' + COLOR_O + ';' + common + '">O</span>';
    }
    return '';
  }

  // content.js 가 마운트한 기존 G/O 뱃지(녹색/주황) 인지 판별 후 제거
  function stripLegacyBadge(parent) {
    if (!parent) return;
    // 우리 뱃지는 .ws-src-badge 클래스 보유, 그 외에 G/O 텍스트 + 18px 정사각형 스타일이면 legacy
    var children = parent.children;
    for (var i = children.length - 1; i >= 0; i--) {
      var el = children[i];
      if (!el || el.tagName !== 'SPAN') continue;
      var cls = el.className || '';
      if (cls.indexOf('ws-src-badge') !== -1) continue; // 우리 거는 따로 dedup 처리
      var txt = (el.textContent || '').trim();
      var st = el.getAttribute('style') || '';
      if ((txt === 'G' || txt === 'O') && /(18px|width:\s*18)/.test(st)) {
        try { parent.removeChild(el); } catch (_) {}
      }
      // 모달용 'G 공실클럽' / 'O 온하우스' 도 제거 (G/O 글자만 새로 박을 거임)
      if (txt === 'G 공실클럽' || txt === 'O 온하우스') {
        try { parent.removeChild(el); } catch (_) {}
      }
    }
  }

  function ensureBadgeAtFront(container, src, mini) {
    if (!container) return;
    // 우리 뱃지 이미 있으면 그대로 놔두되 색/문자만 검증
    var ours = container.querySelector(':scope > .ws-src-badge');
    var expected = (src === 'gongsilclub') ? 'g' : (src === 'onhouse') ? 'o' : '';
    if (!expected) {
      // 자체 매물은 뱃지 없어야 함
      if (ours) try { ours.parentNode.removeChild(ours); } catch (_) {}
      return;
    }
    if (ours && ours.dataset.src === expected) {
      // legacy 잔재는 청소만
      stripLegacyBadge(container);
      return;
    }
    // legacy + 잘못된 우리 뱃지 모두 청소 후 재삽입
    if (ours) try { ours.parentNode.removeChild(ours); } catch (_) {}
    stripLegacyBadge(container);
    container.insertAdjacentHTML('afterbegin', badgeHtml(src, mini));
  }

  // -------- card sweep --------
  function applyToCard(card) {
    if (!card) return;
    var id = card.getAttribute('data-listing-id');
    if (!id) {
      var inner = card.querySelector('[data-listing-id]');
      if (inner) id = inner.getAttribute('data-listing-id');
    }
    if (!id) return;
    var src = getSourceById(id);
    if (!src) return; // allListings 아직 로드 전 → 다음 sweep 에 재시도

    // (1) 카드 주소 라인 앞 G/O
    var addr = card.querySelector('.ws-listing-addr');
    if (addr) ensureBadgeAtFront(addr, src, false);

    // (2) 우측 매물번호 옆 mini G/O — 매물번호 텍스트 앞에 prepend
    var idEl = card.querySelector('.ws-listing-id');
    if (idEl && (src === 'gongsilclub' || src === 'onhouse')) {
      var existingMini = idEl.previousElementSibling;
      if (!existingMini || !existingMini.classList || !existingMini.classList.contains('ws-src-badge-mini')) {
        var span = document.createElement('span');
        span.className = 'ws-src-badge-mini';
        span.dataset.src = (src === 'gongsilclub') ? 'g' : 'o';
        span.title = (src === 'gongsilclub') ? '공실클럽' : '온하우스';
        var c = (src === 'gongsilclub') ? COLOR_G : COLOR_O;
        span.style.cssText = 'display:inline-block;width:14px;height:14px;line-height:14px;text-align:center;border-radius:3px;background:' + c + ';color:#fff;font-size:9px;font-weight:800;margin-right:4px;vertical-align:middle;';
        span.textContent = (src === 'gongsilclub') ? 'G' : 'O';
        try { idEl.parentNode.insertBefore(span, idEl); } catch (_) {}
      } else {
        // 기존 mini 의 src 가 다르면 갱신
        var want = (src === 'gongsilclub') ? 'g' : 'o';
        if (existingMini.dataset.src !== want) {
          existingMini.dataset.src = want;
          existingMini.style.background = (src === 'gongsilclub') ? COLOR_G : COLOR_O;
          existingMini.textContent = (src === 'gongsilclub') ? 'G' : 'O';
          existingMini.title = (src === 'gongsilclub') ? '공실클럽' : '온하우스';
        }
      }
    }
  }

  // -------- modal sweep --------
  function applyToModal() {
    var modal = document.getElementById('ws-detail-container') ||
                document.querySelector('.ws-detail-container');
    if (!modal) return;
    // hero 영역 또는 modal 전체에서 'G 공실클럽' / 'O 온하우스' 텍스트 가진 span 찾아 G/O 단일 글자 + 색 통일
    var spans = modal.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      var t = (s.textContent || '').trim();
      if (t === 'G 공실클럽' || t === '공실클럽') {
        s.textContent = 'G';
        s.style.background = COLOR_G;
        s.style.width = '18px'; s.style.height = '18px';
        s.style.lineHeight = '18px';
        s.style.padding = '0';
        s.style.borderRadius = '4px';
        s.style.fontSize = '11px';
        s.style.fontWeight = '800';
        s.style.color = '#fff';
        s.title = '공실클럽 매물';
        s.classList.add('ws-src-badge', 'ws-src-g');
        s.dataset.src = 'g';
      } else if (t === 'O 온하우스' || t === '온하우스') {
        s.textContent = 'O';
        s.style.background = COLOR_O;
        s.style.width = '18px'; s.style.height = '18px';
        s.style.lineHeight = '18px';
        s.style.padding = '0';
        s.style.borderRadius = '4px';
        s.style.fontSize = '11px';
        s.style.fontWeight = '800';
        s.style.color = '#fff';
        s.title = '온하우스 매물';
        s.classList.add('ws-src-badge', 'ws-src-o');
        s.dataset.src = 'o';
      }
    }
  }

  // -------- quick panel sweep (.ws-qp-id 옆) --------
  function applyToQuickPanels() {
    var qpIds = document.querySelectorAll('.ws-qp-id');
    qpIds.forEach(function (idEl) {
      var t = (idEl.textContent || '').match(/매물번호\s*(\d+)/);
      if (!t) return;
      var src = getSourceById(t[1]);
      if (!src || (src !== 'gongsilclub' && src !== 'onhouse')) return;
      var prev = idEl.previousElementSibling;
      if (prev && prev.classList && prev.classList.contains('ws-src-badge-qp')) {
        var want = (src === 'gongsilclub') ? 'g' : 'o';
        if (prev.dataset.src !== want) {
          prev.dataset.src = want;
          prev.textContent = (src === 'gongsilclub') ? 'G' : 'O';
          prev.style.background = (src === 'gongsilclub') ? COLOR_G : COLOR_O;
        }
        return;
      }
      var sp = document.createElement('span');
      sp.className = 'ws-src-badge-qp';
      sp.dataset.src = (src === 'gongsilclub') ? 'g' : 'o';
      sp.title = (src === 'gongsilclub') ? '공실클럽' : '온하우스';
      sp.textContent = (src === 'gongsilclub') ? 'G' : 'O';
      var c = (src === 'gongsilclub') ? COLOR_G : COLOR_O;
      sp.style.cssText = 'display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:4px;background:' + c + ';color:#fff;font-size:10px;font-weight:800;margin-right:4px;vertical-align:middle;';
      try { idEl.parentNode.insertBefore(sp, idEl); } catch (_) {}
    });
  }

  function sweep() {
    try {
      var cards = document.querySelectorAll('.ws-listing-card');
      cards.forEach(applyToCard);
      applyToModal();
      applyToQuickPanels();
    } catch (e) {
      try { console.warn('[' + V + '] sweep error:', e); } catch (_) {}
    }
  }

  // debounce
  var t = null;
  function scheduleSweep() {
    if (t) return;
    t = setTimeout(function () { t = null; sweep(); }, 80);
  }

  // MutationObserver
  var mo = new MutationObserver(function (mutations) {
    var hit = false;
    for (var i = 0; i < mutations.length && !hit; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.classList && (n.classList.contains('ws-listing-card') ||
                            n.classList.contains('ws-listing-addr') ||
                            n.classList.contains('ws-detail-container') ||
                            n.classList.contains('v240-hero'))) { hit = true; break; }
        if (n.querySelector && n.querySelector('.ws-listing-card, .ws-listing-addr, .v240-hero, .ws-qp-id')) { hit = true; break; }
      }
    }
    if (hit) scheduleSweep();
  });

  function init() {
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    sweep();
    // allListings 비동기 로드 대비
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

  // 디버그 노출
  try { window.WS = window.WS || {}; window.WS._v324 = { sweep: sweep, getSourceById: getSourceById }; } catch (_) {}
})();
