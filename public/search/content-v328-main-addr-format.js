/* /search content-v328 — 메인 주소 라인 형식 정리
 *
 * 사장님 명령 (2026-04-29):
 *   "(엠코빌) 이렇게 되어있는데 이 부분을 지번뒤에 예를 들면
 *    서울 관악구 신림동 251-212 엠코빌 몇층 몇동 몇호 이런식으로 나와야 되고"
 *
 * 동작:
 *   .ws-listing-addr 안의 "(건물명)" 괄호 표기 제거 후
 *   "[지번주소] [건물명] [Nf/Nt층] [Nho호]" 형식으로 재구성.
 *
 * 규칙:
 *   1) addr 안에 이미 "층" 패턴 (\d+층\s*\d+) 들어있으면 → 풀형식이라 그대로 (중복 방지)
 *   2) 그 외:
 *      - "(building_name)" 괄호 패턴 제거
 *      - 끝에 building_name (없으면 skip)
 *      - 끝에 floor_current/floor_total층 (둘 다 있을 때만)
 *      - 끝에 building_ho호 (있을 때만)
 *
 * 데이터: window.WS.allListings (id → address, building_name, floor_current, floor_total, building_ho)
 *
 * 안전장치: addr 의 첫 자식 sourceBadge(.ws-src-badge) 와 마지막 NEW 뱃지(.ws-new-badge)
 *           는 보존. 텍스트 노드만 교체.
 */
(function () {
  'use strict';
  var V = 'v328-main-addr-format';

  function getListing(id) {
    var arr = (window.WS && window.WS.allListings) || [];
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].id) === String(id)) return arr[i];
    }
    return null;
  }

  function buildText(l) {
    if (!l) return null;
    var addr = String(l.address || '').trim();
    if (!addr) return null;
    // 이미 풀형식 ("층" 들어있음) 이면 그대로 (단 (괄호) 만 제거)
    var hasFullFloor = /\d+\s*층\s*[\d]/.test(addr);
    // 괄호 (한자 또는 영문 또는 한글 안의 건물명 패턴) 제거
    var stripped = addr.replace(/\s*\(([^)]+)\)\s*$/, '').trim();

    if (hasFullFloor) return stripped; // 이미 풀

    var bn = String(l.building_name || '').trim();
    var fc = l.floor_current ? String(l.floor_current).trim() : '';
    var ft = l.floor_total ? String(l.floor_total).trim() : '';
    var ho = l.building_ho ? String(l.building_ho).trim() : '';

    var parts = [stripped];
    // 건물명 (이미 stripped 안에 들어있지 않을 때만)
    if (bn && bn.length > 1 && stripped.indexOf(bn) === -1) parts.push(bn);
    // 층
    if (fc && ft) parts.push(fc + '/' + ft + '층');
    else if (fc) parts.push(fc + '층');
    // 호
    if (ho && /^\d+/.test(ho)) parts.push(ho + '호');

    return parts.join(' ');
  }

  function applyToCard(card) {
    if (!card) return;
    var id = card.getAttribute('data-listing-id');
    if (!id) return;
    var l = getListing(id);
    if (!l) return;
    var newText = buildText(l);
    if (!newText) return;

    var addr = card.querySelector('.ws-listing-addr');
    if (!addr) return;

    // 기존 sourceBadge / NEW 뱃지 분리 후 텍스트만 교체
    var srcBadge = addr.querySelector(':scope > .ws-src-badge');
    var newBadge = addr.querySelector(':scope > .ws-new-badge');
    var bldgChip = addr.querySelector(':scope > span[style*="background:#F5F5F5"]'); // 우측 🏢 칩

    // 현재 표시 비교: 우리 가공 결과와 동일하면 skip
    if (addr.dataset.v328Last === newText) return;

    // 새 텍스트 노드 생성
    addr.innerHTML = ''; // 초기화
    if (srcBadge) addr.appendChild(srcBadge);
    addr.appendChild(document.createTextNode(newText));
    if (newBadge) addr.appendChild(newBadge);
    if (bldgChip) addr.appendChild(bldgChip);

    addr.dataset.v328Last = newText;
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
                            n.classList.contains('ws-listing-addr'))) { hit = true; break; }
        if (n.querySelector && n.querySelector('.ws-listing-card, .ws-listing-addr')) { hit = true; break; }
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

  try { window.WS = window.WS || {}; window.WS._v328 = { sweep: sweep }; } catch (_) {}
})();
