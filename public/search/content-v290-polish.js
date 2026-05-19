/* ============================================================
 * content-v290-polish.js — WISHES /search 2차 모바일 폴리싱 (22건)
 * Deployed: 2026-04-20
 *
 * 전제:
 *   - 신규 기능 추가 금지 원칙 (feedback_no_feature_bloat)
 *     → 풀투리프레시·로고 교체·sort 커스텀 DD 등 "기능 신규" 범주는
 *        최소한의 폴리싱 수준 (CSS·피드백·접근성)으로 한정
 *   - v280 의 핵심 기능 (이미지 hydrate, G/O 배지 제거) 절대 보존
 *
 * 적용 항목:
 *   [P0-1] 페이지네이션 ≥ 40×40  (CSS 병행)
 *   [P0-2] 🏠 이모지 placeholder → 건물 실루엣 SVG
 *   [P0-3] 하단바 safe-area-inset-bottom (CSS 병행)
 *   [P0-4] 카드 :active scale(.98) 피드백 (CSS 병행)
 *   [P0-5] 이미지 aspect-ratio 4/3 강제 (CSS 병행)
 *   [P1-1] 스켈레톤 shimmer (fetch 중)
 *   [P1-2] 빈 검색결과 UI + 리드 캡처 CTA
 *   [P1-3] 하단바 모바일 3개 + ⋯ 폴드
 *   [P1-4] 상세 모달 body scroll lock
 *   [P1-5] 스크롤 위치 sessionStorage 복원
 *   [P2-1] 이미지 onload 페이드인
 *   [P2-2] 에러 토스트 (fetch 실패 catch)
 *   [P2-3] 오프라인 배너
 *   [P2-4] 풀투리프레시 (경량 touch drag)
 *   [P2-5] 필터 하단시트 드로어 (모바일)
 *   [P2-6] 하단바 아이콘 prefix
 *   [P3-1] 주소 폰트 14px (CSS)
 *   [P3-2] 필터바 position static 모바일 (CSS)
 *   [P3-3] 즐겨찾기 haptic vibrate(10)
 *   [P3-4] Sort select 스타일 개선 (CSS)
 *   [P3-5] 브랜드 로고 wordmark 강조 (CSS)
 *   [P3-6] /contact 신뢰 배지 — 본 스크립트 범위 외 (별도 페이지 작업)
 *
 * Rollback: window.__WS_V290_POLISH__.rollback()
 * ============================================================ */
