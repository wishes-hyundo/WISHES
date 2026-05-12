/**
 * v358 — AI auto-generate page-load block (1분 freeze fix)
 * 사장님 명령 2026-05-12.
 *
 * 진단 (사장님 직원 PC console 분석):
 *   페이지 로드 시 62K 매물 모두 /api/admin/auto-generate POST trigger.
 *   각 매물 별로 console.log 2개 (AI auto PASS / AI cached + allListings synced).
 *   → 62,418 매물 × 2 = 124,836 log + fetch wrap 처리 → JS main thread freeze.
 *   → 직원 PC (낮은 사양) = 1분 freeze, 모바일 = 더 오래.
 *   v321-storage-cleanup 의 baseline-protection 이 작동 못 함 (snapshot 빈 상태).
 *
 * 목적:
 *   페이지 로드 직후 60초 동안 autoMode=true auto-generate POST 모두 차단.
 *   60초 후 자동 해제 → 매물 click 시 수동 trigger 정상 작동.
 *   AI cache 일시적 skip 하되 매물 click 시 정상 생성.
 *
 * 효과:
 *   - 1분 freeze 완전 제거 (62K 매물 처리 skip)
 *   - 매물 표시 즉시 (스크롤 가능)
 *   - 매물 click 시 AI 정상 처리 (block 끝나면)
 *
 * 회귀 회피:
 *   - 새 파일 → 기존 patch 안 건드림
 *   - autoMode=true 만 차단 (수동 호출 그대로)
 *   - 60초 후 자동 해제 (영구 영향 X)
 *   - 등록 안 하면 prod 영향 0
 *
 * 안전 가드:
 *   - try/catch 로 모든 fetch 호출 안전
 *   - block 응답이 v260-perf 의 fetch wrap 과 호환 (success:false 형식)
 */
(function () {
  'use strict';
  if (window.__WS_V358_AI_BLOCK__) return;
  window.__WS_V358_AI_BLOCK__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var BLOCK_MS = 60000;  // 60초 동안 자동 trigger 차단 (페이지 안정화 기간)
  var startTime = Date.now();
  var blockedCount = 0;
  var passedCount = 0;

  // Wrap fetch BEFORE v260-perf does (v260-perf wraps fetch separately)
  var origFetch = window.fetch;
  if (typeof origFetch !== 'function') return;

  window.fetch = function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var method = ((init && init.method) || 'GET').toUpperCase();

      if (/\/api\/admin\/auto-generate/.test(url) && method === 'POST') {
        var elapsed = Date.now() - startTime;
        if (elapsed < BLOCK_MS) {
          // Check if autoMode=true
          try {
            var body = init && init.body;
            var bodyObj = null;
            if (typeof body === 'string') {
              try { bodyObj = JSON.parse(body); } catch (_) {}
            } else if (body && typeof body === 'object') {
              bodyObj = body;
            }
            if (bodyObj && bodyObj.autoMode === true) {
              blockedCount++;
              // 100개마다 1번 log (console spam 회피)
              if (blockedCount === 1 || blockedCount % 100 === 0) {
                console.log('[v358-ai-block] blocked autoMode #' + blockedCount +
                  ' (elapsed ' + elapsed + 'ms / block ' + BLOCK_MS + 'ms)');
              }
              // v260-perf 와 호환되는 응답 형식 (success:false + blocked)
              return Promise.resolve(new Response(JSON.stringify({
                success: false,
                blocked_by: 'v358-page-load-protection',
                blocked_reason: 'autoMode page-load freeze prevention',
                result: null,
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }));
            }
          } catch (e) {}
        } else {
          passedCount++;
        }
      }
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };

  console.log('[v358-ai-block] installed (page-load freeze prevention, BLOCK_MS=' + BLOCK_MS + ')');

  setTimeout(function () {
    console.log('[v358-ai-block] block period ended. blocked=' + blockedCount + ' passed=' + passedCount);
  }, BLOCK_MS);
})();
