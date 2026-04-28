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

  // L-overwrite (2026-04-29): 주차/면적 같은 일부 라벨은 raw_fields 가 더 풍부.
  //   v240 의 'parking=true' → '가능' 보다 raw['주차대수']='유료 1대, 9만원' 이 정답.
  var FORCE_OVERWRITE_LABELS = [/^주차$|주차가능/, /^면적$|연면적|건축면적/];

  // building data 면적 추출 — v306/v311 이 sessionStorage 에 저장한 cache 활용
  function getBuildingArea() {
    try {
      var L = window.WS && window.WS.__lastListing;
      if (!L) return null;
      // v306 cache (wsBldgV3:lid:addr:dong:ho)
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (!k || k.indexOf('wsBldgV3:') !== 0 && k.indexOf('wsBldgMainV4:') !== 0) continue;
        try {
          var raw = JSON.parse(sessionStorage.getItem(k));
          var p = raw && raw.payload;
          if (!p || !p.success) continue;
          var sel = p.selected_unit;
          if (sel && sel.exclusiveArea) {
            return Number(sel.exclusiveArea).toFixed(2) + ' m² (전용)';
          }
          var d = p.data || {};
          if (d.archArea) return Number(d.archArea).toFixed(2) + ' m² (건축)';
          if (d.totArea) return Number(d.totArea).toFixed(2) + ' m² (연면적)';
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  function fillRows(modal) {
    var rf = getRaw();
    if (!rf) return;
    var info2 = modal.querySelector('.v240-info2');
    if (!info2 || info2.dataset.v316done === '1') return;

    var filled = 0;
    var rows = info2.querySelectorAll('.v240-r');
    rows.forEach(function (r) {
      var pairs = [];
      var ks = r.querySelectorAll('.v240-k');
      var vs = r.querySelectorAll('.v240-v');
      for (var i = 0; i < ks.length; i++) {
        if (vs[i]) pairs.push([ks[i], vs[i]]);
      }
      pairs.forEach(function (p) {
        var k = p[0], v = p[1];
        if (k.classList.contains('v240-empty') || v.classList.contains('v240-empty')) return;
        var label = (k.textContent || '').trim();
        var current = (v.textContent || '').trim();

        // FORCE_OVERWRITE: 주차/면적은 raw_fields/building 가 더 풍부하면 덮어쓰기
        var isForceLabel = FORCE_OVERWRITE_LABELS.some(function (re) { return re.test(label); });
        if (current && current !== '-' && !isForceLabel) return; // 이미 값 있음 (force 아님)

        // 면적 — building cache 우선
        if (/^면적$|연면적|건축면적/.test(label)) {
          var ba = getBuildingArea();
          if (ba) { v.textContent = ba; filled++; return; }
          // fallback raw_fields
        }

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
      console.log('[' + V + '] filled ' + filled + ' rows (raw_fields + building)');
    }
    info2.dataset.v316done = '1';
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
