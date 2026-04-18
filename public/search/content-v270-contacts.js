/**
 * WISHES Search Contacts Overlay — v2.7.1 hotfix
 * ============================================================
 * 목적 : 공실클럽에서 크롤링한 `contacts` 배열(JSONB)을
 *        /search 상세보기의 "관계자 연락처" 섹션에 렌더링.
 *        - 역할별(사장/사모/관리업체/임차인 등) 표시
 *        - 050 안심번호는 노란 배지로 구분
 *        - 전화번호 클릭 시 tel: 링크 동작
 *        - 실번호(010) 는 초록 배지로 강조
 *
 * 배포 : page.tsx 에 <script src="/search/content-v270-contacts.js"/> 1줄 추가
 * 롤백 : 위 <script> 태그 1줄 제거
 *
 * 전제 : Supabase `listings.contacts` (JSONB) 컬럼이 이미 존재
 *        (migration_contacts.sql 적용 후)
 *
 * v2.7.1 hotfix (2026-04-18):
 *   - /api/admin/listings/{id} 호출 시 Authorization: Bearer wishes2026 누락으로
 *     401 이 발생하여 contacts 가 항상 빈 배열로 fallback 되던 버그 수정.
 *   - 실패 시 console.warn 으로 상태코드를 남겨 추후 진단 용이하게 함.
 */
