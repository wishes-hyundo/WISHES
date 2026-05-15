/**
 * v396 — 지도 정확도 fix 버튼 (좌표 + 도로명 자동 보정)
 * 사장님 명령 2026-05-14: 한 번 click 으로 실행
 *
 * 기능:
 *   1. 우측 상단에 "🛠️ 지도 정확도 fix" 버튼 표시 (admin only)
 *   2. click → progress 모달:
 *      a. 중복 좌표 매물 진단 (dryRun)
 *      b. 잘못된 도로명 매물 진단 (dryRun)
 *      c. 사장님이 진행 동의 → 실제 fix 실행
 *      d. 진행률 + 통계 실시간 표시
 *   3. 모든 결과 표시
 */
(function () {
  'use strict';
  if (window.__WS_V396_COORD_FIX_BUTTON__) return;
  window.__WS_V396_COORD_FIX_BUTTON__ = true;
  if (location.hostname.indexOf('wishes.co.kr') === -1 && location.hostname !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function getToken() {
    try {
      return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch (_) { return ''; }
  }

  function injectStyle() {
    if (document.getElementById('v396-style')) return;
    var s = document.createElement('style');
    s.id = 'v396-style';
    s.textContent = [
      '.v396-fab{',
      '  position:fixed;top:120px;right:16px;z-index:99990;',
      '  background:#1d1d1f;color:#fff;',
      '  padding:10px 16px;border-radius:9999px;border:none;',
      '  font-size:13px;font-weight:600;cursor:pointer;',
      '  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Pretendard Variable",sans-serif;',
      '  box-shadow:0 4px 14px rgba(0,0,0,0.25);',
      '  transition:transform 0.2s ease,box-shadow 0.2s ease;',
      '}',
      '.v396-fab:hover{transform:scale(1.04);box-shadow:0 6px 20px rgba(0,0,0,0.30);}',
      '.v396-modal{position:fixed;inset:0;background:rgba(0,0,0,0.40);z-index:99999;display:flex;align-items:center;justify-content:center;}',
      '.v396-modal-box{',
      '  background:#fff;border-radius:16px;width:min(560px,92vw);max-height:80vh;overflow:hidden;',
      '  display:flex;flex-direction:column;',
      '  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Pretendard Variable",sans-serif;',
      '  box-shadow:0 20px 50px rgba(0,0,0,0.30);',
      '}',
      '.v396-modal-h{padding:16px 20px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:16px;font-weight:700;color:#1d1d1f;display:flex;justify-content:space-between;align-items:center;}',
      '.v396-modal-x{width:28px;height:28px;border-radius:50%;border:none;background:rgba(0,0,0,0.06);cursor:pointer;font-size:14px;}',
      '.v396-modal-body{padding:18px 20px;overflow-y:auto;flex:1;}',
      '.v396-section{margin-bottom:16px;padding:12px 14px;background:#f5f5f7;border-radius:10px;}',
      '.v396-section-h{font-size:13px;font-weight:700;color:#1d1d1f;margin-bottom:8px;}',
      '.v396-stat{display:flex;justify-content:space-between;font-size:13px;color:#3c3c43;padding:3px 0;}',
      '.v396-stat strong{color:#007AFF;font-weight:700;}',
      '.v396-action{padding:14px 20px;border-top:1px solid rgba(0,0,0,0.08);display:flex;gap:8px;justify-content:flex-end;}',
      '.v396-btn{padding:10px 18px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;}',
      '.v396-btn.primary{background:#007AFF;color:#fff;}',
      '.v396-btn.danger{background:#FF3B30;color:#fff;}',
      '.v396-btn.secondary{background:#e5e5ea;color:#1d1d1f;}',
      '.v396-log{font-family:-apple-system,SF Mono,monospace;font-size:11px;color:#6e6e73;background:#f5f5f7;padding:8px 10px;border-radius:6px;max-height:120px;overflow-y:auto;margin-top:8px;}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function showModal(html) {
    closeModal();
    var modal = document.createElement('div');
    modal.className = 'v396-modal';
    modal.id = 'v396-modal';
    modal.innerHTML = '<div class="v396-modal-box">' + html + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }

  function closeModal() {
    var m = document.getElementById('v396-modal');
    if (m) m.remove();
  }

  function setBody(html) {
    var b = document.querySelector('#v396-modal .v396-modal-body');
    if (b) b.innerHTML = html;
  }

  function setLog(text) {
    var b = document.querySelector('#v396-modal .v396-log');
    if (b) {
      b.textContent = (b.textContent + '\n' + text).slice(-2000);
      b.scrollTop = b.scrollHeight;
    }
  }

  async function callApi(url, body) {
    var token = getToken();
    if (!token) { throw new Error('no token'); }
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('http_' + r.status);
    return r.json();
  }

  // 진단
  async function runDiagnose() {
    showModal([
      '<div class="v396-modal-h">',
      '<span>🛠️ 지도 정확도 진단 중...</span>',
      '<button class="v396-modal-x" onclick="document.getElementById(\'v396-modal\').remove();">✕</button>',
      '</div>',
      '<div class="v396-modal-body">',
      '  <div style="text-align:center;padding:30px;">',
      '    <div style="font-size:14px;color:#6e6e73;">매물 데이터 진단 중... 잠시만 기다려주세요</div>',
      '  </div>',
      '  <div class="v396-log"></div>',
      '</div>',
    ].join(''));
    setLog('[1/2] 중복 좌표 매물 진단 중...');
    var dupResult = null, roadResult = null;
    try {
      dupResult = await callApi('/api/admin/geocode-fix-duplicates', { dryRun: true, limit: 500 });
      setLog('  → 중복 좌표 그룹: ' + (dupResult.totalGroups || 0) + ', 영향 매물: ' + (dupResult.totalListings || 0));
    } catch (e) {
      setLog('  ❌ 중복 좌표 진단 실패: ' + e.message);
    }
    setLog('[2/2] 도로명 주소 진단 중 (200건 샘플)...');
    try {
      roadResult = await callApi('/api/admin/verify-road-address', { dryRun: true, limit: 200 });
      setLog('  → 검사: ' + (roadResult.stats?.checked || 0) + ', 잘못된 도로명: ' + (roadResult.stats?.mismatched || 0));
    } catch (e) {
      setLog('  ❌ 도로명 진단 실패: ' + e.message);
    }

    // 결과 표시
    setBody([
      '<div class="v396-section">',
      '  <div class="v396-section-h">📍 중복 좌표 매물</div>',
      '  <div class="v396-stat"><span>중복 좌표 그룹</span><strong>' + (dupResult?.totalGroups || 0) + '개</strong></div>',
      '  <div class="v396-stat"><span>영향 매물</span><strong>' + (dupResult?.totalListings || 0) + '건</strong></div>',
      '</div>',
      '<div class="v396-section">',
      '  <div class="v396-section-h">🛣️ 도로명 주소 (200건 샘플 기준)</div>',
      '  <div class="v396-stat"><span>검사</span><strong>' + (roadResult?.stats?.checked || 0) + '건</strong></div>',
      '  <div class="v396-stat"><span>잘못된 도로명</span><strong>' + (roadResult?.stats?.mismatched || 0) + '건</strong></div>',
      '  <div class="v396-stat"><span>비율</span><strong>' + (roadResult?.stats?.checked ? Math.round((roadResult.stats.mismatched / roadResult.stats.checked) * 100) : 0) + '%</strong></div>',
      '</div>',
      '<div style="font-size:12px;color:#8e8e93;margin-top:12px;">▼ 실제 fix 실행 시 시간 (kakao API 50ms × N) 가 걸립니다. 중간 중지 가능.</div>',
      '<div class="v396-log" style="margin-top:12px;"></div>',
    ].join(''));

    // action 버튼
    var act = document.createElement('div');
    act.className = 'v396-action';
    act.innerHTML = [
      '<button class="v396-btn secondary" onclick="document.getElementById(\'v396-modal\').remove();">취소</button>',
      '<button class="v396-btn primary" id="v396-run">▶ 실제 fix 실행</button>',
    ].join('');
    document.querySelector('#v396-modal .v396-modal-box').appendChild(act);
    document.getElementById('v396-run').addEventListener('click', runFix);
  }

  // 실제 fix
  async function runFix() {
    var actBtn = document.getElementById('v396-run');
    if (actBtn) actBtn.disabled = true;
    setLog('▶ 실제 fix 시작...');
    try {
      setLog('[1] 중복 좌표 fix...');
      var d = await callApi('/api/admin/geocode-fix-duplicates', { dryRun: false, limit: 500 });
      setLog('  ✓ ' + (d.message || '완료'));
      setLog('  처리: ' + (d.stats?.processed || 0) + ', 업데이트: ' + (d.stats?.dbUpdated || 0));
    } catch (e) { setLog('  ❌ ' + e.message); }
    try {
      setLog('[2] 도로명 fix (offset 0~200)...');
      var r = await callApi('/api/admin/verify-road-address', { dryRun: false, limit: 200, offset: 0 });
      setLog('  ✓ 검사: ' + (r.stats?.checked || 0) + ', 수정: ' + (r.stats?.updated || 0));
    } catch (e) { setLog('  ❌ ' + e.message); }
    setLog('▶ fix 완료. 페이지 새로고침 권장.');
    if (actBtn) {
      actBtn.disabled = false;
      actBtn.textContent = '✓ 완료 (다시 실행)';
    }
  }

  function injectButton() {
    if (document.getElementById('v396-fab')) return;
    injectStyle();
    var btn = document.createElement('button');
    btn.id = 'v396-fab';
    btn.className = 'v396-fab';
    btn.textContent = '🛠️ 지도 정확도 fix';
    btn.addEventListener('click', runDiagnose);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    setTimeout(injectButton, 1000);
  }
})();
