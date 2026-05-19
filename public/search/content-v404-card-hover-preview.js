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

  // [Step 107 fix] 500→300ms 응답성 향상
  var HOVER_DELAY = 300;
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
    // [Step 107 fix] 실제 popup height 측정 (hardcode 280 제거)
    var popupH = 280;
    try {
      var prevDisplay = popup.style.display;
      popup.style.visibility = 'hidden';
      popup.style.display = 'block';
      popupH = popup.getBoundingClientRect().height || 280;
      popup.style.visibility = '';
      if (prevDisplay) popup.style.display = prevDisplay;
    } catch (_) {}
    var top = Math.max(8, Math.min(rect.top, window.innerHeight - popupH - 8));
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

  // [Step 107 fix 2026-05-19 사장님 명령] popup 재사용 + 동적 위치
  //   기존: 매번 새 popup 생성 → opacity transition 매번 재시작 → 깜빡임
  //   수정: popup instance 재사용. innerHTML + position 만 갱신.
  function showPopup(card, listing) {
    if (!currentPopup) {
      currentPopup = document.createElement('div');
      currentPopup.className = 'ws-v404-hover-popup';
      currentPopup.style.cssText = [
        'position:fixed',
        'z-index:99999',
        'background:#fff',
        'border:1px solid #e2e2e2',
        'border-radius:10px',
        'box-shadow:0 8px 24px rgba(0,0,0,0.12)',
        'padding:10px',
        'width:' + POPUP_WIDTH + 'px',
        'font-family:inherit',
        'pointer-events:auto',
        'transition:opacity 0.15s',
        'opacity:1'
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
        // fetch + retry
        if (!fetchCache[id]) {
          fetchCache[id] = window.WS.fetchListingById(id);
        }
        fetchCache[id].then(function (l) {
          if (l && card.matches(':hover')) {
            showPopup(card, l);
          }
        }).catch(function () {
          // [Step 107 fix] fetch 실패 시 cache 제거 (다음 hover 에 재시도)
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
    // [Step 107 fix] popup 내부 hover 중이면 닫지 않음
    if (currentPopup) {
      try { if (currentPopup.matches(':hover')) return; } catch (_) {}
    }
    removePopup();
  }

  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  window.addEventListener('scroll', handleScroll, { passive: true, capture: true });

  try { console.log('[v404-card-hover] installed (desktop only, popup 280px)'); } catch (_) {}
})();
