// content-v381-modal-id-precise.js
// [I-CONTACT-3 v4 2026-05-14] modal listing id "매물번호 XXX" 텍스트 기반 정확 추출
//
// 사장님 발견 2026-05-14 (콘솔 + 캡처): v380 의 modal id 추출이 유사매물 카드의
// data-listing-id 를 잘못 picked up → 다른 매물 phone 표시.
//
// 예: 매물 114603 모달 안에 유사매물 카드 114609 등이 표시됨. v380 의
// querySelector('[data-listing-id]') 가 유사매물 카드의 id 를 가져옴 → 잘못된 매물 phone render.
//
// fix: 모달 헤더의 "매물번호 \d+" 텍스트에서 정확한 id 추출 + contacts container 를
//      모달 내부로 한정.

(function () {
  'use strict';
  var TAG = '[v381-modal-id-precise]';
  var lastModalId = null;
  // [Step 59 fix 2026-05-19 사장님 명령] OOM 누수 #2 — fetchCache 무한 누적 cap
  //   기존: 모달 열 때마다 fetchCache[id] = Promise+listing, 닫혀도 안 지움
  //   수정: 50건 cap LRU (가장 오래된 entry 제거)
  var fetchCache = {};
  var fetchCacheKeys = []; // insertion order
  var FETCH_CACHE_MAX = 50;
  function _cacheSet(id, val) {
    if (!(id in fetchCache)) fetchCacheKeys.push(id);
    fetchCache[id] = val;
    while (fetchCacheKeys.length > FETCH_CACHE_MAX) {
      var oldId = fetchCacheKeys.shift();
      delete fetchCache[oldId];
    }
  }

  // ★ 핵심 — 모달 헤더의 "매물번호 XXX" 텍스트에서 id 추출
  //   - 유사매물 카드의 data-listing-id 무시
  //   - 모달 root 의 명확한 매물번호 표시 element 우선
  function getModalListingId() {
    try {
      // [Step 54 fix 2026-05-19 사장님 명령] FREEZE 진짜 원인
      //   기존: document.querySelectorAll('*') — 5080노드 + getBoundingClientRect = layout thrash
      //   수정: modal element 안으로 스코프 한정 (50-100노드만)
      var modal = document.getElementById('ws-modal-detail');
      // 우선순위 1: 모달 헤더의 "매물번호 \d+" 텍스트
      var headers = modal ? modal.querySelectorAll('*') : [];
      for (var i = 0; i < headers.length; i++) {
        var el = headers[i];
        // text 가 정확히 "매물번호 \d+" 와 NEW 정도만 (다른 매물 카드 텍스트 X)
        var t = (el.textContent || '').trim();
        if (t.length < 25 && /^매물번호\s+\d{4,7}(\s*NEW)?$/.test(t)) {
          var m = t.match(/(\d{4,7})/);
          if (m) {
            // modal 안에서 찾았으니 무조건 valid (rect 체크 제거 — layout 비싸)
            return m[1];
          }
        }
      }

      // 우선순위 2: URL ?listing= 또는 /map/{id}
      var url = new URL(window.location.href);
      var lid = url.searchParams.get('listing');
      if (lid && /^\d{4,7}$/.test(lid)) return lid;
      var pathMatch = url.pathname.match(/\/map\/(\d{4,7})/);
      if (pathMatch) return pathMatch[1];

      return null;
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
      return Math.floor(diff / 86400) + '일 전';
    } catch (e) { return ''; }
  }

  function buildContactsHtml(contacts, crawledAt) {
    if (!Array.isArray(contacts) || !contacts.length) {
      return '<div style="padding:12px;color:#999;font-size:13px">연락처 정보 없음</div>';
    }
    var html = '<div class="v270-contacts" data-v381="1">';
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
      html += '<div class="v270-ct-meta" data-v381="1">📡 ' + esc(fmtTimeAgo(crawledAt)) + ' 에 자동 갱신됨 (050은 30일마다 자동 갱신)</div>';
    }
    return html;
  }

  function fetchContacts(id) {
    if (fetchCache[id]) return fetchCache[id];
    var p = fetch('/api/admin/listings/' + encodeURIComponent(id), {
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
    _cacheSet(id, p);
    return p;
  }

  // ★ contacts container 찾기 — 모달 내부 한정
  //   "관계자 연락처" 라는 한국어 텍스트가 있는 박스 안의 contacts list 영역
  function findContactsContainer() {
    // 우선순위 1: 이미 render 된 .v270-contacts 의 parent (모달 안인지 확인)
    var existing = document.querySelector('.v270-contacts');
    if (existing && existing.parentElement) {
      // 그 parent 가 modal 안인지 확인 (fixed/absolute 또는 큰 size)
      var rect = existing.parentElement.getBoundingClientRect();
      if (rect.width > 200) return existing.parentElement;
    }
    // 우선순위 2: .v240-contacts-empty 의 parent
    var empty = document.querySelector('.v240-contacts-empty');
    if (empty && empty.parentElement) return empty.parentElement;
    // 우선순위 3: "관계자 연락처" 텍스트의 부모 박스
    // [Step 54 fix 2026-05-19] modal 안으로 스코프 한정 — layout thrash 차단
    var modalRoot2 = document.getElementById('ws-modal-detail') || document;
    var all = modalRoot2.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var t = (el.textContent || '').trim();
      if (t.length < 30 && /^관계자\s*연락처/.test(t)) {
        // 그 element 의 sibling 또는 parent 의 다음 box 안에 contacts container 있음
        var section = el.closest('div, section');
        if (section) {
          // section 안의 빈 contacts 영역 찾기 (data-v381-area 또는 sibling)
          var areas = section.querySelectorAll('div');
          for (var j = 0; j < areas.length; j++) {
            // 빈 영역 또는 phone 이 표시되는 영역
            if (areas[j] !== el && (areas[j].textContent.indexOf('0502') >= 0 || areas[j].textContent.indexOf('010-') >= 0 || areas[j].classList.contains('v240-contacts-list'))) {
              return areas[j].parentElement || areas[j];
            }
          }
          // 못 찾으면 section 자체에 append
          return section;
        }
      }
    }
    return null;
  }

  function applyContactsToModal(modalId) {
    fetchContacts(modalId).then(function (res) {
      if (!res) return;
      var currentModalId = getModalListingId();
      if (currentModalId !== modalId) {
        try { console.warn(TAG, 'race detected, modal switched ' + modalId + ' → ' + currentModalId + ', skip'); } catch (e) {}
        return;
      }

      var container = findContactsContainer();
      if (!container) {
        try { console.warn(TAG, 'no container for id=' + modalId); } catch (e) {}
        return;
      }

      // 기존 v270/v322 rendered + v240-contacts-empty 모두 제거
      container.querySelectorAll('.v270-contacts, .v270-ct-meta, .v240-contacts-empty, [data-v322-rendered], [data-v381="1"]').forEach(function (el) {
        try { el.remove(); } catch (e) {}
      });

      var div = document.createElement('div');
      div.setAttribute('data-v381-render', modalId);
      div.innerHTML = buildContactsHtml(res.contacts, res.crawledAt);
      while (div.firstChild) container.appendChild(div.firstChild);

      try { console.log(TAG, 'rendered id=' + modalId + ' phone=' + (res.contacts[0] && res.contacts[0].phone)); } catch (e) {}
    });
  }

  function check() {
    var id = getModalListingId();
    if (id && id !== lastModalId) {
      lastModalId = id;
      try { console.log(TAG, 'modal id (from 매물번호 text): ' + id); } catch (e) {}
      // [Step 45 fix 2026-05-19 사장님 명령] setTimeout 제거 — observer 이미 debounce 적용
      try { applyContactsToModal(id); } catch (e) {}
    }
  }

  // [Step 45 fix 2026-05-19] observer throttle 250ms — body subtree mutation cascade 차단
  //   기존: 매 DOM 변경마다 check() 호출 → 100매물 render = 수백 setTimeout 폭주
  //   수정: 250ms throttle 로 차단
  var __v381_throttle = null;
  var observer = new MutationObserver(function () {
    if (__v381_throttle) return;
    __v381_throttle = setTimeout(function () {
      __v381_throttle = null;
      try { check(); } catch (e) {}
    }, 250);
  });

  function startObserver() {
    try {
      var target = document.body;
      if (!target) { setTimeout(startObserver, 200); return; }
      observer.observe(target, { childList: true, subtree: true });
      check();
      try { console.log(TAG, 'observer attached'); } catch (e) {}
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  try { console.log(TAG, 'loaded'); } catch (e) {}
})();
