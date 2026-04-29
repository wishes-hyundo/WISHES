// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// content-v323-contact-edit-del.js (2026-04-29 사장님 명령)
//
// 목적: v270 / v322 가 렌더한 .v270-ct-row 에 [수정][삭제] 버튼 자동 추가.
//
// 배경:
//   - v240 모달은 [+ 추가] 버튼만 있고 수정/삭제 X.
//   - v270/v322 가 contacts 렌더 시 [복사] 버튼만 추가.
//   - 옛날 content.js 의 .ws-contact-edit-btn / .ws-contact-del-btn 핸들러는
//     선택자가 다른 옛날 모달용이라 v240 에서 작동 X.
//   - 결과: 사장님이 잘못 등록해도 직접 삭제 불가 (DB 직접 수정 필요했음).
//
// v323 — 외과적 fix (UI 변화: row 끝에 작은 [수정][삭제] 버튼 추가):
//   1. MutationObserver 로 .v270-ct-row 감지
//   2. row 마다 [수정] [삭제] 버튼 자동 attach (data-v323-bound 마커)
//   3. row 부모 .v270-contacts 의 listing id 추출 (data-listing-id 또는 currentListing)
//   4. row 인덱스 = parent 안 row 의 위치
//   5. 클릭:
//      - 수정: v320 form 모달 재사용 (호명/이름/전화/메모) → PUT 전체 contacts 배열
//      - 삭제: confirm → 그 인덱스만 제거 → PUT 전체 contacts 배열
//   6. PUT 성공 후 currentListing.contacts 동기화 + WS.showDetail
//
// 안전 장치:
//   - try/catch 모든 분기
//   - 'use strict' + IIFE + window.__v323 가드
//   - capture phase 사용 X / stopPropagation X
//   - DB sync 실패 시 alert + 버튼 복구
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function () {
  'use strict';
  var TAG = '[v323-contact-edit-del]';
  try {
    if (window.__v323ContactEditDel) return;
    window.__v323ContactEditDel = true;
  } catch (e) { return; }

  var ROLE_PRESETS = ['사장','사모','관리인','가족','임차인','매도자','매수자','세입자','기타'];

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    } catch (e) {}
  }

  function findListingId(rowOrParent) {
    try {
      var p = rowOrParent;
      while (p && p !== document.body) {
        if (p.getAttribute) {
          var lid = p.getAttribute('data-listing-id') || p.getAttribute('data-v240-add-contact');
          if (lid) return String(lid);
        }
        p = p.parentNode;
      }
    } catch (e) {}
    try {
      var btn = document.querySelector('[data-v240-add-contact]');
      if (btn) return String(btn.getAttribute('data-v240-add-contact'));
    } catch (e) {}
    try {
      if (window.__currentListing && window.__currentListing.id) {
        return String(window.__currentListing.id);
      }
    } catch (e) {}
    return null;
  }

  // PUT 으로 contacts 배열 전체 update
  function putContacts(lid, contacts, onSuccess, onError) {
    fetch('/api/admin/listings', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <legacy>',
      },
      body: JSON.stringify({ id: Number(lid), contacts: contacts }),
    })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (err) {
            throw new Error(err && err.error ? err.error : ('HTTP ' + r.status));
          }).catch(function () { throw new Error('HTTP ' + r.status); });
        }
        return r.json();
      })
      .then(function () {
        try {
          if (window.__currentListing && String(window.__currentListing.id) === String(lid)) {
            window.__currentListing.contacts = contacts;
          }
        } catch (e) {}
        if (typeof onSuccess === 'function') onSuccess();
      })
      .catch(function (err) {
        try { console.error(TAG, 'putContacts fail', err); } catch (_) {}
        if (typeof onError === 'function') onError(err);
      });
  }

  // 수정 form 모달 (v320 디자인 재사용)
  function showEditForm(lid, idx, existingContact) {
    try {
      var c = existingContact || { role: '', name: '', phone: '', memo: '' };
      var backdrop = document.createElement('div');
      backdrop.setAttribute('data-v323-modal', '1');
      backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
      backdrop.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:24px;width:360px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
        '<h4 style="margin:0 0 16px;font-size:16px;color:#2D5A27;">✏️ 연락처 수정</h4>' +
        '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">호명 (역할)</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;" data-v323="presets"></div>' +
        '<input type="text" data-v323="role" value="' + escHtml(c.role) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;color-scheme:light;"></div>' +
        '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">이름</label>' +
        '<input type="text" data-v323="name" value="' + escHtml(c.name) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;color-scheme:light;"></div>' +
        '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">전화번호</label>' +
        '<input type="tel" data-v323="phone" value="' + escHtml(c.phone) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;color-scheme:light;"></div>' +
        '<div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">메모 (선택)</label>' +
        '<input type="text" data-v323="memo" value="' + escHtml(c.memo || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;color-scheme:light;"></div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" data-v323="cancel" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#666;">취소</button>' +
        '<button type="button" data-v323="save" style="flex:1;padding:10px;border:none;border-radius:8px;background:#2D5A27;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">수정</button>' +
        '</div></div>';
      document.body.appendChild(backdrop);

      var presetsDiv = backdrop.querySelector('[data-v323="presets"]');
      var roleInput = backdrop.querySelector('[data-v323="role"]');
      ROLE_PRESETS.forEach(function (role) {
        try {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = role;
          var active = c.role === role;
          btn.style.cssText = 'padding:3px 10px;border:1px solid #ccc;border-radius:12px;background:' + (active ? '#2D5A27' : '#f5f5f5') + ';color:' + (active ? '#fff' : '#333') + ';font-size:11px;cursor:pointer;font-weight:500;';
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

      backdrop.querySelector('[data-v323="cancel"]').addEventListener('click', close);
      backdrop.addEventListener('click', function (e) {
        try { if (e.target === backdrop) close(); } catch (_) {}
      });

      var saveBtn = backdrop.querySelector('[data-v323="save"]');
      saveBtn.addEventListener('click', function () {
        try {
          var role = roleInput.value.trim();
          var name = backdrop.querySelector('[data-v323="name"]').value.trim();
          var phone = backdrop.querySelector('[data-v323="phone"]').value.trim();
          var memo = backdrop.querySelector('[data-v323="memo"]').value.trim();
          if (!role) { roleInput.style.borderColor = '#D32F2F'; roleInput.focus(); return; }
          if (!phone) {
            var ph = backdrop.querySelector('[data-v323="phone"]');
            ph.style.borderColor = '#D32F2F'; ph.focus(); return;
          }
          var origText = saveBtn.textContent;
          saveBtn.disabled = true;
          saveBtn.textContent = '저장 중...';

          // 현재 contacts fetch → idx 위치만 갈아치워서 PUT
          fetch('/api/admin/listings/' + encodeURIComponent(lid), {
            credentials: 'include',
            headers: { 'Authorization': 'Bearer <legacy>' },
            cache: 'no-cache',
          })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) {
              var existing = [];
              try {
                var row = j && (j.listing || j.data || j);
                if (row && Array.isArray(row.contacts)) existing = row.contacts.slice();
              } catch (e) {}
              if (idx < 0 || idx >= existing.length) {
                throw new Error('인덱스 오류 (idx=' + idx + ', length=' + existing.length + ')');
              }
              existing[idx] = { role: role, name: name, phone: phone, memo: memo };
              putContacts(lid, existing, function () {
                close();
                showToast('연락처가 수정되었습니다.');
                refreshDetail(lid);
              }, function (err) {
                saveBtn.disabled = false;
                saveBtn.textContent = origText;
                alert('수정 실패: ' + (err && err.message ? err.message : ''));
              });
            })
            .catch(function (err) {
              saveBtn.disabled = false;
              saveBtn.textContent = origText;
              alert('수정 실패: ' + (err && err.message ? err.message : ''));
            });
        } catch (e) {
          try { console.error(TAG, 'edit fail', e); } catch (_) {}
          alert('수정 실패');
        }
      });
    } catch (e) {
      try { console.error(TAG, 'showEditForm fail', e); } catch (_) {}
    }
  }

  // 삭제 핸들러
  function deleteContact(lid, idx) {
    if (!confirm('이 연락처를 삭제하시겠습니까?')) return;
    fetch('/api/admin/listings/' + encodeURIComponent(lid), {
      credentials: 'include',
      headers: { 'Authorization': 'Bearer <legacy>' },
      cache: 'no-cache',
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var existing = [];
        try {
          var row = j && (j.listing || j.data || j);
          if (row && Array.isArray(row.contacts)) existing = row.contacts.slice();
        } catch (e) {}
        if (idx < 0 || idx >= existing.length) {
          alert('인덱스 오류');
          return;
        }
        existing.splice(idx, 1);
        putContacts(lid, existing, function () {
          showToast('연락처가 삭제되었습니다.');
          refreshDetail(lid);
        }, function (err) {
          alert('삭제 실패: ' + (err && err.message ? err.message : ''));
        });
      })
      .catch(function (err) {
        alert('삭제 실패: ' + (err && err.message ? err.message : ''));
      });
  }

  // .v270-ct-row 에 [수정][삭제] 버튼 추가
  function bindRow(row, idx, lid) {
    try {
      if (!row || row.dataset.v323Bound === '1') return;
      row.dataset.v323Bound = '1';

      // 이미 [복사] 버튼이 있음 — 그 다음에 [수정][삭제] 추가
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = '✏️';
      editBtn.title = '수정';
      editBtn.style.cssText = 'margin-left:4px;padding:2px 6px;background:none;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:11px;color:#666;';
      editBtn.addEventListener('click', function () {
        // 현재 row 의 데이터 추출 (DOM 에서)
        var roleEl = row.querySelector('.v270-ct-role');
        var phoneEl = row.querySelector('.v270-ct-phone');
        var c = {
          role: roleEl ? roleEl.textContent.trim() : '',
          name: '',
          phone: phoneEl ? phoneEl.textContent.trim() : '',
          memo: '',
        };
        // 더 정확한 데이터는 currentListing.contacts[idx]
        try {
          if (window.__currentListing && Array.isArray(window.__currentListing.contacts)) {
            var stored = window.__currentListing.contacts[idx];
            if (stored) c = stored;
          }
        } catch (e) {}
        showEditForm(lid, idx, c);
      });
      row.appendChild(editBtn);

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '🗑';
      delBtn.title = '삭제';
      delBtn.style.cssText = 'margin-left:4px;padding:2px 6px;background:none;border:1px solid #ffcdd2;border-radius:4px;cursor:pointer;font-size:11px;color:#D32F2F;';
      delBtn.addEventListener('click', function () {
        deleteContact(lid, idx);
      });
      row.appendChild(delBtn);
    } catch (e) {
      try { console.error(TAG, 'bindRow fail', e); } catch (_) {}
    }
  }

  function bindAll() {
    try {
      var containers = document.querySelectorAll('.v270-contacts');
      for (var c = 0; c < containers.length; c++) {
        var rows = containers[c].querySelectorAll('.v270-ct-row');
        var lid = findListingId(containers[c]);
        if (!lid) continue;
        for (var i = 0; i < rows.length; i++) {
          bindRow(rows[i], i, lid);
        }
      }
    } catch (e) {}
  }

  function startObserver() {
    try {
      if (typeof MutationObserver === 'undefined') return;
      var observer = new MutationObserver(function () {
        // delay 0.7초 (v270/v322 렌더 후)
        setTimeout(bindAll, 700);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  function init() {
    try {
      bindAll();
      startObserver();
      try { console.log(TAG, 'loaded — contacts [수정][삭제] 버튼 자동 attach'); } catch (e) {}
    } catch (e) {}
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (e) {}
})();
