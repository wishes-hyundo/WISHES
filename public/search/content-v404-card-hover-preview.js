/**
 * v404 — 매물 카드 hover 미리보기 (C-5)
 * 사장님 명령 2026-05-19: 카드 hover 시 사진 4장 + 정보 popup
 *
 * 동작:
 *   1. .ws-listing-card 에 마우스 enter → 500ms 대기 → popup 생성
 *   2. popup 위치: 카드 우측 (또는 좌측 if 우측 공간 없음)
 *   3. popup 내용:
 *      - 사진 4장 grid (listing_images 1-4번)
 *      - 주소 + 가격 + 관리비
 *      - 평형/층/옵션 태그
 *   4. 카드 또는 popup 떠나면 즉시 제거
 *   5. listing 데이터 없으면 fetchListingById 로 보강
 *
 * 모바일 skip (hover 없음)
 */
(function () {
  'use strict';
  if (window.__WS_V404_CARD_HOVER__) return;
  window.__WS_V404_CARD_HOVER__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;
  // 모바일/터치 device skip
  if ('ontouchstart' in window && navigator.maxTouchPoints > 0) return;

  var HOVER_DELAY = 500;
  var POPUP_WIDTH = 280;
  var hoverTimer = null;
  var currentPopup = null;
  var currentCardId = null;
  var fetchCache = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
    });
  }

  function buildPopupHtml(listing) {
    var imgs = listing.images || listing.listing_images || [];
    var imgGrid = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:8px;border-radius:6px;overflow:hidden;">';
    for (var i = 0; i < 4; i++) {
      if (i < imgs.length) {
        var url = imgs[i].url || imgs[i];
        imgGrid += '<div style="height:64px;background-image:url(\'' + url.replace(/'/g, "\\'") + '\');background-size:cover;background-position:center;background-color:#f0f0f0;"></div>';
      } else {
        imgGrid += '<div style="height:64px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:10px;color:#bbb;">—</div>';
      }
    }
    imgGrid += '</div>';

    var addr = listing.address || listing.dong || '주소 미상';
    var building = listing.building_name ? ' · ' + listing.building_name : '';
    var titleHtml = '<div style="font-weight:600;font-size:13px;color:#1B3D28;margin-bottom:2px;">' + esc(addr) + esc(building) + '</div>';

    // 가격
    var deal = listing.deal || '';
    var priceText = '';
    if (deal === '월세' || deal === '단기') {
      priceText = (listing.deposit || 0) + ' / ' + (listing.monthly || 0);
    } else if (deal === '전세') {
      priceText = '전세 ' + (listing.deposit || 0);
    } else if (deal === '매매') {
      priceText = '매매 ' + (listing.price || listing.deposit || 0);
    }
    var priceHtml = '<div style="font-size:12.5px;color:#222;font-weight:500;">' + esc(deal) + ' ' + esc(priceText) + '</div>';

    var maintHtml = '';
    if (listing.maintenance_fee && listing.maintenance_fee > 0) {
      maintHtml = '<div style="font-size:11px;color:#888;">관리비 ' + listing.maintenance_fee + '만</div>';
    } else if (listing.maintenance_fee === 0) {
      maintHtml = '<div style="font-size:11px;color:#888;">관리비 포함</div>';
    }

    // 태그
    var tags = [];
    if (listing.type) tags.push(listing.type);
    if (listing.rooms) tags.push(listing.rooms + '룸');
    if (listing.bathrooms) tags.push(listing.bathrooms + '욕실');
    if (listing.floor_current) {
      var floorStr = listing.floor_current;
      if (listing.floor_total) floorStr += '/' + listing.floor_total;
      tags.push(floorStr + '층');
    }
    if (listing.area_m2) tags.push(Math.round(listing.area_m2 * 0.3025) + '평');
    if (listing.parking) tags.push('주차');
    if (listing.elevator) tags.push('EV');
    if (listing.full_option) tags.push('풀옵션');
    if (listing.pet) tags.push('반려');
    var tagsHtml = tags.length ? '<div style="font-size:11px;color:#999;margin-top:4px;">' + tags.map(esc).join(' · ') + '</div>' : '';

    var idTag = '<div style="font-size:10px;color:#bbb;margin-top:6px;">매물번호 ' + esc(listing.id) + '</div>';

    return imgGrid + titleHtml + priceHtml + maintHtml + tagsHtml + idTag;
  }

  function positionPopup(popup, anchorEl) {
    var rect = anchorEl.getBoundingClientRect();
    var left = rect.right + 8;
    if (left + POPUP_WIDTH > window.innerWidth - 8) {
      left = rect.left - POPUP_WIDTH - 8;
    }
    if (left < 8) left = 8;
    var top = Math.max(8, Math.min(rect.top, window.innerHeight - 280));
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  function removePopup() {
    if (currentPopup) {
      try { currentPopup.parentNode.removeChild(currentPopup); } catch (_) {}
      currentPopup = null;
      currentCardId = null;
    }
  }

  // [Step 116 re-apply 2026-05-19 사장님 명령] popup 재사용 — 깜빡임 제거
  function showPopup(card, listing) {
    if (!currentPopup) {
      currentPopup = document.createElement('div');
      currentPopup.className = 'ws-v404-hover-popup';
      currentPopup.style.cssText = [
        'position:fixed','z-index:99999','background:#fff',
        'border:1px solid #e2e2e2','border-radius:10px',
        'box-shadow:0 8px 24px rgba(0,0,0,0.12)','padding:10px',
        'width:' + POPUP_WIDTH + 'px','font-family:inherit',
        'pointer-events:auto','transition:opacity 0.15s','opacity:1'
      ].join(';');
      currentPopup.addEventListener('mouseleave', removePopup);
      document.body.appendChild(currentPopup);
    }
    currentPopup.innerHTML = buildPopupHtml(listing);
    positionPopup(currentPopup, card);
    currentPopup.style.opacity = '1';
    currentCardId = card.getAttribute('data-listing-id');
  }

  function getListingForCard(card) {
    var id = card.getAttribute('data-listing-id');
    if (!id) return null;
    try {
      if (window.WS && Array.isArray(window.WS.allListings)) {
        var found = window.WS.allListings.find(function (l) { return l && String(l.id) === String(id); });
        if (found) return found;
      }
    } catch (_) {}
    return null;
  }

  function handleMouseOver(e) {
    var card = e.target && e.target.closest ? e.target.closest('.ws-listing-card') : null;
    if (!card) return;
    var id = card.getAttribute('data-listing-id');
    if (!id) return;
    // 같은 카드 위에서 mouseover 반복 시 popup 이미 있으면 skip
    if (currentCardId === id && currentPopup) return;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () {
      // 여전히 카드 위에 있는지 확인
      if (!card.matches(':hover')) return;
      var listing = getListingForCard(card);
      if (listing) {
        showPopup(card, listing);
      } else if (window.WS && typeof window.WS.fetchListingById === 'function') {
        if (!fetchCache[id]) {
          fetchCache[id] = window.WS.fetchListingById(id);
        }
        fetchCache[id].then(function (l) {
          if (l && card.matches(':hover')) {
            showPopup(card, l);
          }
        }).catch(function () {
          try { delete fetchCache[id]; } catch (_) {}
        });
      }
    }, HOVER_DELAY);
  }

  function handleMouseOut(e) {
    var card = e.target && e.target.closest ? e.target.closest('.ws-listing-card') : null;
    if (!card) return;
    var related = e.relatedTarget;
    // 같은 카드 또는 popup 안으로 이동하면 유지
    if (related && related.closest) {
      if (related.closest('.ws-listing-card') === card) return;
      if (related.closest('.ws-v404-hover-popup')) return;
    }
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    // popup 이 있으면 약간 delay 후 제거 (popup 으로 이동할 시간 줌)
    setTimeout(function () {
      if (!currentPopup) return;
      // 마우스가 popup 안에 있는지 확인
      var isOverPopup = false;
      try { isOverPopup = currentPopup.matches(':hover'); } catch (_) {}
      if (!isOverPopup) removePopup();
    }, 100);
  }

  function handleScroll() {
    removePopup();
  }

  // [Step 120 fix 2026-05-19 사장님 명령] 근본 fix — document capture 제거
  //   기존: document.addEventListener('mouseover', ..., true) — 매 마우스 이동 fire
  //         × 매 카드 이동 시 closest() DOM walk → main thread 점유
  //   수정: 카드 element 에 직접 mouseenter/mouseleave attach (delegation 제거)
  //         새 카드가 render 될 때마다 attach. MutationObserver 로 신규 카드 감지.
  function _attachCardListeners(card) {
    if (!card || card.dataset.v404Bound) return;
    card.dataset.v404Bound = '1';
    card.addEventListener('mouseenter', function () {
      var id = card.getAttribute('data-listing-id');
      if (!id) return;
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () {
        if (!card.matches(':hover')) return;
        var listing = getListingForCard(card);
        if (listing) {
          showPopup(card, listing);
        } else if (window.WS && typeof window.WS.fetchListingById === 'function') {
          if (!fetchCache[id]) {
            fetchCache[id] = window.WS.fetchListingById(id);
          }
          fetchCache[id].then(function (l) {
            if (l && card.matches(':hover')) showPopup(card, l);
          }).catch(function () {
            try { delete fetchCache[id]; } catch (_) {}
          });
        }
      }, HOVER_DELAY);
    });
    card.addEventListener('mouseleave', function (e) {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      var related = e.relatedTarget;
      if (related && related.closest) {
        if (related.closest('.ws-v404-hover-popup')) return;
      }
      setTimeout(function () {
        if (!currentPopup) return;
        try { if (currentPopup.matches(':hover')) return; } catch (_) {}
        removePopup();
      }, 100);
    });
  }
  function _attachAllCards() {
    var cards = document.querySelectorAll('.ws-listing-card');
    for (var i = 0; i < cards.length; i++) _attachCardListeners(cards[i]);
  }
  _attachAllCards();
  // [Step 121 fix 2026-05-19 사장님 명령] MO callback 안 strict 검사
  //   기존: body subtree 매 DOM 변경 fire → 카드 select 변경, hover state 등 매번
  //   수정: addedNodes 안에 ws-listing-card 추가 케이스만 trigger
  try {
    var __v404_mot = null;
    var moNew = new MutationObserver(function (mutations) {
      var hasNewCard = false;
      for (var i = 0; i < mutations.length && !hasNewCard; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if ((n.classList && n.classList.contains('ws-listing-card')) ||
              (n.querySelector && n.querySelector('.ws-listing-card'))) {
            hasNewCard = true;
            break;
          }
        }
      }
      if (!hasNewCard) return;
      if (__v404_mot) return;
      __v404_mot = setTimeout(function () { __v404_mot = null; _attachAllCards(); }, 300);
    });
    moNew.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}
  window.addEventListener('scroll', handleScroll, { passive: true });

  try { console.log('[v404-card-hover] installed (desktop only, popup 280px)'); } catch (_) {}
})();
