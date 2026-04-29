/* /search content-v330 — 룸 라벨 (원룸/투룸/1.5룸/쓰리룸/쓰리룸+)
 *
 * 사장님 명령 (2026-04-29):
 *   "매물번호 층수 옆 2개방 1개방이 아니라 원룸 투룸 1.5룸 쓰리룸 쓰리룸+
 *    이런식으로 적어야지"
 *
 * 규칙 (listing.rooms 기준):
 *   1   → 원룸
 *   1.5 → 1.5룸
 *   2   → 투룸
 *   3   → 쓰리룸
 *   4+  → 쓰리룸+
 *   기타 숫자 → "Nf룸"
 *
 * 동작:
 *   카드 .ws-listing-tags 안의 .ws-tag-small 중 "N개 방" 패턴 텍스트 찾아 변환.
 *   data-v330='1' 마커로 idempotent.
 *
 * 데이터: window.WS.allListings (id → rooms)
 */
(function () {
  'use strict';
  var V = 'v330-room-label';

  function getRooms(id) {
    var arr = (window.WS && window.WS.allListings) || [];
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].id) === String(id)) return arr[i].rooms;
    }
    return undefined; // not loaded
  }

  function labelFor(rooms) {
    if (rooms === null || rooms === undefined || rooms === '') return '';
    var n = Number(rooms);
    if (isNaN(n)) {
      // 이미 "원룸"/"투룸" 등 문자열일 수 있음
      var s = String(rooms).trim();
      if (s.indexOf('룸') !== -1) return s;
      return s;
    }
    if (n === 1)        return '원룸';
    if (Math.abs(n - 1.5) < 0.01) return '1.5룸';
    if (n === 2)        return '투룸';
    if (n === 3)        return '쓰리룸';
    if (n >= 4)         return '쓰리룸+';
    // 0.5, 0 같은 비정상은 표시 X
    if (n <= 0) return '';
    return n + '룸';
  }

  function applyToCard(card) {
    if (!card) return;
    var id = card.getAttribute('data-listing-id');
    if (!id) return;
    var rooms = getRooms(id);
    if (rooms === undefined) return; // listings 아직 로드 전

    var tags = card.querySelector('.ws-listing-tags');
    if (!tags) return;

    var label = labelFor(rooms);
    var smalls = tags.querySelectorAll('.ws-tag-small');

    for (var i = 0; i < smalls.length; i++) {
      var el = smalls[i];
      var t = (el.textContent || '').trim();
      // "N개 방" 또는 "1.5개 방" 패턴 매치
      if (/^\d+(?:\.\d+)?\s*개\s*방$/.test(t)) {
        if (!label) {
          // 라벨 비어야 한다면 (rooms=0) 제거
          try { el.parentNode.removeChild(el); } catch (_) {}
          return;
        }
        if (el.textContent !== label) {
          el.textContent = label;
          el.dataset.v330 = '1';
          el.title = '방 ' + (rooms || '?') + '개';
        }
        return;
      }
    }
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
    t = setTimeout(function () { t = null; sweep(); }, 90);
  }

  var mo = new MutationObserver(function (mutations) {
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

  try { window.WS = window.WS || {}; window.WS._v330 = { sweep: sweep, labelFor: labelFor }; } catch (_) {}
})();
