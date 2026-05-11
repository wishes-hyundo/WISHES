/**
 * v356 — Instant stats display (옵션 Z Step 3B)
 * 사장님 명령 2026-05-11.
 *
 * 진단:
 *   v354 streaming 으로 매물 카드 점진 도착 시 검색결과/공개/비공개/원룸/오피스텔...
 *   숫자가 점프 (0 → 1만 → 2만 → ... → 62418). 사장님 시야 거슬림.
 *
 * 목적:
 *   페이지 진입 즉시 /api/admin/listings/stats fetch.
 *   응답 받자마자 DOM 의 모든 카운트 표시 element 를 정확한 stats 값으로 강제 set.
 *   v354 stream 으로 매물 카드 점진 도착해도 카운트는 stats 값 고정 (lock).
 *
 * 동작:
 *   1. 페이지 진입 200ms 후 stats fetch (v294 wrap 안전 대기)
 *   2. 응답 받으면 DOM 의 숫자 표시 element 강제 update
 *   3. MutationObserver + setInterval (100ms × 30초) 로 v354 의 update 가
 *      카운트를 변경하려 하면 즉시 stats 값으로 복원
 *   4. 30초 후 또는 사용자 interaction (검색/필터 click) 시 lock release
 *      → 그 후로는 자연스럽게 검색/필터 결과 반영
 *
 * 카운트 DOM 매핑 (사장님 시야):
 *   - "전체 62,418" (matrix 카드 first cell)
 *   - "공개 62,206" / "비공개 212" / "계약중 0" / "완료 0"
 *   - "원룸 20701" / "오피스텔 689" / "아파트 219" / "사무실 5948" / "상가 17690" / "빌라 353" / "토지 50"
 *   - "검색결과: 62418건" (page footer)
 *
 * 회귀 회피:
 *   - 새 파일 → 기존 patch 안 건드림
 *   - stats endpoint fail 시 silent skip (v354 의 자연스러운 update 만 작동)
 *   - 사용자 interaction 감지 시 즉시 lock release
 *   - 30초 후 자동 release (safety)
 *   - 등록 안 하면 prod 영향 0
 *
 * 안전 가드:
 *   - DOM element 못 찾으면 skip
 *   - lock release 후 다시 lock 안 함
 *   - try/catch 로 모든 DOM 조작 안전
 */