(function () {
  'use strict';
  if (window.__v270_contacts_installed) return;
  window.__v270_contacts_installed = true;

  var VERSION = '2.7.1';
  var TAG = '[WP v' + VERSION + ' contacts]';
  console.log(TAG + ' installed');

  // ──────────────────────────────────────────────────────
  // 1. 스타일 주입
  // ──────────────────────────────────────────────────────
  var STYLE_ID = 'v270-contacts-style';
  if (!document.getElementById(STYLE_ID)) {
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '#ws-detail-container .v270-contacts{display:flex;flex-direction:column;gap:8px;margin-bottom:8px}',
      '#ws-detail-container .v270-ct-row{display:flex;align-items:center;gap:10px;',
        'padding:10px 12px;background:#fff;border:1px solid #E3D6A6;border-radius:10px;',
        'box-shadow:0 1px 2px rgba(107,86,26,0.05)}',
      '#ws-detail-container .v270-ct-role{min-width:66px;font-size:12px;font-weight:700;color:#6B561A;',
        'background:#FBF4DD;padding:4px 8px;border-radius:6px;text-align:center;letter-spacing:-0.02em}',
      '#ws-detail-container .v270-ct-phone{flex:1;font-size:15px;font-weight:700;color:#1a1a1a;',
        'text-decoration:none;letter-spacing:0.3px;font-variant-numeric:tabular-nums}',
      '#ws-detail-container .v270-ct-phone:hover{color:#6B561A;text-decoration:underline}',
      '#ws-detail-container .v270-ct-badge{font-size:10px;font-weight:700;padding:3px 7px;border-radius:5px;',
        'letter-spacing:-0.02em;white-space:nowrap}',
      '#ws-detail-container .v270-ct-badge.mobile{background:#DCFCE7;color:#166534}',
      '#ws-detail-container .v270-ct-badge.safe{background:#FEF3C7;color:#92400E}',
      '#ws-detail-container .v270-ct-badge.land{background:#E0E7FF;color:#3730A3}',
      '#ws-detail-container .v270-ct-badge.unknown{background:#F3F4F6;color:#4B5563}',
      '#ws-detail-container .v270-ct-meta{font-size:11px;color:#888;margin-top:6px}',
      '#ws-detail-container .v270-ct-copy{background:none;border:1px solid #E3D6A6;color:#6B561A;',
        'padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer}',
      '#ws-detail-container .v270-ct-copy:hover{background:#FBF4DD}',
      '#ws-detail-container .v270-ct-copy.copied{background:#DCFCE7;border-color:#86EFAC;color:#166534}',
    ].join('\n');
    document.head.appendChild(st);
  }

  // ──────────────────────────────────────────────────────
  // 2. 유틸
  // ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function typeLabel(t) {
    if (t === 'mobile') return { txt: '실번호', cls: 'mobile' };
    if (t === '050')    return { txt: '안심번호', cls: 'safe' };
    if (t === 'landline') return { txt: '유선', cls: 'land' };
    return { txt: '기타', cls: 'unknown' };
  }

  function fmtTimeAgo(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return '방금';
      if (diff < 3600) return Math.floor(diff / 60) + '분 전';
      if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
      var days = Math.floor(diff / 86400);
      if (days < 30) return days + '일 전';
      return d.toISOString().slice(0, 10);
    } catch (e) { return ''; }
  }

  // ──────────────────────────────────────────────────────
  // 3. 렌더러
  // ──────────────────────────────────────────────────────
  function renderContacts(container, contacts, crawledAt) {
    if (!container) return;
    if (!Array.isArray(contacts) || !contacts.length) return;

    var html = '<div class="v270-contacts">';
    contacts.forEach(function (c, i) {
      var t = typeLabel(c.type);
      var phone = String(c.phone || '').trim();
      var digits = phone.replace(/[^0-9]/g, '');
      if (!digits) return;
      html +=
        '<div class="v270-ct-row">' +
          '<span class="v270-ct-role">' + esc(c.role || '미지정') + '</span>' +
          '<a class="v270-ct-phone" href="tel:' + esc(digits) + '">' + esc(phone) + '</a>' +
          '<span class="v270-ct-badge ' + t.cls + '">' + t.txt + '</span>' +
          '<button type="button" class="v270-ct-copy" data-phone="' + esc(phone) + '">복사</button>' +
        '</div>';
    });
    html += '</div>';
    if (crawledAt) {
      html += '<div class="v270-ct-meta">📡 ' + esc(fmtTimeAgo(crawledAt)) + ' 에 자동 갱신됨 (050은 30일마다 자동 갱신)</div>';
    }

    container.outerHTML = html;
  }

  // ──────────────────────────────────────────────────────
  // 4. 현재 상세보기의 listing 데이터 추적
  //     v240-detail.js 가 showDetail 시점에 window.__currentListing 을 세팅하거나,
  //     DOM 에서 id 를 뽑아 캐시된 minimal 리스트로 조회.
  // ──────────────────────────────────────────────────────
  function findCurrentContacts() {
    // (A) v260/v251 가 L 을 노출시키는 관용 경로 탐색
    try {
      if (window.__currentListing && Array.isArray(window.__currentListing.contacts))
        return {
          contacts: window.__currentListing.contacts,
          crawledAt: window.__currentListing.contacts_crawled_at,
        };
    } catch (e) {}

    // (B) DOM 에서 listing id 추출 → 관리 API 에서 재조회 (캐시)
    var el = document.querySelector('[data-listing-id], [data-v240-add-contact]');
    if (!el) return null;
    var id = el.getAttribute('data-listing-id') || el.getAttribute('data-v240-add-contact');
    if (!id) return null;
    return { pendingFetchId: id };
  }

  var fetchCache = {};
  function fetchContactsById(id) {
    if (fetchCache[id]) return fetchCache[id];
    // /api/admin/listings 는 고정 관리자 토큰(wishes2026)만 허용.
    // page.tsx prefetch 와 동일한 헤더를 사용해야 200 을 받는다.
    fetchCache[id] = fetch('/api/admin/listings/' + encodeURIComponent(id), {
      credentials: 'include',
      headers: { Authorization: 'Bearer wishes2026' },
      cache: 'no-cache',
    })
      .then(function (r) {
        if (!r.ok) {
          try { console.warn(TAG, 'fetch', id, 'status', r.status); } catch (e) {}
          return null;
        }
        return r.json();
      })
      .then(function (j) {
        if (!j) return null;
        var row = j.listing || j.data || j;
        return {
          contacts: row.contacts || [],
          crawledAt: row.contacts_crawled_at || null,
        };
      })
      .catch(function (err) {
        try { console.warn(TAG, 'fetch err', id, err); } catch (e) {}
        return null;
      });
    return fetchCache[id];
  }

  // ──────────────────────────────────────────────────────
  // 5. DOM 감시 — .v240-contacts-empty 가 나타나면 교체
  // ──────────────────────────────────────────────────────
  function tryReplace() {
    var empties = document.querySelectorAll('.v240-contacts-empty');
    if (!empties.length) return;

    empties.forEach(function (empty) {
      if (empty.getAttribute('data-v270-processed') === '1') return;
      empty.setAttribute('data-v270-processed', '1');

      var ctx = findCurrentContacts();
      if (!ctx) return;

      if (ctx.contacts) {
        renderContacts(empty, ctx.contacts, ctx.crawledAt);
        return;
      }

      if (ctx.pendingFetchId) {
        fetchContactsById(ctx.pendingFetchId).then(function (res) {
          if (!res || !res.contacts || !res.contacts.length) return;
          // empty 가 아직 DOM 에 남아있다면 교체
          var stillEmpty = document.querySelector('.v240-contacts-empty[data-v270-processed="1"]');
          if (stillEmpty) renderContacts(stillEmpty, res.contacts, res.crawledAt);
        });
      }
    });
  }

  var mo = new MutationObserver(function () { tryReplace(); });
  mo.observe(document.body, { childList: true, subtree: true });

  // 초기 1회 + 500ms 간격 폴링 5회 (SPA 렌더 타이밍 안전망)
  tryReplace();
  var pollN = 0;
  var iv = setInterval(function () {
    tryReplace();
    if (++pollN >= 10) clearInterval(iv);
  }, 500);

  // ──────────────────────────────────────────────────────
  // 6. 복사 버튼 delegate
  // ──────────────────────────────────────────────────────
  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('.v270-ct-copy');
    if (!btn) return;
    ev.preventDefault();
    var phone = btn.getAttribute('data-phone') || '';
    if (!phone) return;
    try {
      navigator.clipboard.writeText(phone).then(function () {
        var orig = btn.textContent;
        btn.classList.add('copied');
        btn.textContent = '✓ 복사됨';
        setTimeout(function () {
          btn.classList.remove('copied');
          btn.textContent = orig || '복사';
        }, 1400);
      });
    } catch (e) {
      // 폴백: textarea 선택
      var ta = document.createElement('textarea');
      ta.value = phone;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
    }
  });
})();
