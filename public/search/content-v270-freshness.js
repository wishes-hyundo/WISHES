/**
 * WISHES Search Freshness & Sort Overlay — v2.7.0
 * ==================================================================
 * 대상      : /public/search/content.js (v2.2.6) + content-v230-patch.js
 *             + content-v260-perf.js 위에 additive 하게 적용
 * 배포방식  : /public/search/content-v270-freshness.js 로 동일 폴더에 배치 후
 *             src/app/search/page.tsx 에서 content.js 뒤에 async:false 로드
 *
 * 해결하려는 문제 (공실클럽 staleness)
 *   - UI "최신순" 이 우리 크롤 created_at 기준이라 오래된 공실클럽 매물도
 *     오늘 크롤하면 "최신" 으로 올라옴
 *   - 원본 registered_date / last_confirmed 기준 정렬·배지 필요
 *
 * 이 오버레이가 제공하는 기능 (CP6)
 *   Stage 0  기본 필터        : registered_date >= '2026-01-01' 만 노출
 *   Stage 1  정렬 3종         : 신규등록(registered_date)
 *                              · 최근확인(last_confirmed)
 *                              · 크롤갱신(updated_at/created_at)
 *   Stage 2  신선도 배지 4종  : 🆕 신규등록(≤7d)
 *                              · 🟢 신선(확인≤7d)
 *                              · 🟡 확인필요(8~30d)
 *                              · 🔴 오래됨(30d+)
 *
 * 원본 보존 정책
 *   - window.WS.* 는 읽기만; 데이터는 __v270 네임스페이스에 격리
 *   - 카드 DOM 은 data-v270-badge 속성으로만 수정
 *   - 롤백: window.__WS_PATCH_V270__.rollback()
 *
 * @version 2.7.0
 * @build 2026-04-18
 * @author WISHES · 공실클럽 staleness 대응
 * ==================================================================
 */
