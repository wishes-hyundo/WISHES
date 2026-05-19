/**
 * v406 — 검색 자동완성 dropdown (C-2)
 * 사장님 명령 2026-05-19: 검색창 타이핑 시 즉시 추천 dropdown
 *
 * 동작:
 *   1. .ws-global-search input 에 keyup event hook
 *   2. value 1자 이상이면 200ms debounce 후 추천 dropdown 표시:
 *      - 매물번호 (정확 4-7자리 숫자 매치)
 *      - 지역명 (allListings 의 dong/gu/address 부분 매치)
 *      - 건물명 (allListings 의 building_name 부분 매치)
 *   3. dropdown item 클릭 시:
 *      - 매물번호 → showDetail 직접 호출
 *      - 지역/건물명 → input 채우고 검색 실행
 *
 * 안전:
 *   - 클라이언트 사이드 only (새 API endpoint 불필요)
 *   - 이미 메모리에 있는 allListings 활용
 *   - dropdown blur 시 자동 닫기
 */
(function () {
  'use strict';
  if (window.__WS_V406_AUTOCOMPLETE__) return;
  window.__WS_V406_AUTOCOMPLETE__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBOUNCE_MS = 200;
  var MAX_ITEMS = 8;
  var debounceTimer = null;
  var dropdown = null;
  var lastInput = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
    });
  }

  function injectStyles() {
    if (document.getElementById('ws-v406-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v406-style';
    style.textContent = [
      '.ws-v406-dropdown{position:absolute;z-index:9999;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:320px;overflow-y:auto;width:100%;font-size:13px}',
      '.ws-v406-dropdown .v406-item{padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f3f4f6}',
      '.ws-v406-dropdown .v406-item:last-child{border-bottom:none}',
      '.ws-v406-dropdown .v406-item:hover,.ws-v406-dropdown .v406-item.active{background:#e8f5e9}',
      '.ws-v406-dropdown .v406-icon{font-size:14px;color:#1B5E20;width:16px;text-align:center}',
      '.ws-v406-dropdown .v406-label{flex:1;color:#1f2937}',
      '.ws-v406-dropdown .v406-count{font-size:11px;color:#9ca3af}',
      '.ws-v406-dropdown .v406-empty{padding:16px 12px;color:#9ca3af;text-align:center;font-size:12px}'
    ].join('');
    document.head.appendChild(style);
  }

  function uniqueByLabel(arr) {
    var seen = {};
    return arr.filter(function (x) {
      if (seen[x.label]) return false;
      seen[x.label] = true;
      return true;
    });
  }

  function searchSuggestions(query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return [];
    var results = [];
    // 매물번호 (4-7자리 숫자)
    if (/^\d{4,7}$/.test(q)) {
      results.push({ type: 'id', label: '매물번호 ' + q, value: q, icon: '#' });
    }
    var allListings = (window.WS && Array.isArray(window.WS.allListings)) ? window.WS.allListings : [];
    var dongMatches = [];
    var guMatches = [];
    var bldgMatches = [];
    var addrMatches = [];
    for (var i = 0; i < allListings.length && (dongMatches.length + guMatches.length + bldgMatches.length + addrMatches.length) < 40; i++) {
      var l = allListings[i];
      if (!l) continue;
      var dong = (l.dong || '').toLowerCase();
      var gu = (l.gu || '').toLowerCase();
      var bldg = (l.building_name || '').toLowerCase();
      var addr = (l.address || '').toLowerCase();
      if (dong && dong.indexOf(q) !== -1) dongMatches.push({ type: 'dong', label: l.dong, value: l.dong, icon: '📍' });
      if (gu && gu.indexOf(q) !== -1) guMatches.push({ type: 'gu', label: l.gu, value: l.gu, icon: '📍' });
      if (bldg && bldg.indexOf(q) !== -1) bldgMatches.push({ type: 'building', label: l.building_name, value: l.building_name, icon: '🏢' });
      if (addr && addr.indexOf(q) !== -1) {
        // 주소 부분 (시군구 + 동) 추출
        var addrShort = (l.gu || '') + ' ' + (l.dong || '');
        if (addrShort.trim()) addrMatches.push({ type: 'addr', label: addrShort.trim(), value: addrShort.trim(), icon: '📍' });
      }
    }
    // dedup
    dongMatches = uniqueByLabel(dongMatches);
    guMatches = uniqueByLabel(guMatches);
    bldgMatches = uniqueByLabel(bldgMatches);
    addrMatches = uniqueByLabel(addrMatches);
    // 우선순위: 매물번호 > 지역 > 건물명 > 주소
    results = results.concat(dongMatches.slice(0, 3));
    results = results.concat(guMatches.slice(0, 2));
    results = results.concat(bldgMatches.slice(0, 3));
    results = results.concat(addrMatches.slice(0, 2));
    return uniqueByLabel(results).slice(0, MAX_ITEMS);
  }

  function getResultCount(label) {
    var allListings = (window.WS && Array.isArray(window.WS.allListings)) ? window.WS.allListings : [];
    var ll = label.toLowerCase();
    var c = 0;
    for (var i = 0; i < allListings.length; i++) {
      var l = allListings[i];
      if (!l) continue;
      if ((l.dong || '').toLowerCase() === ll || (l.gu || '').toLowerCase() === ll ||
          (l.building_name || '').toLowerCase() === ll ||
          ((l.address || '').toLowerCase().indexOf(ll) !== -1)) c++;
    }
    return c;
  }

  function buildDropdownHtml(items) {
    if (items.length === 0) {
      return '<div class="v406-empty">매칭되는 결과 없음 (페이지 1의 100매물 기준)</div>';
    }
    return items.map(function (item, i) {
      var count = (item.type === 'id') ? '' :
                  '<span class="v406-count">' + getResultCount(item.label) + '+개</span>';
      return '<div class="v406-item" data-idx="' + i + '" data-type="' + item.type + '" data-value="' + esc(item.value) + '">' +
                '<span class="v406-icon">' + item.icon + '</span>' +
                '<span class="v406-label">' + esc(item.label) + '</span>' +
                count +
             '</div>';
    }).join('');
  }

  function showDropdown(input, items) {
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'ws-v406-dropdown';
      document.body.appendChild(dropdown);
    }
    dropdown.innerHTML = buildDropdownHtml(items);
    var rect = input.getBoundingClientRect();
    dropdown.style.left = (rect.left + window.scrollX) + 'px';
    dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    dropdown.style.width = rect.width + 'px';
    dropdown.style.position = 'absolute';
    dropdown.style.display = 'block';
    // bind click
    dropdown.querySelectorAll('.v406-item').forEach(function (el) {
      el.addEventListener('mousedown', function (e) {
        e.preventDefault();
        var type = el.getAttribute('data-type');
        var value = el.getAttribute('data-value');
        applySelection(input, type, value);
      });
    });
  }

  function hideDropdown() {
    if (dropdown) dropdown.style.display = 'none';
  }

  function applySelection(input, type, value) {
    hideDropdown();
    if (type === 'id') {
      // 매물번호 → showDetail 직접
      if (window.WS && typeof window.WS.fetchListingById === 'function' && typeof window.WS.showDetail === 'function') {
        window.WS.fetchListingById(value).then(function (l) {
          if (l) window.WS.showDetail(l);
        });
      }
    } else {
      // 지역/건물명 → keyword 입력 + 검색
      input.value = value;
      if (window.WS && window.WS.state) {
        window.WS.state.keyword = value;
        window.WS.state.page = 1;
        if (typeof window.WS.refresh === 'function') window.WS.refresh();
      }
    }
  }

  function handleInput(e) {
    var input = e.target;
    if (!input.matches('.ws-global-search')) return;
    lastInput = input;
    var q = input.value;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!q || q.length < 1) { hideDropdown(); return; }
    debounceTimer = setTimeout(function () {
      var items = searchSuggestions(q);
      showDropdown(input, items);
    }, DEBOUNCE_MS);
  }

  function handleBlur() {
    setTimeout(hideDropdown, 200);
  }

  function handleFocus(e) {
    var input = e.target;
    if (!input.matches('.ws-global-search')) return;
    if (input.value && input.value.length >= 1) {
      var items = searchSuggestions(input.value);
      if (items.length > 0) showDropdown(input, items);
    }
  }

  function init() {
    injectStyles();
    document.addEventListener('input', handleInput, true);
    document.addEventListener('blur', handleBlur, true);
    document.addEventListener('focus', handleFocus, true);
    document.addEventListener('click', function (e) {
      if (!dropdown) return;
      if (dropdown.contains(e.target)) return;
      if (e.target.matches && e.target.matches('.ws-global-search')) return;
      hideDropdown();
    }, true);
    // scroll 시 닫기
    window.addEventListener('scroll', hideDropdown, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try { console.log('[v406-search-autocomplete] installed (dropdown 8 items, debounce 200ms)'); } catch (_) {}
})();
