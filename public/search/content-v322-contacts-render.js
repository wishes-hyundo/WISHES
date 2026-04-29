// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// content-v322-contacts-render.js (2026-04-29 사장님 명령)
//
// 목적: v240 모달의 .v240-contacts-empty 영역에 DB 의 contacts 렌더.
//
// 배경:
//   - v270-contacts.js 가 contacts 표시 담당.
//   - 그러나 (A) window.__currentListing.contacts 빈 배열 → return (표시 X).
//   - (B) 분기 fetchCache 도 cache 됐으면 stale.
//   - 결과: DB 에 contacts 가 있어도 모달에 "등록된 연락처가 없습니다" 표시.
//
// v322 — 외과적 fix (v270 코드 안 건드림):
//   1. MutationObserver 로 [data-v240-add-contact] 또는 .v240-contacts-empty 감지
//   2. 0.6 초 후에도 .v270-contacts 가 없으면 (= v270 표시 실패) v322 가 직접 fetch
//   3. /api/admin/listings/[id] fresh fetch (cache:'no-cache' + Authorization)
//   4. contacts 있으면 v270 와 동일 형식으로 직접 렌더
//   5. 없으면 그대로 둠 (원본 "등록된 연락처가 없습니다" 유지)
//
// 안전 장치:
//   - try/catch 모든 분기
//   - v322-rendered 마커로 중복 처리 방지
//   - bubble phase + stopPropagation 사용 X
//   - 페이지 로드 차단 X (DOMContentLoaded 후 비동기)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function () {
  'use strict';
  var TAG = '[v322-contacts-render]';
  try {
    if (window.__v322ContactsRender) return;
    window.__v322ContactsRender = true;
  } catch (e) { return; }

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function typeLabel(t) {
    if (t === 'mobile') return { txt: '실번호', cls: 'mobile' };
    if (t === '050')    return { txt: '안심번호', cls: 'safe' };
    if (t === 'landline') return { txt: '유선', cls: 'land' };
    return { txt: '기타', cls: 'unknown' };
  }

  function renderContacts(container, contacts) {
    try {
      if (!container || !container.parentNode) return;
      if (!Array.isArray(contacts) || !contacts.length) return;
      var html = '<div class="v270-contacts" data-v322-rendered="1">';
      var any = false;
      contacts.forEach(function (c) {
        try {
          var t = typeLabel(c.type);
          var phone = String(c.phone || '').trim();
          var digits = phone.replace(/[^0-9]/g, '');
          if (!digits) return;
          any = true;
          var role = c.role || '미지정';
          var name = c.name || '';
          html +=
            '<div class="v270-ct-row">' +
              '<span class="v270-ct-role">' + esc(role) + '</span>' +
              (name ? '<span style="font-size:13px;font-weight:600;color:#333;margin-right:6px;">' + esc(name) + '</span>' : '') +
              '<a class="v270-ct-phone" href="tel:' + esc(digits) + '">' + esc(phone) + '</a>' +
              '<span class="v270-ct-badge ' + t.cls + '">' + t.txt + '</span>' +
              '<button type="button" class="v270-ct-copy" data-phone="' + esc(phone) + '">복사</button>' +
              (c.memo ? '<span style="font-size:11px;color:#888;margin-left:6px;">💬 ' + esc(c.memo) + '</span>' : '') +
            '</div>';
        } catch (e) {}
      });
      html += '</div>';
      if (!any) return;
      container.outerHTML = html;
    } catch (e) {
      try { console.error(TAG, 'render fail', e); } catch (_) {}
    }
  }

  // 매물 ID 별로 진행 중 fetch 추적 (중복 방지)
  var pending = {};

  function fetchAndRender(emptyDiv, lid) {
    if (!emptyDiv || !lid) return;
    if (emptyDiv.getAttribute('data-v322-processed') === '1') return;
    emptyDiv.setAttribute('data-v322-processed', '1');

    if (pending[lid]) return;
    pending[lid] = true;

    fetch('/api/admin/listings/' + encodeURIComponent(lid), {
      credentials: 'include',
      headers: { 'Authorization': 'Bearer <legacy>' },
      cache: 'no-cache',
    })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (j) {
        try {
          if (!j) return;
          var row = j.listing || j.data || j;
          var contacts = (row && row.contacts) || [];
          if (!Array.isArray(contacts) || !contacts.length) return;
          // v270 가 이미 처리했으면 .v270-contacts 가 부모 어딘가에 있음
          // emptyDiv 가 DOM 에서 제거됐는지 체크
          if (!emptyDiv.parentNode) return;
          // window.__currentListing 도 동기화 (v270 가 다음 모달에서 사용)
          try {
            if (window.__currentListing && String(window.__currentListing.id) === String(lid)) {
              window.__currentListing.contacts = contacts;
            }
          } catch (e) {}
          renderContacts(emptyDiv, contacts);
        } catch (e) {
          try { console.error(TAG, 'process fail', e); } catch (_) {}
        }
      })
      .catch(function (err) {
        try { console.warn(TAG, 'fetch err', lid, err); } catch (_) {}
      })
      .finally(function () {
        try { delete pending[lid]; } catch (e) {}
      });
  }

  function tryRender() {
    try {
      // .v240-contacts-empty 영역 + listing id 추출
      var empties = document.querySelectorAll('.v240-contacts-empty:not([data-v322-processed])');
      for (var i = 0; i < empties.length; i++) {
        var empty = empties[i];
        // 가장 가까운 [data-v240-add-contact] 또는 [data-listing-id] 에서 id
        var anchor = empty.closest('[data-listing-id]') || document.querySelector('[data-v240-add-contact]');
        var lid = null;
        if (anchor) {
          lid = anchor.getAttribute('data-listing-id') || anchor.getAttribute('data-v240-add-contact');
        }
        if (!lid && window.__currentListing && window.__currentListing.id) {
          lid = String(window.__currentListing.id);
        }
        if (!lid) continue;
        fetchAndRender(empty, String(lid));
      }
    } catch (e) {
      try { console.error(TAG, 'tryRender fail', e); } catch (_) {}
    }
  }

  function startObserver() {
    try {
      if (typeof MutationObserver === 'undefined') return;
      var observer = new MutationObserver(function () {
        // 0.6초 delay (v270 가 먼저 처리할 시간 확보)
        setTimeout(tryRender, 600);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  function init() {
    try {
      tryRender();
      startObserver();
      try { console.log(TAG, 'loaded — v270 fetchCache 우회 + DB fresh contacts 표시'); } catch (e) {}
    } catch (e) {
      try { console.error(TAG, 'init fail', e); } catch (_) {}
    }
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (e) {}
})();
