/* /search content-v332 — broken image 자동 /api/img-proxy 재시도
 *
 * 사장님 명령 (2026-05-09):
 *   매물 78752 갤러리 일부 사진 broken (cloudfront Lambda 503).
 *   v318 의 src 변환을 놓치는 케이스가 있음 (timing 또는 dynamic 생성).
 *
 * 동작:
 *   문서의 모든 <img> 에 onerror 리스너 attach.
 *   onerror 발생 시:
 *     1) 이미 /api/img-proxy 거친 경우 → transparent fallback (포기)
 *     2) 외부 URL 인 경우 → src 를 /api/img-proxy?url=... 로 교체 (1회만)
 *
 * 효과:
 *   - cloudfront 503 / zigbang octet-stream / 외부 일시 장애 모두 흡수
 *   - 콘솔 broken image 에러 사라짐
 *   - 사용자에게는 transparent placeholder (broken icon X)
 *
 * 안전:
 *   - 무한 retry 금지 — dataset 으로 1회만 시도
 *   - data: / blob: / 자체 origin 은 대상 X
 *   - v318 와 충돌 X (v318 가 먼저 변환 → onerror 발생 X / v318 누락분만 v332 가 처리)
 */
(function () {
  'use strict';
  var V = 'v332-img-onerror-retry';

  // /search 전용
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var PROXY_PREFIX = '/api/img-proxy?url=';

  function shouldRetry(src) {
    if (!src) return false;
    if (src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return false;
    if (src.indexOf(PROXY_PREFIX) >= 0) return false;
    try {
      var u = new URL(src, location.origin);
      // 자체 origin 은 retry 의미 X
      if (u.origin === location.origin) return false;
      return true;
    } catch (_) { return false; }
  }

  function proxify(url) {
    return PROXY_PREFIX + encodeURIComponent(url);
  }

  function handleError(ev) {
    var img = ev.target;
    if (!img || img.tagName !== 'IMG') return;
    if (img.dataset.v332Retried === '1') return; // 1회만
    var src = img.getAttribute('src');
    if (!shouldRetry(src)) return;
    img.dataset.v332Retried = '1';
    var newSrc = proxify(src);
    try {
      console.log('[' + V + '] retry via img-proxy: ' + src.slice(0, 80));
    } catch (_) {}
    img.setAttribute('src', newSrc);
  }

  // 이벤트 캡처 단계로 attach (image 의 onerror 가 bubble X 라 캡처 필수)
  document.addEventListener('error', handleError, true);

  try {
    console.log('[' + V + '] active — broken image 자동 /api/img-proxy 재시도 (1회)');
  } catch (_) {}
})();
