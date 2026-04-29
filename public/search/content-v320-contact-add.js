// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// content-v320-contact-add.js (2026-04-29 사장님 명령)
//
// 목적: v240 매물 상세 모달의 [+ 추가] 버튼 (data-v240-add-contact) 클릭 시
//       연락처 추가 form 표시 + window.WS.state.contacts 저장.
//
// 안전 장치 (v318/v319 revert 후 검증판):
//   1. 'use strict' + IIFE — 외부 스코프 오염 0
//   2. window.__v320 가드 — 중복 로드 방지
//   3. try/catch 모든 분기 — 어떤 에러도 다른 script 영향 X
//   4. ev.stopPropagation 사용 X — 다른 핸들러 영향 0
//   5. capture phase 사용 X — bubble phase delegate
//   6. DOMContentLoaded 또는 즉시 초기화 (페이지 로딩 차단 X)
//   7. MutationObserver subtree — 모달 새로 렌더되면 자동 bind
//   8. data-v320-bound 마커 — 중복 bind 방지
//   9. form 모달 = content.js 검증된 디자인 (사장님 본 화면 그대로)
//  10. 모든 DOM 추가는 click 시점 (페이지 로드 시 추가 0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function () {
  'use strict';
  var TAG = '[v320-contact-add]';
  try {
    if (window.__v320ContactAdd) return;
    window.__v320ContactAdd = true;
  } catch (e) { return; }

  var ROLE_PRESETS = ['사장','사모','관리인','가족','임차인','매도자','매수자','세입자','기타'];

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function showToast(msg) {
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;top:24px;transform:translateX(-50%);background:#2D5A27;color:#fff;padding:10px 20px;border-radius:24px;font-size:13px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.2);pointer-events:none;';
      document.body.appendChild(t);
      setTimeout(function () { try { t.remove(); } catch (e) {} }, 2200);
    } catch (e) {}
  }

  function refreshDetail(lid) {
    try {
      if (!window.WS || typeof window.WS.showDetail !== 'function') return;
      var cur = window.__currentListing;
      if (cur && String(cur.id) === String(lid)) {
        window.WS.showDetail(cur);
        return;
      }
      if (window.WS.state && window.WS.state.listings) {
        for (var i = 0; i < window.WS.state.listings.length; i++) {
          var l = window.WS.state.listings[i];
          if (l && String(l.id) === String(lid)) {
            window.WS.showDetail(l);
            return;
          }
        }
      }
    } catch (e) {}
  }

  function showContactForm(lid) {
    try {
      var c = { role: '', name: '', phone: '', memo: '' };
      var backdrop = document.createElement('div');
      backdrop.setAttribute('data-v320-modal', '1');
      backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
      backdrop.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:24px;width:360px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
        '<h4 style="margin:0 0 16px;font-size:16px;color:#2D5A27;">📞 연락처 추가</h4>' +
        '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">호명 (역할)</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;" data-v320="presets"></div>' +
        '<input type="text" data-v320="role" value="' + escHtml(c.role) + '" placeholder="직접 입력 또는 위에서 선택" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;color-scheme:light;"></div>' +
        '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">이름</label>' +
        '<input type="text" data-v320="name" value="' + escHtml(c.name) + '" placeholder="예: 홍길동" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;color-scheme:light;"></div>' +
        '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">전화번호</label>' +
        '<input type="tel" data-v320="phone" value="' + escHtml(c.phone) + '" placeholder="010-1234-5678" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;color-scheme:light;"></div>' +
        '<div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">메모 (선택)</label>' +
        '<input type="text" data-v320="memo" value="' + escHtml(c.memo) + '" placeholder="예: 오후 2시 이후 통화가능" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;color-scheme:light;"></div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" data-v320="cancel" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#666;">취소</button>' +
        '<button type="button" data-v320="save" style="flex:1;padding:10px;border:none;border-radius:8px;background:#2D5A27;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">추가</button>' +
        '</div></div>';
      document.body.appendChild(backdrop);

      var presetsDiv = backdrop.querySelector('[data-v320="presets"]');
      var roleInput = backdrop.querySelector('[data-v320="role"]');
      ROLE_PRESETS.forEach(function (role) {
        try {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = role;
          btn.style.cssText = 'padding:3px 10px;border:1px solid #ccc;border-radius:12px;background:#f5f5f5;color:#333;font-size:11px;cursor:pointer;font-weight:500;';
          btn.addEventListener('click', function () {
            try {
              roleInput.value = role;
              presetsDiv.querySelectorAll('button').forEach(function (b) {
                b.style.background = '#f5f5f5'; b.style.color = '#333';
              });
              btn.style.background = '#2D5A27'; btn.style.color = '#fff';
            } catch (e) {}
          });
          presetsDiv.appendChild(btn);
        } catch (e) {}
      });

      function close() { try { backdrop.remove(); } catch (e) {} }

      backdrop.querySelector('[data-v320="cancel"]').addEventListener('click', close);
      backdrop.addEventListener('click', function (e) {
        try { if (e.target === backdrop) close(); } catch (_) {}
      });

      backdrop.querySelector('[data-v320="save"]').addEventListener('click', function () {
        try {
          var role = roleInput.value.trim();
          var name = backdrop.querySelector('[data-v320="name"]').value.trim();
          var phone = backdrop.querySelector('[data-v320="phone"]').value.trim();
          var memo = backdrop.querySelector('[data-v320="memo"]').value.trim();
          if (!role) { roleInput.style.borderColor = '#D32F2F'; roleInput.focus(); return; }
          if (!phone) {
            var ph = backdrop.querySelector('[data-v320="phone"]');
            ph.style.borderColor = '#D32F2F'; ph.focus(); return;
          }
          if (!window.WS) window.WS = {};
          if (!window.WS.state) window.WS.state = {};
          if (!window.WS.state.contacts) window.WS.state.contacts = {};
          if (!window.WS.state.contacts[lid]) window.WS.state.contacts[lid] = [];
          window.WS.state.contacts[lid].push({ role: role, name: name, phone: phone, memo: memo });
          safeSet('ws-contacts', JSON.stringify(window.WS.state.contacts));
          close();
          showToast('연락처가 추가되었습니다.');
          refreshDetail(lid);
        } catch (e) {
          try { console.error(TAG, 'save fail', e); } catch (_) {}
          try { alert('저장 실패'); } catch (_) {}
        }
      });
    } catch (e) {
      try { console.error(TAG, 'showContactForm fail', e); } catch (_) {}
    }
  }

  function bindButton(btn) {
    try {
      if (!btn || btn.dataset.v320Bound === '1') return;
      btn.dataset.v320Bound = '1';
      btn.addEventListener('click', function (ev) {
        try {
          ev.preventDefault();
          // stopPropagation 사용 X — 다른 핸들러 영향 0
          var lid = btn.getAttribute('data-v240-add-contact');
          if (!lid) return;
          showContactForm(String(lid));
        } catch (e) {}
      });
    } catch (e) {}
  }

  function bindExisting() {
    try {
      var btns = document.querySelectorAll('[data-v240-add-contact]');
      for (var i = 0; i < btns.length; i++) bindButton(btns[i]);
    } catch (e) {}
  }

  function startObserver() {
    try {
      if (typeof MutationObserver === 'undefined') return;
      var observer = new MutationObserver(function (mutations) {
        try {
          for (var i = 0; i < mutations.length; i++) {
            var m = mutations[i];
            for (var j = 0; j < m.addedNodes.length; j++) {
              var node = m.addedNodes[j];
              if (!node || node.nodeType !== 1) continue;
              try {
                if (node.matches && node.matches('[data-v240-add-contact]')) {
                  bindButton(node);
                }
                if (node.querySelectorAll) {
                  var inner = node.querySelectorAll('[data-v240-add-contact]');
                  for (var k = 0; k < inner.length; k++) bindButton(inner[k]);
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  function init() {
    try {
      bindExisting();
      startObserver();
      try { console.log(TAG, 'loaded — v240 [+ 추가] 핸들러 안전 attach'); } catch (e) {}
    } catch (e) {
      try { console.error(TAG, 'init fail', e); } catch (_) {}
    }
  }

  // DOMContentLoaded 또는 즉시
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (e) {}
})();
