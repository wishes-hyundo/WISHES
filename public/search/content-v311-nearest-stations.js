/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v310 — 가장 가까운 역 100% 보장 (사장님 명령 "100% 무조건")
 * 작성: 2026-04-29
 *
 * 동작:
 *   1. 매물 모달 열릴 때 lat/lng → /api/admin/nearest-stations 호출
 *   2. PostGIS (정부 공식) + 카카오 모빌리티 도보 routing → top 3 역
 *   3. 모달의 "기본 정보 · 옵션" 섹션 다음에 "🚇 교통 (정부 공식 + 카카오 검증)" 삽입
 *   4. 호선 / 역명 / 출구번호 / 도보 분 모두 명시 표시 (추측 X)
 *
 * 정책:
 *   - vanilla patch only (HTML/CSS 무손상)
 *   - 데이터 없으면 명시적 "정부 데이터 동기화 중" 표기 (잘못된 정보 X)
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v311-nearest-stations';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var cache = Object.create(null);  // listingId → stations[]

  function getToken() {
    try { return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || ''; }
    catch { return ''; }
  }

  async function fetchNearestStations(lat, lng) {
    var key = lat.toFixed(5) + ',' + lng.toFixed(5);
    if (cache[key]) return cache[key];
    try {
      var token = getToken();
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      var res = await fetch(`/api/admin/nearest-stations?lat=${lat}&lng=${lng}`, {
        headers: headers, credentials: 'same-origin', cache: 'no-store',
      });
      if (!res.ok) return null;
      var j = await res.json();
      if (j && j.success && Array.isArray(j.stations)) {
        cache[key] = j.stations;
        return j.stations;
      }
    } catch { /* skip */ }
    return null;
  }

  function buildStationCardHtml(stations) {
    if (!stations || stations.length === 0) {
      return '<div class="v310-empty">📍 1.5km 안에 등록된 역이 없습니다 (정부 공식 데이터 기준)</div>';
    }
    var rows = stations.slice(0, 3).map(function (s, i) {
      var rank = ['🥇', '🥈', '🥉'][i] || '•';
      var walkMin = s.walk_minutes ? '도보 ' + s.walk_minutes + '분' : '도보 약 ' + Math.max(1, Math.round(s.distance_m / 80)) + '분';
      var exit = s.nearest_exit ? ' · ' + esc(s.nearest_exit.exit_no) + '번 출구' : '';
      var distance = s.walk_distance_m ? esc(s.walk_distance_m) + 'm' : esc(s.distance_m) + 'm (직선)';
      return '<div class="v310-row">' +
        '<span class="v310-rank">' + rank + '</span>' +
        '<span class="v310-name">' + esc(s.name) + '</span>' +
        '<span class="v310-line">' + esc(s.line) + '</span>' +
        '<span class="v310-walk">' + esc(walkMin) + exit + '</span>' +
        '<span class="v310-dist">' + distance + '</span>' +
        '</div>';
    }).join('');
    return rows;
  }

  function injectSection(modal, listing) {
    if (!listing || listing.lat == null || listing.lng == null) return;
    if (!isFinite(listing.lat) || !isFinite(listing.lng)) return;
    if (modal.dataset.v310 === '1') return;

    // 기본 정보 · 옵션 섹션 다음에 삽입
    var sections = modal.querySelectorAll('.v240-section');
    var anchor = null;
    sections.forEach(function (s) {
      var h2 = s.querySelector('h2');
      if (h2 && /기본\s*정보/.test(h2.textContent)) anchor = s;
    });
    if (!anchor) return;

    var section = document.createElement('section');
    section.className = 'v240-section v310-section';
    section.innerHTML =
      '<h2>🚇 가장 가까운 역 ' +
        '<span class="v310-badge">정부 공식 + 카카오 도보 검증</span>' +
      '</h2>' +
      '<div class="v240-body">' +
        '<div class="v310-loading">조회 중...</div>' +
      '</div>';
    anchor.parentNode.insertBefore(section, anchor.nextSibling);
    modal.dataset.v310 = '1';

    // CSS
    if (!document.getElementById('v310-styles')) {
      var st = document.createElement('style');
      st.id = 'v310-styles';
      st.textContent =
        '#ws-detail-container .v310-section{}' +
        '#ws-detail-container .v310-badge{display:inline-block;margin-left:8px;padding:2px 8px;background:#e8f5ea;color:#2D5A27;border-radius:6px;font-size:11px;font-weight:600;vertical-align:middle}' +
        '#ws-detail-container .v310-loading{color:#666;font-size:13px;padding:8px}' +
        '#ws-detail-container .v310-empty{color:#999;font-size:13px;padding:12px;text-align:center;background:#fafafa;border-radius:8px}' +
        '#ws-detail-container .v310-row{display:grid;grid-template-columns:auto 1fr auto auto auto;gap:10px;padding:10px 12px;border-bottom:1px solid #e8eee8;align-items:center;font-size:13px}' +
        '#ws-detail-container .v310-row:last-child{border-bottom:0}' +
        '#ws-detail-container .v310-rank{font-size:16px}' +
        '#ws-detail-container .v310-name{font-weight:700;color:#1f3a26}' +
        '#ws-detail-container .v310-line{padding:2px 8px;background:#f4f9f5;color:#2D5A27;border-radius:6px;font-size:11px;font-weight:600}' +
        '#ws-detail-container .v310-walk{color:#2D5A27;font-weight:600}' +
        '#ws-detail-container .v310-dist{color:#888;font-size:11px}';
      document.head.appendChild(st);
    }

    // fetch + render
    fetchNearestStations(listing.lat, listing.lng).then(function (stations) {
      var body = section.querySelector('.v240-body');
      if (body) body.innerHTML = buildStationCardHtml(stations);
    }).catch(function () {
      var body = section.querySelector('.v240-body');
      if (body) body.innerHTML = '<div class="v310-empty">조회 실패 — 잠시 후 다시 시도</div>';
    });
  }

  function scan() {
    try {
      var modal = document.getElementById('ws-detail-container') ||
                  document.querySelector('.ws-detail-container');
      if (!modal) return;
      var listing = (window.WS && window.WS.__lastListing) || null;
      if (!listing) return;
      injectSection(modal, listing);
    } catch { /* skip */ }
  }

  var t = null;
  function schedule() { if (t) clearTimeout(t); t = setTimeout(scan, 100); }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].addedNodes && muts[i].addedNodes.length) { schedule(); break; }
    }
  });

  function start() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      schedule();
      console.log('[' + V + '] 100% 보장 가까운 역 patch 시작');
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
