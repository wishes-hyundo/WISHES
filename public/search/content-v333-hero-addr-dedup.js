/* /search content-v333 — 모달 hero h1 주소 중복 제거
 *
 * 사장님 명령 (2026-05-09):
 *   매물 78954 모달 hero: "...리더스가든 17층 2408동 1701 17층 2408동1701"
 *
 * 원인 (content-v240-detail.js line 684):
 *   addrText.indexOf(detailText) === -1 가 space 차이 때문에 false →
 *   detailText 추가됨 → 중복.
 *
 * 동작:
 *   #ws-detail-container .v240-hero h1 의 textContent 검사.
 *   "...A B C  A B C" 같은 끝부분 중복 (층/호 패턴) 자동 제거.
 *
 * 패턴:
 *   "...리더스가든 17층 2408동 1701 17층 2408동1701" → "...리더스가든 17층 2408동 1701"
 *
 * 안전:
 *   - 중복 검출 안 되면 변경 X
 *   - data-v333-applied 로 1회만 적용 (h1 같은 텍스트면 skip)
 *   - 카드 메인 라인 (.ws-listing-addr) 은 v328 가 처리 — 충돌 X
 */
(function () {
  'use strict';
  var V = 'v333-hero-addr-dedup';

  // /search 전용
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  // 끝부분 중복 검출 + 제거.
  // "P [N층 X Y]   [N층 X Y]" → "P N층 X Y"
  // 검사 패턴 (여러 변형):
  //   1) "N층 NNNN동 NNNN N층 NNNN동NNNN" 또는 "N층 NNNN동NNNN" 끝부분
  //   2) "N층 NNN N층 NNN"
  function dedupeAddrText(text) {
    if (!text) return text;
    var s = String(text).trim();
    // 공백 정규화 (NBSP → space)
    var norm = s.replace(/[  -​　]/g, ' ').replace(/\s+/g, ' ');

    // v124 (2026-05-20 사장님 발견 매물 94470): 같은 "N층" 토큰 연속 반복 제거.
    //   onhouse 크롤러 손상 — address 끝 "...3층" + address_detail "3층 3층304"
    //   합쳐져 "...아카데미하우스Ⅱ 3층 3층 3층304". 같은 층일 때만 앞 토큰 제거 →
    //   정상 주소(예: "1층 2층" 복층)는 영향 없음.
    var _v124prev, _v124g = 0;
    do {
      _v124prev = norm;
      norm = norm.replace(/(?<!\d)(\d+\s*층)\s+(?=\1)/, '');
    } while (norm !== _v124prev && ++_v124g < 12);
    norm = norm.replace(/\s+/g, ' ').trim();
    // 시도 1: "N층 [optional N동] N..." 패턴이 끝에 두 번 나타나는지
    //   매칭: 마지막 "(\d+층\s*\d+동?\s*\d+)" 두 번 연속 (사이 공백 무시)
    //   regex: /^(.*?)(\d+\s*층(?:\s*\d+\s*동)?\s*\d+)\s*\2$/
    //   주의: \s 가 한글 사이 공백 포함
    var lastFloorPat = /(\d+\s*층(?:\s+\d+\s*동)?\s*\d+)\s+(\d+\s*층(?:\s*\d+\s*동)?\s*\d+)$/;
    var m = norm.match(lastFloorPat);
    if (m) {
      // 두 부분이 의미상 같은지 check — 숫자만 추출해서 비교
      var digits1 = (m[1].match(/\d+/g) || []).join('');
      var digits2 = (m[2].match(/\d+/g) || []).join('');
      if (digits1 === digits2) {
        // 끝부분 (m[2] 와 그 앞 space) 제거
        var end = norm.lastIndexOf(m[2]);
        if (end > 0) {
          return norm.slice(0, end).trim();
        }
      }
    }
    return norm !== s ? norm : s;
  }

  function sweep() {
    try {
      var h1s = document.querySelectorAll('#ws-detail-container .v240-hero h1');
      h1s.forEach(function (h1) {
        var orig = h1.textContent || '';
        if (h1.dataset.v333Last === orig) return;
        var deduped = dedupeAddrText(orig);
        if (deduped !== orig) {
          h1.textContent = deduped;
          h1.dataset.v333Last = deduped;
          try {
            console.log('[' + V + '] dedup: "' + orig.slice(0, 80) + '" → "' + deduped.slice(0, 80) + '"');
          } catch (_) {}
        } else {
          h1.dataset.v333Last = orig;
        }
      });
    } catch (e) {
      try { console.warn('[' + V + '] sweep error:', e); } catch (_) {}
    }
  }

  var t = null;
  function scheduleSweep() {
    if (t) return;
    t = setTimeout(function () { t = null; sweep(); }, 80);
  }

  var mo = new MutationObserver(function (mutations) {
    var hit = false;
    for (var i = 0; i < mutations.length && !hit; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'H1' || (n.querySelector && n.querySelector('.v240-hero h1'))) {
          hit = true; break;
        }
      }
    }
    if (hit) scheduleSweep();
  });

  function init() {
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    sweep();
    // [Step 44 fix 2026-05-19 사장님 명령] cascade setTimeout 제거 — MO 가 동일 cover
    //   기존: 500ms+1500ms+3000ms 3번 cascade → 매 modal open 마다 3 setTimeout 누적
    //   수정: 1회만 호출 (line 88 의 MO debounce 80ms 가 이미 충분히 cover)
    setTimeout(sweep, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try { window.WS = window.WS || {}; window.WS._v333 = { sweep: sweep, dedupe: dedupeAddrText }; } catch (_) {}

  try { console.log('[' + V + '] active'); } catch (_) {}
})();
