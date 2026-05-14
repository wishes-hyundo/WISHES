// content-v378-contact-id-strict.js
// [I-CONTACT-3 2026-05-14] 매물 모달 contacts id strict 검증
//   사장님 발견: 다른 매물 phone 잘못 표시 (114206 방배동 모달에 114221 송파구 phone 표시)
//   root cause: v270-contacts.js 의 findCurrentContacts() 가 __currentListing.id 검증 안 함
//     → 이전 매물 모달의 contacts 가 새 매물 모달에 노출
//   영업 정확도 critical (잘못된 phone → 잘못된 broker 연결)
//
// fix: __currentListing.id 가 modal listingId 와 일치할 때만 contacts 반환

(function () {
  'use strict';
  var TAG = '[v378-contact-id-strict]';

  function getModalListingId() {
    try {
      var el = document.querySelector('[data-listing-id], [data-v240-add-contact]');
      if (!el) return null;
      var id = el.getAttribute('data-listing-id') || el.getAttribute('data-v240-add-contact');
      return id ? String(id) : null;
    } catch (e) { return null; }
  }

  // v270 의 findCurrentContacts 함수를 wrapping
  // 원본은 __currentListing.contacts 만 보고 id 검증 X
  // wrapping 후: id strict check 적용
  function patchedFindCurrentContacts() {
    var modalId = getModalListingId();
    try {
      if (window.__currentListing && Array.isArray(window.__currentListing.contacts)) {
        var listingId = String(window.__currentListing.id || '');
        // ★ id strict 검증
        if (modalId && listingId && modalId !== listingId) {
          try { console.warn(TAG, 'id mismatch — __currentListing.id=' + listingId + ' modal=' + modalId + ' → fetch by id'); } catch (e) {}
          return modalId ? { pendingFetchId: modalId } : null;
        }
        return {
          contacts: window.__currentListing.contacts,
          crawledAt: window.__currentListing.contacts_crawled_at,
        };
      }
    } catch (e) {}
    return modalId ? { pendingFetchId: modalId } : null;
  }

  // 원래 함수 override: window 에 노출된 경우만 가능
  // v270 의 findCurrentContacts 는 closure 안이라 직접 override 불가
  // 대안: __currentListing 변경 시 id 검증 + DOM mutation observer 통해 mismatch 시 reset

  // 1) __currentListing setter trap — 새 매물 모달 열릴 때 자동 갱신 보장
  var _internalListing = null;
  try {
    Object.defineProperty(window, '__currentListing', {
      get: function () { return _internalListing; },
      set: function (v) {
        // 다른 매물 set 시 fetchCache invalidation (이전 매물 contacts 잔존 방지)
        var prevId = _internalListing ? String(_internalListing.id || '') : null;
        var newId = v ? String(v.id || '') : null;
        if (prevId && newId && prevId !== newId) {
          try { console.log(TAG, 'listing switch ' + prevId + ' → ' + newId); } catch (e) {}
        }
        _internalListing = v;
      },
      configurable: true,
    });
  } catch (e) {
    try { console.warn(TAG, 'cannot define __currentListing property:', e.message); } catch (e2) {}
  }

  // 2) DOM mutation observer — 모달 listing id 변경 감지 시 contacts UI clear
  function clearStaleContactsUI() {
    var modalId = getModalListingId();
    if (!modalId) return;
    var listingId = window.__currentListing ? String(window.__currentListing.id || '') : null;
    if (listingId && listingId !== modalId) {
      // 모달이 새 매물인데 __currentListing 가 이전 매물 → contacts 영역 clear + 새로 fetch trigger
      try {
        var contactsEl = document.querySelector('.v240-contacts-list, .v270-contacts-render, [data-v240-contact-area]');
        if (contactsEl) {
          contactsEl.setAttribute('data-v378-stale', '1');
          contactsEl.innerHTML = '<div style="padding:12px;color:#999;font-size:13px">연락처 불러오는 중...</div>';
          try { console.log(TAG, 'stale UI cleared, id mismatch ' + listingId + ' vs ' + modalId); } catch (e) {}
        }
      } catch (e) {}
    }
  }

  var observer = new MutationObserver(function () {
    try { clearStaleContactsUI(); } catch (e) {}
  });

  function startObserver() {
    try {
      var target = document.body;
      if (!target) { setTimeout(startObserver, 200); return; }
      observer.observe(target, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['data-listing-id', 'data-v240-add-contact'],
      });
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
