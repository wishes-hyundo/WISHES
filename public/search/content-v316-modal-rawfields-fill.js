/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v316 — 모달 raw_fields 누락 보완 (사장님 명령)
 * 작성: 2026-04-29
 *
 * 사장님 보고: 본문보기엔 구조형태/임대기간/주차대수/룸/면적 모두 있는데
 *   기본정보 표에 안 나옴 — listing 컬럼만 사용해서 raw_fields 활용 X.
 *
 * Fix: 모달 등장 시 .v240-info2 의 빈 셀들을 raw_fields 값으로 자동 채움.
 *   매핑: 구조형태/임대기간/주차/면적/룸/방향/난방.
 *
 * 정책: 모든 매물 보편. raw_fields 없으면 무동작.
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v316-rawfields-fill';

  function getRaw() {
    try {
      var L = window.WS && window.WS.__lastListing;
      if (!L) return null;
      var rf = L.raw_fields;
      return (rf && typeof rf === 'object') ? rf : null;
    } catch (_) { return null; }
  }

  function pickRaw(rf, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = rf[keys[i]];
      if (v != null && String(v).trim() !== '' && String(v).trim() !== '-') {
        return String(v).trim();
      }
    }
    return null;
  }

  // 라벨 → raw_fields 키 후보
  var LABEL_MAP = [
    [/구조형태|구조/, ['구조형태', '구조', 'structureType']],
    [/임대기간/, ['임대기간', '계약형태', 'lease_period']],
    [/^주차$|주차\s*가능/, ['주차대수', '주차', 'parking']],
    [/주차\s*대수|주차대수/, ['주차대수']],
    [/^면적$|연면적|건축면적/, ['층면적', '면적', '연면적']],
    [/^룸\/욕실$|룸\s*\/\s*욕실|^룸\/욕실수$|방수/, ['룸/욕실수', '룸/욕실', '방수']],
    [/^방향$|방향/, ['방향', '향']],
    [/^난방$|난방/, ['난방', '난방종류']],
    [/입주\s*가능|입주가능/, ['입주가능일', '입주가능', '입주']],
    [/관리비/, ['월관리비', '관리비']],
    [/현관\s*구조|현관구조/, ['현관구조', '현관']],
    [/룸\s*구조|룸구조/, ['룸구조', '룸형태', '룸타입']],
  ];

  function fillRows(modal) {
    var rf = getRaw();
    if (!rf) return;
    var info2 = modal.querySelector('.v240-info2');
    if (!info2 || info2.dataset.v316 === '1') return;

    var filled = 0;
    var rows = info2.querySelectorAll('.v240-r');
    rows.forEach(function (r) {
      var pairs = [];
      var ks = r.querySelectorAll('.v240-k');
      var vs = r.querySelectorAll('.v240-v');
      // 4-col grid: k v k v 순서
      for (var i = 0; i < ks.length; i++) {
        if (vs[i]) pairs.push([ks[i], vs[i]]);
      }
      pairs.forEach(function (p) {
        var k = p[0], v = p[1];
        if (k.classList.contains('v240-empty') || v.classList.contains('v240-empty')) return;
        var label = (k.textContent || '').trim();
        var current = (v.textContent || '').trim();
        if (current && current !== '-') return; // 이미 값 있음
        for (var i = 0; i < LABEL_MAP.length; i++) {
          if (LABEL_MAP[i][0].test(label)) {
            var picked = pickRaw(rf, LABEL_MAP[i][1]);
            if (picked) {
              v.textContent = picked;
              filled++;
            }
            break;
          }
        }
      });
    });
    if (filled > 0) {
      console.log('[' + V + '] filled ' + filled + ' rows from raw_fields');
    }
    info2.dataset.v316 = '1';
  }

  function applyAll() {
    try {
      var modal = document.getElementById('ws-detail-container') ||
                  document.querySelector('.ws-detail-container') ||
                  document.querySelector('[id^="ws-detail-modal"]') ||
                  document.querySelector('#ws-detail-content');
      if (!modal) return;
      fillRows(modal);
    } catch (e) { console.warn('[' + V + '] failed:', e && e.message); }
  }

  var debounceTimer = null;
  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyAll, 150);
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].addedNodes && muts[i].addedNodes.length) { schedule(); return; }
    }
  });

  function start() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      schedule();
      console.log('[' + V + '] observer 시작 — raw_fields 누락 보완');
    } catch (e) { console.warn('[' + V + '] start failed:', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
