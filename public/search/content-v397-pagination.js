/**
 * v397 — Server pagination + global search (v363 후속)
 * 사장님 명령 2026-05-15: 서버 페이지네이션 도입 (Phase E)
 *
 * 동작:
 *   1. /api/system-flags 호출 → use_server_pagination 확인
 *   2. 'true' 면 server pagination 모드:
 *      - WS.loadData() 무력화 (legacy 64K load 차단)
 *      - 페이지 진입 + filter 변경 시 /api/admin/listings/page v3 호출
 *      - 33개 filter param + sort + page + scope 전송
 *      - 응답으로 WS.allListings = data (20-100건) 설정
 *      - WS.state.totalListings = total 설정
 *      - 페이지 버튼 click → fetchServerPage(N)
 *   3. 'false' 또는 endpoint 실패면 legacy 모드 (loadData 그대로)
 *
 * 안전:
 *   - feature flag false → 영향 0 (legacy 모드)
 *   - flag check 실패 → legacy fallback
 *   - 에러 발생 → console.warn + legacy fallback
 *
 * v363 와 차이:
 *   - v363: 양쪽 endpoint 동시 호출 (race)
 *   - v397: flag 기반 단일 endpoint (race 제거)
 *   - 33개 filter 지원 (v363 는 q/type/deal 만)
 */
