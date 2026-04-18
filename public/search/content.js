/**
 * Wishes Search Extension - Content Script
 * Injects property search functionality into wishes.co.kr/admin
 *
 * @version 2.2.6
 * @build 2026-04-14
 * @changelog 
 *   v2.2.6: 토큰 만료 자동 감지 + 만료 경고 토스트 + 401 자동 로그아웃
 *   v2.2.1 - IndexedDB 캐시 추가 (재로드 즉시 표시, 백그라운드 갱신)
 * @changelog v2.2.0 - Admin API 단일 호출로 전환 (병렬 페이지네이션 제거, API 500 에러 해결)
 *
 * This script:
 * 1. Waits for sidebar to load
 * 2. Adds "🔍 매물 검색" button to sidebar navigation
 * 3. Manages filter state and applies filters to listings
 * 4. Provides helper functions for price/area formatting
 */

(function() {
  'use strict';

  // ============================================================================
  // SECURITY LAYER - 확장 보안
  // ============================================================================

  // [EXT-S1] 확장 실행 환경 검증 (wishes.co.kr 도메인만 허용)
  if (location.hostname !== 'wishes.co.kr' && location.hostname !== 'www.wishes.co.kr') {
    return; // 다른 도메인에서 실행 차단
  }

  // [EXT-S1.1] 인증 페이지에서는 확장 실행 차단 (로그인/가입 페이지 보호)
  if (location.pathname.indexOf('admin-auth') !== -1 || location.pathname.indexOf('command-center') !== -1) {
    return; // 인증/커맨드센터 페이지에서는 확장 비활성화
  }

  // [EXT-S1.2] /search 페이지 진입 시 localStorage -> sessionStorage 동기화
  // Next.js /search 페이지의 인증 가드가 sessionStorage.ws_token을 읽는데
  // /admin 로그인은 localStorage에 저장하므로, 페이지 스크립트 컨텍스트에서
  // 토큰을 복사해줘야 가드가 통과된다. 로그인 정보가 있는데 인증벽이 표시된
  // 경우에는 자동 새로고침으로 화면을 복구한다.
  (function _wsSyncAuthStorage() {
    try {
      var isPageScript = !(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL);
      if (!isPageScript) return;
      var keys = ['ws_token','ws_user','ws_login_time','admin_password'];
      var copiedAny = false;
      keys.forEach(function(k){
        try {
          var v = localStorage.getItem(k);
          if (v && !sessionStorage.getItem(k)) {
            sessionStorage.setItem(k, v);
            copiedAny = true;
          }
        } catch(e){}
      });
      // 인증벽이 떠 있는데 토큰은 존재하는 상태 → 한 번만 자동 새로고침
      if (copiedAny && location.pathname.indexOf('/search') === 0) {
        try {
          var already = sessionStorage.getItem('_ws_auth_reload_once');
          if (!already) {
            sessionStorage.setItem('_ws_auth_reload_once', '1');
            setTimeout(function(){ location.reload(); }, 50);
          }
        } catch(e){}
      }
    } catch(e){}
  })();


  // [EXT-A1] v2.2.6 인증 토큰 자동 만료 처리
  (function _wsAuthIntercept226() {
    try {
      var TKEY = "ws_token", WARN_MIN = 5;
      function parseExp(t){ try{ var p=JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); return p.exp?p.exp*1000:0; }catch(e){return 0;} }
      function toast(msg, danger){
        try{ var d=document.createElement("div"); d.textContent=msg;
          d.style.cssText="position:fixed;top:20px;right:20px;z-index:2147483647;background:"+(danger?"#d32f2f":"#2D5A27")+";color:#fff;padding:12px 18px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.25);font-size:13px;font-weight:600;max-width:320px;line-height:1.4;";
          (document.body||document.documentElement).appendChild(d);
          setTimeout(function(){ try{d.remove();}catch(e){} }, 6000);
        }catch(e){}
      }
      function redirect(){
        // 토큰 재검증 — 자동 갱신으로 교체되었을 수 있으므로 최신 토큰의 exp가 살아있으면 리다이렉트 취소
        try {
          var cur = localStorage.getItem(TKEY) || sessionStorage.getItem(TKEY);
          if (cur) {
            var curExp = parseExp(cur);
            if (curExp > Date.now() + 60000) {
              // 여유 60초 이상 → 갱신된 토큰이 유효, 리다이렉트 취소
              return;
            }
          }
        } catch(e){}
        try{ localStorage.removeItem(TKEY); sessionStorage.removeItem(TKEY); }catch(e){}
        toast("🔒 세션 만료 — 로그인 페이지로 이동합니다", true);
        // 경로별 분기: /search 중개사 포털은 /login?redirect=/search, 그 외는 /admin
        setTimeout(function(){
          var path = location.pathname || '';
          if (path.indexOf('/search') === 0) { location.href = '/login?redirect=/search'; return; }
          if (!/\/admin(\/|$|\?|#)/.test(path)) location.href = '/admin';
        }, 1600);
      }
      function scheduleChecks(){
        var tok=null; try{ tok=localStorage.getItem(TKEY)||sessionStorage.getItem(TKEY); }catch(e){}
        if(!tok) return;
        var exp=parseExp(tok); if(exp<=0) return;
        var now=Date.now();
        if(exp<=now){ redirect(); return; }
        var warnDelay=exp-now-WARN_MIN*60000;
        if(warnDelay>0 && warnDelay<86400000){ setTimeout(function(){ toast("⚠️ 세션이 "+WARN_MIN+"분 후 만료됩니다. 재로그인해주세요", false); }, warnDelay); }
        var expDelay=exp-now;
        if(expDelay>0 && expDelay<86400000){ setTimeout(redirect, expDelay+1000); }
      }
      scheduleChecks();
      if(!window.__wsAuthFetchWrapped){
        window.__wsAuthFetchWrapped=true;
        var of=window.fetch;
        window.fetch=function(input,init){
          return of.apply(this,arguments).then(function(resp){
            try{ var url=typeof input==="string"?input:(input&&input.url)||"";
              if(resp && resp.status===401 && /\/api\/(admin|auth)\//.test(url)){ redirect(); }
            }catch(e){}
            return resp;
          });
        };
      }
    } catch(e){ try{ console.warn("[ws-auth]", e); }catch(_){} }
  })();

    // [EXT-S2] 콘솔 보호 - 확장 내부 로그 노출 방지
  var _wsLog = function() {}; // 프로덕션에서는 무출력
  // 개발 시: var _wsLog = console.log.bind(console);

  // [EXT-S3] 페이지 내 외부 스크립트 주입 감시
  var _extObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.tagName === 'SCRIPT' && node.src &&
            node.src.indexOf('wishes.co.kr') < 0 &&
            node.src.indexOf('cdnjs.cloudflare.com') < 0 &&
            node.src.indexOf('googleapis.com') < 0 &&
            node.src.indexOf('gstatic.com') < 0) {
          // 알 수 없는 외부 스크립트 감지
          _wsLog('[WISHES-SEC] 의심스러운 스크립트 감지:', node.src);
        }
      });
    });
  });
  try {
    _extObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch(e) {}

  // ============================================================================
  // 확장프로그램 감지 마커 - layout.tsx가 확장 설치 여부를 인식하기 위한 코드
  // ============================================================================
  (function() {
    // 1) 감지용 hidden 요소 삽입
    var marker = document.createElement('div');
    marker.id = 'wishes-search-extension';
    marker.setAttribute('data-wishes-extension', 'true');
    marker.style.display = 'none';
    document.documentElement.appendChild(marker);

    // 2) React에 확장 로드 알림 메시지 전송
    window.postMessage({ type: 'WS_EXTENSION_LOADED', version: '1.0' }, '*');

    // 3) 페이지 로드 후 재전송 (React hydration 이후 감지 보장)
    setTimeout(function() {
      window.postMessage({ type: 'WS_EXTENSION_LOADED', version: '1.0' }, '*');
    }, 1000);
    setTimeout(function() {
      window.postMessage({ type: 'WS_EXTENSION_LOADED', version: '1.0' }, '*');
    }, 3000);
  })();

  // [EXT-S4] API 응답 무결성 체크
  var _originalFetch = window.fetch;
  // (ISOLATED world에서는 직접 fetch를 씀 — 여기선 감시 로그만)

  // [EXT-S5] localStorage 접근 보호 (확장 키 패턴 보호)
  var _WS_STORAGE_PREFIX = 'ws_';

  // ============================================================================
  // AUTH GATE - 로그인/승인 확인 후 확장 기능 활성화
  // ============================================================================

  var _WS_AUTH_API = 'https://wishes.co.kr/api/auth/verify';
  var _wsAuthToken = null;
  var _wsAuthUser = null;
  var _wsAuthVerified = false;

  // [AUTH-CONFIG] 인증 게이트 활성화 플래그
  // API 서버 배포 후 true로 변경하여 인증을 강제합니다
  var _WS_AUTH_ENABLED = true; // ✅ 인증 활성화됨

  // sessionStorage에서 토큰 확인 (content script ISOLATED world)
  // ISOLATED world에서는 page의 sessionStorage에 접근 불가하므로
  // chrome.storage 또는 페이지 컨텍스트 주입으로 토큰을 전달받음
  function _wsCheckAuth(callback) {
    // 인증 게이트가 비활성일 때는 바로 통과
    if (!_WS_AUTH_ENABLED) {
      _wsAuthVerified = true;
      if (callback) callback(true);
      return;
    }

    // 페이지 컨텍스트에서 sessionStorage/localStorage 확인하는 헬퍼
    // (ISOLATED world에서는 직접 접근 불가하므로 스크립트 주입)
    function _wsCheckPageAuth(onResult) {
      var _pageAuthHandled = false;

      // [FIX 2026-04-14] 웹 스크립트로 로드된 경우 main world 직접 접근
      // /search/content.js로 배포되면 chrome.runtime이 없으므로 바로 sessionStorage 읽기
      var isExtensionContext = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;
      if (!isExtensionContext) {
        try {
          var token = null, user = null, loginTime = null, adminPw = null;
          try { token = sessionStorage.getItem('ws_token'); } catch(e) {}
          try { user = sessionStorage.getItem('ws_user'); } catch(e) {}
          try { loginTime = sessionStorage.getItem('ws_login_time'); } catch(e) {}
          try { adminPw = localStorage.getItem('admin_password') || sessionStorage.getItem('admin_password'); } catch(e) {}
          if (!token) {
            try {
              var wa = localStorage.getItem('wishes-auth');
              if (wa) {
                var parsed = JSON.parse(wa);
                if (parsed && parsed.access_token) {
                  token = 'admin_bridge_' + parsed.access_token;
                }
              }
            } catch(e) {}
          }
          onResult({
            hasToken: !!token,
            token: token,
            user: user,
            loginTime: loginTime,
            hasAdminPw: !!adminPw,
            adminPw: adminPw
          });
          return;
        } catch(e) {
          onResult({ hasToken: false, hasAdminPw: false });
          return;
        }
      }

      window.addEventListener('message', function _pageAuthMsg(e) {
        if (e.data && e.data.type === 'WS_PAGE_AUTH_RESULT' && !_pageAuthHandled) {
          _pageAuthHandled = true;
          window.removeEventListener('message', _pageAuthMsg);
          onResult(e.data);
        }
      });
      if (isExtensionContext) {
        var script = document.createElement('script');
        script.src = chrome.runtime.getURL('page-auth.js');
        script.onload = function() { script.remove(); };
        document.documentElement.appendChild(script);
      }
      setTimeout(function() {
        if (!_pageAuthHandled) {
          _pageAuthHandled = true;
          onResult({ hasToken: false, hasAdminPw: false });
        }
      }, 2000);
    }

    // 방법 1: chrome.storage.local에서 토큰 확인
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['ws_token', 'ws_user', 'ws_login_time'], function(data) {
        if (data.ws_token) {
          // chrome.storage에 토큰 있음 → 기존 플로우
          var loginTime = parseInt(data.ws_login_time || '0');
          if (Date.now() - loginTime > 1800000) {
            // 만료 → 페이지 컨텍스트에서 재확인
            chrome.storage.local.remove(['ws_token', 'ws_user', 'ws_login_time']);
            _wsFallbackPageAuth(callback);
            return;
          }
          // 서버에 토큰 검증
          fetch(_WS_AUTH_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + data.ws_token
            }
          })
          .then(function(r) {
            if (!r.ok) throw new Error('Auth API error: ' + r.status);
            return r.json();
          })
          .then(function(result) {
            if (result.valid && result.user && (result.user.status === 'approved' || result.user.role === 'superadmin')) {
              _wsAuthToken = data.ws_token;
              _wsAuthUser = result.user;
              _wsAuthVerified = true;
              chrome.storage.local.set({ ws_login_time: Date.now().toString() });
              if (callback) callback(true);
            } else {
              _wsFallbackPageAuth(callback);
            }
          })
          .catch(function() {
            // 네트워크 오류 시 캐시된 토큰으로 허용 (오프라인 대응, 최대 2시간)
            try {
              var cacheAge = Date.now() - parseInt(data.ws_login_time || '0');
              _wsAuthUser = JSON.parse(data.ws_user || 'null');
              if (_wsAuthUser && _wsAuthUser.status === 'approved' && cacheAge < 2 * 60 * 60 * 1000) {
                _wsAuthVerified = true;
                if (callback) callback(true);
              } else {
                _wsFallbackPageAuth(callback);
              }
            } catch(e) {
              _wsFallbackPageAuth(callback);
            }
          });
        } else {
          // chrome.storage에 토큰 없음 → 페이지 컨텍스트에서 확인
          _wsFallbackPageAuth(callback);
        }
      });
    } else {
      // chrome.storage 사용 불가 → 페이지 컨텍스트에서 확인
      _wsFallbackPageAuth(callback);
    }

    // 페이지 컨텍스트 (sessionStorage/localStorage) 기반 인증 확인
    function _wsFallbackPageAuth(cb) {
      _wsCheckPageAuth(function(pageData) {
        if (pageData.hasToken && pageData.token) {
          // sessionStorage에 ws_token 존재 → 서버 검증
          var token = pageData.token;
          // bridge 토큰은 바로 통과
          if (token.indexOf('admin_bridge_') === 0) {
            _wsAuthVerified = true;
            _wsAuthToken = token;
            try { _wsAuthUser = JSON.parse(pageData.user); } catch(e) {}
            // chrome.storage에도 동기화
            _wsSyncToStorage(token, pageData.user, pageData.loginTime);
            if (cb) cb(true);
            return;
          }
          fetch(_WS_AUTH_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            }
          })
          .then(function(r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function(result) {
            if (result.valid && result.user && (result.user.status === 'approved' || result.user.role === 'superadmin')) {
              _wsAuthToken = token;
              _wsAuthUser = result.user;
              _wsAuthVerified = true;
              _wsSyncToStorage(token, JSON.stringify(result.user), Date.now().toString());
              if (cb) cb(true);
            } else {
              _wsShowAuthWall();
              if (cb) cb(false);
            }
          })
          .catch(function() {
            // 네트워크 오류 시 admin_password 있으면 허용
            if (pageData.hasAdminPw && pageData.adminPw) {
              _wsAuthVerified = true;
              try { _wsAuthUser = JSON.parse(pageData.user); } catch(e) {
                _wsAuthUser = { email: 'admin', role: 'superadmin', status: 'approved' };
              }
              if (cb) cb(true);
            } else {
              _wsShowAuthWall();
              if (cb) cb(false);
            }
          });
        } else if (pageData.hasAdminPw && pageData.adminPw) {
          // admin_password만 있는 경우 (구 인증 시스템) → 허용
          _wsAuthVerified = true;
          _wsAuthUser = { email: 'admin', role: 'superadmin', status: 'approved' };
          if (cb) cb(true);
        } else {
          _wsShowAuthWall();
          if (cb) cb(false);
        }
      });
    }

    // chrome.storage에 토큰 동기화 (다음번 빠른 인증용)
    function _wsSyncToStorage(token, user, loginTime) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            ws_token: token,
            ws_user: user,
            ws_login_time: loginTime || Date.now().toString()
          });
        }
      } catch(e) {}
    }
  }

  // 인증 안내 화면 표시
  function _wsShowAuthWall() {
    // 기존 월을 제거 (중복 방지)
    var existing = document.getElementById('ws-auth-wall');
    if (existing) existing.remove();

    var wall = document.createElement('div');
    wall.id = 'ws-auth-wall';
    wall.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;background:rgba(7,11,7,.97);display:flex;align-items:center;justify-content:center;font-family:Segoe UI,sans-serif';
    wall.innerHTML = '<div style="text-align:center;max-width:400px;padding:40px">'
      + '<div style="font-size:64px;margin-bottom:20px">🔒</div>'
      + '<div style="font-size:24px;font-weight:800;color:#4CAF50;margin-bottom:8px">WISHES Admin</div>'
      + '<div style="font-size:14px;color:#7a9a7a;margin-bottom:32px">이 기능을 사용하려면 로그인이 필요합니다.<br>관리자 승인을 받은 계정만 이용할 수 있습니다.</div>'
      + '<a href="https://wishes.co.kr/admin/admin-auth.html" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2D5A27,#4CAF50);color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;transition:all .3s">로그인 하기</a>'
      + '<div style="margin-top:20px;font-size:11px;color:#4a6a4a">계정이 없으시면 회원가입 후 관리자 승인을 받으세요</div>'
      + '</div>';
    document.body.appendChild(wall);
  }

  // 인증 후 확장 초기화
  function _wsInitAfterAuth() {
    var authWall = document.getElementById('ws-auth-wall');
    if (authWall) authWall.remove();
    _wsBootExtension();
  }

  // 인증 체크 시작
  _wsCheckAuth(function(authed) {
    if (authed) {
      _wsInitAfterAuth();
    }
    // 미인증 시 auth wall이 이미 표시됨
  });

  // 확장 메인 기능을 함수로 래핑
  function _wsBootExtension() {

  // ============================================================================
  // A) CONSTANTS - ALL FILTER OPTIONS
  // ============================================================================

  const REGIONS = {
    '전국': [],
    '서울': [
      '강남구', '강동구', '강북구', '강서구', '관악구', '광진구',
      '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구',
      '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구',
      '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
    ],
    '경기': [
      '가평군', '고양시', '과천시', '광명시', '광주시', '구리시',
      '군포시', '김포시', '남양주시', '동두천시', '부천시', '성남시',
      '수원시', '순천시', '시흥시', '안산시', '안성시', '안양시',
      '양주시', '양평군', '여주시', '연천군', '오산시', '용인시',
      '의왕시', '의정부시', '이천시', '파주시', '평택시', '포천시',
      '하남시', '화성시'
    ],
    '인천': [
      '강화군', '계양구', '남동구', '남구', '동구', '미추홀구',
      '부평구', '서구', '연수구', '옹진군', '중구'
    ],
    '강원': [
      '강릉시', '고성군', '동해시', '삼척시', '속초시', '양구군',
      '양양군', '영월군', '원주시', '인제군', '정선군', '철원군',
      '춘천시', '태백시', '평창군', '홍천군', '화천군', '횡성군'
    ],
    '대전': ['대덕구', '동구', '서구', '유성구', '중구'],
    '세종': [],
    '충남': [
      '계룡시', '공주시', '금산군', '논산시', '당진시', '보령시',
      '부여군', '서산시', '서천군', '아산시', '예산군', '천안시',
      '청양군', '태안군', '홍성군'
    ],
    '충북': [
      '괴산군', '단양군', '보은군', '영동군', '옥천군',
      '음성군', '제천시', '증평군', '진천군', '청주시', '충주시'
    ],
    '부산': [
      '강서구', '금정구', '기장군', '남구', '동구', '동래구',
      '부산진구', '북구', '사상구', '사하구', '서구', '수영구',
      '연제구', '영도구', '중구'
    ],
    '울산': ['남구', '동구', '북구', '중구', '울주군'],
    '경남': [
      '거제시', '거창군', '고성군', '김해시', '남해군', '밀양시',
      '사천시', '산청군', '양산시', '의령군', '진주시', '창녕군',
      '창원시', '통영시', '하동군', '함안군', '함양군', '합천군'
    ],
    '경북': [
      '경산시', '경주시', '고령군', '구미시', '군위군', '김천시',
      '문경시', '봉화군', '상주시', '성주군', '안동시', '영덕군',
      '영양군', '영주시', '영천시', '예천군', '울릉군', '울진군',
      '포항시'
    ],
    '대구': ['남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구'],
    '광주': ['광산구', '남구', '동구', '북구', '서구'],
    '전남': [
      '강진군', '고흥군', '곡성군', '광양시', '구례군', '나주시',
      '담양군', '목포시', '무안군', '보성군', '순천시', '신안군',
      '영광군', '영암군', '완도군', '여수시', '장성군',
      '장흥군', '진도군', '함평군', '해남군', '화순군'
    ],
    '전북': [
      '고창군', '군산시', '김제시', '남원시', '무주군', '부안군',
      '순창군', '완주군', '익산시', '임실군', '장수군', '전주시',
      '정읍시', '진안군'
    ],
    '제주': ['서귀포시', '제주시']
  };

  const TYPES = ['전체', '원룸', '오피스텔', '아파트', '사무실', '상가', '빌라', '토지'];
  const DEALS = ['전체', '월세', '전세', '전월세', '매매'];
  const FLOORS = ['전체', '지상', '지하', '반지하', '옥탑', '단독'];
  const ROOMS = ['전체', '1개', '1.5개', '1-2개', '2개', '2-3개', '3개'];
  const SHAPES = ['전체', '오픈형', '분리형', '복층형', '원룸원거실', '세미분리형'];
  const YEARS = [
    '전체', '2026년 이후', '2025년 이후', '2024년 이후',
    '2023년 이후', '2022년 이후', '2021년 이후', '2020년 이후',
    '2019년 이후', '2018년 이후', '2015년 이후', '2010년 이후',
    '2005년 이후', '2000년 이후'
  ];
  const LIVING_SIZES = ['전체', '거실(대)', '거실(중)', '거실(소)'];
  const DIRECTIONS = [
    '전체', '남향', '남동향', '남서향', '동향', '서향',
    '북향', '북동향', '북서향'
  ];
  const PARKING = ['전체', '1대 이상', '2대 이상', '3대 이상', '4대 이상', '5대 이상'];

  const SORT_OPTIONS = [
    { value: 'latest', label: '최신순' },
    { value: 'views', label: '조회순' },
    { value: 'price_low', label: '가격낮음순' },
    { value: 'price_high', label: '가격높음순' },
    { value: 'area_low', label: '면적작은순' },
    { value: 'area_high', label: '면적큰순' }
  ];

  const SORT2_OPTIONS = [
    { value: 'none', label: '추가정렬없음' },
    { value: 'latest', label: '최신순' },
    { value: 'views', label: '조회순' },
    { value: 'price_low', label: '가격낮음순' },
    { value: 'price_high', label: '가격높음순' }
  ];

  // ============================================================================
  // B) STATE OBJECT - ALL FILTER STATE
  // ============================================================================

  window.WS = window.WS || {};

  // 권한 체크 헬퍼 - superadmin 여부 확인
  window.WS.isSuperAdmin = function() {
    return _wsAuthUser && _wsAuthUser.role === 'superadmin';
  };

  window.WS.state = {
    // View and navigation
    viewMode: 'search',          // 'search' or 'detail'
    activeRegion: '전국',         // Currently selected region
    selectedRegions: [],          // Array of selected region strings for filtering
    selectedDongs: [],            // Array of selected dong strings for filtering
    addrType: 'all',             // 'all', 'district', 'jibun'

    // Type filters
    typeTab: '전체',              // Selected property type (legacy - kept for compatibility)
    typeTabs: [],                 // Multi-select property types (e.g., ['원룸', '오피스텔'])
    deal: '전체',                 // Rental type (legacy - kept for compatibility)
    deals: [],                    // Multi-select deal types (e.g., ['월세', '전세'])
    floor: '전체',                // Floor type
    roomCount: '전체',            // Number of rooms (legacy - kept for compatibility)
    roomCounts: [],               // Multi-select room counts (e.g., ['1개', '2개'])
    roomShape: '전체',            // Room layout shape
    builtYear: '전체',            // Construction year filter
    direction: '전체',            // Direction/exposure
    parking: '전체',              // Parking availability
    livingSize: '전체',           // Living room size

    // Checkbox filters
    checks: {
      buildingPhoto: false,       // Has building photos
      interiorPhoto: false,       // Has interior photos
      video: false,               // Has video
      shortTerm: false,           // Short-term available
      parkingAvailable: false,    // Has parking
      emptyNow: false,            // Available now
      balcony: false,             // Has balcony
      noFullOption: false,        // No full option (empty)
      fullOptionOnly: false,      // Full option only
      elevator: false,            // Has elevator
      priceNego: false,           // Price negotiable
      loanAvailable: false        // Loan available
    },

    // Price filters
    minBasePrice: '',
    maxBasePrice: '',
    minDeposit: '',
    maxDeposit: '',
    minMonthly: '',
    maxMonthly: '',
    includeMgmt: false,           // Include maintenance fee in monthly price
    minSalePrice: '',
    maxSalePrice: '',

    // Area filters
    minArea: '',
    maxArea: '',
    areaUnit: 'm2',              // 'm2' or 'pyeong'
    minSupply: '',
    maxSupply: '',
    supplyUnit: 'm2',            // 'm2' or 'pyeong'

    // Search and sort
    keyword: '',                  // Free text search
    sortBy: 'latest',            // Primary sort
    sort2: 'none',               // Secondary sort
    perPage: 20,
    page: 1,

    // UI state
    favorites: [],               // Favorite listing IDs from localStorage
    selectedIds: new Set(),      // Currently selected listings
    hideImages: false,           // Hide images in list view
    memos: (function() { try { return JSON.parse(localStorage.getItem('ws-memos') || '{}'); } catch(e) { return {}; } })(),
    // 매물별 연락처 관리 (호명 시스템)
    // 구조: { "listing_id": [ { role: "사장", name: "홍길동", phone: "010-1234-5678", memo: "통화가능 오후2시이후" }, ... ] }
    contacts: (function() { try { return JSON.parse(localStorage.getItem('ws-contacts') || '{}'); } catch(e) { return {}; } })()
  };

  // ============================================================================
  // C) HELPER FUNCTIONS
  // ============================================================================

  /**
   * Format price value into Korean units (억/만원)
   * @param {number} value - Price in won
   * @returns {string} Formatted price string
   */
  function formatSinglePrice(value) {
    if (!value || value === 0) return '-';
    if (value >= 10000) {
      const eok = Math.floor(value / 10000);
      const man = value % 10000;
      return man > 0 ? `${eok}억${man}` : `${eok}억`;
    }
    return `${value}만`;
  }

  /**
   * Format price based on deal type
   * @param {number} deposit - Deposit amount
   * @param {number} monthly - Monthly rent
   * @param {number} price - Sale price
   * @param {string} deal - Deal type
   * @returns {string} Formatted price string
   */
  function formatPrice(deposit, monthly, price, deal) {
    if (deal === '매매') {
      return formatSinglePrice(price);
    }
    if (deal === '전세') {
      return formatSinglePrice(deposit);
    }
    if (deal === '월세') {
      const dep = formatSinglePrice(deposit);
      const mon = formatSinglePrice(monthly);
      return `${dep}/${mon}`;
    }
    if (deal === '전월세') {
      const dep = formatSinglePrice(deposit);
      const mon = formatSinglePrice(monthly);
      return `${dep}/${mon}`;
    }
    return '-';
  }

  /**
   * Convert square meters to pyeong (1 pyeong = 3.3 m²)
   * @param {number} m2 - Area in square meters
   * @returns {number} Area in pyeong
   */
  function m2ToPy(m2) {
    return m2 ? Math.round(m2 / 3.30579 * 10) / 10 : 0;
  }

  /**
   * Convert pyeong to square meters
   * @param {number} py - Area in pyeong
   * @returns {number} Area in square meters
   */
  function pyToM2(py) {
    return py ? Math.round(py * 3.30579 * 10) / 10 : 0;
  }

  /**
   * Format area with both m² and pyeong
   * @param {number} m2 - Area in square meters
   * @returns {string} Formatted area string
   */
  function formatArea(m2) {
    if (!m2) return '-';
    const py = m2ToPy(m2);
    return `${m2}m² (${py}평)`;
  }

  /**
   * Calculate relative time (e.g., "2시간 전", "3일 전")
   * @param {string} dateStr - ISO date string
   * @returns {string} Relative time string
   */
  function timeAgo(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return '방금 전';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}일 전`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}개월 전`;
    return `${Math.floor(seconds / 31536000)}년 전`;
  }

  /**
   * Sort listings array by various criteria
   * @param {Array} arr - Array of listings
   * @param {string} sortBy - Sort criteria
   * @returns {Array} Sorted array
   */
  function sortListings(arr, sortBy) {
    if (!arr || arr.length === 0) return arr;

    const copy = [...arr];
    const basePrice = (listing) => {
      const deal = listing.deal || '';
      if (deal === '매매') return listing.price || 0;
      if (deal === '전세') return listing.deposit || 0;
      return (listing.deposit || 0) * 100 + (listing.monthly || 0);
    };

    switch (sortBy) {
      case 'latest':
        return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      case 'views':
        return copy.sort((a, b) => (b.views || 0) - (a.views || 0));
      case 'price_low':
        return copy.sort((a, b) => basePrice(a) - basePrice(b));
      case 'price_high':
        return copy.sort((a, b) => basePrice(b) - basePrice(a));
      case 'area_low':
        return copy.sort((a, b) => (a.area_m2 || 0) - (b.area_m2 || 0));
      case 'area_high':
        return copy.sort((a, b) => (b.area_m2 || 0) - (a.area_m2 || 0));
      default:
        return copy;
    }
  }

  /**
   * Get parking count from listing (parsed from string or boolean)
   * @param {object} listing - Listing object
   * @returns {number} Parking count
   */
  function getParkingCount(listing) {
    if (!listing.parking) return 0;
    if (listing.parking === true) return 1;
    if (typeof listing.parking === 'string') {
      const match = listing.parking.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    }
    return 0;
  }

  /**
   * Extract year from built_year string
   * @param {string} builtYearStr - Built year string
   * @returns {number} Year as number
   */
  function getBuiltYear(builtYearStr) {
    if (!builtYearStr && builtYearStr !== 0) return null;
    var s = String(builtYearStr);
    var match = s.match(/\d{4}/);
    return match ? parseInt(match[0], 10) : null;
  }

  // ============================================================================
  // D) FILTER FUNCTION - APPLIES ALL FILTERS
  // ============================================================================

  /**
   * Main filter function that applies all active filters to listings
   * @param {Array} allListings - All listings from API
   * @returns {Array} Filtered listings
   */
  function applyFilters(allListings) {
    if (!allListings || allListings.length === 0) return [];

    let filtered = [...allListings];
    const s = window.WS.state;

    // 1. TYPE FILTER (multi-select support)
    if (s.typeTabs && s.typeTabs.length > 0) {
      filtered = filtered.filter(l => s.typeTabs.includes(l.type || ''));
    } else if (s.typeTab !== '전체') {
      filtered = filtered.filter(l => (l.type || '') === s.typeTab);
    }

    // 2. DEAL TYPE FILTER (multi-select support)
    if (s.deals && s.deals.length > 0) {
      filtered = filtered.filter(l => s.deals.includes(l.deal || ''));
    } else if (s.deal !== '전체') {
      filtered = filtered.filter(l => (l.deal || '') === s.deal);
    }

    // 3. FLOOR TYPE FILTER (B1 format 지원: "B1/5층", "B2/3층" 등)
    if (s.floor !== '전체') {
      filtered = filtered.filter(l => {
        const floor = l.floor_current ? l.floor_current.toString() : '';
        switch (s.floor) {
          case '지상': return floor !== '' && !floor.includes('지하') && !floor.includes('반') && !/^B\d/i.test(floor);
          case '지하': return floor.includes('지하') || /^B\d/i.test(floor);
          case '반지하': return floor.includes('반지하') || /^B0\.5/i.test(floor) || floor.includes('반');
          case '옥탑': return floor.includes('옥') || floor.includes('PH') || /penthouse/i.test(floor);
          case '단독': return floor === '단독' || floor.includes('단독');
          default: return true;
        }
      });
    }

    // 4. ROOM COUNT FILTER (multi-select support)
    var activeRoomCounts = (s.roomCounts && s.roomCounts.length > 0) ? s.roomCounts : (s.roomCount !== '전체' ? [s.roomCount] : []);
    if (activeRoomCounts.length > 0) {
      filtered = filtered.filter(l => {
        const rooms = l.rooms || 0;
        return activeRoomCounts.some(function(rc) {
          switch (rc) {
            case '1개': return rooms === 1;
            case '1.5개': return rooms === 1.5;
            case '1-2개': return rooms >= 1 && rooms <= 2;
            case '2개': return rooms === 2;
            case '2-3개': return rooms >= 2 && rooms <= 3;
            case '3개': return rooms === 3;
            default: return true;
          }
        });
      });
    }

    // 5. DIRECTION FILTER (DB 데이터 전부 null - 데이터 존재 시에만 필터링)
    if (s.direction !== '전체') {
      var hasDirectionData = filtered.some(function(l) { return l.direction && l.direction !== ''; });
      if (hasDirectionData) {
        filtered = filtered.filter(l => (l.direction || '') === s.direction);
      }
    }

    // 6. PARKING FILTER
    if (s.parking !== '전체') {
      filtered = filtered.filter(l => {
        const count = getParkingCount(l);
        const num = parseInt(s.parking, 10);
        return count >= num;
      });
    }

    // 7. BUILT YEAR FILTER
    if (s.builtYear !== '전체') {
      const yearMatch = s.builtYear.match(/\d{4}/);
      const yearThreshold = yearMatch ? parseInt(yearMatch[0], 10) : null;
      if (yearThreshold) {
        filtered = filtered.filter(l => {
          const year = getBuiltYear(l.built_year);
          return year && year >= yearThreshold;
        });
      }
    }

    // 8. ROOM SHAPE FILTER (DB 컬럼 없음 - 데이터 존재 시에만 필터링)
    if (s.roomShape !== '전체') {
      var hasRoomShapeData = filtered.some(function(l) { return l.room_shape || l.roomShape; });
      if (hasRoomShapeData) {
        filtered = filtered.filter(l => {
          const shape = l.room_shape || l.roomShape || '';
          return shape === s.roomShape;
        });
      }
      // 데이터 없으면 필터 무시 (전체 목록 유지)
    }

    // 8-1. LIVING SIZE FILTER (DB 컬럼 없음 - 데이터 존재 시에만 필터링)
    if (s.livingSize !== '전체') {
      var hasLivingSizeData = filtered.some(function(l) { return l.living_size || l.livingSize; });
      if (hasLivingSizeData) {
        filtered = filtered.filter(l => {
          const size = l.living_size || l.livingSize || '';
          return size === s.livingSize;
        });
      }
    }

    // 8-2. SHORT TERM FILTER (DB 컬럼 없음 - 데이터 존재 시에만 필터링)
    if (s.checks.shortTerm) {
      var hasShortTermData = filtered.some(function(l) { return l.short_term === true; });
      if (hasShortTermData) {
        filtered = filtered.filter(l => l.short_term === true);
      }
    }

    // 8-3. PRICE NEGOTIABLE FILTER
    if (s.checks.priceNego) {
      filtered = filtered.filter(l => l.price_nego === true || l.negotiable === true);
    }

    // 9. CHECKBOX FILTERS
    if (s.checks.buildingPhoto) {
      filtered = filtered.filter(l => (l.images && l.images.length > 0) || (l.listing_images && l.listing_images.length > 0));
    }
    if (s.checks.interiorPhoto) {
      filtered = filtered.filter(l => (l.images && l.images.length > 0) || (l.listing_images && l.listing_images.length > 0));
    }
    if (s.checks.video) {
      // 영상 필터 (DB 데이터 없음 - 데이터 존재 시에만 필터링)
      var hasVideoData = filtered.some(function(l) { return l.has_video === true; });
      if (hasVideoData) {
        filtered = filtered.filter(l => l.has_video === true);
      }
    }
    if (s.checks.parkingAvailable) {
      filtered = filtered.filter(l => l.parking === true);
    }
    if (s.checks.emptyNow) {
      filtered = filtered.filter(l => l.status === '가용');
    }
    if (s.checks.balcony) {
      // 발코니 필터 (DB 데이터 전부 false - 데이터 존재 시에만 필터링)
      var hasBalconyData = filtered.some(function(l) { return l.balcony === true; });
      if (hasBalconyData) {
        filtered = filtered.filter(l => l.balcony === true);
      }
    }
    if (s.checks.elevator) {
      filtered = filtered.filter(l => l.elevator === true);
    }
    if (s.checks.loanAvailable) {
      filtered = filtered.filter(l => l.loan_available === true);
    }
    if (s.checks.noFullOption) {
      // 풀옵션 필터 (DB 데이터 전부 false - 데이터 존재 시에만 필터링)
      var hasFullOptData = filtered.some(function(l) { return l.full_option === true; });
      if (hasFullOptData) {
        filtered = filtered.filter(l => l.full_option === false);
      }
    }
    if (s.checks.fullOptionOnly) {
      var hasFullOptData2 = filtered.some(function(l) { return l.full_option === true; });
      if (hasFullOptData2) {
        filtered = filtered.filter(l => l.full_option === true);
      }
    }

    // 10. REGION FILTER (구/군 + 동 단위)
    if (s.selectedDongs && s.selectedDongs.length > 0) {
      // 동 단위 필터가 있으면 동 기준으로 필터링
      filtered = filtered.filter(l => {
        var address = (l.address || '') + ' ' + (l.dong || '');
        return s.selectedDongs.some(function(dongKey) {
          var parts = dongKey.split(' ');
          var region = parts[0];
          var dong = parts[1];
          return address.includes(region) && address.includes(dong);
        });
      });
    } else if (s.selectedRegions && s.selectedRegions.length > 0) {
      filtered = filtered.filter(l => {
        const address = (l.address || '') + (l.dong || '');
        return s.selectedRegions.some(region => address.includes(region));
      });
    }

    // 11. DEPOSIT PRICE FILTER
    if (s.minDeposit !== '' || s.maxDeposit !== '') {
      filtered = filtered.filter(l => {
        const deposit = l.deposit || 0;
        const min = s.minDeposit !== '' ? parseInt(s.minDeposit, 10) : -Infinity;
        const max = s.maxDeposit !== '' ? parseInt(s.maxDeposit, 10) : Infinity;
        return deposit >= min && deposit <= max;
      });
    }

    // 12. MONTHLY PRICE FILTER (with optional maintenance fee)
    if (s.minMonthly !== '' || s.maxMonthly !== '') {
      filtered = filtered.filter(l => {
        let monthlyPrice = l.monthly || 0;
        if (s.includeMgmt && l.maintenance_fee) {
          monthlyPrice += l.maintenance_fee;
        }
        const min = s.minMonthly !== '' ? parseInt(s.minMonthly, 10) : -Infinity;
        const max = s.maxMonthly !== '' ? parseInt(s.maxMonthly, 10) : Infinity;
        return monthlyPrice >= min && monthlyPrice <= max;
      });
    }

    // 13. SALE PRICE FILTER
    if (s.minSalePrice !== '' || s.maxSalePrice !== '') {
      filtered = filtered.filter(l => {
        const price = l.price || 0;
        const min = s.minSalePrice !== '' ? parseInt(s.minSalePrice, 10) : -Infinity;
        const max = s.maxSalePrice !== '' ? parseInt(s.maxSalePrice, 10) : Infinity;
        return price >= min && price <= max;
      });
    }

    // 14. BASE PRICE FILTER (all price types)
    if (s.minBasePrice !== '' || s.maxBasePrice !== '') {
      filtered = filtered.filter(l => {
        let basePrice = 0;
        if (l.deal === '매매') {
          basePrice = l.price || 0;
        } else if (l.deal === '전세') {
          basePrice = l.deposit || 0;
        } else {
          basePrice = (l.deposit || 0) * 100 + (l.monthly || 0);
        }
        const min = s.minBasePrice !== '' ? parseInt(s.minBasePrice, 10) : -Infinity;
        const max = s.maxBasePrice !== '' ? parseInt(s.maxBasePrice, 10) : Infinity;
        return basePrice >= min && basePrice <= max;
      });
    }

    // 15. AREA FILTER
    if (s.minArea !== '' || s.maxArea !== '') {
      filtered = filtered.filter(l => {
        let area = l.area_m2 || 0;
        if (s.areaUnit === 'pyeong') {
          area = m2ToPy(area);
        }
        const min = s.minArea !== '' ? parseFloat(s.minArea) : -Infinity;
        const max = s.maxArea !== '' ? parseFloat(s.maxArea) : Infinity;
        return area >= min && area <= max;
      });
    }

    // 16. SUPPLY AREA FILTER
    if (s.minSupply !== '' || s.maxSupply !== '') {
      filtered = filtered.filter(l => {
        let area = l.area_supply_m2 || 0;
        if (s.supplyUnit === 'pyeong') {
          area = m2ToPy(area);
        }
        const min = s.minSupply !== '' ? parseFloat(s.minSupply) : -Infinity;
        const max = s.maxSupply !== '' ? parseFloat(s.maxSupply) : Infinity;
        return area >= min && area <= max;
      });
    }

    // 17. KEYWORD SEARCH (매물번호 검색 지원)
    if (s.keyword && s.keyword.trim() !== '') {
      const kw = s.keyword.trim();
      // 매물번호 패턴 체크: 매물번호 14115, 14115 등
      const idMatch = kw.match(/^[Ww]-?(\d+)$/);
      const isNumericId = /^\d+$/.test(kw);
      if (idMatch || isNumericId) {
        const searchId = parseInt(idMatch ? idMatch[1] : kw, 10);
        filtered = filtered.filter(l => l.id === searchId);
      } else {
        const kwLower = kw.toLowerCase();
        filtered = filtered.filter(l => {
          const searchFields = [
            l.title || '',
            l.address || '',
            l.address_detail || '',
            l.dong || '',
            l.building_name || '',
            l.description || '',
            '매물번호 ' + l.id
          ].map(f => f.toLowerCase()).join(' ');
          return searchFields.includes(kwLower);
        });
      }
    }

    // 18. JIBUN RANGE FILTER
    if (s.jibunStart || s.jibunEnd) {
      filtered = filtered.filter(l => {
        var addr = (l.address || '') + ' ' + (l.address_detail || '');
        if (s.jibunStart && s.jibunEnd) {
          return addr.includes(s.jibunStart) || addr.includes(s.jibunEnd);
        }
        if (s.jibunStart) return addr.includes(s.jibunStart);
        if (s.jibunEnd) return addr.includes(s.jibunEnd);
        return true;
      });
    }

    // 19. BUILDING NAME FILTER
    if (s.buildingName) {
      var bName = s.buildingName.toLowerCase();
      filtered = filtered.filter(l => {
        var name = ((l.building_name || '') + ' ' + (l.title || '')).toLowerCase();
        return name.includes(bName);
      });
    }

    // 20. BUILDING ID FILTER
    if (s.buildingId) {
      filtered = filtered.filter(l => String(l.id) === s.buildingId);
    }

    // 21. APPLY SORT (primary + secondary as tiebreaker)
    if (s.sort2 !== 'none') {
      // Sort by secondary first, then stable-sort by primary
      // This makes secondary act as tiebreaker within equal primary values
      filtered = sortListings(filtered, s.sort2);
    }
    filtered = sortListings(filtered, s.sortBy);

    // 22. DEDUPLICATION - 소재지(지번주소)+동호수+거래유형+가격 동일 매물 중복 제거
    // address = 지번주소 전체 (예: 서울특별시 관악구 신림동 246-1)
    // address_detail = 동/호수 (예: 1층 일부(102호))
    var seen = {};
    filtered = filtered.filter(function(l) {
      var addr = (l.address || '').trim();
      var detail = (l.address_detail || '').trim();
      var deal = (l.deal || '').trim();
      var dep = String(l.deposit || 0);
      var mon = String(l.monthly || 0);
      var pr = String(l.price || 0);
      var key = addr + '|' + detail + '|' + deal + '|' + dep + '|' + mon + '|' + pr;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    return filtered;
  }

  /**
   * HTML escape helper to prevent XSS
   */
  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /**
   * Safe localStorage.setItem wrapper (QuotaExceededError 방지)
   */
  function _safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch(e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        if (window.WS && window.WS.showToast) {
          window.WS.showToast('⚠️ 저장공간이 부족합니다. 백업/복원에서 불필요한 데이터를 정리해주세요.', 'warning');
        }
      }
      return false;
    }
  }

  /**
   * Non-blocking toast notification (replaces alert)
   */
  function showToast(message, type) {
    type = type || 'success';
    var existing = document.getElementById('ws-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'ws-toast';
    var bgColor = type === 'success' ? '#2D5A27' : type === 'warning' ? '#FF9800' : '#e53e3e';
    var icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌';
    toast.style.cssText = 'position:fixed;top:12px;right:16px;background:' + bgColor + ';color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:500;z-index:100002;box-shadow:0 2px 8px rgba(0,0,0,0.15);opacity:0;transition:opacity 0.3s ease;max-width:320px;';
    toast.textContent = icon + ' ' + message;
    setTimeout(function() { toast.style.opacity = '1'; }, 10);
    document.body.appendChild(toast);

    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s ease';
      setTimeout(function() { if (toast.parentElement) toast.remove(); }, 400);
    }, 2500);
  }
  window.WS.showToast = showToast;

  // Store helpers globally
  window.WS.formatSinglePrice = formatSinglePrice;
  window.WS.formatPrice = formatPrice;
  window.WS.m2ToPy = m2ToPy;
  window.WS.pyToM2 = pyToM2;
  window.WS.formatArea = formatArea;
  window.WS.timeAgo = timeAgo;
  window.WS.sortListings = sortListings;
  window.WS.getParkingCount = getParkingCount;
  window.WS.getBuiltYear = getBuiltYear;
  window.WS.applyFilters = applyFilters;

  // ============================================================================
  // AUTO DEDUP ENGINE - 자동 중복 매물 제거
  // 기준: 소재지(지번주소 전체) + 동/호수(address_detail) + 거래유형 + 가격
  // 이미지 유무, 사진 수까지 비교하여 더 정보가 많은 매물을 보존
  // 데이터 로드 시 자동 실행, 제거 결과를 토스트로 알림
  // ============================================================================
  window.WS._dedupNotifiedOnce = false; // 첫 로드에서만 토스트 알림

  window.WS._autoDedup = function(items, silent) {
    if (!items || items.length === 0) return items;

    var groups = {};
    items.forEach(function(l) {
      var addr = (l.address || '').trim();
      var detail = (l.address_detail || '').trim();
      var deal = (l.deal || '').trim();
      var dep = String(l.deposit || 0);
      var mon = String(l.monthly || 0);
      var pr = String(l.price || 0);
      var key = addr + '|' + detail + '|' + deal + '|' + dep + '|' + mon + '|' + pr;
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    });

    var kept = [];
    var removed = [];

    Object.keys(groups).forEach(function(key) {
      var arr = groups[key];
      if (arr.length === 1) {
        kept.push(arr[0]);
        return;
      }
      // 2건 이상: 가장 좋은 매물 1건만 보존
      // 우선순위: 사진 많은 것 > 최신 ID(가장 높은 ID)
      arr.sort(function(a, b) {
        var aImgs = (a.images || a.listing_images || []).length;
        var bImgs = (b.images || b.listing_images || []).length;
        if (bImgs !== aImgs) return bImgs - aImgs; // 사진 많은 순
        return (b.id || 0) - (a.id || 0); // 최신 ID 순
      });
      kept.push(arr[0]); // 첫 번째(최우선) 보존
      for (var i = 1; i < arr.length; i++) {
        removed.push({
          id: arr[i].id,
          address: arr[i].address,
          detail: arr[i].address_detail,
          deal: arr[i].deal,
          deposit: arr[i].deposit,
          monthly: arr[i].monthly,
          price: arr[i].price,
          keptId: arr[0].id,
          reason: '동일매물(소재지+동호수+거래+가격)'
        });
      }
    });

    // 중복 제거 로그 저장 (최근 1회분)
    window.WS._lastDedupLog = {
      timestamp: new Date().toISOString(),
      totalBefore: items.length,
      totalAfter: kept.length,
      removedCount: removed.length,
      removed: removed
    };

    // 콘솔 로그
    if (removed.length > 0) {
      _wsLog('[WISHES-DEDUP] ' + removed.length + '건 중복 제거 완료 (' + items.length + ' → ' + kept.length + ')');
      _wsLog(removed.slice(0, 20));
    }

    // 토스트 알림: 첫 로드에서만 1회 표시, 이후 자동 새로고침은 콘솔만
    if (removed.length > 0 && !silent && !window.WS._dedupNotifiedOnce) {
      window.WS._dedupNotifiedOnce = true;
      setTimeout(function() {
        showToast('중복 ' + removed.length + '건 제거 (' + items.length + '→' + kept.length + ')', 'success');
      }, 800);
    }

    return kept;
  };

  // (미사용 showDedupLog 함수 제거됨 — 중복 제거 결과는 콘솔 로그로 확인)

  // ============================================================================
  // DUPLICATE WATCHDOG - 중복 의심 매물 실시간 감시 엔진
  // 자동 새로고침 시마다 실행, 의심 매물 발견 시 팝업 알림
  // ============================================================================
  window.WS._dupWatchdog = function(items) {
    if (!items || items.length < 2) return;

    // 1단계: 엄격 중복 (이미 _autoDedup에서 처리됨, 여기는 의심 매물 감지)
    // 2단계: 주소+거래+가격은 같지만 동호수가 다른 경우 → "의심" 매물
    var suspectGroups = {};
    items.forEach(function(l) {
      var addr = (l.address || '').trim();
      var deal = (l.deal || '').trim();
      var dep = String(l.deposit || 0);
      var mon = String(l.monthly || 0);
      var pr = String(l.price || 0);
      var looseKey = addr + '|' + deal + '|' + dep + '|' + mon + '|' + pr;
      if (!suspectGroups[looseKey]) suspectGroups[looseKey] = [];
      suspectGroups[looseKey].push(l);
    });

    var suspects = [];
    Object.keys(suspectGroups).forEach(function(key) {
      var arr = suspectGroups[key];
      if (arr.length < 2) return;
      // 같은 주소+거래+가격인데 2건 이상 → 동호수만 다른 진짜 다른 매물일수도, 중복일수도
      // address_detail이 다른 경우만 의심으로 분류
      var details = {};
      arr.forEach(function(l) { details[(l.address_detail||'').trim()] = true; });
      if (Object.keys(details).length < arr.length) {
        // 같은 동호수가 있으면 이미 _autoDedup에서 제거됨, 무시
        return;
      }
      // 동호수가 전부 다르지만 전부 비어있거나 매우 유사하면 의심
      var emptyCount = arr.filter(function(l) { return !(l.address_detail||'').trim(); }).length;
      if (emptyCount >= 2) {
        // 동호수가 비어있는 매물이 2건 이상 → 높은 의심
        suspects.push({
          address: arr[0].address,
          deal: arr[0].deal,
          deposit: arr[0].deposit,
          monthly: arr[0].monthly,
          price: arr[0].price,
          items: arr,
          reason: '동호수 미입력 동일조건 매물 ' + emptyCount + '건'
        });
      }
    });

    // 이전 알림과 비교 (같은 의심건은 다시 안 띄움)
    var prevSuspectKeys = window.WS._prevSuspectKeys || {};
    var newSuspects = suspects.filter(function(s) {
      var ids = s.items.map(function(l) { return l.id; }).sort().join(',');
      if (prevSuspectKeys[ids]) return false;
      prevSuspectKeys[ids] = true;
      return true;
    });
    window.WS._prevSuspectKeys = prevSuspectKeys;

    if (newSuspects.length > 0) {
      window.WS._showDupSuspectAlert(newSuspects);
    }
  };

  // 중복 의심 매물 알림 팝업 (삭제/유지 선택)
  window.WS._showDupSuspectAlert = function(suspects) {
    var existing = document.getElementById('ws-dup-suspect-alert');
    if (existing) existing.remove();

    var totalItems = suspects.reduce(function(s, g) { return s + g.items.length; }, 0);

    var div = document.createElement('div');
    div.id = 'ws-dup-suspect-alert';
    div.style.cssText = 'position:fixed;top:60px;right:20px;width:420px;max-height:80vh;background:#fff;border:2px solid #e53e3e;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.25);z-index:100010;animation:ws-slide-in 0.3s ease;overflow:hidden;display:flex;flex-direction:column;';

    var html = '<div style="background:linear-gradient(135deg,#e53e3e,#c53030);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">';
    html += '<div><div style="font-weight:700;font-size:14px;">⚠️ 중복 의심 매물 감지</div>';
    html += '<div style="font-size:11px;opacity:0.9;margin-top:2px;">' + suspects.length + '그룹 / ' + totalItems + '건 · ' + new Date().toLocaleTimeString('ko-KR') + '</div></div>';
    html += '<button class="ws-suspect-close" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;">&times;</button>';
    html += '</div>';
    html += '<div style="padding:8px 12px;overflow-y:auto;flex:1;">';

    suspects.forEach(function(group, gi) {
      html += '<div style="margin-bottom:12px;border:1px solid #fdd;border-radius:8px;overflow:hidden;">';
      html += '<div style="background:#fff5f5;padding:8px 12px;font-size:12px;font-weight:600;color:#c53030;">';
      html += '📍 ' + escHtml(group.address || '') + ' · ' + escHtml(group.deal || '') + ' · ';
      html += (group.deal === '매매' ? (group.price||0) + '만' : (group.deposit||0) + '/' + (group.monthly||0));
      html += ' <span style="color:#999;font-weight:400;">(' + group.reason + ')</span></div>';

      group.items.forEach(function(l) {
        html += '<div style="padding:6px 12px;border-top:1px solid #fdd;display:flex;align-items:center;justify-content:space-between;font-size:12px;" data-suspect-id="' + l.id + '">';
        html += '<div style="flex:1;">';
        html += '<span style="color:#666;">#' + l.id + '</span> ';
        html += escHtml(l.address_detail || '(동호수 미입력)');
        html += ' · ' + escHtml(l.title || '');
        html += '</div>';
        html += '<div style="display:flex;gap:4px;flex-shrink:0;">';
        html += '<button class="ws-suspect-keep" data-id="' + l.id + '" style="padding:3px 8px;background:#2D5A27;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">유지</button>';
        if (window.WS.isSuperAdmin()) {
          html += '<button class="ws-suspect-del" data-id="' + l.id + '" style="padding:3px 8px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">삭제</button>';
        }
        html += '</div></div>';
      });
      html += '</div>';
    });

    html += '</div>';
    html += '<div style="padding:8px 12px;background:#f9f9f9;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">';
    html += '<span style="font-size:11px;color:#999;">중복감시 엔진 실행 중</span>';
    html += '<button class="ws-suspect-dismiss" style="padding:4px 12px;background:#888;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">모두 무시</button>';
    html += '</div>';
    div.innerHTML = html;
    document.body.appendChild(div);

    // 이벤트 바인딩
    div.querySelector('.ws-suspect-close').addEventListener('click', function() { div.remove(); });
    div.querySelector('.ws-suspect-dismiss').addEventListener('click', function() { div.remove(); showToast('의심 매물 알림 무시됨', 'success'); });

    div.querySelectorAll('.ws-suspect-keep').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        var row = this.closest('[data-suspect-id]');
        if (row) { row.style.background = '#e8f5e9'; row.innerHTML = '<div style="padding:6px 12px;color:#2D5A27;font-size:12px;">✅ #' + id + ' 유지됨</div>'; }
      });
    });

    div.querySelectorAll('.ws-suspect-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        // allListings에서 제거
        if (window.WS.allListings) {
          window.WS.allListings = window.WS.allListings.filter(function(l) { return String(l.id) !== String(id); });
          window.WS.refresh();
        }
        var row = this.closest('[data-suspect-id]');
        if (row) { row.style.background = '#ffebee'; row.innerHTML = '<div style="padding:6px 12px;color:#e53e3e;font-size:12px;">🗑️ #' + id + ' 목록에서 제거됨</div>'; }
        showToast('매물 #' + id + ' 검색목록에서 제거됨', 'warning');
      });
    });
  };

  window.WS.REGIONS = REGIONS;
  window.WS.TYPES = TYPES;
  window.WS.DEALS = DEALS;
  window.WS.FLOORS = FLOORS;
  window.WS.ROOMS = ROOMS;
  window.WS.SHAPES = SHAPES;
  window.WS.YEARS = YEARS;
  window.WS.LIVING_SIZES = LIVING_SIZES;
  window.WS.DIRECTIONS = DIRECTIONS;
  window.WS.PARKING = PARKING;
  window.WS.SORT_OPTIONS = SORT_OPTIONS;
  window.WS.SORT2_OPTIONS = SORT2_OPTIONS;

  // ============================================================================
  // E) SIDEBAR BUTTON INJECTION
  // ============================================================================

  /**
   * Wait for sidebar to load and inject the search button
   */
  // 검색 UI 오버레이를 숨기는 함수 (React DOM 건드리지 않음)
  function _hideSearchUI() {
    var overlay = document.getElementById('ws-search-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // 사이드바의 '매물 검색' 링크에 이벤트를 바인딩하는 함수
  // 새 버튼을 만들지 않고, 기존 Next.js 링크를 가로채서 확장 검색 UI 호출
  function _bindSearchLinks() {
    var allLinks = document.querySelectorAll('nav a, aside a');
    allLinks.forEach(function(link) {
      if (link.getAttribute('data-ws-bound')) return; // 이미 바인딩됨
      var isSearchLink = false;
      if (link.href && link.href.indexOf('tab=search') !== -1) {
        isSearchLink = true;
      }
      if (link.textContent && link.textContent.trim().replace(/[^가-힣]/g, '') === '매물검색') {
        isSearchLink = true;
      }
      if (isSearchLink) {
        link.setAttribute('data-ws-bound', 'true');
        // 호버 시 데이터 프리페치 시작 (클릭 전에 미리 로딩)
        link.addEventListener('mouseenter', function() {
          if (typeof window.WS.loadData === 'function' && !window.WS._prefetchStarted && !window.WS._loadingData && (!window.WS.allListings || window.WS.allListings.length === 0)) {
            window.WS._prefetchStarted = true;
            window.WS.loadData();
          }
        });
        link.addEventListener('click', function(e) {
          // 데이터 로딩이 아직 안 시작됐으면 즉시 시작
          if (typeof window.WS.loadData === 'function' && !window.WS._loadingData && (!window.WS.allListings || window.WS.allListings.length === 0)) {
            window.WS.loadData();
          }
          setTimeout(function() { window.WS.showSearchUI(); }, 100);
        });
      } else {
        // 다른 탭 링크 클릭 시 검색 오버레이 숨기기
        link.setAttribute('data-ws-bound', 'true');
        link.addEventListener('click', function() {
          _hideSearchUI();
        });
      }
    });
  }

  (function initSearchLinkBinding() {
    const maxAttempts = 50;
    let attempts = 0;

    function tryBind() {
      attempts++;
      var nav = document.querySelector('nav.flex-1.px-4.space-y-2')
        || document.querySelector('aside nav')
        || document.querySelector('aside .flex-1');
      if (!nav) {
        if (attempts < maxAttempts) {
          setTimeout(tryBind, 200);
        }
        return;
      }
      _bindSearchLinks();
    }

    tryBind();

    // URL 변경 감지: 안전한 polling 방식 (Next.js 라우터를 건드리지 않음)
    var _lastURL = location.href;
    function _checkSearchTab() {
      var isSearchContext = location.search.indexOf('tab=search') !== -1
        || location.pathname === '/search'
        || location.pathname.indexOf('/search') === 0;
      if (isSearchContext) {
        // 이미 검색 UI가 표시되어 있으면 스킵
        var overlay = document.getElementById('ws-search-overlay');
        if (!overlay || overlay.style.display === 'none') {
          window.WS.showSearchUI();
        }
      } else {
        // 검색 탭이 아니면 오버레이 숨기기
        _hideSearchUI();
      }
    }
    setInterval(function() {
      if (location.href !== _lastURL) {
        _lastURL = location.href;
        _checkSearchTab();
        // URL이 바뀌었으면 새 링크에도 이벤트 재바인딩
        setTimeout(function() { _bindSearchLinks(); }, 500);
      }
    }, 500);

    // 초기 로드 시 ?tab=search 또는 /search 경로이면 데이터 프리페치 예약 (loadData 정의 후 실행)
    if (location.search.indexOf('tab=search') !== -1
        || location.pathname === '/search'
        || location.pathname.indexOf('/search') === 0) {
      window.WS._prefetchOnReady = true;
    }
    setTimeout(_checkSearchTab, 300);

    // Next.js가 사이드바를 재렌더링할 때 이벤트 재바인딩 (debounced)
    var _sidebarDebounce = null;
    var _sidebarObserver = new MutationObserver(function() {
      if (_sidebarDebounce) clearTimeout(_sidebarDebounce);
      _sidebarDebounce = setTimeout(function() {
        _bindSearchLinks();
      }, 300);
    });
    var aside = document.querySelector('aside') || document.querySelector('nav');
    if (aside) {
      _sidebarObserver.observe(aside, { childList: true, subtree: true });
    }
  })();

  // ============================================================================
  // F) RENDERING FUNCTIONS
  // ============================================================================

  /**
   * Main function - builds complete search UI and renders all content
   */
  window.WS.showSearchUI = function() {
    // React DOM을 절대 건드리지 않는 고정 오버레이 방식
    // document.body에 오버레이를 추가하여 main 영역 위에 표시

    // 중복 호출 방어 (빠른 연속 클릭 시)
    if (window.WS._showingSearchUI) return;
    window.WS._showingSearchUI = true;
    setTimeout(function() { window.WS._showingSearchUI = false; }, 300);

    // 이미 검색 UI가 존재하면 보여주기만 하고 리턴
    var existingUI = document.getElementById('ws-search-overlay');
    if (existingUI) {
      existingUI.style.display = 'block';
      return;
    }

    // 사이드바 너비 감지
    // 사이드바 없으면 0 (/search 페이지용)
    var sidebar = document.querySelector('aside');
    var sidebarWidth = sidebar ? sidebar.offsetWidth : 0;

    // body에 고정 오버레이 추가 (React DOM 건드리지 않음)
    var overlay = document.createElement('div');
    overlay.id = 'ws-search-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:' + sidebarWidth + 'px;right:0;bottom:0;z-index:50;overflow-y:auto;background:#f0f7ed;';
    overlay.innerHTML = `
      <div class="ws-search-container">
        <!-- Header -->
        <div class="ws-header">
          <h1 class="ws-title">WISHES 매물검색</h1>
          <input type="text" class="ws-global-search" placeholder="검색어를 입력하세요">
          <div class="ws-header-buttons">
            <button class="ws-btn ws-btn-secondary" id="ws-btn-reset-all">초기화</button>
            <button class="ws-btn ws-btn-primary" id="ws-btn-search">검색</button>
          </div>
        </div>

        <!-- View Mode Tabs -->
        <div class="ws-view-tabs">
          <button class="ws-tab ws-tab-active" data-view="search">주소검색🔍</button>
          <button class="ws-tab" data-view="map">지도보기🗺️</button>
          <button class="ws-tab" data-view="all">전체보기📋</button>
        </div>

        <!-- Address Search Section -->
        <div class="ws-addr-section">
          <div class="ws-region-tabs" id="ws-region-tabs"></div>
          <div class="ws-districts" id="ws-districts"></div>
          <div class="ws-dongs" id="ws-dongs" style="display:none;"></div>
          <div class="ws-selected-regions" id="ws-selected-regions"></div>
          <div class="ws-jibun-range">
            <input type="text" class="ws-input" placeholder="지번(시작)" id="ws-jibun-start">
            <input type="text" class="ws-input" placeholder="지번(끝)" id="ws-jibun-end">
          </div>
          <div class="ws-building-search">
            <input type="text" class="ws-input" placeholder="건물명 검색" id="ws-building-name">
            <input type="text" class="ws-input" placeholder="건물ID 검색" id="ws-building-id">
          </div>
        </div>

        <!-- Map Placeholder -->
        <div class="ws-map-container" style="display: none;" id="ws-map-container">
          <p>지도 보기</p>
        </div>

        <!-- Type Tabs -->
        <div class="ws-type-tabs" id="ws-type-tabs"></div>

        <!-- Filter Section -->
        <div class="ws-filters-toggle" id="ws-filters-toggle">
          <span>▼ 필터 접기/펼치기</span>
        </div>
        <div class="ws-filters-section" id="ws-filters-section"></div>

        <!-- 매물 관리 통합 대시보드 -->
        <div class="ws-mgmt-dashboard" id="ws-mgmt-dashboard" style="display:flex;gap:4px;margin:6px 4px;flex-wrap:wrap;align-items:center;">
          <div class="ws-mgmt-stat ws-mgmt-stat-active" data-status-filter="all" style="flex:1;min-width:60px;padding:6px 8px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;" id="ws-mgmt-total">0</div>
            <div style="font-size:9px;opacity:0.9;">전체</div>
          </div>
          <div class="ws-mgmt-stat" data-status-filter="공개" style="flex:1;min-width:60px;padding:6px 8px;background:#fff;border:1.5px solid #22c55e;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;color:#16a34a;" id="ws-mgmt-public">0</div>
            <div style="font-size:9px;color:#16a34a;">공개</div>
          </div>
          <div class="ws-mgmt-stat" data-status-filter="비공개" style="flex:1;min-width:60px;padding:6px 8px;background:#fff;border:1.5px solid #9ca3af;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;color:#6b7280;" id="ws-mgmt-private">0</div>
            <div style="font-size:9px;color:#6b7280;">비공개</div>
          </div>
          <div class="ws-mgmt-stat" data-status-filter="계약중" style="flex:1;min-width:60px;padding:6px 8px;background:#fff;border:1.5px solid #f59e0b;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;color:#d97706;" id="ws-mgmt-contracting">0</div>
            <div style="font-size:9px;color:#d97706;">계약중</div>
          </div>
          <div class="ws-mgmt-stat" data-status-filter="계약완료" style="flex:1;min-width:60px;padding:6px 8px;background:#fff;border:1.5px solid #8b5cf6;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;color:#7c3aed;" id="ws-mgmt-completed">0</div>
            <div style="font-size:9px;color:#7c3aed;">완료</div>
          </div>
          <div style="display:flex;gap:4px;margin-left:auto;align-items:center;">
            <button id="ws-btn-new-listing" style="padding:6px 14px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-weight:700;white-space:nowrap;">+ 매물등록</button>
            <div class="ws-bar-dropdown" style="position:relative;">
              <button class="ws-dropdown-trigger" style="padding:6px 10px;border:1.5px solid #7c3aed;color:#7c3aed;background:#fff;border-radius:8px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap;">⚙️ 일괄작업 ▾</button>
              <div class="ws-dropdown-menu">
                <button class="ws-dropdown-item" id="ws-btn-bulk-upload">📁 대량등록</button>
                <button class="ws-dropdown-item" id="ws-btn-bulk-status">🔄 일괄상태변경</button>
                <button class="ws-dropdown-item" id="ws-btn-bulk-autogen">🏗️ AI일괄생성</button>
                <button class="ws-dropdown-item" id="ws-btn-csv-export">📊 CSV내보내기</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Results Header -->
        <div class="ws-results-header">
          <div class="ws-result-count">
            검색결과: <strong id="ws-result-count">0</strong>건
          </div>
          <div class="ws-result-controls" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <select class="ws-select" id="ws-sort-primary" style="padding:4px 8px;font-size:12px;">
              <option value="latest">최신순</option>
              <option value="views">조회순</option>
              <option value="price_low">가격↑</option>
              <option value="price_high">가격↓</option>
              <option value="area_low">면적↑</option>
              <option value="area_high">면적↓</option>
            </select>
            <select class="ws-select" id="ws-sort-secondary" style="display:none;">
              <option value="none">추가정렬없음</option>
              <option value="latest">최신순</option>
              <option value="views">조회순</option>
              <option value="price_low">가격낮음순</option>
              <option value="price_high">가격높음순</option>
            </select>
            <select class="ws-select" id="ws-per-page" style="padding:4px 6px;font-size:12px;">
              <option value="10">10건</option>
              <option value="20" selected>20건</option>
              <option value="50">50건</option>
              <option value="100">100건</option>
            </select>
            <button class="ws-btn ws-btn-group-toggle" id="ws-group-toggle" title="소재지 그룹 전체 펼침/닫힘" style="padding:4px 8px;font-size:11px;">📍그룹</button>
            <label class="ws-checkbox-label" style="font-size:11px;">
              <input type="checkbox" id="ws-hide-images"> 이미지숨김
            </label>
            <span id="ws-page-info-text" style="font-size:11px;color:#888;">1/1</span>
          </div>
        </div>

        <!-- Listings Container -->
        <div class="ws-listings" id="ws-listings"></div>

        <!-- Pagination -->
        <div class="ws-pagination" id="ws-pagination"></div>

        <!-- Detail Modal -->
        <div class="ws-modal ws-modal-detail" id="ws-modal-detail" style="display: none;">
          <div class="ws-modal-content">
            <button class="ws-modal-close">&times;</button>
            <div class="ws-detail-container" id="ws-detail-container"></div>
          </div>
        </div>

        <!-- Favorites Modal -->
        <div class="ws-modal ws-modal-favorites" id="ws-modal-favorites" style="display: none;">
          <div class="ws-modal-content">
            <button class="ws-modal-close">&times;</button>
            <h2>관심매물</h2>
            <div class="ws-favorites-list" id="ws-favorites-list"></div>
          </div>
        </div>

        <!-- Compare Modal -->
        <div class="ws-modal" id="ws-modal-compare" style="display: none;">
          <div class="ws-modal-content" style="max-width:900px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:16px;">매물 비교</h2>
            <div id="ws-compare-container"></div>
          </div>
        </div>

        <!-- Smart Recommend Modal -->
        <div class="ws-modal" id="ws-modal-smart-recommend" style="display: none;">
          <div class="ws-modal-content" style="max-width:800px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:4px;">🎯 스마트 매물 추천</h2>
            <p style="font-size:12px;color:#888;margin-bottom:16px;">원하는 조건을 입력하면 최적의 매물을 추천합니다</p>

            <div id="ws-smart-recommend-form" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">용도</label>
                <select id="ws-sr-purpose" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                  <option value="">전체</option>
                  <option value="주거">주거용</option>
                  <option value="상가">상가</option>
                  <option value="사무실">사무실</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">거래유형</label>
                <select id="ws-sr-deal" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                  <option value="">전체</option>
                  <option value="전세">전세</option>
                  <option value="월세">월세</option>
                  <option value="매매">매매</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">타입</label>
                <select id="ws-sr-type" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                  <option value="">전체</option>
                  <option value="원룸">원룸</option>
                  <option value="투룸">투룸</option>
                  <option value="쓰리룸">쓰리룸</option>
                  <option value="오피스텔">오피스텔</option>
                  <option value="아파트">아파트</option>
                  <option value="빌라">빌라</option>
                  <option value="상가">상가</option>
                  <option value="사무실">사무실</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">지역 (키워드)</label>
                <input type="text" id="ws-sr-area" placeholder="예: 강남, 역삼동" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">보증금 최대 (만원)</label>
                <input type="number" id="ws-sr-deposit-max" placeholder="예: 5000" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">월세 최대 (만원)</label>
                <input type="number" id="ws-sr-monthly-max" placeholder="예: 100" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">매매가 최대 (만원)</label>
                <input type="number" id="ws-sr-price-max" placeholder="예: 50000" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">면적 최소 (m²)</label>
                <input type="number" id="ws-sr-area-min" placeholder="예: 20" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">면적 최대 (m²)</label>
                <input type="number" id="ws-sr-area-max" placeholder="예: 60" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">방 수 최소</label>
                <input type="number" id="ws-sr-rooms-min" placeholder="예: 1" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">층수 (최소)</label>
                <input type="number" id="ws-sr-floor-min" placeholder="예: 2" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div style="display:flex;flex-direction:column;justify-content:flex-end;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <label style="font-size:11px;display:flex;align-items:center;gap:3px;"><input type="checkbox" id="ws-sr-parking"> 주차</label>
                  <label style="font-size:11px;display:flex;align-items:center;gap:3px;"><input type="checkbox" id="ws-sr-elevator"> 엘리베이터</label>
                  <label style="font-size:11px;display:flex;align-items:center;gap:3px;"><input type="checkbox" id="ws-sr-pet"> 반려동물</label>
                  <label style="font-size:11px;display:flex;align-items:center;gap:3px;"><input type="checkbox" id="ws-sr-fulloption"> 풀옵션</label>
                </div>
              </div>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:16px;">
              <button id="ws-sr-search-btn" style="flex:1;padding:10px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">🔍 매물 추천 검색</button>
              <button id="ws-sr-reset-btn" style="padding:10px 16px;background:#eee;color:#666;border:none;border-radius:8px;font-size:13px;cursor:pointer;">초기화</button>
            </div>

            <div id="ws-sr-results" style="max-height:400px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- Search History Modal -->
        <div class="ws-modal" id="ws-modal-history" style="display: none;">
          <div class="ws-modal-content" style="max-width:600px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:12px;">📋 최근 검색 히스토리</h2>
            <p style="font-size:12px;color:#888;margin-bottom:12px;">최근 필터 조합을 저장하고 빠르게 복원합니다 (최대 10개)</p>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
              <input type="text" id="ws-history-name" placeholder="현재 필터 이름 (예: 강남 원룸 월세)" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
              <button id="ws-history-save-btn" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;white-space:nowrap;">💾 저장</button>
            </div>
            <div id="ws-history-list" style="max-height:400px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- AI Briefing Modal -->
        <div class="ws-modal" id="ws-modal-briefing" style="display: none;">
          <div class="ws-modal-content" style="max-width:800px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:16px;">AI 매물 브리핑 자료</h2>
            <div id="ws-briefing-container"></div>
          </div>
        </div>

        <!-- Customer Folder Modal -->
        <div class="ws-modal" id="ws-modal-customer" style="display: none;">
          <div class="ws-modal-content" style="max-width:650px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:12px;">👤 고객별 매물 폴더</h2>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
              <input type="text" id="ws-customer-name" placeholder="고객명 입력 (예: 김철수님)" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
              <button id="ws-customer-add-btn" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;white-space:nowrap;">➕ 폴더생성</button>
            </div>
            <div id="ws-customer-list" style="max-height:450px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- Building Group Modal -->
        <div class="ws-modal" id="ws-modal-building" style="display: none;">
          <div class="ws-modal-content" style="max-width:800px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:16px;">🏢 건물별 매물 그룹</h2>
            <div id="ws-building-container" style="max-height:500px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- Price Change Log Modal -->
        <div class="ws-modal" id="ws-modal-changelog" style="display: none;">
          <div class="ws-modal-content" style="max-width:700px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:12px;">📈 매물 변동 이력</h2>
            <p style="font-size:12px;color:#888;margin-bottom:12px;">가격 및 상태 변경 이력을 자동으로 추적합니다</p>
            <div id="ws-changelog-container" style="max-height:450px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- Alert Settings Modal -->
        <div class="ws-modal" id="ws-modal-alerts" style="display: none;">
          <div class="ws-modal-content" style="max-width:600px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:12px;">🔔 매물 알림 설정</h2>
            <p style="font-size:12px;color:#888;margin-bottom:16px;">조건에 맞는 신규 매물이 등록되면 자동으로 알림을 표시합니다</p>
            <div style="background:#f8f9fa;border-radius:10px;padding:16px;margin-bottom:16px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                <div>
                  <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:4px;">키워드</label>
                  <input type="text" id="ws-alert-keyword" placeholder="예: 역삼, 강남, 오피스텔" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;">
                </div>
                <div>
                  <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:4px;">최대 보증금 (만원)</label>
                  <input type="number" id="ws-alert-maxprice" placeholder="예: 5000" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;">
                </div>
              </div>
              <div style="display:flex;gap:10px;align-items:flex-end;">
                <div style="flex:1;">
                  <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:4px;">매물 유형</label>
                  <select id="ws-alert-type" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;">
                    <option value="">전체</option>
                    <option value="원룸">원룸</option>
                    <option value="투룸">투룸</option>
                    <option value="오피스텔">오피스텔</option>
                    <option value="아파트">아파트</option>
                    <option value="상가">상가</option>
                    <option value="사무실">사무실</option>
                  </select>
                </div>
                <button id="ws-alert-add-btn" style="padding:8px 20px;background:#ed8936;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;">➕ 알림 추가</button>
              </div>
            </div>
            <div id="ws-alert-list" style="max-height:300px;overflow-y:auto;"></div>
          </div>
        </div>
      </div>

      <!-- Bottom Action Bar (Reorganized) -->
      <div class="ws-bottom-bar">
        <!-- 핵심 액션 (항상 표시) -->
        <div class="ws-bar-primary" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
          <button class="ws-bottom-btn" id="ws-btn-select-all" style="font-size:11px;padding:5px 8px;">전체선택</button>
          <button class="ws-bottom-btn" id="ws-btn-deselect-all" style="font-size:11px;padding:5px 8px;">해제</button>
          <span id="ws-selected-count" style="font-size:11px;color:#2D5A27;font-weight:600;padding:0 4px;">0건</span>
          <div class="ws-bar-divider"></div>
          <button class="ws-bottom-btn ws-btn-highlight" id="ws-btn-ai-briefing" style="font-size:11px;padding:5px 10px;">AI브리핑</button>
          <button class="ws-bottom-btn" id="ws-btn-compare" style="font-size:11px;padding:5px 8px;">비교</button>
          <button class="ws-bottom-btn" id="ws-btn-add-favorites" style="font-size:11px;padding:5px 8px;">관심+</button>
          <button class="ws-bottom-btn" id="ws-btn-view-favorites" style="font-size:11px;padding:5px 8px;">관심목록 <span id="ws-fav-count" style="background:#e53e3e;color:#fff;border-radius:10px;padding:1px 5px;font-size:10px;">0</span></button>
          <button class="ws-bottom-btn" id="ws-btn-print" style="font-size:11px;padding:5px 8px;">인쇄</button>
          <button class="ws-bottom-btn" id="ws-btn-excel" style="font-size:11px;padding:5px 8px;">엑셀</button>
          <label class="ws-checkbox-label" style="font-size:10px;">
            <input type="checkbox" id="ws-include-notes"> 특이사항
          </label>
        </div>

        <!-- 카테고리 드롭업 메뉴 그룹 -->
        <div class="ws-bar-groups" style="display:flex;gap:4px;flex-wrap:wrap;">
          <!-- 공유 -->
          <div class="ws-bar-dropdown">
            <button class="ws-dropdown-trigger" style="border-color:#2563eb;color:#2563eb;font-size:11px;padding:5px 8px;">📤 공유 ▾</button>
            <div class="ws-dropdown-menu">
              <button class="ws-dropdown-item" id="ws-btn-share-text">💬 카톡공유</button>
              <button class="ws-dropdown-item" id="ws-btn-pdf-briefing">📄 PDF브리핑</button>
              <button class="ws-dropdown-item" id="ws-btn-share-link">🔗 링크공유</button>
            </div>
          </div>

          <!-- 분석 -->
          <div class="ws-bar-dropdown">
            <button class="ws-dropdown-trigger" style="border-color:#d97706;color:#d97706;font-size:11px;padding:5px 8px;">📊 분석 ▾</button>
            <div class="ws-dropdown-menu">
              <button class="ws-dropdown-item" id="ws-btn-stats">📊 통계</button>
              <button class="ws-dropdown-item" id="ws-btn-market-chart">📈 시세분석</button>
              <button class="ws-dropdown-item" id="ws-btn-turnover">🔄 회전율</button>
              <button class="ws-dropdown-item" id="ws-btn-heatmap">🗺️ 밀집도</button>
              <button class="ws-dropdown-item" id="ws-btn-price-changes">📊 변동감지</button>
              <button class="ws-dropdown-item" id="ws-btn-fav-compare">⚖️ 즐겨비교</button>
              <button class="ws-dropdown-item" id="ws-btn-custreport">📋 추천리포트</button>
              <button class="ws-dropdown-item" id="ws-btn-smart-recommend">🎯 스마트추천</button>
            </div>
          </div>

          <!-- 관리 -->
          <div class="ws-bar-dropdown">
            <button class="ws-dropdown-trigger" style="border-color:#059669;color:#059669;font-size:11px;padding:5px 8px;">📁 관리 ▾</button>
            <div class="ws-dropdown-menu">
              <button class="ws-dropdown-item" id="ws-btn-customer-folder">👤 고객폴더</button>
              <button class="ws-dropdown-item" id="ws-btn-building-group">🏢 건물그룹</button>
              <button class="ws-dropdown-item" id="ws-btn-memo-mgr">📝 메모관리</button>
              <button class="ws-dropdown-item" id="ws-btn-memosearch">🔎 메모검색</button>
              <button class="ws-dropdown-item" id="ws-btn-search-history">📋 히스토리</button>
              <button class="ws-dropdown-item" id="ws-btn-changelog">📈 변동이력</button>
              <button class="ws-dropdown-item" id="ws-btn-daily-briefing">📊 일일브리핑</button>
            </div>
          </div>

          <!-- 설정 -->
          <div class="ws-bar-dropdown">
            <button class="ws-dropdown-trigger" style="border-color:#6366f1;color:#6366f1;font-size:11px;padding:5px 8px;">⚙️ 설정 ▾</button>
            <div class="ws-dropdown-menu">
              <button class="ws-dropdown-item" id="ws-btn-alerts">🔔 알림설정</button>
              <button class="ws-dropdown-item" id="ws-btn-presets">⚡ 프리셋</button>
              <button class="ws-dropdown-item" id="ws-btn-quick-filter">⚡ 퀵필터</button>
              <button class="ws-dropdown-item" id="ws-btn-auto-refresh">⏱️ 자동새로고침</button>
              <button class="ws-dropdown-item" id="ws-btn-darkmode">🌙 다크모드</button>
              <button class="ws-dropdown-item" id="ws-btn-backup">💾 백업/복원</button>
              <button class="ws-dropdown-item" id="ws-btn-shortcuts">⌨️ 단축키</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Fetch data if not already loaded
    if (!window.WS.allListings || window.WS.allListings.length === 0) {
      window.WS.loadData();
    }

    // Load favorites from localStorage
    const savedFavs = localStorage.getItem('ws-favorites');
    try { window.WS.state.favorites = savedFavs ? JSON.parse(savedFavs) : []; } catch(e) { window.WS.state.favorites = []; }

    // Load memos from localStorage
    const savedMemos = localStorage.getItem('ws-memos');
    try { window.WS.state.memos = savedMemos ? JSON.parse(savedMemos) : {}; } catch(e) { window.WS.state.memos = {}; }

    // Load contacts from localStorage
    const savedContacts = localStorage.getItem('ws-contacts');
    try { window.WS.state.contacts = savedContacts ? JSON.parse(savedContacts) : {}; } catch(e) { window.WS.state.contacts = {}; }

    // Render all components
    window.WS.renderAll();

    // Update initial badge counts
    window.WS.updateFavCount();

    // Setup event listeners
    setupEventListeners();
  };

  /**
   * Render all components
   */
  window.WS.renderAll = function() {
    window.WS.renderRegionTabs();
    window.WS.renderDistricts();
    if (window.WS.renderDongs) window.WS.renderDongs();
    window.WS.renderAddrTypeBtns();
    window.WS.renderTypeTabs();
    window.WS.renderFilters();
    window.WS.refresh();
  };

  /**
   * Render region tabs
   */
  window.WS.renderRegionTabs = function() {
    const container = document.getElementById('ws-region-tabs');
    if (!container) return;

    const regions = Object.keys(REGIONS);
    let html = '';
    regions.forEach(region => {
      const isActive = window.WS.state.activeRegion === region ? 'ws-tab-active' : '';
      html += `<button class="ws-region-tab ws-tab ${isActive}" data-region="${region}">${region}</button>`;
    });
    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.ws-region-tab').forEach(btn => {
      btn.addEventListener('click', function() {
        const region = this.dataset.region;
        window.WS.state.activeRegion = region;
        window.WS.renderRegionTabs();
        window.WS.renderDistricts();
      });
    });
  };

  /**
   * Render districts for active region
   */
  window.WS.renderDistricts = function() {
    const container = document.getElementById('ws-districts');
    if (!container) return;

    const region = window.WS.state.activeRegion;
    const districts = REGIONS[region] || [];

    let html = '';
    districts.forEach(district => {
      const isSelected = window.WS.state.selectedRegions.includes(district) ? 'ws-selected' : '';
      html += `<button class="ws-district-btn ${isSelected}" data-district="${district}">${district}</button>`;
    });
    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.ws-district-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const district = this.dataset.district;
        window.WS.toggleRegion(district);
      });
    });
  };

  /**
   * Toggle district selection (max 5)
   */
  window.WS.toggleRegion = function(district) {
    const selected = window.WS.state.selectedRegions;
    const idx = selected.indexOf(district);
    if (idx >= 0) {
      selected.splice(idx, 1);
      // 해당 구에 속한 동 선택도 해제
      window.WS.state.selectedDongs = window.WS.state.selectedDongs.filter(function(d) {
        return !d.startsWith(district + ' ');
      });
    } else {
      if (selected.length < 5) {
        selected.push(district);
      }
    }
    window.WS.updateSelectedRegions();
    window.WS.renderDistricts();
    window.WS.renderDongs();
    window.WS.refresh();
  };

  /**
   * Render dong-level filter based on selected regions
   * Extracts unique dong names from loaded listings data
   */
  window.WS.renderDongs = function() {
    var container = document.getElementById('ws-dongs');
    if (!container) return;

    var selectedRegions = window.WS.state.selectedRegions;
    if (selectedRegions.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    // 선택된 구/군에서 동 이름 추출 (로드된 매물 데이터 기반)
    var allListings = window.WS.allListings || [];
    var dongMap = {};
    allListings.forEach(function(l) {
      var addr = (l.address || '') + ' ' + (l.dong || '');
      selectedRegions.forEach(function(region) {
        if (addr.includes(region)) {
          // 주소에서 동 이름 추출 (예: "서울 관악구 신림동 123" → "신림동")
          var dongMatch = addr.match(/([가-힣]+[동읍면리])\s/);
          if (dongMatch) {
            var dongName = dongMatch[1];
            var key = region + ' ' + dongName;
            if (!dongMap[key]) {
              dongMap[key] = { region: region, dong: dongName, count: 0 };
            }
            dongMap[key].count++;
          }
        }
      });
    });

    var dongList = Object.values(dongMap).sort(function(a, b) { return b.count - a.count; });

    if (dongList.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    var html = '<div style="padding:4px 0;margin-top:4px;border-top:1px solid #e5e7eb;">';
    html += '<div style="font-size:10px;color:#888;margin-bottom:4px;padding-left:4px;">동 단위 필터 (선택 가능)</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
    dongList.forEach(function(item) {
      var key = item.region + ' ' + item.dong;
      var isSelected = window.WS.state.selectedDongs.includes(key) ? 'ws-selected' : '';
      html += '<button class="ws-dong-btn ' + isSelected + '" data-dong-key="' + key + '" style="padding:2px 8px;font-size:11px;border:1px solid ' + (isSelected ? '#2D5A27' : '#ddd') + ';border-radius:12px;background:' + (isSelected ? '#E8F5E9' : '#fff') + ';color:' + (isSelected ? '#2D5A27' : '#666') + ';cursor:pointer;white-space:nowrap;">' + item.dong + ' <span style="font-size:9px;color:#999;">(' + item.count + ')</span></button>';
    });
    html += '</div></div>';
    container.innerHTML = html;

    // 클릭 핸들러
    container.querySelectorAll('.ws-dong-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var dongKey = this.dataset.dongKey;
        var dongs = window.WS.state.selectedDongs;
        var idx = dongs.indexOf(dongKey);
        if (idx >= 0) {
          dongs.splice(idx, 1);
        } else {
          dongs.push(dongKey);
        }
        window.WS.renderDongs();
        window.WS.refresh();
      });
    });
  };

  /**
   * Update selected regions display
   */
  window.WS.updateSelectedRegions = function() {
    const container = document.getElementById('ws-selected-regions');
    if (!container) return;

    const selected = window.WS.state.selectedRegions;
    let html = '';
    if (selected.length > 0) {
      html = '<div class="ws-selected-tags">';
      selected.forEach(region => {
        html += `<span class="ws-tag">${region}<button class="ws-tag-close" data-region="${region}">&times;</button></span>`;
      });
      html += '</div>';
    }
    container.innerHTML = html;

    // Add close handlers
    container.querySelectorAll('.ws-tag-close').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const region = this.dataset.region;
        window.WS.toggleRegion(region);
      });
    });
  };

  /**
   * Render address type buttons
   */
  window.WS.renderAddrTypeBtns = function() {
    const container = document.getElementById('ws-addr-type-buttons');
    if (!container) return;

    const types = ['전체', '지번', '행정동'];
    let html = '';
    types.forEach(type => {
      const value = type === '전체' ? 'all' : type === '지번' ? 'jibun' : 'district';
      const isActive = window.WS.state.addrType === value ? 'ws-btn-active' : '';
      html += `<button class="ws-btn ws-addr-type-btn ${isActive}" data-addr-type="${value}">${type}</button>`;
    });
    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.ws-addr-type-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        window.WS.state.addrType = this.dataset.addrType;
        window.WS.renderAddrTypeBtns();
      });
    });
  };

  /**
   * Render type tabs with counts
   */
  window.WS.renderTypeTabs = function() {
    const container = document.getElementById('ws-type-tabs');
    if (!container) return;

    const s = window.WS.state;
    // Get counts for each type (from allListings, not filtered)
    const counts = {};
    TYPES.forEach(type => {
      if (type === '전체') {
        counts[type] = window.WS.allListings ? window.WS.allListings.length : 0;
      } else {
        counts[type] = (window.WS.allListings || []).filter(l => (l.type || '') === type).length;
      }
    });

    let html = '';
    TYPES.forEach(type => {
      var isActive = '';
      if (type === '전체') {
        isActive = (s.typeTabs.length === 0 && s.typeTab === '전체') ? 'ws-tab-active' : '';
      } else {
        isActive = s.typeTabs.includes(type) ? 'ws-tab-active' : '';
      }
      const count = counts[type] || 0;
      html += `<button class="ws-type-tab ws-tab ${isActive}" data-type="${type}">${type} <span class="ws-count">${count}</span></button>`;
    });
    container.innerHTML = html;

    // Add click handlers (multi-select)
    container.querySelectorAll('.ws-type-tab').forEach(btn => {
      btn.addEventListener('click', function() {
        var value = this.dataset.type;
        if (value === '전체') {
          s.typeTabs = [];
          s.typeTab = '전체';
        } else {
          var arr = s.typeTabs;
          var idx = arr.indexOf(value);
          if (idx >= 0) { arr.splice(idx, 1); } else { arr.push(value); }
          s.typeTab = arr.length > 0 ? arr[0] : '전체';
        }
        window.WS.renderTypeTabs();
        window.WS.refresh();
      });
    });
  };

  /**
   * Render complete filter section
   */
  window.WS.renderFilters = function() {
    const container = document.getElementById('ws-filters-section');
    if (!container) return;

    const s = window.WS.state;
    let html = '';

    // ══ 8-Column Grid Layout ══
    html += '<div class="ws-filter-grid">';

    // Column 1: 거래구분 (복수선택)
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">거래구분</div><div class="ws-filter-col-body">';
    DEALS.forEach(deal => {
      var active = '';
      if (deal === '전체') {
        active = (s.deals.length === 0 && s.deal === '전체') ? 'ws-fchip-active' : '';
      } else {
        active = s.deals.includes(deal) ? 'ws-fchip-active' : '';
      }
      html += `<button class="ws-fchip ${active}" data-filter="deals" data-value="${deal}">${deal}</button>`;
    });
    html += '</div></div>';

    // Column 2: 방갯수 (복수선택)
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">방갯수</div><div class="ws-filter-col-body">';
    ROOMS.forEach(room => {
      var active = '';
      if (room === '전체') {
        active = (s.roomCounts.length === 0 && s.roomCount === '전체') ? 'ws-fchip-active' : '';
      } else {
        active = s.roomCounts.includes(room) ? 'ws-fchip-active' : '';
      }
      html += `<button class="ws-fchip ${active}" data-filter="roomCounts" data-value="${room}">${room}</button>`;
    });
    html += '</div></div>';

    // Column 3: 룸형태
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">룸형태</div><div class="ws-filter-col-body">';
    SHAPES.forEach(shape => {
      const active = s.roomShape === shape ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="roomShape" data-value="${shape}">${shape}</button>`;
    });
    html += '</div></div>';

    // Column 4: 층구분
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">층구분</div><div class="ws-filter-col-body">';
    FLOORS.forEach(floor => {
      const active = s.floor === floor ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="floor" data-value="${floor}">${floor}</button>`;
    });
    html += '</div></div>';

    // Column 5: 준공년도
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">준공년도</div><div class="ws-filter-col-body">';
    YEARS.forEach(year => {
      const active = s.builtYear === year ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="builtYear" data-value="${year}">${year}</button>`;
    });
    html += '</div></div>';

    // Column 6: 거실크기
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">거실크기</div><div class="ws-filter-col-body">';
    LIVING_SIZES.forEach(size => {
      const active = s.livingSize === size ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="livingSize" data-value="${size}">${size}</button>`;
    });
    html += '</div></div>';

    // Column 7: 주차대수
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">주차대수</div><div class="ws-filter-col-body">';
    PARKING.forEach(park => {
      const active = s.parking === park ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="parking" data-value="${park}">${park}</button>`;
    });
    html += '</div></div>';

    html += '</div>';

    // ══ 추가필터 Row (horizontal, checkboxes) ══
    html += '<div class="ws-filter-hrow"><label>추가필터</label><div class="ws-checkbox-group">';
    const checkboxes = [
      { key: 'buildingPhoto', label: '건물사진있음' },
      { key: 'interiorPhoto', label: '내부사진있음' },
      { key: 'video', label: '동영상있음', noData: true },
      { key: 'shortTerm', label: '단기임대', noData: true },
      { key: 'parkingAvailable', label: '주차가능' },
      { key: 'emptyNow', label: '현재공실' },
      { key: 'balcony', label: '베란다', noData: true },
      { key: 'noFullOption', label: '풀옵션제외', noData: true },
      { key: 'fullOptionOnly', label: '풀옵션만보기', noData: true },
      { key: 'elevator', label: 'E/V' },
      { key: 'priceNego', label: '금액네고' },
      { key: 'loanAvailable', label: '전세대출가능' }
    ];
    checkboxes.forEach(cb => {
      const checked = s.checks[cb.key] ? 'checked' : '';
      const dimStyle = cb.noData ? 'style="opacity:0.5;"' : '';
      html += `<label class="ws-checkbox-label" ${dimStyle}><input type="checkbox" class="ws-filter-checkbox" data-check="${cb.key}" ${checked}> ${cb.label}</label>`;
    });
    html += '</div></div>';

    // (방향 필터: DB 데이터 미입력 상태로 UI 제거됨. 데이터 준비 완료 시 복원)

    // ══ Price Grid (3 columns per row) ══
    html += '<div class="ws-price-grid">';

    // Row 1: 기준가, 보증금, 월세
    html += '<div class="ws-price-cell"><label>기준가</label><div class="ws-price-inputs">';
    html += `<input type="number" class="ws-input ws-price-input" placeholder="최소" id="ws-min-base-price" value="${s.minBasePrice}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-price-input" placeholder="최대" id="ws-max-base-price" value="${s.maxBasePrice}">`;
    html += '<span class="ws-unit-label">만원</span>';
    html += '</div></div>';

    html += '<div class="ws-price-cell"><label>보증금</label><div class="ws-price-inputs">';
    html += `<input type="number" class="ws-input ws-price-input" placeholder="최소" id="ws-min-deposit" value="${s.minDeposit}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-price-input" placeholder="최대" id="ws-max-deposit" value="${s.maxDeposit}">`;
    html += '<span class="ws-unit-label">만원</span>';
    html += '</div></div>';

    html += '<div class="ws-price-cell"><label>월세가</label><div class="ws-price-inputs">';
    html += `<input type="number" class="ws-input ws-price-input" placeholder="최소" id="ws-min-monthly" value="${s.minMonthly}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-price-input" placeholder="최대" id="ws-max-monthly" value="${s.maxMonthly}">`;
    html += '<span class="ws-unit-label">만원</span>';
    html += `<label class="ws-checkbox-label"><input type="checkbox" id="ws-include-mgmt" ${s.includeMgmt ? 'checked' : ''}> 관리비포함</label>`;
    html += '</div></div>';

    html += '</div>';

    // Row 2: 매매가, 공급/전용면적, 공급면적
    html += '<div class="ws-price-grid">';

    html += '<div class="ws-price-cell"><label>매매가</label><div class="ws-price-inputs">';
    html += `<input type="number" class="ws-input ws-price-input" placeholder="최소" id="ws-min-sale-price" value="${s.minSalePrice}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-price-input" placeholder="최대" id="ws-max-sale-price" value="${s.maxSalePrice}">`;
    html += '<span class="ws-unit-label">만원</span>';
    html += '</div></div>';

    html += '<div class="ws-price-cell"><label>공급/전용면적</label><div class="ws-price-inputs">';
    html += `<button class="ws-unit-toggle" id="ws-area-unit-toggle">${s.areaUnit === 'm2' ? 'm²' : '평'}</button>`;
    html += `<input type="number" class="ws-input ws-area-input" placeholder="최소" id="ws-min-area" value="${s.minArea}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-area-input" placeholder="최대" id="ws-max-area" value="${s.maxArea}">`;
    html += '</div></div>';

    html += '<div class="ws-price-cell"><label>공급면적</label><div class="ws-price-inputs">';
    html += `<button class="ws-unit-toggle" id="ws-supply-unit-toggle">${s.supplyUnit === 'm2' ? 'm²' : '평'}</button>`;
    html += `<input type="number" class="ws-input ws-area-input" placeholder="최소" id="ws-min-supply" value="${s.minSupply}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-area-input" placeholder="최대" id="ws-max-supply" value="${s.maxSupply}">`;
    html += '</div></div>';

    html += '</div>';

    // ══ Keyword Row ══
    html += '<div class="ws-filter-hrow"><label>특이사항</label><div class="ws-keyword-input">';
    html += `<input type="text" class="ws-input" placeholder="검색 키워드" id="ws-keyword" value="${s.keyword}">`;
    html += '<span class="ws-info-text">건물명, 주소, 설명 등에서 검색합니다</span>';
    html += '</div></div>';

    container.innerHTML = html;

    // Attach event listeners
    attachFilterListeners();
  };

  /**
   * Attach filter event listeners
   */
  function attachFilterListeners() {
    // Chip filters (both grid chips .ws-fchip and direction chips .ws-chip)
    document.querySelectorAll('.ws-fchip, .ws-chip').forEach(chip => {
      chip.addEventListener('click', function() {
        const filter = this.dataset.filter;
        const value = this.dataset.value;

        // 복수선택 필터 (deals, roomCounts)
        if (filter === 'deals') {
          if (value === '전체') {
            window.WS.state.deals = [];
            window.WS.state.deal = '전체';
          } else {
            var arr = window.WS.state.deals;
            var idx = arr.indexOf(value);
            if (idx >= 0) {
              arr.splice(idx, 1);
            } else {
              arr.push(value);
            }
            window.WS.state.deal = arr.length > 0 ? arr[0] : '전체';
          }
          window.WS.renderFilters();
          window.WS.refresh();
          return;
        }

        if (filter === 'roomCounts') {
          if (value === '전체') {
            window.WS.state.roomCounts = [];
            window.WS.state.roomCount = '전체';
          } else {
            var arr2 = window.WS.state.roomCounts;
            var idx2 = arr2.indexOf(value);
            if (idx2 >= 0) {
              arr2.splice(idx2, 1);
            } else {
              arr2.push(value);
            }
            window.WS.state.roomCount = arr2.length > 0 ? arr2[0] : '전체';
          }
          window.WS.renderFilters();
          window.WS.refresh();
          return;
        }

        // 기존 단일선택 필터
        window.WS.state[filter] = value;
        window.WS.refresh();
      });
    });

    // Checkboxes
    document.querySelectorAll('.ws-filter-checkbox').forEach(cb => {
      cb.addEventListener('change', function() {
        const key = this.dataset.check;
        window.WS.state.checks[key] = this.checked;
        window.WS.refresh();
      });
    });

    // Price inputs
    ['minBasePrice', 'maxBasePrice', 'minDeposit', 'maxDeposit', 'minMonthly', 'maxMonthly', 'minSalePrice', 'maxSalePrice'].forEach(key => {
      const input = document.getElementById(`ws-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
      if (input) {
        input.addEventListener('change', function() {
          window.WS.state[key] = this.value;
          window.WS.refresh();
        });
      }
    });

    // Area inputs
    ['minArea', 'maxArea', 'minSupply', 'maxSupply'].forEach(key => {
      const input = document.getElementById(`ws-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
      if (input) {
        input.addEventListener('change', function() {
          window.WS.state[key] = this.value;
          window.WS.refresh();
        });
      }
    });

    // Management fee checkbox
    const mgmtCheckbox = document.getElementById('ws-include-mgmt');
    if (mgmtCheckbox) {
      mgmtCheckbox.addEventListener('change', function() {
        window.WS.state.includeMgmt = this.checked;
        window.WS.refresh();
      });
    }

    // Keyword
    const keywordInput = document.getElementById('ws-keyword');
    if (keywordInput) {
      keywordInput.addEventListener('change', function() {
        window.WS.state.keyword = this.value;
        window.WS.refresh();
      });
    }

    // Area unit toggles
    const areaUnitBtn = document.getElementById('ws-area-unit-toggle');
    if (areaUnitBtn) {
      areaUnitBtn.addEventListener('click', function() {
        var oldUnit = window.WS.state.areaUnit;
        var newUnit = oldUnit === 'm2' ? 'pyeong' : 'm2';
        window.WS.state.areaUnit = newUnit;
        // 단위 변환 시 입력값도 자동 변환
        if (window.WS.state.minArea !== '') {
          var val = parseFloat(window.WS.state.minArea);
          window.WS.state.minArea = oldUnit === 'm2' ? (val / 3.30579).toFixed(1) : (val * 3.30579).toFixed(1);
        }
        if (window.WS.state.maxArea !== '') {
          var val2 = parseFloat(window.WS.state.maxArea);
          window.WS.state.maxArea = oldUnit === 'm2' ? (val2 / 3.30579).toFixed(1) : (val2 * 3.30579).toFixed(1);
        }
        window.WS.renderFilters();
        window.WS.refresh();
      });
    }

    const supplyUnitBtn = document.getElementById('ws-supply-unit-toggle');
    if (supplyUnitBtn) {
      supplyUnitBtn.addEventListener('click', function() {
        var oldUnit = window.WS.state.supplyUnit;
        var newUnit = oldUnit === 'm2' ? 'pyeong' : 'm2';
        window.WS.state.supplyUnit = newUnit;
        // 단위 변환 시 입력값도 자동 변환
        if (window.WS.state.minSupply !== '') {
          var val = parseFloat(window.WS.state.minSupply);
          window.WS.state.minSupply = oldUnit === 'm2' ? (val / 3.30579).toFixed(1) : (val * 3.30579).toFixed(1);
        }
        if (window.WS.state.maxSupply !== '') {
          var val2 = parseFloat(window.WS.state.maxSupply);
          window.WS.state.maxSupply = oldUnit === 'm2' ? (val2 / 3.30579).toFixed(1) : (val2 * 3.30579).toFixed(1);
        }
        window.WS.renderFilters();
        window.WS.refresh();
      });
    }

    // 가격/면적 입력 디바운스 재바인딩 (필터 DOM 재생성 후)
    if (window.WS._bindPriceDebounce) window.WS._bindPriceDebounce();
  }

  /**
   * Render listing cards
   */
  // ============================================================================
  // LISTING CARD RENDERER HELPER
  // ============================================================================
  // 주소 표시: 구주소(지번) 우선, "서울시 강남구 역삼동 123-4" 형식
  function _shortenRegion(r) {
    // 서울특별시 → 서울시, 경기도 → 경기, 인천광역시 → 인천시 등
    return r.replace(/특별시$/, '시').replace(/광역시$/, '시').replace(/특별자치시$/, '시').replace(/특별자치도$/, '');
  }
  function _getDisplayAddress(listing) {
    var addr = (listing.address || '').trim();
    // 도로명주소 패턴: XX로, XX길
    var isRoadAddr = /\d+[가-힣]*로(\s|$)/.test(addr) || /\d+[가-힣]*길(\s|$)/.test(addr) || /[가-힣]+로\s+\d/.test(addr) || /[가-힣]+길\s+\d/.test(addr);
    if (isRoadAddr && listing.dong) {
      var guMatch = addr.match(/(서울특별시|서울|경기도|경기|인천광역시|인천|부산광역시|부산|대구광역시|대구|대전광역시|대전|광주광역시|광주|울산광역시|울산|세종특별자치시|세종|제주특별자치도|제주)\s+([가-힣]+[구군시])/);
      var gu = guMatch ? guMatch[2] : '';
      var region = guMatch ? _shortenRegion(guMatch[1]) : '';
      if (gu && listing.dong) {
        return region + ' ' + gu + ' ' + listing.dong;
      }
      return listing.dong + (addr ? ' (' + addr.split(' ').slice(-2).join(' ') + ')' : '');
    }
    // 지번주소도 시 줄여서 표시
    var shortened = addr
      .replace(/서울특별시/g, '서울시')
      .replace(/경기도/g, '경기')
      .replace(/인천광역시/g, '인천시')
      .replace(/부산광역시/g, '부산시')
      .replace(/대구광역시/g, '대구시')
      .replace(/대전광역시/g, '대전시')
      .replace(/광주광역시/g, '광주시')
      .replace(/울산광역시/g, '울산시')
      .replace(/세종특별자치시/g, '세종시')
      .replace(/제주특별자치도/g, '제주');
    // 비정상 지번번호 제거 (6자리 이상 연속 숫자는 지번이 아님)
    shortened = shortened.replace(/\s+\d{6,}$/g, '').trim();
    // "서울시" 없이 "강남구"로 시작하면 "서울시" 추가
    if (/^[가-힣]+구\s/.test(shortened) && !/시/.test(shortened.split(' ')[0])) {
      shortened = '서울시 ' + shortened;
    }
    return shortened;
  }

  function _renderListingCard(listing, s) {
    var isFav = s.favorites.some(function(f) { return String(f) === String(listing.id); }) ? 'ws-favorite-active' : '';
    var hideImg = s.hideImages ? 'ws-hide-img' : '';
    var imgs = listing.images || listing.listing_images || [];
    var imageCount = imgs.length || 0;
    var firstImgUrl = imgs.length > 0 ? (imgs[0].url || imgs[0]) : '';
    var areaText = (listing.area_m2 != null && listing.area_m2 > 0) ? listing.area_m2 + 'm² (' + Math.round(listing.area_m2 / 3.30579) + '평)' : '-';
    var floorText = '';
    if (listing.floor_current) {
      var fc = String(listing.floor_current);
      // floor_current가 이미 "2/4층" 등 슬래시+층 포함이면 그대로 사용
      if (fc.indexOf('/') >= 0 || fc.indexOf('층') >= 0) {
        floorText = fc.replace(/층$/, '') + '층';
      } else {
        floorText = fc + '/' + (listing.floor_total || '?') + '층';
      }
    }

    var isSelected = s.selectedIds.has(String(listing.id));
    return '<div class="ws-listing-card' + (isSelected ? ' ws-card-selected' : '') + '" data-listing-id="' + listing.id + '">' +
      '<input type="checkbox" class="ws-listing-checkbox" data-id="' + listing.id + '" ' + (s.selectedIds.has(String(listing.id)) ? 'checked' : '') + '>' +
      '<div class="ws-listing-image-wrap ' + hideImg + '">' +
        (firstImgUrl ? '<img data-src="' + escHtml(firstImgUrl) + '" alt="' + escHtml(listing.title || '') + '" class="ws-listing-image ws-lazy" style="width:100%;height:100%;object-fit:cover;background:#f0f0f0;" onerror="this.style.display=\'none\';this.nextElementSibling&&(this.nextElementSibling.style.display=\'flex\')"><div style="display:none;width:100%;height:100%;background:#e8e8e8;align-items:center;justify-content:center;color:#aaa;font-size:20px;">🏠</div>' : '<div class="ws-listing-image" style="width:100%;height:100%;background:#e8e8e8;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:20px;">🏠</div>') +
        (imageCount > 0 ? '<span class="ws-photo-badge">' + imageCount + '장</span>' : '') +
        '<span class="ws-time-badge">' + timeAgo(listing.created_at) + '</span>' +
        '<button class="ws-favorite-btn ' + isFav + '" data-id="' + listing.id + '">★</button>' +
        '<button class="ws-photo-upload-btn" data-id="' + listing.id + '" title="사진 등록/관리">📷+</button>' +
      '</div>' +
      '<div class="ws-listing-content">' +
        /* ── 좌측: 매물 정보 (주소 상단, 제목 하단) ── */
        '<div class="ws-card-info">' +
          (function() {
            var addrText = _getDisplayAddress(listing);
            var bn = (listing.building_info && listing.building_info.건물명 || '').trim().replace(/[·\-]\s*(철근콘크리트|철골|조적|목구조|경량철골|벽식)[가-힣]*/g, '').replace(/^\s*[·\-]\s*/, '').trim();
            var addrLine = escHtml(addrText);
            if (bn && bn.length > 1) addrLine += ' <span style="color:#888;font-weight:400;">(' + escHtml(bn) + ')</span>';
            var newBadge = (function(){ var c = listing.created_at ? new Date(listing.created_at) : null; return (c && (Date.now() - c.getTime()) < 86400000) ? '<span class="ws-new-badge">NEW</span>' : ''; })();
            // ★ 출처 아이콘: G=공실클럽, O=온하우스
            var sourceBadge = '';
            if (listing.source_site === 'gongsilclub') {
              sourceBadge = '<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;background:#4CAF50;color:#fff;font-size:11px;font-weight:800;margin-right:4px;vertical-align:middle;">G</span>';
            } else if (listing.source_site === 'onhouse') {
              sourceBadge = '<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;background:#FF9800;color:#fff;font-size:11px;font-weight:800;margin-right:4px;vertical-align:middle;">O</span>';
            }
            return '<p class="ws-listing-addr ws-addr-preview" data-listing-id="' + listing.id + '" style="cursor:pointer;" title="클릭하면 핵심정보 보기">' + sourceBadge + addrLine + newBadge + '</p>';
          })() +
          '<p class="ws-listing-title-sub" data-listing-id="' + listing.id + '" style="cursor:pointer;" title="클릭하면 상세보기">' +
            escHtml(listing.title || '-') +
          '</p>' +
          '<p class="ws-listing-subtitle">' + escHtml(areaText) + ' | ' + escHtml(listing.type || '-') + '</p>' +
          '<div class="ws-listing-tags">' +
            (floorText ? '<span class="ws-tag-small">' + floorText + '</span>' : '') +
            (listing.rooms ? '<span class="ws-tag-small">' + listing.rooms + '개 방</span>' : '') +
            (listing.bathrooms ? '<span class="ws-tag-small">' + listing.bathrooms + '개 욕실</span>' : '') +
            (listing.direction ? '<span class="ws-tag-small">' + listing.direction + '</span>' : '') +
            (listing.parking ? '<span class="ws-tag-small">주차' + (getParkingCount(listing) > 1 ? getParkingCount(listing) : '가능') + '</span>' : '') +
            (listing.elevator ? '<span class="ws-tag-small">EV</span>' : '') +
            (listing.full_option ? '<span class="ws-tag-small">풀옵션</span>' : '') +
            (listing.status === '가용' ? '<span class="ws-tag-small" style="background:#E8F5E9;color:#2D5A27;font-weight:600">공실</span>' : '') +
            (window.WS.state.memos[String(listing.id)] ? '<span class="ws-tag-small" style="background:#FFF3E0;color:#E65100;font-weight:600">📝메모</span>' : '') +
            ((window.WS.state.contacts[String(listing.id)] && window.WS.state.contacts[String(listing.id)].length > 0) ? '<span class="ws-tag-small" style="background:#E3F2FD;color:#1565C0;font-weight:600">📞' + window.WS.state.contacts[String(listing.id)].length + '</span>' : '') +
            (listing.heating_type && !/콘크리트|철골|조적|목구조|경량|벽식|구조/.test(listing.heating_type) ? '<span class="ws-tag-small">' + escHtml(listing.heating_type) + '</span>' : '') +
          '</div>' +
        '</div>' +
        /* ── 우측: 가격 + 상태 + 상세보기 버튼 ── */
        '<div class="ws-card-right">' +
          '<div class="ws-card-price-block">' +
            '<span class="ws-deal-type">' + escHtml(listing.deal || '-') + '</span>' +
            '<div class="ws-price-main">' + formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal) + '</div>' +
            (listing.maintenance_fee && listing.maintenance_fee > 0 ? '<span class="ws-maintenance">관리 ' + listing.maintenance_fee + '만</span>' : '<span class="ws-maintenance ws-maint-warn">관리비미입력</span>') +
          '</div>' +
          '<div class="ws-card-controls">' +
            '<select class="ws-status-select" data-id="' + listing.id + '"' +
              ' style="' + (function(st){ return st === '비공개' ? 'color:#6b7280;background:#f3f4f6;border-color:#d1d5db;' : st === '계약중' ? 'color:#d97706;background:#fffbeb;border-color:#fbbf24;' : st === '계약완료' ? 'color:#7c3aed;background:#f5f3ff;border-color:#a78bfa;' : 'color:#16a34a;background:#f0fdf4;border-color:#86efac;'; })(listing.status || '공개') + '">' +
              '<option value="공개"' + ((listing.status || '공개') === '공개' ? ' selected' : '') + '>공개</option>' +
              '<option value="비공개"' + (listing.status === '비공개' ? ' selected' : '') + '>비공개</option>' +
              '<option value="계약중"' + (listing.status === '계약중' ? ' selected' : '') + '>계약중</option>' +
              '<option value="계약완료"' + (listing.status === '계약완료' ? ' selected' : '') + '>완료</option>' +
            '</select>' +
            '<button class="ws-detail-btn" data-id="' + listing.id + '">상세보기</button>' +
          '</div>' +
          '<span class="ws-listing-id" style="cursor:pointer;" title="클릭하면 복사됩니다" data-copy="' + listing.id + '">매물번호 ' + listing.id + '</span>' +
        '</div>' +
      '</div>' +
      /* ── 하단 footer: 수정/삭제 (호버 시 노출) ── */
      '<div class="ws-card-footer">' +
        '<button class="ws-edit-btn" data-id="' + listing.id + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> 수정</button>' +
        (window.WS.isSuperAdmin() ? '<button class="ws-delete-btn" data-id="' + listing.id + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> 삭제</button>' : '') +
      '</div>' +
    '</div>';
  }

  // ============================================================================
  // ADDRESS GROUPING HELPER
  // ============================================================================
  function _getAddressGroupKey(listing) {
    // 소재지 그룹핑 키: address 필드 전체 (지번주소 포함)
    // 예: "서울특별시 관악구 신림동 246-1" 전체가 그룹핑 키
    // 같은 건물(지번)의 다른 호수 매물들을 하나로 묶음
    var addr = (listing.address || '').trim();
    return addr || '주소 미상';
  }

  window.WS.renderListings = function() {
    const container = document.getElementById('ws-listings');
    if (!container) return;

    const s = window.WS.state;
    const filtered = window.WS.filtered || [];
    const start = (s.page - 1) * s.perPage;
    const end = start + s.perPage;
    const pageListings = filtered.slice(start, end);

    // 소재지별 그룹핑
    var groups = {};
    var groupOrder = [];
    pageListings.forEach(function(listing) {
      var key = _getAddressGroupKey(listing);
      if (!groups[key]) {
        groups[key] = [];
        groupOrder.push(key);
      }
      groups[key].push(listing);
    });

    // 그룹핑 상태 초기화 (첫 로드 시)
    if (!window.WS._groupExpanded) window.WS._groupExpanded = {};

    let html = '';
    groupOrder.forEach(function(groupAddr) {
      var items = groups[groupAddr];
      if (items.length === 1) {
        // 단일 매물은 그냥 렌더링
        html += _renderListingCard(items[0], s);
      } else {
        // 2개 이상 매물 → 그룹 UI (펼침/닫힘, 첫 매물은 항상 표시)
        var groupId = 'ws-group-' + groupAddr.replace(/[^가-힣a-zA-Z0-9]/g, '_');
        var isExpanded = window.WS._groupExpanded[groupAddr] !== false; // 기본: 펼침
        var arrowIcon = isExpanded ? '▼' : '▶';
        var displayStyle = isExpanded ? '' : 'display:none;';
        var restCount = items.length - 1;

        html += '<div class="ws-address-group" data-group="' + escHtml(groupAddr) + '">' +
          '<div class="ws-group-header" data-group-key="' + escHtml(groupAddr) + '">' +
            '<span class="ws-group-arrow">' + arrowIcon + '</span>' +
            '<span class="ws-group-title">📍 ' + escHtml(groupAddr) + '</span>' +
            '<span class="ws-group-count">' + items.length + '건</span>' +
          '</div>';

        // 첫 번째 매물은 항상 표시 (접혀도 보임)
        html += _renderListingCard(items[0], s);

        // 나머지 매물은 펼침/닫힘
        if (restCount > 0) {
          html += '<div class="ws-group-body" id="' + groupId + '" style="' + displayStyle + '">';
          for (var gi = 1; gi < items.length; gi++) {
            html += _renderListingCard(items[gi], s);
          }
          html += '</div>';
        }

        html += '</div>';
      }
    });

    if (html === '') {
      html = '<div class="ws-no-results">검색 결과가 없습니다.</div>';
    }

    container.innerHTML = html;

    // 그룹 펼침/닫힘 이벤트 바인딩
    container.querySelectorAll('.ws-group-header').forEach(function(header) {
      header.addEventListener('click', function() {
        var key = this.dataset.groupKey;
        var groupId = 'ws-group-' + key.replace(/[^가-힣a-zA-Z0-9]/g, '_');
        var body = document.getElementById(groupId);
        var arrow = this.querySelector('.ws-group-arrow');
        if (!body) return;
        if (body.style.display === 'none') {
          body.style.display = '';
          arrow.textContent = '▼';
          window.WS._groupExpanded[key] = true;
        } else {
          body.style.display = 'none';
          arrow.textContent = '▶';
          window.WS._groupExpanded[key] = false;
        }
      });
    });

    // Update result count and page info
    var resultCountEl = document.getElementById('ws-result-count');
    if (resultCountEl) resultCountEl.textContent = filtered.length;
    const totalPages = s.perPage > 0 ? Math.ceil(filtered.length / s.perPage) : 1;
    var pageInfoEl = document.getElementById('ws-page-info-text');
    if (pageInfoEl) pageInfoEl.textContent = s.page + '/' + totalPages;

    // Attach listing event listeners
    attachListingListeners();

    // Lazy load images using IntersectionObserver
    if ('IntersectionObserver' in window) {
      const lazyObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            const el = entry.target;
            const bg = el.dataset.bg;
            if (bg) {
              el.style.backgroundImage = "url('" + bg.replace(/'/g, "\\'").replace(/\)/g, "\\)") + "')";
              el.classList.remove('ws-lazy');
            }
            lazyObserver.unobserve(el);
          }
        });
      }, { rootMargin: '100px' });
      document.querySelectorAll('.ws-lazy').forEach(function(el) {
        lazyObserver.observe(el);
      });
    } else {
      // Fallback: load all immediately
      document.querySelectorAll('.ws-lazy').forEach(function(el) {
        var bg = el.dataset.bg;
        if (bg) el.style.backgroundImage = "url('" + bg + "')";
      });
    }
  };

  /**
   * Attach listing event listeners — 이벤트 위임 패턴
   * 매물 카드 컨테이너(.ws-listings)에 단일 리스너를 1회만 등록하고,
   * click/change 이벤트를 data-* 속성으로 위임 처리합니다.
   * (기존: 매 렌더링마다 각 카드 요소에 개별 리스너 등록 → 수십~수백 개)
   */
  var _listingsDelegated = false;
  function attachListingListeners() {
    // Lazy-load images (IntersectionObserver) — 매 렌더링마다 재설정 필요
    if (window.WS._lazyObserver) window.WS._lazyObserver.disconnect();
    window.WS._lazyObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            img.classList.remove('ws-lazy');
          }
          window.WS._lazyObserver.unobserve(img);
        }
      });
    }, { rootMargin: '200px' });
    document.querySelectorAll('img.ws-lazy[data-src]').forEach(function(img) {
      window.WS._lazyObserver.observe(img);
    });

    // 이벤트 위임: 1회만 등록
    if (_listingsDelegated) return;
    _listingsDelegated = true;

    var listingsContainer = document.querySelector('.ws-listings') || document.querySelector('.ws-search-container');
    if (!listingsContainer) return;

    // helper: data-id로 매물 찾기
    function _findListing(id) {
      return (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
    }

    // ─── click 위임 ───
    listingsContainer.addEventListener('click', function(e) {
      var target = e.target;

      // 1) 매물번호 복사
      var copyEl = target.closest('.ws-listing-id, .ws-copy-id');
      if (copyEl) {
        e.preventDefault();
        e.stopPropagation();
        var text = copyEl.dataset.copy || copyEl.textContent.trim();
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast(text + ' 복사됨', 'success');
        });
        return;
      }

      // 2) 즐겨찾기 버튼
      var favEl = target.closest('.ws-favorite-btn');
      if (favEl) {
        e.preventDefault();
        window.WS.toggleFavorite(favEl.dataset.id);
        window.WS.renderListings();
        return;
      }

      // 3) 상세보기 버튼
      var detailEl = target.closest('.ws-detail-btn');
      if (detailEl) {
        e.preventDefault();
        var listing = _findListing(detailEl.dataset.id);
        if (listing) window.WS.showDetail(listing);
        return;
      }

      // 4) 주소 클릭 → 퀵프리뷰
      var addrEl = target.closest('.ws-addr-preview[data-listing-id]');
      if (addrEl) {
        e.preventDefault();
        e.stopPropagation();
        var listing = _findListing(addrEl.dataset.listingId);
        if (listing) window.WS._showQuickPreview(listing, addrEl);
        return;
      }

      // 5) 제목 클릭 → 상세보기
      var titleEl = target.closest('.ws-listing-title-sub[data-listing-id], .ws-listing-title[data-listing-id]');
      if (titleEl) {
        e.preventDefault();
        var listing = _findListing(titleEl.dataset.listingId);
        if (listing) window.WS.showDetail(listing);
        return;
      }

      // 6) 사진 업로드 버튼
      var photoEl = target.closest('.ws-photo-upload-btn');
      if (photoEl) {
        e.preventDefault();
        e.stopPropagation();
        var listing = _findListing(photoEl.dataset.id);
        if (listing) window.WS.showPhotoUploadModal(listing);
        return;
      }

      // 7) 수정 버튼
      var editEl = target.closest('.ws-edit-btn');
      if (editEl) {
        e.preventDefault();
        e.stopPropagation();
        var listing = _findListing(editEl.dataset.id);
        if (listing) window.WS._showEditModal(listing);
        return;
      }

      // 8) 삭제 버튼
      var delEl = target.closest('.ws-delete-btn');
      if (delEl) {
        e.preventDefault();
        e.stopPropagation();
        var listing = _findListing(delEl.dataset.id);
        if (listing) window.WS._deleteListing(listing);
        return;
      }
    });

    // ─── change 위임 (체크박스, 상태 셀렉트) ───
    listingsContainer.addEventListener('change', function(e) {
      var target = e.target;

      // 체크박스
      if (target.classList.contains('ws-listing-checkbox')) {
        var id = target.dataset.id;
        var card = target.closest('.ws-listing-card');
        if (target.checked) {
          window.WS.state.selectedIds.add(id);
          if (card) card.classList.add('ws-card-selected');
        } else {
          window.WS.state.selectedIds.delete(id);
          if (card) card.classList.remove('ws-card-selected');
        }
        window.WS._updateSelectedCount();
        return;
      }

      // 상태 변경 드롭다운
      if (target.classList.contains('ws-status-select')) {
        e.stopPropagation();
        window.WS._changeListingStatus(target.dataset.id, target.value);
        return;
      }
    });
  }

  // =========================================================
  // 사진 등록/관리 모달
  // =========================================================
  window.WS.showPhotoUploadModal = function(listing) {
    // 기존 모달 제거
    var old = document.getElementById('ws-photo-modal');
    if (old) old.remove();

    var imgs = listing.images || listing.listing_images || [];
    var imgListHtml = '';
    imgs.forEach(function(img, idx) {
      var url = img.url || img;
      imgListHtml += '<div class="ws-photo-thumb" data-idx="' + idx + '" style="position:relative;display:inline-block;margin:4px;border-radius:8px;overflow:hidden;">' +
        '<img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="window.WS.openLightbox && window.WS.openLightbox(' + JSON.stringify(imgs.map(function(i){return i.url||i})) + ',' + idx + ')">' +
        '</div>';
    });

    var modal = document.createElement('div');
    modal.id = 'ws-photo-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="margin:0;font-size:18px;font-weight:700;color:#333;">📷 사진 등록</h3>' +
        '<button id="ws-photo-modal-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;padding:0 4px;">✕</button>' +
      '</div>' +
      '<div style="margin-bottom:12px;padding:8px 12px;background:#f8f9fa;border-radius:8px;font-size:13px;color:#555;">' +
        '<strong>' + (listing.title || '매물') + '</strong> (ID: ' + listing.id + ')' +
      '</div>' +
      // 기존 사진 표시
      (imgListHtml ? '<div style="margin-bottom:16px;"><div style="font-size:13px;color:#888;margin-bottom:6px;">현재 사진 (' + imgs.length + '장)</div>' + imgListHtml + '</div>' : '') +
      // 업로드 영역
      '<div id="ws-photo-dropzone" style="border:2px dashed #ccc;border-radius:12px;padding:32px 16px;text-align:center;cursor:pointer;transition:all 0.2s;background:#fafafa;">' +
        '<div style="font-size:36px;margin-bottom:8px;">📁</div>' +
        '<div style="font-size:14px;color:#666;font-weight:600;">클릭하거나 드래그하여 사진 추가</div>' +
        '<div style="font-size:12px;color:#aaa;margin-top:4px;">JPG, PNG 최대 20장 (각 10MB 이하)</div>' +
        '<input type="file" id="ws-photo-file-input" multiple accept="image/*" style="display:none;">' +
      '</div>' +
      // 선택된 파일 미리보기
      '<div id="ws-photo-preview" style="margin-top:12px;"></div>' +
      // 업로드 진행 상태
      '<div id="ws-photo-progress" style="display:none;margin-top:12px;text-align:center;">' +
        '<div style="font-size:14px;color:#2D5A27;font-weight:600;">업로드 중...</div>' +
        '<div id="ws-photo-progress-bar" style="margin-top:8px;height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;">' +
          '<div id="ws-photo-progress-fill" style="width:0%;height:100%;background:#2D5A27;transition:width 0.3s;"></div>' +
        '</div>' +
      '</div>' +
      // 업로드 버튼
      '<button id="ws-photo-upload-submit" style="display:none;margin-top:16px;width:100%;padding:12px;background:#2D5A27;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:background 0.2s;">' +
        '사진 등록하기' +
      '</button>' +
    '</div>';

    document.body.appendChild(modal);

    // 선택된 파일 저장 [{file, dataUrl, isMain}]
    var selectedFiles = [];
    var mainIndex = 0; // 첫번째가 기본 메인사진
    var dragSrcIdx = null;

    // 닫기
    document.getElementById('ws-photo-modal-close').addEventListener('click', function() {
      modal.remove();
    });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });

    // 드롭존 클릭
    var dropzone = document.getElementById('ws-photo-dropzone');
    var fileInput = document.getElementById('ws-photo-file-input');
    dropzone.addEventListener('click', function() { fileInput.click(); });

    // 드래그 앤 드롭 (파일 추가)
    dropzone.addEventListener('dragover', function(e) {
      e.preventDefault();
      if (e.dataTransfer.types.indexOf('Files') > -1) {
        dropzone.style.borderColor = '#2D5A27';
        dropzone.style.background = '#f0f7f0';
      }
    });
    dropzone.addEventListener('dragleave', function() {
      dropzone.style.borderColor = '#ccc';
      dropzone.style.background = '#fafafa';
    });
    dropzone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropzone.style.borderColor = '#ccc';
      dropzone.style.background = '#fafafa';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    });

    // 파일 선택
    fileInput.addEventListener('change', function() {
      handleFiles(this.files);
    });

    // 미리보기 렌더링 (순서변경/메인선택 반영)
    function renderPreview() {
      var previewContainer = document.getElementById('ws-photo-preview');
      var submitBtn = document.getElementById('ws-photo-upload-submit');
      previewContainer.innerHTML = '';

      selectedFiles.forEach(function(item, idx) {
        var thumb = document.createElement('div');
        thumb.setAttribute('draggable', 'true');
        thumb.setAttribute('data-idx', idx);
        thumb.style.cssText = 'display:inline-block;position:relative;margin:4px;cursor:grab;vertical-align:top;transition:transform 0.15s;user-select:none;';
        if (idx === mainIndex) {
          thumb.style.boxShadow = '0 0 0 3px #f59e0b';
          thumb.style.borderRadius = '10px';
        }

        thumb.innerHTML =
          '<img src="' + item.dataUrl + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid ' + (idx === mainIndex ? '#f59e0b' : '#2D5A27') + ';display:block;">' +
          // 순서 번호
          '<div style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;">' + (idx + 1) + '</div>' +
          // 메인사진 표시 (별)
          '<button class="ws-main-btn" title="메인사진 지정" style="position:absolute;top:-2px;left:-2px;width:22px;height:22px;border-radius:50%;background:' + (idx === mainIndex ? '#f59e0b' : 'rgba(0,0,0,0.4)') + ';color:#fff;border:none;font-size:12px;cursor:pointer;line-height:22px;padding:0;">★</button>' +
          // 삭제 버튼
          '<button class="ws-del-btn" style="position:absolute;top:-2px;right:-2px;width:20px;height:20px;border-radius:50%;background:#e53e3e;color:#fff;border:none;font-size:11px;cursor:pointer;line-height:20px;padding:0;">✕</button>';

        // 메인사진 클릭
        thumb.querySelector('.ws-main-btn').addEventListener('click', function(e) {
          e.stopPropagation();
          mainIndex = idx;
          renderPreview();
        });

        // 삭제 클릭
        thumb.querySelector('.ws-del-btn').addEventListener('click', function(e) {
          e.stopPropagation();
          selectedFiles.splice(idx, 1);
          if (mainIndex >= selectedFiles.length) mainIndex = Math.max(0, selectedFiles.length - 1);
          if (mainIndex > idx) mainIndex--;
          renderPreview();
          if (selectedFiles.length === 0) submitBtn.style.display = 'none';
        });

        // 드래그 순서 변경
        thumb.addEventListener('dragstart', function(e) {
          dragSrcIdx = idx;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', idx);
          thumb.style.opacity = '0.4';
        });
        thumb.addEventListener('dragend', function() {
          thumb.style.opacity = '1';
          dragSrcIdx = null;
          // 드래그 하이라이트 제거
          previewContainer.querySelectorAll('[data-idx]').forEach(function(el) {
            el.style.transform = '';
          });
        });
        thumb.addEventListener('dragover', function(e) {
          e.preventDefault();
          if (dragSrcIdx !== null && dragSrcIdx !== idx) {
            e.dataTransfer.dropEffect = 'move';
            thumb.style.transform = 'scale(1.1)';
          }
        });
        thumb.addEventListener('dragleave', function() {
          thumb.style.transform = '';
        });
        thumb.addEventListener('drop', function(e) {
          e.preventDefault();
          e.stopPropagation();
          thumb.style.transform = '';
          if (dragSrcIdx === null || dragSrcIdx === idx) return;
          // 순서 변경
          var moved = selectedFiles.splice(dragSrcIdx, 1)[0];
          selectedFiles.splice(idx, 0, moved);
          // 메인 인덱스 업데이트
          if (mainIndex === dragSrcIdx) { mainIndex = idx; }
          else if (dragSrcIdx < mainIndex && idx >= mainIndex) { mainIndex--; }
          else if (dragSrcIdx > mainIndex && idx <= mainIndex) { mainIndex++; }
          dragSrcIdx = null;
          renderPreview();
        });

        previewContainer.appendChild(thumb);
      });

      // 안내 문구
      if (selectedFiles.length > 0) {
        var hint = document.createElement('div');
        hint.style.cssText = 'font-size:11px;color:#999;margin-top:6px;text-align:center;';
        hint.textContent = '드래그로 순서 변경 · ★ 클릭으로 메인사진 지정 (현재 메인: ' + (mainIndex + 1) + '번)';
        previewContainer.appendChild(hint);
        submitBtn.style.display = 'block';
        submitBtn.textContent = selectedFiles.length + '장 사진 등록하기';
      }
    }

    function handleFiles(files) {
      var submitBtn = document.getElementById('ws-photo-upload-submit');
      var added = 0;

      Array.from(files).forEach(function(file) {
        if (!file.type.startsWith('image/')) return;
        if (file.size > 10 * 1024 * 1024) {
          window.WS.showToast(file.name + ': 10MB 초과', 'error');
          return;
        }
        if (selectedFiles.length >= 20) {
          window.WS.showToast('최대 20장까지 선택 가능합니다', 'error');
          return;
        }
        // 동기적으로 파일 추가 (dataUrl은 비동기로 로드)
        var item = { file: file, dataUrl: '' };
        selectedFiles.push(item);
        added++;

        var reader = new FileReader();
        reader.onload = function(ev) {
          item.dataUrl = ev.target.result;
          // 모든 미리보기 로드 완료되면 렌더
          var allLoaded = selectedFiles.every(function(s) { return s.dataUrl !== ''; });
          if (allLoaded) renderPreview();
        };
        reader.readAsDataURL(file);
      });

      if (added > 0 && selectedFiles.every(function(s) { return s.dataUrl !== ''; })) {
        renderPreview();
      }
      if (selectedFiles.length > 0) {
        submitBtn.style.display = 'block';
        submitBtn.textContent = selectedFiles.length + '장 사진 등록하기';
      }
    }

    // 이미지 압축 함수: Canvas로 리사이즈 + JPEG 압축 (Vercel 4.5MB 제한 대응)
    function compressImage(file, maxWidth, quality) {
      return new Promise(function(resolve) {
        if (file.size <= 200 * 1024) { resolve(file); return; }
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function() {
          URL.revokeObjectURL(url);
          var w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          function tryCompress(q) {
            canvas.toBlob(function(blob) {
              if (!blob) { resolve(file); return; }
              if (blob.size > 2 * 1024 * 1024 && q > 0.3) {
                tryCompress(q - 0.15);
                return;
              }
              resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
            }, 'image/jpeg', q);
          }
          tryCompress(quality || 0.7);
        };
        img.onerror = function() { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      });
    }

    // 업로드 실행 — 3개 병렬 업로드로 속도 대폭 개선
    document.getElementById('ws-photo-upload-submit').addEventListener('click', function() {
      var submitBtn = this;
      var progressDiv = document.getElementById('ws-photo-progress');
      var progressFill = document.getElementById('ws-photo-progress-fill');

      if (selectedFiles.length === 0) return;

      submitBtn.disabled = true;
      submitBtn.style.background = '#999';
      submitBtn.textContent = '압축 중...';
      progressDiv.style.display = 'block';
      progressFill.style.width = '2%';

      // 1단계: 모든 이미지 동시 압축 (1024px, JPEG 70%, 목표 2MB 이하)
      var filesToUpload = selectedFiles.map(function(item) { return item.file; });
      var compressPromises = filesToUpload.map(function(f) {
        return compressImage(f, 1024, 0.7);
      });

      Promise.all(compressPromises).then(function(compressedFiles) {
        var totalFiles = compressedFiles.length;
        var completedCount = 0;
        var failCount = 0;
        var uploadedImages = [];
        var MAX_RETRIES = 2;
        var CONCURRENCY = 3; // 3개 동시 업로드

        submitBtn.textContent = '업로드 중... (0/' + totalFiles + ')';
        progressFill.style.width = '5%';

        function uploadOneFile(file, fileIdx, retryNum) {
          var formData = new FormData();
          formData.append('images', file);

          return fetch('https://wishes.co.kr/api/listings/' + listing.id + '/images', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer wishes2026' },
            body: formData
          })
          .then(function(r) {
            return r.text().then(function(txt) {
              if (!r.ok) {
                if (r.status === 413) throw new Error('파일 크기 초과 (413)');
                throw new Error('서버 오류 (' + r.status + '): ' + (txt || '').substring(0, 200));
              }
              try { return JSON.parse(txt); } catch(e) { throw new Error('응답 파싱 실패'); }
            });
          })
          .then(function(result) {
            if (result.success && result.images) {
              result.images.forEach(function(img) { uploadedImages.push(img); });
              return true;
            }
            throw new Error(result.error || '알 수 없는 오류');
          })
          .catch(function(err) {
            if (retryNum < MAX_RETRIES) {
              return new Promise(function(res) { setTimeout(res, 500); }).then(function() {
                return uploadOneFile(file, fileIdx, retryNum + 1);
              });
            }
            window.WS.showToast((fileIdx + 1) + '번째 사진 실패: ' + err.message, 'error');
            failCount++;
            return false;
          });
        }

        // 병렬 업로드 큐 (CONCURRENCY개 동시)
        var queue = compressedFiles.map(function(f, i) { return { file: f, idx: i }; });
        var running = 0;
        var queueIdx = 0;

        function processQueue() {
          while (running < CONCURRENCY && queueIdx < queue.length) {
            var item = queue[queueIdx++];
            running++;
            (function(itm) {
              uploadOneFile(itm.file, itm.idx, 0).then(function() {
                running--;
                completedCount++;
                var pct = Math.round((completedCount / totalFiles) * 90) + 5;
                progressFill.style.width = pct + '%';
                submitBtn.textContent = '업로드 중... (' + completedCount + '/' + totalFiles + ')';

                if (completedCount >= totalFiles) {
                  onAllDone();
                } else {
                  processQueue();
                }
              });
            })(item);
          }
        }

        function onAllDone() {
          progressFill.style.width = '100%';
          if (uploadedImages.length > 0) {
            window.WS.showToast(uploadedImages.length + '장 등록 완료' + (failCount > 0 ? ' (' + failCount + '장 실패)' : ''), failCount > 0 ? 'warning' : 'success');
          } else {
            window.WS.showToast('사진 업로드에 실패했습니다.', 'error');
          }

          var localListing = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(listing.id); });
          if (localListing && uploadedImages.length > 0) {
            if (!localListing.images) localListing.images = [];
            if (!localListing.listing_images) localListing.listing_images = [];
            uploadedImages.forEach(function(img) {
              localListing.images.push({ url: img.url });
              localListing.listing_images.push({ url: img.url });
            });
            window.WS.renderListings();
          }

          setTimeout(function() { modal.remove(); }, 1200);
        }

        processQueue();
      });
    });
  };

  /**
   * Render pagination
   */
  window.WS.renderPagination = function() {
    const container = document.getElementById('ws-pagination');
    if (!container) return;

    const filtered = window.WS.filtered || [];
    const totalPages = window.WS.state.perPage > 0 ? Math.ceil(filtered.length / window.WS.state.perPage) : 1;
    const current = window.WS.state.page;

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    let html = '';
    // Previous button
    if (current > 1) {
      html += `<button class="ws-page-btn" data-page="${current - 1}">◀</button>`;
    }

    // Smart pagination: show max 7 page buttons with ellipsis
    var maxVisible = 7;
    var startPage = 1;
    var endPage = totalPages;

    if (totalPages > maxVisible) {
      var half = Math.floor(maxVisible / 2);
      startPage = Math.max(1, current - half);
      endPage = Math.min(totalPages, startPage + maxVisible - 1);
      if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
      }
    }

    if (startPage > 1) {
      html += `<button class="ws-page-btn" data-page="1">1</button>`;
      if (startPage > 2) html += `<span style="padding:0 4px;color:#999;">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      const active = i === current ? 'ws-page-active' : '';
      html += `<button class="ws-page-btn ${active}" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span style="padding:0 4px;color:#999;">...</span>`;
      html += `<button class="ws-page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    // Next button
    if (current < totalPages) {
      html += `<button class="ws-page-btn" data-page="${current + 1}">▶</button>`;
    }

    container.innerHTML = html;

    // Attach page click handlers
    container.querySelectorAll('.ws-page-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        window.WS.state.page = parseInt(this.dataset.page, 10);
        window.WS.renderListings();
        window.WS.renderPagination();
        // Scroll to top of listings
        var listingsEl = document.getElementById('ws-listings');
        if (listingsEl) listingsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  };

  /**
   * Quick Preview Popup — 주소 클릭 시 핵심정보만 간략히 보여줌
   */
  window.WS._showQuickPreview = function(listing, anchorEl) {
    // 기존 퀵프리뷰 제거
    var existing = document.getElementById('ws-quick-preview');
    if (existing) existing.remove();

    var addrText = _getDisplayAddress(listing);
    var bn = (listing.building_info && listing.building_info.건물명 || '').trim().replace(/[·\-]\s*(철근콘크리트|철골|조적|목구조|경량철골|벽식)[가-힣]*/g, '').replace(/^\s*[·\-]\s*/, '').trim();
    var areaM2 = listing.area_m2 ? listing.area_m2 + 'm²(' + Math.round(listing.area_m2 / 3.30579) + '평)' : '-';
    var floorInfo = '';
    if (listing.floor_current) {
      var fc = String(listing.floor_current);
      floorInfo = (fc.indexOf('/') >= 0 || fc.indexOf('층') >= 0) ? fc.replace(/층$/, '') + '층' : fc + '/' + (listing.floor_total || '?') + '층';
    }
    var priceText = formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal);
    var dealType = listing.deal || '-';
    var maint = (listing.maintenance_fee && listing.maintenance_fee > 0) ? listing.maintenance_fee + '만' : '미입력';
    var builtYear = getBuiltYear(listing);
    var direction = listing.direction || '';
    var imgs = listing.images || listing.listing_images || [];

    var popup = document.createElement('div');
    popup.id = 'ws-quick-preview';
    popup.innerHTML =
      '<div class="ws-qp-header">' +
        '<strong>' + escHtml(addrText) + '</strong>' +
        (bn && bn.length > 1 ? ' <span style="color:#888;font-size:12px;">(' + escHtml(bn) + ')</span>' : '') +
        '<button class="ws-qp-close">&times;</button>' +
      '</div>' +
      '<div class="ws-qp-body">' +
        '<div class="ws-qp-price"><span class="ws-qp-deal">' + escHtml(dealType) + '</span> <span class="ws-qp-amount">' + priceText + '</span></div>' +
        '<table class="ws-qp-table">' +
          '<tr><td>면적</td><td>' + escHtml(areaM2) + '</td>' +
              '<td>층수</td><td>' + escHtml(floorInfo || '-') + '</td></tr>' +
          '<tr><td>관리비</td><td>' + escHtml(maint) + '</td>' +
              '<td>방향</td><td>' + escHtml(direction || '-') + '</td></tr>' +
          '<tr><td>유형</td><td>' + escHtml(listing.type || '-') + '</td>' +
              '<td>준공</td><td>' + escHtml(builtYear || '-') + '</td></tr>' +
          (listing.rooms || listing.bathrooms ? '<tr><td>방/욕실</td><td>' + (listing.rooms || '-') + '/' + (listing.bathrooms || '-') + '</td><td>사진</td><td>' + imgs.length + '장</td></tr>' : '<tr><td>사진</td><td colspan="3">' + imgs.length + '장</td></tr>') +
        '</table>' +
        '<div class="ws-qp-actions">' +
          '<button class="ws-qp-detail-btn" data-id="' + listing.id + '">상세보기</button>' +
          '<span class="ws-qp-id">매물번호 ' + listing.id + '</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(popup);

    // 위치 계산: 카드 주소 옆에 표시
    var rect = anchorEl.getBoundingClientRect();
    var popupW = 340;
    var left = rect.left + rect.width + 8;
    if (left + popupW > window.innerWidth) left = rect.left - popupW - 8;
    if (left < 4) left = 4;
    var top = rect.top - 10;
    if (top + 260 > window.innerHeight) top = window.innerHeight - 270;
    if (top < 4) top = 4;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    // 닫기 버튼
    popup.querySelector('.ws-qp-close').addEventListener('click', function() { popup.remove(); });

    // 상세보기 버튼
    popup.querySelector('.ws-qp-detail-btn').addEventListener('click', function() {
      popup.remove();
      window.WS.showDetail(listing);
    });

    // 바깥 클릭 시 닫기
    setTimeout(function() {
      function closeOnOutside(e) {
        if (!popup.contains(e.target) && !anchorEl.contains(e.target)) {
          popup.remove();
          document.removeEventListener('click', closeOnOutside, true);
        }
      }
      document.addEventListener('click', closeOnOutside, true);
    }, 100);
  };

  /**
   * Show detail modal
   */
  window.WS.showDetail = function(listing) {
    const modal = document.getElementById('ws-modal-detail');
    const container = document.getElementById('ws-detail-container');
    if (!modal || !container) return;

    let html = `
      <div class="ws-detail-header">
        <h2>${escHtml(listing.title || '-')}</h2>
        <p><span style="display:inline-block;background:#2D5A27;color:#fff;padding:1px 8px;border-radius:4px;font-size:12px;font-weight:700;margin-right:6px;cursor:pointer;" class="ws-copy-id" data-copy="${listing.id}">매물번호 ${listing.id}</span>${listing.source_site === 'gongsilclub' ? '<span style="display:inline-block;padding:1px 8px;border-radius:4px;background:#4CAF50;color:#fff;font-size:11px;font-weight:700;margin-right:6px;">G 공실클럽</span>' : listing.source_site === 'onhouse' ? '<span style="display:inline-block;padding:1px 8px;border-radius:4px;background:#FF9800;color:#fff;font-size:11px;font-weight:700;margin-right:6px;">O 온하우스</span>' : ''}${escHtml(listing.address || '-')} ${escHtml(listing.dong || '')}${listing.address_detail ? ' <span style="color:#1976D2;font-weight:600;">' + escHtml(listing.address_detail) + '</span>' : ''}${listing.building_name ? ' <span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:4px;background:#F5F5F5;color:#555;font-size:11px;font-weight:600;">🏢 ' + escHtml(listing.building_name) + '</span>' : ''}</p>
      </div>

      <div class="ws-detail-gallery">
        ${(function() {
          var detailImgs = listing.images || listing.listing_images || [];
          var firstUrl = detailImgs.length > 0 ? (detailImgs[0].url || detailImgs[0]) : '';
          var imgUrls = detailImgs.map(function(img) { return img.url || img; });
          return '<div class="ws-gallery-main" id="ws-gallery-main" style="background-image: url(\'' + escHtml(firstUrl) + '\'); cursor:pointer;" title="클릭하면 확대됩니다"' +
            ' data-images="' + JSON.stringify(imgUrls).replace(/"/g, '&quot;') + '"' +
            ' data-current="0">' +
            '<div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.6);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">🔍 클릭하여 확대</div>' +
            '</div>' +
            '<div class="ws-gallery-thumbs">' +
            detailImgs.map(function(img, idx) {
              var u = img.url || img;
              return '<img src="' + escHtml(u) + '" alt="thumbnail" class="ws-thumb' + (idx === 0 ? ' ws-thumb-active' : '') + '" data-url="' + escHtml(u) + '" data-idx="' + idx + '">';
            }).join('') +
            '</div>';
        })()}
      </div>

      ${(function() {
        // 용도별 필드 분리: 사무실/상가 vs 주거용
        var t = (listing.type || '').toLowerCase();
        var isOffice = /사무|오피스|office|건물|기타/.test(t);
        var isStore = /상가|점포|매장|store|shop|식당|카페|음식|편의점/.test(t);
        // [fix 2026-04-14] 공실클럽 매물(source=gongsilclub)은 기본적으로 사무실/상가
        //   type 이 '건물', '기타' 여도 거주용 필드(반려동물/베란다/풀옵션) 대신
        //   상가 전용 필드(현업종/권장업종 등) 를 보여줘야 함
        var isCommercial = isOffice || isStore || (listing.source_site === 'gongsilclub');

        var basicHtml = '<div class="ws-detail-section"><h3>기본정보</h3><div class="ws-detail-grid">';
        basicHtml += '<div><strong>타입</strong> ' + (listing.type || '-') + '</div>';
        basicHtml += '<div><strong>면적</strong> ' + (formatArea(listing.area_m2) || '-') + (listing.area_supply_m2 ? ' (공급 ' + formatArea(listing.area_supply_m2) + ')' : '') + '</div>';
        basicHtml += '<div><strong>층수</strong> ' + (listing.floor_current ? (/층|단독|옥상|지붕|루프/i.test(String(listing.floor_current)) ? listing.floor_current : listing.floor_current + '층') : '-') + (listing.floor_total ? ' / ' + listing.floor_total + '층' : '') + '</div>';
        if (listing.building_name) basicHtml += '<div><strong>건물명</strong> ' + escHtml(listing.building_name) + '</div>';
        if (listing.building_purpose) basicHtml += '<div><strong>용도</strong> ' + escHtml(listing.building_purpose) + '</div>';
        if (!isCommercial) {
          // 주거용: 방/욕실, 방향, 구조
          basicHtml += '<div><strong>방/욕실</strong> ' + (listing.rooms || '-') + '개 / ' + (listing.bathrooms || '-') + '개</div>';
          basicHtml += '<div><strong>방향</strong> ' + (listing.direction || '-') + '</div>';
          basicHtml += '<div><strong>구조</strong> ' + (listing.room_shape || listing.entrance_type || '-') + '</div>';
        } else {
          // 사무실/상가: 전용률, 방향
          if (listing.area_supply_m2 && listing.area_m2) {
            var ratio = Math.round((listing.area_m2 / listing.area_supply_m2) * 100);
            basicHtml += '<div><strong>전용률</strong> ' + ratio + '%</div>';
          }
          basicHtml += '<div><strong>방향</strong> ' + (listing.direction || '-') + '</div>';
          if (isOffice && listing.rooms) {
            basicHtml += '<div><strong>회의실/룸</strong> ' + listing.rooms + '개</div>';
          }
          if (isStore) {
            basicHtml += '<div><strong>구조</strong> ' + (listing.room_shape || listing.entrance_type || '-') + '</div>';
          }
        }
        basicHtml += '</div></div>';

        // 가격정보
        var priceHtml = '<div class="ws-detail-section"><h3>가격정보</h3><div class="ws-detail-grid">';
        priceHtml += '<div><strong>거래유형</strong> ' + (listing.deal || '-') + '</div>';
        priceHtml += '<div><strong>가격</strong> ' + (formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal) || '-') + '</div>';
        // 관리비
        var mf = listing.maintenance_fee;
        var mi = listing.maintenance_includes;
        if (mf && mf > 0) {
          priceHtml += '<div><strong>관리비</strong> ' + mf + '만원';
          if (mi) priceHtml += '<div style="font-size:11px;color:#16a34a;margin-top:2px;">✅ 포함: ' + mi + '</div>';
          priceHtml += '</div>';
        } else {
          priceHtml += '<div><strong>관리비</strong> <span style="color:#f59e0b;font-style:italic;">미입력</span></div>';
        }
        // 사무실/상가: 평당 임대료
        if (isCommercial && listing.area_m2 && listing.monthly) {
          var pyeong = listing.area_m2 / 3.30579;
          var rentPerPy = Math.round(listing.monthly / pyeong);
          priceHtml += '<div><strong>평당 임대료</strong> 약 ' + rentPerPy + '만</div>';
        }
        if (!isCommercial) {
          priceHtml += '<div><strong>전세대출</strong> ' + (listing.loan_available ? '가능' : (listing.deal === '전세' ? '<span style="color:#999;font-style:italic;">미확인</span>' : '-')) + '</div>';
        }
        if (isStore && listing.rights_fee) priceHtml += '<div><strong>권리금</strong> ' + listing.rights_fee + '만</div>';
        if (listing.lease_period) priceHtml += '<div><strong>임대기간</strong> ' + listing.lease_period + '</div>';
        if (listing.price_per_pyeong) priceHtml += '<div><strong>평당가</strong> ' + listing.price_per_pyeong + '만</div>';
        if (listing.commission_fee || listing.commission_note) {
          priceHtml += '<div><strong>수수료</strong> ' + (listing.commission_fee ? listing.commission_fee + '만원' : '') +
            (listing.commission_note ? ' <span style="color:#666;font-size:11px;">(' + escHtml(listing.commission_note) + ')</span>' : '') + '</div>';
        }
        priceHtml += '</div></div>';

        // 시설/옵션
        var facilHtml = '<div class="ws-detail-section"><h3>시설/옵션</h3><div class="ws-detail-grid">';
        // 공통: 주차
        var parkingMain = (listing.parking ? (getParkingCount(listing) > 1 ? getParkingCount(listing) + ' 대' : '가능') : (listing.building_info && listing.building_info.총주차대수 !== undefined ? (parseInt(listing.building_info.총주차대수) > 0 ? parseInt(listing.building_info.총주차대수) + ' 대 <span style="color:#888;font-size:11px;">(건축물대장)</span>' : '불가') : '<span style="color:#999;font-style:italic;">미확인</span>'));
        if (listing.parking_spaces && parseInt(listing.parking_spaces) > 0) parkingMain = parseInt(listing.parking_spaces) + ' 대';
        if (listing.parking_fee && parseInt(listing.parking_fee) > 0) parkingMain += ' <span style="color:#f59e0b;font-size:11px;">(월 ' + listing.parking_fee + '만원)</span>';
        facilHtml += '<div><strong>주차</strong> ' + parkingMain + '</div>';
        // 공통: 엘리베이터 — [fix 2026-04-14] options/features/raw_fields 까지 확인
        var evFromOpts = (typeof listing.options === 'string' && /엘리베이터|EV|E\/V/i.test(listing.options));
        var evFromFeat = Array.isArray(listing.features) && listing.features.some(function(f){ return /엘리베이터|EV|E\/V/i.test(String(f)); });
        var evFromRaw = listing.raw_fields && typeof listing.raw_fields === 'object' && /엘리베이터|EV|E\/V/i.test(String(listing.raw_fields['옵션'] || ''));
        var hasEV = listing.elevator === true || evFromOpts || evFromFeat || evFromRaw;
        facilHtml += '<div><strong>엘리베이터</strong> ' + (hasEV ? '있음' : (listing.building_info && listing.building_info.승용엘리베이터 !== undefined ? (parseInt(listing.building_info.승용엘리베이터) > 0 ? parseInt(listing.building_info.승용엘리베이터) + ' 대 <span style="color:#888;font-size:11px;">(건축물대장)</span>' : '없음') : '<span style="color:#999;font-style:italic;">미확인</span>')) + '</div>';
        // 공통: 난방
        facilHtml += '<div><strong>난방</strong> ' + (listing.heating_type || '-') + '</div>';

        if (isCommercial) {
          // 사무실/상가 전용 필드
          facilHtml += '<div><strong>입주가능</strong> ' + (listing.available_date || '-') + '</div>';
          facilHtml += '<div><strong>준공년도</strong> ' + (getBuiltYear(listing.built_year) ? getBuiltYear(listing.built_year) + '년' : '-') + '</div>';
          // [fix 2026-04-14] 임대기간 / 구조형태 / 권리금 / 현업종 / 권장업종 / 제한업종 / 건물내매물
          if (listing.lease_period) facilHtml += '<div><strong>임대기간</strong> ' + escHtml(String(listing.lease_period)) + '</div>';
          if (listing.entrance_type) facilHtml += '<div><strong>구조형태</strong> ' + escHtml(String(listing.entrance_type)) + '</div>';
          if (listing.rights_fee !== null && listing.rights_fee !== undefined) {
            facilHtml += '<div><strong>권리금</strong> ' + (Number(listing.rights_fee) > 0 ? Number(listing.rights_fee).toLocaleString() + '만원' : '없음') + '</div>';
          }
          if (listing.previous_business) facilHtml += '<div><strong>현업종/상호</strong> ' + escHtml(String(listing.previous_business)) + '</div>';
          if (listing.recommended_business) facilHtml += '<div><strong>권장업종</strong> ' + escHtml(String(listing.recommended_business)) + '</div>';
          if (listing.restricted_business) facilHtml += '<div><strong>제한업종</strong> ' + escHtml(String(listing.restricted_business)) + '</div>';
          if (listing.building_listings) facilHtml += '<div style="grid-column:1/-1;"><strong>건물 내 매물</strong> ' + escHtml(String(listing.building_listings)) + '</div>';
          facilHtml += '<div><strong>등록일</strong> ' + timeAgo(listing.created_at) + '</div>';
          if (listing.registered_date) facilHtml += '<div><strong>원본등록</strong> ' + escHtml(String(listing.registered_date)) + '</div>';
          if (listing.last_confirmed) facilHtml += '<div><strong>최종확인</strong> ' + escHtml(String(listing.last_confirmed)) + '</div>';
        } else {
          // 주거용 전용 필드
          facilHtml += '<div><strong>반려동물</strong> ' + (listing.pet ? '가능' : '<span style="color:#999;font-style:italic;">미확인</span>') + '</div>';
          facilHtml += '<div><strong>베란다</strong> ' + (listing.balcony ? '있음' : '<span style="color:#999;font-style:italic;">미확인</span>') + '</div>';
          facilHtml += '<div><strong>풀옵션</strong> ' + (listing.full_option ? '예' : '<span style="color:#999;font-style:italic;">미확인</span>') + '</div>';
          facilHtml += '<div><strong>입주가능</strong> ' + (listing.available_date || '-') + '</div>';
          facilHtml += '<div><strong>준공년도</strong> ' + (getBuiltYear(listing.built_year) ? getBuiltYear(listing.built_year) + '년' : '-') + '</div>';
          facilHtml += '<div><strong>등록일</strong> ' + timeAgo(listing.created_at) + '</div>';
          if (listing.registered_date) facilHtml += '<div><strong>원본등록</strong> ' + escHtml(String(listing.registered_date)) + '</div>';
          if (listing.last_confirmed) facilHtml += '<div><strong>최종확인</strong> ' + escHtml(String(listing.last_confirmed)) + '</div>';
        }
        facilHtml += '</div></div>';

        // 특이사항 (description 과 다를 때만)
        var specialHtml = '';
        if (listing.special_notes && listing.special_notes !== listing.description) {
          specialHtml = '<div class="ws-detail-section" style="background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:14px;">' +
            '<h3 style="color:#c2410c;">⚠️ 특이사항</h3>' +
            '<p style="white-space:pre-line;font-size:13px;line-height:1.7;color:#7c2d12;margin:0;">' + escHtml(listing.special_notes) + '</p></div>';
        }

        // 특징/태그 (features)
        var featHtml = '';
        if (Array.isArray(listing.features) && listing.features.length > 0) {
          featHtml = '<div class="ws-detail-section"><h3>특징</h3><div style="display:flex;flex-wrap:wrap;gap:6px;">' +
            listing.features.map(function(f){
              return '<span style="display:inline-block;padding:4px 10px;border-radius:14px;background:#E3F2FD;color:#1565C0;font-size:12px;font-weight:500;">#' + escHtml(String(f)) + '</span>';
            }).join('') +
            '</div></div>';
        }

        // 원본 정보 (raw_fields) — 파서가 놓친 필드까지 보존
        var rawHtml = '';
        var raw = listing.raw_fields;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          var rawRows = '';
          var rawKeys = Object.keys(raw);
          // [fix 2026-04-14 v5] UI 방어선 — DB 에 들어간 노이즈 라벨도 화면에 안 보이게
          var JUNK_RE = [
            /^인쇄$/, /^확대보기$/, /^연락처보기$/, /^네이버전송/, /^정보요청$/,
            /^공유$/, /^다운로드$/, /^이전$/, /^다음$/, /^더보기$/, /^닫기$/,
            /^보유:?\s*\d+/, /^즐겨찾기$/, /^찜하기$/, /^신고$/, /^목록$/,
            /보기$/, /전송$/, /요청$/, /^\(즉시입주\)/,
          ];
          var VALUE_RE = [
            /^(가능|불가|있음|없음|예|아니오|무|유|모름)$/,
            /^[가-힣]{2,4}\s*(불가|가능|미정|미입력|미확인)$/,
            /^(일반|단기|장기)?(임대|매매|전세|월세)$/,
            /^(전층|일부|단독|공용)\s*(사용|점유)?$/,
          ];
          function isJunkLabel(k){
            if (JUNK_RE.some(function(r){return r.test(k);})) return true;
            if (VALUE_RE.some(function(r){return r.test(k);})) return true;
            // 라벨이 값과 동일
            var v = raw[k];
            if (typeof v === 'string' && v.trim() === k) return true;
            return false;
          }
          // 메타키(__로 시작) 분리 — 라벨 정보는 위쪽, 원본본문/URL/시각은 아래 별도 영역
          var normalKeys = rawKeys.filter(function(k){ return !k.startsWith('__') && !isJunkLabel(k); });
          var metaKeys = rawKeys.filter(function(k){ return k.startsWith('__'); });
          normalKeys.forEach(function(k) {
            var v = raw[k];
            if (v == null || v === '') return;
            var vStr = typeof v === 'string' ? v : (Array.isArray(v) ? v.join(', ') : JSON.stringify(v));
            rawRows += '<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px dashed #e5e7eb;">' +
              '<span style="min-width:120px;font-weight:600;color:#475569;font-size:12px;">' + escHtml(k) + '</span>' +
              '<span style="flex:1;color:#1e293b;font-size:12px;white-space:pre-line;">' + escHtml(vStr) + '</span></div>';
          });
          // 메타정보 (원본본문/URL/시각) — 접힌 details 로 추가
          if (metaKeys.length > 0) {
            var metaRows = '';
            metaKeys.forEach(function(k) {
              var v = raw[k];
              if (v == null || v === '') return;
              var vStr = typeof v === 'string' ? v : JSON.stringify(v);
              var label = k.replace(/^__|__$/g, '');
              if (k === '__원본본문__') {
                metaRows += '<div style="margin-top:8px;"><div style="font-weight:600;color:#475569;font-size:12px;margin-bottom:4px;">📄 ' + escHtml(label) + '</div>' +
                  '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px;font-size:11px;line-height:1.6;color:#334155;white-space:pre-line;max-height:200px;overflow-y:auto;">' + escHtml(vStr) + '</div></div>';
              } else {
                metaRows += '<div style="display:flex;gap:10px;padding:4px 0;font-size:11px;color:#64748b;">' +
                  '<span style="min-width:100px;font-weight:600;">' + escHtml(label) + '</span>' +
                  '<span style="flex:1;">' + escHtml(vStr) + '</span></div>';
              }
            });
            rawRows += '<details style="margin-top:10px;background:#fff;border:1px dashed #cbd5e1;border-radius:6px;padding:8px;">' +
              '<summary style="cursor:pointer;font-size:11px;color:#64748b;font-weight:600;">🔍 원본 페이지 백업 (본문/URL/크롤시각)</summary>' +
              '<div style="margin-top:8px;">' + metaRows + '</div></details>';
          }
          if (rawRows) {
            // [fix 2026-04-14 v4] 항상 펼쳐진 형태 — "단 하나의 정보도 놓치지 않음"
            rawHtml = '<div class="ws-detail-section" style="background:#f8fafc;border:2px solid #2D5A27;border-radius:10px;padding:14px;">' +
              '<h3 style="color:#2D5A27;margin:0 0 10px 0;display:flex;align-items:center;gap:6px;">📋 원본 전체 정보 <span style="font-size:11px;background:#2D5A27;color:#fff;padding:2px 8px;border-radius:10px;">' + rawKeys.length + '개 라벨</span></h3>' +
              '<div style="font-size:11px;color:#64748b;margin-bottom:8px;">크롤링 원본 데이터 (UI에 매핑되지 않은 필드 포함 전체)</div>' +
              '<div>' + rawRows + '</div></div>';
          }
        }
        return basicHtml + priceHtml + facilHtml + specialHtml + featHtml + rawHtml;
      })()}

      ${(function() {
        var bi = listing.building_info;
        if (!bi || typeof bi !== 'object') return '';
        var rows = [];
        if (bi.건물명) rows.push('<div><strong>건물명</strong> ' + escHtml(bi.건물명) + '</div>');
        if (bi.주용도) rows.push('<div><strong>용도</strong> ' + escHtml(bi.주용도) + '</div>');
        if (bi.건물구조) rows.push('<div><strong>구조</strong> ' + escHtml(bi.건물구조) + '</div>');
        if (bi.사용승인일) rows.push('<div><strong>사용승인일</strong> ' + escHtml(String(bi.사용승인일).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')) + '</div>');
        if (bi.지상층수) rows.push('<div><strong>지상/지하</strong> ' + bi.지상층수 + '층/' + (bi.지하층수 || 0) + '층</div>');
        if (bi.세대수) rows.push('<div><strong>세대수</strong> ' + bi.세대수 + '세대' + (bi.호수 ? ' (' + bi.호수 + '호)' : '') + '</div>');
        if (bi.대지면적 && parseFloat(bi.대지면적) > 0) rows.push('<div><strong>대지면적</strong> ' + parseFloat(bi.대지면적).toFixed(2) + 'm²</div>');
        if (bi.연면적 && parseFloat(bi.연면적) > 0) rows.push('<div><strong>연면적</strong> ' + parseFloat(bi.연면적).toFixed(2) + 'm²</div>');
        if (bi.건축면적 && parseFloat(bi.건축면적) > 0) rows.push('<div><strong>건축면적</strong> ' + parseFloat(bi.건축면적).toFixed(2) + 'm²</div>');
        if (bi.건폐율 && parseFloat(bi.건폐율) > 0) rows.push('<div><strong>건폐율</strong> ' + parseFloat(bi.건폐율).toFixed(2) + '%</div>');
        if (bi.용적률 && parseFloat(bi.용적률) > 0) rows.push('<div><strong>용적률</strong> ' + parseFloat(bi.용적률).toFixed(2) + '%</div>');
        if (bi.총주차대수) rows.push('<div><strong>총 주차</strong> ' + bi.총주차대수 + '대' + (bi.세대당주차대수 ? ' (세대당 ' + bi.세대당주차대수 + ')' : '') + '</div>');
        var parkingDetail = [];
        if (bi.옥내자주식주차 && parseInt(bi.옥내자주식주차) > 0) parkingDetail.push('옥내자주식 ' + bi.옥내자주식주차);
        if (bi.옥내기계식주차 && parseInt(bi.옥내기계식주차) > 0) parkingDetail.push('옥내기계식 ' + bi.옥내기계식주차);
        if (bi.옥외자주식주차 && parseInt(bi.옥외자주식주차) > 0) parkingDetail.push('옥외자주식 ' + bi.옥외자주식주차);
        if (bi.옥외기계식주차 && parseInt(bi.옥외기계식주차) > 0) parkingDetail.push('옥외기계식 ' + bi.옥외기계식주차);
        if (parkingDetail.length > 0) rows.push('<div style="grid-column: span 2;"><strong>주차상세</strong> ' + parkingDetail.join(' / ') + '</div>');
        if (bi.승용엘리베이터) rows.push('<div><strong>승용EV</strong> ' + bi.승용엘리베이터 + '대</div>');
        if (bi.비상용엘리베이터) rows.push('<div><strong>비상EV</strong> ' + bi.비상용엘리베이터 + '대</div>');
        if (bi.허가일) rows.push('<div><strong>허가일</strong> ' + escHtml(String(bi.허가일).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')) + '</div>');
        if (bi.지붕구조) rows.push('<div><strong>지붕</strong> ' + escHtml(bi.지붕구조) + '</div>');
        if (bi.대장구분) rows.push('<div><strong>대장구분</strong> ' + escHtml(bi.대장구분) + '</div>');
        if (bi.위반건축물여부) rows.push('<div><strong>위반건축물</strong> <span style="color:' + (bi.위반건축물여부 === '없음' || bi.위반건축물여부 === 'N' ? '#2D5A27' : '#D32F2F') + ';font-weight:700;">' + escHtml(bi.위반건축물여부) + '</span></div>');
        if (rows.length === 0) return '';
        return '<div class="ws-detail-section" style="background:#f0f7ed;border:1px solid #c8e6c9;border-radius:10px;padding:16px;">' +
          '<h3 style="color:#2D5A27;">🏗️ 건축물대장</h3>' +
          '<div class="ws-detail-grid" style="grid-template-columns: repeat(3, 1fr);">' + rows.join('') + '</div></div>';
      })()}

      <div class="ws-detail-section">
        <h3 style="display:flex;justify-content:space-between;align-items:center;">상세설명
          <button id="ws-ai-generate-${listing.id}" style="padding:6px 14px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;">
            ✨ AI SEO 설명 생성
          </button>
        </h3>
        <div id="ws-ai-status-${listing.id}"></div>
        <p id="ws-description-text-${listing.id}" style="white-space:pre-line;font-size:14px;line-height:1.85;color:#333;padding:12px;background:#fafafa;border-radius:8px;">${escHtml(listing.description || '설명이 없습니다.')}</p>
      </div>

      ${listing.lat && listing.lng ? `
      <div class="ws-detail-section">
        <h3>📍 위치 정보</h3>
        <div id="ws-detail-minimap" style="width:100%;height:250px;border-radius:8px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#999;">
          <span>🗺️ 지도 로딩 중...</span>
        </div>
        <p style="margin-top:6px;font-size:12px;color:#888;">${escHtml(listing.address || '')}</p>
      </div>` : ''}

      <div class="ws-detail-section ws-contacts-section" style="border:2px solid #2D5A27;border-radius:12px;padding:16px;background:#f8fdf6;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="margin:0;color:#2D5A27;display:flex;align-items:center;gap:6px;">📞 관계자 연락처 <span style="font-size:11px;color:#888;font-weight:normal;">(중개사 전용 - 고객 비공개)</span></h3>
          <button id="ws-contact-add-${listing.id}" style="padding:4px 12px;background:#2D5A27;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">+ 추가</button>
        </div>
        <div id="ws-contacts-list-${listing.id}" style="display:flex;flex-direction:column;gap:8px;">
          ${(function() {
            var contacts = window.WS.state.contacts[String(listing.id)] || [];
            if (contacts.length === 0) return '<div style="text-align:center;padding:16px;color:#999;font-size:13px;">등록된 연락처가 없습니다.<br><span style="font-size:11px;">위 [+ 추가] 버튼으로 사장, 사모, 관리인 등을 등록하세요</span></div>';
            return contacts.map(function(c, idx) {
              var roleColors = {
                '사장': '#D32F2F', '사모': '#C2185B', '관리인': '#1976D2',
                '가족': '#F57C00', '임차인': '#388E3C', '매도자': '#7B1FA2',
                '매수자': '#0097A7', '세입자': '#5D4037', '기타': '#616161'
              };
              var color = roleColors[c.role] || '#616161';
              return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-radius:8px;border:1px solid #e0e0e0;box-shadow:0 1px 2px rgba(0,0,0,0.05);">' +
                '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;color:#fff;background:' + color + ';white-space:nowrap;min-width:44px;text-align:center;">' + escHtml(c.role) + '</span>' +
                '<span style="font-size:13px;font-weight:600;color:#333;min-width:50px;">' + escHtml(c.name || '-') + '</span>' +
                '<a href="tel:' + escHtml(c.phone || '') + '" style="font-size:13px;color:#1976D2;text-decoration:none;font-weight:500;">' + escHtml(c.phone || '-') + '</a>' +
                (c.memo ? '<span style="font-size:11px;color:#888;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(c.memo) + '">💬 ' + escHtml(c.memo) + '</span>' : '') +
                '<button class="ws-contact-edit-btn" data-listing-id="' + listing.id + '" data-contact-idx="' + idx + '" style="padding:2px 6px;background:none;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:11px;color:#666;" title="수정">✏️</button>' +
                '<button class="ws-contact-del-btn" data-listing-id="' + listing.id + '" data-contact-idx="' + idx + '" style="padding:2px 6px;background:none;border:1px solid #ffcdd2;border-radius:4px;cursor:pointer;font-size:11px;color:#D32F2F;" title="삭제">🗑</button>' +
                '</div>';
            }).join('');
          })()}
        </div>
      </div>

      <div class="ws-detail-section">
        <h3>메모</h3>
        <textarea class="ws-memo-input" id="ws-memo-${listing.id}" placeholder="매물에 대한 메모를 입력하세요 (예: 고객 A님 관심, 실내상태 양호)" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:12px;resize:vertical;">${window.WS.state.memos[String(listing.id)] || ''}</textarea>
        <div id="ws-memo-quicktags-${listing.id}"></div>
        <button class="ws-btn ws-btn-primary ws-memo-save-btn" data-listing-id="${listing.id}" style="margin-top:6px;padding:4px 12px;">메모 저장</button>
      </div>
      <div id="ws-similar-section"></div>
    `;

    container.innerHTML = html;
    // Insert similar listings
    var similarHtml = window.WS.showSimilarListings ? window.WS.showSimilarListings(listing) : '';
    var similarSection = document.getElementById('ws-similar-section');
    if (similarSection && similarHtml) {
      similarSection.innerHTML = similarHtml;
    }

    modal.style.display = 'flex';

    // ─── 사진 전체 로딩 (Lazy-fetch) + WISHES 워터마크 오버레이 ───
    // 목록 API(minimal)는 썸네일 1장만 내려주므로 상세 열릴 때 /api/listings/[id] 로 전체 이미지 재요청
    (function lazyLoadFullImages(l) {
      if (l._imagesFullLoaded) return; // 이미 전체 이미지 로드됨
      fetch('/api/listings/' + l.id, { cache: 'no-store' })
        .then(function(r) { return r.json(); })
        .then(function(j) {
          if (!j || !j.success || !j.data) return;
          var fullImgs = j.data.images || [];
          if (fullImgs.length === 0) return;
          // 원본 객체에 캐시 (다시 열 때 재요청 방지)
          l.listing_images = fullImgs;
          l.images = fullImgs;
          l._imagesFullLoaded = true;

          // 현재 모달이 여전히 이 매물을 보여주고 있을 때만 갤러리 갱신
          var galleryEl = document.getElementById('ws-gallery-main');
          if (!galleryEl) return;
          var thumbs = document.querySelector('.ws-detail-gallery .ws-gallery-thumbs');
          if (!thumbs) return;

          // 직접 업로드 매물(source_site 없음)이면 WISHES 워터마크 오버레이
          var isCrawled = l.source_site === 'gongsilclub' || l.source_site === 'onhouse';
          // 온하우스와 동일하게 중앙 위치 + 연한 투명도
          var wmOverlayHtml = isCrawled ? '' :
            '<div class="ws-wm-overlay" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36%;height:auto;pointer-events:none;opacity:0.28;' +
            'background-image:url(\'/wishes_logo_transparent.png\');background-repeat:no-repeat;background-size:contain;background-position:center center;' +
            'aspect-ratio:3/1;"></div>';

          // 메인 이미지 교체
          var urls = fullImgs.map(function(img) { return img.url || img; });
          galleryEl.style.backgroundImage = "url('" + urls[0] + "')";
          galleryEl.setAttribute('data-images', JSON.stringify(urls).replace(/"/g, '&quot;'));
          galleryEl.setAttribute('data-current', '0');

          // 워터마크 오버레이 삽입 (중복 방지)
          if (wmOverlayHtml && !galleryEl.querySelector('.ws-wm-overlay')) {
            galleryEl.insertAdjacentHTML('beforeend', wmOverlayHtml);
          }

          // 썸네일 재렌더
          thumbs.innerHTML = fullImgs.map(function(img, idx) {
            var u = img.url || img;
            return '<img src="' + u + '" alt="thumbnail" class="ws-thumb' + (idx === 0 ? ' ws-thumb-active' : '') + '" data-url="' + u + '" data-idx="' + idx + '">';
          }).join('');

          // 갤러리 우측 상단에 사진 개수 뱃지 추가 (중복 방지)
          if (!galleryEl.querySelector('.ws-img-count')) {
            galleryEl.insertAdjacentHTML('beforeend',
              '<div class="ws-img-count" style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.65);color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;pointer-events:none;">' +
              '📷 ' + fullImgs.length + '장</div>');
          }
        })
        .catch(function(e) { /* silent fail - 기본 썸네일 유지 */ });
    })(listing);

    // ─── 이벤트 위임: container 단일 리스너로 자식 이벤트 통합 처리 ───
    // (매번 showDetail 호출 시 innerHTML 교체로 기존 자식 리스너는 자동 GC되지만,
    //  위임 패턴으로 리스너 수를 12→1로 줄여 메모리·성능 최적화)
    if (!container._detailDelegated) {
      container._detailDelegated = true;
      container.addEventListener('click', function(e) {
        var target = e.target;

        // 1) 유사매물 클릭
        var similarEl = target.closest('[data-similar-id]');
        if (similarEl) {
          var id = similarEl.getAttribute('data-similar-id');
          var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
          if (found) window.WS.showDetail(found);
          return;
        }

        // 2) AI SEO 설명 생성 버튼
        var aiEl = target.closest('[id^="ws-ai-generate-"]');
        if (aiEl) {
          var aiId = aiEl.id.replace('ws-ai-generate-', '');
          var aiListing = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(aiId); });
          if (aiListing) window.WS._runAutoGenerate(aiListing.id, aiListing);
          return;
        }

        // 3) 갤러리 썸네일 클릭
        var thumbEl = target.closest('.ws-thumb');
        if (thumbEl) {
          var url = thumbEl.dataset.url;
          var idx = parseInt(thumbEl.dataset.idx || '0', 10);
          var mainGallery = document.getElementById('ws-gallery-main');
          if (mainGallery && url) {
            mainGallery.style.backgroundImage = "url('" + url + "')";
            mainGallery.setAttribute('data-current', String(idx));
          }
          container.querySelectorAll('.ws-thumb').forEach(function(t) { t.classList.remove('ws-thumb-active'); });
          thumbEl.classList.add('ws-thumb-active');
          return;
        }

        // 4) 매물번호 복사
        var copyEl = target.closest('.ws-copy-id');
        if (copyEl) {
          e.preventDefault();
          var text = copyEl.dataset.copy || copyEl.textContent.trim();
          navigator.clipboard.writeText(text).then(function() {
            window.WS.showToast(text + ' 복사됨', 'success');
          });
          return;
        }

        // 5) 갤러리 메인 이미지 클릭 → 라이트박스
        var galleryEl = target.closest('#ws-gallery-main');
        if (galleryEl) {
          var imagesStr = galleryEl.getAttribute('data-images');
          var currentIdx = parseInt(galleryEl.getAttribute('data-current') || '0', 10);
          try {
            var images = JSON.parse(imagesStr || '[]');
            if (images.length > 0) {
              window.WS.openLightbox(images, currentIdx);
            }
          } catch(ex) {}
          return;
        }

        // 6) 메모 저장 버튼
        var memoBtn = target.closest('.ws-memo-save-btn');
        if (memoBtn) {
          var lid = memoBtn.dataset.listingId;
          var textarea = document.getElementById('ws-memo-' + lid);
          if (textarea) {
            window.WS.state.memos[String(lid)] = textarea.value;
            _safeSetItem('ws-memos', JSON.stringify(window.WS.state.memos));
            showToast('메모가 저장되었습니다.');
          }
          return;
        }
      });
    }

    // Inject quick memo tags
    var memoTextarea = document.getElementById('ws-memo-' + listing.id);
    if (memoTextarea && window.WS.showQuickMemoTags) {
      window.WS.showQuickMemoTags(listing.id, memoTextarea);
    }

    // ========== 연락처(호명) 관리 이벤트 핸들러 ==========
    (function() {
      var lid = String(listing.id);
      var ROLE_PRESETS = ['사장','사모','관리인','가족','임차인','매도자','매수자','세입자','기타'];

      // 연락처 추가/수정 팝업
      function showContactForm(existingContact, editIdx) {
        var isEdit = existingContact != null;
        var c = existingContact || { role: '', name: '', phone: '', memo: '' };
        var backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        backdrop.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:360px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
          '<h4 style="margin:0 0 16px;font-size:16px;color:#2D5A27;">' + (isEdit ? '✏️ 연락처 수정' : '📞 연락처 추가') + '</h4>' +
          '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">호명 (역할)</label>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;" id="ws-role-presets"></div>' +
          '<input type="text" id="ws-cf-role" value="' + escHtml(c.role) + '" placeholder="직접 입력 또는 위에서 선택" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
          '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">이름</label>' +
          '<input type="text" id="ws-cf-name" value="' + escHtml(c.name) + '" placeholder="예: 홍길동" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
          '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">전화번호</label>' +
          '<input type="tel" id="ws-cf-phone" value="' + escHtml(c.phone) + '" placeholder="010-1234-5678" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
          '<div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">메모 (선택)</label>' +
          '<input type="text" id="ws-cf-memo" value="' + escHtml(c.memo) + '" placeholder="예: 오후 2시 이후 통화가능, 주말 불가" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="ws-cf-cancel" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#666;">취소</button>' +
          '<button id="ws-cf-save" style="flex:1;padding:10px;border:none;border-radius:8px;background:#2D5A27;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">' + (isEdit ? '수정' : '추가') + '</button>' +
          '</div></div>';
        document.body.appendChild(backdrop);

        // 역할 프리셋 버튼
        var presetsDiv = backdrop.querySelector('#ws-role-presets');
        var roleInput = backdrop.querySelector('#ws-cf-role');
        ROLE_PRESETS.forEach(function(role) {
          var btn = document.createElement('button');
          btn.textContent = role;
          btn.style.cssText = 'padding:3px 10px;border:1px solid #ccc;border-radius:12px;background:' + (c.role === role ? '#2D5A27' : '#f5f5f5') + ';color:' + (c.role === role ? '#fff' : '#333') + ';font-size:11px;cursor:pointer;font-weight:500;';
          btn.addEventListener('click', function() {
            roleInput.value = role;
            presetsDiv.querySelectorAll('button').forEach(function(b) { b.style.background = '#f5f5f5'; b.style.color = '#333'; });
            btn.style.background = '#2D5A27'; btn.style.color = '#fff';
          });
          presetsDiv.appendChild(btn);
        });

        // 취소
        backdrop.querySelector('#ws-cf-cancel').addEventListener('click', function() { backdrop.remove(); });
        backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });

        // 저장
        backdrop.querySelector('#ws-cf-save').addEventListener('click', function() {
          var role = roleInput.value.trim();
          var name = backdrop.querySelector('#ws-cf-name').value.trim();
          var phone = backdrop.querySelector('#ws-cf-phone').value.trim();
          var memo = backdrop.querySelector('#ws-cf-memo').value.trim();
          if (!role) { roleInput.style.borderColor = '#D32F2F'; roleInput.focus(); return; }
          if (!phone) { backdrop.querySelector('#ws-cf-phone').style.borderColor = '#D32F2F'; backdrop.querySelector('#ws-cf-phone').focus(); return; }

          if (!window.WS.state.contacts[lid]) window.WS.state.contacts[lid] = [];
          var entry = { role: role, name: name, phone: phone, memo: memo };
          if (isEdit && editIdx != null) {
            window.WS.state.contacts[lid][editIdx] = entry;
          } else {
            window.WS.state.contacts[lid].push(entry);
          }
          _safeSetItem('ws-contacts', JSON.stringify(window.WS.state.contacts));
          backdrop.remove();
          showToast(isEdit ? '연락처가 수정되었습니다.' : '연락처가 추가되었습니다.');
          // 상세 모달 새로고침
          window.WS.showDetail(listing);
        });
      }

      // 추가 버튼
      var addBtn = document.getElementById('ws-contact-add-' + lid);
      if (addBtn) addBtn.addEventListener('click', function() { showContactForm(null, null); });

      // 수정 버튼들
      container.querySelectorAll('.ws-contact-edit-btn').forEach(function(btn) {
        if (btn.dataset.listingId !== lid) return;
        btn.addEventListener('click', function() {
          var idx = parseInt(btn.dataset.contactIdx, 10);
          var contacts = window.WS.state.contacts[lid] || [];
          if (contacts[idx]) showContactForm(contacts[idx], idx);
        });
      });

      // 삭제 버튼들
      container.querySelectorAll('.ws-contact-del-btn').forEach(function(btn) {
        if (btn.dataset.listingId !== lid) return;
        btn.addEventListener('click', function() {
          var idx = parseInt(btn.dataset.contactIdx, 10);
          if (confirm('이 연락처를 삭제하시겠습니까?')) {
            var contacts = window.WS.state.contacts[lid] || [];
            contacts.splice(idx, 1);
            window.WS.state.contacts[lid] = contacts;
            _safeSetItem('ws-contacts', JSON.stringify(window.WS.state.contacts));
            showToast('연락처가 삭제되었습니다.');
            window.WS.showDetail(listing);
          }
        });
      });
    })();
    // ========== 연락처 관리 끝 ==========

    // Mini map for detail view - 카카오맵 실제 렌더링 (MAIN world로 전달)
    if (listing.lat && listing.lng) {
      // map-main.js가 아직 로드되지 않았으면 로드
      if (!window.WS._mapScriptLoaded && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        window.WS._mapScriptLoaded = true;
        var mapScript = document.createElement('script');
        mapScript.id = 'ws-kakao-map-script';
        mapScript.src = chrome.runtime.getURL('map-main.js');
        document.body.appendChild(mapScript);
        // SDK 로드 후 미니맵 렌더링
        setTimeout(function() {
          window.postMessage({ type: 'ws-minimap-render', lat: listing.lat, lng: listing.lng, address: listing.address || '' }, '*');
        }, 1500);
      } else {
        setTimeout(function() {
          window.postMessage({ type: 'ws-minimap-render', lat: listing.lat, lng: listing.lng, address: listing.address || '' }, '*');
        }, 100);
      }
    }

  };

  /**
   * Toggle favorite
   */
  window.WS.toggleFavorite = function(id) {
    var strId = String(id);
    const idx = window.WS.state.favorites.findIndex(f => String(f) === strId);
    if (idx >= 0) {
      window.WS.state.favorites.splice(idx, 1);
    } else {
      window.WS.state.favorites.push(strId);
    }
    _safeSetItem('ws-favorites', JSON.stringify(window.WS.state.favorites));
    window.WS.updateFavCount();
  };

  /**
   * Update favorite count display
   */
  window.WS.updateFavCount = function() {
    const badge = document.getElementById('ws-fav-count');
    if (badge) {
      badge.textContent = window.WS.state.favorites.length;
    }
  };

  /**
   * Show favorites modal
   */
  window.WS._favCategoryFilter = '전체';

  window.WS.showFavorites = function() {
    const modal = document.getElementById('ws-modal-favorites');
    const list = document.getElementById('ws-favorites-list');
    if (!modal || !list) return;

    const favIds = window.WS.state.favorites;
    const favListings = (window.WS.allListings || []).filter(l => favIds.some(f => String(f) === String(l.id)));
    const catStyles = window.WS._categoryStyles || {};
    var activeFilter = window.WS._favCategoryFilter || '전체';

    // Count by category
    var catCounts = { '전체': favListings.length };
    favListings.forEach(function(l) {
      var cat = window.WS.getFavCategory ? window.WS.getFavCategory(l.id) : '';
      if (cat) { catCounts[cat] = (catCounts[cat] || 0) + 1; }
    });
    var uncategorized = favListings.filter(function(l) { return !window.WS.getFavCategory(l.id); }).length;
    if (uncategorized > 0) catCounts['미분류'] = uncategorized;

    // Filter listings
    var filteredFavs = favListings;
    if (activeFilter !== '전체') {
      filteredFavs = favListings.filter(function(l) {
        var cat = window.WS.getFavCategory(l.id) || '';
        if (activeFilter === '미분류') return !cat;
        return cat === activeFilter;
      });
    }

    let html = '';

    // Category filter tabs
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #eee;">';
    var tabCats = ['전체'].concat(Object.keys(catStyles));
    if (catCounts['미분류']) tabCats.push('미분류');
    tabCats.forEach(function(cat) {
      var count = catCounts[cat] || 0;
      if (cat !== '전체' && cat !== '미분류' && !count) return;
      var isActive = activeFilter === cat;
      var style = catStyles[cat];
      var bgColor = isActive ? (style ? style.bg : '#2D5A27') : '#f5f5f5';
      var txtColor = isActive ? (style ? style.color : '#fff') : '#888';
      var icon = style ? style.icon + ' ' : (cat === '전체' ? '📋 ' : '📂 ');
      html += '<button data-fav-filter="' + escHtml(cat) + '" style="padding:5px 12px;border:none;border-radius:16px;font-size:11px;cursor:pointer;background:' + bgColor + ';color:' + txtColor + ';font-weight:' + (isActive ? '700' : '400') + ';white-space:nowrap;">' + icon + escHtml(cat) + ' (' + count + ')</button>';
    });
    html += '</div>';

    // Backup/Restore buttons
    html += '<div style="display:flex;gap:6px;margin-bottom:12px;">';
    html += '<button id="ws-fav-export" style="padding:4px 10px;border:1px solid #ddd;border-radius:6px;font-size:10px;background:#fff;cursor:pointer;color:#666;">📤 즐겨찾기 내보내기</button>';
    html += '</div>';

    if (filteredFavs.length === 0) {
      html += '<p style="text-align:center;color:#aaa;padding:30px 0;">해당 카테고리의 관심매물이 없습니다.</p>';
    } else {
      filteredFavs.forEach(function(listing) {
        var cat = window.WS.getFavCategory ? window.WS.getFavCategory(listing.id) : '';
        var catStyle = cat && catStyles[cat] ? catStyles[cat] : null;

        html += '<div class="ws-favorite-item" style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:8px;background:#fafafa;border-radius:10px;border:1px solid #eee;cursor:pointer;" data-fav-detail="' + listing.id + '">';

        // Thumbnail (listing_images fallback)
        var thumb = '';
        var thumbImgs = listing.images || listing.listing_images || [];
        if (thumbImgs.length > 0) {
          var imgUrl = thumbImgs[0].url || thumbImgs[0];
          thumb = '<img src="' + escHtml(imgUrl) + '" style="width:50px;height:50px;object-fit:cover;border-radius:6px;flex-shrink:0;" onerror="this.style.display=\'none\'">';
        } else {
          thumb = '<div style="width:50px;height:50px;background:#eee;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;color:#ccc;">🏠</div>';
        }
        html += thumb;

        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-weight:600;font-size:13px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(listing.title || '매물') + '</div>';
        html += '<div style="font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(listing.address || '') + ' · ' + escHtml(listing.type || '') + '</div>';
        html += '<div style="font-size:12px;font-weight:600;color:#e53e3e;">' + escHtml(formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal)) + '</div>';
        html += '</div>';

        // Category badge + picker button
        html += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">';
        if (catStyle) {
          html += '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:' + catStyle.bg + ';color:' + catStyle.color + ';font-weight:600;white-space:nowrap;">' + catStyle.icon + ' ' + escHtml(cat) + '</span>';
        }
        html += '<button data-cat-pick="' + listing.id + '" style="font-size:10px;padding:2px 8px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;color:#888;white-space:nowrap;" title="카테고리 설정">🏷️</button>';
        html += '</div>';

        html += '<button class="ws-remove-fav" data-id="' + listing.id + '" style="flex-shrink:0;width:28px;height:28px;border:none;background:#fee;border-radius:50%;font-size:12px;cursor:pointer;color:#e53e3e;" title="제거">✕</button>';
        html += '</div>';
      });
    }

    list.innerHTML = html;
    modal.style.display = 'flex';

    // Event delegation for all buttons
    if (!list._favDelegated) {
      list._favDelegated = true;
      list.addEventListener('click', function(e) {
        // Remove favorite
        var removeBtn = e.target.closest('.ws-remove-fav');
        if (removeBtn) {
          e.stopPropagation();
          var id = removeBtn.getAttribute('data-id');
          window.WS.toggleFavorite(id);
          window.WS.showFavorites();
          return;
        }
        // Category picker
        var catBtn = e.target.closest('[data-cat-pick]');
        if (catBtn) {
          e.stopPropagation();
          var listingId = catBtn.getAttribute('data-cat-pick');
          window.WS.showCategoryPicker(listingId, catBtn);
          return;
        }
        // Filter tab
        var filterBtn = e.target.closest('[data-fav-filter]');
        if (filterBtn) {
          window.WS._favCategoryFilter = filterBtn.getAttribute('data-fav-filter');
          window.WS.showFavorites();
          return;
        }
        // Detail view
        var detailItem = e.target.closest('[data-fav-detail]');
        if (detailItem) {
          var detailId = detailItem.getAttribute('data-fav-detail');
          var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(detailId); });
          if (found) {
            modal.style.display = 'none';
            window.WS.showDetail(found);
          }
          return;
        }
        // Export
        if (e.target.id === 'ws-fav-export' || e.target.closest('#ws-fav-export')) {
          window.WS._exportFavorites();
          return;
        }
      });
    }
  };

  // Export favorites as text
  window.WS._exportFavorites = function() {
    var favIds = window.WS.state.favorites || [];
    var favListings = (window.WS.allListings || []).filter(function(l) { return favIds.some(function(f) { return String(f) === String(l.id); }); });
    if (favListings.length === 0) { window.WS.showToast('내보낼 즐겨찾기가 없습니다', 'warning'); return; }

    var lines = ['📋 WISHES 즐겨찾기 목록 (' + new Date().toLocaleDateString('ko-KR') + ')', ''];
    favListings.forEach(function(l, i) {
      var cat = window.WS.getFavCategory(l.id);
      var catStr = cat ? ' [' + cat + ']' : '';
      lines.push((i + 1) + '. ' + (l.title || '매물') + catStr);
      lines.push('   📍 ' + (l.address || '-'));
      lines.push('   💰 ' + formatPrice(l.deposit, l.monthly, l.price, l.deal));
      lines.push('   🏠 ' + (l.type || '-') + ' / ' + (l.deal || '-'));
      lines.push('');
    });

    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        window.WS.showToast('즐겨찾기 목록이 클립보드에 복사되었습니다', 'success');
      }).catch(function() {
        window.WS._fallbackCopy(text);
      });
    } else {
      window.WS._fallbackCopy(text);
    }
  };

  /**
   * Print selected listings
   */
  window.WS.printSelected = function() {
    const selectedIds = Array.from(window.WS.state.selectedIds);
    if (selectedIds.length === 0) {
      showToast('선택된 매물이 없습니다.', 'warning');
      return;
    }

    const selected = (window.WS.allListings || []).filter(l => selectedIds.some(sid => String(sid) === String(l.id)));
    const includeNotes = document.getElementById('ws-include-notes').checked;
    const printDate = new Date().toLocaleString('ko-KR');

    const printWindow = window.open('', '_blank');
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>WISHES 매물 브리핑 자료</title>
        <style>
          @page {
            size: A4;
            margin: 15mm 12mm 20mm 12mm;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif;
            font-size: 11px;
            color: #333;
            line-height: 1.5;
            position: relative;
          }
          /* WISHES Watermark */
          body::before {
            content: 'WISHES';
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-35deg);
            font-size: 120px;
            font-weight: 900;
            color: rgba(45, 90, 39, 0.04);
            z-index: -1;
            pointer-events: none;
            letter-spacing: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 3px solid #2D5A27;
          }
          .logo {
            font-size: 28px;
            font-weight: 900;
            color: #2D5A27;
            letter-spacing: 4px;
          }
          .subtitle {
            color: #666;
            font-size: 11px;
            margin-top: 4px;
          }
          .meta-info {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            font-size: 10px;
            color: #999;
          }
          /* Listing Card */
          .listing {
            page-break-inside: avoid;
            border: 1px solid #ddd;
            border-left: 4px solid #2D5A27;
            border-radius: 4px;
            padding: 14px 16px;
            margin-bottom: 14px;
            background: #fff;
          }
          .listing-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
          }
          .listing-num {
            display: inline-block;
            background: #2D5A27;
            color: #fff;
            font-size: 10px;
            font-weight: 700;
            padding: 1px 8px;
            border-radius: 10px;
            margin-right: 8px;
          }
          .listing-title {
            font-size: 15px;
            font-weight: 700;
            color: #1a1a1a;
          }
          .price-box {
            text-align: right;
          }
          .deal-type {
            font-size: 10px;
            color: #fff;
            background: #e53e3e;
            padding: 1px 6px;
            border-radius: 3px;
            display: inline-block;
            margin-bottom: 3px;
          }
          .price-main {
            font-size: 16px;
            font-weight: 800;
            color: #e53e3e;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 6px 12px;
            font-size: 11px;
            margin-bottom: 8px;
            padding: 8px 10px;
            background: #f8f9fa;
            border-radius: 4px;
          }
          .info-grid strong {
            color: #555;
          }
          .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 6px;
          }
          .tag {
            display: inline-block;
            padding: 2px 8px;
            background: #e8f5e9;
            color: #2D5A27;
            font-size: 10px;
            font-weight: 600;
            border-radius: 3px;
          }
          .tag-red {
            background: #ffebee;
            color: #c62828;
          }
          .desc {
            margin-top: 6px;
            font-size: 11px;
            color: #666;
            border-top: 1px dashed #eee;
            padding-top: 6px;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            padding-top: 10px;
            border-top: 2px solid #2D5A27;
            font-size: 10px;
            color: #999;
            page-break-inside: avoid;
          }
          .footer strong {
            color: #2D5A27;
          }
          .qr-section {
            text-align: center;
            margin-top: 8px;
          }
          .qr-section img {
            width: 80px;
            height: 80px;
          }
          .qr-label {
            font-size: 9px;
            color: #999;
            margin-top: 2px;
          }
          .header-flex {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .header-center {
            flex: 1;
            text-align: center;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .listing { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-flex">
            <div class="qr-section">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://wishes.co.kr" alt="QR">
              <div class="qr-label">wishes.co.kr</div>
            </div>
            <div class="header-center">
              <div class="logo">WISHES</div>
              <div class="subtitle">서울 · 경기 종합부동산 서비스 | 매물 브리핑 자료</div>
              <div class="meta-info">
                <span>총 ${selected.length}건 선택</span>
                <span>작성일시: ${printDate}</span>
              </div>
            </div>
            <div style="width:80px;"></div>
          </div>
        </div>
    `;

    selected.forEach((listing, idx) => {
      var areaText = formatArea(listing.area_m2) || '-';
      var priceText = formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal);
      var builtText = getBuiltYear(listing.built_year) ? getBuiltYear(listing.built_year) + '년' : '-';

      html += `
        <div class="listing">
          <div class="listing-header">
            <div>
              <span class="listing-num">${idx + 1}</span>
              <span class="listing-title">${escHtml(listing.title || '-')}</span>
            </div>
            <div class="price-box">
              <span class="deal-type">${escHtml(listing.deal || '-')}</span><br>
              <span class="price-main">${escHtml(priceText)}</span>
              ${listing.maintenance_fee ? `<div style="font-size:10px;color:#888;margin-top:2px;">관리비 ${escHtml(String(listing.maintenance_fee))}만</div>` : ''}
            </div>
          </div>
          <div style="font-size:11px;color:#888;margin-bottom:8px;">📍 ${escHtml(listing.address || '-')} ${escHtml(listing.dong || '')}</div>
          <div class="info-grid">
            <div><strong>유형</strong> ${escHtml(listing.type || '-')}</div>
            <div><strong>면적</strong> ${escHtml(areaText)}</div>
            <div><strong>층수</strong> ${escHtml(String(listing.floor_current || '-'))}/${escHtml(String(listing.floor_total || '-'))}층</div>
            <div><strong>방/욕실</strong> ${escHtml(String(listing.rooms || '-'))}개/${escHtml(String(listing.bathrooms || '-'))}개</div>
            <div><strong>방향</strong> ${escHtml(listing.direction || '-')}</div>
            <div><strong>준공</strong> ${escHtml(builtText)}</div>
          </div>
          <div class="tags">
            ${listing.parking ? '<span class="tag">🅿️ 주차가능</span>' : (listing.building_info && listing.building_info.총주차대수 !== undefined ? (parseInt(listing.building_info.총주차대수) > 0 ? '<span class="tag">🅿️ 주차 ' + parseInt(listing.building_info.총주차대수) + '대</span>' : '<span class="tag tag-red">주차불가</span>') : '')}
            ${listing.elevator ? '<span class="tag">🛗 엘리베이터</span>' : (listing.building_info && listing.building_info.승용엘리베이터 !== undefined && parseInt(listing.building_info.승용엘리베이터) > 0 ? '<span class="tag">🛗 EV ' + parseInt(listing.building_info.승용엘리베이터) + '대</span>' : '')}
            ${listing.pet ? '<span class="tag">🐾 반려동물</span>' : ''}
            ${listing.balcony ? '<span class="tag">🏠 발코니</span>' : ''}
            ${listing.full_option ? '<span class="tag">✨ 풀옵션</span>' : ''}
            ${listing.loan_available ? '<span class="tag">🏦 대출가능</span>' : ''}
            ${listing.status === '가용' ? '<span class="tag" style="background:#c8e6c9;font-weight:700;">공실</span>' : ''}
          </div>
          ${includeNotes && listing.description ? `<div class="desc">📝 ${escHtml(listing.description)}</div>` : ''}
          ${window.WS.state.memos[String(listing.id)] ? `<div class="desc" style="color:#E65100;">💬 중개사 메모: ${escHtml(window.WS.state.memos[String(listing.id)])}</div>` : ''}
        </div>
      `;
    });

    html += `
        <div class="footer">
          <strong>WISHES</strong> | 서울 · 경기 종합부동산 서비스<br>
          wishes.co.kr | 본 자료는 참고용이며 실제 계약 시 현장 확인이 필요합니다.
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  /**
   * Export selected listings to Excel CSV
   */
  window.WS.exportExcel = function() {
    const selectedIds = Array.from(window.WS.state.selectedIds);
    if (selectedIds.length === 0) {
      showToast('선택된 매물이 없습니다.', 'warning');
      return;
    }

    const selected = (window.WS.allListings || []).filter(l => selectedIds.some(sid => String(sid) === String(l.id)));

    // BOM for Korean encoding in Excel
    let csv = '\uFEFF';
    csv += '번호,제목,유형,거래유형,보증금(만원),월세(만원),매매가(만원),관리비(만원),면적(m²),평수,층,총층,방,욕실,방향,주차,엘리베이터,풀옵션,상태,주소,등록일\n';

    selected.forEach((l, i) => {
      const pyeong = l.area_m2 ? (l.area_m2 / 3.30579).toFixed(1) : '';
      const row = [
        i + 1,
        `"${(l.title || '').replace(/"/g, '""')}"`,
        l.type || '',
        l.deal || '',
        l.deposit || '',
        l.monthly || '',
        l.price || '',
        l.maintenance_fee || '',
        l.area_m2 || '',
        pyeong,
        l.floor_current || '',
        l.floor_total || '',
        l.rooms || '',
        l.bathrooms || '',
        l.direction || '',
        getParkingCount(l),
        l.elevator ? 'Y' : 'N',
        l.full_option ? 'Y' : 'N',
        l.status || '',
        `"${(l.address || '').replace(/"/g, '""')}"`,
        l.created_at ? new Date(l.created_at).toLocaleDateString('ko-KR') : ''
      ];
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WISHES_매물_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Setup event listeners for main UI
   */
  function setupEventListeners() {
    // 안전한 이벤트 바인딩 헬퍼
    function _bindById(id, evt, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener(evt, fn);
    }

    // 드롭업 메뉴 클릭 토글 (hover가 안 되는 환경 대응)
    document.querySelectorAll('.ws-dropdown-trigger').forEach(function(trigger) {
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        var parent = this.closest('.ws-bar-dropdown');
        var isOpen = parent.classList.contains('ws-dropdown-open');
        // 다른 열린 드롭다운 닫기
        document.querySelectorAll('.ws-bar-dropdown.ws-dropdown-open').forEach(function(d) {
          d.classList.remove('ws-dropdown-open');
        });
        if (!isOpen) parent.classList.add('ws-dropdown-open');
      });
    });
    // 드롭다운 항목 클릭 시 메뉴 닫기
    document.querySelectorAll('.ws-dropdown-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var parent = this.closest('.ws-bar-dropdown');
        if (parent) parent.classList.remove('ws-dropdown-open');
      });
    });
    // 바깥 클릭 시 드롭다운 닫기
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.ws-bar-dropdown')) {
        document.querySelectorAll('.ws-bar-dropdown.ws-dropdown-open').forEach(function(d) {
          d.classList.remove('ws-dropdown-open');
        });
      }
    });

    // Filter toggle
    _bindById('ws-filters-toggle', 'click', function() {
      const section = document.getElementById('ws-filters-section');
      const isHidden = section.style.display === 'none';
      section.style.display = isHidden ? '' : 'none';
      this.querySelector('span').textContent = isHidden ? '▼ 필터 접기/펼치기' : '▶ 필터 펼치기';
    });

    // View mode tabs
    document.querySelectorAll('.ws-view-tabs .ws-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        const view = this.dataset.view;
        document.querySelectorAll('.ws-view-tabs .ws-tab').forEach(t => t.classList.remove('ws-tab-active'));
        this.classList.add('ws-tab-active');

        if (view === 'map') {
          document.getElementById('ws-map-container').style.display = 'block';
          if (window.WS && window.WS.initMap) {
            window.WS.initMap();
          }
        } else {
          document.getElementById('ws-map-container').style.display = 'none';
        }
      });
    });

    // Header buttons
    _bindById('ws-btn-search', 'click', function() {
      window.WS.state.page = 1;
      window.WS.refresh();
    });

    _bindById('ws-btn-reset-all', 'click', function() {
      Object.assign(window.WS.state, {
        activeRegion: '전국',
        selectedRegions: [],
        selectedDongs: [],
        addrType: 'all',
        typeTab: '전체',
        typeTabs: [],
        deal: '전체',
        deals: [],
        floor: '전체',
        roomCount: '전체',
        roomCounts: [],
        roomShape: '전체',
        builtYear: '전체',
        direction: '전체',
        parking: '전체',
        livingSize: '전체',
        keyword: '',
        sortBy: 'latest',
        sort2: 'none',
        page: 1,
        minBasePrice: '', maxBasePrice: '',
        minDeposit: '', maxDeposit: '',
        minMonthly: '', maxMonthly: '',
        minSalePrice: '', maxSalePrice: '',
        minArea: '', maxArea: '',
        minSupply: '', maxSupply: '',
        includeMgmt: false,
        hideImages: false,
        checks: {
          buildingPhoto: false, interiorPhoto: false, video: false,
          shortTerm: false, parkingAvailable: false, emptyNow: false,
          balcony: false, noFullOption: false, fullOptionOnly: false,
          elevator: false, priceNego: false, loanAvailable: false
        }
      });
      window.WS.state.selectedIds = new Set();
      // Reset address search state and inputs
      window.WS.state.jibunStart = '';
      window.WS.state.jibunEnd = '';
      window.WS.state.buildingName = '';
      window.WS.state.buildingId = '';
      var globalSearch = document.querySelector('.ws-global-search');
      if (globalSearch) globalSearch.value = '';
      var jibunStartEl = document.getElementById('ws-jibun-start');
      var jibunEndEl = document.getElementById('ws-jibun-end');
      var buildingNameEl = document.getElementById('ws-building-name');
      var buildingIdEl = document.getElementById('ws-building-id');
      if (jibunStartEl) jibunStartEl.value = '';
      if (jibunEndEl) jibunEndEl.value = '';
      if (buildingNameEl) buildingNameEl.value = '';
      if (buildingIdEl) buildingIdEl.value = '';
      window.WS.renderAll();
    });

    _bindById('ws-btn-reset-filters', 'click', function() {
      Object.assign(window.WS.state, {
        deal: '전체',
        deals: [],
        floor: '전체',
        roomCount: '전체',
        roomCounts: [],
        roomShape: '전체',
        builtYear: '전체',
        direction: '전체',
        parking: '전체',
        livingSize: '전체',
        minBasePrice: '', maxBasePrice: '',
        minDeposit: '', maxDeposit: '',
        minMonthly: '', maxMonthly: '',
        minSalePrice: '', maxSalePrice: '',
        minArea: '', maxArea: '',
        minSupply: '', maxSupply: '',
        includeMgmt: false,
        keyword: '',
        checks: {
          buildingPhoto: false, interiorPhoto: false, video: false,
          shortTerm: false, parkingAvailable: false, emptyNow: false,
          balcony: false, noFullOption: false, fullOptionOnly: false,
          elevator: false, priceNego: false, loanAvailable: false
        }
      });
      var kwInput = document.getElementById('ws-keyword');
      if (kwInput) kwInput.value = '';
      // Also reset address search fields
      window.WS.state.jibunStart = '';
      window.WS.state.jibunEnd = '';
      window.WS.state.buildingName = '';
      window.WS.state.buildingId = '';
      var jibunStartEl = document.getElementById('ws-jibun-start');
      var jibunEndEl = document.getElementById('ws-jibun-end');
      var buildingNameEl = document.getElementById('ws-building-name');
      var buildingIdEl = document.getElementById('ws-building-id');
      if (jibunStartEl) jibunStartEl.value = '';
      if (jibunEndEl) jibunEndEl.value = '';
      if (buildingNameEl) buildingNameEl.value = '';
      if (buildingIdEl) buildingIdEl.value = '';
      window.WS.renderFilters();
      window.WS.refresh();
    });

    // Sort controls
    _bindById('ws-sort-primary', 'change', function() {
      window.WS.state.sortBy = this.value;
      window.WS.state.page = 1;
      window.WS.refresh();
    });

    _bindById('ws-sort-secondary', 'change', function() {
      window.WS.state.sort2 = this.value;
      window.WS.state.page = 1;
      window.WS.refresh();
    });

    _bindById('ws-per-page', 'change', function() {
      window.WS.state.perPage = parseInt(this.value, 10);
      window.WS.state.page = 1;
      window.WS.refresh();
    });

    _bindById('ws-hide-images', 'change', function() {
      window.WS.state.hideImages = this.checked;
      window.WS.renderListings();
    });

    // 소재지 그룹 전체 펼치기/닫기 토글
    _safeBtn('ws-group-toggle', function() {
      var bodies = document.querySelectorAll('.ws-group-body');
      if (!bodies.length) return;
      // 하나라도 닫혀있으면 전체 펼치기, 모두 열려있으면 전체 닫기
      var anyHidden = false;
      bodies.forEach(function(b) { if (b.style.display === 'none') anyHidden = true; });
      bodies.forEach(function(b) {
        b.style.display = anyHidden ? '' : 'none';
        var group = b.closest('.ws-address-group');
        var header = group ? group.querySelector('.ws-group-header') : null;
        var arrow = header ? header.querySelector('.ws-group-arrow') : null;
        if (arrow) arrow.textContent = anyHidden ? '▼' : '▶';
        var key = header ? header.dataset.groupKey : '';
        if (key) window.WS._groupExpanded[key] = anyHidden;
      });
      showToast(anyHidden ? '전체 그룹 펼침' : '전체 그룹 닫힘', 'success');
    });

    // Address search: 지번, 건물명, 건물ID
    var jibunStart = document.getElementById('ws-jibun-start');
    var jibunEnd = document.getElementById('ws-jibun-end');
    var buildingName = document.getElementById('ws-building-name');
    var buildingId = document.getElementById('ws-building-id');

    function addressSearch() {
      var s = window.WS.state;
      s.jibunStart = jibunStart ? jibunStart.value.trim() : '';
      s.jibunEnd = jibunEnd ? jibunEnd.value.trim() : '';
      s.buildingName = buildingName ? buildingName.value.trim() : '';
      s.buildingId = buildingId ? buildingId.value.trim() : '';
      s.page = 1;
      window.WS.refresh();
    }

    [jibunStart, jibunEnd, buildingName, buildingId].forEach(function(input) {
      if (input) {
        input.addEventListener('keypress', function(e) {
          if (e.key === 'Enter') addressSearch();
        });
        input.addEventListener('change', addressSearch);
      }
    });

    // Global search
    var globalSearch = document.querySelector('.ws-global-search');
    if (globalSearch) globalSearch.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        window.WS.state.keyword = this.value;
        window.WS.state.page = 1;
        var kwInput = document.getElementById('ws-keyword');
        if (kwInput) kwInput.value = this.value;
        window.WS.refresh();
      }
    });

    // Bottom bar buttons - null-safe helper
    function _safeBtn(id, handler) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    }

    _safeBtn('ws-btn-select-all', function() {
      const filtered = window.WS.filtered || [];
      filtered.forEach(l => {
        window.WS.state.selectedIds.add(String(l.id));
      });
      window.WS.renderListings();
      window.WS._updateSelectedCount();
    });

    _safeBtn('ws-btn-deselect-all', function() {
      window.WS.state.selectedIds = new Set();
      window.WS.renderListings();
      window.WS._updateSelectedCount();
    });

    _safeBtn('ws-btn-print', function() { window.WS.printSelected(); });
    _safeBtn('ws-btn-excel', function() { window.WS.exportExcel(); });
    _safeBtn('ws-btn-ai-briefing', function() { window.WS.generateBriefing(); });
    _safeBtn('ws-btn-compare', function() { window.WS.showCompare(); });

    _safeBtn('ws-btn-add-favorites', function() {
      const selectedIds = Array.from(window.WS.state.selectedIds);
      if (selectedIds.length === 0) {
        showToast('선택된 매물이 없습니다.', 'warning');
        return;
      }
      selectedIds.forEach(id => {
        if (!window.WS.state.favorites.some(f => String(f) === String(id))) {
          window.WS.state.favorites.push(String(id));
        }
      });
      _safeSetItem('ws-favorites', JSON.stringify(window.WS.state.favorites));
      window.WS.updateFavCount();
      showToast(`${selectedIds.length}개 매물이 관심매물에 추가되었습니다.`);
    });

    _safeBtn('ws-btn-view-favorites', function() { window.WS.showFavorites(); });
    _safeBtn('ws-btn-search-history', function() { window.WS.showSearchHistory(); });
    _safeBtn('ws-btn-stats', function() { window.WS.showStats(); });
    _safeBtn('ws-btn-share-text', function() { window.WS.generateShareText(); });
    _safeBtn('ws-btn-customer-folder', function() { window.WS.showCustomerFolders(); });
    _safeBtn('ws-btn-building-group', function() { window.WS.showBuildingGroups(); });
    _safeBtn('ws-btn-changelog', function() { window.WS.showChangelog(); });
    _safeBtn('ws-btn-alerts', function() { window.WS.showAlertSettings(); });
    _safeBtn('ws-btn-presets', function() { window.WS.showPresetManager(); });
    _safeBtn('ws-btn-memo-mgr', function() { window.WS.showMemoManager(); });
    _safeBtn('ws-btn-daily-briefing', function() { window.WS.showDailyBriefing(); });
    _safeBtn('ws-btn-darkmode', function() { window.WS.toggleDarkMode(); });
    _safeBtn('ws-btn-backup', function() { window.WS.showBackupRestore(); });
    _safeBtn('ws-btn-market-chart', function() { window.WS.showMarketAnalysis(); });
    _safeBtn('ws-btn-turnover', function() { window.WS.showTurnoverAnalysis(); });
    _safeBtn('ws-btn-pdf-briefing', function() { window.WS.showPDFBriefing(); });
    _safeBtn('ws-btn-price-changes', function() { window.WS.showPriceChanges(); });
    _safeBtn('ws-btn-fav-compare', function() { window.WS.showFavCompare(); });
    _safeBtn('ws-btn-auto-refresh', function() { window.WS.showAutoRefreshTimer(); });
    _safeBtn('ws-btn-heatmap', function() { window.WS.showHeatmap(); });
    _safeBtn('ws-btn-share-link', function() { window.WS.showShareLink(); });
    _safeBtn('ws-btn-quick-filter', function() { window.WS.showQuickFilters(); });
    _safeBtn('ws-btn-shortcuts', function() { window.WS.showKeyboardShortcuts(); });
    _safeBtn('ws-btn-custreport', function() { window.WS.showCustomerReport(); });
    _safeBtn('ws-btn-memosearch', function() { window.WS.showMemoSearch(); });
    _safeBtn('ws-btn-smart-recommend', function() { window.WS.showSmartRecommend(); });

    // Modal close buttons
    document.querySelectorAll('.ws-modal-close').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const modal = this.closest('.ws-modal');
        if (modal) {
          modal.style.display = 'none';
        }
      });
    });

    // Modal background close
    document.querySelectorAll('.ws-modal').forEach(modal => {
      modal.addEventListener('click', function(e) {
        if (e.target === this) {
          this.style.display = 'none';
        }
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      // Ctrl+Enter: search
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        window.WS.state.page = 1;
        window.WS.refresh();
      }
      // ESC: close any open modal
      if (e.key === 'Escape') {
        document.querySelectorAll('.ws-modal').forEach(function(modal) {
          if (modal.style.display !== 'none') {
            modal.style.display = 'none';
          }
        });
      }
    });
  }

  /**
   * Update selected count badge
   */
  window.WS._updateSelectedCount = function() {
    var el = document.getElementById('ws-selected-count');
    if (el) el.textContent = '선택: ' + window.WS.state.selectedIds.size + '건';
  };

  /**
   * Main refresh function
   */
  window.WS.refresh = function() {
    window.WS.filtered = applyFilters(window.WS.allListings || []);
    // Update active states on filter chips instead of full DOM rebuild
    window.WS.updateFilterActiveStates();
    window.WS.renderTypeTabs();
    window.WS.renderListings();
    window.WS.renderPagination();
    window.WS._updateSelectedCount();

    // If map view is active, re-render map with filtered data
    var mapContainer = document.getElementById('ws-map-container');
    if (mapContainer && mapContainer.style.display !== 'none') {
      window.WS.initMap();
    }

    // URL 파라미터에 필터 상태 저장
    if (window.WS.saveFilterToURL) {
      window.WS.saveFilterToURL();
    }
  };

  /**
   * Update active states on filter chips without rebuilding DOM
   */
  window.WS.updateFilterActiveStates = function() {
    const s = window.WS.state;
    // Update grid filter chips
    document.querySelectorAll('.ws-fchip').forEach(chip => {
      const filter = chip.dataset.filter;
      const value = chip.dataset.value;

      // 복수선택 필터 처리
      if (filter === 'deals') {
        if (value === '전체') {
          if (s.deals.length === 0) chip.classList.add('ws-fchip-active');
          else chip.classList.remove('ws-fchip-active');
        } else {
          if (s.deals.includes(value)) chip.classList.add('ws-fchip-active');
          else chip.classList.remove('ws-fchip-active');
        }
        return;
      }
      if (filter === 'roomCounts') {
        if (value === '전체') {
          if (s.roomCounts.length === 0) chip.classList.add('ws-fchip-active');
          else chip.classList.remove('ws-fchip-active');
        } else {
          if (s.roomCounts.includes(value)) chip.classList.add('ws-fchip-active');
          else chip.classList.remove('ws-fchip-active');
        }
        return;
      }

      // 단일선택 필터
      if (s[filter] === value) {
        chip.classList.add('ws-fchip-active');
      } else {
        chip.classList.remove('ws-fchip-active');
      }
    });
    // Update direction chips
    document.querySelectorAll('.ws-chip').forEach(chip => {
      const filter = chip.dataset.filter;
      const value = chip.dataset.value;
      if (s[filter] === value) {
        chip.classList.add('ws-chip-active');
      } else {
        chip.classList.remove('ws-chip-active');
      }
    });
    // Update checkboxes
    document.querySelectorAll('.ws-filter-checkbox').forEach(cb => {
      cb.checked = s.checks[cb.dataset.check] || false;
    });
  };

  // ===== Admin API 공통 설정 (v2.2.0) =====
  var ADMIN_API_URL = 'https://wishes.co.kr/api/admin/listings';
  var ADMIN_API_MINIMAL = ADMIN_API_URL + '?fields=minimal';
  var ADMIN_TOKEN = 'wishes2026';

  function normalizeImages(items) {
    items.forEach(function(item) {
      if ((!item.images || item.images.length === 0) && item.listing_images && item.listing_images.length > 0) {
        item.images = item.listing_images;
      }
    });
    return items;
  }

  // ===== IndexedDB 캐시 (v2.2.1 추가) - 재로드 즉시 표시 =====
  var WS_CACHE_DB = 'wishes_cache';
  var WS_CACHE_STORE = 'listings';
  var WS_CACHE_KEY = 'all_listings_v1';

  function wsOpenDB() {
    return new Promise(function(resolve, reject) {
      try {
        var req = indexedDB.open(WS_CACHE_DB, 1);
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(WS_CACHE_STORE)) {
            db.createObjectStore(WS_CACHE_STORE);
          }
        };
        req.onsuccess = function(e) { resolve(e.target.result); };
        req.onerror = function(e) { reject(e.target.error); };
      } catch(e) { reject(e); }
    });
  }
  function wsCacheGet() {
    return wsOpenDB().then(function(db) {
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(WS_CACHE_STORE, 'readonly');
          var store = tx.objectStore(WS_CACHE_STORE);
          var req = store.get(WS_CACHE_KEY);
          req.onsuccess = function() { resolve(req.result || null); };
          req.onerror = function() { resolve(null); };
        } catch(e) { resolve(null); }
      });
    }).catch(function() { return null; });
  }
  function wsCacheSet(items) {
    return wsOpenDB().then(function(db) {
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(WS_CACHE_STORE, 'readwrite');
          var store = tx.objectStore(WS_CACHE_STORE);
          store.put({ data: items, timestamp: Date.now() }, WS_CACHE_KEY);
          tx.oncomplete = function() { resolve(true); };
          tx.onerror = function() { resolve(false); };
        } catch(e) { resolve(false); }
      });
    }).catch(function() { return false; });
  }

  /**
   * Load listings from WISHES Admin API
   */
  window.WS._loadingData = false; // Prevent duplicate API calls
  window.WS.loadData = function() {
    // Prevent duplicate calls while loading
    if (window.WS._loadingData) return;
    window.WS._loadingData = true;
    // Safety timeout: reset loading flag after 30s to prevent permanent lock
    setTimeout(function() { window.WS._loadingData = false; }, 30000);

    var container = document.getElementById('ws-listings');
    if (container) {
      // 스켈레톤 UI: 즉시 카드 형태 표시 → 로딩 느낌 제거
      var skeletonCard = '<div style="display:flex;align-items:stretch;border-bottom:1px solid #eee;padding:0;min-height:110px;animation:ws-skeleton-pulse 1.2s ease-in-out infinite;">' +
        '<div style="width:115px;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;flex-shrink:0;"></div>' +
        '<div style="flex:1;padding:12px 14px;display:flex;gap:12px;">' +
          '<div style="flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center;">' +
            '<div style="height:14px;background:#eee;border-radius:3px;width:70%;"></div>' +
            '<div style="height:11px;background:#f3f3f3;border-radius:3px;width:85%;"></div>' +
            '<div style="height:10px;background:#f5f5f5;border-radius:3px;width:50%;"></div>' +
            '<div style="display:flex;gap:6px;"><div style="height:20px;background:#f3f3f3;border-radius:3px;width:50px;"></div><div style="height:20px;background:#f3f3f3;border-radius:3px;width:40px;"></div><div style="height:20px;background:#f3f3f3;border-radius:3px;width:55px;"></div></div>' +
          '</div>' +
          '<div style="width:170px;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:6px;border-left:1px solid #f0f0f0;padding-left:12px;">' +
            '<div style="height:12px;background:#f3f3f3;border-radius:3px;width:50px;"></div>' +
            '<div style="height:18px;background:#eee;border-radius:3px;width:100px;"></div>' +
            '<div style="height:24px;background:#f5f5f5;border-radius:4px;width:100%;"></div>' +
            '<div style="display:flex;gap:3px;width:100%;"><div style="flex:1;height:22px;background:#f5f5f5;border-radius:4px;"></div><div style="flex:1;height:22px;background:#f5f5f5;border-radius:4px;"></div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
      container.innerHTML = skeletonCard.repeat(8) + '<div id="ws-load-status" style="text-align:center;padding:8px;font-size:11px;color:#aaa;">매물 로드 중...</div>';
    }

    // ===== Admin API 단일 호출 로딩 (v2.1.0) =====
    var _loadStartTime = Date.now();

    function fetchAllListings(retryCount) {
      retryCount = retryCount || 0;
      var MAX_RETRIES = 3;
      var ctrl = new AbortController();
      var tm = setTimeout(function() { ctrl.abort(); }, 60000);
      return fetch(ADMIN_API_MINIMAL, {
        signal: ctrl.signal,
        headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN }
      })
        .then(function(r) { clearTimeout(tm); if (!r.ok) throw new Error('API ' + r.status); return r.json(); })
        .then(function(data) {
          if (data.success && Array.isArray(data.data)) return normalizeImages(data.data);
          return [];
        })
        .catch(function(err) {
          clearTimeout(tm);
          if (retryCount < MAX_RETRIES) {
            var delay = (retryCount + 1) * 2000;
            console.warn('[WISHES] Admin API 호출 실패 (재시도 ' + (retryCount + 1) + '/' + MAX_RETRIES + ', ' + delay + 'ms 후):', err.message);
            return new Promise(function(resolve) {
              setTimeout(function() { resolve(fetchAllListings(retryCount + 1)); }, delay);
            });
          }
          console.error('[WISHES] Admin API 호출 최종 실패:', err);
          return null;
        });
    }

    function finishLoad(allItems) {
      var elapsed = ((Date.now() - _loadStartTime) / 1000).toFixed(1);
      _wsLog('[WISHES] 전체 ' + allItems.length + '건 로드 완료 (' + elapsed + '초)');
      if (allItems.length > 0) {
        // ====== 자동 중복 매물 제거 (AUTO DEDUP) ======
        allItems = window.WS._autoDedup(allItems);
        // 중복 의심 매물 감시 (엄격 중복 제거 후 느슨 기준으로 2차 검사)
        window.WS._dupWatchdog(allItems);
        window.WS.allListings = allItems;
        if (window.WS.trackChanges) window.WS.trackChanges(allItems);
        if (window.WS.checkAlerts) window.WS.checkAlerts(allItems);
        if (window.WS.checkExpiringListings) window.WS.checkExpiringListings();
        if (window.WS.checkCustomerMatches) window.WS.checkCustomerMatches();
        setTimeout(function() { if (window.WS._autoSnapshot) window.WS._autoSnapshot(); }, 500);
      } else {
        window.WS.allListings = [];
        var ctr = document.getElementById('ws-listings');
        if (ctr) {
          ctr.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#f6ad55;">' +
            '<div style="font-size:20px;margin-bottom:8px;">📋</div>' +
            '<div>등록된 매물이 없거나 응답 형식이 올바르지 않습니다.</div></div>';
        }
      }
      window.WS._loadingData = false;
      if (window.WS.loadFilterFromURL) window.WS.loadFilterFromURL();
      window.WS.renderAll();
      window.WS.startAutoRefresh();
    }

    // ===== v3 egress 최적화 =====
    // 캐시 TTL 분기:
    //   < 2분  → full fetch 완전 스킵 (auto-refresh delta 만으로 갱신)
    //   2~10분 → 캐시 즉시 표시 + 백그라운드 full fetch
    //   > 10분 → 캐시 미사용, full fetch
    wsCacheGet().then(function(cached) {
      var hasCache = cached && cached.data && cached.data.length > 0;
      var cacheAgeMs = hasCache ? Date.now() - cached.timestamp : Infinity;

      if (hasCache && cacheAgeMs < 2 * 60 * 1000) {
        // ⚡ 신선 캐시 — full fetch 완전 스킵 (최대 Egress 절감)
        _wsLog('[WISHES] ⚡ 신선 캐시 사용 (' + Math.round(cacheAgeMs/1000) + '초 전) → full fetch 스킵');
        finishLoad(normalizeImages(cached.data));
        return;
      }

      if (hasCache && !window.WS.allListings) {
        _wsLog('[WISHES] 💾 캐시에서 ' + cached.data.length + '건 즉시 로드 (' + Math.round(cacheAgeMs/1000) + '초 전)');
        finishLoad(normalizeImages(cached.data));
        window.WS._loadingData = true;
        var statusEl = document.getElementById('ws-load-status');
        if (statusEl) statusEl.innerHTML = '⚡ 캐시 표시됨 · 최신 데이터 갱신 중...';
      }

      // Admin API 단일 호출로 전체 매물 로드 (캐시 10분 초과 또는 캐시 없음)
      fetchAllListings().then(function(allItems) {
        if (!allItems) {
          window.WS._loadingData = false;
          if (!hasCache) {
            window.WS.allListings = [];
            window.WS.refresh();
            var container = document.getElementById('ws-listings');
            if (container) {
              container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#e53e3e;">' +
                '<div style="font-size:24px;margin-bottom:12px;">⚠️</div>' +
                '<div>매물 데이터를 불러오지 못했습니다.</div>' +
                '<div style="margin-top:8px;font-size:13px;color:#999;">네트워크 연결을 확인하고 다시 시도해주세요.</div>' +
                '<button id="ws-retry-btn" style="margin-top:16px;padding:8px 20px;background:#2D5A27;color:#fff;border:none;border-radius:6px;cursor:pointer;">다시 시도</button></div>';
              var retryBtn = document.getElementById('ws-retry-btn');
              if (retryBtn) { retryBtn.addEventListener('click', function() { window.WS.loadData(); }); }
            }
          }
          return;
        }
        wsCacheSet(allItems);
        finishLoad(allItems);
      });
    });
  };

  // ?tab=search 프리페치 예약이 있으면 즉시 실행
  if (window.WS._prefetchOnReady) {
    window.WS._prefetchOnReady = false;
    window.WS.loadData();
  }

  // =========================================================
  // G) 카카오맵 연동 (Map View) - External file injection to MAIN world
  // =========================================================
  window.WS._mapScriptLoaded = false;

  window.WS.initMap = function() {
    var container = document.getElementById('ws-map-container');
    if (!container) return;

    // Prepare listings data for the MAIN world script
    var listings = window.WS.filtered || [];
    var validListings = listings.filter(function(l) { return l.lat && l.lng; });

    var listingsPayload = JSON.stringify(validListings.map(function(l) {
      // 관리자 페이지 - 정확한 좌표 사용 (오프셋 없음)
      var addrParts = (l.address || '').split(' ');
      var dongAddr = addrParts.length >= 3 ? addrParts.slice(0, 3).join(' ') : l.address || '';
      return {
        id: l.id, lat: l.lat, lng: l.lng,
        title: l.title || '', type: l.type || '',
        deal: l.deal || '', deposit: l.deposit || 0, monthly: l.monthly || 0,
        price: l.price || 0, address: l.address || '', dong: dongAddr,
        area_m2: l.area_m2 || 0,
        floor_current: l.floor_current || '', floor_total: l.floor_total || '',
        rooms: l.rooms || 0, parking: !!l.parking
      };
    }));

    // Check if map div already exists (reuse for smoother UX)
    var mapDiv = document.getElementById('ws-kakao-map');
    if (!mapDiv) {
      container.innerHTML = '<div id="ws-kakao-map" style="width:100%;height:500px;border-radius:8px;"></div>';
      mapDiv = document.getElementById('ws-kakao-map');
    }
    mapDiv.setAttribute('data-listings', listingsPayload);

    if (!window.WS._mapScriptLoaded && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      // First time: inject the MAIN world script
      window.WS._mapScriptLoaded = true;
      var mapScript = document.createElement('script');
      mapScript.id = 'ws-kakao-map-script';
      mapScript.src = chrome.runtime.getURL('map-main.js');
      document.body.appendChild(mapScript);
    } else {
      // Subsequent calls: use postMessage to communicate with MAIN world
      window.postMessage({ type: 'ws-map-render' }, '*');
    }
  };

  // =========================================================
  // H) AI 브리핑 시스템 (AI Briefing System) - MOST IMPORTANT
  // =========================================================
  window.WS.generateBriefing = function() {
    var selected = [];
    if (window.WS.state.selectedIds && window.WS.state.selectedIds.size > 0) {
      var allData = window.WS.allListings || [];
      window.WS.state.selectedIds.forEach(function(id) {
        var found = allData.find(function(l) { return String(l.id) === String(id); });
        if (found) selected.push(found);
      });
    }

    if (selected.length === 0) {
      var m = document.getElementById('ws-modal-briefing');
      var c = document.getElementById('ws-briefing-container');
      if (m && c) {
        m.style.display = 'flex';
        c.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#666;">' +
          '<div style="font-size:40px;margin-bottom:16px;">📋</div>' +
          '<div style="font-size:16px;font-weight:600;color:#333;margin-bottom:8px;">매물을 선택해주세요</div>' +
          '<div style="font-size:13px;">매물 목록에서 체크박스로 브리핑할 매물을 선택한 후 다시 시도해주세요.</div></div>';
      }
      return;
    }

    var modal = document.getElementById('ws-modal-briefing');
    var container = document.getElementById('ws-briefing-container');
    if (!modal || !container) return;

    modal.style.display = 'flex';
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
      '<div class="ws-loading-spinner"></div>' +
      '<div style="margin-top:16px;color:#2D5A27;font-weight:600;">AI 브리핑 자료 생성 중...</div>' +
      '<div style="margin-top:8px;color:#888;font-size:13px;">' + selected.length + '개 매물 Claude AI 분석 중</div>' +
      '<div style="margin-top:4px;color:#aaa;font-size:11px;">최신 AI 모델(Claude Sonnet 4.6)로 분석합니다</div></div>';

    // Try Claude API first, fallback to local analysis
    window.WS._generateWithClaudeAPI(selected, container).catch(function(err) {
      console.warn('Claude API unavailable, using local analysis:', err.message);
      var briefings = selected.map(function(listing) {
        return window.WS._buildBriefing(listing);
      });
      window.WS._buildBriefingDocument(briefings, container);
    });
  };

  // Claude API Integration - Latest Model (claude-sonnet-4-6)
  window.WS._CLAUDE_API_ENDPOINT = 'https://wishes.co.kr/api/ai/briefing'; // Backend proxy endpoint
  window.WS._CLAUDE_MODEL = 'claude-sonnet-4-6'; // Latest & best Claude model

  window.WS._generateWithClaudeAPI = function(listings, container) {
    var listingsData = listings.map(function(l) {
      var areaPy = ((l.area_m2 || 0) * 0.3025).toFixed(1);
      return {
        id: l.id,
        title: l.title || '',
        type: l.type || '',
        deal: l.deal || '',
        deposit: l.deposit || 0,
        monthly: l.monthly || 0,
        price: l.price || 0,
        maintenance_fee: l.maintenance_fee || 0,
        area_m2: l.area_m2 || 0,
        area_py: areaPy,
        floor_current: l.floor_current || '',
        floor_total: l.floor_total || '',
        rooms: l.rooms || 0,
        bathrooms: l.bathrooms || 0,
        direction: l.direction || '',
        address: l.address || '',
        parking: !!l.parking,
        elevator: !!l.elevator,
        pet: !!l.pet,
        balcony: !!l.balcony,
        full_option: !!l.full_option,
        loan_available: !!l.loan_available,
        built_year: l.built_year || l.builtYear || null,
        status: l.status || '',
        image: (function() { var _i = l.images || l.listing_images || []; return _i.length > 0 ? (_i[0].url || _i[0]) : ''; })()
      };
    });

    // Get comparison data for context
    var allListings = window.WS.allListings || [];
    var marketContext = {
      totalListings: allListings.length,
      avgDeposit: 0,
      avgMonthly: 0,
      typeDistribution: {}
    };
    var depositSum = 0, monthlySum = 0, depositCount = 0, monthlyCount = 0;
    allListings.forEach(function(l) {
      if (l.deposit > 0) { depositSum += l.deposit; depositCount++; }
      if (l.monthly > 0) { monthlySum += l.monthly; monthlyCount++; }
      marketContext.typeDistribution[l.type] = (marketContext.typeDistribution[l.type] || 0) + 1;
    });
    if (depositCount > 0) marketContext.avgDeposit = Math.round(depositSum / depositCount);
    if (monthlyCount > 0) marketContext.avgMonthly = Math.round(monthlySum / monthlyCount);

    var requestBody = {
      model: window.WS._CLAUDE_MODEL,
      listings: listingsData,
      market_context: marketContext,
      request_type: 'briefing'
    };

    return fetch(window.WS._CLAUDE_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('API response: ' + response.status);
      }
      return response.json();
    })
    .then(function(data) {
      if (data.success && data.briefings) {
        // AI-generated briefings from Claude API
        window.WS._buildAIBriefingDocument(data.briefings, listings, container);
      } else {
        throw new Error('Invalid API response format');
      }
    })
    .catch(function(err) {
      _wsLog('[WISHES] AI 브리핑 API 오류: ' + (err.message || err));
      if (container) {
        container.innerHTML = '<div style="padding:24px;text-align:center;color:#e74c3c;">' +
          '<p style="font-size:15px;">⚠️ AI 브리핑 생성 중 오류가 발생했습니다.</p>' +
          '<p style="font-size:13px;color:#888;">잠시 후 다시 시도해주세요.</p></div>';
      }
    });
  };

  window.WS._buildAIBriefingDocument = function(aiBriefings, listings, container) {
    var now = new Date();
    var dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');

    var html = '<div class="ws-briefing-doc">';
    html += '<div class="ws-briefing-header">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
      '<div>' +
      '<h2 style="margin:0;color:#2D5A27;font-size:20px;">WISHES AI 매물 브리핑 자료</h2>' +
      '<div style="color:#888;font-size:13px;margin-top:4px;">작성일: ' + dateStr + ' | 총 ' + listings.length + '건 | 🤖 Claude AI (Sonnet 4.6) 분석</div>' +
      '</div>' +
      '<button id="ws-btn-download-briefing" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">📄 PDF 다운로드</button>' +
      '</div></div>';

    aiBriefings.forEach(function(brief, idx) {
      var listing = listings[idx] || {};
      var mainImage = '';
      var _bImgs = listing.images || listing.listing_images || [];
      if (_bImgs.length > 0) {
        mainImage = _bImgs[0].url || _bImgs[0];
      }

      var priceDisplay = '';
      if (listing.deal === '월세') {
        priceDisplay = '보증금 ' + (listing.deposit ? (listing.deposit >= 10000 ? (listing.deposit/10000).toFixed(1) + '억' : listing.deposit + '만') : '0') + ' / 월세 ' + (listing.monthly || 0) + '만원';
      } else if (listing.deal === '전세') {
        priceDisplay = '전세금 ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + '억') : ((listing.deposit || 0) + '만')) + '원';
      } else {
        priceDisplay = '매매가 ' + ((listing.price || 0) >= 10000 ? ((listing.price/10000).toFixed(1) + '억') : ((listing.price || 0) + '만')) + '원';
      }

      html += '<div class="ws-briefing-item" style="page-break-inside:avoid;margin-bottom:24px;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">';

      // Header
      html += '<div style="background:linear-gradient(135deg,#f8faf8,#e8f5e9);padding:16px 20px;border-bottom:1px solid #e8e8e8;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<span style="background:#2D5A27;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">' + (idx+1) + '</span>' +
        '<div>' +
        '<div style="font-weight:700;font-size:16px;color:#333;">' + escHtml(listing.title || listing.type + ' ' + listing.deal) + '</div>' +
        '<div style="color:#666;font-size:13px;margin-top:2px;">📍 ' + escHtml(listing.address || '') + '</div>' +
        '</div></div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:18px;font-weight:700;color:#e53e3e;">' + priceDisplay + '</div>' +
        '<div style="font-size:11px;color:#2D5A27;margin-top:2px;">🤖 AI 분석 완료</div>' +
        '</div></div></div>';

      // AI Content
      html += '<div style="padding:20px;">';

      // Image
      if (mainImage) {
        html += '<div style="width:100%;height:200px;border-radius:8px;overflow:hidden;margin-bottom:16px;background:#f0f0f0;">' +
          '<img src="' + escHtml(mainImage) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display=\'none\'">' +
          '</div>';
      }

      // AI Analysis content
      html += '<div style="white-space:pre-line;font-size:13px;line-height:1.8;color:#333;">' +
        (brief.analysis || brief.content || '분석 데이터를 가져올 수 없습니다.') +
        '</div>';

      html += '</div></div>';
    });

    html += '<div style="text-align:center;padding:16px;color:#aaa;font-size:12px;border-top:1px solid #e0e0e0;margin-top:8px;">' +
      'WISHES 부동산 | AI 매물 브리핑 자료 (Claude Sonnet 4.6) | ' + dateStr + ' | 본 자료는 AI 분석 참고용이며, 실제 거래 시 현장 확인이 필요합니다.' +
      '</div></div>';

    container.innerHTML = html;

    var dlBtn = document.getElementById('ws-btn-download-briefing');
    if (dlBtn) {
      dlBtn.addEventListener('click', function() {
        window.WS._downloadBriefingPDF(container.innerHTML);
      });
    }
  };

  window.WS._buildBriefing = function(listing) {
    var location = window.WS._analyzeLocation(listing);
    var price = window.WS._analyzePrice(listing);
    var condition = window.WS._analyzeCondition(listing);
    var recommendation = window.WS._generateRecommendation(listing, location, price, condition);

    return {
      listing: listing,
      location: location,
      price: price,
      condition: condition,
      recommendation: recommendation
    };
  };

  window.WS._analyzeLocation = function(listing) {
    var address = listing.address || '';
    var parts = address.split(' ');
    var city = parts[0] || '';
    var district = parts[1] || '';
    var dong = parts[2] || '';

    // District classification
    var districtType = '일반 주거지역';
    var premiumDistricts = ['강남구','서초구','송파구','마포구','용산구','성동구','광진구','영등포구','종로구'];
    var businessDistricts = ['중구','강남구','영등포구','서초구','마포구','종로구'];

    if (premiumDistricts.indexOf(district) >= 0) districtType = '프리미엄 주거/상업 지역';
    if (businessDistricts.indexOf(district) >= 0) districtType = '핵심 업무/상업 지구';

    // Floor analysis
    var floorCurrent = parseInt(listing.floor_current) || 0;
    var floorTotal = parseInt(listing.floor_total) || 0;
    var floorAnalysis = '';
    if (floorCurrent <= 2) floorAnalysis = '저층 (접근성 우수, 소음/프라이버시 주의)';
    else if (floorCurrent <= 5) floorAnalysis = '중저층 (균형 잡힌 층수)';
    else if (floorCurrent <= 10) floorAnalysis = '중층 (채광/조망 양호)';
    else if (floorCurrent <= 15) floorAnalysis = '중고층 (조망 우수)';
    else floorAnalysis = '고층 (프리미엄 조망, 환기 유의)';

    // Direction analysis
    var directionScore = 3;
    var directionComment = '';
    var dir = listing.direction || '';
    if (dir.indexOf('남') >= 0 && dir.indexOf('향') >= 0) { directionScore = 5; directionComment = '최고의 채광 조건'; }
    else if (dir === '남동향' || dir === '남서향') { directionScore = 4; directionComment = '양호한 채광 조건'; }
    else if (dir === '동향') { directionScore = 3; directionComment = '오전 채광 양호'; }
    else if (dir === '서향') { directionScore = 2; directionComment = '오후 서향빛 주의'; }
    else if (dir.indexOf('북') >= 0) { directionScore = 1; directionComment = '채광 불리, 난방비 고려'; }
    else { directionComment = '방향 정보 미확인'; }

    return {
      city: city,
      district: district,
      dong: dong,
      districtType: districtType,
      floorAnalysis: floorAnalysis,
      floorCurrent: floorCurrent,
      floorTotal: floorTotal,
      directionScore: directionScore,
      directionComment: directionComment
    };
  };

  window.WS._analyzePrice = function(listing) {
    var allListings = window.WS.allListings || [];
    var sameType = allListings.filter(function(l) {
      return l.type === listing.type && l.deal === listing.deal;
    });

    var areaPy = (listing.area_m2 || 0) * 0.3025;

    // Price per pyeong calculation
    var pricePerPy = 0;
    var totalPrice = 0;
    if (listing.deal === '월세') {
      totalPrice = (listing.deposit || 0) + ((listing.monthly || 0) * 12);
      pricePerPy = areaPy > 0 ? Math.round(totalPrice / areaPy) : 0;
    } else if (listing.deal === '전세') {
      totalPrice = listing.deposit || 0;
      pricePerPy = areaPy > 0 ? Math.round(totalPrice / areaPy) : 0;
    } else {
      totalPrice = listing.price || 0;
      pricePerPy = areaPy > 0 ? Math.round(totalPrice / areaPy) : 0;
    }

    // Compare with same type listings
    var avgPrice = 0;
    var priceRank = '보통';
    if (sameType.length > 1) {
      var prices = sameType.map(function(l) {
        if (l.deal === '월세') return (l.deposit || 0) + ((l.monthly || 0) * 12);
        if (l.deal === '전세') return l.deposit || 0;
        return l.price || 0;
      }).filter(function(p) { return p > 0; });

      if (prices.length > 0) {
        avgPrice = Math.round(prices.reduce(function(a, b) { return a + b; }, 0) / prices.length);
        var ratio = totalPrice / avgPrice;
        if (ratio < 0.85) priceRank = '매우 저렴 (시세 대비 15% 이상 저렴)';
        else if (ratio < 0.95) priceRank = '저렴 (시세 대비 5~15% 저렴)';
        else if (ratio <= 1.05) priceRank = '적정 (시세 수준)';
        else if (ratio <= 1.15) priceRank = '다소 높음 (시세 대비 5~15% 높음)';
        else priceRank = '높은 편 (시세 대비 15% 이상 높음)';
      }
    }

    // Maintenance fee analysis
    var maintFee = listing.maintenance_fee || 0;
    var maintAnalysis = '';
    if (maintFee === 0) maintAnalysis = '관리비 없음 (개별 납부 가능성)';
    else if (maintFee <= 5) maintAnalysis = '매우 저렴한 관리비';
    else if (maintFee <= 10) maintAnalysis = '적정 관리비 수준';
    else if (maintFee <= 20) maintAnalysis = '다소 높은 관리비';
    else maintAnalysis = '높은 관리비 (포함 항목 확인 필요)';

    return {
      totalPrice: totalPrice,
      pricePerPy: pricePerPy,
      areaPy: areaPy,
      avgPrice: avgPrice,
      priceRank: priceRank,
      sameTypeCount: sameType.length,
      maintAnalysis: maintAnalysis
    };
  };

  window.WS._analyzeCondition = function(listing) {
    // Built year analysis
    var builtYear = listing.built_year || listing.builtYear || null;
    var ageYears = 0;
    var ageComment = '';
    if (builtYear) {
      var yearNum = parseInt(builtYear);
      if (yearNum > 0) {
        ageYears = new Date().getFullYear() - yearNum;
        if (ageYears <= 3) ageComment = '신축 (최신 설비, 프리미엄 컨디션)';
        else if (ageYears <= 7) ageComment = '준신축 (양호한 컨디션)';
        else if (ageYears <= 15) ageComment = '일반 (상태 확인 권장)';
        else if (ageYears <= 25) ageComment = '노후 (리모델링 여부 확인)';
        else ageComment = '구축 (리모델링/재건축 가능성 검토)';
      }
    } else {
      ageComment = '준공년도 정보 미확인';
    }

    // Amenity scoring
    var amenities = [];
    var amenityScore = 0;
    if (listing.parking) { amenities.push('주차 가능'); amenityScore += 15; }
    if (listing.elevator) { amenities.push('엘리베이터'); amenityScore += 10; }
    if (listing.pet) { amenities.push('반려동물 허용'); amenityScore += 5; }
    if (listing.balcony) { amenities.push('발코니'); amenityScore += 8; }
    if (listing.full_option) { amenities.push('풀옵션'); amenityScore += 12; }
    if (listing.loan_available) { amenities.push('대출 가능'); amenityScore += 10; }

    // Overall condition grade
    var grade = 'C';
    var totalScore = amenityScore;
    if (ageYears <= 5) totalScore += 20;
    else if (ageYears <= 10) totalScore += 10;
    else if (ageYears <= 20) totalScore += 5;

    if (totalScore >= 50) grade = 'A';
    else if (totalScore >= 35) grade = 'B';
    else if (totalScore >= 20) grade = 'C';
    else grade = 'D';

    return {
      ageYears: ageYears,
      ageComment: ageComment,
      amenities: amenities,
      amenityScore: amenityScore,
      totalScore: totalScore,
      grade: grade
    };
  };

  window.WS._generateRecommendation = function(listing, location, price, condition) {
    var pros = [];
    var cons = [];
    var targetAudience = [];

    // Pros
    if (price.priceRank.indexOf('저렴') >= 0) pros.push('시세 대비 합리적인 가격');
    if (location.directionScore >= 4) pros.push('우수한 채광 조건 (' + (listing.direction || '') + ')');
    if (condition.grade === 'A' || condition.grade === 'B') pros.push('우수한 시설 컨디션 (등급: ' + condition.grade + ')');
    if (listing.parking) pros.push('주차 가능');
    if (listing.elevator) pros.push('엘리베이터 보유');
    if (listing.full_option) pros.push('풀옵션 (즉시 입주 가능)');
    if (listing.loan_available) pros.push('대출 가능 (자금 계획 유연)');
    if (listing.balcony) pros.push('발코니 공간 활용 가능');
    if (location.districtType.indexOf('프리미엄') >= 0) pros.push('프리미엄 입지');
    if (location.floorCurrent >= 10) pros.push('고층 조망');

    // Cons
    if (price.priceRank.indexOf('높') >= 0) cons.push('시세 대비 다소 높은 가격대');
    if (location.directionScore <= 2) cons.push('채광 조건 불리 (' + (listing.direction || '확인필요') + ')');
    if (condition.ageYears > 20) cons.push('건물 노후 (' + condition.ageYears + '년)');
    if (!listing.parking) cons.push('주차 불가');
    if (!listing.elevator) cons.push('엘리베이터 미보유');
    if (location.floorCurrent <= 2 && location.floorTotal > 5) cons.push('저층 (소음/프라이버시 유의)');
    if ((listing.maintenance_fee || 0) > 15) cons.push('관리비 높은 편 (' + listing.maintenance_fee + '만원)');

    // If no pros/cons found, add general ones
    if (pros.length === 0) pros.push('추가 현장 확인 권장');
    if (cons.length === 0) cons.push('특이사항 없음');

    // Target audience
    var areaPy = (listing.area_m2 || 0) * 0.3025;
    if (listing.type === '원룸' || listing.type === '오피스텔') {
      if (areaPy <= 10) targetAudience.push('1인 가구', '직장인', '대학생');
      else targetAudience.push('1인 가구', '신혼부부', '직장인');
    } else if (listing.type === '투룸' || listing.type === '쓰리룸') {
      targetAudience.push('신혼부부', '소규모 가정', '룸메이트');
    } else if (listing.type === '아파트') {
      if (areaPy >= 30) targetAudience.push('가족 단위', '장기 거주자');
      else targetAudience.push('소규모 가정', '신혼부부');
    } else if (listing.type === '사무실') {
      targetAudience.push('스타트업', '소규모 사업자', '프리랜서');
    } else if (listing.type === '상가') {
      targetAudience.push('자영업자', '프랜차이즈', '소매업');
    } else {
      targetAudience.push('일반 수요자');
    }

    // Overall summary
    var summaryParts = [];
    if (listing.type) summaryParts.push(listing.type);
    if (listing.deal) summaryParts.push(listing.deal);
    summaryParts.push('매물로');
    if (pros.length > 0) summaryParts.push(pros[0] + '이(가) 강점입니다.');
    if (cons.length > 0 && cons[0] !== '특이사항 없음') summaryParts.push('다만 ' + cons[0] + ' 점은 고려가 필요합니다.');

    return {
      pros: pros,
      cons: cons,
      targetAudience: targetAudience,
      summary: summaryParts.join(' ')
    };
  };

  window.WS._buildBriefingDocument = function(briefings, container) {
    var now = new Date();
    var dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');

    var html = '<div class="ws-briefing-doc">';

    // Header
    html += '<div class="ws-briefing-header">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
      '<div>' +
      '<h2 style="margin:0;color:#2D5A27;font-size:20px;">WISHES 매물 브리핑 자료</h2>' +
      '<div style="color:#888;font-size:13px;margin-top:4px;">작성일: ' + dateStr + ' | 총 ' + briefings.length + '건</div>' +
      '</div>' +
      '<button id="ws-btn-download-briefing" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">📄 PDF 다운로드</button>' +
      '</div></div>';

    // Each listing briefing
    briefings.forEach(function(b, idx) {
      var l = b.listing;
      var loc = b.location;
      var pr = b.price;
      var cond = b.condition;
      var rec = b.recommendation;

      var mainImage = '';
      var _pImgs = l.images || l.listing_images || [];
      if (_pImgs.length > 0) {
        mainImage = _pImgs[0].url || _pImgs[0];
      }

      var priceDisplay = '';
      if (l.deal === '월세') {
        priceDisplay = '보증금 ' + (l.deposit ? (l.deposit >= 10000 ? (l.deposit/10000).toFixed(1) + '억' : l.deposit + '만') : '0') + ' / 월세 ' + (l.monthly || 0) + '만원';
      } else if (l.deal === '전세') {
        priceDisplay = '전세금 ' + ((l.deposit || 0) >= 10000 ? ((l.deposit/10000).toFixed(1) + '억') : ((l.deposit || 0) + '만')) + '원';
      } else {
        priceDisplay = '매매가 ' + ((l.price || 0) >= 10000 ? ((l.price/10000).toFixed(1) + '억') : ((l.price || 0) + '만')) + '원';
      }

      html += '<div class="ws-briefing-item" style="page-break-inside:avoid;margin-bottom:24px;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">';

      // Item header
      html += '<div style="background:#f8faf8;padding:16px 20px;border-bottom:1px solid #e8e8e8;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<span style="background:#2D5A27;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">' + (idx+1) + '</span>' +
        '<div>' +
        '<div style="font-weight:700;font-size:16px;color:#333;">' + escHtml(l.title || l.type + ' ' + l.deal) + '</div>' +
        '<div style="color:#666;font-size:13px;margin-top:2px;">' + escHtml(l.address || '') + '</div>' +
        '</div></div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:18px;font-weight:700;color:#e53e3e;">' + priceDisplay + '</div>' +
        '<div style="font-size:12px;color:#888;margin-top:2px;">관리비 ' + (l.maintenance_fee || 0) + '만원</div>' +
        '</div></div></div>';

      // Body
      html += '<div style="padding:20px;">';

      // Image + Basic info row
      html += '<div style="display:flex;gap:20px;margin-bottom:20px;">';
      if (mainImage) {
        html += '<div style="width:200px;height:150px;flex-shrink:0;border-radius:8px;overflow:hidden;background:#f0f0f0;">' +
          '<img src="' + escHtml(mainImage) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent=\'이미지 없음\'">' +
          '</div>';
      }
      html += '<div style="flex:1;">' +
        '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
        '<tr><td style="padding:4px 8px;color:#888;width:80px;">매물유형</td><td style="padding:4px 8px;font-weight:600;">' + escHtml((l.type || '-') + ' / ' + (l.deal || '-')) + '</td>' +
        '<td style="padding:4px 8px;color:#888;width:80px;">면적</td><td style="padding:4px 8px;font-weight:600;">' + (l.area_m2 || 0) + '㎡ (' + pr.areaPy.toFixed(1) + '평)</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#888;">층수</td><td style="padding:4px 8px;font-weight:600;">' + escHtml((l.floor_current || '-') + '/' + (l.floor_total || '-')) + '층</td>' +
        '<td style="padding:4px 8px;color:#888;">방향</td><td style="padding:4px 8px;font-weight:600;">' + escHtml(l.direction || '-') + '</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#888;">방/화장실</td><td style="padding:4px 8px;font-weight:600;">' + escHtml((l.rooms || '-') + '개 / ' + (l.bathrooms || '-')) + '개</td>' +
        '<td style="padding:4px 8px;color:#888;">평당가</td><td style="padding:4px 8px;font-weight:600;">' + (pr.pricePerPy ? pr.pricePerPy.toLocaleString() + '만원' : '-') + '</td></tr>' +
        '</table></div></div>';

      // Analysis sections
      // 1. Location Analysis
      html += '<div style="margin-bottom:16px;">' +
        '<div style="font-weight:700;color:#2D5A27;font-size:14px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e8f5e9;">📍 입지 분석</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">지역 분류:</span> <strong>' + loc.districtType + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">층수 분석:</span> <strong>' + loc.floorAnalysis + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">채광 방향:</span> <strong>' + escHtml(l.direction || '-') + '</strong> (' + escHtml(loc.directionComment) + ')</div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">채광 점수:</span> <strong>' + '★'.repeat(loc.directionScore) + '☆'.repeat(5 - loc.directionScore) + '</strong></div>' +
        '</div></div>';

      // 2. Price Analysis
      html += '<div style="margin-bottom:16px;">' +
        '<div style="font-weight:700;color:#2D5A27;font-size:14px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e8f5e9;">💰 가격 분석</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">시세 평가:</span> <strong style="color:' + (pr.priceRank.indexOf('저렴') >= 0 ? '#2D5A27' : pr.priceRank.indexOf('높') >= 0 ? '#e53e3e' : '#333') + ';">' + pr.priceRank + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">동일 유형:</span> <strong>' + pr.sameTypeCount + '건</strong> 비교 분석</div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">관리비:</span> <strong>' + pr.maintAnalysis + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">평당가:</span> <strong>' + (pr.pricePerPy ? pr.pricePerPy.toLocaleString() + '만원/평' : '산출 불가') + '</strong></div>' +
        '</div></div>';

      // 3. Condition Analysis
      html += '<div style="margin-bottom:16px;">' +
        '<div style="font-weight:700;color:#2D5A27;font-size:14px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e8f5e9;">🏠 시설 분석</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">건물 연식:</span> <strong>' + cond.ageComment + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">시설 등급:</span> <strong style="color:' + (cond.grade === 'A' ? '#2D5A27' : cond.grade === 'B' ? '#4CAF50' : cond.grade === 'C' ? '#FF9800' : '#e53e3e') + ';font-size:16px;">' + cond.grade + '등급</strong> (' + cond.totalScore + '점)</div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;grid-column:1/-1;"><span style="color:#888;">보유 시설:</span> <strong>' + (cond.amenities.length > 0 ? cond.amenities.join(' · ') : '정보 미확인') + '</strong></div>' +
        '</div></div>';

      // 4. Recommendation
      html += '<div style="margin-bottom:12px;">' +
        '<div style="font-weight:700;color:#2D5A27;font-size:14px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e8f5e9;">✅ 종합 평가</div>' +
        '<div style="background:#f0f7f0;padding:12px 16px;border-radius:8px;font-size:13px;line-height:1.8;">' +
        '<div style="margin-bottom:8px;font-weight:600;color:#333;">' + rec.summary + '</div>' +
        '<div style="display:flex;gap:16px;">' +
        '<div style="flex:1;">' +
        '<div style="color:#2D5A27;font-weight:700;margin-bottom:4px;">👍 장점</div>' +
        rec.pros.map(function(p) { return '<div style="padding:2px 0;">• ' + p + '</div>'; }).join('') +
        '</div>' +
        '<div style="flex:1;">' +
        '<div style="color:#e53e3e;font-weight:700;margin-bottom:4px;">👎 주의사항</div>' +
        rec.cons.map(function(c) { return '<div style="padding:2px 0;">• ' + c + '</div>'; }).join('') +
        '</div></div>' +
        '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #d0e8d0;">' +
        '<span style="color:#888;">추천 대상:</span> <strong>' + rec.targetAudience.join(', ') + '</strong>' +
        '</div></div></div>';

      html += '</div></div>';
    });

    // Footer
    html += '<div style="text-align:center;padding:16px;color:#aaa;font-size:12px;border-top:1px solid #e0e0e0;margin-top:8px;">' +
      'WISHES 부동산 | AI 매물 브리핑 자료 | ' + dateStr + ' | 본 자료는 참고용이며, 실제 거래 시 현장 확인이 필요합니다.' +
      '</div>';

    html += '</div>';

    container.innerHTML = html;

    // PDF download event
    var dlBtn = document.getElementById('ws-btn-download-briefing');
    if (dlBtn) {
      dlBtn.addEventListener('click', function() {
        window.WS._downloadBriefingPDF(container.innerHTML);
      });
    }
  };

  window.WS._downloadBriefingPDF = function(htmlContent) {
    var printWindow = window.open('', '_blank');
    // script 태그 제거 (XSS 방어)
    var sanitizedContent = htmlContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    printWindow.document.write('<!DOCTYPE html><html><head><title>WISHES 매물 브리핑 자료</title>' +
      '<style>' +
      'body{font-family:"Malgun Gothic","맑은 고딕",sans-serif;padding:20px;max-width:900px;margin:0 auto;color:#333;font-size:13px;}' +
      'table{border-collapse:collapse;width:100%;}td{padding:4px 8px;}' +
      '.ws-briefing-item{page-break-inside:avoid;margin-bottom:24px;border:1px solid #ddd;border-radius:12px;overflow:hidden;}' +
      '@media print{body{padding:10px;}.ws-briefing-item{break-inside:avoid;}button{display:none!important;}}' +
      '</style></head><body>' + sanitizedContent + '<script>setTimeout(function(){window.print();},500);<\/script></body></html>');
    printWindow.document.close();
  };

  // =========================================================
  // I) 매물 비교 기능 (Compare Listings)
  // =========================================================
  window.WS.showCompare = function() {
    var selected = [];
    if (window.WS.state.selectedIds && window.WS.state.selectedIds.size > 0) {
      var allData = window.WS.allListings || [];
      window.WS.state.selectedIds.forEach(function(id) {
        var found = allData.find(function(l) { return String(l.id) === String(id); });
        if (found) selected.push(found);
      });
    }

    if (selected.length < 2) {
      var m2 = document.getElementById('ws-modal-compare');
      var c2 = document.getElementById('ws-compare-container');
      if (m2 && c2) {
        m2.style.display = 'flex';
        c2.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#666;">' +
          '<div style="font-size:40px;margin-bottom:16px;">⚖️</div>' +
          '<div style="font-size:16px;font-weight:600;color:#333;margin-bottom:8px;">매물을 2개 이상 선택해주세요</div>' +
          '<div style="font-size:13px;">매물 목록에서 체크박스로 비교할 매물을 선택한 후 다시 시도해주세요.</div></div>';
      }
      return;
    }

    if (selected.length > 5) {
      selected = selected.slice(0, 5); // 최대 5개까지만 비교
    }

    var modal = document.getElementById('ws-modal-compare');
    var container = document.getElementById('ws-compare-container');
    if (!modal || !container) return;

    modal.style.display = 'flex';

    var rows = [
      { label: '매물유형', key: function(l) { return (l.type || '-') + ' / ' + (l.deal || '-'); } },
      { label: '가격', key: function(l) {
        return formatPrice(l.deposit, l.monthly, l.price, l.deal);
      }},
      { label: '관리비', key: function(l) { return (l.maintenance_fee || 0) + '만원'; } },
      { label: '면적(㎡)', key: function(l) { return (l.area_m2 || '-') + '㎡'; } },
      { label: '면적(평)', key: function(l) { return ((l.area_m2 || 0) * 0.3025).toFixed(1) + '평'; } },
      { label: '층수', key: function(l) { return (l.floor_current || '-') + '/' + (l.floor_total || '-') + '층'; } },
      { label: '방/화장실', key: function(l) { return (l.rooms || '-') + '개/' + (l.bathrooms || '-') + '개'; } },
      { label: '방향', key: function(l) { return l.direction || '-'; } },
      { label: '주소', key: function(l) { return l.address || '-'; } },
      { label: '주차', key: function(l) { return l.parking ? '✅ 가능' : '❌ 불가'; } },
      { label: '엘리베이터', key: function(l) { return l.elevator ? '✅ 있음' : '❌ 없음'; } },
      { label: '반려동물', key: function(l) { return l.pet ? '✅ 가능' : '❌ 불가'; } },
      { label: '발코니', key: function(l) { return l.balcony ? '✅ 있음' : '❌ 없음'; } },
      { label: '풀옵션', key: function(l) { return l.full_option ? '✅' : '❌'; } },
      { label: '대출', key: function(l) { return l.loan_available ? '✅ 가능' : '❌ 불가'; } },
      { label: '조회수', key: function(l) { return (l.views || 0) + '회'; } },
      { label: '등록일', key: function(l) {
        if (!l.created_at) return '-';
        var d = new Date(l.created_at);
        return (d.getMonth()+1) + '/' + d.getDate();
      }},
      { label: '상태', key: function(l) { return l.status || '-'; } }
    ];

    var html = '<div style="overflow-x:auto;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:' + (200 + selected.length * 160) + 'px;">';

    // Header with images
    html += '<thead><tr style="background:#f8faf8;">' +
      '<th style="padding:12px 8px;text-align:left;font-weight:700;color:#2D5A27;border-bottom:2px solid #2D5A27;width:100px;">항목</th>';
    selected.forEach(function(l) {
      var img = '';
      var _cImgs = l.images || l.listing_images || [];
      if (_cImgs.length > 0) {
        img = '<div style="width:120px;height:80px;border-radius:6px;overflow:hidden;margin-bottom:8px;background:#f0f0f0;">' +
          '<img src="' + escHtml(_cImgs[0].url || _cImgs[0]) + '" style="width:100%;height:100%;object-fit:cover;"></div>';
      }
      html += '<th style="padding:12px 8px;text-align:center;border-bottom:2px solid #2D5A27;min-width:140px;">' +
        img +
        '<div style="font-weight:700;color:#333;font-size:12px;">' + escHtml(l.title || l.type) + '</div></th>';
    });
    html += '</tr></thead>';

    // Data rows
    html += '<tbody>';
    rows.forEach(function(row, rIdx) {
      html += '<tr style="background:' + (rIdx % 2 === 0 ? '#fff' : '#fafafa') + ';">' +
        '<td style="padding:8px;font-weight:600;color:#555;border-bottom:1px solid #eee;">' + row.label + '</td>';
      selected.forEach(function(l) {
        html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #eee;">' + row.key(l) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    container.innerHTML = html;
  };

  // =========================================================
  // J) 자동 갱신 (Auto-Refresh with New Listing Alerts)
  // =========================================================
  window.WS._autoRefreshTimer = null;
  window.WS._lastListingIds = new Set();

  window.WS.startAutoRefresh = function() {
    if (window.WS._autoRefreshTimer) return;

    // 현재 매물 ID로 초기화 (기존 Set 리셋 후 새로 채움)
    window.WS._lastListingIds = new Set((window.WS.allListings || []).map(function(l) { return l.id; }));
    // 마지막 fetch 기준 시각 — delta(since) 파라미터로 사용
    window.WS._lastFetchISO = (function() {
      try {
        var latest = (window.WS.allListings || []).reduce(function(m, l) {
          var t = l && l.created_at; return (t && (!m || t > m)) ? t : m;
        }, null);
        return latest || new Date().toISOString();
      } catch (e) { return new Date().toISOString(); }
    })();

    var _refreshFailCount = 0;
    // ⚡ v3 egress 최적화:
    //   1) 10분 간격 (기존 5분 → Egress 절반)
    //   2) delta fetch: ?since=<lastFetchISO> 로 신규 매물만 수신 (~수 KB)
    //   3) ids_only 로 제거된 매물 감지 (~750 KB / 매월 3~5회 호출)
    //   → 월 Egress 5 GB → 예상 0.5 GB 이하로 절감
    window.WS._autoRefreshTimer = setInterval(function() {
      if (_refreshFailCount >= 5) {
        console.warn('Auto-refresh: 연속 5회 실패로 중단됨');
        window.WS.stopAutoRefresh();
        return;
      }
      var ctrl = new AbortController();
      var tm = setTimeout(function() { ctrl.abort(); }, 30000);
      var sinceISO = window.WS._lastFetchISO || new Date(Date.now() - 10 * 60 * 1000).toISOString();
      var deltaURL = ADMIN_API_MINIMAL + (ADMIN_API_MINIMAL.indexOf('?') >= 0 ? '&' : '?') + 'since=' + encodeURIComponent(sinceISO);
      fetch(deltaURL, {
        signal: ctrl.signal,
        headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN }
      })
        .then(function(r) {
          clearTimeout(tm);
          if (!r.ok) throw new Error('API error: ' + r.status);
          return r.json();
        })
        .then(function(data) {
          _refreshFailCount = 0;
          var newItems = [];
          if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
            newItems = normalizeImages(data.data);
            // 이미 allListings 에 있는지 id 중복 체크
            var existingIds = window.WS._lastListingIds || new Set();
            var trulyNew = newItems.filter(function(l) { return !existingIds.has(l.id); });
            if (trulyNew.length > 0) {
              var merged = (window.WS.allListings || []).concat(trulyNew);
              merged = window.WS._autoDedup(merged, true);
              window.WS._dupWatchdog(merged);
              window.WS.allListings = merged;
              window.WS._lastListingIds = new Set(merged.map(function(l) { return l.id; }));
              if (window.WS.trackChanges) window.WS.trackChanges(merged);
              if (window.WS.checkAlerts) window.WS.checkAlerts(merged);
              if (window.WS.checkExpiringListings) window.WS.checkExpiringListings();
              if (window.WS.checkCustomerMatches) window.WS.checkCustomerMatches();
              window.WS.refresh();
              window.WS._showNewListingBadge(trulyNew.length);
            }
            // 서버가 반환한 가장 최신 created_at 로 업데이트
            var maxCreated = newItems.reduce(function(m, l) {
              return (l.created_at && (!m || l.created_at > m)) ? l.created_at : m;
            }, sinceISO);
            window.WS._lastFetchISO = maxCreated;
          }
          // 3회 delta마다(≈30분) ids_only 로 제거된 매물 감지
          window.WS._refreshTickCount = (window.WS._refreshTickCount || 0) + 1;
          if (window.WS._refreshTickCount % 3 === 0) {
            var idsURL = ADMIN_API_MINIMAL.replace(/\?.*$/, '') + '?ids_only=1';
            fetch(idsURL, { headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN } })
              .then(function(r) { return r.ok ? r.json() : null; })
              .then(function(ids) {
                if (!ids || !ids.success || !Array.isArray(ids.data)) return;
                var currentIds = new Set(ids.data.map(function(x) { return x.id; }));
                var removed = (window.WS.allListings || []).filter(function(l) { return !currentIds.has(l.id); });
                if (removed.length > 0) {
                  window.WS.allListings = (window.WS.allListings || []).filter(function(l) { return currentIds.has(l.id); });
                  window.WS._lastListingIds = new Set(window.WS.allListings.map(function(l) { return l.id; }));
                  window.WS.refresh();
                }
              })
              .catch(function() {});
          }
        })
        .catch(function() {
          clearTimeout(tm);
          _refreshFailCount++;
        });
    }, 10 * 60 * 1000); // 10 minutes (기존 5분 → 10분)
  };

  window.WS.stopAutoRefresh = function() {
    if (window.WS._autoRefreshTimer) {
      clearInterval(window.WS._autoRefreshTimer);
      window.WS._autoRefreshTimer = null;
    }
  };

  window.WS._showNewListingBadge = function(count) {
    // Remove existing badge
    var existing = document.getElementById('ws-new-listing-badge');
    if (existing) existing.remove();

    var badge = document.createElement('div');
    badge.id = 'ws-new-listing-badge';
    badge.className = 'ws-new-badge';
    badge.innerHTML = '🆕 새 매물 ' + count + '건이 등록되었습니다!';
    badge.style.cssText = 'position:fixed;top:20px;right:20px;background:#2D5A27;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:100001;cursor:pointer;animation:ws-slide-in 0.5s ease;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    badge.addEventListener('click', function() { badge.remove(); });
    document.body.appendChild(badge);

    // Auto remove after 8 seconds
    setTimeout(function() {
      if (badge.parentElement) {
        badge.style.opacity = '0';
        badge.style.transition = 'opacity 0.5s ease';
        setTimeout(function() { if (badge.parentElement) badge.remove(); }, 500);
      }
    }, 8000);
  };

  // =========================================================
  // K) LIGHTBOX - 이미지 풀스크린 확대 뷰어
  // =========================================================
  window.WS.openLightbox = function(images, startIdx) {
    // Remove existing lightbox
    var existing = document.getElementById('ws-lightbox');
    if (existing) existing.remove();

    var currentIdx = startIdx || 0;
    var overlay = document.createElement('div');
    overlay.id = 'ws-lightbox';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:200000;display:flex;align-items:center;justify-content:center;flex-direction:column;';

    // Close lightbox helper (ensures cleanup)
    function closeLightbox() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentElement) overlay.remove();
    }

    function render() {
      overlay.innerHTML = '' +
        '<div style="position:absolute;top:16px;right:24px;color:#fff;font-size:14px;z-index:200002;">' +
          (currentIdx + 1) + ' / ' + images.length +
        '</div>' +
        '<button data-action="close" style="position:absolute;top:12px;right:60px;background:none;border:none;color:#fff;font-size:32px;cursor:pointer;z-index:200002;padding:8px 12px;">&times;</button>' +
        (images.length > 1 ? '<button data-action="prev" style="position:absolute;left:20px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:36px;cursor:pointer;padding:12px 16px;border-radius:50%;z-index:200002;">&#9664;</button>' : '') +
        '<img src="' + escHtml(images[currentIdx]) + '" style="max-width:90%;max-height:85vh;object-fit:contain;border-radius:4px;box-shadow:0 0 40px rgba(0,0,0,0.5);pointer-events:none;" />' +
        (images.length > 1 ? '<button data-action="next" style="position:absolute;right:20px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:36px;cursor:pointer;padding:12px 16px;border-radius:50%;z-index:200002;">&#9654;</button>' : '') +
        '<div style="margin-top:12px;display:flex;gap:6px;overflow-x:auto;max-width:90%;padding:4px 0;">' +
          images.map(function(img, i) {
            var border = i === currentIdx ? '2px solid #4CAF50' : '2px solid transparent';
            return '<img src="' + escHtml(img) + '" data-action="thumb" data-idx="' + i + '" class="ws-lb-thumb" style="width:60px;height:60px;object-fit:cover;border-radius:4px;cursor:pointer;border:' + border + ';opacity:' + (i === currentIdx ? '1' : '0.6') + ';" />';
          }).join('') +
        '</div>';
    }

    render();

    // Event delegation: single click handler on overlay handles all buttons
    overlay.addEventListener('click', function(e) {
      var target = e.target;
      var action = target.getAttribute('data-action');
      if (!action) {
        // Check parent (in case click lands on text inside button)
        var parent = target.parentElement;
        if (parent) action = parent.getAttribute('data-action');
      }

      if (action === 'close') {
        closeLightbox();
      } else if (action === 'prev') {
        currentIdx = (currentIdx - 1 + images.length) % images.length;
        render();
      } else if (action === 'next') {
        currentIdx = (currentIdx + 1) % images.length;
        render();
      } else if (action === 'thumb') {
        var idx = parseInt(target.getAttribute('data-idx'), 10);
        if (!isNaN(idx)) {
          currentIdx = idx;
          render();
        }
      } else if (target === overlay) {
        // Click on dark background area closes lightbox
        closeLightbox();
      }
    });

    // Touch/swipe support for mobile
    var touchStartX = 0;
    var touchEndX = 0;
    overlay.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].screenX;
    }, {passive: true});
    overlay.addEventListener('touchend', function(e) {
      touchEndX = e.changedTouches[0].screenX;
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          // Swipe left -> next
          currentIdx = (currentIdx + 1) % images.length;
        } else {
          // Swipe right -> prev
          currentIdx = (currentIdx - 1 + images.length) % images.length;
        }
        render();
      }
    }, {passive: true});

    // Keyboard navigation
    function onKey(e) {
      if (!document.getElementById('ws-lightbox')) {
        document.removeEventListener('keydown', onKey);
        return;
      }
      if (e.key === 'Escape') { closeLightbox(); }
      else if (e.key === 'ArrowLeft') { currentIdx = (currentIdx - 1 + images.length) % images.length; render(); }
      else if (e.key === 'ArrowRight') { currentIdx = (currentIdx + 1) % images.length; render(); }
    }
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
  };

  // =========================================================
  // L) URL 파라미터 동기화 - 필터 상태를 URL에 저장/복원
  // =========================================================
  window.WS.saveFilterToURL = function() {
    var s = window.WS.state;
    var params = new URLSearchParams();

    // tab=search 파라미터 항상 보존 (검색 UI 활성 상태 유지)
    var currentParams = new URLSearchParams(window.location.search);
    if (currentParams.has('tab')) params.set('tab', currentParams.get('tab'));

    if (s.typeTabs && s.typeTabs.length > 0) params.set('types', s.typeTabs.join(','));
    else if (s.typeTab && s.typeTab !== '전체') params.set('type', s.typeTab);
    if (s.selectedRegion && s.selectedRegion !== '전국') params.set('region', s.selectedRegion);
    if (s.selectedRegions && s.selectedRegions.length > 0) params.set('districts', s.selectedRegions.join(','));
    if (s.selectedDongs && s.selectedDongs.length > 0) params.set('dongs', s.selectedDongs.join('|'));
    if (s.deals && s.deals.length > 0) params.set('deals', s.deals.join(','));
    if (s.roomCounts && s.roomCounts.length > 0) params.set('rooms', s.roomCounts.join(','));
    if (s.buildingShapes && s.buildingShapes.length > 0) params.set('shapes', s.buildingShapes.join(','));
    if (s.entranceTypes && s.entranceTypes.length > 0) params.set('entrance', s.entranceTypes.join(','));
    if (s.builtAfter) params.set('builtAfter', s.builtAfter);
    if (s.direction && s.direction !== '전체') params.set('dir', s.direction);
    if (s.sortBy && s.sortBy !== 'newest') params.set('sort', s.sortBy);
    if (s.keyword) params.set('q', s.keyword);
    if (s.page > 1) params.set('p', String(s.page));

    // Price filters (correct state property names)
    if (s.minBasePrice) params.set('pMin', s.minBasePrice);
    if (s.maxBasePrice) params.set('pMax', s.maxBasePrice);
    if (s.minDeposit) params.set('dMin', s.minDeposit);
    if (s.maxDeposit) params.set('dMax', s.maxDeposit);
    if (s.minMonthly) params.set('mMin', s.minMonthly);
    if (s.maxMonthly) params.set('mMax', s.maxMonthly);

    var newURL = window.location.pathname;
    var paramStr = params.toString();
    if (paramStr) newURL += '?' + paramStr;

    // Use replaceState to avoid polluting history
    try {
      window.history.replaceState(null, '', newURL);
    } catch(e) { /* Extension context might block this */ }
  };

  window.WS.loadFilterFromURL = function() {
    var params;
    try {
      params = new URLSearchParams(window.location.search);
      if (!params.toString()) return; // No params to load
    } catch(e) { return; }

    var s = window.WS.state;
    if (!s) return;

    try {
      if (params.has('types') && Array.isArray(s.typeTabs)) s.typeTabs = (params.get('types') || '').split(',').filter(Boolean);
      if (params.has('type')) s.typeTab = params.get('type');
      if (params.has('region') && s.activeRegion !== undefined) s.selectedRegion = params.get('region');
      if (params.has('districts') && Array.isArray(s.selectedRegions)) s.selectedRegions = (params.get('districts') || '').split(',').filter(Boolean);
      if (params.has('dongs') && Array.isArray(s.selectedDongs)) s.selectedDongs = (params.get('dongs') || '').split('|').filter(Boolean);
      if (params.has('deals') && Array.isArray(s.deals)) s.deals = (params.get('deals') || '').split(',').filter(Boolean);
      if (params.has('rooms') && Array.isArray(s.roomCounts)) s.roomCounts = (params.get('rooms') || '').split(',').filter(Boolean);
      if (params.has('shapes') && Array.isArray(s.buildingShapes)) s.buildingShapes = (params.get('shapes') || '').split(',').filter(Boolean);
      if (params.has('entrance') && Array.isArray(s.entranceTypes)) s.entranceTypes = (params.get('entrance') || '').split(',').filter(Boolean);
      if (params.has('builtAfter')) s.builtAfter = params.get('builtAfter');
      if (params.has('dir')) s.direction = params.get('dir');
      if (params.has('sort')) s.sortBy = params.get('sort');
      if (params.has('q')) s.keyword = params.get('q');
      if (params.has('p')) s.page = parseInt(params.get('p'), 10) || 1;
      if (params.has('pMin')) s.minBasePrice = params.get('pMin');
      if (params.has('pMax')) s.maxBasePrice = params.get('pMax');
      if (params.has('dMin')) s.minDeposit = params.get('dMin');
      if (params.has('dMax')) s.maxDeposit = params.get('dMax');
      if (params.has('mMin')) s.minMonthly = params.get('mMin');
      if (params.has('mMax')) s.maxMonthly = params.get('mMax');
    } catch(e) { /* URL parameter load error - continue with defaults */ }
  };

  // ========== Section M-1: 매물 통계 대시보드 ==========

  window.WS.showStats = function() {
    var data = window.WS.filtered || [];
    if (data.length === 0) {
      window.WS.showToast('표시할 매물이 없습니다.', 'warning');
      return;
    }

    // Calculate statistics
    var deposits = data.map(function(l) { return parseFloat(l.deposit) || 0; }).filter(function(v) { return v > 0; });
    var monthlies = data.map(function(l) { return parseFloat(l.monthly) || 0; }).filter(function(v) { return v > 0; });
    var areas = data.map(function(l) { return parseFloat(l.area_m2) || 0; }).filter(function(v) { return v > 0; });
    var prices = data.map(function(l) { return parseFloat(l.price) || 0; }).filter(function(v) { return v > 0; });

    function avg(arr) { return arr.length > 0 ? Math.round(arr.reduce(function(a, b) { return a + b; }, 0) / arr.length) : 0; }
    function min(arr) { return arr.length > 0 ? Math.min.apply(null, arr) : 0; }
    function max(arr) { return arr.length > 0 ? Math.max.apply(null, arr) : 0; }
    function median(arr) {
      if (arr.length === 0) return 0;
      var sorted = arr.slice().sort(function(a, b) { return a - b; });
      var mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    // Type distribution
    var typeCounts = {};
    data.forEach(function(l) {
      var t = l.type || '기타';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    // Deal type distribution
    var dealCounts = {};
    data.forEach(function(l) {
      var d = l.deal || '기타';
      dealCounts[d] = (dealCounts[d] || 0) + 1;
    });

    // Region distribution (top 5)
    var regionCounts = {};
    data.forEach(function(l) {
      var addr = l.address || '';
      var parts = addr.split(' ');
      var region = parts.length >= 2 ? parts[0] + ' ' + parts[1] : (parts[0] || '기타');
      regionCounts[region] = (regionCounts[region] || 0) + 1;
    });
    var topRegions = Object.entries(regionCounts).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5);

    function statCard(emoji, label, value, sub) {
      return '<div style="background:#f8f9fa;border-radius:10px;padding:16px;text-align:center;min-width:120px;">' +
        '<div style="font-size:24px;margin-bottom:4px;">' + emoji + '</div>' +
        '<div style="font-size:11px;color:#888;margin-bottom:4px;">' + escHtml(label) + '</div>' +
        '<div style="font-size:18px;font-weight:700;color:#2D5A27;">' + escHtml(value) + '</div>' +
        (sub ? '<div style="font-size:10px;color:#aaa;margin-top:2px;">' + escHtml(sub) + '</div>' : '') +
        '</div>';
    }

    function barChart(items, total, color) {
      var html = '';
      items.forEach(function(item) {
        var pct = total > 0 ? Math.round(item[1] / total * 100) : 0;
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
          '<div style="width:80px;font-size:12px;text-align:right;color:#555;flex-shrink:0;">' + escHtml(item[0]) + '</div>' +
          '<div style="flex:1;background:#e8e8e8;border-radius:4px;height:20px;overflow:hidden;">' +
            '<div style="width:' + pct + '%;background:' + color + ';height:100%;border-radius:4px;min-width:2px;"></div>' +
          '</div>' +
          '<div style="width:50px;font-size:11px;color:#888;">' + item[1] + '건 (' + pct + '%)</div>' +
          '</div>';
      });
      return html;
    }

    var html = '<div style="padding:8px;">';

    // Summary cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px;">';
    html += statCard('🏠', '전체 매물', data.length + '건', '');
    if (deposits.length > 0) html += statCard('💰', '평균 보증금', avg(deposits).toLocaleString() + '만', min(deposits).toLocaleString() + '~' + max(deposits).toLocaleString() + '만');
    if (monthlies.length > 0) html += statCard('📅', '평균 월세', avg(monthlies).toLocaleString() + '만', min(monthlies).toLocaleString() + '~' + max(monthlies).toLocaleString() + '만');
    if (prices.length > 0) html += statCard('🏷️', '평균 매매가', avg(prices).toLocaleString() + '만', min(prices).toLocaleString() + '~' + max(prices).toLocaleString() + '만');
    if (areas.length > 0) html += statCard('📐', '평균 면적', avg(areas) + 'm²', (avg(areas) / 3.30579).toFixed(1) + '평');
    html += '</div>';

    // Type distribution chart
    var typeItems = Object.entries(typeCounts).sort(function(a, b) { return b[1] - a[1]; });
    html += '<div style="margin-bottom:20px;">';
    html += '<h3 style="font-size:14px;color:#333;margin-bottom:10px;">📊 매물 유형별 분포</h3>';
    html += barChart(typeItems, data.length, '#4CAF50');
    html += '</div>';

    // Deal type chart
    var dealItems = Object.entries(dealCounts).sort(function(a, b) { return b[1] - a[1]; });
    html += '<div style="margin-bottom:20px;">';
    html += '<h3 style="font-size:14px;color:#333;margin-bottom:10px;">💼 거래 유형별 분포</h3>';
    html += barChart(dealItems, data.length, '#2D5A27');
    html += '</div>';

    // Top regions
    if (topRegions.length > 0) {
      html += '<div style="margin-bottom:20px;">';
      html += '<h3 style="font-size:14px;color:#333;margin-bottom:10px;">📍 지역별 분포 (TOP 5)</h3>';
      html += barChart(topRegions, data.length, '#FF9800');
      html += '</div>';
    }

    // Price range table
    if (deposits.length > 0) {
      html += '<div style="margin-bottom:12px;">';
      html += '<h3 style="font-size:14px;color:#333;margin-bottom:10px;">📈 보증금 분포 상세</h3>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<tr style="background:#2D5A27;color:#fff;"><td style="padding:6px 10px;">구분</td><td style="padding:6px 10px;">최소</td><td style="padding:6px 10px;">최대</td><td style="padding:6px 10px;">평균</td><td style="padding:6px 10px;">중앙값</td></tr>';
      html += '<tr style="background:#f8f9fa;"><td style="padding:6px 10px;">보증금</td><td style="padding:6px 10px;">' + min(deposits).toLocaleString() + '만</td><td style="padding:6px 10px;">' + max(deposits).toLocaleString() + '만</td><td style="padding:6px 10px;">' + avg(deposits).toLocaleString() + '만</td><td style="padding:6px 10px;">' + median(deposits).toLocaleString() + '만</td></tr>';
      if (monthlies.length > 0) html += '<tr><td style="padding:6px 10px;">월세</td><td style="padding:6px 10px;">' + min(monthlies).toLocaleString() + '만</td><td style="padding:6px 10px;">' + max(monthlies).toLocaleString() + '만</td><td style="padding:6px 10px;">' + avg(monthlies).toLocaleString() + '만</td><td style="padding:6px 10px;">' + median(monthlies).toLocaleString() + '만</td></tr>';
      html += '</table>';
      html += '</div>';
    }

    html += '</div>';

    // Show in modal (reuse compare modal approach)
    var modal = document.getElementById('ws-modal-stats');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ws-modal-stats';
      modal.className = 'ws-modal';
      modal.style.display = 'none';
      modal.innerHTML = '<div class="ws-modal-content" style="max-width:700px;">' +
        '<button class="ws-modal-close">&times;</button>' +
        '<h2 style="color:#2D5A27;margin-bottom:16px;">📊 매물 통계 대시보드</h2>' +
        '<div id="ws-stats-container"></div>' +
        '</div>';
      (document.querySelector('.ws-search-container') || document.body).appendChild(modal);
      modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.style.display = 'none'; });
      modal.addEventListener('click', function(e) { if (e.target === modal) modal.style.display = 'none'; });
    }
    document.getElementById('ws-stats-container').innerHTML = html;
    modal.style.display = 'flex';
  };

  // ========== Section M-2: 카카오톡 공유용 텍스트 생성 ==========

  window.WS.generateShareText = function() {
    var selectedIds = Array.from(window.WS.state.selectedIds || []);
    if (selectedIds.length === 0) {
      window.WS.showToast('공유할 매물을 선택해주세요.', 'warning');
      return;
    }

    var allData = window.WS.allListings || [];
    var selected = [];
    selectedIds.forEach(function(id) {
      var found = allData.find(function(l) { return String(l.id) === String(id); });
      if (found) selected.push(found);
    });

    if (selected.length === 0) return;

    var text = '🏠 WISHES 매물 안내\n';
    text += '━━━━━━━━━━━━━━\n\n';

    selected.forEach(function(l, i) {
      text += '📌 ' + (i + 1) + '. ' + (l.title || '-') + '\n';
      // Price info
      if (l.deal === '월세' || l.monthly) {
        text += '💰 ' + (l.deposit || 0) + '/' + (l.monthly || 0) + '만원 (월세)\n';
      } else if (l.deal === '전세') {
        text += '💰 전세 ' + (l.deposit || 0) + '만원\n';
      } else if (l.price) {
        text += '💰 매매 ' + (Number(l.price) >= 10000 ? (l.price / 10000).toFixed(1) + '억' : l.price + '만') + '원\n';
      }
      // Area
      if (l.area_m2) text += '📐 ' + l.area_m2 + 'm² (' + (l.area_m2 / 3.30579).toFixed(1) + '평)\n';
      // Floor
      if (l.floor_current) text += '🏢 ' + l.floor_current + '/' + (l.floor_total || '?') + '층\n';
      // Rooms
      if (l.rooms) text += '🚪 ' + l.rooms + '방 ' + (l.bathrooms || '') + '욕실\n';
      // Address
      if (l.address) text += '📍 ' + l.address + '\n';
      // Options
      var opts = [];
      if (l.parking && l.parking !== '0') opts.push('주차');
      if (l.elevator) opts.push('EV');
      if (l.full_option) opts.push('풀옵션');
      if (l.balcony) opts.push('발코니');
      if (opts.length > 0) text += '✅ ' + opts.join(' · ') + '\n';
      text += '\n';
    });

    text += '━━━━━━━━━━━━━━\n';
    text += '🌿 WISHES 부동산 | wishes.co.kr\n';
    text += '📞 상담 및 문의 환영합니다';

    // Copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        window.WS.showToast('카카오톡 공유 텍스트가 복사되었습니다! 💬', 'success');
      }).catch(function() {
        window.WS._fallbackCopy(text);
      });
    } else {
      window.WS._fallbackCopy(text);
    }
  };

  window.WS._fallbackCopy = function(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      window.WS.showToast('카카오톡 공유 텍스트가 복사되었습니다! 💬', 'success');
    } catch(e) {
      window.WS.showToast('복사에 실패했습니다. 직접 복사해주세요.', 'warning');
    }
    document.body.removeChild(ta);
  };

  // ========== Section M-3: Search History ==========

  window.WS._getSearchHistory = function() {
    try {
      var saved = localStorage.getItem('ws-search-history');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  };

  window.WS._saveSearchHistory = function(list) {
    try {
      _safeSetItem('ws-search-history', JSON.stringify(list));
    } catch(e) { /* storage full or blocked */ }
  };

  window.WS._getCurrentFilterSnapshot = function() {
    var s = window.WS.state;
    return {
      typeTab: s.typeTab || '전체',
      typeTabs: (s.typeTabs || []).slice(),
      selectedRegion: s.selectedRegion || '전국',
      selectedRegions: (s.selectedRegions || []).slice(),
      selectedDongs: (s.selectedDongs || []).slice(),
      deals: (s.deals || []).slice(),
      roomCounts: (s.roomCounts || []).slice(),
      buildingShapes: (s.buildingShapes || []).slice(),
      entranceTypes: (s.entranceTypes || []).slice(),
      builtAfter: s.builtAfter || '',
      direction: s.direction || '전체',
      sortBy: s.sortBy || 'newest',
      keyword: s.keyword || '',
      minBasePrice: s.minBasePrice || '',
      maxBasePrice: s.maxBasePrice || '',
      minDeposit: s.minDeposit || '',
      maxDeposit: s.maxDeposit || ''
    };
  };

  window.WS._describeFilter = function(snap) {
    var parts = [];
    if (snap.typeTabs && snap.typeTabs.length > 0) parts.push(snap.typeTabs.join('/'));
    else if (snap.typeTab && snap.typeTab !== '전체') parts.push(snap.typeTab);
    if (snap.selectedRegion && snap.selectedRegion !== '전국') parts.push(snap.selectedRegion);
    if (snap.selectedRegions && snap.selectedRegions.length > 0) parts.push(snap.selectedRegions.join('/'));
    if (snap.deals && snap.deals.length > 0) parts.push(snap.deals.join('/'));
    if (snap.roomCounts && snap.roomCounts.length > 0) parts.push(snap.roomCounts.join('/'));
    if (snap.keyword) parts.push('"' + snap.keyword + '"');
    if (snap.minDeposit || snap.maxDeposit) parts.push('보증금 ' + (snap.minDeposit || '0') + '~' + (snap.maxDeposit || '∞'));
    if (snap.minBasePrice || snap.maxBasePrice) parts.push('월세 ' + (snap.minBasePrice || '0') + '~' + (snap.maxBasePrice || '∞'));
    return parts.length > 0 ? parts.join(' · ') : '필터 없음';
  };

  window.WS.saveSearchHistory = function(name) {
    var snap = window.WS._getCurrentFilterSnapshot();
    var list = window.WS._getSearchHistory();
    var entry = {
      id: Date.now(),
      name: name || window.WS._describeFilter(snap),
      filters: snap,
      date: new Date().toLocaleString('ko-KR'),
      resultCount: (window.WS.filtered || []).length
    };
    // Add to beginning
    list.unshift(entry);
    // Max 10 entries
    if (list.length > 10) list = list.slice(0, 10);
    window.WS._saveSearchHistory(list);
    return entry;
  };

  window.WS.loadSearchHistory = function(entry) {
    if (!entry || !entry.filters) return;
    var s = window.WS.state;
    var f = entry.filters;
    s.typeTab = f.typeTab || '전체';
    s.selectedRegion = f.selectedRegion || '전국';
    s.selectedRegions = (f.selectedRegions || []).slice();
    s.selectedDongs = (f.selectedDongs || []).slice();
    s.deals = (f.deals || []).slice();
    s.roomCounts = (f.roomCounts || []).slice();
    s.buildingShapes = (f.buildingShapes || []).slice();
    s.entranceTypes = (f.entranceTypes || []).slice();
    s.builtAfter = f.builtAfter || '';
    s.direction = f.direction || '전체';
    s.sortBy = f.sortBy || 'newest';
    s.keyword = f.keyword || '';
    s.minBasePrice = f.minBasePrice || '';
    s.maxBasePrice = f.maxBasePrice || '';
    s.minDeposit = f.minDeposit || '';
    s.maxDeposit = f.maxDeposit || '';
    s.page = 1;
    // Update keyword input if exists
    var kwInput = document.getElementById('ws-keyword');
    if (kwInput) kwInput.value = s.keyword;
    // Close history modal
    var modal = document.getElementById('ws-modal-history');
    if (modal) modal.style.display = 'none';
    // Refresh
    window.WS.refresh();
    window.WS.showToast('필터가 복원되었습니다: ' + (entry.name || ''));
  };

  window.WS.deleteSearchHistory = function(id) {
    var list = window.WS._getSearchHistory();
    list = list.filter(function(e) { return e.id !== id; });
    window.WS._saveSearchHistory(list);
    window.WS.renderSearchHistory();
  };

  window.WS.renderSearchHistory = function() {
    var container = document.getElementById('ws-history-list');
    if (!container) return;
    var list = window.WS._getSearchHistory();

    if (list.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#aaa;"><div style="font-size:32px;margin-bottom:8px;">📭</div><div>저장된 검색 히스토리가 없습니다</div><div style="font-size:12px;margin-top:4px;">위에서 현재 필터 조합에 이름을 지정하고 저장하세요</div></div>';
      return;
    }

    var html = '';
    list.forEach(function(entry) {
      var desc = window.WS._describeFilter(entry.filters);
      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:8px;background:#f8f9fa;border-radius:8px;border-left:3px solid #2D5A27;">';
      html += '<div style="flex:1;cursor:pointer;" data-history-load="' + entry.id + '">';
      html += '<div style="font-weight:600;font-size:14px;color:#333;margin-bottom:4px;">' + escHtml(entry.name) + '</div>';
      html += '<div style="font-size:11px;color:#888;">' + escHtml(desc) + '</div>';
      html += '<div style="font-size:11px;color:#aaa;margin-top:2px;">' + escHtml(entry.date) + ' · 결과 ' + (entry.resultCount || 0) + '건</div>';
      html += '</div>';
      html += '<button data-history-delete="' + entry.id + '" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">삭제</button>';
      html += '</div>';
    });
    container.innerHTML = html;

    // Event delegation (prevents memory leaks on re-render)
    if (!container._delegated) {
      container._delegated = true;
      container.addEventListener('click', function(e) {
        var loadEl = e.target.closest('[data-history-load]');
        if (loadEl) {
          var id = parseInt(loadEl.getAttribute('data-history-load'), 10);
          var list = window.WS._getSearchHistory();
          var entry = list.find(function(en) { return en.id === id; });
          if (entry) window.WS.loadSearchHistory(entry);
          return;
        }
        var delEl = e.target.closest('[data-history-delete]');
        if (delEl) {
          e.stopPropagation();
          var id = parseInt(delEl.getAttribute('data-history-delete'), 10);
          window.WS.deleteSearchHistory(id);
        }
      });
    }
  };

  window.WS.showSearchHistory = function() {
    var modal = document.getElementById('ws-modal-history');
    if (!modal) return;
    modal.style.display = 'flex';
    window.WS.renderSearchHistory();
    // Close handlers
    var closeBtn = modal.querySelector('.ws-modal-close');
    if (closeBtn) {
      closeBtn.onclick = function() { modal.style.display = 'none'; };
    }
    modal.addEventListener('click', function handler(e) {
      if (e.target === modal) {
        modal.style.display = 'none';
        modal.removeEventListener('click', handler);
      }
    });
    // Save button
    var saveBtn = document.getElementById('ws-history-save-btn');
    var nameInput = document.getElementById('ws-history-name');
    if (saveBtn && !saveBtn._bound) {
      saveBtn._bound = true;
      saveBtn.addEventListener('click', function() {
        var name = nameInput ? nameInput.value.trim() : '';
        window.WS.saveSearchHistory(name);
        if (nameInput) nameInput.value = '';
        window.WS.renderSearchHistory();
        window.WS.showToast('현재 필터 조합이 저장되었습니다');
      });
    }
  };

  // ========== Section N: 고객별 매물 폴더 ==========
  window.WS._getCustomerFolders = function() {
    try { return JSON.parse(localStorage.getItem('ws_customer_folders') || '[]'); } catch(e) { return []; }
  };
  window.WS._saveCustomerFolders = function(folders) {
    _safeSetItem('ws_customer_folders', JSON.stringify(folders));
  };

  window.WS.showCustomerFolders = function() {
    var modal = document.getElementById('ws-modal-customer');
    if (!modal) return;
    modal.style.display = 'flex';
    window.WS.renderCustomerFolders();
    // Close handler
    var closeBtn = modal.querySelector('.ws-modal-close');
    if (closeBtn) closeBtn.onclick = function() { modal.style.display = 'none'; };
    modal.addEventListener('click', function handler(e) {
      if (e.target === modal) { modal.style.display = 'none'; modal.removeEventListener('click', handler); }
    });
    // Add folder button
    var addBtn = document.getElementById('ws-customer-add-btn');
    var nameInput = document.getElementById('ws-customer-name');
    if (addBtn && !addBtn._bound) {
      addBtn._bound = true;
      addBtn.addEventListener('click', function() {
        var name = nameInput ? nameInput.value.trim() : '';
        if (!name) { window.WS.showToast('고객명을 입력해주세요'); return; }
        var folders = window.WS._getCustomerFolders();
        folders.push({ id: Date.now(), name: name, items: [], created: new Date().toLocaleDateString('ko-KR') });
        window.WS._saveCustomerFolders(folders);
        if (nameInput) nameInput.value = '';
        window.WS.renderCustomerFolders();
        window.WS.showToast(name + ' 폴더가 생성되었습니다');
      });
    }
  };

  window.WS.addToCustomerFolder = function(folderId) {
    var selectedIds = Array.from(window.WS.state.selectedIds || []);
    if (selectedIds.length === 0) { window.WS.showToast('먼저 매물을 선택해주세요'); return; }
    var allListings = window.WS.allListings || [];
    var sel = allListings.filter(function(l) { return selectedIds.some(function(sid) { return String(sid) === String(l.id); }); });
    if (sel.length === 0) { window.WS.showToast('선택된 매물 데이터를 찾을 수 없습니다'); return; }
    var folders = window.WS._getCustomerFolders();
    var folder = folders.find(function(f) { return f.id === folderId; });
    if (!folder) return;
    var added = 0;
    sel.forEach(function(item) {
      var itemId = String(item.id);
      var exists = folder.items.find(function(i) { return String(i.id) === itemId; });
      if (!exists) { folder.items.push({ id: itemId, name: item.title || item.address || '매물', price: (item.deposit || item.price || '') + '', address: item.address || '', added: new Date().toLocaleDateString('ko-KR') }); added++; }
    });
    window.WS._saveCustomerFolders(folders);
    window.WS.renderCustomerFolders();
    window.WS.showToast(added + '건 매물이 추가되었습니다');
  };

  window.WS.deleteCustomerFolder = function(folderId) {
    var folders = window.WS._getCustomerFolders();
    folders = folders.filter(function(f) { return f.id !== folderId; });
    window.WS._saveCustomerFolders(folders);
    window.WS.renderCustomerFolders();
    window.WS.showToast('폴더가 삭제되었습니다');
  };

  window.WS.removeFromFolder = function(folderId, itemId) {
    var folders = window.WS._getCustomerFolders();
    var folder = folders.find(function(f) { return f.id === folderId; });
    if (folder) {
      folder.items = folder.items.filter(function(i) { return String(i.id) !== String(itemId); });
      window.WS._saveCustomerFolders(folders);
      window.WS.renderCustomerFolders();
    }
  };

  window.WS.renderCustomerFolders = function() {
    var container = document.getElementById('ws-customer-list');
    if (!container) return;
    var folders = window.WS._getCustomerFolders();
    if (folders.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#aaa;"><div style="font-size:32px;margin-bottom:8px;">📂</div><div>생성된 고객 폴더가 없습니다</div><div style="font-size:12px;margin-top:4px;">위에서 고객명을 입력하고 폴더를 생성하세요</div></div>';
      return;
    }
    var html = '';
    folders.forEach(function(folder) {
      html += '<div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:12px;overflow:hidden;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f0fdf4;border-bottom:1px solid #e2e8f0;">';
      html += '<div><span style="font-weight:700;font-size:14px;color:#2D5A27;">👤 ' + escHtml(folder.name) + '</span>';
      html += '<span style="font-size:11px;color:#888;margin-left:8px;">매물 ' + folder.items.length + '건 · 생성: ' + escHtml(folder.created) + '</span></div>';
      html += '<div style="display:flex;gap:6px;">';
      html += '<button data-folder-add="' + folder.id + '" style="padding:4px 10px;background:#2D5A27;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">➕선택추가</button>';
      html += '<button data-folder-pref="' + folder.id + '" style="padding:4px 10px;background:#7c3aed;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">🎯선호조건</button>';
      html += '<button data-folder-share="' + folder.id + '" style="padding:4px 10px;background:#FFA000;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">💬카톡전송</button>';
      html += '<button data-folder-del="' + folder.id + '" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">🗑삭제</button>';
      html += '</div></div>';
      if (folder.items.length > 0) {
        html += '<div style="padding:8px 12px;">';
        folder.items.forEach(function(item) {
          html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #f1f1f1;font-size:12px;">';
          html += '<div style="flex:1;"><span style="font-weight:600;color:#333;">' + escHtml(item.name) + '</span>';
          html += ' <span style="color:#888;">' + escHtml(item.address || '') + '</span></div>';
          html += '<span style="color:#2D5A27;font-weight:600;white-space:nowrap;">' + escHtml(item.price || '') + '</span>';
          html += '<button data-folder-remove="' + folder.id + '|' + item.id + '" style="padding:2px 6px;background:#fed7d7;color:#e53e3e;border:none;border-radius:3px;font-size:10px;cursor:pointer;">✕</button>';
          html += '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    container.innerHTML = html;

    // Event delegation (prevents memory leaks on re-render)
    if (!container._delegated) {
      container._delegated = true;
      container.addEventListener('click', function(e) {
        var addEl = e.target.closest('[data-folder-add]');
        if (addEl) { window.WS.addToCustomerFolder(parseInt(addEl.getAttribute('data-folder-add'), 10)); return; }
        var prefEl = e.target.closest('[data-folder-pref]');
        if (prefEl) { window.WS.showSetPreference(parseInt(prefEl.getAttribute('data-folder-pref'), 10)); return; }
        var delEl = e.target.closest('[data-folder-del]');
        if (delEl) { if (confirm('이 폴더를 삭제하시겠습니까?')) window.WS.deleteCustomerFolder(parseInt(delEl.getAttribute('data-folder-del'), 10)); return; }
        var shareEl = e.target.closest('[data-folder-share]');
        if (shareEl) { window.WS.shareFolderToKakao(parseInt(shareEl.getAttribute('data-folder-share'), 10)); return; }
        var removeEl = e.target.closest('[data-folder-remove]');
        if (removeEl) { var parts = removeEl.getAttribute('data-folder-remove').split('|'); window.WS.removeFromFolder(parseInt(parts[0], 10), parts[1]); }
      });
    }
  };

  // 고객 폴더 카카오톡 공유
  window.WS.shareFolderToKakao = function(folderId) {
    var folders = window.WS._getCustomerFolders();
    var folder = folders.find(function(f) { return f.id === folderId; });
    if (!folder || folder.items.length === 0) {
      window.WS.showToast('폴더에 매물이 없습니다');
      return;
    }
    var text = '🏠 WISHES 매물 브리핑\n';
    text += '━━━━━━━━━━━━━━\n';
    text += '👤 고객: ' + folder.name + '\n';
    text += '📅 ' + new Date().toLocaleDateString('ko-KR') + '\n';
    text += '━━━━━━━━━━━━━━\n\n';
    folder.items.forEach(function(item, idx) {
      text += '📌 ' + (idx + 1) + '. ' + (item.name || '매물') + '\n';
      if (item.address) text += '📍 ' + item.address + '\n';
      if (item.price) text += '💰 ' + item.price + '\n';
      text += '\n';
    });
    text += '━━━━━━━━━━━━━━\n';
    text += '총 ' + folder.items.length + '건 · WISHES 부동산\n';
    text += '🔗 wishes.co.kr';

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        window.WS.showToast(folder.name + ' 폴더 매물이 복사되었습니다! 💬');
      }).catch(function() { window.WS._fallbackCopy(text); });
    } else {
      window.WS._fallbackCopy(text);
      window.WS.showToast(folder.name + ' 폴더 매물이 복사되었습니다! 💬');
    }
  };

  // ========== Section O: 건물별 그룹핑 ==========
  window.WS.showBuildingGroups = function() {
    var modal = document.getElementById('ws-modal-building');
    if (!modal) return;
    modal.style.display = 'flex';
    // Close handler
    var closeBtn = modal.querySelector('.ws-modal-close');
    if (closeBtn) closeBtn.onclick = function() { modal.style.display = 'none'; };
    modal.addEventListener('click', function handler(e) {
      if (e.target === modal) { modal.style.display = 'none'; modal.removeEventListener('click', handler); }
    });

    var container = document.getElementById('ws-building-container');
    if (!container) return;
    var items = window.WS.filtered || window.WS.allListings || [];
    if (items.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;">표시할 매물 데이터가 없습니다</div>'; return; }

    // Group by address (extract building/dong)
    var groups = {};
    items.forEach(function(item) {
      var key = item.address || item.dong || '기타';
      // Try to extract building name from address
      var parts = key.split(' ');
      if (parts.length > 2) key = parts.slice(0, 3).join(' ');
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    var sortedKeys = Object.keys(groups).sort(function(a, b) { return groups[b].length - groups[a].length; });

    var html = '<div style="margin-bottom:12px;font-size:13px;color:#666;">총 <strong>' + sortedKeys.length + '개</strong> 건물/그룹 · 매물 <strong>' + items.length + '건</strong></div>';
    sortedKeys.forEach(function(key) {
      var group = groups[key];
      var prices = group.map(function(g) {
        var p = g.deposit || g.price || 0;
        return typeof p === 'string' ? (parseFloat(p.replace(/[^0-9.]/g, '')) || 0) : (p || 0);
      }).filter(function(p) { return p > 0; });
      var avgPrice = prices.length > 0 ? Math.round(prices.reduce(function(a, b) { return a + b; }, 0) / prices.length) : 0;

      html += '<div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px;overflow:hidden;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f7fafc;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">';
      html += '<div><span style="font-weight:700;font-size:14px;color:#2D5A27;">🏢 ' + escHtml(key) + '</span>';
      html += '<span style="font-size:12px;color:#888;margin-left:8px;">' + group.length + '건</span></div>';
      if (avgPrice > 0) html += '<span style="font-size:12px;color:#2D5A27;font-weight:600;">평균 ' + avgPrice.toLocaleString() + '만</span>';
      html += '</div>';
      html += '<div style="display:none;padding:8px 12px;border-top:1px solid #e2e8f0;">';
      group.forEach(function(item) {
        var floorText = item.floor_current ? item.floor_current + '/' + (item.floor_total || '?') + '층' : '';
        var areaText = item.area_m2 ? item.area_m2 + 'm²' : '';
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #f5f5f5;font-size:12px;">';
        html += '<span style="color:#555;flex:1;">' + escHtml(item.title || item.type || '매물') + (floorText ? ' · ' + escHtml(floorText) : '') + '</span>';
        html += '<span style="color:#2D5A27;font-weight:600;white-space:nowrap;">' + escHtml(String(item.deposit || item.price || '-')) + '</span>';
        html += '<span style="font-size:11px;color:#888;">' + escHtml(areaText) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    });
    container.innerHTML = html;
  };

  // ========== Section P: 매물 상태 변경 추적 ==========
  window.WS._getChangeLog = function() {
    try { return JSON.parse(localStorage.getItem('ws_changelog') || '[]'); } catch(e) { return []; }
  };
  window.WS._saveChangeLog = function(log) {
    // Keep max 200 entries
    if (log.length > 200) log = log.slice(-200);
    _safeSetItem('ws_changelog', JSON.stringify(log));
  };
  window.WS._getSnapshot = function() {
    try { return JSON.parse(localStorage.getItem('ws_data_snapshot') || '{}'); } catch(e) { return {}; }
  };
  window.WS._saveSnapshot = function(snapshot) {
    _safeSetItem('ws_data_snapshot', JSON.stringify(snapshot));
  };

  window.WS.trackChanges = function(newData) {
    if (!newData || !Array.isArray(newData) || newData.length === 0) return;
    var snapshot = window.WS._getSnapshot();
    var log = window.WS._getChangeLog();
    var now = new Date().toLocaleString('ko-KR');
    var changes = [];

    newData.forEach(function(item) {
      var id = String(item.id || '');
      if (!id) return;
      var old = snapshot[id];
      var itemName = item.title || item.address || '매물';
      var currentPrice = String(item.deposit || item.price || '');
      var currentStatus = item.status || '';
      if (!old) {
        // New listing
        changes.push({ type: 'new', id: id, name: itemName, price: currentPrice, date: now });
      } else {
        // Check price change
        if (old.price && currentPrice && old.price !== currentPrice) {
          changes.push({ type: 'price', id: id, name: itemName, oldPrice: old.price, newPrice: currentPrice, date: now });
        }
        // Check status change
        if (old.status && currentStatus && old.status !== currentStatus) {
          changes.push({ type: 'status', id: id, name: itemName, oldStatus: old.status, newStatus: currentStatus, date: now });
        }
      }
      // Update snapshot
      snapshot[id] = { price: currentPrice, status: currentStatus, name: itemName };
    });

    // Check removed listings
    var newIds = {};
    newData.forEach(function(item) {
      var id = String(item.id || '');
      if (id) newIds[id] = true;
    });
    Object.keys(snapshot).forEach(function(id) {
      if (!newIds[id]) {
        changes.push({ type: 'removed', id: id, name: snapshot[id].name || '매물', date: now });
        delete snapshot[id];
      }
    });

    if (changes.length > 0) {
      log = log.concat(changes);
      window.WS._saveChangeLog(log);

      // ★ 즐겨찾기 매물 가격변동 알림 ★
      var favIds = (window.WS.state && window.WS.state.favorites) ? window.WS.state.favorites.map(String) : [];
      if (favIds.length > 0) {
        var favChanges = changes.filter(function(c) {
          return favIds.indexOf(String(c.id)) !== -1 && (c.type === 'price' || c.type === 'status' || c.type === 'removed');
        });
        if (favChanges.length > 0) {
          var alertLines = favChanges.map(function(c) {
            if (c.type === 'price') return '💰 ' + (c.name || '매물') + ': ' + c.oldPrice + '→' + c.newPrice;
            if (c.type === 'status') return '📋 ' + (c.name || '매물') + ': ' + c.oldStatus + '→' + c.newStatus;
            if (c.type === 'removed') return '❌ ' + (c.name || '매물') + ': 삭제됨';
            return '';
          });
          // 팝업 알림
          setTimeout(function() {
            window.WS._showFavAlert(favChanges, alertLines);
          }, 1000);
        }
      }
    }
    window.WS._saveSnapshot(snapshot);

    // ★★★ 새 매물 자동 AI 생성 트리거 ★★★
    // 새로 등록된 매물에 건축물대장 조회 + AI 제목/설명/SEO 자동 생성
    var newListings = changes.filter(function(c) { return c.type === 'new'; });
    if (newListings.length > 0) {
      newListings.forEach(function(nl, idx) {
        var listing = newData.find(function(l) { return String(l.id) === String(nl.id); });
        if (!listing) return;
        // 이미 제목/설명이 AI로 생성된 경우 스킵 (description에 특정 패턴 있으면)
        if (listing.description && listing.description.length > 100) return;
        // 순차 처리 (API 부하 방지): 3초 간격
        setTimeout(function() {
          window.WS._autoGenerateForNewListing(listing);
        }, (idx + 1) * 3000);
      });
      if (newListings.length > 0) {
        showToast('새 매물 ' + newListings.length + '건 감지 → AI 자동 생성 시작', 'info');
      }
    }

    return changes;
  };

  // 즐겨찾기 매물 변동 팝업 알림
  window.WS._showFavAlert = function(favChanges, alertLines) {
    var existing = document.getElementById('ws-fav-alert');
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.id = 'ws-fav-alert';
    div.style.cssText = 'position:fixed;top:60px;right:20px;width:340px;background:#fff;border:2px solid #ed8936;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);z-index:100010;animation:ws-slide-in 0.3s ease;overflow:hidden;';
    var html = '<div style="background:linear-gradient(135deg,#ed8936,#dd6b20);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">';
    html += '<div style="font-weight:700;font-size:14px;">⭐ 관심매물 변동 알림</div>';
    html += '<button id="ws-fav-alert-close" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;">&times;</button>';
    html += '</div>';
    html += '<div style="padding:12px 16px;max-height:200px;overflow-y:auto;">';
    alertLines.forEach(function(line) {
      html += '<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333;">' + line + '</div>';
    });
    html += '</div>';
    html += '<div style="padding:8px 16px;background:#fffbf0;text-align:right;">';
    html += '<span style="font-size:11px;color:#999;">' + favChanges.length + '건 변동 감지 · ' + new Date().toLocaleTimeString('ko-KR') + '</span>';
    html += '</div>';
    div.innerHTML = html;
    document.body.appendChild(div);

    div.querySelector('#ws-fav-alert-close').addEventListener('click', function() { div.remove(); });
    // 15초 후 자동 닫힘
    setTimeout(function() { if (div.parentElement) { div.style.opacity = '0'; div.style.transition = 'opacity 0.5s'; setTimeout(function() { if (div.parentElement) div.remove(); }, 500); } }, 15000);
  };

  window.WS.showChangelog = function() {
    var modal = document.getElementById('ws-modal-changelog');
    if (!modal) return;
    modal.style.display = 'flex';
    // Close handler
    var closeBtn = modal.querySelector('.ws-modal-close');
    if (closeBtn) closeBtn.onclick = function() { modal.style.display = 'none'; };
    modal.addEventListener('click', function handler(e) {
      if (e.target === modal) { modal.style.display = 'none'; modal.removeEventListener('click', handler); }
    });

    var container = document.getElementById('ws-changelog-container');
    if (!container) return;
    var log = window.WS._getChangeLog();

    if (log.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#aaa;"><div style="font-size:32px;margin-bottom:8px;">📊</div><div>변동 이력이 없습니다</div><div style="font-size:12px;margin-top:4px;">매물 데이터가 갱신되면 자동으로 추적됩니다</div></div>';
      return;
    }

    var typeLabels = { 'new': '🆕 신규', 'price': '💰 가격변경', 'status': '📋 상태변경', 'removed': '❌ 삭제' };
    var typeColors = { 'new': '#48bb78', 'price': '#ed8936', 'status': '#4299e1', 'removed': '#e53e3e' };

    // Show recent first, limit 50
    var recent = log.slice(-50).reverse();
    var html = '<div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">';
    html += '<span style="font-size:12px;color:#888;">최근 변동 ' + recent.length + '건 (전체 ' + log.length + '건)</span>';
    html += '<button id="ws-changelog-clear" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">이력초기화</button>';
    html += '</div>';

    recent.forEach(function(entry) {
      var color = typeColors[entry.type] || '#888';
      var label = typeLabels[entry.type] || entry.type;
      html += '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;margin-bottom:6px;background:#fafafa;border-radius:8px;border-left:3px solid ' + color + ';">';
      html += '<div style="min-width:80px;"><span style="font-size:11px;font-weight:700;color:' + color + ';">' + label + '</span></div>';
      html += '<div style="flex:1;">';
      html += '<div style="font-weight:600;font-size:13px;color:#333;">' + escHtml(entry.name) + '</div>';
      if (entry.type === 'price') {
        html += '<div style="font-size:12px;color:#888;margin-top:2px;">' + escHtml(entry.oldPrice) + ' → <span style="color:#e53e3e;font-weight:600;">' + escHtml(entry.newPrice) + '</span></div>';
      } else if (entry.type === 'status') {
        html += '<div style="font-size:12px;color:#888;margin-top:2px;">' + escHtml(entry.oldStatus) + ' → <span style="font-weight:600;">' + escHtml(entry.newStatus) + '</span></div>';
      }
      html += '<div style="font-size:10px;color:#bbb;margin-top:3px;">' + escHtml(entry.date) + '</div>';
      html += '</div></div>';
    });
    container.innerHTML = html;

    // Clear button
    var clearBtn = document.getElementById('ws-changelog-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (confirm('모든 변동 이력을 초기화하시겠습니까?')) {
          window.WS._saveChangeLog([]);
          window.WS._saveSnapshot({});
          window.WS.showChangelog();
          window.WS.showToast('변동 이력이 초기화되었습니다');
        }
      });
    }
  };

  // ========== Section Q: 매물 알림 설정 ==========
  window.WS._getAlerts = function() {
    try { return JSON.parse(localStorage.getItem('ws_alerts') || '[]'); } catch(e) { return []; }
  };
  window.WS._saveAlerts = function(alerts) {
    _safeSetItem('ws_alerts', JSON.stringify(alerts));
  };

  window.WS._showAlertNotification = function(count) {
    var existing = document.getElementById('ws-alert-badge');
    if (existing) existing.remove();
    var badge = document.createElement('div');
    badge.id = 'ws-alert-badge';
    badge.style.cssText = 'position:fixed;top:80px;right:20px;background:#e53e3e;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);cursor:pointer;animation:ws-pulse 2s infinite;';
    badge.innerHTML = '🔔 알림 조건 매칭 ' + count + '건';
    badge.addEventListener('click', function() { badge.remove(); });
    document.body.appendChild(badge);
    // Auto dismiss after 8s
    setTimeout(function() { if (badge.parentNode) badge.remove(); }, 8000);
  };

  // ========== Section R: 알림 설정 UI ==========
  window.WS.showAlertSettings = function() {
    var modal = document.getElementById('ws-modal-alerts');
    if (!modal) return;
    modal.style.display = 'flex';
    window.WS.renderAlertList();
    // Close handler
    var closeBtn = modal.querySelector('.ws-modal-close');
    if (closeBtn) closeBtn.onclick = function() { modal.style.display = 'none'; };
    modal.addEventListener('click', function handler(e) {
      if (e.target === modal) { modal.style.display = 'none'; modal.removeEventListener('click', handler); }
    });
    // Add alert button
    var addBtn = document.getElementById('ws-alert-add-btn');
    if (addBtn && !addBtn._bound) {
      addBtn._bound = true;
      addBtn.addEventListener('click', function() {
        var keyword = (document.getElementById('ws-alert-keyword') || {}).value || '';
        var maxPrice = (document.getElementById('ws-alert-maxprice') || {}).value || '';
        var propType = (document.getElementById('ws-alert-type') || {}).value || '';
        keyword = keyword.trim();
        if (!keyword && !maxPrice && !propType) {
          window.WS.showToast('최소 하나의 조건을 입력해주세요');
          return;
        }
        var alerts = window.WS._getAlerts();
        alerts.push({
          id: Date.now(),
          keyword: keyword,
          maxPrice: maxPrice,
          propertyType: propType,
          created: new Date().toLocaleDateString('ko-KR'),
          active: true
        });
        window.WS._saveAlerts(alerts);
        // Clear inputs
        var kwEl = document.getElementById('ws-alert-keyword');
        var mpEl = document.getElementById('ws-alert-maxprice');
        var ptEl = document.getElementById('ws-alert-type');
        if (kwEl) kwEl.value = '';
        if (mpEl) mpEl.value = '';
        if (ptEl) ptEl.value = '';
        window.WS.renderAlertList();
        window.WS.showToast('알림 조건이 추가되었습니다');
      });
    }
  };

  window.WS.renderAlertList = function() {
    var container = document.getElementById('ws-alert-list');
    if (!container) return;
    var alerts = window.WS._getAlerts();

    if (alerts.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:30px 20px;color:#aaa;"><div style="font-size:28px;margin-bottom:8px;">🔕</div><div>등록된 알림 조건이 없습니다</div><div style="font-size:12px;margin-top:4px;">위에서 조건을 설정하고 알림을 추가하세요</div></div>';
      return;
    }

    var html = '<div style="font-size:12px;color:#888;margin-bottom:8px;">등록된 알림 ' + alerts.length + '개</div>';
    alerts.forEach(function(alert) {
      var condParts = [];
      if (alert.keyword) condParts.push('키워드: ' + alert.keyword);
      if (alert.maxPrice) condParts.push('보증금 ' + parseInt(alert.maxPrice).toLocaleString() + '만 이하');
      if (alert.propertyType) condParts.push('유형: ' + alert.propertyType);
      var condText = condParts.join(' · ');

      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:8px;background:' + (alert.active ? '#fffbeb' : '#f5f5f5') + ';border-radius:8px;border-left:3px solid ' + (alert.active ? '#ed8936' : '#ccc') + ';">';
      html += '<div style="flex:1;">';
      html += '<div style="font-size:13px;font-weight:600;color:' + (alert.active ? '#333' : '#999') + ';">' + escHtml(condText) + '</div>';
      html += '<div style="font-size:11px;color:#aaa;margin-top:2px;">생성: ' + escHtml(alert.created) + ' · ' + (alert.active ? '🟢 활성' : '⏸ 비활성') + '</div>';
      html += '</div>';
      html += '<button data-alert-toggle="' + alert.id + '" style="padding:4px 10px;background:' + (alert.active ? '#f0f0f0' : '#ed8936') + ';color:' + (alert.active ? '#666' : '#fff') + ';border:none;border-radius:4px;font-size:11px;cursor:pointer;">' + (alert.active ? '⏸비활성' : '▶활성') + '</button>';
      html += '<button data-alert-delete="' + alert.id + '" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">🗑삭제</button>';
      html += '</div>';
    });
    container.innerHTML = html;

    // Event delegation (prevents memory leaks on re-render)
    if (!container._delegated) {
      container._delegated = true;
      container.addEventListener('click', function(e) {
        var toggleEl = e.target.closest('[data-alert-toggle]');
        if (toggleEl) {
          var id = parseInt(toggleEl.getAttribute('data-alert-toggle'), 10);
          var alerts = window.WS._getAlerts();
          var al = alerts.find(function(a) { return a.id === id; });
          if (al) { al.active = !al.active; window.WS._saveAlerts(alerts); window.WS.renderAlertList(); }
          return;
        }
        var delEl = e.target.closest('[data-alert-delete]');
        if (delEl) {
          var id = parseInt(delEl.getAttribute('data-alert-delete'), 10);
          var alerts = window.WS._getAlerts().filter(function(a) { return a.id !== id; });
          window.WS._saveAlerts(alerts);
          window.WS.renderAlertList();
          window.WS.showToast('알림이 삭제되었습니다');
        }
      });
    }
  };

  // checkAlerts: only check active alerts
  window.WS.checkAlerts = function(newData) {
    if (!newData || !Array.isArray(newData)) return;
    var alerts = window.WS._getAlerts().filter(function(a) { return a.active; });
    if (alerts.length === 0) return;
    var matches = [];
    alerts.forEach(function(alert) {
      newData.forEach(function(item) {
        var match = true;
        if (alert.keyword && !(item.title || '').includes(alert.keyword) && !(item.address || '').includes(alert.keyword) && !(item.dong || '').includes(alert.keyword)) match = false;
        if (alert.maxPrice) {
          var p = parseFloat(String(item.deposit || item.price || '0').toString().replace(/[^0-9.]/g, '')) || 0;
          if (p > parseFloat(alert.maxPrice)) match = false;
        }
        if (alert.propertyType && item.type !== alert.propertyType) match = false;
        if (match) matches.push({ alert: alert, item: item });
      });
    });
    if (matches.length > 0) {
      window.WS._showAlertNotification(matches.length);
    }
  };

  // ========== Section S: 필터 프리셋 원클릭 ==========
  window.WS._getPresets = function() {
    try { return JSON.parse(localStorage.getItem('ws_filter_presets') || '[]'); } catch(e) { return []; }
  };
  window.WS._savePresets = function(presets) {
    _safeSetItem('ws_filter_presets', JSON.stringify(presets));
  };

  window.WS.showPresetManager = function() {
    var modal = document.getElementById('ws-modal-presets');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ws-modal-presets';
      modal.className = 'ws-modal';
      modal.style.display = 'none';
      modal.innerHTML = '<div class="ws-modal-content" style="max-width:550px;">' +
        '<button class="ws-modal-close">&times;</button>' +
        '<h2 style="color:#2D5A27;margin-bottom:12px;">⚡ 필터 프리셋</h2>' +
        '<p style="font-size:12px;color:#888;margin-bottom:16px;">자주 사용하는 검색 조건을 원클릭으로 적용할 수 있습니다</p>' +
        '<div style="display:flex;gap:8px;margin-bottom:16px;">' +
          '<input type="text" id="ws-preset-name" placeholder="프리셋 이름 (예: 강남 오피스텔)" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          '<button id="ws-preset-save-btn" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;white-space:nowrap;">💾 현재필터저장</button>' +
        '</div>' +
        '<div id="ws-preset-list" style="max-height:350px;overflow-y:auto;"></div>' +
        '</div>';
      (document.querySelector('.ws-search-container') || document.body).appendChild(modal);
      modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.style.display = 'none'; });
      modal.addEventListener('click', function(e) { if (e.target === modal) modal.style.display = 'none'; });
      // Save preset
      document.getElementById('ws-preset-save-btn').addEventListener('click', function() {
        var nameInput = document.getElementById('ws-preset-name');
        var name = nameInput ? nameInput.value.trim() : '';
        if (!name) { window.WS.showToast('프리셋 이름을 입력해주세요'); return; }
        var snapshot = window.WS._getCurrentFilterSnapshot ? window.WS._getCurrentFilterSnapshot() : {};
        var presets = window.WS._getPresets();
        if (presets.length >= 10) { window.WS.showToast('프리셋은 최대 10개까지 저장 가능합니다'); return; }
        presets.push({ id: Date.now(), name: name, filters: snapshot, created: new Date().toLocaleDateString('ko-KR') });
        window.WS._savePresets(presets);
        if (nameInput) nameInput.value = '';
        window.WS.renderPresets();
        window.WS.showToast(name + ' 프리셋이 저장되었습니다');
      });
    }
    modal.style.display = 'flex';
    window.WS.renderPresets();
  };

  window.WS.renderPresets = function() {
    var container = document.getElementById('ws-preset-list');
    if (!container) return;
    var presets = window.WS._getPresets();
    if (presets.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa;"><div style="font-size:28px;margin-bottom:8px;">⚡</div><div>저장된 프리셋이 없습니다</div><div style="font-size:12px;margin-top:4px;">현재 필터를 설정한 후 이름을 지정하고 저장하세요</div></div>';
      return;
    }
    var html = '';
    presets.forEach(function(preset) {
      var desc = window.WS._describeFilter ? window.WS._describeFilter(preset.filters) : '필터 조합';
      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:8px;background:#f0fdf4;border-radius:8px;border-left:3px solid #2D5A27;cursor:pointer;" data-preset-apply="' + preset.id + '">';
      html += '<div style="font-size:20px;">⚡</div>';
      html += '<div style="flex:1;">';
      html += '<div style="font-weight:700;font-size:14px;color:#2D5A27;">' + escHtml(preset.name) + '</div>';
      html += '<div style="font-size:11px;color:#888;margin-top:2px;">' + escHtml(desc) + '</div>';
      html += '</div>';
      html += '<button data-preset-del="' + preset.id + '" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;" onclick="event.stopPropagation()">삭제</button>';
      html += '</div>';
    });
    container.innerHTML = html;

    // Event delegation (prevents memory leaks on re-render)
    if (!container._delegated) {
      container._delegated = true;
      container.addEventListener('click', function(e) {
        var delEl = e.target.closest('[data-preset-del]');
        if (delEl) {
          e.stopPropagation();
          var id = parseInt(delEl.getAttribute('data-preset-del'), 10);
          var presets = window.WS._getPresets().filter(function(p) { return p.id !== id; });
          window.WS._savePresets(presets);
          window.WS.renderPresets();
          window.WS.showToast('프리셋이 삭제되었습니다');
          return;
        }
        var applyEl = e.target.closest('[data-preset-apply]');
        if (applyEl) {
          var id = parseInt(applyEl.getAttribute('data-preset-apply'), 10);
          var presets = window.WS._getPresets();
          var preset = presets.find(function(p) { return p.id === id; });
          if (preset && preset.filters) {
            // Reuse loadSearchHistory logic with correct state property names
            window.WS.loadSearchHistory({ name: preset.name, filters: preset.filters });
            var modal = document.getElementById('ws-modal-presets');
            if (modal) modal.style.display = 'none';
          }
        }
      });
    }
  };

  // ========== Section T: 유사 매물 추천 (고객 니즈 기반) ==========
  // 매칭 기준: 같은 거래유형 필수 → 가격대(보증금+월세) + 동네(구/동) + 면적 + 유형 + 층수
  // 각 항목별 근거 태그로 왜 추천됐는지 명확히 표시
  window.WS.showSimilarListings = function(listing) {
    if (!listing) return '';
    var allListings = window.WS.allListings || [];
    if (allListings.length < 2) return '';

    // ── 기준 매물 핵심 정보 추출 ──
    var targetDeal = (listing.deal || '').trim();
    if (!targetDeal) return ''; // 거래유형 없으면 추천 불가

    var targetDeposit = parseFloat(listing.deposit || 0);
    var targetMonthly = parseFloat(listing.monthly || 0);
    var targetPrice = parseFloat(listing.price || 0);
    var targetArea = parseFloat(listing.area_m2 || 0);
    var targetType = (listing.type || '').trim();

    // 주소에서 구/동 추출
    var addrParts = (listing.address || '').replace(/서울특별시|경기도|인천광역시/g, '').trim().split(/\s+/);
    var targetGu = '';
    var targetDong = '';
    addrParts.forEach(function(p) {
      if (/[구군]$/.test(p) && !targetGu) targetGu = p;
      if (/[동읍면리가로길]$/.test(p) && !targetDong && !/[구군시도]$/.test(p)) targetDong = p;
    });
    if (!targetGu && listing.dong) {
      targetDong = listing.dong;
    }

    var targetFloor = parseInt(listing.floor_current) || 0;

    // ── 스코어링 ──
    var scored = allListings.filter(function(l) {
      // 자기 자신 제외, 같은 거래유형만
      return String(l.id) !== String(listing.id) && (l.deal || '').trim() === targetDeal;
    }).map(function(l) {
      var score = 0;
      var reasons = [];

      // 1. 가격 유사도 (최대 30점) — 거래유형별 비교
      var isRent = /월세|전세/.test(targetDeal);
      if (isRent) {
        var lDep = parseFloat(l.deposit || 0);
        var lMon = parseFloat(l.monthly || 0);
        // 보증금 유사도
        if (targetDeposit > 0 && lDep > 0) {
          var depDiff = Math.abs(lDep - targetDeposit) / targetDeposit;
          if (depDiff <= 0.15) { score += 15; reasons.push('보증금유사'); }
          else if (depDiff <= 0.3) { score += 8; reasons.push('보증금근접'); }
        } else if (targetDeposit === 0 && lDep === 0) {
          score += 10;
        }
        // 월세 유사도
        if (targetMonthly > 0 && lMon > 0) {
          var monDiff = Math.abs(lMon - targetMonthly) / targetMonthly;
          if (monDiff <= 0.15) { score += 15; reasons.push('월세유사'); }
          else if (monDiff <= 0.3) { score += 8; reasons.push('월세근접'); }
        } else if (/전세/.test(targetDeal)) {
          // 전세는 보증금만 비교
          if (targetDeposit > 0 && lDep > 0) {
            var tDiff = Math.abs(lDep - targetDeposit) / targetDeposit;
            if (tDiff <= 0.1) score += 10;
          }
        }
      } else {
        // 매매
        var lPr = parseFloat(l.price || 0);
        if (targetPrice > 0 && lPr > 0) {
          var prDiff = Math.abs(lPr - targetPrice) / targetPrice;
          if (prDiff <= 0.1) { score += 30; reasons.push('가격유사'); }
          else if (prDiff <= 0.2) { score += 20; reasons.push('가격근접'); }
          else if (prDiff <= 0.35) { score += 10; reasons.push('가격대비슷'); }
        }
      }

      // 2. 지역 유사도 (최대 25점)
      var lAddrParts = (l.address || '').replace(/서울특별시|경기도|인천광역시/g, '').trim().split(/\s+/);
      var lGu = '', lDong = '';
      lAddrParts.forEach(function(p) {
        if (/[구군]$/.test(p) && !lGu) lGu = p;
        if (/[동읍면리가로길]$/.test(p) && !lDong && !/[구군시도]$/.test(p)) lDong = p;
      });
      if (!lGu && l.dong) lDong = l.dong;

      if (targetDong && lDong === targetDong && targetGu && lGu === targetGu) {
        score += 25; reasons.push('같은동');
      } else if (targetGu && lGu === targetGu) {
        score += 15; reasons.push('같은구');
      } else if (targetDong && lDong === targetDong) {
        score += 10; reasons.push('동이름일치');
      }

      // 3. 면적 유사도 (최대 15점)
      var lArea = parseFloat(l.area_m2 || 0);
      if (targetArea > 0 && lArea > 0) {
        var areaDiff = Math.abs(lArea - targetArea) / targetArea;
        if (areaDiff <= 0.1) { score += 15; reasons.push('면적유사'); }
        else if (areaDiff <= 0.25) { score += 8; reasons.push('면적근접'); }
      }

      // 4. 매물 유형 일치 (최대 15점)
      var lType = (l.type || '').trim();
      if (targetType && lType === targetType) {
        score += 15; reasons.push('같은유형');
      } else if (targetType && lType) {
        // 유사 유형 (원룸↔투룸, 오피스텔↔사무실 등)
        var simGroups = [
          ['원룸', '투룸', '쓰리룸', '1.5룸'],
          ['오피스텔', '사무실', '사무공간'],
          ['아파트', '빌라', '연립', '다세대'],
          ['상가', '점포', '매장', '식당', '카페']
        ];
        var isSim = simGroups.some(function(g) {
          return g.some(function(k) { return targetType.indexOf(k) >= 0; }) &&
                 g.some(function(k) { return lType.indexOf(k) >= 0; });
        });
        if (isSim) { score += 8; reasons.push('유사유형'); }
      }

      // 5. 층수 유사도 (최대 10점)
      var lFloor = parseInt(l.floor_current) || 0;
      if (targetFloor > 0 && lFloor > 0) {
        var flDiff = Math.abs(lFloor - targetFloor);
        if (flDiff === 0) { score += 10; reasons.push('같은층'); }
        else if (flDiff <= 2) { score += 5; reasons.push('비슷한층'); }
      }

      // 6. 추가 보너스 (사진 있는 매물 +3, 공실 +2)
      var imgs = l.images || l.listing_images || [];
      if (imgs.length > 0) score += 3;
      if (l.status === '가용' || l.status === '공개') score += 2;

      return { listing: l, score: score, reasons: reasons };
    }).filter(function(s) { return s.score >= 25 && s.reasons.length >= 2; })
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, 5);

    if (scored.length === 0) return '';

    var maxScore = scored[0].score;

    var html = '<div style="margin-top:16px;padding-top:16px;border-top:2px solid #e2e8f0;">';
    html += '<h3 style="font-size:14px;font-weight:700;color:#2D5A27;margin-bottom:4px;">유사 매물 추천 (' + scored.length + '건)</h3>';
    html += '<p style="font-size:11px;color:#999;margin:0 0 12px;">거래유형·가격대·지역·면적 기준 매칭</p>';

    scored.forEach(function(s) {
      var l = s.listing;
      var matchPct = Math.min(100, Math.round((s.score / maxScore) * 100));
      var barColor = matchPct >= 80 ? '#2D5A27' : matchPct >= 60 ? '#f59e0b' : '#94a3b8';

      // 가격 표시
      var priceDisplay = '';
      if (/월세/.test(l.deal)) {
        priceDisplay = (l.deposit || 0) + '/' + (l.monthly || 0) + '만';
      } else if (/전세/.test(l.deal)) {
        priceDisplay = (l.deposit || 0) + '만';
      } else {
        priceDisplay = (l.price || 0) + '만';
      }

      // 주소 간략 표시
      var shortAddr = _getDisplayAddress(l);
      var areaText = l.area_m2 ? Math.round(l.area_m2 / 3.30579) + '평' : '';

      html += '<div class="ws-similar-item" style="padding:10px 12px;margin-bottom:6px;background:#fff;border-radius:8px;cursor:pointer;border:1px solid #e8e8e8;transition:all .15s;" data-similar-id="' + l.id + '">';

      // 상단: 매칭률 바 + 가격
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;flex:1;">';
      html += '<div style="font-size:14px;font-weight:800;color:' + barColor + ';">' + matchPct + '%</div>';
      html += '<div style="flex:1;height:4px;background:#f0f0f0;border-radius:2px;overflow:hidden;max-width:80px;"><div style="height:100%;width:' + matchPct + '%;background:' + barColor + ';border-radius:2px;"></div></div>';
      html += '</div>';
      html += '<div style="text-align:right;"><span style="font-size:14px;font-weight:800;color:#e53e3e;">' + escHtml(priceDisplay) + '</span> <span style="font-size:10px;color:#888;">' + escHtml(l.deal || '') + '</span></div>';
      html += '</div>';

      // 중단: 주소 + 면적 + 유형
      html += '<div style="font-size:12px;color:#555;margin-bottom:5px;">' + escHtml(shortAddr) + (areaText ? ' · ' + areaText : '') + (l.type ? ' · ' + escHtml(l.type) : '') + '</div>';

      // 하단: 매칭 근거 태그
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
      s.reasons.forEach(function(r) {
        var tagColor = /같은동|같은구/.test(r) ? '#3b82f6' : /가격|보증금|월세/.test(r) ? '#ef4444' : /면적/.test(r) ? '#8b5cf6' : /유형/.test(r) ? '#f59e0b' : '#6b7280';
        html += '<span style="display:inline-block;padding:1px 6px;background:' + tagColor + '12;color:' + tagColor + ';border-radius:3px;font-size:10px;font-weight:600;">' + escHtml(r) + '</span>';
      });
      html += '</div>';

      html += '</div>';
    });
    html += '</div>';
    return html;
  };

  // ========== Section V: 메모 태그 & 검색 ==========
  window.WS.getMemoTags = function(memoText) {
    if (!memoText) return [];
    var tags = memoText.match(/#[가-힣a-zA-Z0-9_]+/g) || [];
    return tags.map(function(t) { return t.trim(); });
  };

  window.WS.getAllMemoTags = function() {
    var memos = window.WS.state.memos || {};
    var tagMap = {};
    Object.keys(memos).forEach(function(id) {
      var tags = window.WS.getMemoTags(memos[id]);
      tags.forEach(function(tag) {
        if (!tagMap[tag]) tagMap[tag] = 0;
        tagMap[tag]++;
      });
    });
    return tagMap;
  };

  window.WS.showMemoManager = function() {
    var existing = document.getElementById('ws-modal-memos');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-memos';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:700px;width:95%;max-height:85vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    html += '<h2 style="font-size:18px;font-weight:800;color:#2D5A27;margin:0;">📝 메모 관리</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>';
    html += '</div>';

    var tagMap = window.WS.getAllMemoTags();
    var tagKeys = Object.keys(tagMap).sort(function(a, b) { return tagMap[b] - tagMap[a]; });

    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:12px;color:#888;margin-bottom:6px;">📌 태그 클라우드 (메모에 #태그 입력 시 자동 인식)</div>';
    if (tagKeys.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      tagKeys.forEach(function(tag) {
        html += '<button data-memo-tag="' + escHtml(tag) + '" style="padding:4px 12px;background:#f0fdf4;border:1px solid #2D5A27;color:#2D5A27;border-radius:20px;font-size:12px;cursor:pointer;">' + escHtml(tag) + ' <span style="color:#aaa;font-size:10px;">' + tagMap[tag] + '</span></button>';
      });
      html += '</div>';
    } else {
      html += '<div style="color:#ccc;font-size:12px;">태그가 없습니다. 메모에 #급매 #추천 등을 입력해보세요</div>';
    }
    html += '</div>';

    html += '<div style="margin-bottom:16px;"><input type="text" id="ws-memo-search" placeholder="메모 또는 태그 검색..." style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:13px;box-sizing:border-box;"></div>';
    html += '<div id="ws-memo-list" style="max-height:400px;overflow-y:auto;"></div>';
    html += '</div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    window.WS._renderMemoList(modal);

    modal.addEventListener('click', function(e) {
      var tagBtn = e.target.closest('[data-memo-tag]');
      if (tagBtn) {
        var searchInput = document.getElementById('ws-memo-search');
        if (searchInput) {
          searchInput.value = tagBtn.getAttribute('data-memo-tag');
          searchInput.dispatchEvent(new Event('input'));
        }
      }
    });

    var searchInput = document.getElementById('ws-memo-search');
    if (searchInput) {
      var debounceTimer;
      searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          window.WS._renderMemoList(modal, searchInput.value.trim());
        }, 200);
      });
    }
  };

  window.WS._renderMemoList = function(modal, filterText) {
    var container = modal.querySelector('#ws-memo-list');
    if (!container) return;
    var memos = window.WS.state.memos || {};
    var allData = window.WS.allListings || [];
    var entries = [];

    Object.keys(memos).forEach(function(id) {
      var text = memos[id];
      if (!text) return;
      if (filterText && text.toLowerCase().indexOf(filterText.toLowerCase()) === -1) return;
      var listing = allData.find(function(l) { return String(l.id) === String(id); });
      entries.push({ id: id, text: text, listing: listing });
    });

    if (entries.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa;"><div style="font-size:28px;margin-bottom:8px;">📝</div><div>' + (filterText ? '검색 결과가 없습니다' : '저장된 메모가 없습니다') + '</div></div>';
      return;
    }

    var html = '<div style="font-size:12px;color:#888;margin-bottom:8px;">메모 ' + entries.length + '건</div>';
    entries.forEach(function(entry) {
      var tags = window.WS.getMemoTags(entry.text);
      var name = entry.listing ? (entry.listing.title || '매물') : '(삭제된 매물 ID:' + entry.id + ')';
      var addr = entry.listing ? (entry.listing.address || '') : '';

      html += '<div style="padding:12px;margin-bottom:8px;background:#fafafa;border-radius:8px;border-left:3px solid #2D5A27;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
      html += '<div style="font-weight:600;font-size:13px;color:#333;">' + escHtml(name) + '</div>';
      if (entry.listing) {
        html += '<button data-memo-goto="' + entry.id + '" style="padding:3px 10px;background:#2D5A27;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">상세보기</button>';
      }
      html += '</div>';
      if (addr) html += '<div style="font-size:11px;color:#888;margin-bottom:4px;">' + escHtml(addr) + '</div>';
      html += '<div style="font-size:12px;color:#555;white-space:pre-wrap;">' + escHtml(entry.text) + '</div>';
      if (tags.length > 0) {
        html += '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">';
        tags.forEach(function(tag) {
          html += '<span style="padding:2px 8px;background:#e8f5e9;color:#2D5A27;border-radius:10px;font-size:10px;">' + escHtml(tag) + '</span>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    container.innerHTML = html;

    if (!container._delegated) {
      container._delegated = true;
      container.addEventListener('click', function(e) {
        var gotoEl = e.target.closest('[data-memo-goto]');
        if (gotoEl) {
          var id = gotoEl.getAttribute('data-memo-goto');
          var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
          if (found) {
            var mm = document.getElementById('ws-modal-memos');
            if (mm) mm.remove();
            window.WS.showDetail(found);
          }
        }
      });
    }
  };

  // ========== Section W: 키보드 단축키 ==========
  (function() {
    document.addEventListener('keydown', function(e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.key !== 'Escape' && document.querySelector('.ws-modal[style*="display: flex"], .ws-modal[style*="display:flex"]')) return;

      var ctrl = e.ctrlKey || e.metaKey;

      switch(e.key) {
        case 'Escape':
          var modals = document.querySelectorAll('.ws-modal');
          modals.forEach(function(m) { if (m.style.display === 'flex') m.style.display = 'none'; });
          var dynModals = document.querySelectorAll('#ws-modal-compare, #ws-modal-memos, #ws-modal-presets');
          dynModals.forEach(function(m) { m.remove(); });
          break;
        case 'p':
          if (ctrl) { e.preventDefault(); var pb = document.getElementById('ws-btn-print'); if (pb) pb.click(); }
          break;
        case 'f':
          if (ctrl) { e.preventDefault(); var kwI = document.getElementById('ws-keyword'); if (kwI) { kwI.focus(); kwI.select(); } }
          break;
        case 'a':
          if (ctrl) { e.preventDefault(); var saB = document.getElementById('ws-btn-select-all'); if (saB) saB.click(); }
          break;
        case 's':
          if (ctrl) { e.preventDefault(); if (window.WS.showStats) window.WS.showStats(); }
          break;
        case '?':
          window.WS._showShortcutHelp();
          break;
      }
    });
  })();

  window.WS._showShortcutHelp = function() {
    var existing = document.getElementById('ws-shortcut-help');
    if (existing) { existing.remove(); return; }

    var div = document.createElement('div');
    div.id = 'ws-shortcut-help';
    div.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#fff;border-radius:12px;padding:16px 20px;box-shadow:0 8px 30px rgba(0,0,0,0.2);z-index:999999;font-size:12px;min-width:250px;border:2px solid #2D5A27;';

    var html = '<div style="font-weight:700;font-size:14px;color:#2D5A27;margin-bottom:10px;">⌨️ 단축키 안내</div>';
    var shortcuts = [
      ['Ctrl + F', '키워드 검색 포커스'],
      ['Ctrl + P', '선택 매물 인쇄'],
      ['Ctrl + A', '전체 선택'],
      ['Ctrl + S', '통계 대시보드'],
      ['Esc', '모달 닫기'],
      ['?', '이 도움말 표시/닫기']
    ];
    shortcuts.forEach(function(s) {
      html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f0f0;">';
      html += '<kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-family:monospace;font-size:11px;border:1px solid #ddd;">' + s[0] + '</kbd>';
      html += '<span style="color:#666;">' + s[1] + '</span>';
      html += '</div>';
    });
    html += '<div style="text-align:center;margin-top:8px;color:#aaa;font-size:10px;">아무 키나 누르면 닫힘</div>';
    div.innerHTML = html;
    document.body.appendChild(div);

    setTimeout(function() {
      document.addEventListener('keydown', function handler() {
        var el = document.getElementById('ws-shortcut-help');
        if (el) el.remove();
        document.removeEventListener('keydown', handler);
      }, { once: true });
    }, 100);
  };

  // ========== Section X: 디바운스 & 입력 최적화 ==========
  // 렌더링 후 호출 가능하도록 함수로 노출 (DOM 재생성 시 재바인딩)
  window.WS._bindPriceDebounce = function() {
    var priceInputIds = ['ws-min-base-price', 'ws-max-base-price', 'ws-min-deposit', 'ws-max-deposit', 'ws-min-monthly', 'ws-max-monthly', 'ws-min-sale-price', 'ws-max-sale-price', 'ws-min-area', 'ws-max-area', 'ws-min-supply', 'ws-max-supply'];
    priceInputIds.forEach(function(inputId) {
      var el = document.getElementById(inputId);
      if (el && !el._debounced) {
        el._debounced = true;
        var timer;
        el.addEventListener('input', function() {
          clearTimeout(timer);
          timer = setTimeout(function() {
            window.WS.state.page = 1;
            if (window.WS.renderAll) window.WS.renderAll();
            else if (window.WS.renderListings) window.WS.renderListings();
          }, 500);
        });
      }
    });
  };
  // 초기 바인딩 시도
  window.WS._bindPriceDebounce();

  // ========== Section Y: 일일 브리핑 자동 생성 ==========
  window.WS.generateDailyBriefing = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) {
      window.WS.showToast('매물 데이터가 없습니다', 'warning');
      return;
    }

    var today = new Date();
    var todayStr = today.toLocaleDateString('ko-KR');

    // Categorize listings
    var stats = { total: allData.length, available: 0, contracting: 0, completed: 0 };
    var typeCount = {};
    var dealCount = {};
    var regionCount = {};

    allData.forEach(function(item) {
      var st = (item.status || '').toLowerCase();
      if (st.indexOf('계약') >= 0) stats.contracting++;
      else if (st.indexOf('완료') >= 0) stats.completed++;
      else stats.available++;

      var t = item.type || '기타';
      typeCount[t] = (typeCount[t] || 0) + 1;

      var d = item.deal || '기타';
      dealCount[d] = (dealCount[d] || 0) + 1;

      var addr = (item.address || '').split(' ');
      var region = addr.length >= 2 ? addr[0] + ' ' + addr[1] : (addr[0] || '기타');
      regionCount[region] = (regionCount[region] || 0) + 1;
    });

    // Sort by count
    var topTypes = Object.entries(typeCount).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3);
    var topRegions = Object.entries(regionCount).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3);

    // Price analysis
    var deposits = allData.map(function(i) { return parseFloat(String(i.deposit || 0).replace(/[^0-9.]/g, '')) || 0; }).filter(function(d) { return d > 0; });
    var avgDeposit = deposits.length > 0 ? Math.round(deposits.reduce(function(a, b) { return a + b; }, 0) / deposits.length) : 0;
    var minDeposit = deposits.length > 0 ? Math.min.apply(null, deposits) : 0;
    var maxDeposit = deposits.length > 0 ? Math.max.apply(null, deposits) : 0;

    // Changelog data
    var changelog = [];
    try { changelog = JSON.parse(localStorage.getItem('ws_changelog') || '[]'); } catch(e) {}
    var recentChanges = changelog.filter(function(c) {
      var cDate = new Date(c.date);
      var diff = (today - cDate) / (1000 * 60 * 60);
      return diff <= 24;
    });

    // Build text
    var text = '📊 WISHES 일일 매물 브리핑\n';
    text += '━━━━━━━━━━━━━━━━━\n';
    text += '📅 ' + todayStr + '\n\n';

    text += '📌 전체 현황\n';
    text += '  총 매물: ' + stats.total + '건\n';
    text += '  가용: ' + stats.available + '건 | 계약중: ' + stats.contracting + '건 | 완료: ' + stats.completed + '건\n\n';

    text += '🏢 매물 유형 TOP3\n';
    topTypes.forEach(function(t, i) { text += '  ' + (i + 1) + '. ' + t[0] + ': ' + t[1] + '건\n'; });
    text += '\n';

    text += '📍 지역 TOP3\n';
    topRegions.forEach(function(r, i) { text += '  ' + (i + 1) + '. ' + r[0] + ': ' + r[1] + '건\n'; });
    text += '\n';

    if (avgDeposit > 0) {
      text += '💰 보증금 분석\n';
      text += '  평균: ' + avgDeposit.toLocaleString() + '만 | 최저: ' + minDeposit.toLocaleString() + '만 | 최고: ' + maxDeposit.toLocaleString() + '만\n\n';
    }

    if (recentChanges.length > 0) {
      text += '🔄 최근 24시간 변동 (' + recentChanges.length + '건)\n';
      recentChanges.slice(0, 5).forEach(function(c) {
        text += '  · ' + escHtml(c.title || '매물') + ': ' + escHtml(c.changeType || '변동') + '\n';
      });
      if (recentChanges.length > 5) text += '  ... 외 ' + (recentChanges.length - 5) + '건\n';
      text += '\n';
    }

    text += '━━━━━━━━━━━━━━━━━\n';
    text += '🏠 WISHES | wishes.co.kr\n';

    return text;
  };

  window.WS.showDailyBriefing = function() {
    var text = window.WS.generateDailyBriefing();
    if (!text) return;

    var existing = document.getElementById('ws-modal-daily');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-daily';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:600px;width:95%;max-height:85vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    html += '<h2 style="font-size:18px;font-weight:800;color:#2D5A27;margin:0;">📊 일일 브리핑</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';
    html += '<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.7;color:#333;background:#fafafa;padding:16px;border-radius:8px;max-height:50vh;overflow-y:auto;">' + escHtml(text) + '</pre>';
    html += '<div style="display:flex;gap:8px;margin-top:12px;">';
    html += '<button id="ws-daily-copy" style="flex:1;padding:10px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;">📋 클립보드 복사</button>';
    html += '<button id="ws-daily-kakao" style="flex:1;padding:10px;background:#FFA000;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;">💬 카톡 공유</button>';
    html += '</div></div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('ws-daily-copy').addEventListener('click', function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast('브리핑 텍스트가 복사되었습니다!', 'success');
        }).catch(function() { window.WS._fallbackCopy(text); });
      } else {
        window.WS._fallbackCopy(text);
      }
    });

    document.getElementById('ws-daily-kakao').addEventListener('click', function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast('복사 완료! 카카오톡에 붙여넣기 해주세요 💬', 'success');
        }).catch(function() { window.WS._fallbackCopy(text); });
      } else {
        window.WS._fallbackCopy(text);
      }
    });
  };

  // ========== Section Z: 다크모드 토글 ==========
  window.WS._darkModeStyleId = 'ws-dark-mode-style';

  window.WS.isDarkMode = function() {
    return localStorage.getItem('ws_dark_mode') === 'true';
  };

  window.WS.toggleDarkMode = function() {
    var current = window.WS.isDarkMode();
    _safeSetItem('ws_dark_mode', current ? 'false' : 'true');
    window.WS._applyDarkMode(!current);
    window.WS.showToast(!current ? '🌙 다크모드 ON' : '☀️ 라이트모드 ON');
  };

  window.WS._applyDarkMode = function(enabled) {
    var existing = document.getElementById(window.WS._darkModeStyleId);
    if (existing) existing.remove();

    if (!enabled) return;

    var style = document.createElement('style');
    style.id = window.WS._darkModeStyleId;
    style.textContent = [
      '.ws-search-container { background: #1a1a2e !important; color: #e0e0e0 !important; }',
      '.ws-search-container * { border-color: #333 !important; }',
      '.ws-search-container input, .ws-search-container select { background: #16213e !important; color: #e0e0e0 !important; border-color: #444 !important; }',
      '.ws-search-container .ws-filter-section { background: #16213e !important; }',
      '.ws-search-container h1, .ws-search-container h2, .ws-search-container h3 { color: #e0e0e0 !important; }',
      '.ws-listing-item { background: #16213e !important; border-color: #333 !important; }',
      '.ws-listing-item:hover { background: #1a1a3e !important; }',
      '.ws-listing-item .ws-listing-title { color: #fff !important; }',
      '.ws-listing-item .ws-listing-price { color: #ff6b6b !important; }',
      '.ws-bottom-bar { background: #0f0f23 !important; border-color: #333 !important; }',
      '.ws-bar-divider { background: #444 !important; }',
      '.ws-bottom-btn { background: #16213e !important; color: #e0e0e0 !important; border-color: #444 !important; }',
      '.ws-bottom-btn:hover { background: #1a1a3e !important; }',
      '.ws-dropdown-trigger { background: #16213e !important; color: #e0e0e0 !important; border-color: #444 !important; }',
      '.ws-dropdown-trigger:hover { background: #1a1a3e !important; }',
      '.ws-dropdown-menu { background: #1a1a2e !important; border-color: #444 !important; box-shadow: 0 -4px 16px rgba(0,0,0,.4) !important; }',
      '.ws-dropdown-item { color: #e0e0e0 !important; }',
      '.ws-dropdown-item:hover { background: #2D5A27 !important; color: #fff !important; }',
      '.ws-tab-btn { background: #16213e !important; color: #ccc !important; }',
      '.ws-tab-btn.active { background: #2D5A27 !important; color: #fff !important; }',
      '.ws-region-btn { background: #16213e !important; color: #ccc !important; }',
      '.ws-region-btn.active { background: #2D5A27 !important; color: #fff !important; }',
      '.ws-filter-label, .ws-filter-section label { color: #bbb !important; }',
      '.ws-checkbox-label { color: #ccc !important; }',
      '.ws-modal > div { background: #1a1a2e !important; color: #e0e0e0 !important; }',
      '.ws-top-bar { background: #0f0f23 !important; }',
      '.ws-sort-bar { background: #16213e !important; }',
      '.ws-sort-bar select { background: #1a1a2e !important; color: #ccc !important; }',
      '.ws-pagination button { background: #16213e !important; color: #ccc !important; }',
      '#ws-result-count { color: #4CAF50 !important; }',
      '.ws-detail-view { background: #1a1a2e !important; color: #e0e0e0 !important; }',
      '.ws-detail-section { background: #16213e !important; border-color: #333 !important; }',
      '.ws-global-search { background: #16213e !important; color: #e0e0e0 !important; }'
    ].join('\n');
    document.head.appendChild(style);

    // Update dark mode button text
    var btn = document.getElementById('ws-btn-darkmode');
    if (btn) btn.innerHTML = enabled ? '☀️라이트' : '🌙다크';
  };

  // Apply dark mode on load if previously enabled
  if (window.WS.isDarkMode()) {
    window.WS._applyDarkMode(true);
  }

  // ========== Section AA: 만료 예정 매물 표시 ==========
  window.WS.checkExpiringListings = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) return;

    var now = new Date();
    var expiring = [];

    allData.forEach(function(item) {
      if (!item.created_at && !item.registered_at && !item.date) return;
      var regDate = new Date(item.created_at || item.registered_at || item.date);
      if (isNaN(regDate.getTime())) return;
      var daysSince = Math.floor((now - regDate) / (1000 * 60 * 60 * 24));
      if (daysSince >= 25) {
        expiring.push({ listing: item, days: daysSince, urgent: daysSince >= 30 });
      }
    });

    if (expiring.length === 0) return;

    // Store latest expiring data for click handler
    window.WS._latestExpiring = expiring;

    // Show badge
    var badge = document.getElementById('ws-expiry-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'ws-expiry-badge';
      badge.style.cssText = 'position:fixed;top:80px;left:20px;background:#fff3cd;color:#856404;padding:10px 16px;border-radius:10px;font-size:12px;font-weight:600;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;border:1px solid #ffc107;max-width:280px;';
      document.body.appendChild(badge);

      badge.addEventListener('click', function() {
        window.WS.showExpiringListings(window.WS._latestExpiring);
      });
    }

    var urgentCount = expiring.filter(function(e) { return e.urgent; }).length;
    badge.innerHTML = '⏰ 만료 임박 ' + expiring.length + '건' + (urgentCount > 0 ? ' <span style="color:#e53e3e;font-weight:700;">(30일+ ' + urgentCount + '건)</span>' : '');
  };

  window.WS.showExpiringListings = function(expiring) {
    if (!expiring || expiring.length === 0) return;

    var existing = document.getElementById('ws-modal-expiring');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-expiring';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:650px;width:95%;max-height:85vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    html += '<h2 style="font-size:18px;font-weight:800;color:#ed8936;margin:0;">⏰ 만료 임박 매물 (' + expiring.length + '건)</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';
    html += '<div style="font-size:12px;color:#888;margin-bottom:12px;">등록일로부터 25일 이상 경과된 매물입니다. 갱신 또는 상태 확인이 필요합니다.</div>';

    // Sort by days descending
    expiring.sort(function(a, b) { return b.days - a.days; });

    html += '<div id="ws-expiring-list" style="max-height:50vh;overflow-y:auto;">';
    expiring.forEach(function(e) {
      var l = e.listing;
      var bgColor = e.urgent ? '#fff5f5' : '#fffbeb';
      var borderColor = e.urgent ? '#e53e3e' : '#ed8936';
      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:8px;background:' + bgColor + ';border-radius:8px;border-left:3px solid ' + borderColor + ';cursor:pointer;" data-expiry-id="' + l.id + '">';
      html += '<div style="min-width:50px;text-align:center;"><div style="font-size:18px;font-weight:700;color:' + borderColor + ';">' + e.days + '</div><div style="font-size:9px;color:#aaa;">일 경과</div></div>';
      html += '<div style="flex:1;">';
      html += '<div style="font-weight:600;font-size:13px;color:#333;">' + escHtml(l.title || '매물') + '</div>';
      html += '<div style="font-size:11px;color:#888;">' + escHtml(l.address || '') + ' · ' + escHtml(l.type || '') + '</div>';
      html += '</div>';
      html += '<div style="text-align:right;">';
      html += '<div style="font-size:12px;font-weight:700;color:#e53e3e;">' + escHtml(l.deposit ? l.deposit + '만' : (l.price ? l.price + '만' : '-')) + '</div>';
      html += '<div style="font-size:10px;color:#aaa;">' + escHtml(l.deal || '') + '</div>';
      html += '</div>';
      if (e.urgent) html += '<span style="font-size:9px;background:#fed7d7;color:#e53e3e;padding:2px 6px;border-radius:3px;font-weight:600;">만료임박</span>';
      html += '</div>';
    });
    html += '</div></div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // Click to go to detail
    var list = modal.querySelector('#ws-expiring-list');
    if (list) {
      list.addEventListener('click', function(e) {
        var el = e.target.closest('[data-expiry-id]');
        if (el) {
          var id = el.getAttribute('data-expiry-id');
          var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
          if (found) {
            modal.remove();
            window.WS.showDetail(found);
          }
        }
      });
    }
  };

  // ========== Section AB: 고객별 자동 매칭 ==========
  window.WS._getCustomerPrefs = function() {
    try { return JSON.parse(localStorage.getItem('ws_customer_prefs') || '{}'); } catch(e) { return {}; }
  };

  window.WS._saveCustomerPrefs = function(prefs) {
    try { _safeSetItem('ws_customer_prefs', JSON.stringify(prefs)); } catch(e) {}
  };

  window.WS.setCustomerPreference = function(folderId, pref) {
    var prefs = window.WS._getCustomerPrefs();
    prefs[folderId] = pref;
    window.WS._saveCustomerPrefs(prefs);
  };

  window.WS.checkCustomerMatches = function() {
    var prefs = window.WS._getCustomerPrefs();
    var prefIds = Object.keys(prefs);
    if (prefIds.length === 0) return;

    var allData = window.WS.allListings || [];
    if (allData.length === 0) return;

    var folders = window.WS._getCustomerFolders ? window.WS._getCustomerFolders() : [];
    var results = [];

    prefIds.forEach(function(folderId) {
      var pref = prefs[folderId];
      if (!pref) return;
      var folder = folders.find(function(f) { return String(f.id) === String(folderId); });
      var customerName = folder ? folder.name : '고객 #' + folderId;
      var existingIds = folder ? folder.items.map(function(i) { return String(i.id); }) : [];

      var matched = allData.filter(function(item) {
        if (existingIds.indexOf(String(item.id)) >= 0) return false;
        var match = true;
        if (pref.region && item.address && item.address.indexOf(pref.region) === -1) match = false;
        if (pref.type && item.type !== pref.type) match = false;
        if (pref.maxDeposit) {
          var dep = parseFloat(String(item.deposit || 0).replace(/[^0-9.]/g, '')) || 0;
          if (dep > parseFloat(pref.maxDeposit)) match = false;
        }
        if (pref.minArea) {
          var area = parseFloat(item.area_m2 || 0);
          if (area < parseFloat(pref.minArea)) match = false;
        }
        if (pref.deal && item.deal !== pref.deal) match = false;
        return match;
      });

      if (matched.length > 0) {
        results.push({ folderId: folderId, customerName: customerName, matches: matched.slice(0, 5), total: matched.length });
      }
    });

    if (results.length > 0) {
      window.WS._showCustomerMatchNotification(results);
    }
  };

  window.WS._showCustomerMatchNotification = function(results) {
    var total = results.reduce(function(a, r) { return a + r.total; }, 0);
    var existing = document.getElementById('ws-match-badge');
    if (existing) existing.remove();

    var badge = document.createElement('div');
    badge.id = 'ws-match-badge';
    badge.style.cssText = 'position:fixed;top:130px;left:20px;background:#e8f5e9;color:#2D5A27;padding:10px 16px;border-radius:10px;font-size:12px;font-weight:600;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;border:1px solid #4CAF50;max-width:280px;';
    badge.innerHTML = '🎯 고객 매칭 ' + results.length + '명 / ' + total + '건';
    badge.addEventListener('click', function() {
      badge.remove();
      window.WS.showCustomerMatchResults(results);
    });
    document.body.appendChild(badge);
    setTimeout(function() { if (badge.parentNode) badge.remove(); }, 15000);
  };

  window.WS.showCustomerMatchResults = function(results) {
    var existing = document.getElementById('ws-modal-match');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-match';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:650px;width:95%;max-height:85vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    html += '<h2 style="font-size:18px;font-weight:800;color:#2D5A27;margin:0;">🎯 고객 자동 매칭 결과</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';

    results.forEach(function(r) {
      html += '<div style="margin-bottom:16px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">';
      html += '<div style="padding:10px 14px;background:#f0fdf4;border-bottom:1px solid #e2e8f0;font-weight:700;color:#2D5A27;">👤 ' + escHtml(r.customerName) + ' <span style="font-weight:400;font-size:12px;color:#888;">매칭 ' + r.total + '건</span></div>';
      r.matches.forEach(function(item) {
        var priceText = item.deposit ? item.deposit + '만' : (item.price ? item.price + '만' : '-');
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f1f1f1;font-size:12px;cursor:pointer;" data-match-id="' + item.id + '">';
        html += '<div style="flex:1;"><span style="font-weight:600;color:#333;">' + escHtml(item.title || '매물') + '</span> <span style="color:#888;">' + escHtml(item.address || '') + '</span></div>';
        html += '<span style="color:#e53e3e;font-weight:600;white-space:nowrap;">' + escHtml(String(priceText)) + '</span>';
        html += '</div>';
      });
      if (r.total > 5) html += '<div style="padding:6px 14px;font-size:11px;color:#888;text-align:center;">... 외 ' + (r.total - 5) + '건</div>';
      html += '</div>';
    });
    html += '</div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
      var matchEl = e.target.closest('[data-match-id]');
      if (matchEl) {
        var id = matchEl.getAttribute('data-match-id');
        var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
        if (found) { modal.remove(); window.WS.showDetail(found); }
      }
    });
  };

  // Add preference setting to customer folder UI
  window.WS.showSetPreference = function(folderId) {
    var folders = window.WS._getCustomerFolders ? window.WS._getCustomerFolders() : [];
    var folder = folders.find(function(f) { return f.id === folderId; });
    var customerName = folder ? folder.name : '고객';
    var existing = window.WS._getCustomerPrefs()[folderId] || {};

    var existing_modal = document.getElementById('ws-modal-setpref');
    if (existing_modal) existing_modal.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-setpref';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:450px;width:95%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    html += '<h2 style="font-size:16px;font-weight:800;color:#2D5A27;margin:0;">🎯 ' + escHtml(customerName) + '님 선호조건</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';
    html += '<div style="display:grid;gap:10px;">';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">선호 지역</label><input type="text" id="ws-pref-region" value="' + escHtml(existing.region || '') + '" placeholder="예: 서울 강남구" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">매물 유형</label><select id="ws-pref-type" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">';
    ['', '원룸', '투룸', '오피스텔', '아파트', '상가', '사무실', '빌라', '토지'].forEach(function(t) {
      html += '<option value="' + t + '"' + (existing.type === t ? ' selected' : '') + '>' + (t || '전체') + '</option>';
    });
    html += '</select></div>';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">거래방식</label><select id="ws-pref-deal" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">';
    ['', '월세', '전세', '전월세', '매매'].forEach(function(d) {
      html += '<option value="' + d + '"' + (existing.deal === d ? ' selected' : '') + '>' + (d || '전체') + '</option>';
    });
    html += '</select></div>';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">최대 보증금 (만원)</label><input type="number" id="ws-pref-maxdeposit" value="' + escHtml(existing.maxDeposit || '') + '" placeholder="예: 5000" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">최소 면적 (m²)</label><input type="number" id="ws-pref-minarea" value="' + escHtml(existing.minArea || '') + '" placeholder="예: 20" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;margin-top:16px;">';
    html += '<button id="ws-pref-save" style="flex:1;padding:10px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;">💾 저장</button>';
    html += '<button id="ws-pref-clear" style="padding:10px 16px;background:#e2e8f0;color:#666;border:none;border-radius:8px;font-size:13px;cursor:pointer;">초기화</button>';
    html += '</div></div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('ws-pref-save').addEventListener('click', function() {
      var pref = {
        region: (document.getElementById('ws-pref-region') || {}).value || '',
        type: (document.getElementById('ws-pref-type') || {}).value || '',
        deal: (document.getElementById('ws-pref-deal') || {}).value || '',
        maxDeposit: (document.getElementById('ws-pref-maxdeposit') || {}).value || '',
        minArea: (document.getElementById('ws-pref-minarea') || {}).value || ''
      };
      window.WS.setCustomerPreference(folderId, pref);
      modal.remove();
      window.WS.showToast(customerName + '님 선호조건이 저장되었습니다', 'success');
      // Immediately check matches
      window.WS.checkCustomerMatches();
    });

    document.getElementById('ws-pref-clear').addEventListener('click', function() {
      var prefs = window.WS._getCustomerPrefs();
      delete prefs[folderId];
      window.WS._saveCustomerPrefs(prefs);
      modal.remove();
      window.WS.showToast('선호조건이 초기화되었습니다');
    });
  };

  // ========== Section AC: 즐겨찾기 카테고리 ==========
  window.WS._getFavCategories = function() {
    try { return JSON.parse(localStorage.getItem('ws_fav_categories') || '{}'); } catch(e) { return {}; }
  };

  window.WS._saveFavCategories = function(cats) {
    try { _safeSetItem('ws_fav_categories', JSON.stringify(cats)); } catch(e) {}
  };

  window.WS.setFavCategory = function(listingId, category) {
    var cats = window.WS._getFavCategories();
    if (category) {
      cats[String(listingId)] = category;
    } else {
      delete cats[String(listingId)];
    }
    window.WS._saveFavCategories(cats);
  };

  window.WS.getFavCategory = function(listingId) {
    var cats = window.WS._getFavCategories();
    return cats[String(listingId)] || '';
  };

  // Category badge colors
  window.WS._categoryStyles = {
    '급매': { bg: '#fed7d7', color: '#e53e3e', icon: '🔥' },
    '추천': { bg: '#c6f6d5', color: '#2D5A27', icon: '⭐' },
    '대기': { bg: '#fefcbf', color: '#975a16', icon: '⏳' },
    'VIP': { bg: '#e9d8fd', color: '#6b46c1', icon: '👑' },
    '보류': { bg: '#e2e8f0', color: '#718096', icon: '⏸' }
  };

  window.WS.showCategoryPicker = function(listingId, anchorEl) {
    var existing = document.getElementById('ws-category-picker');
    if (existing) existing.remove();

    var current = window.WS.getFavCategory(listingId);
    var picker = document.createElement('div');
    picker.id = 'ws-category-picker';
    picker.style.cssText = 'position:fixed;z-index:999999;background:#fff;border-radius:10px;padding:8px;box-shadow:0 8px 30px rgba(0,0,0,0.2);border:1px solid #e2e8f0;';

    // Position near anchor
    if (anchorEl) {
      var rect = anchorEl.getBoundingClientRect();
      picker.style.top = (rect.bottom + 4) + 'px';
      picker.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    } else {
      picker.style.top = '50%'; picker.style.left = '50%'; picker.style.transform = 'translate(-50%,-50%)';
    }

    var html = '<div style="font-size:11px;color:#888;padding:2px 6px;margin-bottom:4px;">카테고리 선택</div>';
    var cats = Object.keys(window.WS._categoryStyles);
    cats.forEach(function(cat) {
      var s = window.WS._categoryStyles[cat];
      var isActive = current === cat;
      html += '<div data-cat="' + cat + '" style="display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;border-radius:6px;margin-bottom:2px;background:' + (isActive ? s.bg : 'transparent') + ';font-weight:' + (isActive ? '700' : '400') + ';">';
      html += '<span>' + s.icon + '</span><span style="font-size:12px;color:' + s.color + ';">' + cat + '</span>';
      if (isActive) html += '<span style="margin-left:auto;font-size:10px;">✓</span>';
      html += '</div>';
    });
    // Remove category option
    if (current) {
      html += '<div data-cat="" style="display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;border-radius:6px;border-top:1px solid #eee;margin-top:4px;">';
      html += '<span>✕</span><span style="font-size:12px;color:#999;">카테고리 해제</span></div>';
    }

    picker.innerHTML = html;
    document.body.appendChild(picker);

    picker.addEventListener('click', function(e) {
      var catEl = e.target.closest('[data-cat]');
      if (catEl) {
        var cat = catEl.getAttribute('data-cat');
        window.WS.setFavCategory(listingId, cat);
        picker.remove();
        window.WS.showToast(cat ? '카테고리: ' + cat : '카테고리 해제');
        // Refresh favorites view if open
        if (window.WS.showFavorites && document.getElementById('ws-modal-favorites')) {
          window.WS.showFavorites();
        }
      }
    });

    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', function handler(e) {
        if (!picker.contains(e.target)) {
          picker.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 50);
  };

  // ========== Section AD: 데이터 백업/복원 ==========
  window.WS._backupKeys = [
    'ws-favorites', 'ws-memos', 'ws-search-history',
    'ws_customer_folders', 'ws_changelog', 'ws_data_snapshot',
    'ws_alerts', 'ws_filter_presets', 'ws_dark_mode',
    'ws_customer_prefs', 'ws_fav_categories'
  ];

  window.WS.showBackupRestore = function() {
    var existing = document.getElementById('ws-modal-backup');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-backup';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    // Gather current data info
    var dataInfo = [];
    var totalSize = 0;
    window.WS._backupKeys.forEach(function(key) {
      var val = localStorage.getItem(key);
      if (val) {
        var size = new Blob([val]).size;
        totalSize += size;
        var count = '';
        try {
          var parsed = JSON.parse(val);
          if (Array.isArray(parsed)) count = parsed.length + '건';
          else if (typeof parsed === 'object') count = Object.keys(parsed).length + '건';
        } catch(e) {}
        dataInfo.push({ key: key, size: size, count: count });
      }
    });

    var sizeStr = totalSize < 1024 ? totalSize + 'B' : (totalSize / 1024).toFixed(1) + 'KB';

    var html = '<div style="background:#fff;border-radius:16px;max-width:520px;width:95%;max-height:85vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    html += '<h2 style="font-size:18px;font-weight:800;color:#6366f1;margin:0;">💾 데이터 백업/복원</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';

    // Current data summary
    html += '<div style="background:#f8f7ff;border:1px solid #e0e0ff;border-radius:10px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#6366f1;margin-bottom:8px;">📊 현재 저장 데이터</div>';
    if (dataInfo.length === 0) {
      html += '<div style="font-size:12px;color:#aaa;">저장된 데이터가 없습니다.</div>';
    } else {
      var keyLabels = {
        'ws-favorites': '⭐ 즐겨찾기', 'ws-memos': '📝 메모',
        'ws-search-history': '📋 검색기록', 'ws_customer_folders': '👤 고객폴더',
        'ws_changelog': '📈 변동이력', 'ws_data_snapshot': '📸 데이터스냅샷',
        'ws_alerts': '🔔 알림설정', 'ws_filter_presets': '⚡ 필터프리셋',
        'ws_dark_mode': '🌙 다크모드', 'ws_customer_prefs': '🎯 고객선호조건',
        'ws_fav_categories': '🏷️ 즐겨찾기카테고리'
      };
      dataInfo.forEach(function(d) {
        var label = keyLabels[d.key] || d.key;
        html += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;color:#555;">';
        html += '<span>' + label + '</span>';
        html += '<span style="color:#888;">' + d.count + (d.count ? ' · ' : '') + (d.size < 1024 ? d.size + 'B' : (d.size / 1024).toFixed(1) + 'KB') + '</span>';
        html += '</div>';
      });
      html += '<div style="border-top:1px solid #ddd;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:#6366f1;"><span>합계</span><span>' + sizeStr + '</span></div>';
    }
    html += '</div>';

    // Buttons
    html += '<div style="display:grid;gap:10px;">';
    html += '<button id="ws-backup-export" style="padding:14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;text-align:left;">📤 백업 파일 다운로드<br><span style="font-size:11px;font-weight:400;opacity:0.8;">모든 설정을 JSON 파일로 내보냅니다</span></button>';
    html += '<button id="ws-backup-clipboard" style="padding:12px;background:#f0f0ff;color:#6366f1;border:1px solid #c7d2fe;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">📋 클립보드로 복사</button>';
    html += '<div style="position:relative;">';
    html += '<button id="ws-backup-import-btn" style="width:100%;padding:14px;background:#fff;color:#059669;border:2px dashed #059669;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;text-align:left;">📥 백업 파일에서 복원<br><span style="font-size:11px;font-weight:400;color:#888;">JSON 파일을 선택하거나 텍스트를 붙여넣기</span></button>';
    html += '<input type="file" id="ws-backup-file-input" accept=".json" style="display:none;">';
    html += '</div>';
    html += '<textarea id="ws-backup-paste" placeholder="또는 여기에 백업 JSON을 붙여넣기..." style="width:100%;height:80px;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;display:none;"></textarea>';
    html += '<button id="ws-backup-paste-apply" style="padding:10px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:none;">✅ 붙여넣기 데이터 적용</button>';
    html += '<button id="ws-backup-reset" style="padding:10px;background:#fff;color:#e53e3e;border:1px solid #fecaca;border-radius:8px;font-size:12px;cursor:pointer;margin-top:8px;">🗑️ 모든 설정 초기화</button>';
    html += '</div></div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // Export as file download
    document.getElementById('ws-backup-export').addEventListener('click', function() {
      var data = {};
      window.WS._backupKeys.forEach(function(key) {
        var val = localStorage.getItem(key);
        if (val) {
          try { data[key] = JSON.parse(val); } catch(e) { data[key] = val; }
        }
      });
      data._meta = { version: '1.0', exportedAt: new Date().toISOString(), source: 'WISHES Search Extension' };

      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'wishes-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      window.WS.showToast('백업 파일이 다운로드되었습니다', 'success');
    });

    // Copy to clipboard
    document.getElementById('ws-backup-clipboard').addEventListener('click', function() {
      var data = {};
      window.WS._backupKeys.forEach(function(key) {
        var val = localStorage.getItem(key);
        if (val) {
          try { data[key] = JSON.parse(val); } catch(e) { data[key] = val; }
        }
      });
      data._meta = { version: '1.0', exportedAt: new Date().toISOString(), source: 'WISHES Search Extension' };

      var text = JSON.stringify(data, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast('백업 데이터가 클립보드에 복사되었습니다', 'success');
        }).catch(function() { window.WS._fallbackCopy(text); });
      } else {
        window.WS._fallbackCopy(text);
      }
    });

    // Import from file
    document.getElementById('ws-backup-import-btn').addEventListener('click', function() {
      var fileInput = document.getElementById('ws-backup-file-input');
      var pasteArea = document.getElementById('ws-backup-paste');
      var pasteBtn = document.getElementById('ws-backup-paste-apply');
      fileInput.click();
      // Also show paste area
      pasteArea.style.display = 'block';
      pasteBtn.style.display = 'block';
    });

    document.getElementById('ws-backup-file-input').addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        window.WS._applyBackup(ev.target.result, modal);
      };
      reader.readAsText(file);
    });

    // Paste apply
    document.getElementById('ws-backup-paste-apply').addEventListener('click', function() {
      var text = document.getElementById('ws-backup-paste').value.trim();
      if (!text) { window.WS.showToast('붙여넣기할 데이터가 없습니다', 'warning'); return; }
      window.WS._applyBackup(text, modal);
    });

    // Reset all
    document.getElementById('ws-backup-reset').addEventListener('click', function() {
      if (!confirm('정말 모든 설정을 초기화하시겠습니까?\n즐겨찾기, 메모, 고객폴더 등 모든 데이터가 삭제됩니다.')) return;
      window.WS._backupKeys.forEach(function(key) {
        localStorage.removeItem(key);
      });
      window.WS.showToast('모든 설정이 초기화되었습니다', 'success');
      modal.remove();
    });
  };

  window.WS._applyBackup = function(jsonText, modal) {
    try {
      var data = JSON.parse(jsonText);
      if (!data || typeof data !== 'object') throw new Error('Invalid format');

      var restoredCount = 0;
      window.WS._backupKeys.forEach(function(key) {
        if (data[key] !== undefined) {
          _safeSetItem(key, typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]));
          restoredCount++;
        }
      });

      if (restoredCount === 0) {
        window.WS.showToast('복원할 데이터가 없습니다. 올바른 백업 파일인지 확인하세요.', 'warning');
        return;
      }

      // Reload favorites into state
      var savedFavs = localStorage.getItem('ws-favorites');
      window.WS.state.favorites = savedFavs ? JSON.parse(savedFavs) : [];
      var favCountEl = document.getElementById('ws-fav-count');
      if (favCountEl) favCountEl.textContent = window.WS.state.favorites.length;

      // Re-apply dark mode
      if (window.WS.isDarkMode && window.WS.isDarkMode()) {
        window.WS._applyDarkMode(true);
      } else {
        window.WS._applyDarkMode(false);
      }

      window.WS.showToast(restoredCount + '개 항목이 복원되었습니다', 'success');
      if (modal) modal.remove();
    } catch(e) {
      window.WS.showToast('백업 파일 형식이 올바르지 않습니다: ' + e.message, 'error');
    }
  };

  // ========== Section AE: 지역별 시세 분석 차트 ==========
  window.WS.showMarketAnalysis = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) {
      window.WS.showToast('매물 데이터가 없습니다', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-market');
    if (existing) existing.remove();

    // 1) 지역별 평균 보증금 분석
    var regionStats = {};
    var typeStats = {};
    var dealStats = {};
    var priceRanges = { '1000만 이하': 0, '1000~3000만': 0, '3000~5000만': 0, '5000만~1억': 0, '1억~3억': 0, '3억 이상': 0 };

    allData.forEach(function(item) {
      // 지역 추출 (주소에서 구 단위)
      var addr = item.address || '';
      var guMatch = addr.match(/([가-힣]+[구군시])/);
      var gu = guMatch ? guMatch[1] : '기타';

      var dep = parseFloat(String(item.deposit || 0).replace(/[^0-9.]/g, '')) || 0;
      var monthly = parseFloat(String(item.monthly || 0).replace(/[^0-9.]/g, '')) || 0;
      var salePrice = parseFloat(String(item.price || 0).replace(/[^0-9.]/g, '')) || 0;
      var area = parseFloat(item.area_m2 || 0) || 1;

      // 지역별
      if (!regionStats[gu]) regionStats[gu] = { count: 0, totalDeposit: 0, totalMonthly: 0, totalArea: 0 };
      regionStats[gu].count++;
      regionStats[gu].totalDeposit += dep;
      regionStats[gu].totalMonthly += monthly;
      regionStats[gu].totalArea += area;

      // 유형별
      var type = item.type || '기타';
      if (!typeStats[type]) typeStats[type] = { count: 0, totalDeposit: 0, totalMonthly: 0 };
      typeStats[type].count++;
      typeStats[type].totalDeposit += dep;
      typeStats[type].totalMonthly += monthly;

      // 거래방식별
      var deal = item.deal || '기타';
      if (!dealStats[deal]) dealStats[deal] = { count: 0, totalDeposit: 0, totalMonthly: 0, totalSale: 0 };
      dealStats[deal].count++;
      dealStats[deal].totalDeposit += dep;
      dealStats[deal].totalMonthly += monthly;
      dealStats[deal].totalSale += salePrice;

      // 가격대 분포
      var mainPrice = dep || salePrice;
      if (mainPrice <= 1000) priceRanges['1000만 이하']++;
      else if (mainPrice <= 3000) priceRanges['1000~3000만']++;
      else if (mainPrice <= 5000) priceRanges['3000~5000만']++;
      else if (mainPrice <= 10000) priceRanges['5000만~1억']++;
      else if (mainPrice <= 30000) priceRanges['1억~3억']++;
      else priceRanges['3억 이상']++;
    });

    var modal = document.createElement('div');
    modal.id = 'ws-modal-market';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:750px;width:95%;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">';
    html += '<h2 style="font-size:20px;font-weight:800;color:#d97706;margin:0;">📈 시세 분석 리포트</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';
    html += '<div style="font-size:11px;color:#888;margin-bottom:16px;">보유 매물 ' + allData.length + '건 기준 · ' + new Date().toLocaleDateString('ko-KR') + '</div>';

    // ── 탭 영역 ──
    html += '<div id="ws-market-tabs" style="display:flex;gap:6px;margin-bottom:16px;border-bottom:2px solid #eee;padding-bottom:8px;">';
    html += '<button data-mtab="region" style="padding:6px 14px;border:none;border-radius:8px 8px 0 0;font-size:12px;cursor:pointer;background:#d97706;color:#fff;font-weight:700;">🗺️ 지역별</button>';
    html += '<button data-mtab="type" style="padding:6px 14px;border:none;border-radius:8px 8px 0 0;font-size:12px;cursor:pointer;background:#f5f5f5;color:#888;">🏠 유형별</button>';
    html += '<button data-mtab="price" style="padding:6px 14px;border:none;border-radius:8px 8px 0 0;font-size:12px;cursor:pointer;background:#f5f5f5;color:#888;">💰 가격대</button>';
    html += '<button data-mtab="deal" style="padding:6px 14px;border:none;border-radius:8px 8px 0 0;font-size:12px;cursor:pointer;background:#f5f5f5;color:#888;">📋 거래별</button>';
    html += '</div>';

    // ── 지역별 차트 ──
    html += '<div id="ws-market-region" class="ws-market-panel">';
    var regionKeys = Object.keys(regionStats).sort(function(a, b) { return regionStats[b].count - regionStats[a].count; });
    var maxCount = regionKeys.length > 0 ? regionStats[regionKeys[0]].count : 1;

    regionKeys.forEach(function(gu) {
      var s = regionStats[gu];
      var avgDep = s.count > 0 ? Math.round(s.totalDeposit / s.count) : 0;
      var avgMonthly = s.count > 0 ? Math.round(s.totalMonthly / s.count) : 0;
      var avgArea = s.count > 0 ? (s.totalArea / s.count).toFixed(1) : 0;
      var barWidth = maxCount > 0 ? Math.max(8, (s.count / maxCount) * 100) : 8;

      html += '<div style="margin-bottom:10px;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">';
      html += '<span style="font-size:13px;font-weight:600;color:#333;min-width:80px;">' + escHtml(gu) + '</span>';
      html += '<span style="font-size:11px;color:#888;">' + s.count + '건 · 평균 ' + escHtml(String(avgArea)) + 'm²</span>';
      html += '</div>';
      html += '<div style="display:flex;align-items:center;gap:8px;">';
      html += '<div style="flex:1;background:#f5f5f5;border-radius:6px;height:28px;overflow:hidden;position:relative;">';
      html += '<div style="width:' + barWidth + '%;height:100%;background:linear-gradient(90deg,#d97706,#f59e0b);border-radius:6px;transition:width 0.5s;"></div>';
      html += '<span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:600;color:#555;">보증금 평균 ' + escHtml(String(avgDep)) + '만</span>';
      html += '</div>';
      if (avgMonthly > 0) {
        html += '<span style="font-size:10px;color:#e53e3e;white-space:nowrap;font-weight:600;">월 ' + escHtml(String(avgMonthly)) + '만</span>';
      }
      html += '</div></div>';
    });
    html += '</div>';

    // ── 유형별 차트 ──
    html += '<div id="ws-market-type" class="ws-market-panel" style="display:none;">';
    var typeKeys = Object.keys(typeStats).sort(function(a, b) { return typeStats[b].count - typeStats[a].count; });
    var typeColors = ['#2D5A27', '#4CAF50', '#81C784', '#A5D6A7', '#C8E6C9', '#E8F5E9', '#d97706', '#f59e0b'];

    typeKeys.forEach(function(type, i) {
      var s = typeStats[type];
      var avgDep = s.count > 0 ? Math.round(s.totalDeposit / s.count) : 0;
      var avgMonthly = s.count > 0 ? Math.round(s.totalMonthly / s.count) : 0;
      var pct = ((s.count / allData.length) * 100).toFixed(1);
      var color = typeColors[i % typeColors.length];

      html += '<div style="display:flex;align-items:center;gap:12px;padding:10px;margin-bottom:6px;background:#fafafa;border-radius:8px;border-left:4px solid ' + color + ';">';
      html += '<div style="min-width:70px;"><span style="font-weight:700;font-size:13px;color:' + color + ';">' + escHtml(type) + '</span></div>';
      html += '<div style="flex:1;">';
      html += '<div style="display:flex;align-items:center;gap:6px;">';
      html += '<div style="background:' + color + ';height:20px;border-radius:4px;transition:width 0.5s;width:' + pct + '%;min-width:20px;"></div>';
      html += '<span style="font-size:12px;font-weight:600;">' + s.count + '건 (' + pct + '%)</span>';
      html += '</div>';
      html += '</div>';
      html += '<div style="text-align:right;min-width:120px;">';
      html += '<div style="font-size:12px;font-weight:600;color:#333;">보증금 ' + escHtml(String(avgDep)) + '만</div>';
      if (avgMonthly > 0) html += '<div style="font-size:10px;color:#e53e3e;">월세 ' + escHtml(String(avgMonthly)) + '만</div>';
      html += '</div></div>';
    });
    html += '</div>';

    // ── 가격대 분포 ──
    html += '<div id="ws-market-price" class="ws-market-panel" style="display:none;">';
    var priceColors = ['#c6f6d5', '#9ae6b4', '#68d391', '#48bb78', '#38a169', '#2f855a'];
    var priceKeys = Object.keys(priceRanges);
    var maxPriceCount = priceKeys.length > 0 ? (Math.max.apply(null, priceKeys.map(function(k) { return priceRanges[k]; })) || 1) : 1;

    priceKeys.forEach(function(range, i) {
      var count = priceRanges[range];
      var pct = allData.length > 0 ? ((count / allData.length) * 100).toFixed(1) : '0.0';
      var barW = Math.max(5, (count / maxPriceCount) * 100);

      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
      html += '<span style="min-width:100px;font-size:12px;font-weight:600;color:#555;text-align:right;">' + escHtml(range) + '</span>';
      html += '<div style="flex:1;background:#f0f0f0;border-radius:6px;height:30px;overflow:hidden;position:relative;">';
      html += '<div style="width:' + barW + '%;height:100%;background:' + priceColors[i] + ';border-radius:6px;transition:width 0.5s;"></div>';
      html += '<span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:600;color:#333;">' + count + '건 (' + pct + '%)</span>';
      html += '</div></div>';
    });
    html += '</div>';

    // ── 거래방식별 ──
    html += '<div id="ws-market-deal" class="ws-market-panel" style="display:none;">';
    var dealKeys = Object.keys(dealStats).sort(function(a, b) { return dealStats[b].count - dealStats[a].count; });
    var dealColors = { '월세': '#e53e3e', '전세': '#3182ce', '전월세': '#805ad5', '매매': '#d97706' };

    dealKeys.forEach(function(deal) {
      var s = dealStats[deal];
      var avgDep = s.count > 0 ? Math.round(s.totalDeposit / s.count) : 0;
      var avgMonthly = s.count > 0 ? Math.round(s.totalMonthly / s.count) : 0;
      var avgSale = s.count > 0 ? Math.round(s.totalSale / s.count) : 0;
      var color = dealColors[deal] || '#888';
      var pct = ((s.count / allData.length) * 100).toFixed(1);

      html += '<div style="padding:14px;margin-bottom:8px;background:#fafafa;border-radius:10px;border-left:4px solid ' + color + ';">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
      html += '<span style="font-size:15px;font-weight:700;color:' + color + ';">' + escHtml(deal) + '</span>';
      html += '<span style="font-size:12px;color:#888;">' + s.count + '건 (' + pct + '%)</span>';
      html += '</div>';
      html += '<div style="display:flex;gap:16px;flex-wrap:wrap;">';
      if (avgDep > 0) html += '<div style="font-size:12px;"><span style="color:#888;">평균 보증금</span> <strong style="color:#333;">' + escHtml(String(avgDep)) + '만</strong></div>';
      if (avgMonthly > 0) html += '<div style="font-size:12px;"><span style="color:#888;">평균 월세</span> <strong style="color:#e53e3e;">' + escHtml(String(avgMonthly)) + '만</strong></div>';
      if (avgSale > 0) html += '<div style="font-size:12px;"><span style="color:#888;">평균 매매가</span> <strong style="color:#d97706;">' + escHtml(String(avgSale)) + '만</strong></div>';
      html += '</div></div>';
    });
    html += '</div>';

    // ── 요약 인사이트 ──
    html += '<div style="margin-top:16px;padding:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#d97706;margin-bottom:8px;">💡 인사이트</div>';

    // 가장 매물 많은 지역
    var topRegion = regionKeys.length > 0 ? regionKeys[0] : '-';
    var topRegionCount = regionKeys.length > 0 ? regionStats[regionKeys[0]].count : 0;
    // 가장 비싼 지역
    var expensiveRegion = regionKeys.reduce(function(best, gu) {
      var avg = regionStats[gu].count > 0 ? regionStats[gu].totalDeposit / regionStats[gu].count : 0;
      var bestAvg = best ? (regionStats[best].count > 0 ? regionStats[best].totalDeposit / regionStats[best].count : 0) : 0;
      return avg > bestAvg ? gu : best;
    }, regionKeys[0] || '-');
    var expAvg = expensiveRegion && regionStats[expensiveRegion] ? Math.round(regionStats[expensiveRegion].totalDeposit / regionStats[expensiveRegion].count) : 0;

    html += '<div style="font-size:12px;color:#555;line-height:1.8;">';
    html += '• 매물 집중 지역: <strong>' + escHtml(topRegion) + '</strong> (' + topRegionCount + '건)<br>';
    html += '• 평균 보증금 최고 지역: <strong>' + escHtml(expensiveRegion) + '</strong> (' + escHtml(String(expAvg)) + '만원)<br>';
    html += '• 가장 많은 거래유형: <strong>' + escHtml(dealKeys.length > 0 ? dealKeys[0] : '-') + '</strong><br>';
    html += '• 가장 많은 매물유형: <strong>' + escHtml(typeKeys.length > 0 ? typeKeys[0] : '-') + '</strong>';
    html += '</div></div>';

    html += '</div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // Tab switching
    var tabs = modal.querySelectorAll('[data-mtab]');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var target = this.getAttribute('data-mtab');
        // Hide all panels
        modal.querySelectorAll('.ws-market-panel').forEach(function(p) { p.style.display = 'none'; });
        // Deactivate all tabs
        tabs.forEach(function(t) { t.style.background = '#f5f5f5'; t.style.color = '#888'; t.style.fontWeight = '400'; });
        // Activate clicked
        this.style.background = '#d97706';
        this.style.color = '#fff';
        this.style.fontWeight = '700';
        // Show target panel
        var panel = document.getElementById('ws-market-' + target);
        if (panel) panel.style.display = 'block';
      });
    });
  };

  // ========== Section AF: 매물 회전율/재고 분석 ==========
  window.WS.showTurnoverAnalysis = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) {
      window.WS.showToast('매물 데이터가 없습니다', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-turnover');
    if (existing) existing.remove();

    var now = new Date();
    var totalActive = 0;
    var totalDays = 0;
    var ageGroups = { '1주일 이내': [], '2주일 이내': [], '1개월 이내': [], '1~2개월': [], '2개월 이상': [] };
    var typeAge = {};
    var regionAge = {};
    var longStay = []; // 30일 이상 체류

    allData.forEach(function(item) {
      var regDate = new Date(item.created_at || item.registered_at || item.date);
      if (isNaN(regDate.getTime())) return;

      var days = Math.floor((now - regDate) / (1000 * 60 * 60 * 24));
      totalActive++;
      totalDays += days;

      // Age group classification
      if (days <= 7) ageGroups['1주일 이내'].push(item);
      else if (days <= 14) ageGroups['2주일 이내'].push(item);
      else if (days <= 30) ageGroups['1개월 이내'].push(item);
      else if (days <= 60) ageGroups['1~2개월'].push(item);
      else ageGroups['2개월 이상'].push(item);

      // By type
      var type = item.type || '기타';
      if (!typeAge[type]) typeAge[type] = { count: 0, totalDays: 0 };
      typeAge[type].count++;
      typeAge[type].totalDays += days;

      // By region
      var addr = item.address || '';
      var guMatch = addr.match(/([가-힣]+[구군시])/);
      var gu = guMatch ? guMatch[1] : '기타';
      if (!regionAge[gu]) regionAge[gu] = { count: 0, totalDays: 0 };
      regionAge[gu].count++;
      regionAge[gu].totalDays += days;

      // Long stay (30+ days)
      if (days >= 30) {
        longStay.push({ listing: item, days: days });
      }
    });

    longStay.sort(function(a, b) { return b.days - a.days; });
    var avgDays = totalActive > 0 ? Math.round(totalDays / totalActive) : 0;

    var modal = document.createElement('div');
    modal.id = 'ws-modal-turnover';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:700px;width:95%;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">';
    html += '<h2 style="font-size:20px;font-weight:800;color:#0891b2;margin:0;">🔄 매물 회전율 분석</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';

    // ── Summary cards ──
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">';

    var newThisWeek = ageGroups['1주일 이내'].length;
    var longCount = longStay.length;
    var freshRate = totalActive > 0 ? Math.round(((ageGroups['1주일 이내'].length + ageGroups['2주일 이내'].length) / totalActive) * 100) : 0;

    var cards = [
      { label: '전체 매물', value: totalActive + '건', color: '#0891b2', icon: '🏠' },
      { label: '평균 등록일수', value: avgDays + '일', color: avgDays > 30 ? '#e53e3e' : '#059669', icon: '📅' },
      { label: '신규(1주)', value: newThisWeek + '건', color: '#059669', icon: '🆕' },
      { label: '장기체류(30일+)', value: longCount + '건', color: longCount > 5 ? '#e53e3e' : '#d97706', icon: '⏰' }
    ];

    cards.forEach(function(c) {
      html += '<div style="background:#f8f8f8;border-radius:10px;padding:12px;text-align:center;border-top:3px solid ' + c.color + ';">';
      html += '<div style="font-size:20px;margin-bottom:4px;">' + c.icon + '</div>';
      html += '<div style="font-size:18px;font-weight:800;color:' + c.color + ';">' + c.value + '</div>';
      html += '<div style="font-size:10px;color:#888;">' + c.label + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // ── 재고 연령 분포 바 차트 ──
    html += '<div style="margin-bottom:20px;">';
    html += '<h3 style="font-size:14px;font-weight:700;color:#333;margin-bottom:10px;">📊 재고 연령 분포</h3>';

    var ageColors = ['#059669', '#10b981', '#fbbf24', '#f97316', '#ef4444'];
    var ageKeys = Object.keys(ageGroups);
    ageKeys.forEach(function(key, i) {
      var count = ageGroups[key].length;
      var pct = totalActive > 0 ? ((count / totalActive) * 100).toFixed(1) : 0;
      var barW = totalActive > 0 ? Math.max(3, (count / totalActive) * 100) : 0;

      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
      html += '<span style="min-width:90px;font-size:12px;font-weight:600;color:#555;text-align:right;">' + escHtml(key) + '</span>';
      html += '<div style="flex:1;background:#f0f0f0;border-radius:6px;height:26px;overflow:hidden;position:relative;">';
      html += '<div style="width:' + barW + '%;height:100%;background:' + ageColors[i] + ';border-radius:6px;transition:width 0.5s;"></div>';
      html += '<span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:600;color:#333;">' + count + '건 (' + pct + '%)</span>';
      html += '</div></div>';
    });
    html += '</div>';

    // ── 유형별 평균 체류일 ──
    html += '<div style="margin-bottom:20px;">';
    html += '<h3 style="font-size:14px;font-weight:700;color:#333;margin-bottom:10px;">🏠 유형별 평균 체류일</h3>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';

    var typeKeys = Object.keys(typeAge).sort(function(a, b) {
      var bAvg = typeAge[b] && typeAge[b].count > 0 ? (typeAge[b].totalDays / typeAge[b].count) : 0;
      var aAvg = typeAge[a] && typeAge[a].count > 0 ? (typeAge[a].totalDays / typeAge[a].count) : 0;
      return bAvg - aAvg;
    });

    typeKeys.forEach(function(type) {
      var s = typeAge[type];
      if (!s || s.count === 0) return;
      var avgD = Math.round(s.totalDays / s.count);
      var bgColor = avgD >= 30 ? '#fef2f2' : avgD >= 14 ? '#fffbeb' : '#f0fdf4';
      var txtColor = avgD >= 30 ? '#e53e3e' : avgD >= 14 ? '#d97706' : '#059669';

      html += '<div style="background:' + bgColor + ';border:1px solid ' + txtColor + '33;border-radius:8px;padding:8px 14px;text-align:center;">';
      html += '<div style="font-size:12px;font-weight:700;color:' + txtColor + ';">' + escHtml(type) + '</div>';
      html += '<div style="font-size:18px;font-weight:800;color:' + txtColor + ';">' + avgD + '일</div>';
      html += '<div style="font-size:10px;color:#888;">' + s.count + '건</div>';
      html += '</div>';
    });
    html += '</div></div>';

    // ── 장기체류 매물 리스트 ──
    if (longStay.length > 0) {
      html += '<div style="margin-bottom:16px;">';
      html += '<h3 style="font-size:14px;font-weight:700;color:#e53e3e;margin-bottom:10px;">⚠️ 장기체류 매물 (' + longStay.length + '건) — 가격/조건 재검토 필요</h3>';
      html += '<div style="max-height:200px;overflow-y:auto;">';

      longStay.slice(0, 10).forEach(function(e) {
        var l = e.listing;
        var urgencyColor = e.days >= 60 ? '#e53e3e' : '#d97706';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:4px;background:#fef2f2;border-radius:6px;border-left:3px solid ' + urgencyColor + ';cursor:pointer;font-size:12px;" data-turnover-id="' + l.id + '">';
        html += '<div style="min-width:40px;text-align:center;font-weight:800;color:' + urgencyColor + ';">' + e.days + '일</div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(l.title || '매물') + '</div>';
        html += '<div style="font-size:10px;color:#888;">' + escHtml(l.address || '') + ' · ' + escHtml(l.type || '') + '</div>';
        html += '</div>';
        html += '<div style="font-weight:600;color:#e53e3e;white-space:nowrap;">' + escHtml(l.deposit ? l.deposit + '만' : (l.price ? l.price + '만' : '-')) + '</div>';
        html += '</div>';
      });

      if (longStay.length > 10) {
        html += '<div style="text-align:center;padding:6px;font-size:11px;color:#888;">... 외 ' + (longStay.length - 10) + '건</div>';
      }
      html += '</div></div>';
    }

    // ── 인사이트 ──
    html += '<div style="padding:14px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#0891b2;margin-bottom:8px;">💡 회전율 인사이트</div>';
    html += '<div style="font-size:12px;color:#555;line-height:1.8;">';
    html += '• 신선도 지수: <strong>' + freshRate + '%</strong> (2주 이내 매물 비율' + (freshRate >= 50 ? ' — 양호' : freshRate >= 30 ? ' — 보통' : ' — 갱신 필요') + ')<br>';

    // Slowest type
    if (typeKeys.length > 0 && typeAge[typeKeys[0]] && typeAge[typeKeys[0]].count > 0) {
      var slowest = typeKeys[0];
      var slowDays = Math.round(typeAge[slowest].totalDays / typeAge[slowest].count);
      html += '• 가장 느린 유형: <strong>' + escHtml(slowest) + '</strong> (평균 ' + slowDays + '일)<br>';
    }

    // Fastest type
    if (typeKeys.length > 1 && typeAge[typeKeys[typeKeys.length - 1]] && typeAge[typeKeys[typeKeys.length - 1]].count > 0) {
      var fastest = typeKeys[typeKeys.length - 1];
      var fastDays = Math.round(typeAge[fastest].totalDays / typeAge[fastest].count);
      html += '• 가장 빠른 유형: <strong>' + escHtml(fastest) + '</strong> (평균 ' + fastDays + '일)<br>';
    }

    html += '• 장기체류 비율: <strong>' + (totalActive > 0 ? Math.round((longCount / totalActive) * 100) : 0) + '%</strong>';
    if (longCount > 0) html += ' — 가격 조정 또는 매물 갱신을 검토하세요';
    html += '</div></div>';

    html += '</div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
      // Click on long-stay listing to go to detail
      var el = e.target.closest('[data-turnover-id]');
      if (el) {
        var id = el.getAttribute('data-turnover-id');
        var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
        if (found) { modal.remove(); window.WS.showDetail(found); }
      }
    });
  };

  // ========== Section AG: 매물 상세 메모 자동완성 태그 ==========
  window.WS._memoQuickTags = [
    '✅ 즉시입주', '🔑 열쇠보관', '📞 연락완료', '👀 현장확인필요',
    '💰 가격협의가능', '🔨 수리필요', '⭐ 추천매물', '🚫 계약불가',
    '📸 사진촬영필요', '🏗️ 리모델링', '👤 집주인직거래', '📋 서류확인중'
  ];

  // Enhance the memo save to support quick tags
  window.WS._originalSaveMemo = null;

  window.WS.showQuickMemoTags = function(listingId, memoInput) {
    var existing = document.getElementById('ws-quick-tags');
    if (existing) existing.remove();

    var container = document.createElement('div');
    container.id = 'ws-quick-tags';
    container.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;';

    window.WS._memoQuickTags.forEach(function(tag) {
      var btn = document.createElement('button');
      btn.textContent = tag;
      btn.style.cssText = 'padding:3px 8px;border:1px solid #ddd;border-radius:12px;font-size:10px;background:#fff;cursor:pointer;color:#555;transition:all 0.2s;';
      btn.addEventListener('mouseover', function() { this.style.background = '#e8f5e9'; this.style.borderColor = '#4CAF50'; });
      btn.addEventListener('mouseout', function() { this.style.background = '#fff'; this.style.borderColor = '#ddd'; });
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (memoInput) {
          var current = memoInput.value || '';
          memoInput.value = current + (current ? ' ' : '') + tag;
          memoInput.focus();
        }
      });
      container.appendChild(btn);
    });

    if (memoInput && memoInput.parentNode) {
      memoInput.parentNode.insertBefore(container, memoInput.nextSibling);
    }
  };

  // ============================================================================
  // Section AH: 매물 PDF 브리핑 자료 생성
  // ============================================================================
  window.WS.showPDFBriefing = function() {
    var selected = [];
    if (window.WS.state.selectedIds && window.WS.state.selectedIds.size > 0) {
      window.WS.state.selectedIds.forEach(function(id) {
        var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
        if (found) selected.push(found);
      });
    }
    if (selected.length === 0) {
      window.WS.showToast('PDF로 내보낼 매물을 먼저 선택해주세요', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-pdf');
    if (existing) existing.remove();

    var memos; try { memos = JSON.parse(localStorage.getItem('ws-memos') || '{}'); } catch(e) { memos = {}; }
    var favCats = window.WS._getFavCategories ? window.WS._getFavCategories() : {};

    var modal = document.createElement('div');
    modal.id = 'ws-modal-pdf';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:700px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#2D5A27,#4CAF50);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:18px;font-weight:800;">📄 PDF 브리핑 자료</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + selected.length + '건 매물 · 고객 전달용 전문 자료</div></div>';
    html += '<button id="ws-pdf-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    // 설정 옵션
    html += '<div style="padding:20px 24px;border-bottom:1px solid #eee;">';
    html += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:12px;">📋 포함 항목 설정</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    var pdfOpts = [
      { id: 'pdf-opt-photo', label: '📸 대표사진', checked: true },
      { id: 'pdf-opt-price', label: '💰 가격정보', checked: true },
      { id: 'pdf-opt-area', label: '📐 면적/구조', checked: true },
      { id: 'pdf-opt-extra', label: '🏠 추가정보', checked: true },
      { id: 'pdf-opt-memo', label: '📝 메모/특이사항', checked: true },
      { id: 'pdf-opt-map', label: '🗺️ 위치정보', checked: true },
      { id: 'pdf-opt-desc', label: '📄 상세설명', checked: false },
      { id: 'pdf-opt-category', label: '🏷️ 카테고리', checked: true }
    ];
    pdfOpts.forEach(function(opt) {
      html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#555;cursor:pointer;">';
      html += '<input type="checkbox" id="' + opt.id + '"' + (opt.checked ? ' checked' : '') + ' style="accent-color:#2D5A27;"> ' + opt.label;
      html += '</label>';
    });
    html += '</div>';

    // 고객명 입력
    html += '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;">';
    html += '<label style="font-size:13px;font-weight:600;color:#555;">고객명:</label>';
    html += '<input type="text" id="ws-pdf-customer" placeholder="예: 김철수 고객님" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;">';
    html += '</div>';
    html += '</div>';

    // 미리보기
    html += '<div style="padding:20px 24px;">';
    html += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:12px;">👁️ 미리보기</div>';
    html += '<div id="ws-pdf-preview" style="border:1px solid #e0e0e0;border-radius:10px;padding:16px;max-height:300px;overflow-y:auto;background:#fafafa;">';

    selected.forEach(function(listing, idx) {
      var cat = favCats[listing.id] || '';
      var catLabel = cat ? ' <span style="background:#e8f5e9;color:#2D5A27;padding:2px 8px;border-radius:10px;font-size:10px;">' + escHtml(cat) + '</span>' : '';
      var mainImg = '';
      if (listing.images && listing.images.length > 0) {
        mainImg = listing.images[0].url || listing.images[0];
      } else if (listing.listing_images && listing.listing_images.length > 0) {
        mainImg = listing.listing_images[0].url || listing.listing_images[0];
      }

      html += '<div style="display:flex;gap:12px;padding:10px 0;' + (idx > 0 ? 'border-top:1px solid #eee;' : '') + '">';
      if (mainImg) {
        html += '<img src="' + escHtml(mainImg) + '" style="width:80px;height:60px;object-fit:cover;border-radius:6px;" onerror="this.style.display=\'none\'">';
      }
      html += '<div style="flex:1;">';
      html += '<div style="font-size:13px;font-weight:700;color:#333;">' + (idx + 1) + '. ' + escHtml(listing.title || '-') + catLabel + '</div>';
      html += '<div style="font-size:12px;color:#666;margin-top:2px;">' + escHtml(listing.address || '-') + '</div>';
      html += '<div style="font-size:12px;color:#2D5A27;font-weight:600;margin-top:2px;">';
      if (listing.deal === '월세') {
        html += '보증금 ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + '억') : ((listing.deposit || 0) + '만')) + ' / 월세 ' + (listing.monthly || 0) + '만원';
      } else if (listing.deal === '전세') {
        html += '전세금 ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + '억') : ((listing.deposit || 0) + '만')) + '원';
      } else {
        html += '매매가 ' + ((listing.price || 0) >= 10000 ? ((listing.price/10000).toFixed(1) + '억') : ((listing.price || 0) + '만')) + '원';
      }
      html += '</div></div></div>';
    });

    html += '</div></div>';

    // 버튼
    html += '<div style="padding:16px 24px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;">';
    html += '<button id="ws-pdf-html-export" style="padding:10px 20px;background:#f0f0f0;border:1px solid #ddd;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">🖨️ 인쇄용 HTML</button>';
    html += '<button id="ws-pdf-clipboard" style="padding:10px 20px;background:#e8f5e9;border:1px solid #4CAF50;color:#2D5A27;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">📋 텍스트 복사</button>';
    html += '<button id="ws-pdf-generate" style="padding:10px 24px;background:linear-gradient(135deg,#2D5A27,#4CAF50);border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;">📄 PDF 생성</button>';
    html += '</div></div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    // Events
    document.getElementById('ws-pdf-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // PDF 생성 (인쇄 방식)
    document.getElementById('ws-pdf-generate').addEventListener('click', function() {
      window.WS._generatePrintablePDF(selected, memos, favCats);
    });

    // 인쇄용 HTML
    document.getElementById('ws-pdf-html-export').addEventListener('click', function() {
      window.WS._generatePrintablePDF(selected, memos, favCats);
    });

    // 텍스트 복사
    document.getElementById('ws-pdf-clipboard').addEventListener('click', function() {
      var customerName = document.getElementById('ws-pdf-customer').value || '';
      var text = '';
      if (customerName) text += '📋 ' + customerName + '님을 위한 매물 안내서\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += '🏢 WISHES 부동산 매물 브리핑\n';
      text += '📅 작성일: ' + new Date().toLocaleDateString('ko-KR') + '\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n\n';

      selected.forEach(function(listing, idx) {
        text += '【' + (idx + 1) + '】 ' + (listing.title || '-') + '\n';
        text += '📍 주소: ' + (listing.address || '-') + '\n';
        text += '💰 거래: ' + (listing.deal || '-');
        if (listing.deal === '월세') {
          text += ' · 보증금 ' + (listing.deposit || 0) + '만 / 월세 ' + (listing.monthly || 0) + '만\n';
        } else if (listing.deal === '전세') {
          text += ' · 전세금 ' + (listing.deposit || 0) + '만원\n';
        } else {
          text += ' · 매매가 ' + (listing.price || 0) + '만원\n';
        }
        text += '📐 면적: ' + (listing.area_m2 || '-') + 'm² (' + (listing.area_m2 ? (listing.area_m2 / 3.30579).toFixed(1) : '-') + '평)\n';
        text += '🏠 유형: ' + (listing.type || '-') + ' · ' + (listing.floor_current || '-') + '/' + (listing.floor_total || '-') + '층\n';
        if (listing.direction) text += '🧭 방향: ' + listing.direction + '\n';
        if (listing.parking) text += '🅿️ 주차: ' + listing.parking + '\n';
        if (listing.elevator) text += '🛗 엘리베이터: ' + listing.elevator + '\n';
        var memo = memos[listing.id];
        if (memo) text += '📝 메모: ' + memo + '\n';
        text += '\n';
      });

      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += 'WISHES | wishes.co.kr\n';
      text += '서울·경기 종합부동산 서비스\n';

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast('브리핑 텍스트가 복사되었습니다!', 'success');
        }).catch(function() {
          window.WS._fallbackCopy(text);
        });
      } else {
        window.WS._fallbackCopy(text);
      }
    });
  };

  // PDF용 인쇄 페이지 생성
  window.WS._generatePrintablePDF = function(selected, memos, favCats) {
    var customerName = document.getElementById('ws-pdf-customer') ? document.getElementById('ws-pdf-customer').value : '';
    var opts = {};
    ['pdf-opt-photo','pdf-opt-price','pdf-opt-area','pdf-opt-extra','pdf-opt-memo','pdf-opt-map','pdf-opt-desc','pdf-opt-category'].forEach(function(id) {
      var el = document.getElementById(id);
      opts[id] = el ? el.checked : true;
    });

    var printHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>WISHES 매물 브리핑</title>';
    printHtml += '<style>';
    printHtml += 'body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;margin:0;padding:20px;color:#333;font-size:12px;}';
    printHtml += '.cover{text-align:center;padding:60px 20px;page-break-after:always;}';
    printHtml += '.cover h1{font-size:28px;color:#2D5A27;margin-bottom:10px;}';
    printHtml += '.cover .sub{font-size:16px;color:#666;margin-bottom:30px;}';
    printHtml += '.cover .date{font-size:13px;color:#999;}';
    printHtml += '.listing{page-break-inside:avoid;margin-bottom:24px;border:1px solid #ddd;border-radius:10px;overflow:hidden;}';
    printHtml += '.listing-header{background:#f8faf8;padding:14px 18px;border-bottom:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;}';
    printHtml += '.listing-num{background:#2D5A27;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-right:10px;}';
    printHtml += '.listing-title{font-size:15px;font-weight:700;color:#333;}';
    printHtml += '.listing-body{padding:14px 18px;}';
    printHtml += '.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:10px;}';
    printHtml += '.info-item{display:flex;gap:6px;font-size:12px;}';
    printHtml += '.info-label{color:#888;min-width:60px;}';
    printHtml += '.info-value{color:#333;font-weight:600;}';
    printHtml += '.price-tag{font-size:16px;font-weight:800;color:#2D5A27;margin:8px 0;}';
    printHtml += '.listing-img{width:200px;height:150px;object-fit:cover;border-radius:8px;float:right;margin-left:12px;}';
    printHtml += '.memo-box{background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:8px 12px;margin-top:8px;font-size:11px;}';
    printHtml += '.cat-badge{display:inline-block;background:#e8f5e9;color:#2D5A27;padding:2px 8px;border-radius:10px;font-size:10px;margin-left:6px;}';
    printHtml += '.footer{text-align:center;padding:20px;color:#999;font-size:11px;border-top:1px solid #eee;margin-top:20px;}';
    printHtml += '@media print{body{padding:10px;}.listing{break-inside:avoid;}}';
    printHtml += '</style></head><body>';

    // 표지
    printHtml += '<div class="cover">';
    printHtml += '<div style="font-size:60px;margin-bottom:20px;">🏠</div>';
    printHtml += '<h1>WISHES 매물 브리핑</h1>';
    if (customerName) printHtml += '<div class="sub">' + escHtml(customerName) + '님을 위한 맞춤 매물 안내</div>';
    printHtml += '<div class="sub">' + selected.length + '건의 엄선된 매물 정보</div>';
    printHtml += '<div class="date">' + new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' }) + ' 작성</div>';
    printHtml += '<div style="margin-top:40px;padding-top:20px;border-top:2px solid #e8f5e9;">';
    printHtml += '<div style="font-size:14px;color:#2D5A27;font-weight:700;">WISHES | 서울·경기 종합부동산 서비스</div>';
    printHtml += '<div style="font-size:12px;color:#888;margin-top:4px;">wishes.co.kr</div>';
    printHtml += '</div></div>';

    // 매물 목록
    selected.forEach(function(listing, idx) {
      var cat = favCats[listing.id] || '';
      var mainImg = '';
      if (opts['pdf-opt-photo']) {
        if (listing.images && listing.images.length > 0) {
          mainImg = listing.images[0].url || listing.images[0];
        } else if (listing.listing_images && listing.listing_images.length > 0) {
          mainImg = listing.listing_images[0].url || listing.listing_images[0];
        }
      }

      printHtml += '<div class="listing">';
      printHtml += '<div class="listing-header">';
      printHtml += '<div style="display:flex;align-items:center;">';
      printHtml += '<span class="listing-num">' + (idx + 1) + '</span>';
      printHtml += '<span class="listing-title">' + escHtml(listing.title || '-') + '</span>';
      if (opts['pdf-opt-category'] && cat) printHtml += '<span class="cat-badge">' + escHtml(cat) + '</span>';
      printHtml += '</div>';
      printHtml += '<span style="font-size:11px;color:#999;">' + escHtml(listing.deal || '-') + '</span>';
      printHtml += '</div>';

      printHtml += '<div class="listing-body">';
      if (mainImg) printHtml += '<img class="listing-img" src="' + escHtml(mainImg) + '" onerror="this.style.display=\'none\'">';

      // 가격
      if (opts['pdf-opt-price']) {
        printHtml += '<div class="price-tag">';
        if (listing.deal === '월세') {
          printHtml += '보증금 ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + '억') : ((listing.deposit || 0) + '만')) + ' / 월세 ' + (listing.monthly || 0) + '만원';
        } else if (listing.deal === '전세') {
          printHtml += '전세금 ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + '억') : ((listing.deposit || 0) + '만')) + '원';
        } else {
          printHtml += '매매가 ' + ((listing.price || 0) >= 10000 ? ((listing.price/10000).toFixed(1) + '억') : ((listing.price || 0) + '만')) + '원';
        }
        if (listing.maintenance_fee) printHtml += ' <span style="font-size:11px;color:#888;">(관리비 ' + listing.maintenance_fee + '만)</span>';
        printHtml += '</div>';
      }

      printHtml += '<div style="font-size:12px;color:#666;margin-bottom:8px;">📍 ' + escHtml(listing.address || '-') + '</div>';

      // 정보 그리드
      if (opts['pdf-opt-area']) {
        printHtml += '<div class="info-grid">';
        printHtml += '<div class="info-item"><span class="info-label">면적</span><span class="info-value">' + (listing.area_m2 || '-') + 'm² (' + (listing.area_m2 ? (listing.area_m2 / 3.30579).toFixed(1) : '-') + '평)</span></div>';
        printHtml += '<div class="info-item"><span class="info-label">층수</span><span class="info-value">' + (listing.floor_current || '-') + '/' + (listing.floor_total || '-') + '층</span></div>';
        printHtml += '<div class="info-item"><span class="info-label">유형</span><span class="info-value">' + escHtml(listing.type || '-') + '</span></div>';
        printHtml += '<div class="info-item"><span class="info-label">방/욕실</span><span class="info-value">' + (listing.rooms || '-') + '/' + (listing.bathrooms || '-') + '</span></div>';
        printHtml += '</div>';
      }

      if (opts['pdf-opt-extra']) {
        printHtml += '<div class="info-grid">';
        if (listing.direction) printHtml += '<div class="info-item"><span class="info-label">방향</span><span class="info-value">' + escHtml(listing.direction) + '</span></div>';
        if (listing.parking) printHtml += '<div class="info-item"><span class="info-label">주차</span><span class="info-value">' + escHtml(listing.parking) + '</span></div>';
        if (listing.elevator) printHtml += '<div class="info-item"><span class="info-label">엘베</span><span class="info-value">' + listing.elevator + '</span></div>';
        if (listing.pet) printHtml += '<div class="info-item"><span class="info-label">반려동물</span><span class="info-value">' + listing.pet + '</span></div>';
        if (listing.built_year) printHtml += '<div class="info-item"><span class="info-label">준공</span><span class="info-value">' + listing.built_year + '</span></div>';
        printHtml += '</div>';
      }

      if (opts['pdf-opt-desc'] && listing.description) {
        printHtml += '<div style="margin-top:8px;font-size:11px;color:#555;line-height:1.6;border-top:1px solid #f0f0f0;padding-top:8px;">' + escHtml(listing.description).substring(0, 200) + '</div>';
      }

      if (opts['pdf-opt-memo'] && memos[listing.id]) {
        printHtml += '<div class="memo-box">📝 ' + escHtml(memos[listing.id]) + '</div>';
      }

      if (opts['pdf-opt-map'] && listing.lat && listing.lng) {
        printHtml += '<div style="margin-top:8px;font-size:11px;color:#888;">🗺️ 좌표: ' + listing.lat.toFixed(4) + ', ' + listing.lng.toFixed(4) + '</div>';
      }

      printHtml += '</div></div>';
    });

    // 푸터
    printHtml += '<div class="footer">';
    printHtml += '본 자료는 WISHES(wishes.co.kr)에서 생성된 매물 브리핑 자료입니다.<br>';
    printHtml += '상기 정보는 참고용이며, 실제 계약 시 현장 확인이 필요합니다.';
    printHtml += '</div>';
    printHtml += '</body></html>';

    var printWin = window.open('', '_blank', 'width=800,height=600');
    if (printWin) {
      printWin.document.write(printHtml);
      printWin.document.close();
      setTimeout(function() { printWin.print(); }, 500);
      window.WS.showToast('PDF 브리핑 자료가 생성되었습니다. 인쇄 대화상자에서 PDF로 저장해주세요.', 'success');
    } else {
      window.WS.showToast('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.', 'error');
    }
  };

  // ============================================================================
  // Section AI: 매물 스냅샷 비교 (가격 변동 감지)
  // ============================================================================
  window.WS._snapshotKey = 'ws_price_snapshots';

  window.WS._getSnapshots = function() {
    try { return JSON.parse(localStorage.getItem(window.WS._snapshotKey) || '{}'); } catch(e) { return {}; }
  };

  window.WS._saveSnapshots = function(data) {
    _safeSetItem(window.WS._snapshotKey, JSON.stringify(data));
  };

  // 자동 스냅샷 저장 (데이터 로드 시 호출)
  window.WS._autoSnapshot = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) return;

    var snapshots = window.WS._getSnapshots();
    var today = new Date().toISOString().split('T')[0];
    var changes = [];

    allData.forEach(function(listing) {
      var id = String(listing.id);
      var prev = snapshots[id];
      var current = {
        price: listing.price || 0,
        deposit: listing.deposit || 0,
        monthly: listing.monthly || 0,
        status: listing.status || '',
        date: today
      };

      if (prev) {
        // 가격 변동 감지
        if (prev.price !== current.price && (prev.price > 0 || current.price > 0)) {
          changes.push({ listing: listing, field: '매매가', from: prev.price, to: current.price, date: prev.date });
        }
        if (prev.deposit !== current.deposit && (prev.deposit > 0 || current.deposit > 0)) {
          changes.push({ listing: listing, field: '보증금', from: prev.deposit, to: current.deposit, date: prev.date });
        }
        if (prev.monthly !== current.monthly && (prev.monthly > 0 || current.monthly > 0)) {
          changes.push({ listing: listing, field: '월세', from: prev.monthly, to: current.monthly, date: prev.date });
        }
        if (prev.status !== current.status && prev.status && current.status) {
          changes.push({ listing: listing, field: '상태', from: prev.status, to: current.status, date: prev.date });
        }
      }

      snapshots[id] = current;
    });

    window.WS._saveSnapshots(snapshots);
    window.WS._latestChanges = changes;

    // 변동 있으면 알림
    if (changes.length > 0) {
      window.WS._showPriceChangeAlert(changes);
    }
  };

  window.WS._showPriceChangeAlert = function(changes) {
    var alertDiv = document.createElement('div');
    alertDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#fff;border-left:4px solid #ed8936;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,0.15);padding:16px 20px;z-index:100001;max-width:350px;animation:slideInRight 0.4s ease;';
    alertDiv.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<div style="font-size:14px;font-weight:700;color:#ed8936;">🔔 매물 변동 감지!</div>' +
      '<button onclick="this.closest(\'div\').remove()" style="background:none;border:none;cursor:pointer;font-size:16px;color:#999;">✕</button></div>' +
      '<div style="font-size:13px;color:#555;">' + changes.length + '건의 가격/상태 변동이 발견되었습니다.</div>' +
      '<button id="ws-view-changes-alert" style="margin-top:10px;width:100%;padding:8px;background:#ed8936;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">자세히 보기</button>';

    (document.querySelector('.ws-search-container') || document.body).appendChild(alertDiv);

    document.getElementById('ws-view-changes-alert').addEventListener('click', function() {
      alertDiv.remove();
      window.WS.showPriceChanges();
    });

    // 10초 후 자동 닫기
    setTimeout(function() { if (alertDiv.parentNode) alertDiv.remove(); }, 10000);
  };

  window.WS.showPriceChanges = function() {
    var changes = window.WS._latestChanges || [];
    var existing = document.getElementById('ws-modal-price-changes');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-price-changes';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:650px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#ed8936,#f6ad55);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:18px;font-weight:800;">📊 매물 변동 내역</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + changes.length + '건의 변동 감지</div></div>';
    html += '<button id="ws-changes-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    html += '<div style="padding:16px 24px;">';

    if (changes.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:#999;">';
      html += '<div style="font-size:40px;margin-bottom:12px;">✅</div>';
      html += '<div style="font-size:14px;">가격 변동 없음</div>';
      html += '<div style="font-size:12px;margin-top:4px;">모든 매물 가격이 이전과 동일합니다.</div>';
      html += '</div>';
    } else {
      changes.forEach(function(c, idx) {
        var diff = c.to - c.from;
        var isUp = diff > 0;
        var arrow = isUp ? '📈' : '📉';
        var diffColor = isUp ? '#e53e3e' : '#2D5A27';
        var diffText = (isUp ? '+' : '') + diff;

        html += '<div style="display:flex;gap:12px;padding:12px;' + (idx > 0 ? 'border-top:1px solid #f0f0f0;' : '') + 'border-radius:8px;cursor:pointer;" data-change-id="' + c.listing.id + '">';
        html += '<div style="font-size:24px;line-height:1;">' + arrow + '</div>';
        html += '<div style="flex:1;">';
        html += '<div style="font-size:13px;font-weight:700;color:#333;">' + escHtml(c.listing.title || '-') + '</div>';
        html += '<div style="font-size:12px;color:#888;margin-top:2px;">' + escHtml(c.listing.address || '-') + '</div>';
        html += '<div style="margin-top:6px;display:flex;align-items:center;gap:8px;">';
        html += '<span style="font-size:12px;color:#999;">' + escHtml(c.field) + '</span>';
        html += '<span style="font-size:12px;color:#999;text-decoration:line-through;">' + c.from + '만</span>';
        html += '<span style="font-size:12px;">→</span>';
        html += '<span style="font-size:13px;font-weight:700;color:' + diffColor + ';">' + c.to + '만</span>';
        html += '<span style="font-size:11px;color:' + diffColor + ';background:' + (isUp ? '#fef2f2' : '#f0fdf4') + ';padding:2px 6px;border-radius:10px;">' + diffText + '만</span>';
        html += '</div>';
        if (c.date) html += '<div style="font-size:10px;color:#bbb;margin-top:4px;">이전 기록: ' + c.date + '</div>';
        html += '</div></div>';
      });
    }

    html += '</div></div>';
    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    document.getElementById('ws-changes-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
      var row = e.target.closest('[data-change-id]');
      if (row) {
        var id = row.getAttribute('data-change-id');
        var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
        if (found) { modal.remove(); window.WS.showDetail(found); }
      }
    });
  };

  // ============================================================================
  // Section AJ: 매물 즐겨찾기 비교 분석표
  // ============================================================================
  window.WS.showFavCompare = function() {
    var favs; try { favs = JSON.parse(localStorage.getItem('ws-favorites') || '[]'); } catch(e) { favs = []; }
    var allData = window.WS.allListings || [];
    var favListings = [];
    favs.forEach(function(favId) {
      var found = allData.find(function(l) { return String(l.id) === String(favId); });
      if (found) favListings.push(found);
    });

    if (favListings.length < 2) {
      window.WS.showToast('비교할 즐겨찾기 매물이 2개 이상 필요합니다', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-fav-compare');
    if (existing) existing.remove();

    var memos; try { memos = JSON.parse(localStorage.getItem('ws-memos') || '{}'); } catch(e) { memos = {}; }
    var cats = window.WS._getFavCategories ? window.WS._getFavCategories() : {};

    var modal = document.createElement('div');
    modal.id = 'ws-modal-fav-compare';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:90%;max-width:900px;max-height:85vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:18px;font-weight:800;">⚖️ 즐겨찾기 비교 분석표</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + favListings.length + '개 매물 상세 비교</div></div>';
    html += '<button id="ws-fav-compare-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    // 비교 테이블
    html += '<div style="padding:0;overflow-x:auto;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';

    // 헤더
    html += '<thead><tr><th style="background:#f8f5ff;padding:12px 14px;text-align:left;font-weight:700;color:#7c3aed;border-bottom:2px solid #e9e3ff;min-width:100px;position:sticky;left:0;z-index:1;">항목</th>';
    favListings.forEach(function(l) {
      html += '<th style="background:#f8f5ff;padding:12px 14px;text-align:center;font-weight:700;color:#333;border-bottom:2px solid #e9e3ff;min-width:150px;">' + escHtml(l.title || '-').substring(0, 15) + '</th>';
    });
    html += '</tr></thead><tbody>';

    // 사진 행
    html += '<tr><td style="padding:10px 14px;font-weight:600;color:#7c3aed;background:#faf8ff;border-bottom:1px solid #f0f0f0;">📸 사진</td>';
    favListings.forEach(function(l) {
      var img = '';
      if (l.images && l.images.length > 0) img = l.images[0].url || l.images[0];
      else if (l.listing_images && l.listing_images.length > 0) img = l.listing_images[0].url || l.listing_images[0];
      html += '<td style="padding:10px 14px;text-align:center;border-bottom:1px solid #f0f0f0;">';
      if (img) html += '<img src="' + escHtml(img) + '" style="width:120px;height:80px;object-fit:cover;border-radius:6px;" onerror="this.style.display=\'none\'">';
      else html += '<span style="color:#ccc;">-</span>';
      html += '</td>';
    });
    html += '</tr>';

    // 비교 항목들
    var compareFields = [
      { label: '💰 거래유형', fn: function(l) { return l.deal || '-'; } },
      { label: '💵 가격', fn: function(l) {
        if (l.deal === '월세') return '보증금 ' + (l.deposit || 0) + '만\n월세 ' + (l.monthly || 0) + '만';
        if (l.deal === '전세') return '전세금 ' + (l.deposit || 0) + '만';
        return '매매가 ' + (l.price || 0) + '만';
      }},
      { label: '🏠 유형', fn: function(l) { return l.type || '-'; } },
      { label: '📍 주소', fn: function(l) { return (l.address || '-').substring(0, 25); } },
      { label: '📐 면적', fn: function(l) { return (l.area_m2 || '-') + 'm² (' + (l.area_m2 ? (l.area_m2 / 3.30579).toFixed(1) : '-') + '평)'; } },
      { label: '🏗️ 층수', fn: function(l) { return (l.floor_current || '-') + '/' + (l.floor_total || '-') + '층'; } },
      { label: '🚪 방/욕실', fn: function(l) { return (l.rooms || '-') + '/' + (l.bathrooms || '-'); } },
      { label: '🧭 방향', fn: function(l) { return l.direction || '-'; } },
      { label: '🅿️ 주차', fn: function(l) { return l.parking || '-'; } },
      { label: '🛗 엘베', fn: function(l) { return l.elevator || '-'; } },
      { label: '🐾 반려동물', fn: function(l) { return l.pet || '-'; } },
      { label: '💰 관리비', fn: function(l) { return l.maintenance_fee ? l.maintenance_fee + '만' : '-'; } },
      { label: '📅 등록일', fn: function(l) { return l.created_at ? l.created_at.split('T')[0] : '-'; } },
      { label: '🏷️ 카테고리', fn: function(l) { return cats[l.id] || '미분류'; } },
      { label: '📝 메모', fn: function(l) { return memos[l.id] ? memos[l.id].substring(0, 50) : '-'; } }
    ];

    // 가격 최저 하이라이트를 위해 미리 계산
    var prices = favListings.map(function(l) {
      if (l.deal === '월세') return (l.deposit || 0) + (l.monthly || 0) * 12;
      if (l.deal === '전세') return l.deposit || 0;
      return l.price || 0;
    });
    var positivePrices = prices.filter(function(p) { return p > 0; });
    var minPrice = positivePrices.length > 0 ? Math.min.apply(null, positivePrices) : 0;

    compareFields.forEach(function(field, fi) {
      var bgColor = fi % 2 === 0 ? '#faf8ff' : '#fff';
      html += '<tr><td style="padding:10px 14px;font-weight:600;color:#7c3aed;background:' + bgColor + ';border-bottom:1px solid #f0f0f0;white-space:nowrap;">' + field.label + '</td>';
      favListings.forEach(function(l, li) {
        var val = field.fn(l);
        var highlight = '';
        // 가격 최저 하이라이트
        if (field.label === '💵 가격' && prices[li] === minPrice && minPrice > 0) {
          highlight = 'background:#f0fdf4;font-weight:700;color:#059669;';
        }
        html += '<td style="padding:10px 14px;text-align:center;border-bottom:1px solid #f0f0f0;' + highlight + 'white-space:pre-line;">' + escHtml(String(val)) + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    // 요약
    html += '<div style="padding:16px 24px;border-top:1px solid #eee;background:#f8f5ff;border-radius:0 0 16px 16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:8px;">💡 비교 요약</div>';
    html += '<div style="font-size:12px;color:#555;line-height:1.8;">';

    // 최저가 매물
    var cheapIdx = prices.indexOf(minPrice);
    if (cheapIdx >= 0 && minPrice > 0) {
      html += '• 가장 경제적: <strong>' + escHtml(favListings[cheapIdx].title || '-') + '</strong><br>';
    }
    // 최대 면적
    var areas = favListings.map(function(l) { return l.area_m2 || 0; });
    var maxArea = areas.length > 0 ? Math.max.apply(null, areas) : 0;
    var bigIdx = areas.indexOf(maxArea);
    if (bigIdx >= 0 && maxArea > 0) {
      html += '• 가장 넓은 면적: <strong>' + escHtml(favListings[bigIdx].title || '-') + '</strong> (' + maxArea + 'm²)<br>';
    }
    // 최신 등록
    var dates = favListings.map(function(l) { return l.created_at || ''; });
    var newest = dates.reduce(function(a, b) { return a > b ? a : b; }, '');
    var newIdx = dates.indexOf(newest);
    if (newIdx >= 0 && newest) {
      html += '• 가장 최근 등록: <strong>' + escHtml(favListings[newIdx].title || '-') + '</strong>';
    }
    html += '</div></div>';
    html += '</div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    document.getElementById('ws-fav-compare-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  };

  // ============================================================================
  // Section AL: 자동 새로고침 타이머 (실시간 매물 모니터링)
  // ============================================================================
  window.WS._autoRefreshInterval = null;
  window.WS._autoRefreshSeconds = 0;
  window.WS._autoRefreshStartTime = null;
  window.WS._autoRefreshMs = 0;
  window.WS._countdownTimer = null;

  window.WS.showAutoRefreshTimer = function() {
    var existing = document.getElementById('ws-modal-autorefresh');
    if (existing) existing.remove();

    var isRunning = !!window.WS._autoRefreshInterval;
    var currentMin = parseInt(localStorage.getItem('ws_autorefresh_min') || '5');

    var modal = document.createElement('div');
    modal.id = 'ws-modal-autorefresh';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#059669,#34d399);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:18px;font-weight:800;">⏱️ 자동 새로고침</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">실시간 매물 모니터링</div></div>';
    html += '<button id="ws-autorefresh-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    html += '<div style="padding:24px;">';

    // 상태 표시
    html += '<div style="text-align:center;margin-bottom:20px;">';
    if (isRunning) {
      html += '<div style="font-size:48px;margin-bottom:8px;">🟢</div>';
      html += '<div style="font-size:16px;font-weight:700;color:#059669;">모니터링 중</div>';
      html += '<div id="ws-refresh-countdown" style="font-size:13px;color:#888;margin-top:4px;">다음 새로고침까지 --:--</div>';
    } else {
      html += '<div style="font-size:48px;margin-bottom:8px;">⏸️</div>';
      html += '<div style="font-size:16px;font-weight:700;color:#999;">정지됨</div>';
    }
    html += '</div>';

    // 간격 설정
    html += '<div style="margin-bottom:20px;">';
    html += '<div style="font-size:13px;font-weight:600;color:#555;margin-bottom:8px;">새로고침 간격</div>';
    html += '<div style="display:flex;gap:8px;">';
    [1, 3, 5, 10, 15, 30].forEach(function(m) {
      var active = m === currentMin;
      html += '<button class="ws-refresh-interval" data-min="' + m + '" style="flex:1;padding:10px 0;border:' + (active ? '2px solid #059669' : '1px solid #ddd') + ';background:' + (active ? '#f0fdf4' : '#fff') + ';border-radius:8px;cursor:pointer;font-size:13px;font-weight:' + (active ? '700' : '500') + ';color:' + (active ? '#059669' : '#555') + ';">' + m + '분</button>';
    });
    html += '</div></div>';

    // 버튼
    html += '<div style="display:flex;gap:10px;">';
    if (isRunning) {
      html += '<button id="ws-refresh-stop" style="flex:1;padding:12px;background:#fef2f2;border:1px solid #e53e3e;color:#e53e3e;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">⏹ 정지</button>';
    } else {
      html += '<button id="ws-refresh-start" style="flex:1;padding:12px;background:linear-gradient(135deg,#059669,#34d399);border:none;color:#fff;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">▶ 모니터링 시작</button>';
    }
    html += '</div>';

    // 알림 설정
    html += '<div style="margin-top:16px;padding:12px;background:#f8faf8;border-radius:8px;font-size:12px;color:#666;">';
    html += '💡 자동 새로고침 시 가격 변동이 감지되면 알림이 표시됩니다.';
    html += '</div>';

    html += '</div></div>';
    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    // Events
    var arCloseBtn = document.getElementById('ws-autorefresh-close');
    if (arCloseBtn) arCloseBtn.addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // 간격 선택
    modal.querySelectorAll('.ws-refresh-interval').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var min = parseInt(this.getAttribute('data-min'));
        _safeSetItem('ws_autorefresh_min', String(min));
        modal.remove();
        window.WS.showAutoRefreshTimer();
      });
    });

    // 시작/정지
    var startBtn = document.getElementById('ws-refresh-start');
    var stopBtn = document.getElementById('ws-refresh-stop');

    if (startBtn) {
      startBtn.addEventListener('click', function() {
        window.WS._startAutoRefresh(currentMin);
        modal.remove();
        window.WS.showToast('⏱️ ' + currentMin + '분 간격 자동 새로고침 시작', 'success');
      });
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', function() {
        window.WS._stopAutoRefresh();
        modal.remove();
        window.WS.showToast('자동 새로고침 정지됨');
      });
    }

    // 카운트다운 업데이트
    if (isRunning) {
      window.WS._updateCountdown();
    }
  };

  window.WS._startAutoRefresh = function(minutes) {
    window.WS._stopAutoRefresh();
    var ms = minutes * 60 * 1000;
    window.WS._autoRefreshSeconds = minutes * 60;
    window.WS._autoRefreshStartTime = Date.now();
    window.WS._autoRefreshMs = ms;

    window.WS._autoRefreshInterval = setInterval(function() {
      // Admin API 단일 호출로 전체 데이터 다시 가져오기 (v2.1.0)
      fetch(ADMIN_API_MINIMAL, {
        headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN }
      })
        .then(function(r) {
          if (!r.ok) throw new Error('서버 오류: ' + r.status);
          return r.json();
        })
        .then(function(data) {
          if (data.success && Array.isArray(data.data)) {
            var refreshItems = normalizeImages(data.data);
            if (refreshItems.length > 0) {
              window.WS.allListings = refreshItems;
              if (window.WS._autoSnapshot) window.WS._autoSnapshot();
              window.WS.renderAll();
              window.WS.showToast('🔄 매물 데이터가 갱신되었습니다 (' + refreshItems.length + '건, ' + new Date().toLocaleTimeString('ko-KR') + ')');
            }
          }
        }).catch(function() {
          window.WS.showToast('새로고침 실패: 네트워크 오류', 'error');
        });
      window.WS._autoRefreshStartTime = Date.now();
    }, ms);

    // 카운트다운 표시용 타이머
    window.WS._countdownTimer = setInterval(function() {
      window.WS._updateCountdown();
    }, 1000);
  };

  window.WS._stopAutoRefresh = function() {
    if (window.WS._autoRefreshInterval) {
      clearInterval(window.WS._autoRefreshInterval);
      window.WS._autoRefreshInterval = null;
    }
    if (window.WS._countdownTimer) {
      clearInterval(window.WS._countdownTimer);
      window.WS._countdownTimer = null;
    }
  };

  window.WS._updateCountdown = function() {
    var el = document.getElementById('ws-refresh-countdown');
    if (!el || !window.WS._autoRefreshStartTime) return;
    var elapsed = Date.now() - window.WS._autoRefreshStartTime;
    var remaining = Math.max(0, window.WS._autoRefreshMs - elapsed);
    var sec = Math.floor(remaining / 1000);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    el.textContent = '다음 새로고침까지 ' + m + ':' + (s < 10 ? '0' : '') + s;
  };

  // ============================================================================
  // Section AM: 매물 밀집도 히트맵 (텍스트 기반)
  // ============================================================================
  window.WS.showHeatmap = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) {
      window.WS.showToast('매물 데이터가 없습니다', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-heatmap');
    if (existing) existing.remove();

    // 지역별 집계
    var regionData = {};
    var totalCount = 0;
    allData.forEach(function(l) {
      var addr = l.address || '';
      var match = addr.match(/([가-힣]+[구군시])/);
      var region = match ? match[1] : '기타';
      if (!regionData[region]) {
        regionData[region] = { count: 0, totalPrice: 0, totalDeposit: 0, types: {}, deals: {} };
      }
      regionData[region].count++;
      totalCount++;
      regionData[region].totalPrice += (l.price || 0);
      regionData[region].totalDeposit += (l.deposit || 0);
      var type = l.type || '기타';
      regionData[region].types[type] = (regionData[region].types[type] || 0) + 1;
      var deal = l.deal || '기타';
      regionData[region].deals[deal] = (regionData[region].deals[deal] || 0) + 1;
    });

    var regionKeys = Object.keys(regionData).sort(function(a, b) {
      return regionData[b].count - regionData[a].count;
    });
    var maxRegionCount = regionKeys.length > 0 ? regionData[regionKeys[0]].count : 1;

    var modal = document.createElement('div');
    modal.id = 'ws-modal-heatmap';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:700px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#dc2626,#f87171);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:18px;font-weight:800;">🗺️ 매물 밀집도 분석</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + regionKeys.length + '개 지역 · 총 ' + totalCount + '건</div></div>';
    html += '<button id="ws-heatmap-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    // 히트맵 그리드
    html += '<div style="padding:20px 24px;">';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:20px;">';

    regionKeys.forEach(function(region) {
      var d = regionData[region];
      var intensity = d.count / maxRegionCount;
      // 색상: 연한 초록 → 진한 빨강
      var r = Math.round(34 + intensity * 200);
      var g = Math.round(197 - intensity * 150);
      var b = Math.round(94 - intensity * 60);
      var bgColor = 'rgb(' + r + ',' + g + ',' + b + ')';
      var textColor = intensity > 0.5 ? '#fff' : '#333';
      var pct = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : '0.0';

      // 주요 유형
      var topType = Object.keys(d.types).sort(function(a, b) { return d.types[b] - d.types[a]; })[0] || '-';

      html += '<div style="background:' + bgColor + ';border-radius:12px;padding:14px;text-align:center;cursor:pointer;transition:transform 0.2s;" data-heatmap-region="' + escHtml(region) + '">';
      html += '<div style="font-size:15px;font-weight:800;color:' + textColor + ';">' + escHtml(region) + '</div>';
      html += '<div style="font-size:24px;font-weight:800;color:' + textColor + ';margin:4px 0;">' + d.count + '</div>';
      html += '<div style="font-size:10px;color:' + textColor + ';opacity:0.8;">' + pct + '% · ' + escHtml(topType) + '</div>';
      html += '</div>';
    });

    html += '</div>';

    // 상세 테이블
    html += '<div style="margin-top:10px;">';
    html += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:10px;">📊 지역별 상세 분석</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<tr style="background:#f8f8f8;"><th style="padding:8px;text-align:left;border-bottom:2px solid #e0e0e0;">지역</th><th style="padding:8px;text-align:center;">매물수</th><th style="padding:8px;text-align:center;">비율</th><th style="padding:8px;text-align:center;">평균보증금</th><th style="padding:8px;text-align:center;">주요유형</th><th style="padding:8px;text-align:center;">거래유형</th></tr>';

    regionKeys.forEach(function(region, idx) {
      var d = regionData[region];
      var avgDep = d.count > 0 ? Math.round(d.totalDeposit / d.count) : 0;
      var pct = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : '0.0';
      var topType = Object.keys(d.types).sort(function(a, b) { return d.types[b] - d.types[a]; })[0] || '-';
      var topDeal = Object.keys(d.deals).sort(function(a, b) { return d.deals[b] - d.deals[a]; })[0] || '-';
      var bgRow = idx % 2 === 0 ? '#fff' : '#fafafa';

      html += '<tr style="background:' + bgRow + ';">';
      html += '<td style="padding:8px;font-weight:600;border-bottom:1px solid #f0f0f0;">' + escHtml(region) + '</td>';
      html += '<td style="padding:8px;text-align:center;font-weight:700;color:#2D5A27;border-bottom:1px solid #f0f0f0;">' + d.count + '건</td>';
      html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;">' + pct + '%</td>';
      html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;">' + (avgDep >= 10000 ? (avgDep / 10000).toFixed(1) + '억' : avgDep + '만') + '</td>';
      html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;">' + escHtml(topType) + '</td>';
      html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;">' + escHtml(topDeal) + '</td>';
      html += '</tr>';
    });

    html += '</table></div>';

    // 인사이트
    html += '<div style="margin-top:16px;padding:14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:8px;">🔥 밀집도 인사이트</div>';
    html += '<div style="font-size:12px;color:#555;line-height:1.8;">';
    if (regionKeys.length > 0) {
      html += '• 최다 매물 지역: <strong>' + escHtml(regionKeys[0]) + '</strong> (' + regionData[regionKeys[0]].count + '건, ' + (totalCount > 0 ? ((regionData[regionKeys[0]].count / totalCount) * 100).toFixed(0) : 0) + '%)<br>';
    }
    if (regionKeys.length > 1) {
      html += '• 2위 지역: <strong>' + escHtml(regionKeys[1]) + '</strong> (' + regionData[regionKeys[1]].count + '건)<br>';
    }
    var diverseRegions = regionKeys.filter(function(r) { return Object.keys(regionData[r].types).length >= 3; });
    if (diverseRegions.length > 0) {
      html += '• 매물 다양성 높은 지역: ' + diverseRegions.slice(0, 3).map(function(r) { return '<strong>' + escHtml(r) + '</strong>'; }).join(', ');
    }
    html += '</div></div>';

    html += '</div></div>';
    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    var hmCloseBtn = document.getElementById('ws-heatmap-close');
    if (hmCloseBtn) hmCloseBtn.addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  };

  // ============================================================================
  // Section AN: 매물 공유 링크 생성 (선택 매물 URL 공유)
  // ============================================================================
  window.WS.showShareLink = function() {
    var selected = [];
    if (window.WS.state.selectedIds && window.WS.state.selectedIds.size > 0) {
      window.WS.state.selectedIds.forEach(function(id) {
        var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
        if (found) selected.push(found);
      });
    }
    if (selected.length === 0) {
      window.WS.showToast('공유할 매물을 먼저 선택해주세요', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-share');
    if (existing) existing.remove();

    var memos; try { memos = JSON.parse(localStorage.getItem('ws-memos') || '{}'); } catch(e) { memos = {}; }

    var modal = document.createElement('div');
    modal.id = 'ws-modal-share';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:550px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#2563eb,#60a5fa);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:18px;font-weight:800;">🔗 매물 공유</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + selected.length + '건 매물 공유 준비</div></div>';
    html += '<button id="ws-share-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    html += '<div style="padding:20px 24px;">';

    // 공유 형식 선택
    html += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:12px;">📋 공유 형식</div>';
    html += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
    html += '<button class="ws-share-format" data-format="kakao" style="flex:1;padding:12px;background:#fee500;border:2px solid #f5d800;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;color:#3c1e1e;">💬 카카오톡</button>';
    html += '<button class="ws-share-format" data-format="sms" style="flex:1;padding:12px;background:#e8f5e9;border:2px solid #4CAF50;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;color:#2D5A27;">📱 문자/SMS</button>';
    html += '<button class="ws-share-format" data-format="email" style="flex:1;padding:12px;background:#e3f2fd;border:2px solid #2196f3;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;color:#1565c0;">📧 이메일</button>';
    html += '</div>';

    // 미리보기
    html += '<div id="ws-share-preview" style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:10px;padding:16px;margin-bottom:16px;font-size:12px;color:#555;line-height:1.8;white-space:pre-wrap;max-height:250px;overflow-y:auto;">';
    html += window.WS._generateShareText(selected, memos, 'kakao');
    html += '</div>';

    // 복사 버튼
    html += '<button id="ws-share-copy" style="width:100%;padding:14px;background:linear-gradient(135deg,#2563eb,#60a5fa);border:none;color:#fff;border-radius:10px;cursor:pointer;font-size:15px;font-weight:700;">📋 텍스트 복사하기</button>';

    html += '</div></div>';
    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    // Events
    var shareCloseBtn = document.getElementById('ws-share-close');
    if (shareCloseBtn) shareCloseBtn.addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // 형식 전환
    modal.querySelectorAll('.ws-share-format').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var format = this.getAttribute('data-format');
        modal.querySelectorAll('.ws-share-format').forEach(function(b) { b.style.opacity = '0.5'; });
        this.style.opacity = '1';
        var preview = document.getElementById('ws-share-preview');
        if (preview) preview.textContent = window.WS._generateShareText(selected, memos, format);
      });
    });

    // 복사
    document.getElementById('ws-share-copy').addEventListener('click', function() {
      var preview = document.getElementById('ws-share-preview');
      var text = preview ? preview.textContent : '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast('매물 정보가 복사되었습니다! 붙여넣기 해주세요', 'success');
        }).catch(function() { window.WS._fallbackCopy(text); });
      } else {
        window.WS._fallbackCopy(text);
      }
    });
  };

  window.WS._generateShareText = function(listings, memos, format) {
    var text = '';
    var today = new Date().toLocaleDateString('ko-KR');

    if (format === 'kakao') {
      text += '🏠 WISHES 매물 안내\n';
      text += '━━━━━━━━━━━━━━\n';
      text += '📅 ' + today + '\n\n';
      listings.forEach(function(l, i) {
        text += '【' + (i + 1) + '】 ' + (l.title || '-') + '\n';
        text += '📍 ' + (l.address || '-') + '\n';
        text += '💰 ' + (l.deal || '-') + ' ';
        if (l.deal === '월세') text += '보증금 ' + (l.deposit || 0) + '만/월세 ' + (l.monthly || 0) + '만';
        else if (l.deal === '전세') text += '전세금 ' + (l.deposit || 0) + '만';
        else text += '매매가 ' + (l.price || 0) + '만';
        text += '\n';
        text += '📐 ' + (l.area_m2 || '-') + 'm² · ' + (l.type || '-') + ' · ' + (l.floor_current || '-') + '층\n';
        if (memos[l.id]) text += '📝 ' + memos[l.id] + '\n';
        text += '\n';
      });
      text += '━━━━━━━━━━━━━━\n';
      text += 'WISHES | wishes.co.kr 💚';
    } else if (format === 'sms') {
      text += '[WISHES 매물안내] ' + today + '\n\n';
      listings.forEach(function(l, i) {
        text += (i + 1) + '. ' + (l.title || '-') + '\n';
        text += '  ' + (l.address || '-') + '\n';
        text += '  ' + (l.deal || '-') + ' ';
        if (l.deal === '월세') text += (l.deposit || 0) + '/' + (l.monthly || 0) + '만';
        else if (l.deal === '전세') text += (l.deposit || 0) + '만';
        else text += (l.price || 0) + '만';
        text += ' · ' + (l.area_m2 || '-') + 'm²\n\n';
      });
      text += 'WISHES wishes.co.kr';
    } else {
      text += '안녕하세요, WISHES 부동산입니다.\n\n';
      text += '요청하신 매물 ' + listings.length + '건을 안내드립니다.\n';
      text += '작성일: ' + today + '\n\n';
      listings.forEach(function(l, i) {
        text += '■ ' + (i + 1) + '. ' + (l.title || '-') + '\n';
        text += '  - 주소: ' + (l.address || '-') + '\n';
        text += '  - 거래: ' + (l.deal || '-');
        if (l.deal === '월세') text += ' (보증금 ' + (l.deposit || 0) + '만 / 월세 ' + (l.monthly || 0) + '만)\n';
        else if (l.deal === '전세') text += ' (전세금 ' + (l.deposit || 0) + '만)\n';
        else text += ' (매매가 ' + (l.price || 0) + '만)\n';
        text += '  - 면적: ' + (l.area_m2 || '-') + 'm² (' + (l.area_m2 ? (l.area_m2 / 3.30579).toFixed(1) : '-') + '평)\n';
        text += '  - 유형: ' + (l.type || '-') + ' · ' + (l.floor_current || '-') + '/' + (l.floor_total || '-') + '층\n';
        if (l.direction) text += '  - 방향: ' + l.direction + '\n';
        if (l.parking) text += '  - 주차: ' + l.parking + '\n';
        text += '\n';
      });
      text += '상세 문의는 편하게 연락주세요.\nWISHES | wishes.co.kr';
    }
    return text;
  };

  // ============================================================================
  // Section AO: 원클릭 필터 퀵버튼
  // ============================================================================
  window.WS._quickFilters = [
    { label: '🔥 신규매물', desc: '1주일 이내', fn: function(l) { if (!l.created_at) return false; var d = (Date.now() - new Date(l.created_at).getTime()) / 86400000; return d <= 7; } },
    { label: '💰 1억이하', desc: '보증금 기준', fn: function(l) { return (l.deposit || l.price || 0) <= 10000; } },
    { label: '🏠 원룸', desc: '원룸만', fn: function(l) { return (l.type || '').indexOf('원룸') >= 0; } },
    { label: '🏢 오피스텔', desc: '오피스텔만', fn: function(l) { return (l.type || '').indexOf('오피스텔') >= 0; } },
    { label: '📦 월세', desc: '월세만', fn: function(l) { return l.deal === '월세'; } },
    { label: '🏦 전세', desc: '전세만', fn: function(l) { return l.deal === '전세'; } },
    { label: '💎 매매', desc: '매매만', fn: function(l) { return l.deal === '매매'; } },
    { label: '⭐ 즐겨찾기', desc: '관심매물', fn: function(l) { var favs; try { favs = JSON.parse(localStorage.getItem('ws-favorites') || '[]'); } catch(e) { favs = []; } return favs.indexOf(String(l.id)) >= 0; } }
  ];

  window.WS._activeQuickFilter = null;

  window.WS.showQuickFilters = function() {
    var existing = document.getElementById('ws-quick-filter-bar');
    if (existing) { existing.remove(); window.WS._activeQuickFilter = null; window.WS.renderAll(); return; }

    var bar = document.createElement('div');
    bar.id = 'ws-quick-filter-bar';
    bar.style.cssText = 'display:flex;gap:6px;padding:8px 12px;background:linear-gradient(to right,#f0fdf4,#ecfeff);border:1px solid #a7f3d0;border-radius:10px;margin-bottom:10px;flex-wrap:wrap;align-items:center;';

    bar.innerHTML = '<span style="font-size:12px;font-weight:700;color:#059669;margin-right:4px;">⚡ 퀵필터:</span>';

    window.WS._quickFilters.forEach(function(qf, idx) {
      bar.innerHTML += '<button class="ws-quick-filter-btn" data-qf-idx="' + idx + '" style="padding:6px 12px;background:#fff;border:1px solid #d1d5db;border-radius:20px;cursor:pointer;font-size:11px;font-weight:600;color:#555;transition:all 0.2s;white-space:nowrap;">' + qf.label + '</button>';
    });
    bar.innerHTML += '<button id="ws-qf-clear" style="padding:6px 12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:20px;cursor:pointer;font-size:11px;font-weight:600;color:#e53e3e;">✕ 해제</button>';

    var container = document.getElementById('ws-listings');
    if (container && container.parentNode) {
      container.parentNode.insertBefore(bar, container);
    }

    // Event delegation
    bar.addEventListener('click', function(e) {
      var btn = e.target.closest('.ws-quick-filter-btn');
      if (btn) {
        var idx = parseInt(btn.getAttribute('data-qf-idx'));
        var qf = window.WS._quickFilters[idx];
        if (!qf) return;

        // 토글
        if (window.WS._activeQuickFilter === idx) {
          window.WS._activeQuickFilter = null;
          bar.querySelectorAll('.ws-quick-filter-btn').forEach(function(b) {
            b.style.background = '#fff'; b.style.color = '#555'; b.style.borderColor = '#d1d5db';
          });
          window.WS.renderAll();
          return;
        }

        window.WS._activeQuickFilter = idx;
        bar.querySelectorAll('.ws-quick-filter-btn').forEach(function(b) {
          b.style.background = '#fff'; b.style.color = '#555'; b.style.borderColor = '#d1d5db';
        });
        btn.style.background = '#059669'; btn.style.color = '#fff'; btn.style.borderColor = '#059669';

        // 필터 적용
        var allData = window.WS.allListings || [];
        var filtered = allData.filter(qf.fn);
        window.WS.showToast(qf.label + ' ' + filtered.length + '건 필터됨');

        // 렌더링 (필터 결과만)
        window.WS._quickFilteredData = filtered;
        window.WS.renderAll();
      }

      if (e.target.id === 'ws-qf-clear' || e.target.closest('#ws-qf-clear')) {
        window.WS._activeQuickFilter = null;
        window.WS._quickFilteredData = null;
        bar.querySelectorAll('.ws-quick-filter-btn').forEach(function(b) {
          b.style.background = '#fff'; b.style.color = '#555'; b.style.borderColor = '#d1d5db';
        });
        window.WS.renderAll();
        window.WS.showToast('퀵필터 해제됨');
      }
    });
  };

  // renderAll 통합 훅: 퀵필터 + 경과일 배지 (이중 훅 방지)
  var _origRenderAllBase = window.WS.renderAll;
  if (_origRenderAllBase) {
    window.WS.renderAll = function() {
      // 1) 퀵필터 활성화 시 필터링된 데이터로 렌더링
      if (window.WS._activeQuickFilter !== null && window.WS._quickFilteredData) {
        var origData = window.WS.allListings;
        window.WS.allListings = window.WS._quickFilteredData;
        _origRenderAllBase.call(window.WS);
        window.WS.allListings = origData;
      } else {
        _origRenderAllBase.call(window.WS);
      }
      // 2) 렌더링 후 경과일 배지 삽입
      setTimeout(function() {
        var items = document.querySelectorAll('.ws-listing-item');
        items.forEach(function(item) {
          var lid = item.dataset.id;
          if (!lid) return;
          var listing = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(lid); });
          if (!listing || !listing.created_at) return;
          var days = window.WS._calcDaysAgo ? window.WS._calcDaysAgo(listing.created_at) : null;
          var badge = window.WS._getAgeBadge ? window.WS._getAgeBadge(days) : '';
          if (!badge) return;
          if (item.querySelector('.ws-age-badge')) return;
          var titleEl = item.querySelector('.ws-listing-title, h3, h4');
          if (titleEl) {
            var span = document.createElement('span');
            span.className = 'ws-age-badge';
            span.innerHTML = badge;
            titleEl.appendChild(span);
          }
        });
      }, 100);
    };
  }

  // =========================================================
  // AP) 키보드 단축키 시스템 (Keyboard Shortcuts)
  // =========================================================

  window.WS._shortcutsEnabled = true;

  window.WS.showKeyboardShortcuts = function() {
    var existing = document.getElementById('ws-modal-shortcuts');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-shortcuts';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var shortcuts = [
      { key: 'Ctrl + A', desc: '전체 선택' },
      { key: 'Ctrl + D', desc: '전체 해제' },
      { key: 'Ctrl + F', desc: '검색 포커스' },
      { key: 'Ctrl + P', desc: 'PDF 브리핑' },
      { key: 'Ctrl + E', desc: '엑셀 내보내기' },
      { key: 'Ctrl + B', desc: 'AI 브리핑 생성' },
      { key: 'Ctrl + K', desc: '카카오톡 공유' },
      { key: 'Ctrl + M', desc: '다크모드 토글' },
      { key: '←/→', desc: '페이지 이동' },
      { key: 'Esc', desc: '모달 닫기' },
      { key: '?', desc: '단축키 도움말' }
    ];

    var html = '<div style="background:#fff;border-radius:16px;width:480px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:18px;font-weight:800;">⌨️ 키보드 단축키</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">빠른 작업을 위한 단축키 목록</div></div>';
    html += '<button id="ws-shortcuts-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    html += '<div style="padding:24px;max-height:400px;overflow-y:auto;">';
    shortcuts.forEach(function(s) {
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">';
      html += '<span style="font-size:14px;color:#555;">' + escHtml(s.desc) + '</span>';
      html += '<kbd style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-family:monospace;font-size:13px;color:#374151;box-shadow:0 1px 2px rgba(0,0,0,0.1);">' + escHtml(s.key) + '</kbd>';
      html += '</div>';
    });
    html += '</div>';

    html += '<div style="padding:16px 24px;border-top:1px solid #eee;background:#f8f7ff;border-radius:0 0 16px 16px;">';
    html += '<div style="font-size:12px;color:#666;text-align:center;">💡 검색창에 포커스가 있을 때는 단축키가 비활성화됩니다.</div>';
    html += '</div></div>';

    modal.innerHTML = html;
    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    // 이벤트
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });
    var closeBtn = document.getElementById('ws-shortcuts-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });
  };

  // 키보드 이벤트 핸들러
  document.addEventListener('keydown', function(e) {
    if (!window.WS || !window.WS._shortcutsEnabled) return;

    // 입력 필드에 포커스가 있을 때는 무시
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      // Esc만 예외 처리
      if (e.key === 'Escape') {
        e.target.blur();
        return;
      }
      return;
    }

    // Ctrl 조합 단축키
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault();
          var selectBtn = document.getElementById('ws-btn-select-all');
          if (selectBtn) selectBtn.click();
          break;
        case 'd':
          e.preventDefault();
          var deselectBtn = document.getElementById('ws-btn-deselect-all');
          if (deselectBtn) deselectBtn.click();
          break;
        case 'f':
          e.preventDefault();
          var searchInput = document.querySelector('.ws-global-search');
          if (searchInput) searchInput.focus();
          break;
        case 'p':
          e.preventDefault();
          if (window.WS.showPDFBriefing) window.WS.showPDFBriefing();
          break;
        case 'e':
          e.preventDefault();
          if (window.WS.exportExcel) window.WS.exportExcel();
          break;
        case 'b':
          e.preventDefault();
          if (window.WS.generateBriefing) window.WS.generateBriefing();
          break;
        case 'k':
          e.preventDefault();
          if (window.WS.generateShareText) window.WS.generateShareText();
          break;
        case 'm':
          e.preventDefault();
          if (window.WS._rawToggleDarkMode) window.WS._rawToggleDarkMode();
          else if (window.WS.toggleDarkMode) window.WS.toggleDarkMode();
          break;
      }
      return;
    }

    // 단일 키
    switch (e.key) {
      case 'ArrowLeft':
        var prevBtn = document.querySelector('.ws-page-btn[data-page="prev"]');
        if (prevBtn) prevBtn.click();
        break;
      case 'ArrowRight':
        var nextBtn = document.querySelector('.ws-page-btn[data-page="next"]');
        if (nextBtn) nextBtn.click();
        break;
      case 'Escape':
        // 모달 닫기
        var modals = document.querySelectorAll('[id^="ws-modal-"]');
        modals.forEach(function(m) { m.remove(); });
        break;
      case '?':
        window.WS.showKeyboardShortcuts();
        break;
    }
  });

  // =========================================================
  // AQ) 매물 경과일 배지 표시 (Listing Age Badge)
  // =========================================================

  window.WS._calcDaysAgo = function(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    var now = new Date();
    var diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    return diff;
  };

  window.WS._getAgeBadge = function(days) {
    if (days === null || days === undefined) return '';
    if (days <= 1) return '<span style="background:#ef4444;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:6px;">NEW</span>';
    if (days <= 3) return '<span style="background:#f97316;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:6px;">' + days + '일전</span>';
    if (days <= 7) return '<span style="background:#eab308;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:6px;">' + days + '일전</span>';
    if (days <= 30) return '<span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px;">' + days + '일전</span>';
    return '<span style="background:#d1d5db;color:#666;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px;">' + days + '일전</span>';
  };

  // (경과일 배지는 위 renderAll 통합 훅에서 처리)

  // =========================================================
  // AR) 고객별 추천 매물 리포트 (Customer Match Report)
  // =========================================================

  window.WS.showCustomerReport = function() {
    var existing = document.getElementById('ws-modal-custreport');
    if (existing) existing.remove();

    // 고객 폴더 로드 (배열 형태: [{id, name, items:[{id, name, ...}], created}])
    var foldersRaw = [];
    try { foldersRaw = JSON.parse(localStorage.getItem('ws_customer_folders') || '[]'); } catch(e) { foldersRaw = []; }
    if (!Array.isArray(foldersRaw)) foldersRaw = [];
    var prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('ws_customer_prefs') || '{}'); } catch(e) { prefs = {}; }

    var allData = window.WS.allListings || [];
    var customerNames = foldersRaw.map(function(f) { return f.name || '이름없음'; });

    var modal = document.createElement('div');
    modal.id = 'ws-modal-custreport';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:700px;max-height:85vh;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;display:flex;flex-direction:column;">';
    html += '<div style="background:linear-gradient(135deg,#2D5A27,#4CAF50);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">';
    html += '<div><div style="font-size:18px;font-weight:800;">📋 고객별 추천 매물 리포트</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">고객 선호도 기반 맞춤 매물 추천</div></div>';
    html += '<button id="ws-custreport-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    html += '<div style="padding:24px;overflow-y:auto;flex:1;">';

    if (customerNames.length === 0) {
      html += '<div style="text-align:center;padding:40px 20px;color:#999;">';
      html += '<div style="font-size:48px;margin-bottom:12px;">👤</div>';
      html += '<div style="font-size:16px;font-weight:600;">등록된 고객이 없습니다</div>';
      html += '<div style="font-size:13px;margin-top:8px;">고객폴더에서 고객을 등록하면 맞춤 추천 리포트를 생성합니다.</div>';
      html += '</div>';
    } else {
      // 각 고객별 추천 매물
      foldersRaw.forEach(function(folder) {
        var name = folder.name || '이름없음';
        var custPref = prefs[name] || {};
        var custItems = Array.isArray(folder.items) ? folder.items : [];
        var custFavIds = custItems.map(function(item) { return String(item.id || item); });

        // 고객 선호도 분석 (저장된 매물 기반)
        var custListings = custFavIds.map(function(id) {
          return allData.find(function(l) { return String(l.id) === String(id); });
        }).filter(Boolean);

        // 선호 유형 분석
        var typeCounts = {};
        var dealCounts = {};
        var avgDeposit = 0;
        var avgPrice = 0;
        var avgArea = 0;

        custListings.forEach(function(l) {
          typeCounts[l.type] = (typeCounts[l.type] || 0) + 1;
          dealCounts[l.deal] = (dealCounts[l.deal] || 0) + 1;
          avgDeposit += (l.deposit || 0);
          avgPrice += (l.price || 0);
          avgArea += (l.area_m2 || 0);
        });

        var count = custListings.length || 1;
        avgDeposit = Math.round(avgDeposit / count);
        avgPrice = Math.round(avgPrice / count);
        avgArea = Math.round(avgArea / count);

        // 선호 유형 1위
        var prefType = Object.keys(typeCounts).sort(function(a, b) { return (typeCounts[b] || 0) - (typeCounts[a] || 0); })[0] || '전체';
        var prefDeal = Object.keys(dealCounts).sort(function(a, b) { return (dealCounts[b] || 0) - (dealCounts[a] || 0); })[0] || '전체';

        // 추천 매물 필터링 (이미 담긴 매물 제외)
        var recommended = allData.filter(function(l) {
          if (custFavIds.indexOf(String(l.id)) >= 0) return false;

          var typeMatch = prefType === '전체' || l.type === prefType;
          var dealMatch = prefDeal === '전체' || l.deal === prefDeal;

          // 가격 범위 ±30%
          var depositMatch = true;
          if (avgDeposit > 0 && l.deposit) {
            depositMatch = l.deposit >= avgDeposit * 0.7 && l.deposit <= avgDeposit * 1.3;
          }

          // 면적 범위 ±30%
          var areaMatch = true;
          if (avgArea > 0 && l.area_m2) {
            areaMatch = l.area_m2 >= avgArea * 0.7 && l.area_m2 <= avgArea * 1.3;
          }

          return typeMatch && dealMatch && (depositMatch || areaMatch);
        }).slice(0, 5); // 상위 5건

        html += '<div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">';
        html += '<div style="background:#f0fdf4;padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">';
        html += '<div>';
        html += '<span style="font-size:16px;font-weight:700;color:#2D5A27;">👤 ' + escHtml(name) + '</span>';
        html += '<span style="font-size:12px;color:#888;margin-left:10px;">관심매물 ' + custFavIds.length + '건</span>';
        html += '</div>';
        html += '<div style="display:flex;gap:6px;">';
        if (prefType !== '전체') html += '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:11px;">' + escHtml(prefType) + '</span>';
        if (prefDeal !== '전체') html += '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:11px;">' + escHtml(prefDeal) + '</span>';
        if (avgArea > 0) html += '<span style="background:#f3e8ff;color:#6b21a8;padding:2px 8px;border-radius:10px;font-size:11px;">~' + avgArea + 'm²</span>';
        html += '</div></div>';

        if (recommended.length === 0) {
          html += '<div style="padding:20px;text-align:center;color:#999;font-size:13px;">현재 조건에 맞는 추천 매물이 없습니다.</div>';
        } else {
          html += '<div style="padding:12px;">';
          recommended.forEach(function(l, idx) {
            var priceText = '';
            if (l.deal === '월세') priceText = ((l.deposit || 0) >= 10000 ? ((l.deposit / 10000).toFixed(1) + '억') : ((l.deposit || 0) + '만')) + '/' + (l.monthly || 0) + '만';
            else if (l.deal === '전세') priceText = (l.deposit || 0) >= 10000 ? ((l.deposit / 10000).toFixed(1) + '억') : ((l.deposit || 0) + '만');
            else priceText = (l.price || 0) >= 10000 ? ((l.price / 10000).toFixed(1) + '억') : ((l.price || 0) + '만');

            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;' + (idx < recommended.length - 1 ? 'border-bottom:1px solid #f0f0f0;' : '') + '">';
            html += '<div style="flex:1;">';
            html += '<div style="font-size:13px;font-weight:600;color:#333;">' + (idx + 1) + '. ' + escHtml(l.title || '-') + '</div>';
            html += '<div style="font-size:11px;color:#888;margin-top:2px;">' + escHtml(l.type || '') + ' · ' + escHtml(l.deal || '') + ' · ' + (l.area_m2 || '-') + 'm² · ' + escHtml(l.address || '') + '</div>';
            html += '</div>';
            html += '<div style="font-size:14px;font-weight:700;color:#2D5A27;white-space:nowrap;margin-left:12px;">' + escHtml(priceText) + '</div>';
            html += '</div>';
          });
          html += '</div>';
        }

        // 추천 근거
        html += '<div style="padding:10px 18px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:11px;color:#888;">';
        html += '💡 추천 근거: ';
        var reasons = [];
        if (prefType !== '전체') reasons.push('선호유형 ' + prefType);
        if (prefDeal !== '전체') reasons.push('선호거래 ' + prefDeal);
        if (avgDeposit > 0) reasons.push('평균보증금 ±30%');
        if (avgArea > 0) reasons.push('평균면적 ±30%');
        html += reasons.length > 0 ? reasons.join(', ') : '등록된 관심매물 기반 분석';
        html += '</div></div>';
      });
    }

    // 리포트 전체 복사 버튼
    html += '<div style="margin-top:16px;text-align:center;">';
    html += '<button id="ws-custreport-copy" style="padding:10px 24px;background:linear-gradient(135deg,#2D5A27,#4CAF50);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">📋 리포트 텍스트 복사</button>';
    html += '</div>';

    html += '</div></div>';
    modal.innerHTML = html;

    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    // 이벤트
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var closeBtn = document.getElementById('ws-custreport-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });

    var copyBtn = document.getElementById('ws-custreport-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        var text = '📋 고객별 추천 매물 리포트\n';
        text += '작성일: ' + new Date().toLocaleDateString('ko-KR') + '\n\n';

        foldersRaw.forEach(function(folder) {
          var name = folder.name || '이름없음';
          var custItems = Array.isArray(folder.items) ? folder.items : [];
          var custFavIds = custItems.map(function(item) { return String(item.id || item); });
          var custListings = custFavIds.map(function(id) {
            return allData.find(function(l) { return String(l.id) === String(id); });
          }).filter(Boolean);

          text += '━━━ ' + name + ' 고객 ━━━\n';
          text += '관심매물: ' + custFavIds.length + '건\n';

          // 간단 추천 목록
          var typeCounts2 = {};
          var dealCounts2 = {};
          custListings.forEach(function(l) {
            typeCounts2[l.type] = (typeCounts2[l.type] || 0) + 1;
            dealCounts2[l.deal] = (dealCounts2[l.deal] || 0) + 1;
          });
          var pt2 = Object.keys(typeCounts2).sort(function(a, b) { return (typeCounts2[b] || 0) - (typeCounts2[a] || 0); })[0] || '전체';
          var pd2 = Object.keys(dealCounts2).sort(function(a, b) { return (dealCounts2[b] || 0) - (dealCounts2[a] || 0); })[0] || '전체';
          text += '선호: ' + pt2 + ' / ' + pd2 + '\n\n';
        });

        text += '\n--- WISHES 중개사 매물검색 ---';

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function() {
            window.WS.showToast('리포트가 클립보드에 복사되었습니다!', 'success');
          }).catch(function() {
            window.WS._fallbackCopy(text);
          });
        } else {
          window.WS._fallbackCopy(text);
        }
      });
    }
  };

  // =========================================================
  // AS) 매물 메모 검색 기능 (Memo Search)
  // =========================================================

  window.WS.showMemoSearch = function() {
    var existing = document.getElementById('ws-modal-memosearch');
    if (existing) existing.remove();

    var memos = {};
    try { memos = JSON.parse(localStorage.getItem('ws-memos') || '{}'); } catch(e) { memos = {}; }
    var allData = window.WS.allListings || [];

    var modal = document.createElement('div');
    modal.id = 'ws-modal-memosearch';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:600px;max-height:80vh;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;display:flex;flex-direction:column;">';
    html += '<div style="background:linear-gradient(135deg,#0ea5e9,#38bdf8);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">';
    html += '<div><div style="font-size:18px;font-weight:800;">🔎 메모 검색</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">메모 내용으로 매물을 빠르게 찾기</div></div>';
    html += '<button id="ws-memosearch-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    html += '<div style="padding:16px 24px;border-bottom:1px solid #eee;flex-shrink:0;">';
    html += '<input type="text" id="ws-memo-search-input" placeholder="메모 키워드를 입력하세요..." style="width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;" />';
    html += '</div>';

    html += '<div id="ws-memo-search-results" style="padding:16px 24px;overflow-y:auto;flex:1;">';

    // 초기 목록: 메모가 있는 매물 전부 표시
    var memoIds = Object.keys(memos).filter(function(k) { return memos[k] && memos[k].trim().length > 0; });
    if (memoIds.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:#999;font-size:14px;">📝 저장된 메모가 없습니다.</div>';
    } else {
      html += '<div style="font-size:12px;color:#888;margin-bottom:12px;">메모가 있는 매물: ' + memoIds.length + '건</div>';
      memoIds.forEach(function(id) {
        var listing = allData.find(function(l) { return String(l.id) === String(id); });
        var title = listing ? (listing.title || '-') : '(삭제된 매물)';
        var memo = memos[id] || '';
        html += '<div class="ws-memo-result-item" style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;" data-id="' + escHtml(String(id)) + '">';
        html += '<div style="font-size:13px;font-weight:600;color:#333;">' + escHtml(title) + '</div>';
        html += '<div style="font-size:12px;color:#0ea5e9;margin-top:4px;white-space:pre-line;">' + escHtml(memo.substring(0, 100)) + (memo.length > 100 ? '...' : '') + '</div>';
        if (listing) {
          html += '<div style="font-size:11px;color:#888;margin-top:4px;">' + escHtml(listing.type || '') + ' · ' + escHtml(listing.deal || '') + ' · ' + escHtml(listing.address || '') + '</div>';
        }
        html += '</div>';
      });
    }
    html += '</div></div>';

    modal.innerHTML = html;
    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    // 이벤트
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var closeBtn = document.getElementById('ws-memosearch-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });

    // 검색 기능
    var searchInput = document.getElementById('ws-memo-search-input');
    if (searchInput) {
      searchInput.focus();
      var _memoSearchDebounce = null;
      searchInput.addEventListener('input', function() {
        var self = this;
        if (_memoSearchDebounce) clearTimeout(_memoSearchDebounce);
        _memoSearchDebounce = setTimeout(function() {
        var keyword = self.value.trim().toLowerCase();
        var resultsDiv = document.getElementById('ws-memo-search-results');
        if (!resultsDiv) return;

        var filtered = memoIds.filter(function(id) {
          if (!keyword) return true;
          var memo = (memos[id] || '').toLowerCase();
          var listing = allData.find(function(l) { return String(l.id) === String(id); });
          var title = listing ? (listing.title || '').toLowerCase() : '';
          return memo.indexOf(keyword) >= 0 || title.indexOf(keyword) >= 0;
        });

        var rhtml = '<div style="font-size:12px;color:#888;margin-bottom:12px;">검색 결과: ' + filtered.length + '건</div>';
        filtered.forEach(function(id) {
          var listing = allData.find(function(l) { return String(l.id) === String(id); });
          var title = listing ? (listing.title || '-') : '(삭제된 매물)';
          var memo = memos[id] || '';

          // 키워드 하이라이트
          var highlightedMemo = escHtml(memo.substring(0, 100));
          if (keyword) {
            var re = new RegExp('(' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
            highlightedMemo = highlightedMemo.replace(re, '<mark style="background:#fef08a;padding:0 2px;border-radius:2px;">$1</mark>');
          }

          rhtml += '<div class="ws-memo-result-item" style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;" data-id="' + escHtml(String(id)) + '">';
          rhtml += '<div style="font-size:13px;font-weight:600;color:#333;">' + escHtml(title) + '</div>';
          rhtml += '<div style="font-size:12px;color:#0ea5e9;margin-top:4px;white-space:pre-line;">' + highlightedMemo + (memo.length > 100 ? '...' : '') + '</div>';
          if (listing) {
            rhtml += '<div style="font-size:11px;color:#888;margin-top:4px;">' + escHtml(listing.type || '') + ' · ' + escHtml(listing.deal || '') + ' · ' + escHtml(listing.address || '') + '</div>';
          }
          rhtml += '</div>';
        });
        if (filtered.length === 0) {
          rhtml += '<div style="text-align:center;padding:20px;color:#999;font-size:13px;">검색 결과가 없습니다.</div>';
        }
        resultsDiv.innerHTML = rhtml;
        }, 200); // 200ms 디바운스
      });
    }

    // 결과 클릭 시 해당 매물 상세 보기
    var resultsContainer = document.getElementById('ws-memo-search-results');
    if (resultsContainer) {
      resultsContainer.addEventListener('click', function(e) {
        var item = e.target.closest('.ws-memo-result-item');
        if (item && item.dataset.id) {
          modal.remove();
          var listingEl = document.querySelector('.ws-listing-item[data-id="' + item.dataset.id + '"]');
          if (listingEl) {
            listingEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            listingEl.style.outline = '3px solid #0ea5e9';
            setTimeout(function() { listingEl.style.outline = ''; }, 3000);
          }
        }
      });
    }
  };

  // =========================================================
  // AT) 브라우저 알림 (새 매물/가격 변동 Push Notification)
  // =========================================================

  window.WS._notificationEnabled = false;

  window.WS.showNotificationSettings = function() {
    var existing = document.getElementById('ws-modal-notiset');
    if (existing) existing.remove();

    var isEnabled = window.WS._notificationEnabled;
    var permission = (typeof Notification !== 'undefined') ? Notification.permission : 'denied';

    var modal = document.createElement('div');
    modal.id = 'ws-modal-notiset';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:18px;font-weight:800;">🔔 푸시 알림 설정</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">새 매물/가격 변동 시 브라우저 알림</div></div>';
    html += '<button id="ws-notiset-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    html += '<div style="padding:24px;">';

    // 권한 상태
    html += '<div style="text-align:center;margin-bottom:20px;">';
    if (permission === 'granted') {
      html += '<div style="font-size:40px;margin-bottom:8px;">✅</div>';
      html += '<div style="font-size:14px;color:#059669;font-weight:600;">알림 권한 허용됨</div>';
    } else if (permission === 'denied') {
      html += '<div style="font-size:40px;margin-bottom:8px;">🚫</div>';
      html += '<div style="font-size:14px;color:#dc2626;font-weight:600;">알림 권한 차단됨</div>';
      html += '<div style="font-size:12px;color:#999;margin-top:4px;">브라우저 설정에서 알림을 허용해주세요.</div>';
    } else {
      html += '<div style="font-size:40px;margin-bottom:8px;">❓</div>';
      html += '<div style="font-size:14px;color:#f59e0b;font-weight:600;">알림 권한 요청 필요</div>';
    }
    html += '</div>';

    // 알림 옵션
    html += '<div style="margin-bottom:16px;">';
    html += '<label style="display:flex;align-items:center;padding:12px;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;margin-bottom:8px;">';
    html += '<input type="checkbox" id="ws-noti-newlisting" ' + (isEnabled ? 'checked' : '') + ' style="margin-right:10px;width:18px;height:18px;"> ';
    html += '<div><div style="font-size:14px;font-weight:600;">🆕 새 매물 등록 알림</div><div style="font-size:11px;color:#888;">자동 새로고침 시 새 매물이 감지되면 알림</div></div>';
    html += '</label>';
    html += '<label style="display:flex;align-items:center;padding:12px;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;">';
    html += '<input type="checkbox" id="ws-noti-pricechange" ' + (isEnabled ? 'checked' : '') + ' style="margin-right:10px;width:18px;height:18px;"> ';
    html += '<div><div style="font-size:14px;font-weight:600;">📉 가격 변동 알림</div><div style="font-size:11px;color:#888;">관심매물 가격이 변동되면 알림</div></div>';
    html += '</label>';
    html += '</div>';

    // 버튼
    if (permission !== 'granted') {
      html += '<button id="ws-noti-request" style="width:100%;padding:12px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">🔔 알림 권한 요청</button>';
    } else {
      html += '<button id="ws-noti-save" style="width:100%;padding:12px;background:linear-gradient(135deg,#059669,#34d399);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">💾 설정 저장</button>';
    }

    html += '<div style="margin-top:12px;padding:10px;background:#fef3c7;border-radius:8px;font-size:11px;color:#92400e;">';
    html += '💡 자동 새로고침이 활성화된 경우에만 알림이 동작합니다.';
    html += '</div>';

    html += '</div></div>';
    modal.innerHTML = html;

    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var closeBtn = document.getElementById('ws-notiset-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });

    var requestBtn = document.getElementById('ws-noti-request');
    if (requestBtn) {
      requestBtn.addEventListener('click', function() {
        if (typeof Notification !== 'undefined') {
          Notification.requestPermission().then(function(p) {
            if (p === 'granted') {
              window.WS.showToast('알림 권한이 허용되었습니다!', 'success');
              modal.remove();
              window.WS.showNotificationSettings();
            } else {
              window.WS.showToast('알림 권한이 거부되었습니다', 'warning');
            }
          });
        }
      });
    }

    var saveBtn = document.getElementById('ws-noti-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var newListing = document.getElementById('ws-noti-newlisting');
        var priceChange = document.getElementById('ws-noti-pricechange');
        window.WS._notificationEnabled = (newListing && newListing.checked) || (priceChange && priceChange.checked);
        window.WS._notiNewListing = newListing ? newListing.checked : false;
        window.WS._notiPriceChange = priceChange ? priceChange.checked : false;
        _safeSetItem('ws_noti_settings', JSON.stringify({
          enabled: window.WS._notificationEnabled,
          newListing: window.WS._notiNewListing,
          priceChange: window.WS._notiPriceChange
        }));
        window.WS.showToast('알림 설정이 저장되었습니다', 'success');
        modal.remove();
      });
    }
  };

  // 알림 발송 함수
  // (미사용 _sendNotification 및 알림 설정 복원 코드 제거됨)

  // =========================================================
  // AU) 매물 비교 차트 (시각적 바 차트 비교)
  // =========================================================

  window.WS.showCompareChart = function() {
    var selected = [];
    if (window.WS.state.selectedIds && window.WS.state.selectedIds.size > 0) {
      window.WS.state.selectedIds.forEach(function(id) {
        var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
        if (found) selected.push(found);
      });
    }
    if (selected.length < 2) {
      window.WS.showToast('비교할 매물을 2개 이상 선택해주세요', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-comparechart');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-comparechart';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    // 데이터 준비
    var labels = selected.map(function(l) { return (l.title || '-').substring(0, 15); });
    var deposits = selected.map(function(l) { return l.deposit || 0; });
    var prices = selected.map(function(l) { return l.price || 0; });
    var monthlys = selected.map(function(l) { return l.monthly || 0; });
    var areas = selected.map(function(l) { return l.area_m2 || 0; });

    var maxDeposit = Math.max.apply(null, deposits.length > 0 ? deposits : [0]) || 1;
    var maxPrice = Math.max.apply(null, prices.length > 0 ? prices : [0]) || 1;
    var maxMonthly = Math.max.apply(null, monthlys.length > 0 ? monthlys : [0]) || 1;
    var maxArea = Math.max.apply(null, areas.length > 0 ? areas : [0]) || 1;

    var colors = ['#2D5A27', '#4CAF50', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444'];

    var html = '<div style="background:#fff;border-radius:16px;width:750px;max-height:85vh;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;display:flex;flex-direction:column;">';
    html += '<div style="background:linear-gradient(135deg,#3b82f6,#60a5fa);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">';
    html += '<div><div style="font-size:18px;font-weight:800;">📊 매물 비교 차트</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + selected.length + '건 매물 시각적 비교</div></div>';
    html += '<button id="ws-comparechart-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>';
    html += '</div>';

    html += '<div style="padding:24px;overflow-y:auto;flex:1;">';

    // 범례
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">';
    selected.forEach(function(l, i) {
      html += '<span style="display:flex;align-items:center;gap:4px;font-size:12px;color:#555;">';
      html += '<span style="width:12px;height:12px;border-radius:3px;background:' + colors[i % colors.length] + ';display:inline-block;"></span>';
      html += escHtml((l.title || '-').substring(0, 20));
      html += '</span>';
    });
    html += '</div>';

    // 시세분석 차트 생성 함수
    function priceBarChart(title, values, maxVal, unit) {
      var chartHtml = '<div style="margin-bottom:24px;">';
      chartHtml += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:10px;">' + title + '</div>';
      values.forEach(function(val, i) {
        var pct = maxVal > 0 ? (val / maxVal * 100) : 0;
        var label = (val || 0) >= 10000 ? ((val / 10000).toFixed(1) + '억') : ((val || 0) + unit);
        chartHtml += '<div style="display:flex;align-items:center;margin-bottom:6px;">';
        chartHtml += '<div style="width:80px;font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(labels[i]) + '</div>';
        chartHtml += '<div style="flex:1;height:24px;background:#f3f4f6;border-radius:6px;overflow:hidden;margin:0 8px;">';
        chartHtml += '<div style="height:100%;width:' + Math.max(pct, 2) + '%;background:' + colors[i % colors.length] + ';border-radius:6px;transition:width 0.5s;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">';
        if (pct > 15) chartHtml += '<span style="font-size:10px;color:#fff;font-weight:600;">' + escHtml(label) + '</span>';
        chartHtml += '</div></div>';
        if (pct <= 15) chartHtml += '<div style="font-size:11px;color:#555;min-width:60px;">' + escHtml(label) + '</div>';
        chartHtml += '</div>';
      });
      chartHtml += '</div>';
      return chartHtml;
    }

    // 보증금 차트
    if (deposits.some(function(v) { return v > 0; })) {
      html += priceBarChart('💰 보증금', deposits, maxDeposit, '만');
    }
    // 매매가 차트
    if (prices.some(function(v) { return v > 0; })) {
      html += priceBarChart('🏷️ 매매가', prices, maxPrice, '만');
    }
    // 월세 차트
    if (monthlys.some(function(v) { return v > 0; })) {
      html += priceBarChart('📅 월세', monthlys, maxMonthly, '만');
    }
    // 면적 차트
    html += priceBarChart('📐 면적', areas, maxArea, 'm²');

    // 종합 비교표
    html += '<div style="margin-top:16px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#f8fafc;">';
    html += '<th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">항목</th>';
    selected.forEach(function(l, i) {
      html += '<th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb;color:' + colors[i % colors.length] + ';">' + escHtml((l.title || '-').substring(0, 12)) + '</th>';
    });
    html += '</tr></thead><tbody>';

    var rows = [
      { label: '유형', fn: function(l) { return l.type || '-'; } },
      { label: '거래', fn: function(l) { return l.deal || '-'; } },
      { label: '층', fn: function(l) { return (l.floor_current || '-') + '/' + (l.floor_total || '-') + 'F'; } },
      { label: '방/욕실', fn: function(l) { return (l.rooms || '-') + '/' + (l.bathrooms || '-'); } },
      { label: '방향', fn: function(l) { return l.direction || '-'; } },
      { label: '주차', fn: function(l) { return l.parking ? '가능' : '-'; } },
      { label: 'EV', fn: function(l) { return l.elevator ? '있음' : '-'; } },
      { label: '관리비', fn: function(l) { return l.maintenance_fee ? l.maintenance_fee + '만' : '-'; } }
    ];

    rows.forEach(function(row, ri) {
      html += '<tr style="background:' + (ri % 2 === 0 ? '#fff' : '#fafafa') + ';">';
      html += '<td style="padding:8px 10px;font-weight:600;color:#555;border-bottom:1px solid #f0f0f0;">' + row.label + '</td>';
      selected.forEach(function(l) {
        html += '<td style="padding:8px 10px;text-align:center;border-bottom:1px solid #f0f0f0;">' + escHtml(String(row.fn(l))) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    html += '</div></div>';
    modal.innerHTML = html;

    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var closeBtn = document.getElementById('ws-comparechart-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });
  };

  // =========================================================
  // AV) URL 필터 상태 저장/복원 - Section L에 통합됨 (중복 제거)
  // =========================================================

  // =========================================================
  // AW) 카카오톡 매물 카드 공유 개선 (Enhanced Share)
  // =========================================================

  window.WS.shareKakaoCard = function() {
    var ids = Array.from(window.WS.state.selectedIds || []);
    if (ids.length === 0) {
      window.WS.showToast('📌 공유할 매물을 선택해주세요');
      return;
    }
    var allData = window.WS.allListings || [];
    var selected = [];
    ids.forEach(function(id) {
      var item = allData.find(function(l) { return String(l.id) === String(id); });
      if (item) selected.push(item);
    });
    if (selected.length === 0) {
      window.WS.showToast('⚠️ 선택된 매물 데이터를 찾을 수 없습니다');
      return;
    }

    var existing = document.getElementById('ws-modal-kakaocard');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-kakaocard';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:600px;width:95%;max-height:85vh;overflow:auto;padding:0;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#FEE500,#F5D600);padding:20px 24px;border-radius:16px 16px 0 0;">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
    html += '<h2 style="font-size:18px;font-weight:800;color:#3C1E1E;margin:0;">💬 카카오톡 공유용 카드</h2>';
    html += '<button id="ws-kakaocard-close" style="width:32px;height:32px;border:none;background:rgba(0,0,0,0.1);border-radius:50%;font-size:16px;cursor:pointer;color:#3C1E1E;">✕</button>';
    html += '</div>';
    html += '<div style="font-size:13px;color:#5C3D21;margin-top:4px;">' + selected.length + '건 매물 카드 미리보기</div>';
    html += '</div>';
    html += '<div style="padding:20px 24px;">';

    selected.forEach(function(item, idx) {
      if ((!item.images || item.images.length === 0) && item.listing_images && item.listing_images.length > 0) item.images = item.listing_images;
      var imgUrl = '';
      if (item.images && item.images.length > 0) {
        imgUrl = typeof item.images[0] === 'string' ? item.images[0] : (item.images[0].url || item.images[0].src || '');
      }
      var deposit = parseFloat(item.deposit) || 0;
      var price = parseFloat(item.price) || 0;
      var monthly = parseFloat(item.monthly) || 0;
      var priceText = '';
      if (item.deal === '매매') {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + '억' : deposit + '만');
      } else if (item.deal === '전세') {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + '억' : deposit + '만');
      } else {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + '억' : deposit + '만') + '/' + monthly + '만';
      }

      html += '<div style="border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;margin-bottom:12px;background:#fafafa;">';
      if (imgUrl) {
        html += '<div data-card-bg="' + escHtml(imgUrl) + '" style="height:140px;background:url(\'' + imgUrl.replace(/[\\()'"{}]/g, '\\$&') + '\') center/cover no-repeat;position:relative;">';
        html += '<span style="position:absolute;top:8px;left:8px;background:' + (item.deal === '매매' ? '#2D5A27' : item.deal === '전세' ? '#1e40af' : '#e53e3e') + ';color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">' + escHtml(item.deal || '') + '</span>';
        html += '</div>';
      }
      html += '<div style="padding:12px 16px;">';
      html += '<div style="font-weight:700;font-size:15px;color:#333;margin-bottom:4px;">' + escHtml(item.title || item.type + ' ' + item.deal) + '</div>';
      html += '<div style="font-size:22px;font-weight:800;color:#e53e3e;margin-bottom:6px;">' + escHtml(priceText) + '</div>';
      html += '<div style="font-size:12px;color:#888;">';
      html += '📍 ' + escHtml(item.address || '주소 미등록');
      if (item.area_m2) html += ' · ' + item.area_m2 + '㎡';
      if (item.rooms) html += ' · ' + item.rooms + '방';
      if (item.floor_current) html += ' · ' + item.floor_current + '층';
      html += '</div>';
      if (item.maintenance_fee) html += '<div style="font-size:11px;color:#aaa;margin-top:4px;">관리비 ' + item.maintenance_fee + '만원</div>';
      html += '</div></div>';
    });

    // 텍스트 포맷 생성
    var shareText = '🏠 WISHES 추천 매물 (' + selected.length + '건)\n';
    shareText += '━━━━━━━━━━━━━━━\n\n';
    selected.forEach(function(item, idx) {
      var deposit = parseFloat(item.deposit) || 0;
      var monthly = parseFloat(item.monthly) || 0;
      var priceText = '';
      if (item.deal === '매매' || item.deal === '전세') {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + '억' : deposit + '만');
      } else {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + '억' : deposit + '만') + '/' + monthly + '만';
      }
      shareText += '📌 ' + (idx + 1) + '. ' + (item.title || item.type) + '\n';
      shareText += '💰 ' + (item.deal || '') + ' ' + priceText + '\n';
      shareText += '📍 ' + (item.address || '') + '\n';
      if (item.area_m2) shareText += '📐 ' + item.area_m2 + '㎡';
      if (item.rooms) shareText += ' | ' + item.rooms + '방';
      if (item.floor_current) shareText += ' | ' + item.floor_current + '/' + (item.floor_total || '-') + '층';
      shareText += '\n';
      if (item.maintenance_fee) shareText += '🔧 관리비 ' + item.maintenance_fee + '만원\n';
      shareText += '\n';
    });
    shareText += '━━━━━━━━━━━━━━━\n';
    shareText += '🏢 WISHES 부동산 | wishes.co.kr';

    html += '<div style="display:flex;gap:8px;margin-top:16px;">';
    html += '<button id="ws-kakaocard-copy" style="flex:1;padding:12px;background:#FEE500;color:#3C1E1E;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">📋 텍스트 복사</button>';
    html += '<button id="ws-kakaocard-kakao" style="flex:1;padding:12px;background:#3C1E1E;color:#FEE500;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">💬 카카오톡 열기</button>';
    html += '</div>';
    html += '</div></div>';

    modal.innerHTML = html;
    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var closeBtn = document.getElementById('ws-kakaocard-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });

    var copyBtn = document.getElementById('ws-kakaocard-copy');
    if (copyBtn) copyBtn.addEventListener('click', function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(function() {
          window.WS.showToast('✅ 카카오톡 공유 텍스트가 복사되었습니다!');
        }).catch(function() {
          window.WS._fallbackCopy(shareText);
        });
      } else {
        window.WS._fallbackCopy(shareText);
      }
    });

    var kakaoBtn = document.getElementById('ws-kakaocard-kakao');
    if (kakaoBtn) kakaoBtn.addEventListener('click', function() {
      var encoded = encodeURIComponent(shareText);
      window.open('https://sharer.kakao.com/talk/friends/picker/link?url=' + encodeURIComponent('https://wishes.co.kr') + '&text=' + encoded, '_blank', 'width=500,height=600');
    });
  };

  // =========================================================
  // AX) 즐겨찾기 → 고객폴더 자동 연동 (Favorite to Folder Link)
  // =========================================================

  window.WS._showFolderPicker = function(listingId) {
    var folders;
    try { folders = JSON.parse(localStorage.getItem('ws_customer_folders') || '[]'); } catch(e) { folders = []; }
    if (!Array.isArray(folders)) folders = [];

    if (folders.length === 0) {
      window.WS.showToast('📂 고객폴더가 없습니다. 고객폴더를 먼저 생성해주세요.');
      return;
    }

    var listing = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(listingId); });
    if (!listing) return;

    var existing = document.getElementById('ws-modal-folderpicker');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-folderpicker';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:9999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:14px;max-width:380px;width:90%;padding:0;box-shadow:0 16px 48px rgba(0,0,0,0.25);overflow:hidden;">';
    html += '<div style="background:linear-gradient(135deg,#2D5A27,#4CAF50);padding:16px 20px;color:#fff;">';
    html += '<h3 style="margin:0;font-size:16px;font-weight:800;">📂 고객폴더에 추가</h3>';
    html += '<div style="font-size:12px;opacity:0.85;margin-top:4px;">' + escHtml(listing.title || listing.type + ' ' + listing.deal) + '</div>';
    html += '</div>';
    html += '<div style="padding:16px 20px;max-height:300px;overflow-y:auto;">';

    folders.forEach(function(folder) {
      var itemCount = (folder.items || []).length;
      var alreadyIn = (folder.items || []).some(function(item) { return String(item.id || item) === String(listingId); });
      html += '<div class="ws-folder-pick-item" data-folder-id="' + escHtml(String(folder.id)) + '" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;margin-bottom:6px;border:1px solid ' + (alreadyIn ? '#4CAF50' : '#e0e0e0') + ';border-radius:10px;cursor:' + (alreadyIn ? 'default' : 'pointer') + ';background:' + (alreadyIn ? '#f0fdf0' : '#fff') + ';transition:all 0.2s;">';
      html += '<div>';
      html += '<div style="font-weight:600;font-size:14px;color:#333;">👤 ' + escHtml(folder.name) + '</div>';
      html += '<div style="font-size:11px;color:#888;margin-top:2px;">관심매물 ' + itemCount + '건</div>';
      html += '</div>';
      if (alreadyIn) {
        html += '<span style="font-size:12px;color:#4CAF50;font-weight:600;">✅ 추가됨</span>';
      } else {
        html += '<span style="font-size:20px;color:#2D5A27;">+</span>';
      }
      html += '</div>';
    });

    html += '</div>';
    html += '<div style="padding:12px 20px;border-top:1px solid #eee;text-align:center;">';
    html += '<button id="ws-folderpicker-skip" style="padding:8px 24px;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;font-size:13px;cursor:pointer;color:#666;">건너뛰기</button>';
    html += '</div></div>';

    modal.innerHTML = html;
    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var skipBtn = document.getElementById('ws-folderpicker-skip');
    if (skipBtn) skipBtn.addEventListener('click', function() { modal.remove(); });

    // 폴더 클릭 이벤트
    modal.querySelectorAll('.ws-folder-pick-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var folderId = parseInt(this.dataset.folderId, 10);
        var spanEl = this.querySelector('span');
        var alreadyAdded = spanEl && spanEl.textContent.indexOf('추가됨') >= 0;
        if (alreadyAdded) return;

        try {
          var currentFolders = JSON.parse(localStorage.getItem('ws_customer_folders') || '[]');
          if (!Array.isArray(currentFolders)) currentFolders = [];
          var targetFolder = currentFolders.find(function(f) { return f.id === folderId; });
          if (targetFolder) {
            if (!targetFolder.items) targetFolder.items = [];
            var dup = targetFolder.items.some(function(it) { return String(it.id || it) === String(listingId); });
            if (!dup) {
              targetFolder.items.push({
                id: String(listingId),
                name: listing.title || listing.type + ' ' + listing.deal,
                price: String(listing.deposit || '') + '/' + String(listing.monthly || listing.price || ''),
                address: listing.address || '',
                added: new Date().toLocaleString('ko-KR')
              });
              _safeSetItem('ws_customer_folders', JSON.stringify(currentFolders));
              window.WS.showToast('✅ ' + targetFolder.name + ' 폴더에 추가되었습니다!');
            }
          }
        } catch(err) { /* localStorage error */ }
        modal.remove();
      });
    });
  };

  // toggleFavorite 후킹: 즐겨찾기 추가 시 폴더 선택 팝업
  var _origToggleFavorite = window.WS.toggleFavorite;
  if (_origToggleFavorite) {
    window.WS.toggleFavorite = function(id) {
      var wasFavorite = (window.WS.state.favorites || []).some(function(f) { return String(f) === String(id); });
      _origToggleFavorite.call(window.WS, id);
      // 새로 추가된 경우에만 폴더 선택 팝업 표시
      if (!wasFavorite) {
        var folders;
        try { folders = JSON.parse(localStorage.getItem('ws_customer_folders') || '[]'); } catch(e) { folders = []; }
        if (Array.isArray(folders) && folders.length > 0) {
          setTimeout(function() { window.WS._showFolderPicker(id); }, 300);
        }
      }
    };
  }

  // =========================================================
  // AY) 다크모드 시스템 자동 연동 (Auto Dark Mode)
  // =========================================================

  window.WS._autoDarkMode = (function() {
    try { return localStorage.getItem('ws_dark_auto') === 'true'; } catch(e) { return false; }
  })();

  window.WS._initAutoDarkMode = function() {
    if (!window.matchMedia) return;

    // 이전 리스너 정리 (메모리 누수 방지)
    if (window.WS._darkModeMediaQuery && window.WS._darkModeChangeHandler) {
      var oldMq = window.WS._darkModeMediaQuery;
      var oldHandler = window.WS._darkModeChangeHandler;
      if (oldMq.removeEventListener) {
        oldMq.removeEventListener('change', oldHandler);
      } else if (oldMq.removeListener) {
        oldMq.removeListener(oldHandler);
      }
    }

    var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function handleChange(e) {
      if (!window.WS._autoDarkMode) return;
      var shouldDark = e.matches;
      var currentlyDark = window.WS.isDarkMode();
      if (shouldDark !== currentlyDark) {
        _safeSetItem('ws_dark_mode', shouldDark ? 'true' : 'false');
        window.WS._applyDarkMode(shouldDark);
        window.WS.showToast(shouldDark ? '🌙 시스템 설정에 따라 다크모드 ON' : '☀️ 시스템 설정에 따라 라이트모드 ON');
      }
    }

    // 참조 저장 (다음 호출 시 정리 가능하도록)
    window.WS._darkModeMediaQuery = mediaQuery;
    window.WS._darkModeChangeHandler = handleChange;

    // 초기 적용
    if (window.WS._autoDarkMode && mediaQuery.matches && !window.WS.isDarkMode()) {
      _safeSetItem('ws_dark_mode', 'true');
      window.WS._applyDarkMode(true);
    }

    // 변경 감지
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
    }
  };

  // 다크모드 설정 모달 (자동/수동 선택)
  window.WS.showDarkModeSettings = function() {
    var existing = document.getElementById('ws-modal-darkmode');
    if (existing) existing.remove();

    var isAuto = window.WS._autoDarkMode;
    var isDark = window.WS.isDarkMode();
    var systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;

    var modal = document.createElement('div');
    modal.id = 'ws-modal-darkmode';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:' + (isDark ? '#1a1a2e' : '#fff') + ';border-radius:16px;max-width:400px;width:90%;padding:0;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;">';
    html += '<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:20px 24px;color:#fff;">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
    html += '<h2 style="font-size:18px;font-weight:800;margin:0;">🌓 다크모드 설정</h2>';
    html += '<button id="ws-darkmode-close" style="width:32px;height:32px;border:none;background:rgba(255,255,255,0.15);border-radius:50%;font-size:16px;cursor:pointer;color:#fff;">✕</button>';
    html += '</div>';
    html += '<div style="font-size:12px;opacity:0.7;margin-top:4px;">현재 시스템: ' + (systemDark ? '🌙 다크' : '☀️ 라이트') + '</div>';
    html += '</div>';
    html += '<div style="padding:20px 24px;">';

    // 수동 토글
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:10px;background:' + (isDark ? '#16213e' : '#f8f8f8') + ';">';
    html += '<div><div style="font-weight:600;font-size:14px;color:' + (isDark ? '#e0e0e0' : '#333') + ';">' + (isDark ? '🌙 다크모드' : '☀️ 라이트모드') + '</div>';
    html += '<div style="font-size:11px;color:#888;">현재 상태</div></div>';
    html += '<button id="ws-darkmode-toggle" style="padding:8px 16px;background:' + (isDark ? '#4CAF50' : '#333') + ';color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">' + (isDark ? 'OFF' : 'ON') + '</button>';
    html += '</div>';

    // 자동 모드
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border:1px solid ' + (isAuto ? '#4CAF50' : '#e0e0e0') + ';border-radius:10px;background:' + (isAuto ? '#f0fdf0' : (isDark ? '#16213e' : '#f8f8f8')) + ';">';
    html += '<div><div style="font-weight:600;font-size:14px;color:' + (isDark && !isAuto ? '#e0e0e0' : '#333') + ';">🔄 시스템 자동 연동</div>';
    html += '<div style="font-size:11px;color:#888;">OS 설정에 따라 자동 전환</div></div>';
    html += '<button id="ws-darkmode-auto" style="padding:8px 16px;background:' + (isAuto ? '#4CAF50' : '#ddd') + ';color:' + (isAuto ? '#fff' : '#666') + ';border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">' + (isAuto ? 'ON' : 'OFF') + '</button>';
    html += '</div>';

    html += '</div></div>';
    modal.innerHTML = html;

    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var closeBtn = document.getElementById('ws-darkmode-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });

    var toggleBtn = document.getElementById('ws-darkmode-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', function() {
      if (window.WS._rawToggleDarkMode) window.WS._rawToggleDarkMode();
      else { var cur = window.WS.isDarkMode(); _safeSetItem('ws_dark_mode', cur ? 'false' : 'true'); window.WS._applyDarkMode(!cur); }
      modal.remove();
    });

    var autoBtn = document.getElementById('ws-darkmode-auto');
    if (autoBtn) autoBtn.addEventListener('click', function() {
      window.WS._autoDarkMode = !window.WS._autoDarkMode;
      _safeSetItem('ws_dark_auto', window.WS._autoDarkMode ? 'true' : 'false');
      if (window.WS._autoDarkMode) {
        window.WS._initAutoDarkMode();
        window.WS.showToast('🔄 시스템 연동 다크모드 활성화');
      } else {
        window.WS.showToast('🔄 시스템 연동 다크모드 비활성화');
      }
      modal.remove();
      window.WS.showDarkModeSettings();
    });
  };

  // 초기화 시 자동 다크모드 실행
  window.WS._initAutoDarkMode();

  // toggleDarkMode 오버라이드: 버튼 클릭 시 설정 모달 표시
  // _safeBtn이 익명함수로 등록하므로 removeEventListener 대신 함수 자체를 교체
  window.WS._rawToggleDarkMode = window.WS.toggleDarkMode;
  window.WS.toggleDarkMode = function() {
    window.WS.showDarkModeSettings();
  };

  // =========================================================
  // AZ) 카카오톡 카드 공유 버튼 연결
  // =========================================================

  // generateShareText를 카드 공유로 오버라이드
  var _origGenerateShareText = window.WS.generateShareText;
  window.WS.generateShareText = function() {
    // 선택 매물이 있으면 카드형 공유, 없으면 원본 호출
    var ids = Array.from(window.WS.state.selectedIds || []);
    if (ids.length > 0) {
      window.WS.shareKakaoCard();
    } else if (_origGenerateShareText) {
      _origGenerateShareText.call(window.WS);
    } else {
      window.WS.showToast('📌 공유할 매물을 선택해주세요');
    }
  };

  // 하단 바에 새 버튼 추가 (HTML 템플릿에 추가하기 어려운 동적 버튼)
  // 이 부분은 showSearchUI 호출 후 setTimeout으로 실행
  var _origShowSearchUI = window.WS.showSearchUI;
  if (_origShowSearchUI) {
    window.WS.showSearchUI = function() {
      _origShowSearchUI.call(window.WS);
      setTimeout(function() {
        // 푸시 알림 버튼 → 설정 드롭다운에 추가
        if (!document.getElementById('ws-btn-notiset')) {
          var settingsMenu = document.querySelectorAll('.ws-dropdown-menu');
          var targetMenu = settingsMenu.length > 0 ? settingsMenu[settingsMenu.length - 1] : null;
          if (targetMenu) {
            var btn1 = document.createElement('button');
            btn1.className = 'ws-dropdown-item';
            btn1.id = 'ws-btn-notiset';
            btn1.textContent = '🔔 푸시알림';
            targetMenu.appendChild(btn1);
            btn1.addEventListener('click', function() {
              var parent = this.closest('.ws-bar-dropdown');
              if (parent) parent.classList.remove('ws-dropdown-open');
              window.WS.showNotificationSettings();
            });
          }
        }

        // 비교 차트 버튼 → 분석 드롭다운에 추가
        if (!document.getElementById('ws-btn-comparechart')) {
          var analysisMenus = document.querySelectorAll('.ws-dropdown-menu');
          var analysisMenu = analysisMenus.length >= 2 ? analysisMenus[1] : null;
          if (analysisMenu) {
            var btn2 = document.createElement('button');
            btn2.className = 'ws-dropdown-item';
            btn2.id = 'ws-btn-comparechart';
            btn2.textContent = '📊 비교차트';
            analysisMenu.appendChild(btn2);
            btn2.addEventListener('click', function() {
              var parent = this.closest('.ws-bar-dropdown');
              if (parent) parent.classList.remove('ws-dropdown-open');
              window.WS.showCompareChart();
            });
          }
        }
      }, 500);
    };
  }

  // ==========================================================================
  // Section AK: 검색 조건 URL 공유 (Search Condition URL Sharing)
  // ==========================================================================
  window.WS.shareSearchCondition = function() {
    var s = window.WS.state;
    var params = {};

    // 기본 필터
    if (s.activeRegion && s.activeRegion !== '전국') params.region = s.activeRegion;
    if (s.selectedRegions && s.selectedRegions.length > 0) params.regions = s.selectedRegions.join(',');
    if (s.typeTab && s.typeTab !== '전체') params.type = s.typeTab;
    if (s.deal && s.deal !== '전체') params.deal = s.deal;
    if (s.floor && s.floor !== '전체') params.floor = s.floor;
    if (s.roomCount && s.roomCount !== '전체') params.rooms = s.roomCount;
    if (s.roomShape && s.roomShape !== '전체') params.shape = s.roomShape;
    if (s.builtYear && s.builtYear !== '전체') params.built = s.builtYear;
    if (s.direction && s.direction !== '전체') params.dir = s.direction;
    if (s.parking && s.parking !== '전체') params.park = s.parking;
    if (s.livingSize && s.livingSize !== '전체') params.living = s.livingSize;

    // 가격 필터
    if (s.minBasePrice) params.bp1 = s.minBasePrice;
    if (s.maxBasePrice) params.bp2 = s.maxBasePrice;
    if (s.minDeposit) params.dp1 = s.minDeposit;
    if (s.maxDeposit) params.dp2 = s.maxDeposit;
    if (s.minMonthly) params.mt1 = s.minMonthly;
    if (s.maxMonthly) params.mt2 = s.maxMonthly;
    if (s.minSalePrice) params.sp1 = s.minSalePrice;
    if (s.maxSalePrice) params.sp2 = s.maxSalePrice;

    // 면적 필터
    if (s.minArea) params.a1 = s.minArea;
    if (s.maxArea) params.a2 = s.maxArea;

    // 체크박스 필터
    if (s.checks) {
      var activeChecks = Object.keys(s.checks).filter(function(k) { return s.checks[k]; });
      if (activeChecks.length > 0) params.chk = activeChecks.join(',');
    }

    // 키워드, 정렬
    if (s.keyword) params.q = s.keyword;
    if (s.sortBy && s.sortBy !== 'latest') params.sort = s.sortBy;

    var paramStr = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');

    if (!paramStr) {
      window.WS.showToast('설정된 검색 조건이 없습니다', 'warning');
      return;
    }

    var shareUrl = 'https://wishes.co.kr/admin?sort=latest&wsf=' + btoa(unescape(encodeURIComponent(paramStr)));

    // 조건 요약 텍스트 생성
    var summary = [];
    if (params.region) summary.push('지역: ' + params.region);
    if (params.type) summary.push('유형: ' + params.type);
    if (params.deal) summary.push('거래: ' + params.deal);
    if (params.q) summary.push('키워드: ' + params.q);
    if (params.dp1 || params.dp2) summary.push('보증금: ' + (params.dp1 || '~') + '~' + (params.dp2 || '') + '만');
    if (params.mt1 || params.mt2) summary.push('월세: ' + (params.mt1 || '~') + '~' + (params.mt2 || '') + '만');

    var shareText = '📌 WISHES 매물검색 조건 공유\n';
    if (summary.length > 0) shareText += summary.join(' / ') + '\n';
    shareText += '\n🔗 ' + shareUrl;

    // 모달 표시
    var existing = document.getElementById('ws-modal-share-condition');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-share-condition';
    modal.className = 'ws-modal';
    modal.innerHTML = '<div class="ws-modal-content" style="max-width:520px;">' +
      '<button class="ws-modal-close">&times;</button>' +
      '<h2 style="font-size:18px;font-weight:800;color:#2D5A27;margin:0 0 16px;">📌 검색 조건 공유</h2>' +
      '<p style="font-size:12px;color:#888;margin-bottom:12px;">현재 필터 조건이 URL로 인코딩됩니다. 동료에게 공유하면 같은 조건으로 검색됩니다.</p>' +
      '<div style="margin-bottom:12px;">' +
        '<label style="font-size:11px;color:#666;font-weight:600;">적용된 조건</label>' +
        '<div style="padding:10px;background:#f0fdf4;border-radius:8px;font-size:12px;color:#333;margin-top:4px;">' +
          (summary.length > 0 ? escHtml(summary.join(' | ')) : '<span style="color:#aaa;">기본 조건 (전체)</span>') +
        '</div>' +
      '</div>' +
      '<textarea id="ws-share-condition-text" readonly style="width:100%;height:80px;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:11px;resize:none;color:#555;box-sizing:border-box;">' + escHtml(shareText) + '</textarea>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="ws-copy-condition" style="flex:1;padding:10px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">📋 복사하기</button>' +
        '<button id="ws-copy-url-only" style="flex:1;padding:10px;background:#fff;color:#2D5A27;border:2px solid #2D5A27;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">🔗 URL만 복사</button>' +
      '</div>' +
    '</div>';

    var container = document.querySelector('.ws-search-container') || document.body;
    container.appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('ws-copy-condition').addEventListener('click', function() {
      navigator.clipboard.writeText(shareText).then(function() {
        window.WS.showToast('검색 조건이 복사되었습니다', 'success');
      }).catch(function() { window.WS._fallbackCopy(shareText); });
    });

    document.getElementById('ws-copy-url-only').addEventListener('click', function() {
      navigator.clipboard.writeText(shareUrl).then(function() {
        window.WS.showToast('URL이 복사되었습니다', 'success');
      }).catch(function() { window.WS._fallbackCopy(shareUrl); });
    });
  };

  // URL에서 검색 조건 복원
  window.WS._restoreFromShareUrl = function() {
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var wsf = urlParams.get('wsf');
      if (!wsf) return;

      var decoded = decodeURIComponent(escape(atob(wsf)));
      var params = {};
      decoded.split('&').forEach(function(pair) {
        var kv = pair.split('=');
        if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
      });

      var s = window.WS.state;
      if (params.region) s.activeRegion = params.region;
      if (params.regions) s.selectedRegions = params.regions.split(',');
      if (params.type) s.typeTab = params.type;
      if (params.deal) s.deal = params.deal;
      if (params.floor) s.floor = params.floor;
      if (params.rooms) s.roomCount = params.rooms;
      if (params.shape) s.roomShape = params.shape;
      if (params.built) s.builtYear = params.built;
      if (params.dir) s.direction = params.dir;
      if (params.park) s.parking = params.park;
      if (params.living) s.livingSize = params.living;
      if (params.bp1) s.minBasePrice = params.bp1;
      if (params.bp2) s.maxBasePrice = params.bp2;
      if (params.dp1) s.minDeposit = params.dp1;
      if (params.dp2) s.maxDeposit = params.dp2;
      if (params.mt1) s.minMonthly = params.mt1;
      if (params.mt2) s.maxMonthly = params.mt2;
      if (params.sp1) s.minSalePrice = params.sp1;
      if (params.sp2) s.maxSalePrice = params.sp2;
      if (params.a1) s.minArea = params.a1;
      if (params.a2) s.maxArea = params.a2;
      if (params.q) s.keyword = params.q;
      if (params.sort) s.sortBy = params.sort;
      if (params.chk) {
        params.chk.split(',').forEach(function(k) {
          if (s.checks.hasOwnProperty(k)) s.checks[k] = true;
        });
      }

      window.WS.showToast('공유된 검색 조건이 적용되었습니다', 'success');
    } catch(e) { /* 복원 실패 무시 */ }
  };

  // ==========================================================================
  // Section AL: 선택 매물 PDF 카탈로그 일괄 출력
  // ==========================================================================
  window.WS.exportPdfCatalog = function() {
    var selected = [];
    if (window.WS.state.selectedIds && window.WS.state.selectedIds.size > 0) {
      var allData = window.WS.allListings || [];
      window.WS.state.selectedIds.forEach(function(id) {
        var found = allData.find(function(l) { return String(l.id) === String(id); });
        if (found) selected.push(found);
      });
    }
    if (selected.length === 0) {
      window.WS.showToast('매물을 먼저 선택해주세요', 'warning');
      return;
    }
    if (selected.length > 20) {
      window.WS.showToast('최대 20건까지 일괄 출력 가능합니다', 'warning');
      return;
    }

    var printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.WS.showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.', 'error');
      return;
    }

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>WISHES 매물 카탈로그</title><style>' +
      'body{font-family:"Malgun Gothic","맑은 고딕",sans-serif;padding:0;margin:0;color:#333;font-size:12px;background:#fff;}' +
      '.catalog-header{text-align:center;padding:30px 20px 20px;border-bottom:3px solid #2D5A27;}' +
      '.catalog-header h1{margin:0;font-size:22px;color:#2D5A27;}' +
      '.catalog-header p{margin:6px 0 0;font-size:12px;color:#888;}' +
      '.catalog-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px;max-width:900px;margin:0 auto;}' +
      '.card{border:1px solid #ddd;border-radius:10px;overflow:hidden;page-break-inside:avoid;break-inside:avoid;}' +
      '.card-img{width:100%;height:140px;object-fit:cover;background:#f0f0f0;display:block;}' +
      '.card-body{padding:10px 12px;}' +
      '.card-title{font-size:13px;font-weight:700;color:#333;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.card-addr{font-size:10px;color:#888;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.card-price{font-size:14px;font-weight:800;color:#e53e3e;margin-bottom:6px;}' +
      '.card-info{display:flex;flex-wrap:wrap;gap:4px;}' +
      '.card-tag{font-size:9px;padding:2px 6px;background:#f0fdf4;color:#2D5A27;border-radius:3px;}' +
      '.catalog-footer{text-align:center;padding:20px;font-size:10px;color:#aaa;border-top:1px solid #eee;margin-top:20px;}' +
      '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.catalog-grid{gap:12px;padding:12px;}button{display:none!important;}}' +
      '</style></head><body>' +
      '<div class="catalog-header">' +
        '<h1>WISHES 매물 카탈로그</h1>' +
        '<p>총 ' + selected.length + '건 | ' + new Date().toLocaleDateString('ko-KR') + ' 기준</p>' +
      '</div>' +
      '<div class="catalog-grid">';

    selected.forEach(function(l) {
      var images = l.listing_images || l.images || [];
      var imgUrl = '';
      if (images.length > 0) imgUrl = images[0].url || images[0];
      var priceText = '';
      if (typeof formatPrice === 'function') {
        priceText = formatPrice(l.deposit, l.monthly, l.price, l.deal);
      } else {
        priceText = l.price ? l.price + '만원' : '-';
      }

      html += '<div class="card">';
      if (imgUrl) {
        html += '<img class="card-img" src="' + escHtml(imgUrl) + '" onerror="this.style.display=\'none\'">';
      } else {
        html += '<div class="card-img" style="display:flex;align-items:center;justify-content:center;color:#ccc;font-size:24px;">🏠</div>';
      }
      html += '<div class="card-body">';
      html += '<div class="card-title">' + escHtml(l.title || '매물') + '</div>';
      html += '<div class="card-addr">' + escHtml(l.address || '') + '</div>';
      html += '<div class="card-price">' + escHtml(priceText) + '</div>';
      html += '<div class="card-info">';
      if (l.type) html += '<span class="card-tag">' + escHtml(l.type) + '</span>';
      if (l.deal) html += '<span class="card-tag">' + escHtml(l.deal) + '</span>';
      if (l.area) html += '<span class="card-tag">' + escHtml(l.area) + 'm²</span>';
      if (l.floor_info) html += '<span class="card-tag">' + escHtml(l.floor_info) + '</span>';
      if (l.rooms) html += '<span class="card-tag">' + escHtml(l.rooms) + '개</span>';
      if (l.direction) html += '<span class="card-tag">' + escHtml(l.direction) + '</span>';
      html += '</div></div></div>';
    });

    html += '</div>' +
      '<div class="catalog-footer">WISHES | 서울·경기 종합부동산 서비스 | wishes.co.kr<br>본 자료는 참고용이며 실제 계약 시 현장 확인이 필요합니다.</div>' +
      '<script>setTimeout(function(){window.print();},600);<\/script>' +
      '</body></html>';

    // script 태그 제거 방어 (htmlContent에서만 — 여기선 자체 생성이므로 안전)
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ==========================================================================
  // 초기화: URL 공유 조건 복원 + 버튼 연결
  // ==========================================================================
  // 새 기능 버튼 삽입 함수 (검색 UI 표시 후 호출)
  function _addNewFeatureButtons() {
    var shareMenus = document.querySelectorAll('.ws-dropdown-menu');
    var shareMenu = shareMenus.length >= 1 ? shareMenus[0] : null;
    if (!shareMenu) return;

    if (!document.getElementById('ws-btn-share-condition')) {
      var btn = document.createElement('button');
      btn.className = 'ws-dropdown-item';
      btn.id = 'ws-btn-share-condition';
      btn.textContent = '📌 검색조건 공유';
      shareMenu.appendChild(btn);
      btn.addEventListener('click', function() {
        var parent = this.closest('.ws-bar-dropdown');
        if (parent) parent.classList.remove('ws-dropdown-open');
        window.WS.shareSearchCondition();
      });
    }

    if (!document.getElementById('ws-btn-pdf-catalog')) {
      var btn2 = document.createElement('button');
      btn2.className = 'ws-dropdown-item';
      btn2.id = 'ws-btn-pdf-catalog';
      btn2.textContent = '📑 PDF 카탈로그';
      shareMenu.appendChild(btn2);
      btn2.addEventListener('click', function() {
        var parent = this.closest('.ws-bar-dropdown');
        if (parent) parent.classList.remove('ws-dropdown-open');
        window.WS.exportPdfCatalog();
      });
    }
  }

  // MutationObserver로 검색 UI 생성 감지 → 버튼 삽입
  (function _initNewFeatures() {
    var _btnAdded = false;
    var observer = new MutationObserver(function() {
      if (_btnAdded) return;
      var menu = document.querySelector('.ws-dropdown-menu');
      if (menu) {
        _btnAdded = true;
        observer.disconnect(); // 메뉴 발견 후 더 이상 감시 불필요
        setTimeout(_addNewFeatureButtons, 300);
        // URL 공유 조건 복원
        if (window.WS._restoreFromShareUrl) {
          setTimeout(function() { window.WS._restoreFromShareUrl(); }, 500);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 이미 메뉴가 있으면 즉시 실행
    if (document.querySelector('.ws-dropdown-menu')) {
      _addNewFeatureButtons();
      if (window.WS._restoreFromShareUrl) window.WS._restoreFromShareUrl();
    }
  })();

  // ============================================================================
  // 매물 관리 통합 기능 (Section MG)
  // ============================================================================

  // MG-1) 상태 대시보드 업데이트
  window.WS._updateMgmtDashboard = function() {
    var all = window.WS.allListings || [];
    var total = all.length;
    var pub = 0, priv = 0, contracting = 0, completed = 0;
    all.forEach(function(l) {
      var st = l.status || '공개';
      if (st === '비공개') priv++;
      else if (st === '계약중') contracting++;
      else if (st === '계약완료') completed++;
      else pub++;
    });
    var el = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val.toLocaleString(); };
    el('ws-mgmt-total', total);
    el('ws-mgmt-public', pub);
    el('ws-mgmt-private', priv);
    el('ws-mgmt-contracting', contracting);
    el('ws-mgmt-completed', completed);
  };

  // MG-2) 대시보드 상태 필터 클릭
  (function _initMgmtDashboard() {
    var _mgmtReady = false;
    var _initDash = function() {
      if (_mgmtReady) return;
      var dash = document.getElementById('ws-mgmt-dashboard');
      if (!dash) return;
      _mgmtReady = true;

      // 상태 필터 클릭
      dash.querySelectorAll('.ws-mgmt-stat').forEach(function(stat) {
        stat.addEventListener('click', function() {
          var filter = this.dataset.statusFilter;
          dash.querySelectorAll('.ws-mgmt-stat').forEach(function(s) {
            s.style.boxShadow = '';
            s.style.transform = '';
          });
          this.style.boxShadow = '0 0 0 3px rgba(45,90,39,0.4)';
          this.style.transform = 'scale(1.05)';
          if (filter === 'all') {
            window.WS.state._statusFilter = null;
          } else {
            window.WS.state._statusFilter = filter;
          }
          window.WS.applyFilters();
          window.WS.renderListings();
        });
      });

      // 새 매물 등록 버튼
      var btnNew = document.getElementById('ws-btn-new-listing');
      if (btnNew) btnNew.addEventListener('click', function() { window.WS._showNewListingModal(); });

      // 대량 등록 버튼
      var btnBulk = document.getElementById('ws-btn-bulk-upload');
      if (btnBulk) btnBulk.addEventListener('click', function() { window.WS._showBulkUploadModal(); });

      // 일괄 상태 변경
      var btnBulkSt = document.getElementById('ws-btn-bulk-status');
      if (btnBulkSt) btnBulkSt.addEventListener('click', function() { window.WS._bulkStatusChange(); });

      // AI 일괄 자동생성 (건축물대장 + AI 설명)
      var btnAutoGen = document.getElementById('ws-btn-bulk-autogen');
      if (btnAutoGen) btnAutoGen.addEventListener('click', function() { window.WS._runBulkAutoGenerate(); });

      // CSV 내보내기
      var btnCsv = document.getElementById('ws-btn-csv-export');
      if (btnCsv) btnCsv.addEventListener('click', function() { window.WS._exportCSV(); });
    };

    var obs = new MutationObserver(function() {
      _initDash();
      if (_mgmtReady) obs.disconnect(); // 대시보드 초기화 완료 후 감시 중단
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(_initDash, 500);
  })();

  // MG-3) 상태 변경 API 호출 — admin field-update 엔드포인트 사용
  window.WS._changeListingStatus = function(id, newStatus) {
    fetch(window.WS._FIELD_UPDATE_API || 'https://wishes.co.kr/api/admin/listings-field-update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wishes2026' },
      body: JSON.stringify({ id: Number(id), fields: { status: newStatus } })
    }).then(function(r) {
      if (r.ok) {
        return r.text().then(function(txt) {
          if (!txt || !txt.trim()) return { success: true };
          try { return JSON.parse(txt); } catch(e) { return { success: true }; }
        });
      }
      return r.text().then(function(txt) {
        var errMsg = '서버 오류 (' + r.status + ')';
        try { var j = JSON.parse(txt); errMsg = j.error || j.message || errMsg; } catch(e) {}
        throw new Error(errMsg);
      });
    }).then(function(data) {
      var listing = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
      if (listing) listing.status = newStatus;
      window.WS._updateMgmtDashboard();
      showToast('매물 #' + id + ' 상태 → ' + newStatus + ' 변경완료', 'success');
    }).catch(function(err) {
      showToast('상태 변경 오류: ' + err.message, 'error');
    });
  };

  // MG-4) 매물 삭제 (superadmin 전용)
  window.WS._deleteListing = function(listing) {
    if (!window.WS.isSuperAdmin()) {
      window.WS.showToast('⛔ 매물 삭제는 최고관리자만 가능합니다.', 'error');
      return;
    }
    if (!confirm('매물 #' + listing.id + ' [' + (listing.title || '') + '] 을(를) 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.')) return;
    var token = localStorage.getItem('wishes_token') || localStorage.getItem('token') || '';
    fetch('https://wishes.co.kr/api/listings/' + listing.id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) {
      if (r.ok) return r.text().then(function(t) { if (!t || !t.trim()) return { success: true }; try { return JSON.parse(t); } catch(e) { return { success: true }; } });
      return r.text().then(function(t) { var msg = '서버 오류 (' + r.status + ')'; try { var j = JSON.parse(t); msg = j.error || j.message || msg; } catch(e) {} throw new Error(msg); });
    }).then(function(data) {
      window.WS.allListings = (window.WS.allListings || []).filter(function(l) { return String(l.id) !== String(listing.id); });
      window.WS.applyFilters();
      window.WS.renderListings();
      window.WS._updateMgmtDashboard();
      showToast('매물 #' + listing.id + ' 삭제완료', 'success');
    }).catch(function(err) {
      showToast('삭제 오류: ' + err.message, 'error');
    });
  };

  // MG-5) 매물 수정 모달
  window.WS._showEditModal = function(listing) {
    var old = document.getElementById('ws-edit-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-edit-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:600px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="margin:0;font-size:18px;font-weight:700;color:#2D5A27;">✏️ 매물 수정 (ID: ' + listing.id + ')</h3>' +
        '<button id="ws-edit-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">제목</label><input id="ws-edit-title" value="' + escHtml(listing.title || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">거래유형</label><select id="ws-edit-deal" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          '<option value="월세"' + (listing.deal === '월세' ? ' selected' : '') + '>월세</option>' +
          '<option value="전세"' + (listing.deal === '전세' ? ' selected' : '') + '>전세</option>' +
          '<option value="매매"' + (listing.deal === '매매' ? ' selected' : '') + '>매매</option>' +
        '</select></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">주소</label><input id="ws-edit-address" value="' + escHtml(listing.address || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">동/호수</label><input id="ws-edit-detail" value="' + escHtml(listing.address_detail || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">보증금 (만원)</label><input type="number" id="ws-edit-deposit" value="' + (listing.deposit || 0) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">월세 (만원)</label><input type="number" id="ws-edit-monthly" value="' + (listing.monthly || 0) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">매매가 (만원)</label><input type="number" id="ws-edit-price" value="' + (listing.price || 0) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">유형</label><select id="ws-edit-type" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          ['원룸','투룸','쓰리룸','오피스텔','아파트','빌라','상가','사무실','기타'].map(function(t) { return '<option value="' + t + '"' + (listing.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
        '</select></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">면적 (m²)</label><input type="number" id="ws-edit-area" value="' + (listing.area_m2 || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">층수</label><input id="ws-edit-floor" value="' + (listing.floor_current || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">관리비 (만원)</label><input type="number" id="ws-edit-maint" value="' + (listing.maintenance_fee || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">관리비 포함항목</label><input id="ws-edit-maint-includes" value="' + escHtml(listing.maintenance_includes || '') + '" placeholder="예: 수도, 인터넷, TV" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">상태</label><select id="ws-edit-status" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          '<option value="공개"' + ((listing.status || '공개') === '공개' ? ' selected' : '') + '>공개</option>' +
          '<option value="비공개"' + (listing.status === '비공개' ? ' selected' : '') + '>비공개</option>' +
          '<option value="계약중"' + (listing.status === '계약중' ? ' selected' : '') + '>계약중</option>' +
          '<option value="계약완료"' + (listing.status === '계약완료' ? ' selected' : '') + '>계약완료</option>' +
        '</select></div>' +
      '</div>' +
      '<div style="grid-column:1/-1;margin-top:8px;"><label style="font-size:12px;color:#666;font-weight:600;">상세설명</label><textarea id="ws-edit-desc" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:vertical;">' + escHtml(listing.description || '') + '</textarea></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button id="ws-edit-cancel" style="padding:10px 20px;background:#f3f4f6;color:#333;border:none;border-radius:8px;font-size:14px;cursor:pointer;">취소</button>' +
        '<button id="ws-edit-save" style="padding:10px 24px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:700;">💾 저장</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    document.getElementById('ws-edit-close').addEventListener('click', function() { modal.remove(); });
    document.getElementById('ws-edit-cancel').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('ws-edit-save').addEventListener('click', function() {
      var body = {
        title: document.getElementById('ws-edit-title').value,
        deal: document.getElementById('ws-edit-deal').value,
        address: document.getElementById('ws-edit-address').value,
        address_detail: document.getElementById('ws-edit-detail').value,
        deposit: parseInt(document.getElementById('ws-edit-deposit').value) || 0,
        monthly: parseInt(document.getElementById('ws-edit-monthly').value) || 0,
        price: parseInt(document.getElementById('ws-edit-price').value) || 0,
        type: document.getElementById('ws-edit-type').value,
        area_m2: parseFloat(document.getElementById('ws-edit-area').value) || null,
        floor_current: document.getElementById('ws-edit-floor').value || null,
        maintenance_fee: parseInt(document.getElementById('ws-edit-maint').value) || null,
        maintenance_includes: document.getElementById('ws-edit-maint-includes').value || null,
        status: document.getElementById('ws-edit-status').value,
        description: document.getElementById('ws-edit-desc').value
      };

      var token = localStorage.getItem('wishes_token') || localStorage.getItem('token') || '';
      fetch('https://wishes.co.kr/api/listings/' + listing.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body)
      }).then(function(r) {
        if (r.ok) return r.text().then(function(t) { if (!t || !t.trim()) return { success: true }; try { return JSON.parse(t); } catch(e) { return { success: true }; } });
        return r.text().then(function(t) { var msg = '서버 오류 (' + r.status + ')'; try { var j = JSON.parse(t); msg = j.error || j.message || msg; } catch(e) {} throw new Error(msg); });
      }).then(function(data) {
        Object.keys(body).forEach(function(k) {
          if (body[k] !== null && body[k] !== undefined) listing[k] = body[k];
        });
        window.WS.applyFilters();
        window.WS.renderListings();
        window.WS._updateMgmtDashboard();
        modal.remove();
        showToast('매물 #' + listing.id + ' 수정 완료!', 'success');
      }).catch(function(err) {
        showToast('수정 오류: ' + err.message, 'error');
      });
    });
  };

  // MG-6) 새 매물 등록 모달
  window.WS._showNewListingModal = function() {
    var old = document.getElementById('ws-new-listing-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-new-listing-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:600px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="margin:0;font-size:18px;font-weight:700;color:#2D5A27;">➕ 새 매물 등록</h3>' +
        '<button id="ws-new-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">제목 *</label><input id="ws-new-title" placeholder="예: 관악구 신림동 원룸" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">거래유형 *</label><select id="ws-new-deal" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"><option value="월세">월세</option><option value="전세">전세</option><option value="매매">매매</option></select></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">주소 *</label><input id="ws-new-address" placeholder="서울특별시 관악구 신림동 123-4" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">동/호수</label><input id="ws-new-detail" placeholder="101동 201호" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">보증금 (만원)</label><input type="number" id="ws-new-deposit" value="0" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">월세 (만원)</label><input type="number" id="ws-new-monthly" value="0" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">매매가 (만원)</label><input type="number" id="ws-new-price" value="0" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">유형 *</label><select id="ws-new-type" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          ['원룸','투룸','쓰리룸','오피스텔','아파트','빌라','상가','사무실','기타'].map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') +
        '</select></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">면적 (m²)</label><input type="number" id="ws-new-area" placeholder="33" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">층수</label><input id="ws-new-floor" placeholder="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">관리비 (만원)</label><input type="number" id="ws-new-maint" placeholder="5" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">관리비 포함항목</label><input id="ws-new-maint-includes" placeholder="수도, 인터넷, TV" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">동</label><input id="ws-new-dong" placeholder="신림동" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
      '</div>' +
      '<div style="margin-top:12px;"><label style="font-size:12px;color:#666;font-weight:600;">상세설명</label><textarea id="ws-new-desc" rows="3" placeholder="매물 특이사항 등" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:vertical;"></textarea></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button id="ws-new-cancel" style="padding:10px 20px;background:#f3f4f6;color:#333;border:none;border-radius:8px;font-size:14px;cursor:pointer;">취소</button>' +
        '<button id="ws-new-save" style="padding:10px 24px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:700;">📝 등록하기</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    document.getElementById('ws-new-close').addEventListener('click', function() { modal.remove(); });
    document.getElementById('ws-new-cancel').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('ws-new-save').addEventListener('click', function() {
      var title = document.getElementById('ws-new-title').value.trim();
      var address = document.getElementById('ws-new-address').value.trim();
      if (!title || !address) { showToast('제목과 주소는 필수입니다.', 'error'); return; }

      var body = {
        title: title,
        deal: document.getElementById('ws-new-deal').value,
        address: address,
        address_detail: document.getElementById('ws-new-detail').value,
        deposit: parseInt(document.getElementById('ws-new-deposit').value) || 0,
        monthly: parseInt(document.getElementById('ws-new-monthly').value) || 0,
        price: parseInt(document.getElementById('ws-new-price').value) || 0,
        type: document.getElementById('ws-new-type').value,
        area_m2: parseFloat(document.getElementById('ws-new-area').value) || null,
        floor_current: document.getElementById('ws-new-floor').value || null,
        maintenance_fee: parseInt(document.getElementById('ws-new-maint').value) || null,
        maintenance_includes: document.getElementById('ws-new-maint-includes').value || null,
        dong: document.getElementById('ws-new-dong').value || null,
        description: document.getElementById('ws-new-desc').value,
        status: '공개'
      };

      var token = localStorage.getItem('wishes_token') || localStorage.getItem('token') || '';
      fetch('https://wishes.co.kr/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body)
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success || data.id || data.data) {
          var newListing = data.data || data;
          if (newListing.id) {
            window.WS.allListings = window.WS.allListings || [];
            window.WS.allListings.unshift(newListing);
            window.WS.applyFilters();
            window.WS.renderListings();
            window.WS._updateMgmtDashboard();
          }
          modal.remove();
          showToast('새 매물이 등록되었습니다! (ID: ' + (newListing.id || '?') + ')', 'success');
          // ★ 자동으로 건축물대장 조회 + AI 설명 생성 트리거
          if (newListing.id && window.WS._autoGenerateForNewListing) {
            setTimeout(function() {
              window.WS._autoGenerateForNewListing(newListing);
              showToast('🤖 건축물대장 + AI 설명 자동 생성 시작...', 'info');
            }, 2000);
          }
        } else {
          showToast('등록 실패: ' + (data.error || JSON.stringify(data)), 'error');
        }
      }).catch(function(err) {
        showToast('등록 오류: ' + err.message, 'error');
      });
    });
  };

  // MG-7) 대량 등록 모달
  window.WS._showBulkUploadModal = function() {
    var old = document.getElementById('ws-bulk-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-bulk-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:520px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<h3 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#7c3aed;">📁 매물 대량 등록</h3>' +
      '<p style="font-size:13px;color:#666;margin-bottom:12px;">CSV 파일을 업로드하여 여러 매물을 한 번에 등록할 수 있습니다.</p>' +
      '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px;color:#555;">' +
        '<strong>CSV 필수 컬럼:</strong> title, address, deal, deposit, monthly, price, type<br>' +
        '<strong>선택 컬럼:</strong> address_detail, dong, area_m2, floor_current, maintenance_fee, description' +
      '</div>' +
      '<div id="ws-bulk-dropzone" style="border:2px dashed #7c3aed;border-radius:12px;padding:32px;text-align:center;cursor:pointer;background:#faf5ff;">' +
        '<div style="font-size:32px;margin-bottom:8px;">📄</div>' +
        '<div style="font-size:14px;font-weight:600;color:#7c3aed;">CSV 파일을 드래그하거나 클릭하여 선택</div>' +
        '<input type="file" id="ws-bulk-file" accept=".csv" style="display:none;">' +
      '</div>' +
      '<div id="ws-bulk-preview" style="display:none;margin-top:12px;max-height:200px;overflow-y:auto;"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button id="ws-bulk-cancel" style="padding:8px 16px;background:#f3f4f6;color:#333;border:none;border-radius:8px;cursor:pointer;">취소</button>' +
        '<button id="ws-bulk-submit" style="padding:8px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;display:none;">🚀 일괄 등록</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    var fileInput = document.getElementById('ws-bulk-file');
    var dropzone = document.getElementById('ws-bulk-dropzone');
    var preview = document.getElementById('ws-bulk-preview');
    var submitBtn = document.getElementById('ws-bulk-submit');
    var parsedRows = [];

    dropzone.addEventListener('click', function() { fileInput.click(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.getElementById('ws-bulk-cancel').addEventListener('click', function() { modal.remove(); });

    fileInput.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        var lines = e.target.result.split('\n').filter(function(l) { return l.trim(); });
        if (lines.length < 2) { showToast('CSV에 데이터가 없습니다.', 'error'); return; }
        var headers = lines[0].split(',').map(function(h) { return h.trim().replace(/"/g, ''); });
        parsedRows = [];
        for (var i = 1; i < lines.length; i++) {
          var vals = lines[i].split(',').map(function(v) { return v.trim().replace(/"/g, ''); });
          var row = {};
          headers.forEach(function(h, idx) { row[h] = vals[idx] || ''; });
          parsedRows.push(row);
        }
        preview.style.display = 'block';
        preview.innerHTML = '<div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px;">' + parsedRows.length + '건 감지됨</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f3f4f6;">' +
          headers.slice(0, 5).map(function(h) { return '<th style="padding:4px 6px;border:1px solid #ddd;">' + h + '</th>'; }).join('') +
          '</tr>' +
          parsedRows.slice(0, 5).map(function(row) {
            return '<tr>' + headers.slice(0, 5).map(function(h) { return '<td style="padding:4px 6px;border:1px solid #ddd;">' + (row[h] || '') + '</td>'; }).join('') + '</tr>';
          }).join('') +
          (parsedRows.length > 5 ? '<tr><td colspan="5" style="text-align:center;padding:4px;color:#888;">... 외 ' + (parsedRows.length - 5) + '건</td></tr>' : '') +
          '</table>';
        submitBtn.style.display = 'inline-block';
      };
      reader.readAsText(file, 'UTF-8');
    });

    submitBtn.addEventListener('click', function() {
      if (parsedRows.length === 0) return;
      var token = localStorage.getItem('wishes_token') || localStorage.getItem('token') || '';
      var success = 0, fail = 0, total = parsedRows.length;
      submitBtn.textContent = '등록중... 0/' + total;
      submitBtn.disabled = true;

      function doNext(idx) {
        if (idx >= total) {
          showToast('대량 등록 완료! (성공: ' + success + ', 실패: ' + fail + ')', success > 0 ? 'success' : 'error');
          modal.remove();
          if (success > 0) {
            window.WS.loadData();
            // ★ 대량 등록 후 자동으로 건축물대장+AI 일괄 생성 안내
            showToast('💡 새로 등록된 매물에 AI 설명을 추가하려면 "🏗️ AI일괄생성" 버튼을 눌러주세요!', 'info');
          }
          return;
        }
        var row = parsedRows[idx];
        var body = {
          title: row.title || '',
          address: row.address || '',
          deal: row.deal || '월세',
          deposit: parseInt(row.deposit) || 0,
          monthly: parseInt(row.monthly) || 0,
          price: parseInt(row.price) || 0,
          type: row.type || '원룸',
          address_detail: row.address_detail || '',
          dong: row.dong || '',
          area_m2: parseFloat(row.area_m2) || null,
          floor_current: row.floor_current || null,
          maintenance_fee: parseInt(row.maintenance_fee) || null,
          description: row.description || '',
          status: '공개'
        };
        fetch('https://wishes.co.kr/api/listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(body)
        }).then(function(r) { return r.json(); }).then(function(d) {
          if (d.success || d.id || d.data) success++; else fail++;
        }).catch(function() { fail++; }).finally(function() {
          submitBtn.textContent = '등록중... ' + (idx + 1) + '/' + total;
          setTimeout(function() { doNext(idx + 1); }, 100);
        });
      }
      doNext(0);
    });
  };

  // MG-8) 일괄 상태 변경
  window.WS._bulkStatusChange = function() {
    var selectedIds = Array.from(window.WS.state.selectedIds);
    if (selectedIds.length === 0) {
      showToast('먼저 매물을 선택해주세요.', 'warning');
      return;
    }

    var old = document.getElementById('ws-bulk-status-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-bulk-status-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<h3 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#d97706;">🔄 일괄 상태 변경</h3>' +
      '<p style="font-size:14px;color:#333;">선택된 <strong>' + selectedIds.length + '건</strong>의 매물 상태를 변경합니다.</p>' +
      '<select id="ws-bulk-new-status" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin:16px 0;">' +
        '<option value="공개">🟢 공개</option>' +
        '<option value="비공개">⚪ 비공개</option>' +
        '<option value="계약중">🟡 계약중</option>' +
        '<option value="계약완료">✅ 계약완료</option>' +
      '</select>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="ws-bst-cancel" style="padding:8px 16px;background:#f3f4f6;color:#333;border:none;border-radius:8px;cursor:pointer;">취소</button>' +
        '<button id="ws-bst-apply" style="padding:8px 20px;background:#d97706;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">적용</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.getElementById('ws-bst-cancel').addEventListener('click', function() { modal.remove(); });

    document.getElementById('ws-bst-apply').addEventListener('click', function() {
      var newSt = document.getElementById('ws-bulk-new-status').value;
      var token = localStorage.getItem('wishes_token') || localStorage.getItem('token') || '';
      var done = 0, total = selectedIds.length;

      selectedIds.forEach(function(id) {
        fetch(window.WS._FIELD_UPDATE_API || 'https://wishes.co.kr/api/admin/listings-field-update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wishes2026' },
          body: JSON.stringify({ id: Number(id), fields: { status: newSt } })
        }).then(function(r) {
          if (r.ok) return r.text().then(function(t) { try { return JSON.parse(t); } catch(e) { return { success: true }; } });
          throw new Error('서버 오류 (' + r.status + ')');
        }).then(function() {
          var listing = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
          if (listing) listing.status = newSt;
        }).catch(function() {}).finally(function() {
          done++;
          if (done >= total) {
            window.WS.applyFilters();
            window.WS.renderListings();
            window.WS._updateMgmtDashboard();
            modal.remove();
            showToast(total + '건 상태 → ' + newSt + ' 일괄 변경 완료!', 'success');
          }
        });
      });
    });
  };

  // MG-9) CSV 내보내기
  window.WS._exportCSV = function() {
    var items = window.WS.filtered || window.WS.allListings || [];
    if (items.length === 0) { showToast('내보낼 매물이 없습니다.', 'warning'); return; }

    var headers = ['ID','제목','주소','동/호수','동','유형','거래','보증금','월세','매매가','관리비','면적(m²)','층','상태','등록일'];
    var rows = items.map(function(l) {
      return [
        l.id, '"' + (l.title || '').replace(/"/g, '""') + '"',
        '"' + (l.address || '').replace(/"/g, '""') + '"',
        '"' + (l.address_detail || '').replace(/"/g, '""') + '"',
        '"' + (l.dong || '').replace(/"/g, '""') + '"',
        l.type || '', l.deal || '',
        l.deposit || 0, l.monthly || 0, l.price || 0,
        l.maintenance_fee || '',
        l.area_m2 || '', l.floor_current || '',
        l.status || '공개',
        l.created_at || ''
      ].join(',');
    });

    var csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'WISHES_매물목록_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast(items.length + '건 CSV 내보내기 완료!', 'success');
  };

  // MG-10) applyFilters에 상태 필터 적용 (원래 applyFilters 확장)
  (function _patchApplyFiltersForStatus() {
    var _origApply = window.WS.applyFilters;
    window.WS.applyFilters = function(items) {
      var result = _origApply.call(window.WS, items || window.WS.allListings || []);
      // 상태 필터 적용
      var statusFilter = window.WS.state._statusFilter;
      if (statusFilter && result) {
        result = result.filter(function(l) {
          var st = l.status || '공개';
          return st === statusFilter;
        });
      }
      // 결과를 window.WS.filtered에 할당
      if (result) window.WS.filtered = result;
      // 대시보드 업데이트
      window.WS._updateMgmtDashboard();
      return result;
    };
  })();

  // MG-11) 사이드바에서 "매물 관리" 클릭 시 → "매물 검색"으로 리다이렉트
  (function _redirectListingsToSearch() {
    var _redirectBound = false;
    function _tryRedirect() {
      if (_redirectBound) return;
      var links = document.querySelectorAll('a[href*="/admin/listings"], nav a, aside a');
      var found = false;
      links.forEach(function(link) {
        var text = link.textContent.trim();
        if (text.indexOf('매물 관리') !== -1 || (link.href && link.href.indexOf('/admin/listings') !== -1)) {
          found = true;
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            // 매물 검색 버튼 클릭 시뮬레이션
            var searchBtn = document.querySelector('[data-ws-search-trigger]') || document.getElementById('ws-search-btn');
            if (searchBtn) {
              searchBtn.click();
            } else {
              // fallback: 매물 검색 사이드바 아이템 찾기
              var navItems = document.querySelectorAll('nav a, aside a, [class*="sidebar"] a');
              navItems.forEach(function(ni) {
                if (ni.textContent.trim().indexOf('매물 검색') !== -1) ni.click();
              });
            }
            showToast('💡 매물 관리가 매물 검색으로 통합되었습니다!', 'info');
          });
          // 시각적으로 매물 관리 → 매물 통합검색 으로 텍스트 변경
          var textEl = link.querySelector('span') || link;
          if (textEl.textContent.indexOf('매물 관리') !== -1) {
            textEl.textContent = textEl.textContent.replace('매물 관리', '매물 통합관리');
          }
        }
      });
      if (found) {
        _redirectBound = true;
        if (obs) obs.disconnect(); // 바인딩 완료 후 감시 중단
      }
    }
    setTimeout(_tryRedirect, 1000);
    setTimeout(_tryRedirect, 3000);
    var obs = new MutationObserver(function() { _tryRedirect(); });
    obs.observe(document.body, { childList: true, subtree: true });
  })();

  // ========== AI SEO 자동생성 기능 ==========

  // ★ 새 매물 등록 시 자동 실행:
  // 1) 건축물대장 조회 → 기본정보/면적구조/추가정보 DB 필드 직접 업데이트 (PATCH)
  // 2) AI 제목/설명/SEO 생성 (금액 제외, 매력 포인트 중심)
  // 3) 직접 내용 첨부 방식 제외, API 자동 처리만
  // 안전한 JSON 파싱 헬퍼 (모든 API 호출에서 공통 사용)
  window.WS._safeJson = function(response) {
    if (!response.ok) {
      _wsLog('[WISHES-AI] HTTP 응답: ' + response.status + ' ' + response.statusText);
      return Promise.resolve({ success: false, error: 'HTTP ' + response.status, status: response.status });
    }
    return response.text().then(function(text) {
      if (!text || text.trim() === '') return { success: false, error: 'empty response' };
      try { return JSON.parse(text); }
      catch(e) {
        _wsLog('[WISHES-AI] JSON 파싱 실패:', text.substring(0, 200));
        return { success: false, error: 'invalid JSON' };
      }
    });
  };

  /**
   * Safe fetch with retry for transient 5xx errors
   * @param {string} url - Request URL
   * @param {object} options - Fetch options
   * @param {number} maxRetries - Max retry count (default 2)
   * @returns {Promise<Response>}
   */
  window.WS._fetchWithRetry = function(url, options, maxRetries) {
    maxRetries = maxRetries || 2;
    var attempt = 0;
    function tryFetch() {
      return fetch(url, options).then(function(r) {
        if (r.status >= 500 && attempt < maxRetries) {
          attempt++;
          var delay = attempt * 2000; // 2초, 4초 딜레이
          _wsLog('[WISHES] 서버 오류 ' + r.status + ', ' + delay/1000 + '초 후 재시도 (' + attempt + '/' + maxRetries + ')');
          return new Promise(function(resolve) {
            setTimeout(function() { resolve(tryFetch()); }, delay);
          });
        }
        return r;
      }).catch(function(err) {
        if (attempt < maxRetries) {
          attempt++;
          var delay = attempt * 2000;
          _wsLog('[WISHES] 네트워크 오류, ' + delay/1000 + '초 후 재시도 (' + attempt + '/' + maxRetries + '): ' + (err.message || err));
          return new Promise(function(resolve) {
            setTimeout(function() { resolve(tryFetch()); }, delay);
          });
        }
        throw err;
      });
    }
    return tryFetch();
  };

  // 서울/경기 시군구코드 매핑 (건축물대장 API용)
  window.WS._SIGUNGU_MAP = {
    // 서울특별시
    '종로구':'11110','중구':'11140','용산구':'11170','성동구':'11200','광진구':'11215',
    '동대문구':'11230','중랑구':'11260','성북구':'11290','강북구':'11305','도봉구':'11320',
    '노원구':'11350','은평구':'11380','서대문구':'11410','마포구':'11440','양천구':'11470',
    '강서구':'11500','구로구':'11530','금천구':'11545','영등포구':'11560','동작구':'11590',
    '관악구':'11620','서초구':'11650','강남구':'11680','송파구':'11710','강동구':'11740',
    // 경기도 주요 시/구
    '수원시장안구':'41111','수원시권선구':'41113','수원시팔달구':'41115','수원시영통구':'41117',
    '성남시수정구':'41131','성남시중원구':'41133','성남시분당구':'41135',
    '용인시처인구':'41461','용인시기흥구':'41463','용인시수지구':'41465',
    '고양시덕양구':'41281','고양시일산동구':'41285','고양시일산서구':'41287',
    '안양시만안구':'41171','안양시동안구':'41173',
    '부천시':'41190','광명시':'41210','평택시':'41220','안산시상록구':'41271','안산시단원구':'41273',
    '과천시':'41290','의왕시':'41430','군포시':'41410','시흥시':'41390','화성시':'41590',
    '하남시':'41450','이천시':'41500','김포시':'41570','광주시':'41610','파주시':'41480',
    '양주시':'41630','의정부시':'41150','남양주시':'41360','구리시':'41310','포천시':'41650',
    '동두천시':'41250','가평군':'41820','연천군':'41800','양평군':'41830',
    // 인천광역시 주요 구
    '인천중구':'28110','인천동구':'28140','인천미추홀구':'28177','인천연수구':'28185',
    '인천남동구':'28200','인천부평구':'28237','인천계양구':'28245','인천서구':'28260'
  };

  // 주소 → 시군구코드 + 본번/부번 파싱
  window.WS._parseAddress = function(address) {
    if (!address) return null;
    var addr = address.trim();
    var result = { sigunguCd: null, bun: null, ji: null };
    var map = window.WS._SIGUNGU_MAP;

    // 경기도 복합 시/구 패턴: "성남시 분당구" → "성남시분당구"
    var gyeonggiMatch = addr.match(/(수원시|성남시|용인시|고양시|안양시|안산시)\s*([\uAC00-\uD7A3]+구)/);
    if (gyeonggiMatch) {
      var key = gyeonggiMatch[1] + gyeonggiMatch[2];
      if (map[key]) result.sigunguCd = map[key];
    }

    // 인천 패턴: "인천광역시 미추홀구" → "인천미추홀구"
    if (!result.sigunguCd) {
      var incheonMatch = addr.match(/인천[^\s]*\s*([\uAC00-\uD7A3]+구)/);
      if (incheonMatch && map['인천' + incheonMatch[1]]) {
        result.sigunguCd = map['인천' + incheonMatch[1]];
      }
    }

    // 서울/일반 구 패턴: "강남구", "관악구" 등 (2~4자 한글 + 구)
    if (!result.sigunguCd) {
      var guMatch = addr.match(/([\uAC00-\uD7A3]{2,4}구)\s/);
      if (guMatch && map[guMatch[1]]) {
        result.sigunguCd = map[guMatch[1]];
      }
    }

    // 시/군 패턴: "부천시", "광명시" 등 (fallback)
    if (!result.sigunguCd) {
      var siMatch = addr.match(/([\uAC00-\uD7A3]{2,4}[시군])\s/);
      if (siMatch && map[siMatch[1]]) {
        result.sigunguCd = map[siMatch[1]];
      }
    }

    // 본번-부번 추출: "159-130" 또는 "706-16" 또는 "159"
    var bunMatch = addr.match(/(\d+)-(\d+)/);
    if (bunMatch) {
      result.bun = bunMatch[1].padStart(4, '0');
      result.ji = bunMatch[2].padStart(4, '0');
    } else {
      var bunOnly = addr.match(/\s(\d+)\s*$/);
      if (bunOnly) {
        result.bun = bunOnly[1].padStart(4, '0');
        result.ji = '0000';
      }
    }

    return (result.sigunguCd && result.bun) ? result : null;
  };

  window.WS._autoGenerateForNewListing = function(listing) {
    if (!listing || !listing.id) return;
    var lid = String(listing.id);
    var safeJson = window.WS._safeJson;
    _wsLog('[WISHES-AI] 새 매물 자동 생성 시작: #' + lid);

    // ★ 1단계: 확장프로그램에서 직접 건축물대장 조회 (주소 파싱 → 시군구코드 → GET API)
    var addressCodes = window.WS._parseAddress(listing.address);
    var buildingPromise;

    if (addressCodes) {
      var qs = 'sigunguCd=' + addressCodes.sigunguCd + '&bun=' + addressCodes.bun + '&ji=' + addressCodes.ji;
      _wsLog('[WISHES-AI] 건축물대장 조회: ' + listing.address + ' → ' + qs);

      buildingPromise = fetch('https://wishes.co.kr/api/admin/building-registry?' + qs, {
        headers: { 'Authorization': 'Bearer wishes2026' }
      })
      .then(function(r) { return safeJson(r); })
      .then(function(bldgData) {
        if (bldgData.success && bldgData.data) {
          _wsLog('[WISHES-AI] ✅ 건축물대장 조회 성공: #' + lid, bldgData.data);
          // 로컬 데이터에 건축물대장 정보 반영
          var local = (window.WS.allListings || []).find(function(l) { return String(l.id) === lid; });
          var d = bldgData.data;
          if (local) {
            if (d.elevatorCount && parseInt(d.elevatorCount) > 0) local.elevator = true;
            if (d.parkingCount && parseInt(d.parkingCount) > 0) local.parking = true;
            if (d.buildingPurpose && !local.building_use) local.building_use = d.buildingPurpose;
            if (d.buildingArea && !local.area_supply_m2) {
              var area = parseFloat(d.buildingArea);
              if (area > 0) local.area_supply_m2 = area;
            }
            if (d.useApproveDay && !local.built_year) {
              var yr = String(d.useApproveDay).substring(0, 4);
              if (yr.length === 4) local.built_year = yr;
            }
            if (d.totalFloorCount && !local.floor_total) {
              var fl = parseInt(d.totalFloorCount);
              if (fl > 0) local.floor_total = fl;
            }
          }
          return bldgData.data;
        }
        _wsLog('[WISHES-AI] ⏭️ 건축물대장 데이터 없음: #' + lid);
        return null;
      })
      .catch(function(err) {
        _wsLog('[WISHES-AI] 건축물대장 조회 오류: ' + err.message);
        return null;
      });
    } else {
      _wsLog('[WISHES-AI] ⏭️ 주소 파싱 불가 (시군구코드 매핑 없음): ' + (listing.address || ''));
      buildingPromise = Promise.resolve(null);
    }

    // ★ 2단계: 건축물대장 결과를 포함하여 AI 제목/설명 자동 생성
    buildingPromise.then(function(buildingData) {
      var fetchFn = window.WS._fetchWithRetry || fetch;
      return fetchFn('https://wishes.co.kr/api/admin/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wishes2026' },
        body: JSON.stringify({
          listingId: lid,
          style: 'trendy',
          aiModel: 'latest',
          autoMode: true,
          buildingRegistryData: buildingData,
          generateOptions: {
            excludePrice: true,
            excludeBasicSpecs: true,
            excludeBasicInfo: true,
            excludeAttachments: true,
            focusOnAttraction: true,
            attractionTopics: [
              'transport', 'infrastructure', 'view_light',
              'neighborhood', 'target_resident', 'living_convenience'
            ],
            seoOptimized: true,
            generateKeywords: true,
            generateTags: true
          }
        })
      });
    })
    .then(function(r) { return safeJson(r); })
    .then(function(data) {
      if (data.success) {
        if (data.steps) {
          data.steps.forEach(function(s) {
            var icon = s.status === 'ok' ? '✅' : (s.status === 'skipped' ? '⏭️' : '❌');
            _wsLog('[WISHES-AI] ' + icon + ' ' + s.step + ': ' + s.status + (s.error ? ' (' + s.error + ')' : ''));
          });
        }
        if (data.result) {
          var local = (window.WS.allListings || []).find(function(l) { return String(l.id) === lid; });
          if (local) {
            if (data.result.title) local.title = data.result.title;
            if (data.result.description) local.description = data.result.description;
            if (data.result.keywords) local.seo_keywords = data.result.keywords;
            if (data.result.tags) local.seo_tags = data.result.tags;
          }
        }
        _wsLog('[WISHES-AI] 자동 생성 완료: #' + lid + ' - ' + ((data.result && data.result.title) || ''));
      } else {
        _wsLog('[WISHES-AI] 자동 생성 실패: #' + lid + ' - ' + (data.error || ''));
      }
    })
    .catch(function(err) {
      _wsLog('[WISHES-AI] 자동 생성 오류: #' + lid + ' - ' + err.message);
    });
  };

  // 단일 매물 AI SEO 설명 생성 (수동 버튼 클릭)
  window.WS._runAutoGenerate = function(listingId, listing) {
    var statusEl = document.getElementById('ws-ai-status-' + listingId);
    var descEl = document.getElementById('ws-description-text-' + listingId);
    var btn = document.getElementById('ws-ai-generate-' + listingId);

    if (statusEl) {
      statusEl.innerHTML = '<div style="padding:12px;background:#f0f0ff;border-radius:8px;text-align:center;">' +
        '<div style="font-size:14px;color:#667eea;font-weight:600;">✨ AI SEO 설명 생성 중...</div>' +
        '<div style="font-size:11px;color:#999;margin-top:4px;">건축물대장 조회 → AI 분석 → SEO 최적화 (약 10~15초)</div></div>';
    }
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.textContent = '생성 중...'; }

    fetch('https://wishes.co.kr/api/admin/auto-generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wishes2026'
      },
      body: JSON.stringify({ listingId: listingId, style: 'trendy', aiModel: 'latest' })
    })
    .then(function(r) { return window.WS._safeJson(r); })
    .then(function(data) {
      if (data.success && data.result) {
        // 화면 업데이트
        if (descEl) descEl.innerHTML = escHtml(data.result.description || '');
        if (statusEl) {
          var tagsHtml = (data.result.tags || []).map(function(t) {
            return '<span style="display:inline-block;padding:2px 8px;background:#e8eaf6;color:#3f51b5;border-radius:12px;font-size:11px;margin:2px;">' + escHtml(t) + '</span>';
          }).join('');
          var kwHtml = (data.result.keywords || []).map(function(k) {
            return '<span style="display:inline-block;padding:2px 6px;background:#e8f5e9;color:#2e7d32;border-radius:4px;font-size:10px;margin:1px;">' + escHtml(k) + '</span>';
          }).join('');
          statusEl.innerHTML = '<div style="padding:12px;background:#f0fff0;border-radius:8px;border:1px solid #c8e6c9;">' +
            '<div style="font-size:13px;color:#2e7d32;font-weight:700;margin-bottom:6px;">✅ AI SEO 설명 생성 완료!</div>' +
            '<div style="font-size:12px;color:#333;margin-bottom:4px;"><strong>제목:</strong> ' + escHtml(data.result.title || '') + '</div>' +
            (data.result.meta_description ? '<div style="font-size:11px;color:#666;margin-bottom:8px;"><strong>메타설명:</strong> ' + escHtml(data.result.meta_description) + '</div>' : '') +
            (tagsHtml ? '<div style="margin-bottom:4px;"><strong style="font-size:11px;">태그:</strong> ' + tagsHtml + '</div>' : '') +
            (kwHtml ? '<div><strong style="font-size:11px;">키워드:</strong> ' + kwHtml + '</div>' : '') +
            (data.buildingInfo ? '<div style="margin-top:8px;font-size:11px;color:#888;"><strong>건축물대장:</strong> ' +
              (data.buildingInfo.건물명 || '-') + ' / ' + (data.buildingInfo.사용승인일 || '-') + ' / ' + (data.buildingInfo.건물구조 || '-') + '</div>' : '') +
            '</div>';
        }
        // 로컬 데이터 업데이트
        var local = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(listingId); });
        if (local) {
          if (data.result.title) local.title = data.result.title;
          if (data.result.description) local.description = data.result.description;
        }
        window.WS.showToast('AI SEO 설명 생성 완료!', 'success');
      } else {
        if (statusEl) statusEl.innerHTML = '<div style="padding:8px;background:#fff3e0;border-radius:8px;color:#e65100;font-size:12px;">⚠️ ' + escHtml(data.error || '생성 실패') + '</div>';
        window.WS.showToast('AI 생성 실패: ' + (data.error || ''), 'error');
      }
    })
    .catch(function(err) {
      if (statusEl) statusEl.innerHTML = '<div style="padding:8px;background:#ffebee;border-radius:8px;color:#c62828;font-size:12px;">❌ 오류: ' + escHtml(err.message) + '</div>';
      window.WS.showToast('AI 생성 오류: ' + err.message, 'error');
    })
    .finally(function() {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✨ AI SEO 설명 생성'; }
    });
  };

  // ★★★ 전체 매물 일괄 처리: 건축물대장 조회 → DB필드 업데이트 → AI SEO 생성 (한방에!) ★★★
  window.WS._bulkState = null;
  window.WS._SINGLE_API = 'https://wishes.co.kr/api/admin/auto-generate';
  window.WS._FIELD_UPDATE_API = 'https://wishes.co.kr/api/admin/listings-field-update';
  window.WS._BUILDING_API = 'https://wishes.co.kr/api/admin/building-registry';
  window.WS._BUILDING_FULL_API = 'https://wishes.co.kr/api/admin/building-registry-full';
  window.WS._BATCH_SIZE = 20;

  window.WS._runBulkAutoGenerate = function() {
    var allListings = window.WS.allListings || [];
    if (allListings.length === 0) { window.WS.showToast('매물이 없습니다', 'error'); return; }

    // 데이터 로딩 중이면 완료 대기 안내
    if (window.WS._loadingData) {
      window.WS.showToast('매물 데이터를 로딩 중입니다. 전체 로드 완료 후 다시 시도해주세요.', 'info');
      return;
    }

    if (window.WS._bulkState && window.WS._bulkState.running) {
      window.WS._bulkState.running = false;
      window.WS.showToast('일괄 처리 중지 요청됨', 'info');
      return;
    }

    // 모든 매물 대상 - 전체 데이터 대상 (1000건 제한 없음)
    var targets = allListings.filter(function(l) {
      var needsBuilding = !l.built_year || !l.floor_total || !l.bathrooms || !l.area_supply_m2 || !l.elevator;
      var needsAI = !l.description || l.description.length < 50;
      return needsBuilding || needsAI;
    });

    if (targets.length === 0) {
      window.WS.showToast('모든 매물이 이미 완료되어 있습니다', 'success');
      return;
    }

    var state = {
      running: true,
      targets: targets,
      total: targets.length,
      completed: 0,
      success: 0,
      fail: 0,
      buildingUpdated: 0,
      aiGenerated: 0,
      skipped: allListings.length - targets.length,
      startTime: Date.now()
    };
    window.WS._bulkState = state;

    // 진행 UI
    var overlay = document.createElement('div');
    overlay.id = 'ws-bulk-progress';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = '<div style="background:#fff;border-radius:16px;padding:32px;width:620px;max-width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="font-size:20px;font-weight:800;color:#333;">🏗️ 전체 매물 일괄 처리 (한방 모드)</div>' +
        '<div style="font-size:12px;color:#999;margin-top:4px;">전체 ' + allListings.length + '건 중 대상 ' + state.total + '건 처리 (완료: ' + state.skipped + '건 건너뜀)</div>' +
        '<div id="ws-bulk-mode" style="font-size:11px;color:#667eea;margin-top:4px;">건축물대장 조회 → DB 필드 업데이트 → AI 제목/설명 생성</div>' +
      '</div>' +
      '<div style="background:#f0f0f0;border-radius:8px;height:24px;overflow:hidden;margin-bottom:12px;">' +
        '<div id="ws-bulk-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:8px;transition:width 0.3s;"></div>' +
      '</div>' +
      '<div id="ws-bulk-stats" style="display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:8px;">' +
        '<span>진행: 0/' + state.total + '</span>' +
        '<span>✅ 0 | ❌ 0</span>' +
        '<span>남은시간: 계산 중...</span>' +
      '</div>' +
      '<div id="ws-bulk-substats" style="display:flex;justify-content:center;gap:20px;font-size:11px;color:#888;margin-bottom:12px;">' +
        '<span>🏗️ 건축물대장: 0건</span><span>🤖 AI 생성: 0건</span>' +
      '</div>' +
      '<div id="ws-bulk-log" style="background:#1a1a2e;color:#e0e0e0;border-radius:8px;padding:12px;height:220px;overflow-y:auto;font-family:monospace;font-size:11px;line-height:1.6;"></div>' +
      '<div style="text-align:center;margin-top:16px;">' +
        '<button id="ws-bulk-stop" style="padding:10px 24px;background:#e53935;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">⏹ 중지</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    document.getElementById('ws-bulk-stop').onclick = function() {
      state.running = false;
      this.textContent = '중지 중...';
      this.disabled = true;
    };

    function addLog(msg, type) {
      var logEl = document.getElementById('ws-bulk-log');
      if (!logEl) return;
      var color = type === 'success' ? '#4caf50' : type === 'error' ? '#ef5350' : type === 'skip' ? '#ffa726' : type === 'batch' ? '#64b5f6' : type === 'building' ? '#ff9800' : type === 'field' ? '#26c6da' : '#90caf9';
      logEl.innerHTML += '<div style="color:' + color + ';">' + msg + '</div>';
      logEl.scrollTop = logEl.scrollHeight;
    }

    function updateUI() {
      var pct = state.total > 0 ? Math.round(state.completed / state.total * 100) : 0;
      var bar = document.getElementById('ws-bulk-bar');
      var stats = document.getElementById('ws-bulk-stats');
      var substats = document.getElementById('ws-bulk-substats');
      if (bar) bar.style.width = pct + '%';

      var elapsed = (Date.now() - state.startTime) / 1000;
      var perItem = state.completed > 0 ? elapsed / state.completed : 15;
      var remaining = Math.round(perItem * (state.total - state.completed));
      var remainStr = remaining > 3600 ? Math.round(remaining/3600) + '시간 ' + Math.round((remaining%3600)/60) + '분' :
                      remaining > 60 ? Math.round(remaining/60) + '분 ' + (remaining%60) + '초' : remaining + '초';

      if (stats) stats.innerHTML =
        '<span>진행: ' + state.completed + '/' + state.total + ' (' + pct + '%)</span>' +
        '<span>✅ ' + state.success + ' | ❌ ' + state.fail + '</span>' +
        '<span>남은시간: ~' + remainStr + '</span>';
      if (substats) substats.innerHTML =
        '<span>🏗️ 건축물대장: ' + state.buildingUpdated + '건</span><span>🤖 AI 생성: ' + state.aiGenerated + '건</span>';
    }

    // ===== 개별 매물 전체 처리 (건축물대장 → DB 업데이트 → AI 생성) =====
    function processOneFull(listing) {
      if (!state.running) return Promise.resolve();
      var lid = String(listing.id);
      var safeJson = window.WS._safeJson;

      // --- STEP 1: 건축물대장 조회 ---
      var needsBuilding = !listing.built_year || !listing.floor_total || !listing.bathrooms || !listing.area_supply_m2 || !listing.elevator;
      var buildingPromise;

      if (needsBuilding && listing.address) {
        // 새 building-registry-full API 사용 (Kakao로 bjdongCd 자동 조회)
        {
          var qs = 'address=' + encodeURIComponent(listing.address);
          buildingPromise = fetch(window.WS._BUILDING_FULL_API + '?' + qs, {
            headers: { 'Authorization': 'Bearer wishes2026' }
          })
          .then(function(r) { return safeJson(r); })
          .then(function(bldgData) {
            if (bldgData.success && bldgData.data) {
              var d = bldgData.data;
              var fields = {};

              // 건축물대장 → DB 필드 매핑 (building-registry-full API 필드명)
              if (d.approvalDate && !listing.built_year) {
                var yr = String(d.approvalDate).substring(0, 4);
                if (yr.length === 4) { fields.built_year = yr; listing.built_year = yr; }
              }
              if (d.totalFloors && !listing.floor_total) {
                var fl = parseInt(d.totalFloors);
                if (fl > 0) { fields.floor_total = String(fl); listing.floor_total = String(fl); }
              }
              if (d.buildingArea && !listing.area_supply_m2) {
                var area = parseFloat(d.buildingArea);
                if (area > 0) { fields.area_supply_m2 = area; listing.area_supply_m2 = area; }
              }
              if (d.totalFloorArea && !listing.area_m2) {
                var exArea = parseFloat(d.totalFloorArea);
                if (exArea > 0) { fields.area_m2 = exArea; listing.area_m2 = exArea; }
              }
              if (d.elevatorCount !== undefined) {
                var hasElev = parseInt(d.elevatorCount) > 0;
                fields.elevator = hasElev; listing.elevator = hasElev;
              }
              if (d.parkingCount !== undefined) {
                var hasPark = parseInt(d.parkingCount) > 0;
                fields.parking = hasPark; listing.parking = hasPark;
              }
              if (d.buildingStructure && !listing.heating_type) {
                fields.heating_type = d.buildingStructure; listing.heating_type = d.buildingStructure;
              }

              // DB 필드 업데이트 (서버에 저장)
              if (Object.keys(fields).length > 0) {
                return fetch(window.WS._FIELD_UPDATE_API, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wishes2026' },
                  body: JSON.stringify({ id: listing.id, fields: fields })
                })
                .then(function(r) { return safeJson(r); })
                .then(function(updateResult) {
                  if (updateResult.success) {
                    state.buildingUpdated++;
                    addLog('  🏗️ #' + lid + ' 건축물대장 → DB 업데이트 (' + Object.keys(fields).join(', ') + ')', 'field');
                  }
                  return d;
                })
                .catch(function() { return d; });
              }
              return d;
            }
            return null;
          })
          .catch(function() { return null; });
        }
      } else {
        buildingPromise = Promise.resolve(null);
      }

      // --- STEP 2: AI 제목/설명 생성 ---
      var needsAI = !listing.description || listing.description.length < 50;

      return buildingPromise.then(function(buildingData) {
        if (!needsAI) {
          // 건축물대장만 업데이트하면 되는 경우
          state.completed++;
          state.success++;
          addLog('[' + state.completed + '/' + state.total + '] ✅ #' + lid + ' 건축물대장 업데이트 완료 (AI 불필요)', 'success');
          updateUI();
          return;
        }

        return fetch(window.WS._SINGLE_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wishes2026' },
          body: JSON.stringify({
            listingId: lid,
            style: 'trendy',
            aiModel: 'latest',
            autoMode: true,
            buildingRegistryData: buildingData,
            generateOptions: {
              excludePrice: true,
              excludeBasicSpecs: true,
              excludeBasicInfo: true,
              excludeAttachments: true,
              focusOnAttraction: true,
              attractionTopics: ['transport','infrastructure','view_light','neighborhood','target_resident','living_convenience'],
              seoOptimized: true,
              generateKeywords: true,
              generateTags: true
            }
          })
        })
        .then(function(r) { return safeJson(r); })
        .then(function(data) {
          state.completed++;
          if (data.success && data.result) {
            state.success++;
            state.aiGenerated++;
            if (data.result.title) listing.title = data.result.title;
            if (data.result.description) listing.description = data.result.description;
            addLog('[' + state.completed + '/' + state.total + '] ✅ #' + lid + ' ' + (data.result.title || '').substring(0, 45), 'success');
          } else {
            state.fail++;
            addLog('[' + state.completed + '/' + state.total + '] ❌ #' + lid + ' ' + (data.error || 'AI 생성 실패'), 'error');
          }
          updateUI();
        });
      })
      .catch(function(err) {
        state.completed++;
        state.fail++;
        addLog('[' + state.completed + '/' + state.total + '] ❌ #' + lid + ' ' + err.message, 'error');
        updateUI();
      });
    }

    // ===== 메인 실행: 동시 3개 워커로 순차 처리 =====
    var CONCURRENCY = 5;
    addLog('🚀 전체 매물 일괄 처리 시작 (' + state.total + '건, 동시 ' + CONCURRENCY + '개)', 'info');
    addLog('📋 처리 순서: 건축물대장 조회 → DB 필드 저장 → AI 제목/설명 생성', 'info');

    var queue = targets.slice();
    function worker() {
      if (!state.running || queue.length === 0) return Promise.resolve();
      var item = queue.shift();
      return processOneFull(item).then(function() {
        return new Promise(function(resolve) { setTimeout(resolve, 200); });
      }).then(worker);
    }

    var workers = [];
    for (var w = 0; w < Math.min(CONCURRENCY, queue.length); w++) {
      workers.push(worker());
    }

    Promise.all(workers).then(function() {
      state.running = false;
      addLog('', 'info');
      addLog('🏁 완료! 성공: ' + state.success + ' / 실패: ' + state.fail + ' / 건너뜀: ' + state.skipped, 'success');
      addLog('   🏗️ 건축물대장 DB 업데이트: ' + state.buildingUpdated + '건 | 🤖 AI 생성: ' + state.aiGenerated + '건', 'success');

      var stopBtn = document.getElementById('ws-bulk-stop');
      if (stopBtn) {
        stopBtn.textContent = '✅ 닫기';
        stopBtn.style.background = '#4caf50';
        stopBtn.disabled = false;
        stopBtn.onclick = function() {
          var el = document.getElementById('ws-bulk-progress');
          if (el) el.remove();
          window.WS.renderListings();
        };
      }
      updateUI();
    });
  };

  // ========== 스마트 매물 추천 시스템 ==========
  // 용도(주거/상가/사무실), 거래유형(전세/월세/매매), 타입, 지역,
  // 가격 범위, 면적, 방 수, 층수, 주차/엘리베이터/반려동물/풀옵션 등
  // 모든 조건을 종합하여 매칭 점수 기반으로 최적의 매물을 추천

  window.WS.showSmartRecommend = function() {
    var modal = document.getElementById('ws-modal-smart-recommend');
    if (modal) modal.style.display = 'flex';

    // 검색 버튼 이벤트
    var searchBtn = document.getElementById('ws-sr-search-btn');
    var resetBtn = document.getElementById('ws-sr-reset-btn');

    if (searchBtn && !searchBtn._wsbound) {
      searchBtn._wsbound = true;
      searchBtn.addEventListener('click', function() {
        window.WS._runSmartRecommend();
      });
    }
    if (resetBtn && !resetBtn._wsbound) {
      resetBtn._wsbound = true;
      resetBtn.addEventListener('click', function() {
        var form = document.getElementById('ws-smart-recommend-form');
        if (form) {
          form.querySelectorAll('input[type="text"],input[type="number"]').forEach(function(el) { el.value = ''; });
          form.querySelectorAll('select').forEach(function(el) { el.selectedIndex = 0; });
          form.querySelectorAll('input[type="checkbox"]').forEach(function(el) { el.checked = false; });
        }
        var results = document.getElementById('ws-sr-results');
        if (results) results.innerHTML = '';
      });
    }
  };

  window.WS._runSmartRecommend = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) {
      showToast('매물 데이터가 없습니다', 'error');
      return;
    }

    // 조건 수집
    var purpose = (document.getElementById('ws-sr-purpose') || {}).value || '';
    var deal = (document.getElementById('ws-sr-deal') || {}).value || '';
    var type = (document.getElementById('ws-sr-type') || {}).value || '';
    var area = (document.getElementById('ws-sr-area') || {}).value || '';
    var depositMax = parseInt((document.getElementById('ws-sr-deposit-max') || {}).value) || 0;
    var monthlyMax = parseInt((document.getElementById('ws-sr-monthly-max') || {}).value) || 0;
    var priceMax = parseInt((document.getElementById('ws-sr-price-max') || {}).value) || 0;
    var areaMin = parseFloat((document.getElementById('ws-sr-area-min') || {}).value) || 0;
    var areaMax = parseFloat((document.getElementById('ws-sr-area-max') || {}).value) || 0;
    var roomsMin = parseInt((document.getElementById('ws-sr-rooms-min') || {}).value) || 0;
    var floorMin = parseInt((document.getElementById('ws-sr-floor-min') || {}).value) || 0;
    var needParking = (document.getElementById('ws-sr-parking') || {}).checked;
    var needElevator = (document.getElementById('ws-sr-elevator') || {}).checked;
    var needPet = (document.getElementById('ws-sr-pet') || {}).checked;
    var needFulloption = (document.getElementById('ws-sr-fulloption') || {}).checked;

    // 용도→타입 매핑 (주거: 원룸/투룸/아파트/빌라/오피스텔, 상가/사무실)
    var purposeTypes = {
      '주거': ['원룸','투룸','쓰리룸','아파트','빌라','오피스텔','주택'],
      '상가': ['상가','근생'],
      '사무실': ['사무실','오피스']
    };

    // 매칭 점수 계산
    var scored = allData.map(function(l) {
      var score = 0;
      var maxScore = 0;
      var matchReasons = [];
      var failReasons = [];

      // 거래유형 (필수 조건)
      if (deal) {
        maxScore += 30;
        if ((l.deal || '') === deal) { score += 30; matchReasons.push('거래유형 일치'); }
        else { failReasons.push('거래유형 불일치'); return null; }
      }

      // 용도
      if (purpose) {
        maxScore += 20;
        var allowedTypes = purposeTypes[purpose] || [];
        if (allowedTypes.some(function(t) { return (l.type || '').indexOf(t) !== -1; })) {
          score += 20; matchReasons.push('용도 일치');
        } else { failReasons.push('용도 불일치'); return null; }
      }

      // 타입
      if (type) {
        maxScore += 15;
        if ((l.type || '') === type) { score += 15; matchReasons.push('타입 일치'); }
        else if ((l.type || '').indexOf(type) !== -1) { score += 8; matchReasons.push('타입 유사'); }
        else { return null; }
      }

      // 지역
      if (area) {
        maxScore += 15;
        var addrStr = ((l.address || '') + ' ' + (l.dong || '')).toLowerCase();
        var areaKeywords = area.split(/[,\s]+/).filter(Boolean);
        var areaMatch = areaKeywords.some(function(kw) { return addrStr.indexOf(kw.toLowerCase()) !== -1; });
        if (areaMatch) { score += 15; matchReasons.push('지역 일치'); }
        else { return null; }
      }

      // 보증금
      if (depositMax > 0) {
        maxScore += 10;
        var dep = l.deposit || 0;
        if (dep <= depositMax) { score += 10; matchReasons.push('보증금 범위 내'); }
        else { failReasons.push('보증금 초과'); return null; }
      }

      // 월세
      if (monthlyMax > 0) {
        maxScore += 10;
        var mon = l.monthly || 0;
        if (mon <= monthlyMax) { score += 10; matchReasons.push('월세 범위 내'); }
        else { return null; }
      }

      // 매매가
      if (priceMax > 0 && deal === '매매') {
        maxScore += 10;
        var pr = l.price || 0;
        if (pr <= priceMax) { score += 10; matchReasons.push('매매가 범위 내'); }
        else { return null; }
      }

      // 면적
      if (areaMin > 0 || areaMax > 0) {
        maxScore += 10;
        var m2 = l.area_m2 || 0;
        if (areaMin > 0 && m2 < areaMin) { return null; }
        if (areaMax > 0 && m2 > areaMax) { return null; }
        score += 10; matchReasons.push('면적 범위 내');
      }

      // 방 수
      if (roomsMin > 0) {
        maxScore += 5;
        if ((l.rooms || 0) >= roomsMin) { score += 5; matchReasons.push('방 수 충족'); }
        else { return null; }
      }

      // 층수
      if (floorMin > 0) {
        maxScore += 5;
        if ((l.floor_current || 0) >= floorMin) { score += 5; matchReasons.push('층수 충족'); }
        else { return null; }
      }

      // 옵션
      if (needParking) {
        maxScore += 3;
        if (l.parking) { score += 3; matchReasons.push('주차 가능'); }
      }
      if (needElevator) {
        maxScore += 3;
        if (l.elevator) { score += 3; matchReasons.push('엘리베이터'); }
      }
      if (needPet) {
        maxScore += 3;
        if (l.pet) { score += 3; matchReasons.push('반려동물 가능'); }
      }
      if (needFulloption) {
        maxScore += 3;
        if (l.full_option) { score += 3; matchReasons.push('풀옵션'); }
      }

      // 기본 점수 (조건 미입력시에도 최소 정렬)
      if (maxScore === 0) maxScore = 1;
      var pct = Math.round((score / maxScore) * 100);

      return { listing: l, score: score, maxScore: maxScore, pct: pct, reasons: matchReasons };
    }).filter(Boolean);

    // 점수순 정렬
    scored.sort(function(a, b) { return b.pct - a.pct || b.score - a.score; });

    // 결과 표시
    var resultsEl = document.getElementById('ws-sr-results');
    if (!resultsEl) return;

    if (scored.length === 0) {
      resultsEl.innerHTML = '<div style="text-align:center;padding:30px;color:#999;"><div style="font-size:20px;margin-bottom:8px;">😔</div>조건에 맞는 매물이 없습니다.<br>조건을 완화해 보세요.</div>';
      return;
    }

    var top = scored.slice(0, 20);
    var html = '<div style="font-size:13px;color:#2D5A27;font-weight:700;margin-bottom:8px;">🎯 추천 결과: ' + scored.length + '건 중 상위 ' + top.length + '건</div>';

    top.forEach(function(item, idx) {
      var l = item.listing;
      var priceText = l.deal === '매매' ? formatPrice(0, 0, l.price, '매매') : formatPrice(l.deposit, l.monthly, 0, l.deal);
      var matchColor = item.pct >= 80 ? '#2D5A27' : item.pct >= 60 ? '#F57F17' : '#888';
      var imgUrl = (l.images && l.images.length > 0) ? (l.images[0].url || l.images[0]) : '';

      html += '<div style="display:flex;gap:12px;padding:12px;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;background:#fff;" data-sr-id="' + l.id + '" onmouseover="this.style.boxShadow=\'0 4px 12px rgba(0,0,0,0.1)\'" onmouseout="this.style.boxShadow=\'none\'">';
      html += '<div style="width:80px;height:80px;border-radius:8px;background:#f0f0f0 center/cover no-repeat;flex-shrink:0;' + (imgUrl ? 'background-image:url(' + escHtml(imgUrl) + ')' : '') + '"></div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">';
      html += '<div style="font-size:14px;font-weight:700;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;">' + escHtml(l.title || l.address || '매물 #' + l.id) + '</div>';
      html += '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">';
      html += '<div style="width:40px;height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden;"><div style="width:' + item.pct + '%;height:100%;background:' + matchColor + ';border-radius:3px;"></div></div>';
      html += '<span style="font-size:11px;font-weight:700;color:' + matchColor + ';">' + item.pct + '%</span>';
      html += '</div></div>';
      html += '<div style="font-size:12px;color:#888;margin-bottom:4px;">' + escHtml(l.address || '') + ' · ' + escHtml(l.type || '') + ' · ' + (l.area_m2 ? formatArea(l.area_m2) : '-') + '</div>';
      html += '<div style="font-size:14px;font-weight:700;color:#2D5A27;">' + (priceText || '-') + '</div>';
      html += '<div style="font-size:10px;color:#999;margin-top:2px;">' + item.reasons.join(' · ') + '</div>';
      html += '</div></div>';
    });

    resultsEl.innerHTML = html;

    // 클릭 이벤트 (상세 모달 열기)
    resultsEl.querySelectorAll('[data-sr-id]').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = this.getAttribute('data-sr-id');
        var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
        if (found) {
          document.getElementById('ws-modal-smart-recommend').style.display = 'none';
          window.WS.showDetail(found);
        }
      });
    });
  };

  } // end _wsBootExtension

})();
