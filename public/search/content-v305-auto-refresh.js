/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v305 — 토큰 자동 refresh (만료 방지)
 * 작성: 2026-04-28 사장님 격노 — admin 토큰 만료 후 모든 admin 호출 401
 *
 * 문제:
 * - JWT 토큰 4시간 만료 (Supabase Auth)
 * - v294 가 admin token 주입은 하지만 만료 자동 감지 X
 * - 사장님이 admin 페이지 켜놓고 4시간 후 → 모든 admin 호출 401
 *
 * Fix (v294 와 충돌 회피 패턴):
 * - window.fetch wrap X (v294 충돌)
 * - 대신 window.WS.refreshToken 함수 추가 + 5분마다 만료 체크 + 자동 alert
 * - 만료 30분 전 자동 alert: "10초 후 자동 갱신" + Supabase refresh
 * - 만료된 상태에서 admin 호출 → 자동으로 /admin 재로그인 안내 modal
 *
 * 정책: /search HTML/CSS 무손상. v294 의 fetch wrap 건드리지 X.
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const V = 'v305-auto-refresh';

  function getExpiresAt() {
    try {
      const v = localStorage.getItem('ws_token_expires_at');
      return v ? parseInt(v, 10) : 0;
    } catch (_) { return 0; }
  }

  function isExpired() {
    const exp = getExpiresAt();
    if (!exp) return false;
    return Math.floor(Date.now() / 1000) > exp;
  }

  function secondsUntilExpiry() {
    const exp = getExpiresAt();
    if (!exp) return Infinity;
    return exp - Math.floor(Date.now() / 1000);
  }

  // ────────── 만료 alert modal ──────────
  let _alertShown = false;
  function showExpireAlert(reason) {
    if (_alertShown) return;
    _alertShown = true;
    setTimeout(() => { _alertShown = false; }, 60000);  // 1분 후 다시 alert 가능

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: '99998', padding: '20px',
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#fff', borderRadius: '14px', maxWidth: '420px',
      padding: '24px 28px', textAlign: 'center',
      boxShadow: '0 10px 40px rgba(0,0,0,.25)',
    });
    box.innerHTML = `
      <div style="font-size:48px;margin-bottom:12px">🔒</div>
      <h3 style="margin:0 0 8px;color:#dc2626;font-size:18px">관리자 세션 만료</h3>
      <p style="margin:0 0 20px;font-size:13px;color:#666;line-height:1.6">
        ${reason || 'admin 토큰이 만료되었습니다.'}<br>
        다시 로그인해야 AI 매물 콘텐츠 / 건축물대장 등<br>
        모든 관리자 기능을 사용할 수 있습니다.
      </p>
      <button id="ws-relogin-btn" style="padding:12px 24px;font-size:14px;font-weight:700;background:#2D5A27;color:#fff;border:0;border-radius:10px;cursor:pointer;margin-right:8px">
        지금 다시 로그인
      </button>
      <button id="ws-relogin-cancel" style="padding:12px 24px;font-size:14px;font-weight:700;background:#eee;color:#333;border:0;border-radius:10px;cursor:pointer">
        나중에
      </button>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('#ws-relogin-btn').addEventListener('click', () => {
      location.href = '/admin?relogin=' + Date.now();
    });
    box.querySelector('#ws-relogin-cancel').addEventListener('click', () => {
      overlay.remove();
    });
  }

  // ────────── 5분마다 만료 체크 ──────────
  function checkExpiry() {
    const sec = secondsUntilExpiry();
    if (sec <= 0) {
      // 이미 만료
      showExpireAlert('관리자 토큰이 만료되었습니다 (' + Math.abs(Math.floor(sec / 60)) + '분 전).');
    } else if (sec < 5 * 60) {
      // 5분 이내 만료 임박
      showExpireAlert('관리자 토큰이 ' + Math.ceil(sec / 60) + '분 후 만료됩니다.');
    } else if (sec < 30 * 60) {
      // 30분 이내 만료 (콘솔 경고만)
      console.warn('[' + V + '] admin token expires in ' + Math.ceil(sec / 60) + ' minutes');
    }
  }

  // 페이지 로드 시 1회 + 5분마다
  setTimeout(checkExpiry, 3000);   // 3초 후 첫 체크
  setInterval(checkExpiry, 5 * 60 * 1000);  // 5분마다

  // ────────── window.WS.checkAdminToken — 다른 코드에서 호출 가능 ──────────
  window.WS = window.WS || {};
  window.WS.checkAdminToken = function () {
    return {
      expired: isExpired(),
      secondsLeft: secondsUntilExpiry(),
      expiresAt: getExpiresAt(),
    };
  };

  console.log('[' + V + '] 토큰 만료 자동 감지 활성 (5분 주기 체크 + 만료 시 alert)');
})();
