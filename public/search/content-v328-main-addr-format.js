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
    // 사장님 기준 (2026-04-29): 매물 61443 형식 — "[지번] [건물명] [N]층 [Nho]"
    //   슬래시(/Nt) 없음, 분모층 없음, "호" 글자 없음, 쉼표 없음.
    //
    //   1) 이미 풀형식("\d+층\s*\d+") → 쉼표만 정리 후 그대로
    //   2) 그 외 → [지번주소] [건물명] [Nf층] [Nho]

    // (괄호) 표기 제거 — 끝의 "(엠코빌)" 패턴
    var stripped = addr.replace(/\s*\(([^)]+)\)\s*$/, '').trim();
    // 쉼표 정리: "895-14, 5층 501" → "895-14 5층 501"
    stripped = stripped.replace(/,\s+/g, ' ').replace(/\s{2,}/g, ' ').trim();

    // L-v328-dup-fix (2026-05-09 사장님 발견 매물 78954):
    //   기존 hasFullFloor regex 가 NBSP/다른 whitespace 일 때 false →
    //   address 에 이미 "17층 2408동 1701" 있는데 v328 가 다시 추가 → 중복.
    //   해결: 모든 part 에 stripped.indexOf 체크 강화.
    var hasFullFloor = /\d+\s*층\s*[\d]/.test(stripped);
    if (hasFullFloor) return stripped;

    var bn = String(l.building_name || '').trim();
    var fc = l.floor_current ? String(l.floor_current).trim() : '';
    var bdong = String(l.building_dong || '').trim();
    var ho = l.building_ho ? String(l.building_ho).trim() : '';

    var parts = [stripped];
    if (bn && bn.length > 1 && stripped.indexOf(bn) === -1) parts.push(bn);
    // 층 — 분모 없음, "[Nf]층" (stripped 에 이미 있으면 push X)
    if (fc && stripped.indexOf(fc + '층') === -1) parts.push(fc + '층');
    // 동 (가동/나동/A동/B동 등) — 호 앞에 위치 (사장님 명령 2026-04-29)
    if (bdong && bdong.length > 0 && stripped.indexOf(bdong) === -1) {
      // bdong 이 이미 '동' 으로 끝나면 그대로, 아니면 + '동'
      parts.push(/동$/.test(bdong) ? bdong : bdong + '동');
    }
    // 호수 — '호' 글자 없음, 숫자만 (stripped 에 이미 있으면 push X)
    if (ho && /^\d/.test(ho) && stripped.indexOf(ho) === -1) parts.push(ho);

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
