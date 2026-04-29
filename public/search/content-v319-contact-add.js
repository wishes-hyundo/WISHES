// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// content-v319-contact-add.js (2026-04-29 사장님 명령 — UI 영향 0 검증판)
//
// 버그: v240 매물 상세 모달의 [+ 추가] 버튼 (data-v240-add-contact) 클릭 시 동작 X.
//
// v318 revert 원인 추정:
//   - document.click capture phase + ev.stopPropagation() → 다른 클릭 핸들러 영향 가능
//
// v319 — 더 안전한 방식 (외과적 attach):
//   1. MutationObserver 로 [data-v240-add-contact] 버튼 DOM 추가 시점 감지
//   2. 해당 버튼 element 에만 직접 click listener 추가 (delegation X)
//   3. document.click capture 사용 X
//   4. ev.stopPropagation 사용 X — 다른 핸들러 영향 0
//   5. 이미 bound 된 버튼은 재바인딩 X (data-v319-bound)
//   6. window.WS / showContactForm 의존성 최소화 — 자체 form UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function () {
  'use strict';
  var TAG = '[v319-contact-add]';
  if (window.__v319ContactAdd) return;
  window.__v319ContactAdd = true;

  var ROLE_PRESETS = ['사장','사모','관리인','가족','임차인','매도자','매수자','세입자','기타'];

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
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;top:24px;transform:translateX(-50%);background:#2D5A27;color:#fff;padding:10px 20px;border-radius:24px;font-size:13px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.2);pointer-events:none;';
    document.body.appendChild(t);
    setTimeout(function () { try { t.remove(); } catch (e) {} }, 2200);
  }

  function refreshDetail(listingId) {
    try {
      if (window.WS && typeof window.WS.showDetail === 'function') {
        var cur = window.__currentListing;
        if (cur && String(cur.id) === String(listingId)) {
          window.WS.showDetail(cur);
          return;
        }
        if (window.WS.state && window.WS.state.listings) {
          var found = window.WS.state.listings.find(function (l) {
            return String(l.id) === String(listingId);
          });
          if (found) { window.WS.showDetail(found); return; }
        }
      }
    } catch (e) {}
  }

  // 연락처 추가 form 모달 — content.js 와 동일 UI (사장님 검증된 디자인)
  function showContactForm(lid) {
    var c = { role: '', name: '', phone: '', memo: '' };
    var backdrop = document.createElement('div');
    backdrop.setAttribute('data-v319-modal', '1');
    backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
    backdrop.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:24px;width:360px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
      '<h4 style="margin:0 0 16px;font-size:16px;color:#2D5A27;">📞 연락처 추가</h4>' +
      '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">호명 (역할)</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;" data-v319="presets"></div>' +
      '<input type="text" data-v319="role" value="' + escHtml(c.role) + '" placeholder="직접 입력 또는 위에서 선택" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
      '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">이름</label>' +
      '<input type="text" data-v319="name" value="' + escHtml(c.name) + '" placeholder="예: 홍길동" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
      '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">전화번호</label>' +
      '<input type="tel" data-v319="phone" value="' + escHtml(c.phone) + '" placeholder="010-1234-5678" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
      '<div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">메모 (선택)</label>' +
      '<input type="text" data-v319="memo" value="' + escHtml(c.memo) + '" placeholder="예: 오후 2시 이후 통화가능" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button type="button" data-v319="cancel" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#666;">취소</button>' +
      '<button type="button" data-v319="save" style="flex:1;padding:10px;border:none;border-radius:8px;background:#2D5A27;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">추가</button>' +
      '</div></div>';
    document.body.appendChild(backdrop);

    var presetsDiv = backdrop.querySelector('[data-v319="presets"]');
    var roleInput = backdrop.querySelector('[data-v319="role"]');
    ROLE_PRESETS.forEach(function (role) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = role;
      btn.style.cssText = 'padding:3px 10px;border:1px solid #ccc;border-radius:12px;background:#f5f5f5;color:#333;font-size:11px;cursor:pointer;font-weight:500;';
      btn.addEventListener('click', function () {
        roleInput.value = role;
        presetsDiv.querySelectorAll('button').forEach(function (b) { b.style.background = '#f5f5f5'; b.style.color = '#333'; });
        btn.style.background = '#2D5A27'; btn.style.color = '#fff';
      });
      presetsDiv.appendChild(btn);
    });

    function close() { try { backdrop.remove(); } catch (e) {} }

    backdrop.querySelector('[data-v319="cancel"]').addEventListener('click', close);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

    backdrop.querySelector('[data-v319="save"]').addEventListener('click', function () {
      var role = roleInput.value.trim();
      var name = backdrop.querySelector('[data-v319="name"]').value.trim();
      var phone = backdrop.querySelector('[data-v319="phone"]').value.trim();
      var memo = backdrop.querySelector('[data-v319="memo"]').value.trim();
      if (!role) { roleInput.style.borderColor = '#D32F2F'; roleInput.focus(); return; }
      if (!phone) {
        var ph = backdrop.querySelector('[data-v319="phone"]');
        ph.style.borderColor = '#D32F2F'; ph.focus(); return;
      }

      try {
        if (!window.WS) window.WS = {};
        if (!window.WS.state) window.WS.state = {};
        if (!window.WS.state.contacts) window.WS.state.contacts = {};
        if (!window.WS.state.contacts[lid]) window.WS.state.contacts[lid] = [];
        window.WS.state.contacts[lid].push({ role: role, name: name, phone: phone, memo: memo });
        safeSetItem('ws-contacts', JSON.stringify(window.WS.state.contacts));
        close();
        showToast('연락처가 추가되었습니다.');
        refreshDetail(lid);
      } catch (e) {
        try { console.error(TAG, 'save fail', e); } catch (_) {}
        alert('저장 실패: ' + (e && e.message ? e.message : 'unknown'));
      }
    });
  }

  // 버튼 element 에 직접 click listener 추가 (delegation X)
  function bindButton(btn) {
    if (!btn || btn.dataset.v319Bound === '1') return;
    btn.dataset.v319Bound = '1';
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      // stopPropagation 사용 X — 다른 핸들러 영향 0
      var lid = btn.getAttribute('data-v240-add-contact');
      if (!lid) return;
      showContactForm(String(lid));
    });
  }

  // 초기 1회 — 이미 DOM 에 있는 버튼들
  function bindExisting() {
    try {
      document.querySelectorAll('[data-v240-add-contact]').forEach(bindButton);
    } catch (e) {}
  }

  // MutationObserver — 새 버튼 추가 (모달 재 렌더) 시 자동 attach
  function startObserver() {
    if (typeof MutationObserver === 'undefined') return;
    try {
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (!node || node.nodeType !== 1) continue;
            // node 자체가 버튼인 경우
            if (node.matches && node.matches('[data-v240-add-contact]')) {
              bindButton(node);
            }
            // node 자손 중 버튼이 있는 경우
            if (node.querySelectorAll) {
              try {
                node.querySelectorAll('[data-v240-add-contact]').forEach(bindButton);
              } catch (e) {}
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      try { console.warn(TAG, 'observer fail', e); } catch (_) {}
    }
  }

  // DOMContentLoaded 또는 즉시
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindExisting();
      startObserver();
    });
  } else {
    bindExisting();
    startObserver();
  }

  try { console.log(TAG, 'loaded — MutationObserver 기반 안전 attach'); } catch (e) {}
})();
