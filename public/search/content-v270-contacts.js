/**
 * WISHES Search Contacts Overlay — v2.7.2 hotfix
 * ============================================================
 * 목적 : 공실클럽에서 크롤링한 `contacts` 배열(JSONB)을
 *        /search 상세보기의 "📞 관계자 연락처" 섹션에 렌더링.
 *        - 역할별(사장/사모/관리인/임차인 등) 카드
 *        - 050 안심번호(노란 배지) / 실번호(초록 배지) / 유선(파란 배지) 구분
 *        - 전화번호 클릭 시 tel: 링크 · 복사 버튼
 *
 * 배포 : page.tsx 에 <script src="/search/content-v270-contacts.js"/> 1줄
 * 롤백 : 위 <script> 태그 1줄 제거
 *
 * v2.7.2 hotfix (2026-04-18):
 *   1) v2.7.1 은 `.v240-contacts-empty` 노드가 DOM 에 마운트되길 기다렸으나,
 *      현행 상세모달(v240-detail.js 최신판) 에는 해당 노드가 존재하지 않아
 *      카드가 영원히 렌더되지 않는 결함이 있었다.
 *      → v2.7.2 는 `[data-v240-add-contact]`("+ 추가" 버튼) 을 앵커로 하여
 *        그 버튼의 상위 `.v240-b-card` 에 카드 wrapper 를 append 한다.
 *   2) /api/admin/listings/{id} 응답 구조가 `{ success, data:{...} }` 이므로
 *      `j.data.contacts` 를 우선 파싱 (구 버전의 `j.listing.contacts` 도 호환).
 *   3) listing id 별 contacts 결과를 메모리 캐시 · MutationObserver + 600ms×30
 *      폴링 + 클릭 후 3회 재시도로 SPA 상세모달 타이밍 이슈 제거.
 */
