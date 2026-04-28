/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v310 — 모달 데이터 완결성 + UI 밸런스 (v309 후속)
 * 작성: 2026-04-29 — 사장님 발견 P1 3가지 (모든 매물 보편 fix)
 *
 * v309 → v310 변경점:
 *   1. 본문 옵션 raw 줄 제거 — 칩 8개로 이미 정확히 표시되는데 그 아래 다시
 *      "📋 본문 옵션 엘리베이터, 에어컨..." 줄 중복 표시. 칩이 0개일 때만
 *      fallback 으로 표시.
 *   2. 관리비 dedup — "관리비 별도, 공과금 별도 · 공과금 별도" 처럼 "공과금
 *      별도" 두 번 찍힘. monthly text 안에 이미 있는 부분 substring 매칭으로
 *      제거하고 unique part 만 join.
 *   3. (v309 와 동일 유지) 룸 1.5개 정확 표기, Hero UI 밸런스, 옵션 칩 35+
 *      키워드 추출.
 *
 * 정책:
 *   - /search HTML/CSS 무손상 (vanilla patch only — MutationObserver)
 *   - window.WS.__lastListing 의 raw_fields 만 사용 (확실한 정보 — 환각 X)
 *   - 본문 raw_fields 가 없으면 patch 무동작 (안전 fallback)
 *   - **모든 매물 보편 적용** — 특정 매물 hardcode 없음
 *
 * 의존:
 *   - content-v240-detail.js 가 WS.__lastListing 저장
 *   - DOM 구조: .v240-hero / .v240-info2 / .v240-opts / .v240-price-box
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v310-modal-completeness';

  // ── util ──────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function getRaw() {
    try {
      var L = window.WS && window.WS.__lastListing;
      if (!L) return null;
      var rf = L.raw_fields;
      if (!rf || typeof rf !== 'object') return null;
      return rf;
    } catch (e) { return null; }
  }

  // ── 1. 옵션 본문 전체 추출 (35+ 키워드) ──────────────────
  function extractAllOptionChips() {
    var rf = getRaw();
    if (!rf) return null;
    var src = '';
    var k_options = rf['옵션'] || rf['옵션사항'] || rf['옵션·특징'] || '';
    src += String(k_options || '');
    var rawText = String(rf['__원본본문__'] || '');
    src += ' ' + rawText;
    if (!src.trim()) return null;

    var ICONS = [
      [/엘리베이터|EV|E\/V/i, '🏢 엘리베이터'],
      [/CCTV|방범카메라/i, '📹 CCTV'],
      [/인터폰|비디오폰/i, '📞 인터폰'],
      [/개별\s*냉\s*난방/i, '🌡️ 개별냉난방'],
      [/시스템\s*에어컨/i, '🌬️ 시스템에어컨'],
      [/(?:^|[^시])(에어컨|냉방기|냉.?난방기|난방기)/i, '❄️ 에어컨'],
      [/세탁기/i, '🧺 세탁기'],
      [/건조기/i, '☀️ 건조기'],
      [/냉장고/i, '🧊 냉장고'],
      [/싱크대/i, '🚰 싱크대'],
      [/(?:전기)?인덕션/i, '🍳 인덕션'],
      [/하이라이트|hi-light/i, '🍳 하이라이트'],
      [/가스레인지|가스쿡탑/i, '🔥 가스레인지'],
      [/전자레인지|오븐/i, '⚡ 전자레인지'],
      [/식기세척기/i, '🍽️ 식기세척기'],
      [/비데/i, '🚽 비데'],
      [/(?:붙박이|빌트인)\s*(?:장|가구|옷장)?/i, '🚪 붙박이장'],
      [/책상|책장/i, '📚 책상·책장'],
      [/침대/i, '🛏️ 침대'],
      [/소파/i, '🛋️ 소파'],
      [/식탁|테이블/i, '🍽️ 식탁'],
      [/TV|티비|텔레비전/i, '📺 TV'],
      [/베란다|발코니/i, '🌿 베란다'],
      [/테라스/i, '🌳 테라스'],
      [/현관\s*보안|디지털\s*도어락/i, '🔐 도어락'],
      [/공동\s*현관|공용\s*출입/i, '🚪 공동현관'],
      [/주차|parking/i, '🅿️ 주차'],
      [/풀\s*옵션|full\s*option/i, '✨ 풀옵션'],
      [/스프링클러/i, '💧 스프링클러'],
      [/무인경비/i, '🛡️ 무인경비'],
      [/화물\s*엘리베이터|화물\s*EV/i, '🛗 화물EV'],
      [/공기청정/i, '🌬️ 공기청정'],
      [/난방.*도시가스|개별가스/i, '🔥 도시가스난방'],
      [/난방.*중앙/i, '♨️ 중앙난방'],
      [/난방.*지역/i, '🌍 지역난방'],
      [/반려|애견|애묘/i, '🐶 반려동물'],
    ];
    var seen = Object.create(null);
    var chips = [];
    for (var i = 0; i < ICONS.length; i++) {
      var re = ICONS[i][0], lab = ICONS[i][1];
      if (re.test(src) && !seen[lab]) {
        chips.push(lab);
        seen[lab] = true;
      }
    }
    return { chips: chips, raw: String(k_options || '').trim() };
  }

  function fixOptionChips(modal) {
    var optsEl = modal.querySelector('.v240-opts');
    if (!optsEl || optsEl.dataset.v310 === '1') return;
    var bundle = extractAllOptionChips();
    if (!bundle || bundle.chips.length === 0) return;
    optsEl.innerHTML = bundle.chips.map(function (c) {
      return '<span class="v240-chip">' + esc(c) + '</span>';
    }).join('');
    optsEl.dataset.v310 = '1';

    // ★ v310 fix #1: v309 에서 칩 추출 성공해도 본문 raw 줄을 항상 표시했음.
    //   칩이 1개 이상이면 raw 줄 표시 X (칩이 모든 정보 커버). 칩 0개 (extract 실패)
    //   인 매물에서만 fallback raw 줄 표시. v309 가 남긴 .v309-opt-rawline 도 제거.
    var legacyRawLine = modal.querySelector('.v309-opt-rawline');
    if (legacyRawLine && legacyRawLine.parentNode) legacyRawLine.parentNode.removeChild(legacyRawLine);

    // chips.length === 0 일 때만 raw 줄 표시 (이 함수는 chips.length > 0 조건에서만
    // 실행되므로 여기 분기는 사실상 도달 안 함 — 명시적으로 표시 안 함).
  }

  // ── 2. 관리비 row — dedup 강화 ────────────────────────
  function getMaintFeeText() {
    var rf = getRaw();
    if (!rf) return null;
    var collected = [];
    function pushUnique(s) {
      if (!s) return;
      var t = String(s).trim();
      if (!t) return;
      if (/^(0|없|무|null)/i.test(t)) return;
      // ★ v310 fix #2: 이미 collected 의 어떤 항목에 이 문구가 substring 으로
      //   포함돼 있거나, 반대로 새 항목이 기존 항목을 포함하면 더 긴 쪽만 유지.
      for (var i = 0; i < collected.length; i++) {
        if (collected[i].indexOf(t) >= 0) return;        // already covered
        if (t.indexOf(collected[i]) >= 0) {                // new is superset → replace
          collected[i] = t;
          return;
        }
      }
      collected.push(t);
    }

    // 1차: raw_fields 직접 키
    pushUnique(rf['월관리비'] || rf['관리비']);
    pushUnique(rf['관리비별도']);
    pushUnique(rf['공과금'] || rf['공과금별도']);

    // 2차: __원본본문__ 정규식 — substring dedup 으로 monthly 안에 이미 있으면 skip
    var rawTxt = String(rf['__원본본문__'] || '');
    var mFee = rawTxt.match(/관리비\s*별도/);
    if (mFee) pushUnique(mFee[0]);
    var mUtil = rawTxt.match(/공과금\s*별도/);
    if (mUtil) pushUnique(mUtil[0]);

    if (collected.length === 0) return null;
    return collected.join(' · ');
  }

  function fixMaintFeeRow(modal) {
    var info2 = modal.querySelector('.v240-info2');
    if (!info2 || info2.dataset.v310mf === '1') return;
    var feeTxt = getMaintFeeText();
    if (!feeTxt) return;
    // 기존 v309 row 가 있으면 제거 (dedup 안된 텍스트)
    var legacy = info2.querySelector('.v309-mf-row');
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);

    // 입주가능 row 다음에 관리비 row 삽입
    var rows = info2.querySelectorAll('.v240-r');
    var anchor = null;
    rows.forEach(function (r) {
      var k = r.querySelector('.v240-k');
      if (k && /입주가능/.test(k.textContent)) anchor = r;
    });
    if (!anchor) anchor = rows[rows.length - 1];

    var newRow = document.createElement('div');
    newRow.className = 'v240-r v310-mf-row';
    newRow.innerHTML =
      '<div class="v240-k">관리비</div>' +
      '<div class="v240-v">' + esc(feeTxt) + '</div>' +
      '<div class="v240-k v240-empty">&nbsp;</div>' +
      '<div class="v240-v v240-empty">&nbsp;</div>';
    if (anchor && anchor.nextSibling) {
      anchor.parentNode.insertBefore(newRow, anchor.nextSibling);
    } else if (anchor) {
      anchor.parentNode.appendChild(newRow);
    } else {
      info2.appendChild(newRow);
    }
    info2.dataset.v310mf = '1';
  }

  // ── 3. 룸/욕실 row — raw 텍스트 정확 표기 (v309 와 동일 로직) ──
  function getAccurateRoomBath() {
    var rf = getRaw();
    if (!rf) return null;
    var src = String(rf['룸/욕실수'] || rf['룸/욕실'] || rf['방수'] || '');
    if (!src) {
      var rawTxt = String(rf['__원본본문__'] || '');
      var m = rawTxt.match(/룸\s*[\/／·]\s*욕실수[^0-9]*([\d.]+)\s*개?\s*[\/／·]?\s*([\d.]+)?\s*개?/);
      if (m) src = '룸 ' + m[1] + '개' + (m[2] ? ' / 욕실 ' + m[2] + '개' : '');
    }
    if (!src) return null;
    return src.trim();
  }

  function fixRoomBathRow(modal) {
    var info2 = modal.querySelector('.v240-info2');
    if (!info2 || info2.dataset.v310rb === '1') return;
    var accurate = getAccurateRoomBath();
    if (!accurate) return;
    var rows = info2.querySelectorAll('.v240-r');
    rows.forEach(function (r) {
      var k = r.querySelector('.v240-k');
      if (k && /룸\s*[\/／]\s*욕실/.test(k.textContent)) {
        var v = r.querySelectorAll('.v240-v')[0];
        if (v) v.textContent = accurate;
      }
    });
    info2.dataset.v310rb = '1';
  }

  // ── 4. Hero UI 밸런스 (v309 와 동일) ────────────────────
  function fixHeroBalance(modal) {
    var hero = modal.querySelector('.v240-hero');
    if (!hero || hero.dataset.v310ui === '1') return;
    if (!document.getElementById('v310-hero-balance-style')) {
      var style = document.createElement('style');
      style.id = 'v310-hero-balance-style';
      style.textContent =
        '#ws-detail-container .v240-hero{align-items:center !important;min-height:96px}' +
        '#ws-detail-container .v240-hero::before{width:3px !important;top:18px !important;bottom:18px !important;height:auto !important;border-radius:2px}' +
        '#ws-detail-container .v240-price-box{align-self:center !important;padding:14px 18px !important;min-width:180px}' +
        '#ws-detail-container .v240-amt{font-size:24px !important;line-height:1.25}' +
        '#ws-detail-container .v240-mgmt{margin-top:4px !important;line-height:1.5}' +
        '@media (max-width:768px){' +
          '#ws-detail-container .v240-hero{align-items:stretch !important;min-height:auto}' +
          '#ws-detail-container .v240-hero::before{top:0 !important;bottom:0 !important}' +
        '}';
      document.head.appendChild(style);
    }
    hero.dataset.v310ui = '1';
  }

  // ── observer ─────────────────────────────────────────
  function applyAll() {
    try {
      var modal = document.getElementById('ws-detail-container') ||
                  document.querySelector('.ws-detail-container') ||
                  document.querySelector('[id^="ws-detail-modal"]') ||
                  document.querySelector('#ws-detail-content');
      if (!modal) return;
      fixOptionChips(modal);
      fixMaintFeeRow(modal);
      fixRoomBathRow(modal);
      fixHeroBalance(modal);
    } catch (e) {
      console.warn('[' + V + '] applyAll failed:', e && e.message);
    }
  }

  var debounceTimer = null;
  function scheduleApply() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyAll, 80);
  }

  var mo = new MutationObserver(function (muts) {
    var hit = false;
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.addedNodes && m.addedNodes.length) { hit = true; break; }
    }
    if (hit) scheduleApply();
  });

  function start() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      scheduleApply();
      console.log('[' + V + '] observer 시작 (옵션·관리비·룸·UI — v309 dedup fix)');
    } catch (e) {
      console.warn('[' + V + '] start failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
