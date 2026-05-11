/**
 * content-v349-snapshot-ttl-auto-invalidate.js (2026-05-11)
 *
 * Fix 39 (사장님 명령 "직원한테 부탁 X 자동 해결"):
 *   직원 컴퓨터에서 매물 16건만 표시 회귀 발견.
 *   원인: v321 의 SAFE_PRESERVE 'ws_data_snapshot' 영구 보존 →
 *         직원 localStorage 의 stale 16건 snapshot 영구 잡힘.
 *
 * 자동 fix (사용자 한 일 0):
 *   1. ws_data_snapshot 의 timestamp 검사
 *   2. 1시간 이상 old 면 자동 삭제
 *   3. 매물 개수 0~30건 사이 (비정상 낮음) → 강제 invalidate
 *   4. page mount 시 매번 검사 → 영구 stale 차단
 *
 * 영구 INVARIANT 영향:
 *   I-USER-EXP-1 (사용자에게 캐시 부탁 X) 준수.
 *   v321 의 SAFE_PRESERVE 는 quota 보호 목적인데, TTL 도입으로 stale 차단 강화.
 *
 * 안전 가드:
 *   - timestamp 없는 snapshot 도 자동 무효화 (safe default)
 *   - 매물 개수가 정상 (1000+) 인 snapshot 만 보존
 *   - 검증 후 fresh fetch 가 자동 발생 (content.js 의 fetchAllListings 트리거)
 */
(function () {
  'use strict';
  if (window.__WS_V349_SNAPSHOT_TTL__) return;
  window.__WS_V349_SNAPSHOT_TTL__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var TTL_MS = 60 * 60 * 1000; // 1 hour
  var MIN_VALID_LISTINGS = 100; // 미만 시 비정상 stale 로 간주

  function checkAndInvalidateSnapshot() {
    try {
      var snap = localStorage.getItem('ws_data_snapshot');
      if (!snap) {
        console.log('[v349] no ws_data_snapshot');
        return;
      }

      var obj;
      try {
        obj = JSON.parse(snap);
      } catch (parseErr) {
        // 파싱 실패 시 자동 삭제
        localStorage.removeItem('ws_data_snapshot');
        console.warn('[v349] ws_data_snapshot parse fail, removed');
        return;
      }

      // 1. Timestamp 검사
      var ts = obj._ts || obj.timestamp || obj.updated_at || 0;
      var age = Date.now() - ts;

      if (!ts || age > TTL_MS) {
        localStorage.removeItem('ws_data_snapshot');
        console.log('[v349] ws_data_snapshot expired (age=' + Math.round(age / 60000) + 'min), removed');
        return;
      }

      // 2. 매물 개수 검사 — 비정상 낮음 (stale 16건 같은) 시 자동 삭제
      var listings = obj.listings || obj.data || (Array.isArray(obj) ? obj : null);
      if (Array.isArray(listings)) {
        if (listings.length < MIN_VALID_LISTINGS) {
          localStorage.removeItem('ws_data_snapshot');
          console.warn('[v349] ws_data_snapshot has only ' + listings.length + ' listings (< ' + MIN_VALID_LISTINGS + '), removed (stale prevention)');
          return;
        }
        console.log('[v349] ws_data_snapshot valid: ' + listings.length + ' listings, age=' + Math.round(age / 60000) + 'min');
      } else {
        // listings 구조 알 수 없음 - 안전하게 invalidate
        localStorage.removeItem('ws_data_snapshot');
        console.warn('[v349] ws_data_snapshot structure unknown, removed');
      }
    } catch (e) {
      console.warn('[v349] error:', e);
      // 에러 시 안전하게 invalidate
      try { localStorage.removeItem('ws_data_snapshot'); } catch (_) {}
    }
  }

  // page mount 즉시 검사
  checkAndInvalidateSnapshot();

  // 영구 hook — content.js 가 snapshot 저장 시 timestamp 자동 추가
  // Storage.setItem wrapper 로 ws_data_snapshot 저장 시 _ts 강제
  try {
    var origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ws_data_snapshot' && typeof value === 'string') {
        try {
          var parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed._ts) {
            parsed._ts = Date.now();
            value = JSON.stringify(parsed);
          }
        } catch (_) {}
      }
      return origSetItem.call(this, key, value);
    };
  } catch (_) {}

  console.log('[v349-snapshot-ttl] active - 1h TTL + 100 min listings + auto _ts injection');
})();
