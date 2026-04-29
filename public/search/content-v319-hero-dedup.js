/* /search content-v319 — 매물 상세 모달 .v240-hero 안 동일 주소 텍스트 dedup.
 * 사장님 보고 (2026-04-29):
 *   "주소에 보면 뭔가 글자가 겹쳐 있음 똑같은 주소가 반복적으로 겹쳐"
 *
 * 원인 추정:
 *   - content-v240-detail.js 의 H1(fullAddr) + v240-hero-road(도로명) 가 비슷한
 *     텍스트로 시각적 겹침
 *   - 또는 .v240-hero 자체가 중복 마운트 (여러 patch 들이 hero 영역 동시 처리)
 *   - 또는 같은 텍스트 가진 inline element 가 2개 이상
 *
 * Fix:
 *   1. .v240-hero 안에 같은 textContent 가진 H1 / div 가 2개 이상 있으면 첫 번째만 유지
 *   2. .v240-hero 가 같은 부모 안에 2개 이상 있으면 첫 번째만 유지 (중복 마운트 방지)
 *   3. v240-hero-road 가 H1 fullAddr 의 substring 이거나 거의 동일하면 hide
 *   모바일/데스크탑 동일 적용. */
(function () {
  'use strict';
  var V = 'v319-hero-dedup';

  function normalize(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function dedupHero() {
    try {
      var modal = document.getElementById('ws-detail-container') ||
                  document.querySelector('.ws-detail-container') ||
                  document.querySelector('[id^="ws-detail-modal"]');
      if (!modal) return;

      // ① .v240-hero 자체가 2개 이상이면 첫 번째 외 제거
      var heroes = modal.querySelectorAll('.v240-hero');
      if (heroes.length > 1) {
        for (var i = 1; i < heroes.length; i++) {
          try { heroes[i].parentNode && heroes[i].parentNode.removeChild(heroes[i]); } catch (_) {}
        }
      }

      // ② 첫 번째 hero 안의 동일 텍스트 dedup
      var hero = heroes[0] || modal.querySelector('.v240-hero');
      if (!hero) return;

      // H1 들 검사
      var h1s = hero.querySelectorAll('h1');
      if (h1s.length > 1) {
        var seen = new Set();
        h1s.forEach(function (h, idx) {
          var t = normalize(h.textContent);
          if (idx === 0) { seen.add(t); return; }
          if (seen.has(t)) {
            try { h.parentNode && h.parentNode.removeChild(h); } catch (_) {}
          } else {
            seen.add(t);
          }
        });
      }

      // ③ v240-hero-road 가 H1 fullAddr 의 substring 또는 거의 동일하면 hide
      var h1 = hero.querySelector('h1');
      var road = hero.querySelector('.v240-hero-road');
      if (h1 && road) {
        var h1Text = normalize(h1.textContent);
        var roadText = normalize(road.textContent);
        if (roadText && (h1Text.indexOf(roadText) >= 0 || roadText.indexOf(h1Text) >= 0)) {
          road.style.display = 'none';
        }
      }

      // ④ 같은 .v240-hero-bldg 가 2개 이상이면 첫 번째만 (중복 building_name 방지)
      var bldgs = hero.querySelectorAll('.v240-hero-bldg');
      if (bldgs.length > 1) {
        for (var k = 1; k < bldgs.length; k++) {
          try { bldgs[k].parentNode && bldgs[k].parentNode.removeChild(bldgs[k]); } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('[' + V + '] dedup 실패:', e);
    }
  }

  function start() {
    dedupHero();
    var mo = new MutationObserver(function (muts) {
      var hit = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1 && (
                (n.classList && (n.classList.contains('v240-hero') || n.classList.contains('v240-hero-road'))) ||
                (n.querySelector && n.querySelector('.v240-hero, .v240-hero-road, h1'))
            )) {
              hit = true; break;
            }
          }
          if (hit) break;
        }
      }
      if (hit) {
        if (window.requestAnimationFrame) requestAnimationFrame(dedupHero);
        else setTimeout(dedupHero, 16);
      }
    });
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      console.log('[' + V + '] 매물 모달 hero 주소 중복 정리 시작');
    } catch (e) { /* noop */ }
    setTimeout(dedupHero, 500);
    setTimeout(dedupHero, 1500);
    setTimeout(dedupHero, 4000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
