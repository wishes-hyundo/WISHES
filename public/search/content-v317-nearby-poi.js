/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v317 — 카카오 기반 주변 시설 (역 + 버스정류장)
 * 작성: 2026-04-29 — 사장님 명령 '100% 정확한 위치 기반 카카오기반'
 *
 * 동작:
 *   1. 매물 모달 등장 + listing.lat/lng 추출
 *   2. /api/admin/nearby-poi?lat=X&lng=Y 호출 (server-side Kakao Local API)
 *   3. 응답: { subway: [{name, distance_m, walk_min, line}], bus: [{name, distance_m, walk_min}] }
 *   4. 모달에 '주변 시설' 섹션 추가 (위치 다음)
 *
 * 카카오 Local API:
 *   - SW8 카테고리: 지하철역
 *   - BS3 카테고리: 버스정류장
 *   - radius 1500m, sort=distance, size=5
 *
 * 정책: 위/경도 없으면 무동작. 카카오 무료 한도 (일 100K).
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v317-nearby-poi';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getLatLng() {
    try {
      var L = window.WS && window.WS.__lastListing;
      if (!L) return null;
      var lat = L.lat || L.latitude;
      var lng = L.lng || L.longitude;
      if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
    } catch (_) {}
    return null;
  }

  function getCached(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && o.ts && Date.now() - o.ts < 30 * 60 * 1000) return o.data;
    } catch (_) {}
    return null;
  }
  function setCached(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: data })); } catch (_) {}
  }

  function fetchNearby(lat, lng) {
    var key = 'wsNearbyV1:' + lat.toFixed(5) + ':' + lng.toFixed(5);
    var cached = getCached(key);
    if (cached) return Promise.resolve(cached);
    return fetch('/api/admin/nearby-poi?lat=' + lat + '&lng=' + lng, {
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.success) {
          setCached(key, j);
          return j;
        }
        return null;
      })
      .catch(function (e) { console.warn('[' + V + '] fetch failed', e && e.message); return null; });
  }

  function renderSection(modal, data) {
    if (!data || (!data.subway && !data.bus)) return;
    // 중복 체크 제거 — applyAll 이 매물 변경 시 옛 섹션 이미 제거

    var sec = document.createElement('section');
    sec.className = 'v240-section v317-poi-sec';
    var html = '<h2>📍 주변 시설 <span style="font-size:11px;color:#888;font-weight:400;margin-left:6px">카카오 Local · 도보 80m/분</span></h2>';
    html += '<div class="v240-body">';

    if (Array.isArray(data.subway) && data.subway.length) {
      html += '<div class="v317-poi-group"><div class="v317-poi-h">🚇 지하철역</div><ul class="v317-poi-list">';
      data.subway.forEach(function (s) {
        var walk = s.walk_min || Math.max(1, Math.round((s.distance_m || 0) / 80));
        html += '<li><span class="v317-poi-name">' + esc(s.name) +
                (s.line ? '<span class="v317-poi-line">' + esc(s.line) + '</span>' : '') +
                '</span>' +
                '<span class="v317-poi-dist">' + (s.distance_m || '-') + 'm · 도보 ' + walk + '분</span></li>';
      });
      html += '</ul></div>';
    }
    if (Array.isArray(data.bus) && data.bus.length) {
      html += '<div class="v317-poi-group"><div class="v317-poi-h">🚌 버스정류장</div><ul class="v317-poi-list">';
      data.bus.forEach(function (b) {
        var walk = b.walk_min || Math.max(1, Math.round((b.distance_m || 0) / 80));
        html += '<li><span class="v317-poi-name">' + esc(b.name) + '</span>' +
                '<span class="v317-poi-dist">' + (b.distance_m || '-') + 'm · 도보 ' + walk + '분</span></li>';
      });
      html += '</ul></div>';
    }
    html += '</div>';
    sec.innerHTML = html;

    // L-poi-above (2026-04-29): 사장님 명령 — 주변 시설 섹션을 위치 위로.
    var locSec = null;
    modal.querySelectorAll('.v240-section h2').forEach(function (h) {
      if (/위치/.test(h.textContent || '')) locSec = h.parentElement;
    });
    if (locSec && locSec.parentNode) locSec.parentNode.insertBefore(sec, locSec);
    else modal.appendChild(sec);
  }

  function injectCss() {
    if (document.getElementById('v317-poi-css')) return;
    var s = document.createElement('style');
    s.id = 'v317-poi-css';
    s.textContent =
      '.v317-poi-sec .v317-poi-group{margin-bottom:14px}' +
      '.v317-poi-h{font-size:13px;font-weight:700;color:oklch(28% 0.10 145);margin-bottom:6px}' +
      '.v317-poi-list{list-style:none;padding:0;margin:0;display:grid;gap:5px}' +
      '.v317-poi-list li{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:oklch(97% 0.02 145);border-radius:6px;font-size:12px}' +
      '.v317-poi-name{font-weight:600;color:oklch(20% 0.05 145)}' +
      '.v317-poi-line{margin-left:8px;background:oklch(58% 0.13 145);color:white;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700}' +
      '.v317-poi-dist{color:oklch(45% 0.05 145);font-size:11px;font-weight:500}';
    document.head.appendChild(s);
  }

  function applyAll() {
    try {
      injectCss();
      var modal = document.getElementById('ws-detail-container') ||
                  document.querySelector('.ws-detail-container') ||
                  document.querySelector('[id^="ws-detail-modal"]') ||
                  document.querySelector('#ws-detail-content');
      if (!modal) return;
      var ll = getLatLng();
      if (!ll) return;
      // L-lid-marker (2026-04-29): 매물 ID 별 마커 — ID 변경 시 섹션 새로 갱신.
      var L = window.WS && window.WS.__lastListing;
      var lid = (L && L.id) ? String(L.id) : (ll.lat + ',' + ll.lng);
      if (modal.dataset.v317lid === lid) return;
      // 옛날 섹션 제거 후 새로 추가 (매물 변경 시 갱신)
      var oldSec = modal.querySelector('.v317-poi-sec');
      if (oldSec && oldSec.parentNode) oldSec.parentNode.removeChild(oldSec);
      modal.dataset.v317lid = lid;
      fetchNearby(ll.lat, ll.lng).then(function (data) {
        if (data) renderSection(modal, data);
      });
    } catch (e) { console.warn('[' + V + '] failed:', e && e.message); }
  }

  var debounceTimer = null;
  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyAll, 200);
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
      console.log('[' + V + '] observer 시작 — 카카오 기반 주변 시설');
    } catch (e) { console.warn('[' + V + '] start failed:', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