(function () {
  'use strict';
  if (window.__WS_V356_INSTANT_STATS__) return;
  window.__WS_V356_INSTANT_STATS__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var INIT_DELAY_MS = 100;
  var LOCK_MS = 30000;         // 30초 lock (v354 60K 완료까지 충분)
  var ENDPOINT = '/api/admin/listings/stats';

  var stats = null;
  var lockReleased = false;
  var enforcerInterval = null;

  function log() {
    if (!DEBUG) return;
    var args = ['[v356-instant-stats]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function getToken() {
    try {
      return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch (_) { return ''; }
  }

  function fmtNum(n) {
    if (typeof n !== 'number') return '';
    return n.toLocaleString('ko-KR');  // "62,418"
  }

  // Find DOM elements to enforce + their target values
  function buildTargets(s) {
    var t = [];
    // Helper — find by text pattern in label nearby
    function findByLabel(labelText, expected) {
      // Look for element whose previous/parent sibling contains labelText
      var labels = Array.from(document.querySelectorAll('*')).filter(function (el) {
        // skip script/style/inputs
        if (['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA'].indexOf(el.tagName) !== -1) return false;
        // direct text node only
        var direct = '';
        for (var i = 0; i < el.childNodes.length; i++) {
          if (el.childNodes[i].nodeType === 3) direct += el.childNodes[i].textContent;
        }
        return direct.trim() === labelText;
      });
      return labels;
    }

    return t;
  }

  // Enforce stats display — locate number elements and force-set their text
  function enforceStats() {
    if (!stats || lockReleased) return;
    try {
      // 사장님 시야의 카운트 element들을 찾는 가장 robust 한 방법:
      // 1. 모든 element 의 textContent �-���순 숫자 (콤마 포함) 형식인 것들 검출
      // 2. 가까운 sibling/parent 에 매칭되는 label (전체/공개/원룸 등) 이 있는지 확인
      // 3. 매칭되면 stats 값으로 set
      
      var labelToValue = {
        '전체': stats.total,
        '공개': stats.by_status?.open || 0,
        '비공개': stats.by_status?.private || 0,
        '계약중': stats.by_status?.contracted || 0,
        '완료': stats.by_status?.completed || 0,
        '원룸': stats.by_type?.oneroom || 0,
        '오피스텔': stats.by_type?.officetel || 0,
        '아파트': stats.by_type?.apt || 0,
        '사무실': stats.by_type?.office || 0,
        '상가': stats.by_type?.store || 0,
        '빌라': stats.by_type?.villa || 0,
        '토지': stats.by_type?.land || 0,
      };
      
      var updated = 0;
      
      // 검색결과: N건 텍스트 처리
      // selector: 다양함. content.js 의 출력 패턴 추정.
      var searchResultEls = document.querySelectorAll('[class*="search-result"], [class*="searchResult"], [id*="search-result"], [id*="searchResult"]');
      searchResultEls.forEach(function (el) {
        var t = el.textContent;
        if (t && /검색결과/.test(t)) {
          var newText = '검색결과: ' + fmtNum(stats.total) + '건';
          if (el.textContent !== newText) {
            el.textContent = newText;
            updated++;
          }
        }
      });
      
// 페이지 footer 의 "검색결과: 62418건" — 텍스트에서 찾기
      var allEls = document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6, td, th, li');
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        // skip if has many children (compound)
        if (el.children.length > 0) continue;
        var txt = el.textContent ? el.textContent.trim() : '';
        if (!txt) continue;
        
        // "검색결과: 62418건" 패턴
        var m1 = txt.match(/^검색결과:\s*[\d,]+\s*건$/);
        if (m1) {
          var newT = '검색결과: ' + fmtNum(stats.total) + '건';
          if (el.textContent !== newT) {
            el.textContent = newT;
            updated++;
          }
          continue;
        }
        
        // pure number cells — check sibling label
        var n = parseInt(txt.replace(/,/g, ''), 10);
        if (!isNaN(n)) {
          // Check if a label element is nearby (parent's sibling or own sibling)
          var parent = el.parentElement;
          if (!parent) continue;
          // Look for label among siblings
          for (var k = 0; k < parent.children.length; k++) {
            var sib = parent.children[k];
            if (sib === el) continue;
            var sibTxt = sib.textContent ? sib.textContent.trim() : '';
            if (sibTxt in labelToValue) {
              var target = labelToValue[sibTxt];
              var newN = fmtNum(target);
              if (txt !== newN) {
                el.textContent = newN;
                updated++;
              }
              break;
            }
          }
        }
      }
      
      if (updated > 0) {
        log('enforced', updated, 'count elements');
      }
    } catch (e) {
      log('enforceStats error:', e && e.message);
    }
  }

  function releaseLock() {
    if (lockReleased) return;
    lockReleased = true;
    if (enforcerInterval) {
      clearInterval(enforcerInterval);
      enforcerInterval = null;
    }
    log('lock released');
  }

  function setupUserInteractionRelease() {
    // 검색 input, 필터 button 등 사용자 interaction 감지 → release
    function releaseOnce() {
      log('user interaction detected — releasing lock');
      releaseLock();
    }
    document.addEventListener('click', function (e) {
      // 검색 button, 필터 checkbox/button click 시
      var target = e.target;
      if (!target) return;
      if (target.matches && (target.matches('button, input[type="checkbox"], input[type="radio"]') ||
          target.closest('button, input[type="checkbox"], input[type="radio"]'))) {
        // 단, body 안의 일반 click 은 무시. 검색/필터 영역만.
        var inFilterArea = target.closest('[class*="filter"], [class*="search"], [class*="검색"]');
        if (inFilterArea) {
          setTimeout(releaseOnce, 100);
        }
      }
    }, { capture: true, passive: true });
    
    document.addEventListener('input', function (e) {
      // 검색 input 입력 시
      var target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        setTimeout(releaseOnce, 100);
      }
    }, { capture: true, passive: true });
  }

  async function fetchStats() {
    var t0 = Date.now();
    try {
      var response = await fetch(ENDPOINT, {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + getToken() },
      });
      if (!response.ok) throw new Error('http_' + response.status);
      var d = await response.json();
      var ms = Date.now() - t0;
      if (!d || !d.success) {
        log('stats invalid:', d);
        return;
      }
      stats = d;
      log('stats received in', ms, 'ms:', d.total, 'total');
      
      // Immediate enforce + setInterval lock for LOCK_MS
      enforceStats();
      enforcerInterval = setInterval(function () {
        enforceStats();
      }, 100);
      
      // Auto-release after LOCK_MS
      setTimeout(releaseLock, LOCK_MS);
    } catch (e) {
      log('stats fail:', e && e.message);
    }
  }

  function init() {
    setupUserInteractionRelease();
    setTimeout(fetchStats, INIT_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('installed (endpoint', ENDPOINT, ', lock', LOCK_MS, 'ms)');
})();
