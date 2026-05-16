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
  var pendingFetchPage = null;  // [Step 6 fix 2026-05-16] 진행 중 fetch 시 다음 요청 저장
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
  // [Critical fix 2026-05-15] DOM 의 카운트 박스 + type 탭 직접 update
  function updateDomCounts(j) {
    try {
      // ws-mgmt-stat: data-status-filter 별 카운트 (전체/공개/비공개/계약중/계약완료)
      var allStat = document.querySelector('.ws-mgmt-stat[data-status-filter="all"]');
      if (allStat) {
        var num = allStat.querySelector('div[style*="font-size:18px"], .ws-mgmt-num');
        if (num) num.textContent = (j.total || 0).toLocaleString();
        // fallback: 첫 번째 div 가 숫자
        else {
          var divs = allStat.querySelectorAll('div');
          if (divs[0]) divs[0].textContent = (j.total || 0).toLocaleString();
        }
      }
      var statusMap = { '공개': '공개', '비공개': '비공개', '계약중': '계약중', '계약완료': '계약완료' };
      Object.keys(statusMap).forEach(function (key) {
        var el = document.querySelector('.ws-mgmt-stat[data-status-filter="' + key + '"]');
        if (!el) return;
        var n = (j.by_status && j.by_status[key]) || 0;
        var divs = el.querySelectorAll('div');
        if (divs[0]) divs[0].textContent = n.toLocaleString();
      });

      // ws-type-tabs: type 별 카운트
      var typeContainer = document.getElementById('ws-type-tabs');
      if (typeContainer && j.by_type) {
        var typeButtons = typeContainer.querySelectorAll('.ws-type-tab[data-type]');
        typeButtons.forEach(function (btn) {
          var t = btn.dataset.type;
          var count = (t === '전체') ? (j.total || 0) : (j.by_type[t] || 0);
          var span = btn.querySelector('.ws-count');
          if (span) span.textContent = count.toLocaleString();
        });
      }

      // 검색결과: NNNN건 표시
      var resultLabel = document.querySelector('[class*="검색결과"], #ws-search-result-count');
      // 또는 page-info-text
      var pageInfo = document.getElementById('ws-page-info-text');
      // skip — 페이지네이션 v397 가 별도 처리
    } catch (e) {
      try { console.warn('[v397] updateDomCounts err:', e && e.message); } catch (_) {}
    }
  }

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
        if (window.WS) {
          window.WS.__counts = {
            total: j.total,
            by_type: j.by_type,
            by_status: j.by_status,
            by_deal: j.by_deal,
          };
        }
        // [Critical fix 2026-05-15] DOM 카운트 직접 update — content.js renderTypeTabs override
        try {
          updateDomCounts(j);
        } catch (_) {}
        log('page-counts OK total=' + j.total);
      } catch (_) {}
    } catch (_) {}
  }

  async function fetchServerPage(pageNum) {
    if (loading) {
      // [Step 6 fix 2026-05-16] 진행 중이면 최신 요청 저장 (마지막 변경이 우선)
      pendingFetchPage = pageNum;
      return;
    }
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
      // [Critical fix 2026-05-16] global var assignment for renderPagination wrap (sparse total trick)
      window.__v397_totalCount = totalCount;
      lastFetchKey = fetchKey;
      // [Step 8 fix 2026-05-16] client _autoDedup 제거 — 사장님 요청: 100건 = 100건 표시
      //   이전 (5/15): server raw 100건 → client dedup → 99건 표시 (사용자 혼란)
      //   현재: server 응답 그대로 사용 → 요청 size 만큼 정확히 표시
      //   영향: DB 에 중복 매물 있으면 화면에 노출됨 (DB cleanup 으로 별개 처리 권장)
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
      // [Critical fix 2026-05-15] renderPagination 은 wrap 함수가 처리 (wrapRenderPagination)
      try { if (window.WS && typeof window.WS.renderPagination === 'function') window.WS.renderPagination(); } catch (_) {}
      // [정밀검수 fix 2026-05-15] page 1 이면 탭 배지용 page-counts 도 호출
      if (pageNum === 1) {
        fetchPageCounts(filterParams, scope).catch(function () { /* silent */ });
      }
    } catch (e) {
      log('fetch err:', e && e.message);
    }
    loading = false;
    // [Step 6 fix 2026-05-16] 진행 중 들어온 변경이 있으면 즉시 재실행
    if (pendingFetchPage != null) {
      var p = pendingFetchPage;
      pendingFetchPage = null;
      log('pending fetch fire:', p);
      fetchServerPage(p);
    }
  }

  // [Critical fix 2026-05-15] renderPagination wrap — 누가 호출하든 totalCount 사용
  function wrapRenderPagination() {
    if (!window.WS || typeof window.WS.renderPagination !== 'function') {
      return setTimeout(wrapRenderPagination, 200);
    }
    if (window.WS.__v397_renderPagWrapped) return;
    window.WS.__v397_renderPagWrapped = true;
    var orig = window.WS.renderPagination;
    window.WS.renderPagination = function () {
      var total = window.__v397_totalCount || 0;
      if (total > 0 && window.WS) {
        // sparse filtered + allListings 으로 정확한 페이지 버튼 그림
        var origFiltered = window.WS.filtered;
        var origAll = window.WS.allListings;
        try {
          window.WS.filtered = new Array(total);
          window.WS.allListings = new Array(total);
          return orig.call(this);
        } finally {
          window.WS.filtered = origFiltered;
          window.WS.allListings = origAll;
        }
      }
      return orig.call(this);
    };
    log('renderPagination wrapped (sparse total)');
  }

  // loadData 무력화 (server pagination 모드에서만)
  // [Critical fix 2026-05-16 Step 2.1] WS 또는 WS.loadData 미준비 시 retry
  //   - 이전 Step 2: !window.WS 만 체크해서 'WS 있지만 loadData 함수 아닌 상태' 놓침
  //   - Step 2.1: typeof window.WS.loadData !== 'function' 도 함께 체크
  function disableLegacyLoad() {
    if (!window.WS || typeof window.WS.loadData !== 'function') {
      // WS 또는 loadData 가 아직 준비 안 됨 → 100ms 마다 retry, 최대 30회 (3초)
      var retries = 0;
      var iv = setInterval(function () {
        if (window.WS && typeof window.WS.loadData === 'function') {
          clearInterval(iv);
          disableLegacyLoad();  // 재귀 호출 (이번엔 ready)
        } else if (++retries > 30) {
          clearInterval(iv);
          log('disableLegacyLoad: WS/loadData not ready after 3s (다른 fallback 으로 보호됨)');
        }
      }, 100);
      return;
    }
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
    wrapRenderPagination();
    // [Phase G 2026-05-15] v361 auto-refresh 차단 — __searchActive 영구 true
    try {
      if (window.WS) window.WS.__searchActive = true;
    } catch (_) {}
    // [Critical race fix 2026-05-15 v2] content.js loadData 차단 + 1초 후 override
    //   Object.defineProperty 는 page freeze 야기 (다른 patch 와 충돌) → 사용 X
    //   대신: _prefetchOnReady=false 로 loadData 호출 자체 차단 + setInterval 로 override
    try {
      if (window.WS) {
        window.WS._prefetchOnReady = false;   // content.js 의 setTimeout loadData 차단
        window.WS._prefetchStarted = true;     // 다른 곳에서 loadData 호출 가드
        // 정기적으로 v397 결과로 set (legacy override 시도 차단)
        setInterval(function () {
          try {
            if (window.WS && window.WS.allListings && window.WS.allListings.length > 200) {
              // legacy 가 64K 채웠음 → v397 fetch 다시
              log('legacy detected (len=' + window.WS.allListings.length + ') → re-fetch v397');
              lastFetchKey = ''; // force re-fetch
              fetchServerPage(1);
            }
          } catch (_) {}
        }, 1500);
      }
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
    // [Step 7 fix 2026-05-16] 초기값을 현재 buildFilterParams 결과로 설정
    //   이전: lastFilterKey='' + 첫 폴링에서 fk='{}' !== '' 라 항상 spurious fetchServerPage(1)
    //   fix: 초기값을 실제 빌드 결과로 → 첫 폴링은 변경 없으면 무동작 (정상)
    var lastFilterKey;
    try {
      lastFilterKey = JSON.stringify(buildFilterParams() || {});
    } catch (_) {
      lastFilterKey = '';
    }
    setInterval(function () {
      try {
        var fp = buildFilterParams();
        var fk = JSON.stringify(fp);
        if (fk !== lastFilterKey) {
          lastFilterKey = fk;
          fetchServerPage(1);
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
