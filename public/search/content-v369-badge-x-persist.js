/**
 * v369 — 만료 badge X 닫기 버튼 끈질기게 유지 + 데스크탑/모바일 모두 적용
 * 사장님 명령 2026-05-14.
 *
 * 발견된 v368 버그:
 *   - v368 이 X 버튼 append 했음 (decorated=true)
 *   - 그러나 content.js 의 checkExpiringListings 가 매물 들어올 때마다
 *     badge.innerHTML = '...' 으로 통째 덮어씀 → X 버튼 사라짐
 *   - 결과: 사용자 시야에 X 버튼 안 보임
 *
 * v369 fix:
 *   - MutationObserver 로 badge 의 child 변경 감지
 *   - X 버튼 사라지면 즉시 다시 append (영원히)
 *   - dismissed 상태면 badge 자체 display:none
 *   - 데스크탑에서도 적용 (PC 에서도 사장님이 가리는 문제 호소함)
 *
 * 회귀 회피:
 *   - 새 파일 — v368 등록 그대로 유지
 *   - v368 의 decorateBadge 와 idempotent (이미 X 있으면 skip)
 */
(function () {
  'use strict';
  if (window.__WS_V369_BADGE_X_PERSIST__) return;
  window.__WS_V369_BADGE_X_PERSIST__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var DISMISS_KEY = 'ws_expiry_badge_dismissed';
  var X_BTN_MARKER = 'data-v369-close';

  function log() {
    if (!DEBUG) return;
    var args = ['[v369-badge-x-persist]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function isDismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (_) { return false; }
  }
  function setDismissed() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
  }

  function createCloseBtn(badge) {
    var btn = document.createElement('button');
    btn.textContent = '×';
    btn.title = '닫기 (다시 안 보기)';
    btn.setAttribute(X_BTN_MARKER, '1');
    btn.style.cssText = [
      'position: absolute',
      'top: 2px',
      'right: 6px',
      'background: transparent',
      'border: none',
      'color: rgb(133, 100, 4)',
      'font-size: 20px',
      'font-weight: 700',
      'line-height: 20px',
      'cursor: pointer',
      'padding: 0 4px',
      'margin: 0',
      'opacity: 0.7',
      'z-index: 1',
    ].join(';');
    btn.addEventListener('mouseenter', function () { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', function () { btn.style.opacity = '0.7'; });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setDismissed();
      badge.style.transition = 'opacity 0.3s, transform 0.3s';
      badge.style.opacity = '0';
      badge.style.transform = 'translateX(-20px)';
      setTimeout(function () {
        badge.style.display = 'none';
        // observer stop after dismiss
        if (badge.__v369_observer) {
          try { badge.__v369_observer.disconnect(); } catch (_) {}
          badge.__v369_observer = null;
        }
      }, 300);
      log('badge dismissed by user');
    });
    return btn;
  }

  function ensureXButton(badge) {
    // dismissed 상태면 badge 자체 숨김
    if (isDismissed()) {
      badge.style.display = 'none';
      return;
    }
    // X 버튼 이미 있으면 skip
    if (badge.querySelector('[' + X_BTN_MARKER + ']')) return;

    // padding-right 공간 확보
    try {
      var pr = parseInt(window.getComputedStyle(badge).paddingRight) || 16;
      badge.style.paddingRight = Math.max(pr, 28) + 'px';
    } catch (_) {}
    badge.style.position = badge.style.position || 'fixed';

    // X 버튼 추가
    badge.appendChild(createCloseBtn(badge));
    log('X button added');
  }

  function attachToBadge(badge) {
    if (!badge || badge.__v369_attached) return;
    badge.__v369_attached = true;
    ensureXButton(badge);
    // observe child changes — content.js 가 innerHTML 덮어쓸 때마다 X 다시 붙임
    try {
      var obs = new MutationObserver(function () { ensureXButton(badge); });
      obs.observe(badge, { childList: true });
      badge.__v369_observer = obs;
      log('observer attached');
    } catch (e) {
      log('observer err:', e && e.message);
    }
  }

  function watchForBadge() {
    var badge = document.getElementById('ws-expiry-badge');
    if (badge) {
      attachToBadge(badge);
      return;
    }
    // 아직 없으면 body MutationObserver
    var bodyObs = new MutationObserver(function () {
      var b = document.getElementById('ws-expiry-badge');
      if (b) {
        attachToBadge(b);
        try { bodyObs.disconnect(); } catch (_) {}
      }
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });
    log('waiting for badge...');
  }

  function init() {
    watchForBadge();
    log('installed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