(function () {
  'use strict';
  if (window.__WS_V397_PAGINATION__) return;
  window.__WS_V397_PAGINATION__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var ENDPOINT = '/api/admin/listings/page';
  var COUNTS_ENDPOINT = '/api/admin/listings/page-counts';
  var FLAG_ENDPOINT = '/api/system-flags';

  var enabled = false; // feature flag 결과
  var flagChecked = false;
  var loading = false;
  var totalCount = 0;
  var lastFetchKey = '';

  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, ['[v397-pagination]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function getToken() {
    try { return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || ''; }
    catch (_) { return ''; }
  }

  function getScope() {
    try {
      if (window.WS && window.WS.state && window.WS.state.scope === 'mine') return 'mine';
      var u = new URL(location.href);
      if ((u.searchParams.get('scope') || '').toLowerCase() === 'mine') return 'mine';
    } catch (_) {}
    return 'all';
  }

  function getPerPage() {
    try {
      if (window.WS && window.WS.state && typeof window.WS.state.perPage === 'number') {
        return Math.max(1, Math.min(200, window.WS.state.perPage));
      }
    } catch (_) {}
    return 20;
  }

  // WS.state 의 모든 filter 를 v3 param 으로 변환
  function buildFilterParams() {
    var s = (window.WS && window.WS.state) || {};
    var p = {};
    // 기본
    if (s.keyword && s.keyword.trim()) p.q = s.keyword.trim();
    if (s.sortBy) p.sort = s.sortBy;
    if (s.sort2 && s.sort2 !== 'none') p.sort2 = s.sort2;
    // 다중 type/deal/status
    if (s.typeTabs && s.typeTabs.length > 0) p.types = s.typeTabs.join(',');
    else if (s.typeTab && s.typeTab !== '전체') p.type = s.typeTab;
    if (s.deals && s.deals.length > 0) p.deals = s.deals.join(',');
    else if (s.deal && s.deal !== '전체') p.deal = s.deal;
    if (s._statusFilter) p.status = s._statusFilter;
    // 카테고리
    if (s.floor && s.floor !== '전체') p.floor_type = s.floor;
    var rc = (s.roomCounts && s.roomCounts.length > 0) ? s.roomCounts :
             (s.roomCount && s.roomCount !== '전체' ? [s.roomCount] : []);
    if (rc.length > 0) p.room_counts = rc.join(',');
    if (s.parking && s.parking !== '전체') p.parking_min = parseInt(s.parking, 10) || 0;
    if (s.builtYear && s.builtYear !== '전체') {
      var ym = String(s.builtYear).match(/\d{4}/);
      if (ym) p.built_year_min = parseInt(ym[0], 10);
    }
    // 가격 범위
    if (s.minDeposit !== '' && s.minDeposit != null) p.min_deposit = parseInt(s.minDeposit, 10);
    if (s.maxDeposit !== '' && s.maxDeposit != null) p.max_deposit = parseInt(s.maxDeposit, 10);
    if (s.minMonthly !== '' && s.minMonthly != null) p.min_monthly = parseInt(s.minMonthly, 10);
    if (s.maxMonthly !== '' && s.maxMonthly != null) p.max_monthly = parseInt(s.maxMonthly, 10);
    if (s.includeMgmt) p.include_mgmt = 1;
    if (s.minSalePrice !== '' && s.minSalePrice != null) p.min_sale = parseInt(s.minSalePrice, 10);
    if (s.maxSalePrice !== '' && s.maxSalePrice != null) p.max_sale = parseInt(s.maxSalePrice, 10);
    if (s.minBasePrice !== '' && s.minBasePrice != null) p.min_base = parseInt(s.minBasePrice, 10);
    if (s.maxBasePrice !== '' && s.maxBasePrice != null) p.max_base = parseInt(s.maxBasePrice, 10);
    // 면적
    if (s.minArea !== '' && s.minArea != null) p.min_area = parseFloat(s.minArea);
    if (s.maxArea !== '' && s.maxArea != null) p.max_area = parseFloat(s.maxArea);
    if (s.areaUnit) p.area_unit = s.areaUnit;
    if (s.minSupply !== '' && s.minSupply != null) p.min_supply = parseFloat(s.minSupply);
    if (s.maxSupply !== '' && s.maxSupply != null) p.max_supply = parseFloat(s.maxSupply);
    if (s.supplyUnit) p.supply_unit = s.supplyUnit;
    // boolean
    var c = s.checks || {};
    if (c.buildingPhoto) p.building_photo = 1;
    if (c.interiorPhoto) p.interior_photo = 1;
    if (c.parkingAvailable) p.parking_available = 1;
    if (c.emptyNow) p.empty_now = 1;
    if (c.elevator) p.elevator = 1;
    if (c.loanAvailable) p.loan_available = 1;
    if (c.noFullOption) p.no_full_option = 1;
    if (c.fullOptionOnly) p.full_option_only = 1;
    if (c.priceNego) p.price_nego = 1;
    // 지역
    if (s.selectedDongs && s.selectedDongs.length > 0) p.selected_dongs = s.selectedDongs.join('|');
    else if (s.selectedRegions && s.selectedRegions.length > 0) p.selected_regions = s.selectedRegions.join('|');
    // 키워드 + 건물
    if (s.jibunStart) p.jibun_start = s.jibunStart;
    if (s.jibunEnd) p.jibun_end = s.jibunEnd;
    if (s.buildingName) p.building_name = s.buildingName;
    if (s.buildingId) p.building_id = parseInt(s.buildingId, 10) || 0;
    return p;
  }

  // feature flag 확인
  async function checkFeatureFlag() {
    if (flagChecked) return enabled;
    flagChecked = true;
    try {
      var r = await fetch(FLAG_ENDPOINT, { cache: 'no-store' });
      if (r.ok) {
        var j = await r.json();
        enabled = (j.flags && j.flags.use_server_pagination === 'true');
        log('feature flag use_server_pagination =', enabled);
      }
    } catch (e) {
      log('flag check failed (fallback legacy):', e && e.message);
      enabled = false;
    }
    return enabled;
  }

  // 서버 페이지 fetch
  // [정밀검수 fix 2026-05-15] 탭 배지 카운트 endpoint
  async function fetchPageCounts(filterParams, scope) {
    var t = getToken();
    if (!t) return;
    try {
      var qs = '?scope=' + scope;
      for (var k in filterParams) {
        if (filterParams[k] != null && filterParams[k] !== '') {
          qs += '&' + k + '=' + encodeURIComponent(String(filterParams[k]));
        }
      }
      var r = await fetch(COUNTS_ENDPOINT + qs, {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + t },
      });
      if (!r.ok) return;
      var j = await r.json();
      if (!j || !j.success) return;
      try {
        // by_type / by_status / by_deal — WS.state 에 저장 + UI 렌더 함수 호출
        if (window.WS) {
          window.WS.__counts = {
            total: j.total,
            by_type: j.by_type,
            by_status: j.by_status,
            by_deal: j.by_deal,
          };
          // 탭 갱신 시도 (content.js 의 renderTypeTabs / updateCounts 등)
          if (typeof window.WS.renderTypeTabs === 'function') window.WS.renderTypeTabs();
          if (typeof window.WS.updateStatusCounts === 'function') window.WS.updateStatusCounts();
        }
        log('page-counts OK total=' + j.total);
      } catch (_) {}
    } catch (_) {}
  }

  async function fetchServerPage(pageNum) {
    if (loading) return;
    if (!window.WS) { log('WS missing'); return; }
    var perPage = getPerPage();
    var scope = getScope();
    var filterParams = buildFilterParams();
    var fetchKey = JSON.stringify({ pageNum, perPage, scope, filterParams });
    if (fetchKey === lastFetchKey) return; // 동일 요청 중복 방지

    loading = true;
    var t0 = Date.now();
    try {
      var qs = '?page=' + pageNum + '&size=' + perPage + '&scope=' + scope;
      for (var k in filterParams) {
        if (filterParams[k] != null && filterParams[k] !== '') {
          qs += '&' + k + '=' + encodeURIComponent(String(filterParams[k]));
        }
      }
      qs += '&_ts=' + Date.now();
      var r = await fetch(ENDPOINT + qs, {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + getToken() },
      });
      if (!r.ok) { log('http', r.status, '(' + (Date.now()-t0) + 'ms)'); loading = false; return; }
      var j = await r.json();
      if (!j || !j.success) { log('bad resp:', j && j.error); loading = false; return; }
      var data = j.data || [];
      totalCount = (typeof j.total === 'number') ? j.total : (totalCount || data.length);
      lastFetchKey = fetchKey;
      window.WS.allListings = data.slice();
      try {
        if (window.WS.state) {
          window.WS.state.page = pageNum;
          window.WS.state.totalListings = totalCount;
        }
      } catch (_) {}
      log('page', pageNum, 'OK', data.length + '/' + totalCount, '(' + (Date.now()-t0) + 'ms)');
      // 화면 재렌더 — content.js 의 renderAll 호출 시도
      try { if (window.WS && typeof window.WS.renderAll === 'function') window.WS.renderAll(); } catch (_) {}
      try { if (window.WS && typeof window.WS.renderPagination === 'function') window.WS.renderPagination(); } catch (_) {}
      // [정밀검수 fix 2026-05-15] page 1 이면 탭 배지용 page-counts 도 호출
      if (pageNum === 1) {
        fetchPageCounts(filterParams, scope).catch(function () { /* silent */ });
      }
    } catch (e) {
      log('fetch err:', e && e.message);
    }
    loading = false;
  }

  // loadData 무력화 (server pagination 모드에서만)
  function disableLegacyLoad() {
    if (!window.WS) return;
    if (window.WS.__v397_loadDataOriginal) return; // 이미 처리됨
    window.WS.__v397_loadDataOriginal = window.WS.loadData;
    window.WS.loadData = function () {
      log('legacy loadData blocked (server pagination active)');
      // 대신 서버 페이지 fetch
      fetchServerPage(1);
    };
    log('legacy loadData disabled');
  }

  async function init() {
    var ok = await checkFeatureFlag();
    if (!ok) {
      log('legacy mode (flag false)');
      return;
    }
    // server pagination 모드 — loadData 무력화 + 첫 페이지 fetch
    disableLegacyLoad();
    // [Phase G 2026-05-15] v361 auto-refresh 차단 — __searchActive 영구 true
    //   v361 가 30초마다 polling 해서 WS.allListings 덮어쓰는 것 방지
    //   server pagination 모드에서는 자동 새로고침 의미 없음 (페이지 진입 시 자동 fresh)
    try {
      if (window.WS) window.WS.__searchActive = true;
    } catch (_) {}
    setTimeout(function () { fetchServerPage(1); }, 100);
    // 페이지 버튼 click hook
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.ws-pagination-btn, [data-page]');
      if (!btn) return;
      var p = parseInt(btn.dataset.page || btn.getAttribute('data-page') || '0', 10);
      if (p > 0) {
        e.preventDefault();
        fetchServerPage(p);
      }
    }, true);
    // filter 변경 감지 (500ms 폴링)
    var lastFilterKey = '';
    setInterval(function () {
      try {
        var fp = buildFilterParams();
        var fk = JSON.stringify(fp);
        if (fk !== lastFilterKey) {
          lastFilterKey = fk;
          if (Object.keys(fp).length > 0 || lastFilterKey !== '') {
            fetchServerPage(1);
          }
        }
      } catch (_) {}
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
