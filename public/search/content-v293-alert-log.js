/**
 * Wishes /search — v2.9.3 알림 로그 시스템 (Phase 1+2)
 *
 * 목적:
 *   - 휘발성 토스트/팝업을 타임라인으로 수집하여 "왜 떴는지" 사후 확인
 *   - localStorage 기반 최근 200건 저장
 *   - 🔔 벨 버튼 + 슬라이드 드로어로 전체 히스토리 조회
 *
 * 수집 대상:
 *   - 자동 중복 제거 (window.WS._autoDedup)
 *   - 중복 의심 팝업 (window.WS._showDupSuspectAlert)
 *   - 의심 팝업 내 사용자 액션 (유지/삭제/무시/닫기)
 *   - 기존 모든 showToast 호출 (연락처/폴더/저장/경고/에러 등)
 *   - 세션 만료/경고 (외부 IIFE 의 auth 토스트는 MutationObserver 로 감지)
 *
 * API (콘솔에서 직접 사용 가능):
 *   window.WS.alertLog.all()          // 최근 로그 내림차순
 *   window.WS.alertLog.clear()        // 로그 초기화
 *   window.WS.alertLog.push({...})    // 수동 기록
 *   window.WS.openAlertLog()          // 드로어 열기
 *
 * 저장 키:
 *   ws_alert_log_v1        — 로그 배열
 *   ws_alert_log_unread_v1 — 미확인 카운트 (벨 배지)
 */
