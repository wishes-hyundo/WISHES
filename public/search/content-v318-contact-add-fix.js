// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// content-v318-contact-add-fix.js (2026-04-29 사장님 명령)
//
// 버그: v240 매물 상세 모달의 [+ 추가] 버튼 (data-v240-add-contact) 에
//       클릭 핸들러가 어떤 JS 에도 등록 안 됨 → 클릭 동작 0.
//
// 원인:
//   - content.js 의 showContactForm 핸들러는 옛날 모달 (id='ws-contact-add-${id}')
//     에 바인딩 — IIFE scope 안이라 외부 노출 X.
//   - v240 모달이 새 selector (data-v240-add-contact) 를 쓰는데 핸들러 누락.
//
// Fix (UI 안 건드림):
//   - document.click delegate 로 [data-v240-add-contact] 처리
//   - 기존 form UI 그대로 복사 (사장님 검증된 디자인)
//   - 저장 시 window.WS.state.contacts push + localStorage 저장 + WS.showDetail 갱신
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function () {
  'use strict';
  var TAG = '[v318-contact-add]';
  if (window.__v318ContactAdd) {
    try { console.log(TAG, 'already loaded'); } catch (e) {}
    return;
  }
  window.__v318ContactAdd = true;

  var ROLE_PRESETS = ['사장','사모','관리인','가족','임차인','매도자','매수자','세입자','기타'];
  var ROLE_COLORS = {
    '사장': '#D32F2F', '사모': '#C2185B', '관리인': '#1976D2',
    '가족': '#F57C00', '임차인': '#388E3C', '매도자': '#7B1FA2',
    '매수자': '#0097A7', '세입자': '#5D4037', '기타': '#616161'
  };

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeSetItem(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function showToast(msg) {
    try {
      if (window.WS && typeof window.WS.showToast === 'function') {
        window.WS.showToast(msg);
        return;
      }
    } catch (e) {}
    // 폴백: 간단 토스트
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;top:24px;transform:translateX(-50%);background:#2D5A27;color:#fff;padding:10px 20px;border-radius:24px;font-size:13px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  function refreshDetail(listingId) {
    try {
      if (window.WS && typeof window.WS.showDetail === 'function') {
        // v240 가 사용하는 currentListing 우선
        var cur = window.__currentListing;
        if (cur && String(cur.id) === String(listingId)) {
          window.WS.showDetail(cur);
          return;
        }
        // listings 배열에서 찾기
        if (window.WS.state && window.WS.state.listings) {
          var found = window.WS.state.listings.find(function (l) {
            return String(l.id) === String(listingId);
          });
          if (found) { window.WS.showDetail(found); return; }
        }
      }
    } catch (e) {}
    // 폴백: 모달 자체에서 contacts 영역만 페이지 reload — 마지막 수단
    try { location.reload(); } catch (e) {}
  }

  /**
   * 연락처 추가/수정 모달 — content.js 의 showContactForm 과 동일 UI
   * @param {string} lid listing id
   * @param {object|null} existingContact 수정 모드면 기존 contact, null 이면 추가
   * @param {number|null} editIdx 수정 모드면 인덱스
   */
  function showContactForm(lid, existingContact, editIdx) {
    var isEdit = existingContact != null;
    var c = existingContact || { role: '', name: '', phone: '', memo: '' };
    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
    backdrop.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:24px;width:360px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
      '<h4 style="margin:0 0 16px;font-size:16px;color:#2D5A27;">' + (isEdit ? '✏️ 연락처 수정' : '📞 연락처 추가') + '</h4>' +
      '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">호명 (역할)</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;" id="v318-cf-presets"></div>' +
      '<input type="text" id="v318-cf-role" value="' + escHtml(c.role) + '" placeholder="직접 입력 또는 위에서 선택" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
      '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">이름</label>' +
      '<input type="text" id="v318-cf-name" value="' + escHtml(c.name) + '" placeholder="예: 홍길동" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
      '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">전화번호</label>' +
      '<input type="tel" id="v318-cf-phone" value="' + escHtml(c.phone) + '" placeholder="010-1234-5678" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
      '<div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">메모 (선택)</label>' +
      '<input type="text" id="v318-cf-memo" value="' + escHtml(c.memo) + '" placeholder="예: 오후 2시 이후 통화가능, 주말 불가" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="v318-cf-cancel" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#666;">취소</button>' +
      '<button id="v318-cf-save" style="flex:1;padding:10px;border:none;border-radius:8px;background:#2D5A27;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">' + (isEdit ? '수정' : '추가') + '</button>' +
      '</div></div>';
    document.body.appendChild(backdrop);

    var presetsDiv = backdrop.querySelector('#v318-cf-presets');
    var roleInput = backdrop.querySelector('#v318-cf-role');
    ROLE_PRESETS.forEach(function (role) {
      var btn = document.createElement('button');
      btn.textContent = role;
      btn.style.cssText = 'padding:3px 10px;border:1px solid #ccc;border-radius:12px;background:' + (c.role === role ? '#2D5A27' : '#f5f5f5') + ';color:' + (c.role === role ? '#fff' : '#333') + ';font-size:11px;cursor:pointer;font-weight:500;';
      btn.addEventListener('click', function () {
        roleInput.value = role;
        presetsDiv.querySelectorAll('button').forEach(function (b) { b.style.background = '#f5f5f5'; b.style.color = '#333'; });
        btn.style.background = '#2D5A27'; btn.style.color = '#fff';
      });
      presetsDiv.appendChild(btn);
    });

    backdrop.querySelector('#v318-cf-cancel').addEventListener('click', function () { backdrop.remove(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });

    backdrop.querySelector('#v318-cf-save').addEventListener('click', function () {
      var role = roleInput.value.trim();
      var name = backdrop.querySelector('#v318-cf-name').value.trim();
      var phone = backdrop.querySelector('#v318-cf-phone').value.trim();
      var memo = backdrop.querySelector('#v318-cf-memo').value.trim();
      if (!role) { roleInput.style.borderColor = '#D32F2F'; roleInput.focus(); return; }
      if (!phone) { backdrop.querySelector('#v318-cf-phone').style.borderColor = '#D32F2F'; backdrop.querySelector('#v318-cf-phone').focus(); return; }

      try {
        if (!window.WS || !window.WS.state) {
          alert('WS state 가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
          return;
        }
        if (!window.WS.state.contacts) window.WS.state.contacts = {};
        if (!window.WS.state.contacts[lid]) window.WS.state.contacts[lid] = [];
        var entry = { role: role, name: name, phone: phone, memo: memo };
        if (isEdit && editIdx != null) {
          window.WS.state.contacts[lid][editIdx] = entry;
        } else {
          window.WS.state.contacts[lid].push(entry);
        }
        safeSetItem('ws-contacts', JSON.stringify(window.WS.state.contacts));
        backdrop.remove();
        showToast(isEdit ? '연락처가 수정되었습니다.' : '연락처가 추가되었습니다.');
        refreshDetail(lid);
      } catch (e) {
        try { console.error(TAG, 'save fail', e); } catch (_) {}
        alert('저장 실패: ' + (e && e.message ? e.message : 'unknown'));
      }
    });
  }

  // ─────────────────────────────────────────────
  // [+ 추가] 클릭 delegate (capture phase — 다른 핸들러 보다 먼저)
  // ─────────────────────────────────────────────
  document.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!target || !target.closest) return;

    // [+ 추가] 버튼
    var addBtn = target.closest('[data-v240-add-contact]');
    if (addBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      var lid = addBtn.getAttribute('data-v240-add-contact');
      if (!lid) return;
      showContactForm(String(lid), null, null);
      return;
    }
  }, true);

  try { console.log(TAG, 'loaded — v240 모달 [+ 추가] 핸들러 등록 완료'); } catch (e) {}
})();
