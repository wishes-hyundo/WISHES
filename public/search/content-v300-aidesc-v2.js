// ──────────────────────────────────────────────────────────────────────
// content-v300-aidesc-v2.js — v2 AI 매물 설명 통합 (글로벌 SOTA RAG)
// 작성: 2026-04-27 v3 세션
//
// 동작:
//   1. window.WS._showEditModal (매물 수정 모달) wrapping
//   2. "상세설명" textarea 옆에 "✨ v2 AI 재생성" 버튼 inject
//   3. 클릭 → /api/admin/generate-description-v2 호출
//   4. 결과 미리보기 (모달) → "이 내용으로 채우기" / "다시 생성" / "취소"
//   5. 채우기 시 ws-edit-title + ws-edit-desc 자동 채움
//   6. 사용자가 "💾 저장" 클릭하면 cascade L-cascade1 자동으로 broker 표시
//
// 안전:
//   - 원본 _showEditModal 그대로 실행 후 추가만 (기존 동작 보존)
//   - 라우트 401 시 사용자 안내 (admin 인증 필요)
// ──────────────────────────────────────────────────────────────────────
(function() {
  'use strict';
  var ATTEMPTS = 0;
  var MAX_ATTEMPTS = 50;

  function tryInstall() {
    ATTEMPTS++;
    if (!window.WS || !window.WS._showEditModal) {
      if (ATTEMPTS < MAX_ATTEMPTS) return setTimeout(tryInstall, 200);
      console.warn('[v300-aidesc-v2] window.WS._showEditModal 없음, 설치 포기');
      return;
    }

    var originalShowEdit = window.WS._showEditModal;
    var INJECTED = false;

    window.WS._showEditModal = function(listing) {
      originalShowEdit(listing);
      // 모달이 DOM 에 추가되는 시간 대기
      setTimeout(function() { injectV2Button(listing); }, 50);
    };

    function getToken() {
      try {
        return localStorage.getItem('wishes_token') ||
               localStorage.getItem('token') ||
               sessionStorage.getItem('ws_token') ||
               '';
      } catch (e) { return ''; }
    }

    function injectV2Button(listing) {
      var modal = document.getElementById('ws-edit-modal');
      if (!modal) return;
      var existing = modal.querySelector('#ws-v2-aigen-btn');
      if (existing) return; // 이미 inject 됨

      var descTextarea = modal.querySelector('#ws-edit-desc');
      if (!descTextarea) return;

      var labelDiv = descTextarea.parentElement;
      if (!labelDiv) return;

      // 버튼 컨테이너 (label 옆)
      var btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:4px;margin-bottom:4px;';

      var btn = document.createElement('button');
      btn.id = 'ws-v2-aigen-btn';
      btn.type = 'button';
      btn.textContent = '✨ v2 AI 재생성';
      btn.title = '글로벌 SOTA RAG + 7개 페르소나 — 환각 0, 다양성 ↑';
      btn.style.cssText = 'padding:6px 14px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;';

      var hint = document.createElement('span');
      hint.textContent = 'RAG 검증된 사실만 사용 (환각 0)';
      hint.style.cssText = 'font-size:10px;color:#999;';

      btnContainer.appendChild(hint);
      btnContainer.appendChild(btn);

      // textarea 위에 삽입
      labelDiv.insertBefore(btnContainer, descTextarea);

      btn.addEventListener('click', function() { handleGenerate(listing, btn); });
    }

    function handleGenerate(listing, btn) {
      var origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ 생성 중... (5~15초)';
      btn.style.opacity = '0.6';

      var token = getToken();

      fetch('/api/admin/generate-description-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ listingId: listing.id })
      })
      .then(function(res) {
        return res.json().then(function(data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function(result) {
        if (!result.ok || !result.data.success) {
          var msg = result.data.error || '오류 ' + result.status;
          if (result.status === 401) {
            msg = '관리자 인증 만료. 다시 로그인하세요.';
          }
          alert('생성 실패: ' + msg);
          return;
        }
        showResultModal(listing, result.data, btn);
      })
      .catch(function(e) {
        alert('네트워크 오류: ' + e.message);
      })
      .finally(function() {
        btn.disabled = false;
        btn.textContent = origText;
        btn.style.opacity = '1';
      });
    }

    function showResultModal(listing, data, sourceBtn) {
      var old = document.getElementById('ws-v2-result-modal');
      if (old) old.remove();

      var modal = document.createElement('div');
      modal.id = 'ws-v2-result-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;';

      var verifyBadge = data.verify.passed
        ? '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">✅ 검증 통과</span>'
        : '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">⚠️ 검증 경고</span>';

      var verifyDetail = '';
      if (data.verify.title.reasons.length > 0) {
        verifyDetail += '<div style="font-size:11px;color:#991b1b;margin-top:4px;">제목: ' + data.verify.title.reasons.join(' / ') + '</div>';
      }
      if (data.verify.description.reasons.length > 0) {
        verifyDetail += '<div style="font-size:11px;color:#991b1b;margin-top:4px;">설명: ' + data.verify.description.reasons.join(' / ') + '</div>';
      }

      var keywordsHtml = (data.keywords || []).map(function(k) {
        return '<span style="font-size:11px;padding:2px 8px;background:#e0e7ff;color:#3730a3;border-radius:12px;">' + escHtml(k) + '</span>';
      }).join(' ');

      var tagsHtml = (data.tags || []).map(function(t) {
        return '<span style="font-size:11px;padding:2px 8px;background:#fef3c7;color:#92400e;border-radius:12px;">' + escHtml(t) + '</span>';
      }).join(' ');

      modal.innerHTML =
        '<div style="background:#fff;border-radius:12px;padding:20px;max-width:680px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<h3 style="margin:0;font-size:16px;font-weight:700;">✨ v2 AI 생성 결과</h3>' +
          '<button id="ws-v2-result-close" style="background:none;border:none;font-size:22px;color:#999;cursor:pointer;">✕</button>' +
        '</div>' +

        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:11px;color:#666;flex-wrap:wrap;">' +
          verifyBadge +
          '<span>스타일: <b>' + escHtml((data.style||{}).name||'-') + '</b></span>' +
          '<span>· 헤드라인 패턴: ' + escHtml(data.headline_pattern||'-') + '</span>' +
          '<span>· 모델: ' + escHtml(data.used_llm||'-') + '</span>' +
        '</div>' +

        '<div style="margin-bottom:12px;">' +
          '<div style="font-size:11px;color:#666;font-weight:600;margin-bottom:4px;">제목</div>' +
          '<div style="padding:10px;background:#f1f5f9;border-radius:6px;font-size:14px;font-weight:600;">' + escHtml(data.title||'') + '</div>' +
        '</div>' +

        '<div style="margin-bottom:12px;">' +
          '<div style="font-size:11px;color:#666;font-weight:600;margin-bottom:4px;">설명</div>' +
          '<div style="padding:10px;background:#f1f5f9;border-radius:6px;white-space:pre-wrap;font-size:13px;line-height:1.7;max-height:200px;overflow-y:auto;">' + escHtml(data.description||'') + '</div>' +
        '</div>' +

        '<div style="margin-bottom:12px;">' +
          '<div style="font-size:11px;color:#666;font-weight:600;margin-bottom:4px;">메타 설명 (검색엔진용)</div>' +
          '<div style="padding:8px;background:#f8fafc;border-radius:6px;font-size:12px;color:#475569;">' + escHtml(data.meta_description||'') + '</div>' +
        '</div>' +

        (keywordsHtml ? '<div style="margin-bottom:8px;"><div style="font-size:11px;color:#666;font-weight:600;margin-bottom:4px;">키워드</div><div style="display:flex;gap:4px;flex-wrap:wrap;">' + keywordsHtml + '</div></div>' : '') +
        (tagsHtml ? '<div style="margin-bottom:12px;"><div style="font-size:11px;color:#666;font-weight:600;margin-bottom:4px;">해시태그</div><div style="display:flex;gap:4px;flex-wrap:wrap;">' + tagsHtml + '</div></div>' : '') +

        verifyDetail +

        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;border-top:1px solid #e5e7eb;padding-top:12px;">' +
          '<button id="ws-v2-result-regen" style="padding:8px 16px;background:#94a3b8;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;">🔄 다시 생성</button>' +
          '<button id="ws-v2-result-cancel" style="padding:8px 16px;background:#e5e7eb;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">취소</button>' +
          '<button id="ws-v2-result-apply" style="padding:8px 20px;background:#10b981;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:700;">✅ 이 내용으로 채우기</button>' +
        '</div>' +
        '</div>';

      document.body.appendChild(modal);

      document.getElementById('ws-v2-result-close').addEventListener('click', function() { modal.remove(); });
      document.getElementById('ws-v2-result-cancel').addEventListener('click', function() { modal.remove(); });
      modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

      document.getElementById('ws-v2-result-regen').addEventListener('click', function() {
        modal.remove();
        handleGenerate(listing, sourceBtn);
      });

      document.getElementById('ws-v2-result-apply').addEventListener('click', function() {
        var titleInput = document.getElementById('ws-edit-title');
        var descTextarea = document.getElementById('ws-edit-desc');
        if (titleInput) titleInput.value = data.title || titleInput.value;
        if (descTextarea) descTextarea.value = data.description || descTextarea.value;
        modal.remove();
        // 사용자 안내
        var savedHint = document.createElement('div');
        savedHint.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
        savedHint.textContent = '✅ 채워졌습니다. "💾 저장" 버튼을 눌러 확정하세요.';
        document.body.appendChild(savedHint);
        setTimeout(function() { savedHint.remove(); }, 4000);
      });
    }

    function escHtml(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    console.log('[v300-aidesc-v2] installed (RAG + 7 personas + Gemini Flash)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInstall);
  } else {
    tryInstall();
  }
})();
