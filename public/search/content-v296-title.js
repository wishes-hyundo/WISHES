// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// content-v296-title.js (2026-04-23)
//
// 🎯 L-crit4b — /search 상세모달 제목 재설계
//
// 문제
//   기존 v240 buildHTML 의 <h1> 은 fullAddr (전체 주소) 를 박아두어
//   "신림동 ... 역삼동" 같이 동명이 제목에 반복 노출되는 회귀가 있었다.
//
// 결정 (사용자 확인)
//   - 제목 = AI 생성 제목 (주소/동 절대 포함 금지)
//   - 한번 생성되면 프리즈(재생성 금지). 명시적 재생성 버튼 클릭시에만 갱신
//     ("저번에도 이야기 했던 부분인데 매번 상세보기 열면 그떄마다 재생성
//      되게는 하지 말고 한번 생성하면 고정시키고 재생성을 눌렀을때만 재생성")
//   - 재생성 = 현 시점 기준 (트렌드 앵커) → regeneratedAt=Date.now() 송신 (Q2=C)
//
// 이 패치가 하는 일
//   1) v240 buildHTML 결과에 '재생성/생성' 버튼을 h1 옆에 주입
//   2) 버튼 클릭 → POST /api/generate-description { listingId, force:true,
//      regeneratedAt } → 반환값을 listing 오브젝트에 머지 → showDetail 재호출
//   3) 이미 DB 에 ai_title 이 있으면 서버가 frozen:true 로 기존 값 반환
//      (비용 0) — 다만 force:true 는 항상 재생성 강제
//   4) 생성 중 버튼 disable + '생성 중…' 라벨
//
// 안전장치
//   - window.WS.showDetail 을 wrap (v295 위에 얹힘)
//   - 같은 버튼 중복 생성 방어 (__v296ButtonWired 플래그)
//   - 네트워크 실패 시 toast + 버튼 복구
//   - 비로그인(토큰 없음) 시 버튼 숨김
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function(){
  'use strict';
  var VERSION = '2.9.6';
  var TAG = '[WP v' + VERSION + ' title]';

  try { if (window.WS && window.WS.__v296TitleApplied) return; } catch(_){}

  var MAX_TRIES = 120;
  var POLL_INTERVAL = 100;
  var tries = 0;

  function getToken(){
    try {
      return (
        sessionStorage.getItem('ws_token') ||
        localStorage.getItem('ws_token') ||
        ''
      );
    } catch(_) { return ''; }
  }

  function injectCss(){
    if (document.getElementById('v296-title-css')) return;
    var s = document.createElement('style');
    s.id = 'v296-title-css';
    s.textContent = [
      /* h1 제목 — 주소가 아니라 AI 제목 */
      '#ws-detail-container .v240-hero-title{font-size:22px;font-weight:800;line-height:1.3;letter-spacing:-.02em;margin:0;color:#0F1F17;display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}',
      /* 서브라인 주소 — 단일 라인, 작게 */
      '#ws-detail-container .v240-hero-addr{margin-top:6px;color:#4b6355;font-size:13px;font-weight:500;letter-spacing:-.01em;min-height:18px}',
      '#ws-detail-container .v240-hero-title[data-ai="0"]{color:#6b7a70;font-weight:700;font-style:italic}',
      /* 재생성 버튼 */
      '#ws-detail-container .v296-regen-btn{',
        'display:inline-flex;align-items:center;gap:4px;',
        'font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;',
        'background:#E8F5E9;color:#1B3D28;border:1px solid #B5D8BE;cursor:pointer;',
        'white-space:nowrap;flex-shrink:0;line-height:1.2;',
        'transition:background .15s,transform .15s;margin-top:2px',
      '}',
      '#ws-detail-container .v296-regen-btn:hover{background:#CFEAD4}',
      '#ws-detail-container .v296-regen-btn:active{transform:scale(.97)}',
      '#ws-detail-container .v296-regen-btn[disabled]{opacity:.55;cursor:wait}',
      '#ws-detail-container .v296-regen-btn[data-mode="new"]{background:#FFF3E0;border-color:#FFCC80;color:#6F4E00}',
    ].join('');
    document.head.appendChild(s);
  }

  function toast(msg){
    try {
      var t = document.createElement('div');
      t.className = 'v240-toast';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function(){ t.classList.add('show'); }, 10);
      setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 300); }, 1800);
    } catch(_){}
  }

  /**
   * POST 생성/재생성. force:true 는 서버의 freeze 게이트를 우회 (비용 1회 발생).
   */
  function regenerate(listing, forceFlag){
    var token = getToken();
    if (!token) { toast('로그인이 필요합니다'); return Promise.resolve(null); }
    return fetch('/api/generate-description', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      cache: 'no-store',
      credentials: 'same-origin',
      body: JSON.stringify({
        listingId: listing.id,
        address: listing.address || '',
        dong: listing.dong || '',
        gu: listing.gu || '',
        type: listing.type || '',
        deal: listing.deal || '',
        deposit: listing.deposit,
        monthly: listing.monthly,
        price: listing.price,
        area_m2: listing.area_m2,
        floor_current: listing.floor_current,
        floor_total: listing.floor_total,
        direction: listing.direction,
        rooms: listing.rooms,
        bathrooms: listing.bathrooms,
        features: listing.features,
        parking_available: listing.parking,
        buildingInfo: listing.building_name || '',
        aiModel: 'haiku',
        force: !!forceFlag,
        regeneratedAt: Date.now(),
      }),
    }).then(function(r){
      return r && r.ok ? r.json() : r.json().then(function(j){ throw new Error(j && j.error || 'HTTP '+r.status); });
    });
  }

  function mergeAi(listing, resp){
    if (!resp) return;
    if (resp.title != null) listing.ai_title = resp.title;
    if (resp.description != null) listing.ai_description = resp.description;
    if (resp.keywords != null) listing.seo_keywords = resp.keywords;
    if (resp.tags != null) listing.seo_tags = resp.tags;
    if (resp.meta_description != null) listing.seo_meta_description = resp.meta_description;
    if (resp.ai_generated_at) listing.ai_generated_at = resp.ai_generated_at;
  }

  function wireButton(listing){
    try {
      var h1 = document.getElementById('v240-hero-title');
      if (!h1) return;
      if (h1.__v296ButtonWired) return;
      var token = getToken();
      if (!token) return; // 비로그인 시 버튼 미표시

      var hasAi = h1.getAttribute('data-ai') === '1';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'v296-regen-btn';
      btn.setAttribute('data-mode', hasAi ? 'regen' : 'new');
      btn.textContent = hasAi ? '제목 재생성' : 'AI 제목 생성';
      btn.title = hasAi
        ? '현 시점 트렌드 기준으로 제목·설명을 다시 생성합니다'
        : '이 매물의 AI 제목·설명을 처음 생성합니다';
      btn.addEventListener('click', function(ev){
        ev.preventDefault();
        if (btn.disabled) return;
        btn.disabled = true;
        var original = btn.textContent;
        btn.textContent = '생성 중…';
        regenerate(listing, true)
          .then(function(resp){
            if (!resp || !resp.success) {
              toast('생성 실패');
              return;
            }
            mergeAi(listing, resp);
            toast(resp.cached ? '기존 제목 유지됨' : '새 제목 생성 완료');
            // 재렌더 — showDetail wrap 은 v295 hydrate 를 스킵(__v295Hydrated true)하고
            // buildHTML 이 listing.ai_title 을 읽어 새 h1 로 그린다.
            try {
              if (typeof window.WS.showDetail === 'function') {
                window.WS.showDetail(listing);
              }
            } catch(_){}
          })
          .catch(function(e){
            console.warn(TAG + ' regenerate failed', e);
            toast('생성 실패: 네트워크 오류');
            btn.disabled = false;
            btn.textContent = original;
          });
      }, { passive: false });
      h1.appendChild(btn);
      h1.__v296ButtonWired = true;
    } catch(e) {
      console.warn(TAG + ' wireButton failed', e);
    }
  }

  function install(){
    if (!window.WS || typeof window.WS.showDetail !== 'function') return false;
    if (window.WS.__v296TitleApplied) return true;

    injectCss();

    var prev = window.WS.showDetail;
    window.WS.__v296_prevShowDetail = prev;

    window.WS.showDetail = function(listing){
      // 1) 이전 showDetail (v295 hydrate + v240 build) 실행 → h1 DOM 생성됨
      try { prev.call(this, listing); }
      catch(e) { console.error(TAG + ' prev showDetail threw', e); throw e; }

      // 2) h1 옆에 버튼 부착. DOM 이 innerHTML 교체로 새로 그려지므로
      //    매번 다시 와이어링 해야 한다 (__v296ButtonWired 는 DOM 에 달려
      //    있어 새 h1 에는 없음 — 자연스럽게 재부착됨).
      try { wireButton(listing); } catch(_){}
    };

    window.WS.__v296TitleApplied = true;
    window.WS.__v296Version = VERSION;
    try { console.log(TAG + ' title + regenerate installed'); } catch(_){}
    return true;
  }

  function tryInstall(){
    tries++;
    if (install()) return;
    if (tries >= MAX_TRIES) return;
    setTimeout(tryInstall, POLL_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInstall, { once: true });
  } else {
    tryInstall();
  }
})();
