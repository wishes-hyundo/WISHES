/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v309 — 모달 데이터 완결성 + UI 밸런스 (사장님 발견 P0 4가지)
 * 작성: 2026-04-29 — 사장님 직접 캡처 4 이슈
 *
 * 1. 옵션·특징 누락: raw_fields["옵션"] 본문 (엘리베이터, 에어컨, 세탁기, 냉장고,
 *    싱크대, 전기인덕션) 인데 모달은 "엘리베이터, 냉·난방기" 만. 본문 키워드
 *    전부 칩으로 펼침 + raw text 줄바꿈 표시.
 * 2. 관리비 누락: raw_fields["월관리비"] / "관리비" / "공과금" 텍스트가 어디에도
 *    표시 X. 기본정보 그리드에 "관리비" row 추가.
 * 3. 룸 표기: raw_fields["룸/욕실수"] = "룸 1.5개 / 욕실 1개" 인데 1개만 보임.
 *    L.rooms 정수만 사용해서 1.5 잘림 → raw_fields 텍스트에서 정확 추출 표시.
 * 4. UI 밸런스: 주소/금액 hero 영역의 녹색 좌측 4px 라인이 가격 박스 늘어짐에
 *    따라 함께 늘어져 보기 불편. align-items center 유지 + price-box max-height
 *    + 좌측 라인 길이 = h1 영역에 맞춤.
 *
 * 정책:
 *   - /search HTML/CSS 무손상 (vanilla patch only — MutationObserver)
 *   - window.WS.__lastListing 의 raw_fields 만 사용 (확실한 정보 — 환각 X)
 *   - 본문 raw_fields 가 없으면 patch 무동작 (안전 fallback)
 *
 * 의존:
 *   - content-v240-detail.js 가 WS.__lastListing 저장
 *   - DOM 구조: .v240-hero / .v240-info2 / .v240-opts / .v240-price-box
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v309-modal-completeness';

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

  // ── 1. 옵션 본문 전체 추출 ───────────────────────────
  // raw_fields["옵션"] 또는 __원본본문__ 에서 옵션 키워드 모두 칩으로
  function extractAllOptionChips() {
    var rf = getRaw();
    if (!rf) return null;
    var src = '';
    var k_options = rf['옵션'] || rf['옵션사항'] || rf['옵션·특징'] || '';
    src += String(k_options || '');
    var rawText = String(rf['__원본본문__'] || '');
    src += ' ' + rawText;
    if (!src.trim()) return null;

    // 매핑: keyword regex → label (icon + text)
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
    if (!optsEl || optsEl.dataset.v309 === '1') return;
    var bundle = extractAllOptionChips();
    if (!bundle || bundle.chips.length === 0) return;
    // 칩 다시 그림
    optsEl.innerHTML = bundle.chips.map(function (c) {
      return '<span class="v240-chip">' + esc(c) + '</span>';
    }).join('');
    optsEl.dataset.v309 = '1';

    // 본문 옵션 raw 텍스트도 함께 (이중 표기)
    if (bundle.raw && bundle.raw.length > 0 && bundle.raw.length < 200) {
      var existing = modal.querySelector('.v309-opt-rawline');
      if (!existing) {
        var rawLine = document.createElement('div');
        rawLine.className = 'v309-opt-rawline';
        rawLine.style.cssText = 'margin-top:8px;padding:8px 12px;background:#F4F9F5;border-radius:8px;color:#1f3a26;font-size:12px;line-height:1.6;border:1px solid #d8e8dc';
        rawLine.innerHTML = '<span style="color:#5b7a5e;font-weight:600;margin-right:6px">📋 본문 옵션</span>' + esc(bundle.raw);
        optsEl.parentNode.insertBefore(rawLine, optsEl.nextSibling);
      }
    }
  }

  // ── 2. 관리비 row 추가 ───────────────────────────────
  function getMaintFeeText() {
    var rf = getRaw();
    if (!rf) return null;
    var parts = [];
    var monthly = rf['월관리비'] || rf['관리비'] || '';
    var sep = rf['관리비별도'] || rf['공과금'] || rf['공과금별도'] || '';
    if (monthly) {
      var s = String(monthly).trim();
      if (s && !/^(0|없|무|null)/i.test(s)) parts.push(s);
    }
    // raw 본문에 "관리비 별도" / "공과금 별도" 가 있으면 부가 표기
    var rawTxt = String(rf['__원본본문__'] || '');
    if (/관리비\s*별도/.test(rawTxt) && !parts.some(function(p){return /별도/.test(p);})) parts.push('관리비 별도');
    if (/공과금\s*별도/.test(rawTxt)) parts.push('공과금 별도');
    if (sep) {
      var ss = String(sep).trim();
      if (ss && !parts.includes(ss)) parts.push(ss);
    }
    if (parts.length === 0) return null;
    return parts.join(' · ');
  }

  function fixMaintFeeRow(modal) {
    var info2 = modal.querySelector('.v240-info2');
    if (!info2 || info2.dataset.v309mf === '1') return;
    var feeTxt = getMaintFeeText();
    if (!feeTxt) return;
    // 입주가능 row 다음에 관리비 row 삽입
    var rows = info2.querySelectorAll('.v240-r');
    var anchor = null;
    rows.forEach(function (r) {
      var k = r.querySelector('.v240-k');
      if (k && /입주가능/.test(k.textContent)) anchor = r;
    });
    if (!anchor) anchor = rows[rows.length - 1];

    var newRow = document.createElement('div');
    newRow.className = 'v240-r v309-mf-row';
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
    info2.dataset.v309mf = '1';
  }

  // ── 3. 룸/욕실 row — raw 텍스트 정확 표기 ─────────────
  function getAccurateRoomBath() {
    var rf = getRaw();
    if (!rf) return null;
    var src = String(rf['룸/욕실수'] || rf['룸/욕실'] || rf['방수'] || '');
    if (!src) {
      // __원본본문__ 에서 추출 시도
      var rawTxt = String(rf['__원본본문__'] || '');
      var m = rawTxt.match(/룸\s*[\/／·]\s*욕실수[^0-9]*([\d.]+)\s*개?\s*[\/／·]?\s*([\d.]+)?\s*개?/);
      if (m) src = '룸 ' + m[1] + '개' + (m[2] ? ' / 욕실 ' + m[2] + '개' : '');
    }
    if (!src) return null;
    // "룸 1.5개 / 욕실 1개" 그대로 사용
    return src.trim();
  }

  function fixRoomBathRow(modal) {
    var info2 = modal.querySelector('.v240-info2');
    if (!info2 || info2.dataset.v309rb === '1') return;
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
    info2.dataset.v309rb = '1';
  }

  // ── 4. Hero UI 밸런스 ───────────────────────────────
  function fixHeroBalance(modal) {
    var hero = modal.querySelector('.v240-hero');
    if (!hero || hero.dataset.v309ui === '1') return;
    // CSS override: align-items center + price-box compact + 좌측 라인 4px → 3px + 모서리 둥글
    var style = document.createElement('style');
    style.id = 'v309-hero-balance-style';
    if (!document.getElementById('v309-hero-balance-style')) {
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
    hero.dataset.v309ui = '1';
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
      console.log('[' + V + '] observer 시작 (옵션·관리비·룸·UI 밸런스)');
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
