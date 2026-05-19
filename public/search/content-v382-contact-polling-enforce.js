// content-v382-contact-polling-enforce.js
// [I-CONTACT-3 v5 2026-05-14] brute force polling — race condition 흡수
//
// 사장님 prod 검증 반복 (114603 모달에 114621 / 114609 / 114610 등 잘못된 phone 잔존):
// v270/v322/v378/v379/v380/v381 6개 patch 가 동시 작동 → 마지막에 누가 render 했는지 보장 X.
//
// 해결: 500ms 마다 polling — modal header 의 정확한 id 추출 + DB fetch +
//      화면 phone 과 비교 + 불일치 시 강제 덮어쓰기. brute force 지만 race 모든 케이스 흡수.

(function () {
  'use strict';
  var TAG = '[v382-contact-polling-enforce]';
  var lastFetchedId = null;
  var lastFetchedData = null;
  var fetching = false;
  var lastFetchTime = 0;

  function getModalListingIdFromHeader() {
    // [Step 54 fix 2026-05-19 사장님 명령] FREEZE 진짜 근본원인
    //   기존: document.querySelectorAll('*') — 5080노드 + 매 element 마다 textContent + getBoundingClientRect
    //         → 500ms 폴링 × 5080노드 layout thrashing = freeze
    //   수정: modal element 안으로 스코프 한정 (50-100노드만) + 1차 스코프 우선 검사
    try {
      var modal = document.getElementById('ws-modal-detail');
      if (!modal) return null;
      // 헤더 영역에 있는 매물번호만 검색 (속도 빠름)
      var headerCandidates = modal.querySelectorAll('.ws-modal-header, .v240-modal-header, h1, h2, h3, [class*="header"], [class*="title"]');
      for (var i = 0; i < headerCandidates.length; i++) {
        var t = (headerCandidates[i].textContent || '').trim();
        if (t.length < 60 && /매물번호\s+\d{4,7}/.test(t)) {
          var m = t.match(/(\d{4,7})/);
          if (m) return m[1];
        }
      }
      // fallback: modal 안 전체 (5080 → ~100노드)
      var inner = modal.querySelectorAll('*');
      for (var j = 0; j < inner.length; j++) {
        var t2 = (inner[j].textContent || '').trim();
        if (t2.length < 25 && /^매물번호\s+\d{4,7}(\s*NEW)?$/.test(t2)) {
          var m2 = t2.match(/(\d{4,7})/);
          if (m2) return m2[1];
        }
      }
      return null;
    } catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTimeAgo(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return '방금';
      if (diff < 3600) return Math.floor(diff / 60) + '분 전';
      if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
      return Math.floor(diff / 86400) + '일 전';
    } catch (e) { return ''; }
  }

  function fetchContactsForId(id) {
    return fetch('/api/admin/listings/' + encodeURIComponent(id) + '?_v382=' + Date.now(), {
      credentials: 'include',
      headers: { Authorization: 'Bearer <legacy>' },
      cache: 'no-store',
    }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (j) {
      if (!j) return null;
      var row = j.listing || j.data || j;
      return {
        id: id,
        contacts: row.contacts || [],
        crawledAt: row.contacts_crawled_at || null,
      };
    }).catch(function () { return null; });
  }

  function enforceCorrectPhone() {
    var modalId = getModalListingIdFromHeader();
    if (!modalId) return;

    // 새 modal id 면 fetch 다시
    if (modalId !== lastFetchedId || !lastFetchedData) {
      if (fetching) return;
      // throttle: 3초 안에는 다시 fetch X
      if (Date.now() - lastFetchTime < 3000 && lastFetchedId === modalId) return;
      fetching = true;
      lastFetchTime = Date.now();
      fetchContactsForId(modalId).then(function (res) {
        fetching = false;
        if (!res) return;
        lastFetchedId = modalId;
        lastFetchedData = res;
        applyToModal(res);
      });
      return;
    }

    // 같은 modal id — 화면 phone 검증 + 불일치 시 강제 fix
    applyToModal(lastFetchedData);
  }

  function applyToModal(res) {
    if (!res || !Array.isArray(res.contacts) || !res.contacts.length) return;

    // 현재 modal id 가 fetch 시점 id 와 일치하는지 strict check
    var currentId = getModalListingIdFromHeader();
    if (currentId !== res.id) return; // race — 다음 polling 에서 다시 시도

    var correctPhone = res.contacts[0] && res.contacts[0].phone;
    if (!correctPhone) return;

    // [Step 54 fix 2026-05-19] modal 안으로 스코프 — getBoundingClientRect layout thrash 차단
    var modalRoot = document.getElementById('ws-modal-detail') || document;
    var phoneEls = modalRoot.querySelectorAll('.v270-ct-phone, .v240-contact-phone, [data-phone]');
    var anyMismatch = false;
    for (var i = 0; i < phoneEls.length; i++) {
      var el = phoneEls[i];
      var t = (el.textContent || el.getAttribute('data-phone') || '').trim();
      // 모달 안 element 만 (위 부분 = 모달 헤더 근처)
      var rect = el.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight) continue;

      if (t && t !== correctPhone && /^05\d{2}-\d{3,4}-\d{4}$|^010-\d{3,4}-\d{4}$/.test(t)) {
        // 잘못된 phone — 강제 fix
        anyMismatch = true;
        try {
          el.textContent = correctPhone;
          if (el.hasAttribute('data-phone')) el.setAttribute('data-phone', correctPhone);
          if (el.tagName === 'A') el.setAttribute('href', 'tel:' + correctPhone.replace(/[^0-9]/g, ''));
        } catch (e) {}
      }
    }

    if (anyMismatch) {
      try { console.log(TAG, '✓ 강제 fix: id=' + res.id + ' → ' + correctPhone); } catch (e) {}
    }
  }

  // 500ms polling — 너무 빠르면 perf 영향, 너무 느리면 사용자 결함 인지 가능
  var pollInterval = null;
  function startPolling() {
    if (pollInterval) return;
    // [Step 44 fix 2026-05-19 사장님 명령] modal open 시에만 polling 활성화
    //   기존: 영구 500ms polling → main thread 영원히 점유 (freeze 원인)
    //   수정: modal 닫혀있으면 즉시 return (idle), 매 호출 시 modal 체크
    // [Step 54 fix 2026-05-19] 500ms → 1500ms (race-fix 충분히 빠름, CPU 1/3)
    pollInterval = setInterval(function () {
      try {
        // [Step 51 fix 2026-05-19 사장님 명령] modal 실제 selector 로 수정
        //   Step 44 가 잘못된 selector('.v240-modal-open') 썼었음 — prod 에 존재 X
        //   실제 prod modal: <div id="ws-modal-detail" style="display:none/flex">
        //   따라서 매 polling 마다 modal 닫혀있다고 판정 → enforceCorrectPhone 영영 호출 X
        //   → 전화번호 race-condition fix 가 Step 44 이후 비활성 상태였음
        var m = document.getElementById('ws-modal-detail');
        if (!m || m.style.display === 'none' || !m.offsetParent) return;
        enforceCorrectPhone();
      } catch (e) {}
    }, 1500);
    try { console.log(TAG, 'polling started (500ms, modal-only)'); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPolling);
  } else {
    startPolling();
  }

  try { console.log(TAG, 'loaded'); } catch (e) {}
})();
