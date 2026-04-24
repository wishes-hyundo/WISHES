// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// content-v295-detail-hydrate.js (2026-04-23, retry patched 2026-04-24)
//
// 🚨 L-crit3  —  /search 상세모달 "본문 없음" 회귀 긴급 복구
//
// 배경 (근본 원인 확정)
//   /search 는 매물 목록을 /api/admin/listings?fields=minimal 로 받는다.
//   이 엔드포인트의 selectFields 는 카드 그리드 용도로 설계된 35개 컬럼만
//   반환하며 — 본문/히든 필드는 포함하지 않는다. 아래는 minimal 에서
//   '누락' 되어 있는 필드들 (v240 buildHTML 이 참조):
//
//     description, ai_description          (AI 요약 / 본문)
//     raw_fields                           (크롤링 원본 본문 — 준공년도 풀텍스트 등)
//     special_notes                        (🔒 중개사 전용 메모)
//     features                             (특징 태그 목록)
//     contacts (JSONB)                     (관계자 연락처 · 안심번호)
//     listing_videos                       (동영상 갤러리)
//     building_name, building_purpose      (건물명/주용도)
//     source_url, source_site              (외부 출처)
//     updated_at                           (수정 이력 표시)
//
//   minimal 응답이 window.WS.allListings 에 저장되면 각 row 는 "껍데기".
//   상세모달을 열면 content-v240-detail.js 의 buildHTML(L) 이 undefined
//   인 필드를 렌더하면서
//     - 본문·AI 섹션 비어있음
//     - 준공년도 '-'
//     - 중개사 전용 메모 · 특징 · 연락처 · 동영상 섹션 비어있음
//   증상이 전부 발생한다. 사용자가 보고한 "제대로 내용도 못 채워져있고
//   본문 내용도 볼 수 있던게 없어진" 회귀의 정확한 원인이다.
//
//   기존 lazyLoadFullImages 는 /api/listings/[id] (공개 strip 엔드포인트)
//   에서 이미지만 채워넣어 본문 필드는 영원히 복구되지 않는다. 또 공개
//   엔드포인트는 L-sec64/L-sec96 의 FORBIDDEN_PUBLIC_KEYS strip 으로
//   contact/source_url/raw_fields/special_notes 를 제거하므로 중개사
//   포털용으로 부적절하다.
//
// 해결 (이 패치)
//   1) window.WS.showDetail 을 얇게 wrap.
//   2) minimal listing 으로 1차 렌더 (즉시 화면 표시, UX 지연 0).
//   3) 백그라운드에서 /api/admin/listings/[id] (어드민 Bearer 토큰) 로
//      전체 row 를 fetch.
//   4) listing 오브젝트에 deep-merge → __v295Hydrated 플래그 세팅.
//   5) 모달이 아직 같은 매물을 표시 중이면 showDetail 을 한 번 더 호출해
//      buildHTML 이 전체 필드로 재렌더.
//   6) allListings 는 자바스크립트 참조 공유이므로 같은 row 를 다시 열 때는
//      이미 전체 필드 → fetch 스킵 → 즉시 전체 렌더.
//
// 설계 포인트
//   - v230(5탭) · v240(단일스크롤) · v260(AI 미러) · v270(contacts) · v280(모바일)
//     · v290(폴리싱) · v291(안정성) · v292(통합검색) · v293(알림로그) · v294(scope)
//     모든 이전 패치의 showDetail wrapper 위에 덧씌우므로 충돌 없음.
//   - 비로그인/토큰 없음 → 조용히 skip.
//   - 네트워크/403/404 → 조용히 skip (기본 minimal 렌더 유지).
//   - __v295Hydrating 락으로 중복 호출 방어.
//   - deep-merge 는 shallow assign (undefined 는 무시) — minimal 값을 보존하면서
//     full 응답으로만 덮어쓴다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function(){
  'use strict';
  var VERSION = '2.9.8';
  var TAG = '[WP v' + VERSION + ' detail-hydrate]';

  // 이중 탑재 방지 (HMR · 재진입)
  try { if (window.WS && window.WS.__v295HydrateApplied) return; } catch(_){}

  var MAX_TRIES = 120; // 최대 ~12초 대기 (v240 설치 완료 시점까지)
  var POLL_INTERVAL = 100;
  var tries = 0;
  var installT = null;

  function getToken(){
    try {
      return (
        sessionStorage.getItem('ws_token') ||
        localStorage.getItem('ws_token') ||
        ''
      );
    } catch(_) { return ''; }
  }

  /**
   * minimal listing 오브젝트에 서버 full row 를 병합.
   *   - undefined 는 minimal 값 보존 (부분 응답 방어).
   *   - listing_images/listing_videos 는 서버 값 우선 (이미지 정책 통과본).
   *   - images/videos 별칭 동기화.
   */
  function mergeFullIntoListing(l, full){
    if (!full || typeof full !== 'object') return;
    for (var k in full) {
      if (!Object.prototype.hasOwnProperty.call(full, k)) continue;
      var v = full[k];
      if (v === undefined) continue;
      l[k] = v;
    }
    // L-search5c (2026-04-24): 이전 !l.images 게이트는 minimal 응답이 이미
    //   l.images 에 1장짜리 배열을 심어놨을 때 alias 업데이트를 차단했다.
    //   content-v240-detail.js 의 갤러리 렌더가 l.images 를 참조하므로 결과적으로
    //   모달에 1장만 표시되는 핵심 버그. 무조건 덮어써서 17장 전부 반영.
    if (full.listing_images) l.images = full.listing_images;
    if (full.listing_videos) l.videos = full.listing_videos;
  }

  /** 모달이 여전히 이 매물을 보여주고 있는지 확인 */
  function isStillSameListing(id){
    try {
      var last = window.WS && window.WS.__lastListing;
      if (!last) return false;
      return String(last.id) === String(id);
    } catch(_) { return false; }
  }

  // L-search5 (2026-04-24): Vercel serverless cold-start 시 verifyAdminAuth 의
  //   Supabase getUser() 가 8s race timeout 을 터트려 간헐적 401. 기존에는 fetch
  //   가 401 이면 silent-skip 해서 모달에 minimal 응답(이미지 1장) 만 남고
  //   "추가 사진들이 안 나오는" 고착 상태가 재현됐다. 재시도를 한 번 추가 —
  //   첫 401 은 cold-start 로 간주하고 1.2s 뒤 warm 상태에서 재호출한다. 두 번째도
  //   실패하면 진짜 인증 문제 (token 만료 등) 로 판단해 silent-skip 로 폴백.
  function fetchDetailWithRetry(id, token) {
    var url = '/api/admin/listings/' + encodeURIComponent(id);
    var opts = {
      headers: { 'Authorization': 'Bearer ' + token },
      cache: 'no-store',
      credentials: 'same-origin'
    };
    function tryOnce() { return fetch(url, opts); }
    // L-search5b (2026-04-24): 재시도 2회 (1.2s, 3.5s exponential backoff).
    //   2번째 cold-start 504 에서도 복구하기 위해 총 3회 시도.
    var delays = [1200, 3500];
    function attempt(step){
      return tryOnce().then(function(r){
        if (r && r.ok) {
          if (step > 0) console.log(TAG + ' hydrate retry ' + step + ' succeeded (HTTP ' + r.status + ')');
          return r.json();
        }
        var code = r ? r.status : 0;
        if (step >= delays.length) {
          console.warn(TAG + ' hydrate gave up after ' + (step+1) + ' attempts (last HTTP ' + code + ')');
          return null;
        }
        var delay = delays[step];
        console.warn(TAG + ' hydrate attempt ' + (step+1) + ' failed (HTTP ' + code + '), retry ' + (step+1) + ' in ' + delay + 'ms…');
        return new Promise(function(resolve){ setTimeout(resolve, delay); }).then(function(){ return attempt(step+1); });
      });
    }
    return attempt(0);
  }

  function hydrate(listing){
    if (!listing || listing.__v295Hydrated || listing.__v295Hydrating) return;
    var id = listing.id;
    if (!id) return;
    var token = getToken();
    if (!token) return; // 비인증 상태면 skip (/search 본문 무관)

    listing.__v295Hydrating = true;
    fetchDetailWithRetry(id, token)
      .then(function(j){
        if (!j || !j.success || !j.data) return;
        mergeFullIntoListing(listing, j.data);
        listing.__v295Hydrated = true;

        // 같은 매물 아직 열려 있으면 재렌더
        if (isStillSameListing(id) && typeof window.WS.showDetail === 'function') {
          try {
            // showDetail 은 v240 wrapper 이자 이 패치의 wrap. __v295Hydrated 가
            // true 이므로 이 패치에서는 fetch 를 재발행하지 않고 render 만 수행.
            window.WS.showDetail(listing);
          } catch(e) {
            console.warn(TAG + ' re-render failed', e);
          }
        }
      })
      .catch(function(_){ /* silent — minimal 렌더 유지 */ })
      .finally(function(){ try { listing.__v295Hydrating = false; } catch(_){} });
  }

  function install(){
    if (!window.WS || typeof window.WS.showDetail !== 'function') return false;
    if (window.WS.__v295HydrateApplied) return true;

    var prev = window.WS.showDetail;
    window.WS.__v295_prevShowDetail = prev;

    window.WS.showDetail = function(listing) {
      // 1) 이전 showDetail 로 즉시 렌더 (minimal 필드만이라도 사용자에게 바로 보임)
      try { prev.call(this, listing); }
      catch(e) { console.error(TAG + ' prev showDetail threw', e); throw e; }

      // 2) 이미 hydrate 완료된 객체면 재렌더 경로에서 온 것 → fetch 스킵
      if (!listing || listing.__v295Hydrated || listing.__v295Hydrating) return;

      // 3) 비동기로 full row 회수 → merge → 재렌더
      hydrate(listing);
    };

    window.WS.__v295HydrateApplied = true;
    window.WS.__v295Version = VERSION;
    try { console.log(TAG + ' detail hydrate installed'); } catch(_){}
    return true;
  }

  function tryInstall(){
    tries++;
    if (install()) return;
    if (tries >= MAX_TRIES) return;
    installT = setTimeout(tryInstall, POLL_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInstall, { once: true });
  } else {
    tryInstall();
  }
})();