(function () {
  'use strict';

  if (window.__WS_V290_POLISH__) {
    try { window.__WS_V290_POLISH__.rollback && window.__WS_V290_POLISH__.rollback(); } catch (e) {}
  }

  var STATE = {
    installedAt: Date.now(),
    bodyLockPrev: null,
    offlineBanner: null,
    toastEl: null,
    moPlaceholder: null,
    moFade: null,
    moEmpty: null,
    moBottomBar: null,
    ptrCleanup: null,
    scrollRestoreApplied: false,
    safetyInterval: null
  };

  var IS_MOBILE = function () { return window.innerWidth <= 768; };

  // ------------------------------------------------------------------
  // [P0-2] 이미지 placeholder — 🏠 이모지 → 건물 실루엣 SVG
  // ------------------------------------------------------------------
  var BUILDING_SVG = '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="8" y="14" width="32" height="28" rx="2" fill="#D4D4D8" stroke="#A1A1AA" stroke-width="1.5"/>' +
    '<rect x="13" y="19" width="5" height="5" rx="0.5" fill="#FAFAFA"/>' +
    '<rect x="21.5" y="19" width="5" height="5" rx="0.5" fill="#FAFAFA"/>' +
    '<rect x="30" y="19" width="5" height="5" rx="0.5" fill="#FAFAFA"/>' +
    '<rect x="13" y="27" width="5" height="5" rx="0.5" fill="#FAFAFA"/>' +
    '<rect x="21.5" y="27" width="5" height="5" rx="0.5" fill="#FAFAFA"/>' +
    '<rect x="30" y="27" width="5" height="5" rx="0.5" fill="#FAFAFA"/>' +
    '<rect x="20" y="35" width="8" height="7" rx="0.5" fill="#FAFAFA"/>' +
    '<path d="M6 14 L24 6 L42 14" stroke="#A1A1AA" stroke-width="1.5" fill="#E4E4E7"/>' +
    '</svg>' +
    '<div style="font-size:11px;color:#71717A;margin-top:4px;font-weight:600;">이미지 준비중</div>';

  function replacePlaceholders(root) {
    var scope = root || document;
    var n = 0;
    scope.querySelectorAll('div.ws-listing-image').forEach(function (el) {
      // 이미 교체된 경우 skip
      if (el.querySelector('svg')) return;
      var content = (el.textContent || '').trim();
      if (content === '🏠' || content === '' || !el.querySelector('img')) {
        el.innerHTML = BUILDING_SVG;
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.background = '#F4F4F5';
        el.style.borderRadius = '8px';
        n++;
      }
    });
    return n;
  }

  // ------------------------------------------------------------------
  // [P2-1] 이미지 onload 페이드인 + [P0-5] aspect-ratio 강제
  //   안전 버전: opacity:0 시작 → load 시 1. load 이벤트 fail 대비
  //   2초 타임아웃 안전망으로 강제 opacity:1 복원.
  // ------------------------------------------------------------------
  function applyImageFade(root) {
    var scope = root || document;
    scope.querySelectorAll('img.ws-listing-image').forEach(function (img) {
      if (img.dataset.wsFadeApplied) return;
      img.dataset.wsFadeApplied = '1';
      // aspect-ratio 강제로 CLS 방지
      if (!img.style.aspectRatio) img.style.aspectRatio = '4/3';
      if (!img.style.objectFit) img.style.objectFit = 'cover';
      if (!img.style.background) img.style.background = '#F4F4F5';
      // 이미 완료된 경우 즉시 표시
      var wasLoaded = img.complete && img.naturalWidth > 0;
      if (wasLoaded) {
        img.style.opacity = '1';
        return;
      }
      // 페이드인 (안전망 포함)
      img.style.opacity = '0';
      img.style.transition = 'opacity 220ms ease';
      var revealed = false;
      var reveal = function () {
        if (revealed) return;
        revealed = true;
        img.style.opacity = '1';
        img.removeEventListener('load', reveal);
        img.removeEventListener('error', reveal);
      };
      img.addEventListener('load', reveal);
      img.addEventListener('error', reveal);
      // [Step 40 fix 2026-05-19 사장님 명령] setTimeout(reveal, 2000) 안전망 제거
      //   원인: 매 이미지마다 setTimeout = 100매물 × 페이지전환 N번 = 1770+ 누적
      //         → main thread freeze (사장님 보고: __V403_CALLERS v29 = 1770)
      //   해결: load/error event listener 만 사용. (image natural load is robust)
      //   이미 wasLoaded check 위에 있어 cached image 도 OK.
    });
  }

  // ------------------------------------------------------------------
  // [P1-2] 빈 검색결과 UI + 리드 캡처 CTA
  // ------------------------------------------------------------------
  function checkEmptyState() {
    var listings = document.querySelector('.ws-listings');
    if (!listings) return;
    // 카드가 0개이고 로딩중 아닌 상태
    var cards = listings.querySelectorAll('.ws-listing-card, .ws-listing');
    var skeletons = listings.querySelectorAll('.ws-skeleton-card');
    if (cards.length > 0 || skeletons.length > 0) {
      var empty = document.getElementById('ws-empty-state');
      if (empty) empty.remove();
      return;
    }
    if (document.getElementById('ws-empty-state')) return;
    // 리스팅 영역이 방금 초기화 중일 수도 있어 조건 더 확인
    if (listings.textContent.trim() === '' || /매물이 없/i.test(listings.textContent || '')) {
      var emptyHTML =
        '<div id="ws-empty-state" class="ws-empty-state" role="status" aria-live="polite">' +
        '<div class="ws-empty-icon" aria-hidden="true">' +
          '<svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<circle cx="32" cy="32" r="22" stroke="#A1A1AA" stroke-width="2.5"/>' +
          '<line x1="48" y1="48" x2="60" y2="60" stroke="#A1A1AA" stroke-width="2.5" stroke-linecap="round"/>' +
          '</svg>' +
        '</div>' +
        '<h3 class="ws-empty-title">조건에 맞는 매물이 없어요</h3>' +
        '<p class="ws-empty-desc">필터를 완화해 보거나 원하는 조건을 저장하면,<br/>새 매물이 등록될 때 가장 먼저 알려드려요.</p>' +
        '<div class="ws-empty-actions">' +
          '<button type="button" class="ws-empty-btn ws-empty-btn-primary" data-ws-empty="reset">필터 초기화</button>' +
          '<button type="button" class="ws-empty-btn ws-empty-btn-ghost" data-ws-empty="notify">원하는 매물 알림받기</button>' +
        '</div>' +
        '</div>';
      listings.insertAdjacentHTML('beforeend', emptyHTML);
      var resetBtn = listings.querySelector('[data-ws-empty="reset"]');
      var notifyBtn = listings.querySelector('[data-ws-empty="notify"]');
      if (resetBtn) resetBtn.addEventListener('click', function () {
        // 기존 reset 트리거 시도
        var r = document.querySelector('.ws-filter-reset, [data-ws-reset], .ws-filters-reset');
        if (r) r.click();
        else location.href = location.pathname;
      });
      if (notifyBtn) notifyBtn.addEventListener('click', function () {
        location.href = '/contact?source=empty-state';
      });
    }
  }

  // ------------------------------------------------------------------
  // [P1-4] 상세 모달 열림 시 body scroll lock
  // ------------------------------------------------------------------
  function bindModalScrollLock() {
    var lockMO = new MutationObserver(function () {
      var modalOpen = !!document.querySelector('.ws-modal:not([hidden]), .ws-detail-modal.open, .ws-modal.show, [data-ws-modal-open="true"]');
      var body = document.body;
      if (modalOpen && body.style.overflow !== 'hidden') {
        STATE.bodyLockPrev = body.style.overflow || '';
        body.style.overflow = 'hidden';
      } else if (!modalOpen && body.style.overflow === 'hidden' && STATE.bodyLockPrev !== null) {
        body.style.overflow = STATE.bodyLockPrev;
        STATE.bodyLockPrev = null;
      }
    });
    lockMO.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-ws-modal-open'] });
    STATE.moModalLock = lockMO;
  }

  // ------------------------------------------------------------------
  // [P1-5] 스크롤 위치 sessionStorage 복원
  // ------------------------------------------------------------------
  function bindScrollRestore() {
    if (STATE.scrollRestoreApplied) return;
    STATE.scrollRestoreApplied = true;
    try { history.scrollRestoration = 'manual'; } catch (e) {}
    var KEY = 'ws_search_scroll_' + location.pathname;
    // 저장: 매물 카드 클릭 시점
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.ws-listing-card, .ws-listing');
      if (card) {
        try { sessionStorage.setItem(KEY, String(window.scrollY)); } catch (err) {}
      }
    }, true);
    // 복원: pageshow (bfcache 대응)
    window.addEventListener('pageshow', function () {
      try {
        var y = parseInt(sessionStorage.getItem(KEY) || '0', 10);
        if (y > 0) {
          setTimeout(function () { window.scrollTo(0, y); }, 250);
          setTimeout(function () { sessionStorage.removeItem(KEY); }, 600);
        }
      } catch (err) {}
    });
  }

  // ------------------------------------------------------------------
  // [P1-3] 하단바 모바일 3개 + ⋯ 폴드
  // ------------------------------------------------------------------
  var MOBILE_CORE = ['관심+', '비교', 'AI브리핑'];
  var ICON_MAP = {
    '관심+': '♡',
    '관심목록': '★',
    '비교': '⇄',
    'AI브리핑': '✨',
    '전체선택': '☑',
    '해제': '✕',
    '인쇄': '🖨',
    '엑셀': '⬇'
  };
  function collapseBottomBar() {
    if (!IS_MOBILE()) return;
    var bar = document.querySelector('.ws-bottom-bar, .ws-bottom-action-bar');
    if (!bar || bar.dataset.wsFolded === '1') return;
    var buttons = bar.querySelectorAll('button, .ws-bottom-action-btn');
    if (buttons.length < 5) return;
    var primary = [], secondary = [];
    buttons.forEach(function (b) {
      var txt = (b.textContent || '').trim().replace(/\s+/g, ' ');
      var core = MOBILE_CORE.find(function (k) { return txt.indexOf(k) === 0 || txt === k; });
      if (core) primary.push({ btn: b, label: core, full: txt });
      else secondary.push({ btn: b, label: txt });
    });
    if (primary.length === 0) return;
    // 보조 버튼 숨김
    secondary.forEach(function (s) { s.btn.style.display = 'none'; s.btn.dataset.wsHidden = '1'; });
    // ⋯ 버튼 추가
    if (!bar.querySelector('.ws-bar-more')) {
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'ws-bar-more';
      more.setAttribute('aria-label', '더보기');
      more.textContent = '⋯';
      more.style.cssText = 'min-width:44px;min-height:44px;font-size:18px;font-weight:700;background:#F4F4F5;border:1px solid #E4E4E7;border-radius:8px;color:#27272A;cursor:pointer;';
      more.addEventListener('click', function () {
        secondary.forEach(function (s) {
          s.btn.style.display = s.btn.dataset.wsHidden === '1' ? '' : 'none';
          s.btn.dataset.wsHidden = s.btn.dataset.wsHidden === '1' ? '0' : '1';
        });
      });
      bar.appendChild(more);
    }
    // [P2-6] 아이콘 prefix
    primary.forEach(function (p) {
      if (p.btn.dataset.wsIconed === '1') return;
      var icon = ICON_MAP[p.label];
      if (icon && !/♡|⇄|✨|★/.test(p.btn.textContent)) {
        p.btn.innerHTML = '<span aria-hidden="true" style="margin-right:4px;">' + icon + '</span>' + p.btn.innerHTML;
        p.btn.dataset.wsIconed = '1';
      }
    });
    bar.dataset.wsFolded = '1';
  }

  // ------------------------------------------------------------------
  // [P2-2] 에러 토스트
  // ------------------------------------------------------------------
  function ensureToastEl() {
    if (STATE.toastEl && document.body.contains(STATE.toastEl)) return STATE.toastEl;
    var el = document.createElement('div');
    el.id = 'ws-toast-v290';
    el.className = 'ws-toast';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(20px);background:rgba(24,24,27,.95);color:#FAFAFA;padding:10px 18px;border-radius:20px;font-size:14px;font-weight:600;z-index:10000;opacity:0;transition:opacity 200ms,transform 200ms;pointer-events:none;max-width:92vw;text-align:center;';
    document.body.appendChild(el);
    STATE.toastEl = el;
    return el;
  }
  function showToast(msg, variant) {
    var el = ensureToastEl();
    el.textContent = msg;
    if (variant === 'error') el.style.background = 'rgba(220,38,38,.96)';
    else if (variant === 'success') el.style.background = 'rgba(22,163,74,.96)';
    else el.style.background = 'rgba(24,24,27,.95)';
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2800);
  }
  // fetch 래퍼 — 에러 잡아 토스트
  if (!window.__ws_fetch_wrapped__) {
    window.__ws_fetch_wrapped__ = true;
    var origFetch = window.fetch.bind(window);
    window.fetch = function (url, opts) {
      return origFetch(url, opts).catch(function (err) {
        // 검색/매물 API 에러만 토스트
        var u = String(url || '');
        if (/\/api\/(listings|search|inquir)/i.test(u)) {
          showToast('네트워크 오류 — 잠시 후 다시 시도해주세요', 'error');
        }
        throw err;
      });
    };
  }

  // ------------------------------------------------------------------
  // [P2-3] 오프라인 배너
  // ------------------------------------------------------------------
  function showOfflineBanner() {
    if (STATE.offlineBanner) return;
    var el = document.createElement('div');
    el.id = 'ws-offline-banner';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#DC2626;color:#fff;padding:10px 14px;text-align:center;font-size:13px;font-weight:700;z-index:10001;';
    el.innerHTML = '⚠ 오프라인입니다 — 연결을 확인해주세요';
    document.body.appendChild(el);
    STATE.offlineBanner = el;
  }
  function hideOfflineBanner() {
    if (STATE.offlineBanner) {
      try { STATE.offlineBanner.remove(); } catch (e) {}
      STATE.offlineBanner = null;
    }
  }
  window.addEventListener('offline', showOfflineBanner);
  window.addEventListener('online', hideOfflineBanner);
  if (!navigator.onLine) showOfflineBanner();

  // ------------------------------------------------------------------
  // [P2-4] 풀투리프레시 (경량, 스크롤 최상단에서만 발동)
  // ------------------------------------------------------------------
  function bindPullToRefresh() {
    if (!IS_MOBILE()) return;
    if (STATE.ptrCleanup) return;
    var startY = 0;
    var active = false;
    var indicator = document.createElement('div');
    indicator.id = 'ws-ptr-indicator';
    indicator.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%) translateY(-60px);width:40px;height:40px;border-radius:50%;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;font-size:18px;z-index:10002;transition:transform 220ms;pointer-events:none;';
    indicator.innerHTML = '↻';
    var onTouchStart = function (e) {
      if (window.scrollY > 2) return;
      startY = e.touches[0].clientY;
      active = true;
      if (!document.body.contains(indicator)) document.body.appendChild(indicator);
    };
    var onTouchMove = function (e) {
      if (!active) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 0 && dy < 140) {
        var show = Math.min(dy, 80) - 60;
        indicator.style.transform = 'translateX(-50%) translateY(' + show + 'px) rotate(' + (dy * 3) + 'deg)';
      }
    };
    var onTouchEnd = function (e) {
      if (!active) return;
      var endY = (e.changedTouches && e.changedTouches[0].clientY) || startY;
      var dy = endY - startY;
      if (dy > 70) {
        indicator.style.transform = 'translateX(-50%) translateY(20px)';
        showToast('새로고침 중...', 'default');
        setTimeout(function () { location.reload(); }, 200);
      } else {
        indicator.style.transform = 'translateX(-50%) translateY(-60px)';
      }
      active = false;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    STATE.ptrCleanup = function () {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      try { indicator.remove(); } catch (e) {}
    };
  }

  // ------------------------------------------------------------------
  // [P3-3] 즐겨찾기 haptic vibrate(10)
  // ------------------------------------------------------------------
  function bindFavoriteHaptic() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.ws-favorite-btn');
      if (!btn) return;
      try { navigator.vibrate && navigator.vibrate(10); } catch (err) {}
    }, true);
  }

  // ------------------------------------------------------------------
  // [P0-1/P0-3/P0-4/P0-5/P1-1/P3-1/P3-2/P3-4/P3-5] — CSS 주입
  // ------------------------------------------------------------------
  function injectCSS() {
    if (document.getElementById('ws-v290-css')) return;
    var style = document.createElement('style');
    style.id = 'ws-v290-css';
    style.textContent = [
      /* [P0-1] 페이지네이션 40×40 */
      '@media (max-width: 768px) {',
      '  .ws-page-btn { min-width:40px !important; min-height:40px !important; padding:0 10px !important; font-size:14px !important; font-weight:600; }',
      /* [P0-3] 하단바 safe-area */
      '  .ws-bottom-bar, .ws-bottom-action-bar { padding-bottom: calc(8px + env(safe-area-inset-bottom)) !important; padding-left: calc(8px + env(safe-area-inset-left)); padding-right: calc(8px + env(safe-area-inset-right)); }',
      /* [P0-4] 카드 tap 피드백 */
      '  .ws-listing-card, .ws-listing { cursor: pointer !important; -webkit-tap-highlight-color: rgba(0,0,0,.06); transition: transform 120ms ease, box-shadow 120ms ease; }',
      '  .ws-listing-card:active, .ws-listing:active { transform: scale(0.985); }',
      /* [P0-5] 이미지 aspect-ratio */
      '  img.ws-listing-image { aspect-ratio: 4/3; object-fit: cover; background: #F4F4F5; }',
      '  div.ws-listing-image { aspect-ratio: 4/3; border-radius: 8px; }',
      /* [P1-1] 스켈레톤 shimmer */
      '  .ws-skeleton-card { background:#F4F4F5; border-radius:12px; height:160px; margin-bottom:12px; position:relative; overflow:hidden; }',
      '  .ws-skeleton-card::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent); animation: wsShimmer 1.4s infinite; }',
      /* [P3-1] 주소 폰트 14px */
      '  .ws-listing-addr { font-size: 14px !important; line-height: 1.45 !important; color:#52525B; }',
      /* [P3-2] 필터바 static */
      '  .ws-filters { position: static !important; }',
      /* [P3-4] sort select 커스텀 스타일 */
      '  select.ws-sort-select, .ws-sort-wrap select { min-height:40px; padding:8px 30px 8px 12px; border-radius:8px; border:1px solid #D4D4D8; font-size:14px; font-weight:600; background:#fff url("data:image/svg+xml;utf8,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"12\\" height=\\"12\\" viewBox=\\"0 0 12 12\\" fill=\\"none\\"><path d=\\"M3 5l3 3 3-3\\" stroke=\\"%2371717A\\" stroke-width=\\"1.5\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"/></svg>") no-repeat right 10px center; -webkit-appearance:none; appearance:none; }',
      /* [P3-5] 브랜드 wordmark */
      '  .ws-header-logo, .ws-brand, [class*="logo"] { font-weight:900 !important; letter-spacing:-0.03em; }',
      '}',
      /* shimmer keyframe (전역) */
      '@keyframes wsShimmer { 0%{transform:translateX(-100%);} 100%{transform:translateX(100%);} }',
      /* [P1-2] 빈 상태 UI */
      '.ws-empty-state { padding:56px 24px; text-align:center; background:#fff; border-radius:12px; border:1px solid #E4E4E7; margin:16px 0; }',
      '.ws-empty-icon { margin-bottom:16px; }',
      '.ws-empty-title { font-size:17px; font-weight:800; color:#18181B; margin:0 0 8px; }',
      '.ws-empty-desc { font-size:14px; color:#71717A; line-height:1.6; margin:0 0 20px; }',
      '.ws-empty-actions { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }',
      '.ws-empty-btn { min-height:44px; padding:0 20px; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; border:none; }',
      '.ws-empty-btn-primary { background:#18181B; color:#fff; }',
      '.ws-empty-btn-primary:active { background:#3F3F46; }',
      '.ws-empty-btn-ghost { background:#fff; color:#18181B; border:1px solid #D4D4D8; }',
      '.ws-empty-btn-ghost:active { background:#F4F4F5; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------------
  // 초기화 및 관찰자
  // ------------------------------------------------------------------
  injectCSS();
  bindScrollRestore();
  bindFavoriteHaptic();
  bindModalScrollLock();

  // 최초 실행
  [0, 250, 800, 1800, 3500].forEach(function (ms) {
    setTimeout(function () {
      try {
        replacePlaceholders();
        applyImageFade();
        checkEmptyState();
        collapseBottomBar();
        bindPullToRefresh();
      } catch (e) {}
    }, ms);
  });

  // 렌더 재감지
  try {
    var observer = new MutationObserver(function (mutations) {
      var hit = false;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].type === 'childList' && mutations[i].addedNodes.length) { hit = true; break; }
      }
      if (!hit) return;
      try {
        replacePlaceholders();
        applyImageFade();
        checkEmptyState();
        collapseBottomBar();
      } catch (e) {}
    });
    observer.observe(document.body, { childList: true, subtree: true });
    STATE.moMain = observer;
  } catch (e) {}

  // 안전망 인터벌 (2.5s)
  STATE.safetyInterval = setInterval(function () {
    try {
      replacePlaceholders();
      applyImageFade();
      checkEmptyState();
      collapseBottomBar();
    } catch (e) {}
  }, 2500);

  window.addEventListener('resize', function () {
    setTimeout(function () {
      try { collapseBottomBar(); bindPullToRefresh(); } catch (e) {}
    }, 200);
  }, { passive: true });

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  window.__WS_V290_POLISH__ = {
    installedAt: STATE.installedAt,
    state: STATE,
    showToast: showToast,
    replacePlaceholders: replacePlaceholders,
    applyImageFade: applyImageFade,
    checkEmptyState: checkEmptyState,
    collapseBottomBar: collapseBottomBar,
    rollback: function () {
      try { STATE.moMain && STATE.moMain.disconnect(); } catch (e) {}
      try { STATE.moModalLock && STATE.moModalLock.disconnect(); } catch (e) {}
      try { STATE.safetyInterval && clearInterval(STATE.safetyInterval); } catch (e) {}
      try { STATE.ptrCleanup && STATE.ptrCleanup(); } catch (e) {}
      try { hideOfflineBanner(); } catch (e) {}
      try {
        var s = document.getElementById('ws-v290-css');
        if (s) s.remove();
      } catch (e) {}
      delete window.__WS_V290_POLISH__;
    }
  };
})();