(function () {
  'use strict';
  if (window.__v270_contacts_installed) return;
  window.__v270_contacts_installed = true;

  var VERSION = '2.7.2';
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
      '.v270-contacts{display:flex;flex-direction:column;gap:8px;margin:8px 0 4px}',
      '.v270-ct-row{display:flex;align-items:center;gap:10px;',
        'padding:10px 12px;background:#fff;border:1px solid #E3D6A6;border-radius:10px;',
        'box-shadow:0 1px 2px rgba(107,86,26,0.05)}',
      '.v270-ct-role{min-width:66px;font-size:12px;font-weight:700;color:#6B561A;',
        'background:#FBF4DD;padding:4px 8px;border-radius:6px;text-align:center;letter-spacing:-0.02em}',
      '.v270-ct-phone{flex:1;font-size:15px;font-weight:700;color:#1a1a1a;',
        'text-decoration:none;letter-spacing:0.3px;font-variant-numeric:tabular-nums}',
      '.v270-ct-phone:hover{color:#6B561A;text-decoration:underline}',
      '.v270-ct-badge{font-size:10px;font-weight:700;padding:3px 7px;border-radius:5px;',
        'letter-spacing:-0.02em;white-space:nowrap}',
      '.v270-ct-badge.mobile{background:#DCFCE7;color:#166534}',
      '.v270-ct-badge.safe{background:#FEF3C7;color:#92400E}',
      '.v270-ct-badge.land{background:#E0E7FF;color:#3730A3}',
      '.v270-ct-badge.unknown{background:#F3F4F6;color:#4B5563}',
      '.v270-ct-meta{font-size:11px;color:#888;margin-top:6px}',
      '.v270-ct-copy{background:none;border:1px solid #E3D6A6;color:#6B561A;',
        'padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer}',
      '.v270-ct-copy:hover{background:#FBF4DD}',
      '.v270-ct-copy.copied{background:#DCFCE7;border-color:#86EFAC;color:#166534}',
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
  // 3. HTML 빌더
  // ──────────────────────────────────────────────────────
  function buildHtml(contacts, crawledAt) {
    if (!Array.isArray(contacts) || !contacts.length) return '';
    var html = '<div class="v270-contacts" data-v270-rendered="1">';
    contacts.forEach(function (c) {
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
    return html;
  }

  // ──────────────────────────────────────────────────────
  // 4. API 캐시
  //   dataCache[id] = { status:'pending'|'ok'|'empty'|'err', contacts, crawledAt }
  // ──────────────────────────────────────────────────────
  var dataCache = {};
  function loadContactsById(id) {
    if (!id) return;
    var cur = dataCache[id];
    if (cur && (cur.status === 'ok' || cur.status === 'empty' || cur.status === 'pending')) return;
    dataCache[id] = { status: 'pending' };
    fetch('/api/admin/listings/' + encodeURIComponent(id), {
      credentials: 'include',
      headers: { Authorization: 'Bearer wishes2026' },
      cache: 'no-cache',
    })
      .then(function (r) {
        if (!r.ok) {
          try { console.warn(TAG, 'fetch', id, 'status', r.status); } catch (e) {}
          dataCache[id] = { status: 'err' };
          return;
        }
        return r.json().then(function (j) {
          // 응답 구조 : { success, data:{ ..., contacts, contacts_crawled_at } }
          var row = (j && (j.data || j.listing)) || j || {};
          var list = Array.isArray(row.contacts) ? row.contacts : [];
          if (!list.length) {
            dataCache[id] = { status: 'empty' };
            try { console.log(TAG, 'no contacts for', id); } catch (e) {}
            return;
          }
          dataCache[id] = {
            status: 'ok',
            contacts: list,
            crawledAt: row.contacts_crawled_at || null,
          };
          try { console.log(TAG, 'contacts loaded', id, list.length); } catch (e) {}
        });
      })
      .catch(function (err) {
        try { console.warn(TAG, 'fetch err', id, err); } catch (e) {}
        dataCache[id] = { status: 'err' };
      });
  }

  // ──────────────────────────────────────────────────────
  // 5. 교체 로직 — "+ 추가" 버튼의 .v240-b-card 를 앵커로 append
  // ──────────────────────────────────────────────────────
  function tryReplace() {
    // 현재 상세모달의 "관계자 연락처" 카드 컨테이너
    var addBtns = document.querySelectorAll('[data-v240-add-contact]');
    if (!addBtns.length) return;

    addBtns.forEach(function (addBtn) {
      var id = addBtn.getAttribute('data-v240-add-contact');
      if (!id) return;
      var card = addBtn.closest('.v240-b-card');
      if (!card) return;

      // 이미 렌더된 카드가 있으면 skip
      if (card.querySelector('[data-v270-rendered="1"]')) return;

      // 데이터 로드 시작 (비동기) — 다음 polling tick 에서 다시 시도됨
      if (!dataCache[id]) {
        loadContactsById(id);
        return;
      }
      var entry = dataCache[id];
      if (!entry || entry.status !== 'ok') return;

      var html = buildHtml(entry.contacts, entry.crawledAt);
      if (!html) return;

      var tpl = document.createElement('div');
      tpl.innerHTML = html;
      var frag = document.createDocumentFragment();
      while (tpl.firstChild) frag.appendChild(tpl.firstChild);
      card.appendChild(frag);

      // 기존 empty-message 가 남아있으면 숨김 (혹시 있을 경우)
      var ghost = card.querySelector('.v240-contacts-empty');
      if (ghost) ghost.style.display = 'none';
    });
  }

  // ──────────────────────────────────────────────────────
  // 6. 트리거 — MutationObserver + 폴링 + 클릭 후 재시도
  // ──────────────────────────────────────────────────────
  var mo = new MutationObserver(function () { tryReplace(); });
  mo.observe(document.body, { childList: true, subtree: true });

  tryReplace();
  var pollN = 0;
  var iv = setInterval(function () {
    tryReplace();
    if (++pollN >= 30) clearInterval(iv);
  }, 600);

  document.addEventListener('click', function () {
    setTimeout(tryReplace, 150);
    setTimeout(tryReplace, 500);
    setTimeout(tryReplace, 1200);
  }, true);

  // ──────────────────────────────────────────────────────
  // 7. 복사 버튼 delegate
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
      var ta = document.createElement('textarea');
      ta.value = phone;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
    }
  });
})();