(function __v270FreshnessBoot() {
  'use strict';

  var VERSION = '2.7.0';
  var BUILD   = '2026-04-18';
  var TAG     = '[WP v' + VERSION + ' fresh]';

  // ── 도메인 가드 (로컬 개발 허용) ──────────────────────────────────
  var host = location.hostname;
  var isProd = (host === 'wishes.co.kr' || host === 'www.wishes.co.kr');
  var isLocal = (host === 'localhost' || host === '127.0.0.1' || /\.vercel\.app$/.test(host));
  if (!isProd && !isLocal) return;
  if (location.pathname.indexOf('/admin-auth') !== -1) return;
  if (location.pathname.indexOf('/command-center') !== -1) return;

  // 중복 설치 방어
  if (window.__v270_installed) { console.log(TAG + ' already installed — skip'); return; }
  window.__v270_installed = true;

  // ── 설정 ──────────────────────────────────────────────────────────
  var CFG = {
    registeredDateMin: '2026-01-01',  // 기본 필터 컷오프 (공실클럽 원본 등록일)
    fresh:        { daysMax: 7 },     // 확인일 기준 "신선"
    needsCheck:   { daysMin: 8, daysMax: 30 },
    stale:        { daysMin: 31 },
    newListing:   { daysMax: 7 },     // 등록일 기준 "신규등록" (배지 우선)
    cardSelectors: [
      '.ws-listing-card',
      '.listing-card',
      '[data-listing-id]',
      '.ws-result-card'
    ],
    sortDefault: 'registered' // registered | confirmed | crawled
  };

  // ── 유틸 ──────────────────────────────────────────────────────────
  function parseDateLoose(v) {
    if (!v) return null;
    try {
      var s = String(v).trim();
      // YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
      var m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
      if (m) {
        var y = +m[1], mo = +m[2] - 1, d = +m[3];
        return new Date(y, mo, d).getTime();
      }
      var t = Date.parse(s);
      return isNaN(t) ? null : t;
    } catch (e) { return null; }
  }
  function daysSince(v) {
    var t = parseDateLoose(v);
    if (!t) return null;
    return Math.floor((Date.now() - t) / 86400000);
  }
  function pickPrimaryDate(L, key) {
    if (!L) return null;
    if (key === 'registered') return L.registered_date || L.created_at || null;
    if (key === 'confirmed')  return L.last_confirmed || L.registered_date || L.updated_at || null;
    if (key === 'crawled')    return L.updated_at || L.created_at || null;
    return L.registered_date || L.created_at || null;
  }

  // ── 배지 분류 ─────────────────────────────────────────────────────
  function classifyBadge(L) {
    var dReg = daysSince(L && L.registered_date);
    var dConf = daysSince(L && L.last_confirmed);

    // 1) 신규등록 최우선 (등록 7일 이내)
    if (dReg != null && dReg <= CFG.newListing.daysMax) {
      return { key:'new', label:'신규등록', icon:'🆕',
               bg:'#2563eb', fg:'#fff', title:'공실클럽 등록 ' + dReg + '일 전' };
    }
    // 2) 확인일이 있으면 확인일 기준
    var ref = (dConf != null) ? dConf : dReg;
    if (ref == null) {
      return { key:'unknown', label:'확인필요', icon:'❓',
               bg:'#94a3b8', fg:'#fff', title:'등록일 없음' };
    }
    if (ref <= CFG.fresh.daysMax) {
      return { key:'fresh', label:'신선', icon:'🟢',
               bg:'#059669', fg:'#fff', title:(dConf!=null?'최종확인 ':'등록 ') + ref + '일 전' };
    }
    if (ref <= CFG.needsCheck.daysMax) {
      return { key:'check', label:'확인필요', icon:'🟡',
               bg:'#d97706', fg:'#fff', title:(dConf!=null?'최종확인 ':'등록 ') + ref + '일 전' };
    }
    return { key:'stale', label:'오래됨', icon:'🔴',
             bg:'#dc2626', fg:'#fff', title:(dConf!=null?'최종확인 ':'등록 ') + ref + '일 전' };
  }

  // ── Stage 0 : registered_date 필터 + Stage 1 정렬 ──────────────────
  function applyFilterAndSort(listings, sortKey) {
    if (!Array.isArray(listings)) return listings;
    // [Step 9 fix 2026-05-16] v397 server pagination 활성 시 client filter/sort 우회
    //   서버가 이미 sort + filter 책임. client cutoff 가 추가 적용되면 100→99 등 표시 감소.
    if (window.__WS_V397_PAGINATION__) {
      return listings.slice();
    }
    var cutoff = parseDateLoose(CFG.registeredDateMin);
    var filtered = cutoff
      ? listings.filter(function(L) {
          var t = parseDateLoose(L && L.registered_date);
          // registered_date 가 아예 없으면 일단 통과 (구버전 DB 호환)
          if (t == null) return true;
          return t >= cutoff;
        })
      : listings.slice();

    var key = sortKey || CFG.sortDefault;
    filtered.sort(function(a, b) {
      var ta = parseDateLoose(pickPrimaryDate(a, key));
      var tb = parseDateLoose(pickPrimaryDate(b, key));
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb - ta; // desc
    });
    return filtered;
  }

  // ── 상태 ───────────────────────────────────────────────────────────
  var state = {
    currentSort: CFG.sortDefault,
    backupAll: null,       // 원본 allListings 백업 (롤백용)
    obs: null
  };

  // ── 스타일 주입 ────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('v270-fresh-styles')) return;
    var css = [
      /* 배지 */
      '.v270-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;',
        'font-size:11px;font-weight:700;line-height:1;letter-spacing:-0.2px;',
        'box-shadow:0 1px 2px rgba(0,0,0,0.08);white-space:nowrap;user-select:none}',
      '.v270-badge-ico{font-size:11px}',
      '.v270-badge-new{background:#2563eb;color:#fff}',
      '.v270-badge-fresh{background:#059669;color:#fff}',
      '.v270-badge-check{background:#d97706;color:#fff}',
      '.v270-badge-stale{background:#dc2626;color:#fff}',
      '.v270-badge-unknown{background:#94a3b8;color:#fff}',
      /* 카드 컨테이너 오버레이 */
      '.v270-badge-wrap{position:absolute;top:8px;left:8px;z-index:5;pointer-events:none}',
      '.v270-card-anchor{position:relative !important}',
      /* 정렬 선택기 */
      '.v270-sort{display:inline-flex;align-items:center;gap:6px;margin-left:8px;',
        'padding:6px 10px;background:#f0f7ed;border:1px solid #2D5A27;border-radius:8px;',
        'font-size:12px;color:#2D5A27;font-weight:600;cursor:pointer;font-family:inherit}',
      '.v270-sort:hover{background:#e5f0e0}',
      '.v270-sort-label{font-weight:700;color:#2D5A27}',
      '.v270-sort select{border:none;background:transparent;font-size:12px;',
        'font-weight:600;color:#2D5A27;outline:none;cursor:pointer;font-family:inherit}',
      /* 필터 뱃지 */
      '.v270-filter-chip{display:inline-block;margin-left:6px;padding:3px 10px;',
        'background:#fffbeb;border:1px solid #d97706;border-radius:999px;',
        'font-size:11px;color:#92400e;font-weight:700}',
      '.v270-summary{font-size:11.5px;color:#64748b;margin-top:4px}',
      '.v270-summary b{color:#2D5A27}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'v270-fresh-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ── 정렬 선택기 DOM 삽입 ───────────────────────────────────────────
  function ensureSortSelector() {
    if (document.getElementById('v270-sort-select')) return;

    // 1) 기존 정렬 드롭다운이 있으면 그 옆에 배치
    var host =
      document.querySelector('#ws-sort-select') ||
      document.querySelector('.ws-sort') ||
      document.querySelector('.ws-toolbar') ||
      document.querySelector('#ws-results-header') ||
      document.querySelector('.ws-page-info') ||
      document.querySelector('#ws-page-info-text');

    // fallback: body 최상단에 flex bar 주입
    var wrap = document.createElement('span');
    wrap.className = 'v270-sort';
    wrap.innerHTML =
      '<span class="v270-sort-label">📅 정렬</span>' +
      '<select id="v270-sort-select">' +
        '<option value="registered">신규등록순 (공실클럽 기준)</option>' +
        '<option value="confirmed">최근확인순</option>' +
        '<option value="crawled">크롤갱신순</option>' +
      '</select>' +
      '<span class="v270-filter-chip" title="2026년 이후 등록된 매물만 표시">2026년~</span>';

    if (host && host.parentNode) {
      // 인접 삽입
      host.parentNode.insertBefore(wrap, host.nextSibling);
    } else {
      // fallback
      var bar = document.createElement('div');
      bar.id = 'v270-sort-floating';
      bar.style.cssText = 'position:fixed;bottom:76px;right:16px;z-index:999;background:#fff;' +
        'border:1px solid #2D5A27;border-radius:10px;padding:6px 10px;box-shadow:0 4px 14px rgba(0,0,0,0.08)';
      bar.appendChild(wrap);
      document.body.appendChild(bar);
    }

    var sel = document.getElementById('v270-sort-select');
    if (sel) {
      sel.value = state.currentSort;
      sel.addEventListener('change', function() {
        state.currentSort = sel.value;
        console.log(TAG + ' sort → ' + state.currentSort);
        reapplyOrder();
        try {
          if (window.WS && window.WS.showToast) {
            var map = { registered:'신규등록순', confirmed:'최근확인순', crawled:'크롤갱신순' };
            window.WS.showToast('정렬: ' + (map[state.currentSort] || state.currentSort), 'info');
          }
        } catch(e){}
      });
    }
  }

  // ── allListings 재정렬 + 재렌더 트리거 ─────────────────────────────
  function reapplyOrder() {
    try {
      if (!window.WS || !Array.isArray(window.WS.allListings)) return;
      var source = state.backupAll || window.WS.allListings;
      if (!state.backupAll) state.backupAll = source.slice(); // 최초 1회 백업
      var reordered = applyFilterAndSort(state.backupAll, state.currentSort);
      window.WS.allListings = reordered;
      // 가능한 렌더 함수들 순차 호출
      var rendered = false;
      ['renderAll', 'renderResults', 'updateResults', 'showSearchUI'].forEach(function(fn) {
        if (!rendered && window.WS && typeof window.WS[fn] === 'function') {
          try { window.WS[fn](); rendered = true; }
          catch(e) { /* 다음으로 폴백 */ }
        }
      });
      // 페이지네이션/필터 재적용이 걸렸을 때 대비 — 400ms 뒤 배지 다시 긁기
      setTimeout(scanAndBadge, 400);
    } catch(e) {
      console.warn(TAG + ' reapplyOrder error', e);
    }
  }

  // ── 데이터 인덱스 (카드 DOM → listing 객체) ────────────────────────
  function indexAllListings() {
    var idx = {};
    try {
      var all = (window.WS && window.WS.allListings) || [];
      for (var i = 0; i < all.length; i++) {
        if (all[i] && all[i].id != null) idx[String(all[i].id)] = all[i];
      }
    } catch(e){}
    return idx;
  }

  function getCardListingId(card) {
    // 1) data-listing-id
    var a = card.getAttribute && (card.getAttribute('data-listing-id') || card.getAttribute('data-id'));
    if (a) return String(a);
    // 2) 자식 요소 onclick="...showDetail(숫자)..."
    var inner = card.innerHTML || '';
    var m = inner.match(/showDetail\((\d+)\)/);
    if (m) return m[1];
    // 3) 매물번호 텍스트
    var txt = card.textContent || '';
    var m2 = txt.match(/매물번호[^0-9]{0,4}(\d{5,})/);
    if (m2) return m2[1];
    return null;
  }

  // ── 배지 스캔 + 주입 ───────────────────────────────────────────────
  function injectBadgeOnCard(card, L) {
    if (!card || !L) return;
    if (card.getAttribute && card.getAttribute('data-v270-badge')) {
      // 이미 배지 있음 — 값이 바뀌었는지 비교
      var prev = card.getAttribute('data-v270-badge-key');
      var info = classifyBadge(L);
      if (prev === info.key) return; // 동일
      // 재주입
      var old = card.querySelector('.v270-badge-wrap');
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    var info = classifyBadge(L);
    var wrap = document.createElement('div');
    wrap.className = 'v270-badge-wrap';
    wrap.innerHTML =
      '<span class="v270-badge v270-badge-' + info.key + '" title="' + info.title + '">' +
        '<span class="v270-badge-ico">' + info.icon + '</span>' + info.label +
      '</span>';
    // 카드 position:relative 보장
    var cs = getComputedStyle(card);
    if (cs.position === 'static' || !cs.position) card.classList.add('v270-card-anchor');
    card.appendChild(wrap);
    card.setAttribute('data-v270-badge', '1');
    card.setAttribute('data-v270-badge-key', info.key);
  }

  function scanAndBadge() {
    try {
      var idx = indexAllListings();
      if (!Object.keys(idx).length) return;
      var cards = [];
      CFG.cardSelectors.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(c) { cards.push(c); });
      });
      // 중복 제거
      var seen = new Set();
      cards.forEach(function(card) {
        if (seen.has(card)) return; seen.add(card);
        var id = getCardListingId(card);
        if (!id) return;
        var L = idx[id];
        if (L) injectBadgeOnCard(card, L);
      });
    } catch(e) { /* silent */ }
  }

  // ── WS.allListings 변화 감지 + DOM Observer ────────────────────────
  var lastAllLen = -1;
  function pollAllListings() {
    try {
      if (!window.WS) return;
      var len = (window.WS.allListings || []).length;
      if (len !== lastAllLen) {
        lastAllLen = len;
        console.log(TAG + ' allListings len=' + len + ' — (re)apply');
        // [Step 13 fix 2026-05-16] v397 server pagination 모드:
        //   reorder/backup skip (서버가 sort 책임, allListings 재할당 GC 압박 해소)
        //   단 scanAndBadge 는 유지 (사용자 가시 'NEW'/'시간' 배지)
        if (window.__WS_V397_PAGINATION__) {
          setTimeout(scanAndBadge, 300);
          setTimeout(scanAndBadge, 1200);
          return;
        }
        state.backupAll = (window.WS.allListings || []).slice();
        // 최초 적용 시에만 정렬/필터 (이후엔 사용자 제어)
        var reordered = applyFilterAndSort(state.backupAll, state.currentSort);
        try { window.WS.allListings = reordered; } catch(e){}
        setTimeout(scanAndBadge, 300);
        // 렌더 후 한번 더 (페이지네이션 대응)
        setTimeout(scanAndBadge, 1200);
      }
    } catch(e){}
  }

  function startObserver() {
    if (state.obs) return;
    try {
      state.obs = new MutationObserver(function(muts) {
        var needScan = false;
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) { needScan = true; break; }
        }
        if (needScan) {
          if (state._badgeDebounce) clearTimeout(state._badgeDebounce);
          state._badgeDebounce = setTimeout(scanAndBadge, 200);
        }
      });
      state.obs.observe(document.body, { childList: true, subtree: true });
    } catch(e){}
  }

  // ── 요약 라인 표시 (선택적) ────────────────────────────────────────
  function renderSummary() {
    var el = document.getElementById('v270-summary-line');
    if (!el) {
      el = document.createElement('div');
      el.id = 'v270-summary-line';
      el.className = 'v270-summary';
      var host = document.getElementById('v270-sort-select');
      if (host && host.parentNode && host.parentNode.parentNode) {
        host.parentNode.parentNode.appendChild(el);
      } else return;
    }
    var all = (window.WS && window.WS.allListings) || [];
    var counts = { new:0, fresh:0, check:0, stale:0, unknown:0 };
    all.forEach(function(L) { counts[classifyBadge(L).key]++; });
    el.innerHTML =
      '<b>' + all.length + '건</b> · ' +
      '🆕 신규등록 ' + counts['new'] + ' · ' +
      '🟢 신선 ' + counts['fresh'] + ' · ' +
      '🟡 확인필요 ' + counts['check'] + ' · ' +
      '🔴 오래됨 ' + counts['stale'];
  }

  // ── 부트스트랩 ────────────────────────────────────────────────────
  function install() {
    injectStyles();
    ensureSortSelector();
    pollAllListings();
    startObserver();
    // 주기적 스캔 (0.8s × 15회 = 12s 내 안정화)
    var tick = 0;
    var iv = setInterval(function() {
      tick++;
      pollAllListings();
      scanAndBadge();
      renderSummary();
      if (tick > 15) clearInterval(iv);
    }, 800);

    // Public API
    window.__WS_PATCH_V270__ = {
      version: VERSION,
      build: BUILD,
      config: CFG,
      setSort: function(k) {
        if (['registered','confirmed','crawled'].indexOf(k) === -1) return false;
        state.currentSort = k;
        var sel = document.getElementById('v270-sort-select');
        if (sel) sel.value = k;
        reapplyOrder();
        return true;
      },
      reapply: reapplyOrder,
      scan: scanAndBadge,
      classifyBadge: classifyBadge,
      rollback: function() {
        try {
          if (state.backupAll && window.WS) window.WS.allListings = state.backupAll;
          if (state.obs) { state.obs.disconnect(); state.obs = null; }
          document.querySelectorAll('.v270-badge-wrap').forEach(function(n){ n.remove(); });
          document.querySelectorAll('[data-v270-badge]').forEach(function(n){
            n.removeAttribute('data-v270-badge');
            n.removeAttribute('data-v270-badge-key');
            n.classList.remove('v270-card-anchor');
          });
          var s = document.getElementById('v270-fresh-styles'); if (s) s.remove();
          var sel = document.getElementById('v270-sort-select');
          if (sel && sel.parentNode) sel.parentNode.remove();
          var floating = document.getElementById('v270-sort-floating');
          if (floating) floating.remove();
          window.__v270_installed = false;
          console.log(TAG + ' rolled back');
        } catch(e){ console.warn(TAG + ' rollback error', e); }
      }
    };

    console.log('%c' + TAG + ' installed · sort=' + state.currentSort + ' · filter≥' + CFG.registeredDateMin,
      'background:#059669;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;');
  }

  // WS 준비 대기
  function waitWS() {
    if (window.WS && typeof window.WS === 'object') return install();
    var n = 0;
    var iv = setInterval(function() {
      n++;
      if (window.WS || n > 80) { // 12s timeout
        clearInterval(iv);
        install();
      }
    }, 150);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    waitWS();
  } else {
    document.addEventListener('DOMContentLoaded', waitWS);
  }
})();
