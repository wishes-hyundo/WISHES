/* /search content-v329 — 공실 라벨 정확화 (입주가능일 기준)
 *
 * 사장님 명령 (2026-04-29):
 *   "그 아래 공실이라고 나온게 많은데 이것도 보면 협의입주거나 공실이 아닌
 *    경우도 많은데 아무기준없이 전부다 공실이라고 하고 있음"
 *
 * 배경:
 *   content.js 가 status='공개' 면 무조건 ws-tag-small "공실" 라벨 prepend.
 *   실제 공실 여부는 listing.available_date / raw_fields.입주가능일 기준이어야 함.
 *
 * 분기 (data 분포 sample 검증 후):
 *   - "(공실)" 포함 (예: "즉시입주(공실)") → "공실" 녹색 (#E8F5E9 / #2D5A27) — 그대로
 *   - "(비공실)" 포함 (예: "즉시입주(비공실)")     → "거주중" 회색 (#F3F4F6 / #6B7280)
 *   - "협의" 포함                                → "협의입주" 주황 (#FFF3E0 / #E65100)
 *   - 날짜 패턴 (YYYY-MM-DD)                     → "YY.MM 입주" 파랑 (#E0F2FE / #0369A1)
 *   - 그 외 (null/빈/즉시입주 단독)             → 라벨 hide
 *
 * 데이터: window.WS.allListings → listing.available_date
 *
 * 안전: 카드 .ws-listing-tags 안의 "공실" 텍스트 ws-tag-small 만 후처리.
 */
(function () {
  'use strict';
  var V = 'v329-vacancy-label';

  function getAvail(id) {
    var arr = (window.WS && window.WS.allListings) || [];
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].id) === String(id)) {
        return String(arr[i].available_date || '').trim();
      }
    }
    return null;
  }

  function classify(av) {
    if (!av) return { label: '', color: '', bg: '', show: false };
    if (av.indexOf('비공실') !== -1) return { label: '거주중', color: '#6b7280', bg: '#f3f4f6', show: true };
    if (av.indexOf('공실') !== -1)  return { label: '공실',   color: '#2D5A27', bg: '#e8f5e9', show: true };
    if (av.indexOf('협의') !== -1)  return { label: '협의입주', color: '#e65100', bg: '#fff3e0', show: true };
    var m = av.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      var yy = m[1].slice(2), mm = m[2];
      return { label: yy + '.' + mm + ' 입주', color: '#0369a1', bg: '#e0f2fe', show: true };
    }
    if (/^즉시입주/.test(av))    return { label: '공실',   color: '#2D5A27', bg: '#e8f5e9', show: true };
    return { label: '', color: '', bg: '', show: false };
  }

  function applyToCard(card) {
    if (!card) return;
    var id = card.getAttribute('data-listing-id');
    if (!id) return;
    var av = getAvail(id);
    if (av === null) return;

    var tags = card.querySelector('.ws-listing-tags');
    if (!tags) return;

    // content.js 가 만든 .ws-tag-small "공실" span 찾기
    var legacy = null;
    var smalls = tags.querySelectorAll('.ws-tag-small');
    for (var i = 0; i < smalls.length; i++) {
      var t = (smalls[i].textContent || '').trim();
      if (t === '공실' && !smalls[i].classList.contains('ws-vacancy-tag')) { legacy = smalls[i]; break; }
    }
    var c = classify(av);

    if (legacy) {
      if (!c.show) {
        try { legacy.parentNode.removeChild(legacy); } catch (_) {}
      } else {
        legacy.textContent = c.label;
        legacy.style.background = c.bg;
        legacy.style.color = c.color;
        legacy.style.fontWeight = '700';
        legacy.classList.add('ws-vacancy-tag');
        legacy.dataset.vacancy = c.label;
        legacy.title = '입주가능일: ' + av;
      }
      return;
    }

    // legacy 없는데 우리 라벨도 없으면 새로 추가 (status 가 공개 외 인 케이스라도 av 가 있으면 분기)
    var ours = tags.querySelector('.ws-vacancy-tag');
    if (ours) {
      if (!c.show) { try { ours.parentNode.removeChild(ours); } catch (_) {} }
      else if (ours.dataset.vacancy !== c.label) {
        ours.textContent = c.label;
        ours.style.background = c.bg;
        ours.style.color = c.color;
        ours.dataset.vacancy = c.label;
        ours.title = '입주가능일: ' + av;
      }
    }
    // 라벨이 없는 매물은 추가 안 함 — 사장님이 status=공개 만으로 일괄 표시되는 걸 원치 않음.
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

  try { window.WS = window.WS || {}; window.WS._v329 = { sweep: sweep, classify: classify }; } catch (_) {}
})();
