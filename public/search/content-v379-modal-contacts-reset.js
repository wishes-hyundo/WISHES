// content-v379-modal-contacts-reset.js
// [I-CONTACT-3 v2 2026-05-14] modal listing id 변경 시 v270 rendered contacts 강제 reset
//
// 사장님 prod 검증 (2026-05-14): v378 setter trap 만으로는 부족. DB 정확하지만
// 모달에 잘못된 phone 표시 그대로. Root cause:
//   v270 의 renderContacts() 가 .v240-contacts-empty 의 outerHTML 자체를 교체 →
//   매물 A 처리 후 .v240-contacts-empty 영구 사라짐 → 매물 B 모달 열어도
//   v270 의 tryReplace() 가 .v240-contacts-empty 못 찾아 처리 X →
//   매물 A 의 .v270-contacts HTML 그대로 잔존.
//
// fix: modal id 변경 감지 시 .v270-contacts/.v270-ct-meta 모두 제거 +
//      그 자리에 새 .v240-contacts-empty placeholder 추가 →
//      v270 의 MutationObserver 가 즉시 picked up → 새 id 로 fetch → 정확한 phone.

(function () {
  'use strict';
  var TAG = '[v379-modal-contacts-reset]';
  var lastModalId = null;
  var resetting = false; // 재귀 방지

  function getModalListingId() {
    try {
      var el = document.querySelector('[data-listing-id], [data-v240-add-contact]');
      if (!el) return null;
      var id = el.getAttribute('data-listing-id') || el.getAttribute('data-v240-add-contact');
      return id ? String(id) : null;
    } catch (e) { return null; }
  }

  function resetRenderedContacts() {
    if (resetting) return;
    resetting = true;
    try {
      var rendered = document.querySelectorAll('.v270-contacts, .v270-ct-meta, [data-v270-processed], [data-v322-rendered], .v322-rendered');
      var parents = new Set();
      var cleared = 0;
      rendered.forEach(function (el) {
        try {
          if (el.parentElement) parents.add(el.parentElement);
          el.remove();
          cleared++;
        } catch (e) {}
      });

      // 각 parent 에 새 .v240-contacts-empty placeholder 추가
      // v270 의 MutationObserver 가 picked up → 새 listing id 로 fetch
      parents.forEach(function (p) {
        try {
          var empty = document.createElement('div');
          empty.className = 'v240-contacts-empty';
          empty.setAttribute('data-v379-reset', '1');
          p.appendChild(empty);
        } catch (e) {}
      });

      try { console.log(TAG, 'reset complete: ' + cleared + ' rendered cleared, ' + parents.size + ' placeholders added'); } catch (e) {}
    } catch (e) {
      try { console.warn(TAG, 'reset err:', e.message); } catch (e2) {}
    }
    resetting = false;
  }

  function check() {
    if (resetting) return;
    var id = getModalListingId();
    if (id && id !== lastModalId) {
      var prevId = lastModalId;
      lastModalId = id;
      if (prevId) {
        try { console.log(TAG, 'modal listing change: ' + prevId + ' → ' + id); } catch (e) {}
        // 약간 delay — modal DOM 이 갱신될 시간 부여
        setTimeout(resetRenderedContacts, 50);
      }
    }
  }

  var observer = new MutationObserver(function () {
    try { check(); } catch (e) {}
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
      lastModalId = getModalListingId();
      try { console.log(TAG, 'observer attached, initial id=' + lastModalId); } catch (e) {}
    } catch (e) { try { console.warn(TAG, 'observer attach fail:', e.message); } catch (e2) {} }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  try { console.log(TAG, 'loaded'); } catch (e) {}
})();
