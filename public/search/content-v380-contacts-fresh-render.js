// content-v380-contacts-fresh-render.js
// [I-CONTACT-3 v3 2026-05-14] modal id 기반 직접 fetch+render (v270/v322 우회)
//
// 사장님 발견 2026-05-14 (114603 모달): v379 fix 후에도 다른 매물 phone 잔존.
// Root cause: v270 의 findCurrentContacts() 가 window.__currentListing 을 보지만
//   v240-detail.js 가 modal HTML update 후 __currentListing 을 update 하기 전에
//   v270 가 호출되면 옛 매물의 contacts 그대로 render.
//
// fix: modal listing id 변경 감지 → /api/admin/listings/{id} 직접 fetch →
//      contacts 영역에 직접 render. v270/v322 fetchCache 모두 무시.

(function () {
  'use strict';
  var TAG = '[v380-contacts-fresh-render]';
  var lastWarnedNoContainerId = null; // [Step 52] log 폭주 차단
  var lastModalId = null;
  var inflightFetch = null;
  var fetchCache = {}; // id -> Promise<contacts[]>

  function getModalListingId() {
    try {
      var el = document.querySelector('[data-listing-id], [data-v240-add-contact]');
      if (!el) return null;
      var id = el.getAttribute('data-listing-id') || el.getAttribute('data-v240-add-contact');
      return id ? String(id) : null;
    } catch (e) { return null; }
  }

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

  function buildContactsHtml(contacts, crawledAt) {
    if (!Array.isArray(contacts) || !contacts.length) {
      return '<div style="padding:12px;color:#999;font-size:13px">연락처 정보 없음</div>';
    }
    var html = '<div class="v270-contacts" data-v380="1">';
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
      html += '<div class="v270-ct-meta" data-v380="1">📡 ' + esc(fmtTimeAgo(crawledAt)) + ' 에 자동 갱신됨 (050은 30일마다 자동 갱신)</div>';
    }
    return html;
  }

  function fetchContacts(id) {
    if (fetchCache[id]) return fetchCache[id];
    fetchCache[id] = fetch('/api/admin/listings/' + encodeURIComponent(id), {
      credentials: 'include',
      headers: { Authorization: 'Bearer <legacy>' },
      cache: 'no-cache',
    }).then(function (r) {
      if (!r.ok) {
        try { console.warn(TAG, 'fetch fail status=' + r.status + ' id=' + id); } catch (e) {}
        return null;
      }
      return r.json();
    }).then(function (j) {
      if (!j) return null;
      var row = j.listing || j.data || j;
      return {
        id: id,
        contacts: row.contacts || [],
        crawledAt: row.contacts_crawled_at || null,
      };
    }).catch(function (err) {
      try { console.warn(TAG, 'fetch err id=' + id, err); } catch (e) {}
      return null;
    });
    return fetchCache[id];
  }

  function findContactsContainer() {
    // 우선순위: 이미 render 된 .v270-contacts 의 parent → .v240-contacts-empty 의 parent → modal 안 contacts section
    var existing = document.querySelector('.v270-contacts');
    if (existing && existing.parentElement) return existing.parentElement;
    var empty = document.querySelector('.v240-contacts-empty');
    if (empty && empty.parentElement) return empty.parentElement;
    // fallback: data-v240-add-contact 가 있는 element 의 parent
    var addBtn = document.querySelector('[data-v240-add-contact]');
    if (addBtn) {
      var p = addBtn.closest('.v240-info, [data-v240-modal], .v240-modal-content, .v240-contact-section');
      if (p) return p;
    }
    return null;
  }

  function applyContactsToModal(modalId) {
    fetchContacts(modalId).then(function (res) {
      if (!res) return;
      // ★ 핵심 — fetch 응답의 listing id 가 현재 modal id 와 일치하는지 strict check
      var currentModalId = getModalListingId();
      if (currentModalId !== modalId) {
        try { console.warn(TAG, 'race detected, modal switched ' + modalId + ' → ' + currentModalId + ', skipping'); } catch (e) {}
        return;
      }

      var container = findContactsContainer();
      if (!container) {
        // [Step 52] no container 폭주 차단 — 같은 id 1회만 log
        if (lastWarnedNoContainerId !== modalId) {
          lastWarnedNoContainerId = modalId;
          try { console.log(TAG, 'no container found for id=' + modalId + ' (이 id 에서 1회만 log)'); } catch (e) {}
        }
        return;
      }

      // 기존 v270/v322 rendered element 모두 제거
      container.querySelectorAll('.v270-contacts, .v270-ct-meta, .v240-contacts-empty, [data-v322-rendered]').forEach(function (el) {
        try { el.remove(); } catch (e) {}
      });

      // 새 contacts HTML 추가
      var div = document.createElement('div');
      div.setAttribute('data-v380-render', modalId);
      div.innerHTML = buildContactsHtml(res.contacts, res.crawledAt);
      while (div.firstChild) container.appendChild(div.firstChild);

      try { console.log(TAG, 'rendered id=' + modalId + ' contacts=' + res.contacts.length); } catch (e) {}
    });
  }

  function check() {
    var id = getModalListingId();
    if (id && id !== lastModalId) {
      lastModalId = id;
      try { console.log(TAG, 'modal id detected: ' + id); } catch (e) {}
      // 약간 delay — modal DOM 갱신 시간 부여
      setTimeout(function () { applyContactsToModal(id); }, 100);
    }
  }

  // [Step 52 fix 2026-05-19 사장님 명령] body subtree MO cascade — OOM 진짜 원인
  //   기존: 매 DOM mutation 마다 check() 호출 → 100매물 lazy stream 시 폭주
  //   수정: 300ms throttle (modal id 변경 detect 는 300ms 충분)
  var __v380_throttle = null;
  var observer = new MutationObserver(function () {
    if (__v380_throttle) return;
    __v380_throttle = setTimeout(function () {
      __v380_throttle = null;
      try { check(); } catch (e) {}
    }, 300);
  });

  function startObserver() {
    try {
      var target = document.body;
      if (!target) { setTimeout(startObserver, 200); return; }
      observer.observe(target, {
        childList: true, subtree: true,
        attributes: true,
        attributeFilter: ['data-listing-id', 'data-v240-add-contact'],
      });
      check(); // 초기 1회
      try { console.log(TAG, 'observer attached'); } catch (e) {}
    } catch (e) { try { console.warn(TAG, 'observer attach fail:', e.message); } catch (e2) {} }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  try { console.log(TAG, 'loaded'); } catch (e) {}
})();