(function () {
  'use strict';

  // /search 전용
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var MAX_LOG = 200;
  var LS_KEY = 'ws_alert_log_v1';
  var LS_UNREAD = 'ws_alert_log_unread_v1';

  window.WS = window.WS || {};

  // ────────────────────────────────────────────────
  // 저장소
  // ────────────────────────────────────────────────
  function _load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function _save(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(-MAX_LOG))); }
    catch (e) { /* quota — 조용히 실패 */ }
  }
  function _unread() {
    try { return parseInt(localStorage.getItem(LS_UNREAD) || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function _setUnread(n) {
    try { localStorage.setItem(LS_UNREAD, String(Math.max(0, n))); } catch (e) {}
    _updateBadge();
  }

  var AL = {
    push: function (entry) {
      var arr = _load();
      var e = {
        id: 'al_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        ts: Date.now(),
        type: (entry && entry.type) || 'info',
        title: (entry && entry.title) || '',
        reason: (entry && entry.reason) || '',
        listingIds: (entry && entry.listingIds) || [],
        action: (entry && entry.action) || null,
        meta: (entry && entry.meta) || null,
      };
      arr.push(e);
      _save(arr);
      _setUnread(_unread() + 1);
      // 드로어가 열려있으면 즉시 리렌더
      var drawer = document.getElementById('ws-alert-drawer');
      if (drawer && drawer.classList.contains('open')) _renderList();
      return e;
    },
    all: function () { return _load().slice().reverse(); },
    clear: function () { _save([]); _setUnread(0); },
    markAllRead: function () { _setUnread(0); },
    unreadCount: _unread,
  };
  window.WS.alertLog = AL;

  // ────────────────────────────────────────────────
  // 기존 showToast 래핑 → 모든 토스트 자동 로깅
  // ────────────────────────────────────────────────
  function _wrapShowToast() {
    if (!window.WS || !window.WS.showToast || window.WS.showToast._alertWrapped) return false;
    var orig = window.WS.showToast;
    var wrapped = function (message, type) {
      try {
        var t = type || 'success';
        AL.push({
          type: 'toast_' + t,
          title: t === 'warning' ? '경고 토스트' : t === 'error' ? '오류 토스트' : '알림 토스트',
          reason: String(message || ''),
        });
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    wrapped._alertWrapped = true;
    window.WS.showToast = wrapped;
    return true;
  }

  // ────────────────────────────────────────────────
  // _autoDedup 래핑 → 상세 제거 내역 로깅
  // ────────────────────────────────────────────────
  function _wrapAutoDedup() {
    if (!window.WS || !window.WS._autoDedup || window.WS._autoDedup._alertWrapped) return false;
    var orig = window.WS._autoDedup;

    // 한 매물에서 표시용 부가 정보를 뽑아내는 헬퍼
    function _snapshot(l) {
      if (!l) return null;
      return {
        id: l.id,
        title: l.title || '',
        imageCount: ((l.images || l.listing_images || []) || []).length,
        videoCount: ((l.videos || l.listing_videos || []) || []).length,
        area: l.area || l.area_m2 || null,
        areaPy: l.area_py || null,
        building: l.building_name || '',
        floor: l.floor_cur != null ? l.floor_cur : (l.floor || ''),
        floorTotal: l.floor_total || '',
        created_at: l.created_at || '',
        updated_at: l.updated_at || '',
        source: l.source_site || '',  // 크롤링 출처
        status: l.status || '',
      };
    }

    var wrapped = function (items, silent) {
      var before = (items || []).length;
      // 호출 전 입력을 ID 로 인덱싱 (원본 풀 레코드 보존)
      var byId = {};
      (items || []).forEach(function (it) {
        if (it && it.id != null) byId[String(it.id)] = it;
      });

      var result = orig.apply(this, arguments);
      var after = (result || []).length;
      if (before > after) {
        try {
          var log = window.WS._lastDedupLog || {};
          var removedRaw = log.removed || [];
          // 각 제거 매물에 원본 풀 정보와 보존 매물 정보를 덧붙임
          var enriched = removedRaw.map(function (r) {
            var src = byId[String(r.id)] || null;
            var kept = byId[String(r.keptId)] || null;
            return {
              id: r.id,
              keptId: r.keptId,
              reason: r.reason,
              // 일치한 4요소 (dedup 판정 근거)
              match: {
                address: r.address,
                detail: r.detail,
                deal: r.deal,
                deposit: r.deposit,
                monthly: r.monthly,
                price: r.price,
              },
              // 제거된 매물 상세
              removedSnapshot: _snapshot(src),
              // 보존된 대표 매물 상세
              keptSnapshot: _snapshot(kept),
            };
          });
          AL.push({
            type: 'auto_dedup',
            title: '자동 중복 제거',
            reason:
              '소재지·동호수·거래유형·가격 완전 일치 매물 ' +
              (before - after) +
              '건을 숨김 처리 (' + before + '→' + after + ')',
            listingIds: removedRaw.map(function (r) { return r.id; }),
            meta: {
              totalBefore: before,
              totalAfter: after,
              removedCount: removedRaw.length,
              removed: enriched,
            },
          });
        } catch (e) {}
      }
      return result;
    };
    wrapped._alertWrapped = true;
    window.WS._autoDedup = wrapped;
    return true;
  }

  // ────────────────────────────────────────────────
  // _showDupSuspectAlert 래핑 → 그룹 감지 + 내부 액션 로깅
  // ────────────────────────────────────────────────
  function _wrapSuspectAlert() {
    if (!window.WS || !window.WS._showDupSuspectAlert || window.WS._showDupSuspectAlert._alertWrapped) return false;
    var orig = window.WS._showDupSuspectAlert;
    var wrapped = function (suspects) {
      try {
        var totalItems = (suspects || []).reduce(function (s, g) { return s + g.items.length; }, 0);
        AL.push({
          type: 'dup_suspect',
          title: '중복 의심 매물 감지',
          reason:
            (suspects && suspects[0] && suspects[0].reason) ||
            '동일조건 · 동호수 상이',
          listingIds: (suspects || []).reduce(function (acc, g) {
            g.items.forEach(function (l) { acc.push(l.id); });
            return acc;
          }, []),
          meta: {
            groupCount: (suspects || []).length,
            totalItems: totalItems,
            groups: (suspects || []).map(function (g) {
              return {
                address: g.address,
                deal: g.deal,
                deposit: g.deposit,
                monthly: g.monthly,
                price: g.price,
                reason: g.reason,
                ids: g.items.map(function (l) { return l.id; }),
              };
            }),
          },
        });
      } catch (e) {}

      var result = orig.apply(this, arguments);

      // 팝업 DOM 이 생성된 뒤 내부 버튼 액션을 캡처
      setTimeout(function () {
        var pop = document.getElementById('ws-dup-suspect-alert');
        if (!pop || pop._alertBound) return;
        pop._alertBound = true;
        pop.addEventListener('click', function (ev) {
          var btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
          if (!btn) return;
          try {
            if (btn.classList.contains('ws-suspect-keep')) {
              AL.push({
                type: 'user_action',
                title: '의심매물 유지 선택',
                reason: '매물 #' + btn.dataset.id + ' 을(를) 리스트에 유지',
                listingIds: [parseInt(btn.dataset.id, 10) || btn.dataset.id],
                action: 'keep',
              });
            } else if (btn.classList.contains('ws-suspect-del')) {
              AL.push({
                type: 'user_action',
                title: '의심매물 검색목록에서 제거',
                reason: '매물 #' + btn.dataset.id + ' 슈퍼어드민이 검색목록에서 제거 (DB 는 유지)',
                listingIds: [parseInt(btn.dataset.id, 10) || btn.dataset.id],
                action: 'remove_from_list',
              });
            } else if (btn.classList.contains('ws-suspect-dismiss')) {
              AL.push({
                type: 'user_action',
                title: '의심매물 팝업 전체 무시',
                reason: '사용자가 "모두 무시" 클릭',
                action: 'dismiss',
              });
            } else if (btn.classList.contains('ws-suspect-close')) {
              AL.push({
                type: 'user_action',
                title: '의심매물 팝업 닫기',
                reason: '사용자가 X 버튼으로 팝업 닫음',
                action: 'close',
              });
            }
          } catch (e) {}
        }, true);
      }, 60);

      return result;
    };
    wrapped._alertWrapped = true;
    window.WS._showDupSuspectAlert = wrapped;
    return true;
  }

  // ────────────────────────────────────────────────
  // 세션/인증 토스트 감지 (외부 IIFE 안에 있어 직접 래핑 불가)
  // 스타일 시그니처: position:fixed;top:20px;right:20px; ...
  // ────────────────────────────────────────────────
  function _installAuthObserver() {
    try {
      var obs = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (!m.addedNodes) return;
          m.addedNodes.forEach(function (node) {
            if (!node || node.nodeType !== 1) return;
            if (node.id === 'ws-toast') return; // showToast 는 우리가 이미 래핑했음
            if (node.id === DRAWER_ID || node.id === BTN_ID) return;
            var style = node.getAttribute && node.getAttribute('style') || '';
            // auth 토스트 시그니처 체크
            if (style.indexOf('top:20px') === -1 || style.indexOf('right:20px') === -1) return;
            var txt = (node.textContent || '').trim();
            if (/세션 만료/.test(txt) && /로그인 페이지/.test(txt)) {
              AL.push({ type: 'session', title: '세션 만료', reason: txt });
            } else if (/세션이 \d+분 후 만료/.test(txt)) {
              AL.push({ type: 'session', title: '세션 만료 경고', reason: txt });
            }
          });
        });
      });
      obs.observe(document.body || document.documentElement, { childList: true, subtree: false });
    } catch (e) {}
  }

  // ────────────────────────────────────────────────
  // 훅 인스톨 재시도 루프 (content.js 로드 전이면 대기)
  // ────────────────────────────────────────────────
  (function _installHooks() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var a = _wrapShowToast();
      var b = _wrapAutoDedup();
      var c = _wrapSuspectAlert();
      if (tries > 80 || (a && b && c)) clearInterval(iv);
    }, 120);
  })();

  _installAuthObserver();

  // ══════════════════════════════════════════════════════════════════
  // 🔔 벨 버튼 + 드로어 UI
  // ══════════════════════════════════════════════════════════════════
  var DRAWER_ID = 'ws-alert-drawer';
  var BTN_ID = 'ws-alert-bell';
  var currentFilter = 'all';

  function _typeLabel(t) {
    if (t === 'auto_dedup') return '🧹 자동제거';
    if (t === 'dup_suspect') return '⚠️ 의심';
    if (t === 'user_action') return '🖱 액션';
    if (t === 'session') return '🔒 세션';
    if (t && t.indexOf('toast_warning') === 0) return '⚠️ 경고';
    if (t && t.indexOf('toast_error') === 0) return '❌ 오류';
    if (t && t.indexOf('toast_') === 0) return '💬 토스트';
    return '📣 기타';
  }
  function _typeColor(t) {
    if (t === 'auto_dedup') return '#2D5A27';
    if (t === 'dup_suspect') return '#e53e3e';
    if (t === 'user_action') return '#8b5cf6';
    if (t === 'session') return '#f59e0b';
    if (t && t.indexOf('toast_warning') === 0) return '#f97316';
    if (t && t.indexOf('toast_error') === 0) return '#dc2626';
    if (t && t.indexOf('toast_') === 0) return '#0ea5e9';
    return '#64748b';
  }
  function _timeAgo(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return '방금 전';
    if (d < 3600000) return Math.floor(d / 60000) + '분 전';
    if (d < 86400000) return Math.floor(d / 3600000) + '시간 전';
    return Math.floor(d / 86400000) + '일 전';
  }
  function _fmtTs(ts) {
    try {
      var d = new Date(ts);
      return d.toLocaleString('ko-KR', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch (e) { return ''; }
  }
  function _escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _ensureStyles() {
    if (document.getElementById('ws-alert-log-styles')) return;
    var s = document.createElement('style');
    s.id = 'ws-alert-log-styles';
    s.textContent = [
      '#ws-alert-bell { position: fixed; top: 70px; right: 16px; width: 44px; height: 44px; border-radius: 50%; background: #fff; border: 1px solid #e5eee5; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 99999; font-size: 20px; transition: transform 0.15s ease, box-shadow 0.15s ease; padding: 0; }',
      '#ws-alert-bell:hover { transform: scale(1.08); box-shadow: 0 4px 16px rgba(0,0,0,0.18); }',
      '#ws-alert-bell .badge { position: absolute; top: -3px; right: -3px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e53e3e; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; line-height: 1; box-shadow: 0 1px 4px rgba(229,62,62,0.5); }',
      '#ws-alert-drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.28); z-index: 100019; opacity: 0; transition: opacity 0.25s ease; pointer-events: none; }',
      '#ws-alert-drawer-backdrop.open { opacity: 1; pointer-events: auto; }',
      '#ws-alert-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 420px; max-width: 100vw; background: #fff; box-shadow: -8px 0 32px rgba(0,0,0,0.18); z-index: 100020; display: flex; flex-direction: column; transform: translateX(105%); transition: transform 0.28s cubic-bezier(0.4,0,0.2,1); }',
      '#ws-alert-drawer.open { transform: translateX(0); }',
      '#ws-alert-drawer .hdr { padding: 16px 18px; background: linear-gradient(135deg, #2D5A27, #1f401a); color: #fff; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }',
      '#ws-alert-drawer .hdr h3 { margin: 0; font-size: 16px; font-weight: 700; }',
      '#ws-alert-drawer .hdr .sub { font-size: 11px; opacity: 0.85; margin-top: 2px; }',
      '#ws-alert-drawer .hdr .close { background: none; border: none; color: #fff; font-size: 24px; cursor: pointer; padding: 0 4px; line-height: 1; }',
      '#ws-alert-drawer .tabs { display: flex; gap: 4px; padding: 8px 12px; background: #f5faf5; border-bottom: 1px solid #e5eee5; overflow-x: auto; flex-shrink: 0; }',
      '#ws-alert-drawer .tabs button { padding: 5px 10px; border: 1px solid #d5e5d5; background: #fff; border-radius: 14px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; color: #2D5A27; }',
      '#ws-alert-drawer .tabs button.active { background: #2D5A27; color: #fff; border-color: #2D5A27; }',
      '#ws-alert-drawer .list { flex: 1; overflow-y: auto; padding: 8px 12px; background: #fafafa; }',
      '#ws-alert-drawer .empty { padding: 48px 20px; text-align: center; color: #999; font-size: 13px; }',
      '#ws-alert-drawer .entry { border: 1px solid #eaeaea; border-left-width: 3px; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; background: #fff; transition: background 0.15s ease; }',
      '#ws-alert-drawer .entry:hover { background: #f9fbf9; }',
      '#ws-alert-drawer .entry .row1 { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; gap: 8px; }',
      '#ws-alert-drawer .entry .t-badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; color: #fff; white-space: nowrap; }',
      '#ws-alert-drawer .entry .ts { font-size: 10px; color: #999; white-space: nowrap; }',
      '#ws-alert-drawer .entry .title { font-size: 13px; font-weight: 700; color: #222; margin-bottom: 3px; }',
      '#ws-alert-drawer .entry .reason { font-size: 12px; color: #555; line-height: 1.5; word-break: keep-all; }',
      '#ws-alert-drawer .entry .ids { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }',
      '#ws-alert-drawer .entry .ids .chip { display: inline-block; padding: 2px 8px; border-radius: 10px; background: #f0f5f0; font-size: 10px; color: #2D5A27; font-weight: 600; cursor: pointer; transition: all 0.12s ease; }',
      '#ws-alert-drawer .entry .ids .chip:hover { background: #2D5A27; color: #fff; }',
      '#ws-alert-drawer .entry .ids .more { color: #999; font-size: 10px; padding: 2px 4px; align-self: center; }',
      '#ws-alert-drawer .entry .dedup-groups { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }',
      '#ws-alert-drawer .entry .dedup-group { padding: 8px 10px; background: #f7fbf7; border-radius: 6px; border: 1px dashed #d5e5d5; }',
      '#ws-alert-drawer .entry .dedup-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }',
      '#ws-alert-drawer .entry .chip-kept { background: #2D5A27 !important; color: #fff !important; font-weight: 700 !important; padding: 3px 9px !important; box-shadow: 0 1px 3px rgba(45,90,39,0.25); }',
      '#ws-alert-drawer .entry .chip-kept:hover { background: #1f401a !important; }',
      '#ws-alert-drawer .entry .chip-hidden { background: #f5f5f5 !important; color: #999 !important; text-decoration: line-through; font-weight: 500 !important; }',
      '#ws-alert-drawer .entry .chip-hidden:hover { background: #666 !important; color: #fff !important; text-decoration: none; }',
      '#ws-alert-drawer .entry .arrow { color: #bbb; font-size: 12px; font-weight: 700; margin: 0 2px; }',
      '#ws-alert-drawer .entry .hidden-label { font-size: 10px; color: #999; font-weight: 600; margin-right: 2px; }',
      '#ws-alert-drawer .entry .group-meta { font-size: 10px; color: #888; margin-top: 4px; width: 100%; flex-basis: 100%; line-height: 1.4; }',
      '#ws-alert-drawer .entry .dedup-toggle { margin-left: auto; padding: 3px 8px; background: #fff; border: 1px solid #d5e5d5; border-radius: 12px; font-size: 10px; font-weight: 600; color: #2D5A27; cursor: pointer; }',
      '#ws-alert-drawer .entry .dedup-toggle:hover { background: #2D5A27; color: #fff; border-color: #2D5A27; }',
      '#ws-alert-drawer .entry .dedup-detail { margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #e5eee5; border-radius: 6px; }',
      '#ws-alert-drawer .entry .dd-sec { margin-bottom: 8px; }',
      '#ws-alert-drawer .entry .dd-sec:last-child { margin-bottom: 0; }',
      '#ws-alert-drawer .entry .dd-title { font-size: 11px; font-weight: 700; color: #2D5A27; margin-bottom: 4px; }',
      '#ws-alert-drawer .entry .dd-hint { font-weight: 400; color: #999; font-size: 10px; }',
      '#ws-alert-drawer .entry .match-tbl { width: 100%; border-collapse: collapse; font-size: 11px; }',
      '#ws-alert-drawer .entry .match-tbl td { padding: 4px 6px; border-bottom: 1px solid #f0f5f0; vertical-align: top; }',
      '#ws-alert-drawer .entry .match-tbl td.k { color: #666; font-weight: 600; width: 65px; white-space: nowrap; }',
      '#ws-alert-drawer .entry .match-tbl td.v { color: #222; word-break: keep-all; }',
      '#ws-alert-drawer .entry .match-tbl em { color: #e53e3e; font-style: normal; font-weight: 600; }',
      '#ws-alert-drawer .entry .cmp-tbl { width: 100%; border-collapse: collapse; font-size: 10px; }',
      '#ws-alert-drawer .entry .cmp-tbl thead th { background: #f5faf5; padding: 4px 5px; font-size: 10px; color: #2D5A27; font-weight: 700; border-bottom: 2px solid #d5e5d5; text-align: left; white-space: nowrap; }',
      '#ws-alert-drawer .entry .cmp-tbl td { padding: 4px 5px; border-bottom: 1px solid #f0f5f0; font-size: 10px; vertical-align: top; }',
      '#ws-alert-drawer .entry .cmp-tbl .cmp-kept { background: #f7fbf7; }',
      '#ws-alert-drawer .entry .cmp-tbl .cmp-hidden { background: #fafafa; color: #666; }',
      '#ws-alert-drawer .entry .cmp-tbl .cmp-badge { font-weight: 700; white-space: nowrap; }',
      '#ws-alert-drawer .entry .cmp-tbl .cmp-kept .cmp-badge { color: #2D5A27; }',
      '#ws-alert-drawer .entry .cmp-tbl .cmp-hidden .cmp-badge { color: #888; }',
      '#ws-alert-drawer .entry .cmp-tbl .cmp-title { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '#ws-alert-drawer .entry .cmp-tbl .cmp-row { cursor: pointer; transition: background 0.12s ease; }',
      '#ws-alert-drawer .entry .cmp-tbl .cmp-row:hover { background: #fff8dc !important; }',
      '#ws-alert-drawer .entry .dd-warn { font-size: 10px; color: #666; background: #fffaf0; padding: 6px 8px; border-radius: 4px; border-left: 3px solid #f59e0b; line-height: 1.5; }',
      '#ws-alert-drawer .entry .dd-warn code { background: #fff; padding: 1px 4px; border-radius: 3px; font-size: 10px; color: #c53030; }',
      '#ws-alert-drawer .ftr { padding: 10px 14px; background: #fff; border-top: 1px solid #e5eee5; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }',
      '#ws-alert-drawer .ftr .count { font-size: 11px; color: #666; }',
      '#ws-alert-drawer .ftr .clr { padding: 6px 12px; background: #fff; border: 1px solid #d5e5d5; border-radius: 6px; font-size: 11px; cursor: pointer; color: #e53e3e; font-weight: 600; }',
      '#ws-alert-drawer .ftr .clr:hover { background: #fef2f2; border-color: #e53e3e; }',
      '@media (max-width: 640px) { #ws-alert-drawer { width: 100vw; } #ws-alert-bell { top: 56px; right: 12px; width: 40px; height: 40px; font-size: 18px; } }',
    ].join('\n');
    document.head.appendChild(s);
  }

  function _mountBell() {
    if (document.getElementById(BTN_ID)) return;
    _ensureStyles();
    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.title = '알림 로그';
    btn.setAttribute('aria-label', '알림 로그 열기');
    btn.innerHTML = '🔔<span class="badge" style="display:none;">0</span>';
    btn.addEventListener('click', function () {
      var drawer = document.getElementById(DRAWER_ID);
      if (drawer && drawer.classList.contains('open')) _closeDrawer();
      else _openDrawer();
    });
    document.body.appendChild(btn);
    _updateBadge();
  }

  function _updateBadge() {
    var btn = document.getElementById(BTN_ID);
    if (!btn) return;
    var badge = btn.querySelector('.badge');
    if (!badge) return;
    var n = _unread();
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function _renderList() {
    var list = document.querySelector('#ws-alert-drawer .list');
    var countEl = document.querySelector('#ws-alert-drawer .ftr .count');
    if (!list) return;
    var all = AL.all();
    var filtered = currentFilter === 'all'
      ? all
      : all.filter(function (e) {
          if (currentFilter === 'toast') return e.type && e.type.indexOf('toast_') === 0;
          return e.type === currentFilter;
        });
    if (countEl) countEl.textContent = '총 ' + all.length + '건 · 표시 ' + filtered.length + '건';
    if (filtered.length === 0) {
      list.innerHTML =
        '<div class="empty">📭 표시할 알림이 없습니다.<br><span style="font-size:11px;color:#bbb;">페이지 로딩 시 자동 수집됩니다.</span></div>';
      return;
    }
    var html = filtered.map(function (e) {
      var color = _typeColor(e.type);
      var idsHtml = '';

      // ── auto_dedup: 그룹별 🏆 대표 → 🫥 숨김 + 매칭 상세 ──
      if (e.type === 'auto_dedup' && e.meta && Array.isArray(e.meta.removed) && e.meta.removed.length > 0) {
        var groupMap = {};
        e.meta.removed.forEach(function (r) {
          var kId = String(r.keptId == null ? '?' : r.keptId);
          if (!groupMap[kId]) groupMap[kId] = { kept: r.keptId, removed: [], sample: r, keptSnap: r.keptSnapshot || null };
          groupMap[kId].removed.push(r);
        });
        var groupKeys = Object.keys(groupMap);
        var groupsShown = groupKeys.slice(0, 5);
        var groupsMore = groupKeys.length - groupsShown.length;

        var groupHtml = groupsShown.map(function (k) {
          var g = groupMap[k];
          var keptChip =
            '<span class="chip chip-kept" data-listing-id="' + _escapeHtml(g.kept) +
            '" title="리스트에 남은 대표 매물 (클릭 → 상세모달)">🏆 #' + _escapeHtml(g.kept) + '</span>';
          var hiddenChips = g.removed.map(function (r) {
            return '<span class="chip chip-hidden" data-listing-id="' + _escapeHtml(r.id) +
              '" title="숨김 처리 (DB 에는 보존)">#' + _escapeHtml(r.id) + '</span>';
          }).join('');

          // dedup 판정 근거 (4요소)
          var m = (g.sample && g.sample.match) || g.sample || {};
          var priceStr = m.deal === '매매'
            ? (m.price != null ? (m.price + '만') : '')
            : ((m.deposit != null ? m.deposit : '-') + ' / ' + (m.monthly != null ? m.monthly : '-'));

          // 매칭 기준 테이블 (펼침)
          var matchDetail =
            '<table class="match-tbl">' +
            '<tr><td class="k">소재지</td><td class="v">' + (m.address ? _escapeHtml(m.address) : '<em>미입력</em>') + '</td></tr>' +
            '<tr><td class="k">동·호수</td><td class="v">' + (m.detail ? _escapeHtml(m.detail) : '<em>미입력 (두 매물 모두)</em>') + '</td></tr>' +
            '<tr><td class="k">거래유형</td><td class="v">' + (m.deal ? _escapeHtml(m.deal) : '<em>미입력</em>') + '</td></tr>' +
            '<tr><td class="k">가격</td><td class="v">' + _escapeHtml(priceStr) + '</td></tr>' +
            '</table>';

          // 비교 테이블 — 매칭 외 필드로 실수 검출
          function _row(snap, isKept) {
            if (!snap) return '<tr class="cmp-row"><td colspan="6"><em>정보 없음</em></td></tr>';
            var badge = isKept ? '🏆' : '🫥';
            var cls = isKept ? 'cmp-kept' : 'cmp-hidden';
            var area = snap.areaPy ? (snap.areaPy + '평') : (snap.area ? (snap.area + 'm²') : '-');
            var src = snap.source ? '<span title="크롤링 출처">' + _escapeHtml(snap.source) + '</span>' : '<span title="수동 등록">수동</span>';
            var created = snap.created_at ? new Date(snap.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }) : '-';
            var media = (snap.imageCount || 0) + '📷' + (snap.videoCount ? (' ' + snap.videoCount + '🎬') : '');
            return '<tr class="cmp-row ' + cls + '" data-listing-id="' + _escapeHtml(snap.id) + '">' +
              '<td class="cmp-badge">' + badge + ' #' + _escapeHtml(snap.id) + '</td>' +
              '<td class="cmp-title">' + _escapeHtml(snap.title || '(제목없음)') + '</td>' +
              '<td>' + _escapeHtml(media) + '</td>' +
              '<td>' + _escapeHtml(area) + '</td>' +
              '<td>' + _escapeHtml(created) + '</td>' +
              '<td>' + src + '</td>' +
              '</tr>';
          }

          var cmpRows = '';
          cmpRows += _row(g.keptSnap, true);
          g.removed.forEach(function (r) {
            cmpRows += _row(r.removedSnapshot, false);
          });
          var cmpTable =
            '<table class="cmp-tbl">' +
            '<thead><tr><th>매물</th><th>제목</th><th>미디어</th><th>면적</th><th>등록</th><th>출처</th></tr></thead>' +
            '<tbody>' + cmpRows + '</tbody></table>';

          var detailId = 'dd-detail-' + Math.random().toString(36).slice(2, 8);
          return '<div class="dedup-group">' +
            '<div class="dedup-line">' +
              keptChip +
              '<span class="arrow">→</span>' +
              '<span class="hidden-label">🫥 숨김:</span>' +
              hiddenChips +
              '<button class="dedup-toggle" data-target="' + detailId + '" title="매칭 상세 보기">🔍 상세</button>' +
            '</div>' +
            '<div class="group-meta">📍 ' + _escapeHtml(m.address || '') +
              (m.detail ? ' · ' + _escapeHtml(m.detail) : '') +
              (m.deal ? ' · ' + _escapeHtml(m.deal) : '') +
              ' · ' + _escapeHtml(priceStr) +
            '</div>' +
            '<div class="dedup-detail" id="' + detailId + '" style="display:none;">' +
              '<div class="dd-sec">' +
                '<div class="dd-title">📌 매칭 근거 (이 4가지가 완전 일치)</div>' +
                matchDetail +
              '</div>' +
              '<div class="dd-sec">' +
                '<div class="dd-title">📋 매물별 부가정보 비교 <span class="dd-hint">— 제목/사진/면적이 크게 다르면 실수일 가능성</span></div>' +
                cmpTable +
              '</div>' +
              '<div class="dd-sec dd-warn">' +
                '⚠️ 혹시 잘못 합쳐진 것 같으면 <strong>대표 매물 상세모달</strong>에서 확인하시고, ' +
                '숨김 매물을 되살리고 싶으면 <code>WS.allListings.push(원본)</code> 또는 새로고침으로 원본 유지하세요.' +
              '</div>' +
            '</div>' +
            '</div>';
        }).join('');
        if (groupsMore > 0) {
          groupHtml += '<div style="font-size:11px;color:#888;padding:4px 8px;">외 ' + groupsMore + '개 그룹 (표시 제한)</div>';
        }
        idsHtml = '<div class="dedup-groups">' + groupHtml + '</div>';
      } else {
        // ── 기본 레이아웃 (숨김 처리 없이 모든 ID 나열) ──
        var ids = (e.listingIds || []).slice(0, 8);
        var moreN = (e.listingIds || []).length - ids.length;
        idsHtml = ids.length > 0
          ? '<div class="ids">' +
            ids.map(function (id) {
              return '<span class="chip" data-listing-id="' + _escapeHtml(id) + '">#' + _escapeHtml(id) + '</span>';
            }).join('') +
            (moreN > 0 ? '<span class="more">외 ' + moreN + '건</span>' : '') +
            '</div>'
          : '';
      }

      return (
        '<div class="entry" style="border-left-color:' + color + ';">' +
        '<div class="row1">' +
        '<span class="t-badge" style="background:' + color + '">' + _typeLabel(e.type) + '</span>' +
        '<span class="ts" title="' + _fmtTs(e.ts) + '">' + _timeAgo(e.ts) + '</span>' +
        '</div>' +
        '<div class="title">' + _escapeHtml(e.title) + '</div>' +
        '<div class="reason">' + _escapeHtml(e.reason) + '</div>' +
        idsHtml +
        '<div style="font-size:10px;color:#bbb;margin-top:6px;">' + _fmtTs(e.ts) + '</div>' +
        '</div>'
      );
    }).join('');
    list.innerHTML = html;

    // 매물 칩 클릭 → 상세모달
    list.querySelectorAll('.chip[data-listing-id], .cmp-row[data-listing-id]').forEach(function (ch) {
      ch.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var id = this.dataset.listingId;
        try {
          if (window.WS && typeof window.WS.showDetail === 'function') {
            window.WS.showDetail(id);
            return;
          }
          var target = (window.WS && window.WS.allListings) || [];
          var found = target.find ? target.find(function (l) { return String(l.id) === String(id); }) : null;
          if (found && window.WS && typeof window.WS.showDetail === 'function') window.WS.showDetail(found);
        } catch (err) {
          try { console.warn('[ws-alert-log] detail open failed', err); } catch (_) {}
        }
      });
    });

    // 🔍 상세 토글 버튼
    list.querySelectorAll('.dedup-toggle').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var targetId = this.dataset.target;
        var panel = document.getElementById(targetId);
        if (!panel) return;
        var open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'block';
        this.textContent = open ? '🔍 상세' : '▲ 접기';
      });
    });
  }

  function _mountDrawer() {
    if (document.getElementById(DRAWER_ID)) return;
    _ensureStyles();

    var backdrop = document.createElement('div');
    backdrop.id = 'ws-alert-drawer-backdrop';
    backdrop.addEventListener('click', _closeDrawer);
    document.body.appendChild(backdrop);

    var drawer = document.createElement('div');
    drawer.id = DRAWER_ID;
    drawer.innerHTML =
      '<div class="hdr">' +
      '<div><h3>🔔 알림 로그</h3><div class="sub">최근 ' + MAX_LOG + '건 · 브라우저에만 저장</div></div>' +
      '<button class="close" aria-label="닫기">&times;</button>' +
      '</div>' +
      '<div class="tabs">' +
      '<button data-f="all" class="active">전체</button>' +
      '<button data-f="auto_dedup">🧹 자동제거</button>' +
      '<button data-f="dup_suspect">⚠️ 의심</button>' +
      '<button data-f="user_action">🖱 액션</button>' +
      '<button data-f="session">🔒 세션</button>' +
      '<button data-f="toast">💬 토스트</button>' +
      '</div>' +
      '<div class="list"></div>' +
      '<div class="ftr">' +
      '<span class="count"></span>' +
      '<button class="clr">🗑 로그 초기화</button>' +
      '</div>';
    document.body.appendChild(drawer);

    drawer.querySelector('.close').addEventListener('click', _closeDrawer);
    drawer.querySelector('.clr').addEventListener('click', function () {
      if (confirm('알림 로그를 모두 삭제하시겠습니까?\n(되돌릴 수 없습니다)')) {
        AL.clear();
        _renderList();
        _updateBadge();
      }
    });
    drawer.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        currentFilter = this.dataset.f;
        drawer.querySelectorAll('.tabs button').forEach(function (x) { x.classList.remove('active'); });
        this.classList.add('active');
        _renderList();
      });
    });

    // ESC 키로 닫기
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        var d = document.getElementById(DRAWER_ID);
        if (d && d.classList.contains('open')) _closeDrawer();
      }
    });
  }

  function _openDrawer() {
    _mountDrawer();
    var drawer = document.getElementById(DRAWER_ID);
    var backdrop = document.getElementById('ws-alert-drawer-backdrop');
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    _renderList();
    AL.markAllRead();
    _updateBadge();
  }

  function _closeDrawer() {
    var drawer = document.getElementById(DRAWER_ID);
    var backdrop = document.getElementById('ws-alert-drawer-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  window.WS.openAlertLog = _openDrawer;
  window.WS.closeAlertLog = _closeDrawer;

  // ────────────────────────────────────────────────
  // 벨 마운트 + 자가복구
  // ────────────────────────────────────────────────
  function _tryMount() {
    if (document.body) _mountBell();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _tryMount);
  } else {
    _tryMount();
  }
  // content.js 가 UI 를 갈아끼우면 벨이 사라질 수 있어 주기적으로 복구
  setInterval(function () {
    if (!document.getElementById(BTN_ID) && document.body) _mountBell();
    _updateBadge();
  }, 3000);

  try {
    console.log(
      '[ws-alert-log] v293 ready — window.WS.alertLog.all() / 🔔 버튼 클릭으로 로그 확인'
    );
  } catch (e) {}
})();
