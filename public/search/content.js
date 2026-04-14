/**
 * Wishes Search Extension - Content Script
 * Injects property search functionality into wishes.co.kr/admin
 *
 * @version 2.2.6
 * @build 2026-04-14
 * @changelog 
 *   v2.2.6: 토큰 만료 자동 감지 + 만료 5분 전 경고 토스트 + 401 자동 로그아웃
 *   v2.2.5 - ìì¸ëª¨ë¬ ì´ë¯¸ì§ ê°¤ë¬ë¦¬ ê°ì  (img íê·¸ ì¬ì©, hover ë±ì§, ì¢ì° íì´í, ì´ë¯¸ì§ ì¹´ì´í°)
 * @changelog v2.2.1 - IndexedDB ìºì ì¶ê° (ì¬ë¡ë ì¦ì íì, ë°±ê·¸ë¼ì´ë ê°±ì )
 * @changelog v2.2.0 - Admin API ë¨ì¼ í¸ì¶ë¡ ì í (ë³ë ¬ íì´ì§ë¤ì´ì ì ê±°, API 500 ìë¬ í´ê²°)
 *
 * This script:
 * 1. Waits for sidebar to load
 * 2. Adds "ð ë§¤ë¬¼ ê²ì" button to sidebar navigation
 * 3. Manages filter state and applies filters to listings
 * 4. Provides helper functions for price/area formatting
 */

(function() {
  'use strict';

  // ============================================================================
  // SECURITY LAYER - íì¥ ë³´ì
  // ============================================================================

  // [EXT-S1] íì¥ ì¤í íê²½ ê²ì¦ (wishes.co.kr ëë©ì¸ë§ íì©)
  if (location.hostname !== 'wishes.co.kr' && location.hostname !== 'www.wishes.co.kr') {
    return; // ë¤ë¥¸ ëë©ì¸ìì ì¤í ì°¨ë¨
  }

  // [EXT-S1.1] ì¸ì¦ íì´ì§ììë íì¥ ì¤í ì°¨ë¨ (ë¡ê·¸ì¸/ê°ì íì´ì§ ë³´í¸)
  if (location.pathname.indexOf('admin-auth') !== -1 || location.pathname.indexOf('command-center') !== -1) {
    return; // ì¸ì¦/ì»¤ë§¨ëì¼í° íì´ì§ììë íì¥ ë¹íì±í
  }

  // [EXT-S1.2] /search íì´ì§ ì§ì ì localStorage -> sessionStorage ëê¸°í
  // Next.js /search íì´ì§ì ì¸ì¦ ê°ëê° sessionStorage.ws_tokenì ì½ëë°
  // /admin ë¡ê·¸ì¸ì localStorageì ì ì¥íë¯ë¡, íì´ì§ ì¤í¬ë¦½í¸ ì»¨íì¤í¸ìì
  // í í°ì ë³µì¬í´ì¤ì¼ ê°ëê° íµê³¼ëë¤. ë¡ê·¸ì¸ ì ë³´ê° ìëë° ì¸ì¦ë²½ì´ íìë
  // ê²½ì°ìë ìë ìë¡ê³ ì¹¨ì¼ë¡ íë©´ì ë³µêµ¬íë¤.
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
      // ì¸ì¦ë²½ì´ ë  ìëë° í í°ì ì¡´ì¬íë ìí â í ë²ë§ ìë ìë¡ê³ ì¹¨
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
        try{ localStorage.removeItem(TKEY); sessionStorage.removeItem(TKEY); }catch(e){}
        toast("🔒 세션 만료 — 로그인 페이지로 이동합니다", true);
        setTimeout(function(){ if(!/\/admin(\/|$|\?|#)/.test(location.pathname)) location.href="/admin"; }, 1600);
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

    // [EXT-S1.3] ìì¸ëª¨ë¬ ê°¤ë¬ë¦¬ ì¤íì¼ ì£¼ì (page-script ëª¨ëììë ëì)
  (function _wsInjectGalleryStyles() {
    try {
      if (document.getElementById('ws-gallery-styles-v225')) return;
      var st = document.createElement('style');
      st.id = 'ws-gallery-styles-v225';
      st.textContent = [
        '.ws-detail-gallery{margin:12px 0;}',
        '.ws-gallery-main{position:relative;width:100%;height:380px;background:#111;border-radius:10px;overflow:hidden;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
        '.ws-gallery-main img#ws-gallery-img{width:100%;height:100%;object-fit:contain;background:#111;display:block;transition:opacity .15s;}',
        '.ws-gallery-main.ws-gallery-empty{background:#f5f5f5;height:220px;cursor:default;}',
        '.ws-gallery-nav{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;border:none;font-size:24px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s,background .15s;z-index:2;}',
        '.ws-gallery-main:hover .ws-gallery-nav{opacity:1;}',
        '.ws-gallery-nav:hover{background:rgba(0,0,0,0.85);}',
        '.ws-gallery-prev{left:10px;}',
        '.ws-gallery-next{right:10px;}',
        '.ws-gallery-counter{position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.6);color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;z-index:2;pointer-events:none;}',
        '.ws-gallery-zoom-hint{position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.6);color:#fff;padding:3px 10px;border-radius:4px;font-size:11px;opacity:0;transition:opacity .15s;z-index:2;pointer-events:none;}',
        '.ws-gallery-main:hover .ws-gallery-zoom-hint{opacity:1;}',
        '.ws-gallery-thumbs{display:flex;gap:6px;margin-top:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin;}',
        '.ws-gallery-thumbs img{width:80px;height:60px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid transparent;flex-shrink:0;transition:border-color .15s;}',
        '.ws-gallery-thumbs img:hover{border-color:#4CAF50;}',
        '.ws-gallery-thumbs img.ws-thumb-active{border-color:#2D5A27;box-shadow:0 0 0 2px rgba(45,90,39,0.2);}'
      ].join('');
      (document.head || document.documentElement).appendChild(st);
    } catch(e){}
  })();

    // [EXT-S2] ì½ì ë³´í¸ - íì¥ ë´ë¶ ë¡ê·¸ ë¸ì¶ ë°©ì§
  var _wsLog = function() {}; // íë¡ëìììë ë¬´ì¶ë ¥
  // ê°ë° ì: var _wsLog = console.log.bind(console);

  // [EXT-S3] íì´ì§ ë´ ì¸ë¶ ì¤í¬ë¦½í¸ ì£¼ì ê°ì
  var _extObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.tagName === 'SCRIPT' && node.src &&
            node.src.indexOf('wishes.co.kr') < 0 &&
            node.src.indexOf('cdnjs.cloudflare.com') < 0 &&
            node.src.indexOf('googleapis.com') < 0 &&
            node.src.indexOf('gstatic.com') < 0) {
          // ì ì ìë ì¸ë¶ ì¤í¬ë¦½í¸ ê°ì§
          _wsLog('[WISHES-SEC] ìì¬ì¤ë¬ì´ ì¤í¬ë¦½í¸ ê°ì§:', node.src);
        }
      });
    });
  });
  try {
    _extObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch(e) {}

  // ============================================================================
  // íì¥íë¡ê·¸ë¨ ê°ì§ ë§ì»¤ - layout.tsxê° íì¥ ì¤ì¹ ì¬ë¶ë¥¼ ì¸ìíê¸° ìí ì½ë
  // ============================================================================
  (function() {
    // 1) ê°ì§ì© hidden ìì ì½ì
    var marker = document.createElement('div');
    marker.id = 'wishes-search-extension';
    marker.setAttribute('data-wishes-extension', 'true');
    marker.style.display = 'none';
    document.documentElement.appendChild(marker);

    // 2) Reactì íì¥ ë¡ë ìë¦¼ ë©ìì§ ì ì¡
    window.postMessage({ type: 'WS_EXTENSION_LOADED', version: '1.0' }, '*');

    // 3) íì´ì§ ë¡ë í ì¬ì ì¡ (React hydration ì´í ê°ì§ ë³´ì¥)
    setTimeout(function() {
      window.postMessage({ type: 'WS_EXTENSION_LOADED', version: '1.0' }, '*');
    }, 1000);
    setTimeout(function() {
      window.postMessage({ type: 'WS_EXTENSION_LOADED', version: '1.0' }, '*');
    }, 3000);
  })();

  // [EXT-S4] API ìëµ ë¬´ê²°ì± ì²´í¬
  var _originalFetch = window.fetch;
  // (ISOLATED worldììë ì§ì  fetchë¥¼ ì â ì¬ê¸°ì  ê°ì ë¡ê·¸ë§)

  // [EXT-S5] localStorage ì ê·¼ ë³´í¸ (íì¥ í¤ í¨í´ ë³´í¸)
  var _WS_STORAGE_PREFIX = 'ws_';

  // ============================================================================
  // AUTH GATE - ë¡ê·¸ì¸/ì¹ì¸ íì¸ í íì¥ ê¸°ë¥ íì±í
  // ============================================================================

  var _WS_AUTH_API = 'https://wishes.co.kr/api/auth/verify';
  var _wsAuthToken = null;
  var _wsAuthUser = null;
  var _wsAuthVerified = false;

  // [AUTH-CONFIG] ì¸ì¦ ê²ì´í¸ íì±í íëê·¸
  // API ìë² ë°°í¬ í trueë¡ ë³ê²½íì¬ ì¸ì¦ì ê°ì í©ëë¤
  var _WS_AUTH_ENABLED = true; // â ì¸ì¦ íì±íë¨

  // sessionStorageìì í í° íì¸ (content script ISOLATED world)
  // ISOLATED worldììë pageì sessionStorageì ì ê·¼ ë¶ê°íë¯ë¡
  // chrome.storage ëë íì´ì§ ì»¨íì¤í¸ ì£¼ìì¼ë¡ í í°ì ì ë¬ë°ì
  function _wsCheckAuth(callback) {
    // ì¸ì¦ ê²ì´í¸ê° ë¹íì±ì¼ ëë ë°ë¡ íµê³¼
    if (!_WS_AUTH_ENABLED) {
      _wsAuthVerified = true;
      if (callback) callback(true);
      return;
    }

    // íì´ì§ ì»¨íì¤í¸ìì sessionStorage/localStorage íì¸íë í¬í¼
    // (ISOLATED worldììë ì§ì  ì ê·¼ ë¶ê°íë¯ë¡ ì¤í¬ë¦½í¸ ì£¼ì)
    function _wsCheckPageAuth(onResult) {
      var _pageAuthHandled = false;

      // [FIX 2026-04-14] ì¹ ì¤í¬ë¦½í¸ë¡ ë¡ëë ê²½ì° main world ì§ì  ì ê·¼
      // /search/content.jsë¡ ë°°í¬ëë©´ chrome.runtimeì´ ìì¼ë¯ë¡ ë°ë¡ sessionStorage ì½ê¸°
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

    // ë°©ë² 1: chrome.storage.localìì í í° íì¸
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['ws_token', 'ws_user', 'ws_login_time'], function(data) {
        if (data.ws_token) {
          // chrome.storageì í í° ìì â ê¸°ì¡´ íë¡ì°
          var loginTime = parseInt(data.ws_login_time || '0');
          if (Date.now() - loginTime > 1800000) {
            // ë§ë£ â íì´ì§ ì»¨íì¤í¸ìì ì¬íì¸
            chrome.storage.local.remove(['ws_token', 'ws_user', 'ws_login_time']);
            _wsFallbackPageAuth(callback);
            return;
          }
          // ìë²ì í í° ê²ì¦
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
            // ë¤í¸ìí¬ ì¤ë¥ ì ìºìë í í°ì¼ë¡ íì© (ì¤íë¼ì¸ ëì, ìµë 2ìê°)
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
          // chrome.storageì í í° ìì â íì´ì§ ì»¨íì¤í¸ìì íì¸
          _wsFallbackPageAuth(callback);
        }
      });
    } else {
      // chrome.storage ì¬ì© ë¶ê° â íì´ì§ ì»¨íì¤í¸ìì íì¸
      _wsFallbackPageAuth(callback);
    }

    // íì´ì§ ì»¨íì¤í¸ (sessionStorage/localStorage) ê¸°ë° ì¸ì¦ íì¸
    function _wsFallbackPageAuth(cb) {
      _wsCheckPageAuth(function(pageData) {
        if (pageData.hasToken && pageData.token) {
          // sessionStorageì ws_token ì¡´ì¬ â ìë² ê²ì¦
          var token = pageData.token;
          // bridge í í°ì ë°ë¡ íµê³¼
          if (token.indexOf('admin_bridge_') === 0) {
            _wsAuthVerified = true;
            _wsAuthToken = token;
            try { _wsAuthUser = JSON.parse(pageData.user); } catch(e) {}
            // chrome.storageìë ëê¸°í
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
            // ë¤í¸ìí¬ ì¤ë¥ ì admin_password ìì¼ë©´ íì©
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
          // admin_passwordë§ ìë ê²½ì° (êµ¬ ì¸ì¦ ìì¤í) â íì©
          _wsAuthVerified = true;
          _wsAuthUser = { email: 'admin', role: 'superadmin', status: 'approved' };
          if (cb) cb(true);
        } else {
          _wsShowAuthWall();
          if (cb) cb(false);
        }
      });
    }

    // chrome.storageì í í° ëê¸°í (ë¤ìë² ë¹ ë¥¸ ì¸ì¦ì©)
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

  // ì¸ì¦ ìë´ íë©´ íì
  function _wsShowAuthWall() {
    // ê¸°ì¡´ ìì ì ê±° (ì¤ë³µ ë°©ì§)
    var existing = document.getElementById('ws-auth-wall');
    if (existing) existing.remove();

    var wall = document.createElement('div');
    wall.id = 'ws-auth-wall';
    wall.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;background:rgba(7,11,7,.97);display:flex;align-items:center;justify-content:center;font-family:Segoe UI,sans-serif';
    wall.innerHTML = '<div style="text-align:center;max-width:400px;padding:40px">'
      + '<div style="font-size:64px;margin-bottom:20px">ð</div>'
      + '<div style="font-size:24px;font-weight:800;color:#4CAF50;margin-bottom:8px">WISHES Admin</div>'
      + '<div style="font-size:14px;color:#7a9a7a;margin-bottom:32px">ì´ ê¸°ë¥ì ì¬ì©íë ¤ë©´ ë¡ê·¸ì¸ì´ íìí©ëë¤.<br>ê´ë¦¬ì ì¹ì¸ì ë°ì ê³ì ë§ ì´ì©í  ì ììµëë¤.</div>'
      + '<a href="https://wishes.co.kr/admin/admin-auth.html" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2D5A27,#4CAF50);color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;transition:all .3s">ë¡ê·¸ì¸ íê¸°</a>'
      + '<div style="margin-top:20px;font-size:11px;color:#4a6a4a">ê³ì ì´ ìì¼ìë©´ íìê°ì í ê´ë¦¬ì ì¹ì¸ì ë°ì¼ì¸ì</div>'
      + '</div>';
    document.body.appendChild(wall);
  }

  // ì¸ì¦ í íì¥ ì´ê¸°í
  function _wsInitAfterAuth() {
    var authWall = document.getElementById('ws-auth-wall');
    if (authWall) authWall.remove();
    _wsBootExtension();
  }

  // ì¸ì¦ ì²´í¬ ìì
  _wsCheckAuth(function(authed) {
    if (authed) {
      _wsInitAfterAuth();
    }
    // ë¯¸ì¸ì¦ ì auth wallì´ ì´ë¯¸ íìë¨
  });

  // íì¥ ë©ì¸ ê¸°ë¥ì í¨ìë¡ ëí
  function _wsBootExtension() {

  // ============================================================================
  // A) CONSTANTS - ALL FILTER OPTIONS
  // ============================================================================

  const REGIONS = {
    'ì êµ­': [],
    'ìì¸': [
      'ê°ë¨êµ¬', 'ê°ëêµ¬', 'ê°ë¶êµ¬', 'ê°ìêµ¬', 'ê´ìêµ¬', 'ê´ì§êµ¬',
      'êµ¬ë¡êµ¬', 'ê¸ì²êµ¬', 'ë¸ìêµ¬', 'ëë´êµ¬', 'ëëë¬¸êµ¬', 'ëìêµ¬',
      'ë§í¬êµ¬', 'ìëë¬¸êµ¬', 'ìì´êµ¬', 'ì±ëêµ¬', 'ì±ë¶êµ¬', 'ì¡íêµ¬',
      'ìì²êµ¬', 'ìë±í¬êµ¬', 'ì©ì°êµ¬', 'ìíêµ¬', 'ì¢ë¡êµ¬', 'ì¤êµ¬', 'ì¤ëêµ¬'
    ],
    'ê²½ê¸°': [
      'ê°íêµ°', 'ê³ ìì', 'ê³¼ì²ì', 'ê´ëªì', 'ê´ì£¼ì', 'êµ¬ë¦¬ì',
      'êµ°í¬ì', 'ê¹í¬ì', 'ë¨ìì£¼ì', 'ëëì²ì', 'ë¶ì²ì', 'ì±ë¨ì',
      'ììì', 'ìì²ì', 'ìí¥ì', 'ìì°ì', 'ìì±ì', 'ììì',
      'ìì£¼ì', 'ìíêµ°', 'ì¬ì£¼ì', 'ì°ì²êµ°', 'ì¤ì°ì', 'ì©ì¸ì',
      'ììì', 'ìì ë¶ì', 'ì´ì²ì', 'íì£¼ì', 'ííì', 'í¬ì²ì',
      'íë¨ì', 'íì±ì'
    ],
    'ì¸ì²': [
      'ê°íêµ°', 'ê³ìêµ¬', 'ë¨ëêµ¬', 'ë¨êµ¬', 'ëêµ¬', 'ë¯¸ì¶íêµ¬',
      'ë¶íêµ¬', 'ìêµ¬', 'ì°ìêµ¬', 'ì¹ì§êµ°', 'ì¤êµ¬'
    ],
    'ê°ì': [
      'ê°ë¦ì', 'ê³ ì±êµ°', 'ëí´ì', 'ì¼ì²ì', 'ìì´ì', 'ìêµ¬êµ°',
      'ììêµ°', 'ììêµ°', 'ìì£¼ì', 'ì¸ì êµ°', 'ì ì êµ°', 'ì² ìêµ°',
      'ì¶ì²ì', 'íë°±ì', 'íì°½êµ°', 'íì²êµ°', 'íì²êµ°', 'í¡ì±êµ°'
    ],
    'ëì ': ['ëëêµ¬', 'ëêµ¬', 'ìêµ¬', 'ì ì±êµ¬', 'ì¤êµ¬'],
    'ì¸ì¢': [],
    'ì¶©ë¨': [
      'ê³ë£¡ì', 'ê³µì£¼ì', 'ê¸ì°êµ°', 'ë¼ì°ì', 'ë¹ì§ì', 'ë³´ë ¹ì',
      'ë¶ì¬êµ°', 'ìì°ì', 'ìì²êµ°', 'ìì°ì', 'ìì°êµ°', 'ì²ìì',
      'ì²­ìêµ°', 'íìêµ°', 'íì±êµ°'
    ],
    'ì¶©ë¶': [
      'ê´´ì°êµ°', 'ë¨ìêµ°', 'ë³´ìêµ°', 'ìëêµ°', 'ì¥ì²êµ°',
      'ìì±êµ°', 'ì ì²ì', 'ì¦íêµ°', 'ì§ì²êµ°', 'ì²­ì£¼ì', 'ì¶©ì£¼ì'
    ],
    'ë¶ì°': [
      'ê°ìêµ¬', 'ê¸ì êµ¬', 'ê¸°ì¥êµ°', 'ë¨êµ¬', 'ëêµ¬', 'ëëêµ¬',
      'ë¶ì°ì§êµ¬', 'ë¶êµ¬', 'ì¬ìêµ¬', 'ì¬íêµ¬', 'ìêµ¬', 'ììêµ¬',
      'ì°ì êµ¬', 'ìëêµ¬', 'ì¤êµ¬'
    ],
    'ì¸ì°': ['ë¨êµ¬', 'ëêµ¬', 'ë¶êµ¬', 'ì¤êµ¬', 'ì¸ì£¼êµ°'],
    'ê²½ë¨': [
      'ê±°ì ì', 'ê±°ì°½êµ°', 'ê³ ì±êµ°', 'ê¹í´ì', 'ë¨í´êµ°', 'ë°ìì',
      'ì¬ì²ì', 'ì°ì²­êµ°', 'ìì°ì', 'ìë ¹êµ°', 'ì§ì£¼ì', 'ì°½ëêµ°',
      'ì°½ìì', 'íµìì', 'íëêµ°', 'í¨ìêµ°', 'í¨ìêµ°', 'í©ì²êµ°'
    ],
    'ê²½ë¶': [
      'ê²½ì°ì', 'ê²½ì£¼ì', 'ê³ ë ¹êµ°', 'êµ¬ë¯¸ì', 'êµ°ìêµ°', 'ê¹ì²ì',
      'ë¬¸ê²½ì', 'ë´íêµ°', 'ìì£¼ì', 'ì±ì£¼êµ°', 'ìëì', 'ìëêµ°',
      'ììêµ°', 'ìì£¼ì', 'ìì²ì', 'ìì²êµ°', 'ì¸ë¦êµ°', 'ì¸ì§êµ°',
      'í¬í­ì'
    ],
    'ëêµ¬': ['ë¨êµ¬', 'ë¬ìêµ¬', 'ë¬ì±êµ°', 'ëêµ¬', 'ë¶êµ¬', 'ìêµ¬', 'ìì±êµ¬', 'ì¤êµ¬'],
    'ê´ì£¼': ['ê´ì°êµ¬', 'ë¨êµ¬', 'ëêµ¬', 'ë¶êµ¬', 'ìêµ¬'],
    'ì ë¨': [
      'ê°ì§êµ°', 'ê³ í¥êµ°', 'ê³¡ì±êµ°', 'ê´ìì', 'êµ¬ë¡êµ°', 'ëì£¼ì',
      'ë´ìêµ°', 'ëª©í¬ì', 'ë¬´ìêµ°', 'ë³´ì±êµ°', 'ìì²ì', 'ì ìêµ°',
      'ìê´êµ°', 'ììêµ°', 'ìëêµ°', 'ì¬ìì', 'ì¥ì±êµ°',
      'ì¥í¥êµ°', 'ì§ëêµ°', 'í¨íêµ°', 'í´ë¨êµ°', 'íìêµ°'
    ],
    'ì ë¶': [
      'ê³ ì°½êµ°', 'êµ°ì°ì', 'ê¹ì ì', 'ë¨ìì', 'ë¬´ì£¼êµ°', 'ë¶ìêµ°',
      'ìì°½êµ°', 'ìì£¼êµ°', 'ìµì°ì', 'ìì¤êµ°', 'ì¥ìêµ°', 'ì ì£¼ì',
      'ì ìì', 'ì§ìêµ°'
    ],
    'ì ì£¼': ['ìê·í¬ì', 'ì ì£¼ì']
  };

  const TYPES = ['ì ì²´', 'ìë£¸', 'ì¤í¼ì¤í', 'ìíí¸', 'ì¬ë¬´ì¤', 'ìê°', 'ë¹ë¼', 'í ì§'];
  const DEALS = ['ì ì²´', 'ìì¸', 'ì ì¸', 'ì ìì¸', 'ë§¤ë§¤'];
  const FLOORS = ['ì ì²´', 'ì§ì', 'ì§í', 'ë°ì§í', 'ì¥í', 'ë¨ë'];
  const ROOMS = ['ì ì²´', '1ê°', '1.5ê°', '1-2ê°', '2ê°', '2-3ê°', '3ê°'];
  const SHAPES = ['ì ì²´', 'ì¤íí', 'ë¶ë¦¬í', 'ë³µì¸µí', 'ìë£¸ìê±°ì¤', 'ì¸ë¯¸ë¶ë¦¬í'];
  const YEARS = [
    'ì ì²´', '2026ë ì´í', '2025ë ì´í', '2024ë ì´í',
    '2023ë ì´í', '2022ë ì´í', '2021ë ì´í', '2020ë ì´í',
    '2019ë ì´í', '2018ë ì´í', '2015ë ì´í', '2010ë ì´í',
    '2005ë ì´í', '2000ë ì´í'
  ];
  const LIVING_SIZES = ['ì ì²´', 'ê±°ì¤(ë)', 'ê±°ì¤(ì¤)', 'ê±°ì¤(ì)'];
  const DIRECTIONS = [
    'ì ì²´', 'ë¨í¥', 'ë¨ëí¥', 'ë¨ìí¥', 'ëí¥', 'ìí¥',
    'ë¶í¥', 'ë¶ëí¥', 'ë¶ìí¥'
  ];
  const PARKING = ['ì ì²´', '1ë ì´ì', '2ë ì´ì', '3ë ì´ì', '4ë ì´ì', '5ë ì´ì'];

  const SORT_OPTIONS = [
    { value: 'latest', label: 'ìµì ì' },
    { value: 'views', label: 'ì¡°íì' },
    { value: 'price_low', label: 'ê°ê²©ë®ìì' },
    { value: 'price_high', label: 'ê°ê²©ëìì' },
    { value: 'area_low', label: 'ë©´ì ììì' },
    { value: 'area_high', label: 'ë©´ì í°ì' }
  ];

  const SORT2_OPTIONS = [
    { value: 'none', label: 'ì¶ê°ì ë ¬ìì' },
    { value: 'latest', label: 'ìµì ì' },
    { value: 'views', label: 'ì¡°íì' },
    { value: 'price_low', label: 'ê°ê²©ë®ìì' },
    { value: 'price_high', label: 'ê°ê²©ëìì' }
  ];

  // ============================================================================
  // B) STATE OBJECT - ALL FILTER STATE
  // ============================================================================

  window.WS = window.WS || {};

  // ê¶í ì²´í¬ í¬í¼ - superadmin ì¬ë¶ íì¸
  window.WS.isSuperAdmin = function() {
    return _wsAuthUser && _wsAuthUser.role === 'superadmin';
  };

  window.WS.state = {
    // View and navigation
    viewMode: 'search',          // 'search' or 'detail'
    activeRegion: 'ì êµ­',         // Currently selected region
    selectedRegions: [],          // Array of selected region strings for filtering
    selectedDongs: [],            // Array of selected dong strings for filtering
    addrType: 'all',             // 'all', 'district', 'jibun'

    // Type filters
    typeTab: 'ì ì²´',              // Selected property type (legacy - kept for compatibility)
    typeTabs: [],                 // Multi-select property types (e.g., ['ìë£¸', 'ì¤í¼ì¤í'])
    deal: 'ì ì²´',                 // Rental type (legacy - kept for compatibility)
    deals: [],                    // Multi-select deal types (e.g., ['ìì¸', 'ì ì¸'])
    floor: 'ì ì²´',                // Floor type
    roomCount: 'ì ì²´',            // Number of rooms (legacy - kept for compatibility)
    roomCounts: [],               // Multi-select room counts (e.g., ['1ê°', '2ê°'])
    roomShape: 'ì ì²´',            // Room layout shape
    builtYear: 'ì ì²´',            // Construction year filter
    direction: 'ì ì²´',            // Direction/exposure
    parking: 'ì ì²´',              // Parking availability
    livingSize: 'ì ì²´',           // Living room size

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
    // ë§¤ë¬¼ë³ ì°ë½ì² ê´ë¦¬ (í¸ëª ìì¤í)
    // êµ¬ì¡°: { "listing_id": [ { role: "ì¬ì¥", name: "íê¸¸ë", phone: "010-1234-5678", memo: "íµíê°ë¥ ì¤í2ìì´í" }, ... ] }
    contacts: (function() { try { return JSON.parse(localStorage.getItem('ws-contacts') || '{}'); } catch(e) { return {}; } })()
  };

  // ============================================================================
  // C) HELPER FUNCTIONS
  // ============================================================================

  /**
   * Format price value into Korean units (ìµ/ë§ì)
   * @param {number} value - Price in won
   * @returns {string} Formatted price string
   */
  function formatSinglePrice(value) {
    if (!value || value === 0) return '-';
    if (value >= 10000) {
      const eok = Math.floor(value / 10000);
      const man = value % 10000;
      return man > 0 ? `${eok}ìµ${man}` : `${eok}ìµ`;
    }
    return `${value}ë§`;
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
    if (deal === 'ë§¤ë§¤') {
      return formatSinglePrice(price);
    }
    if (deal === 'ì ì¸') {
      return formatSinglePrice(deposit);
    }
    if (deal === 'ìì¸') {
      const dep = formatSinglePrice(deposit);
      const mon = formatSinglePrice(monthly);
      return `${dep}/${mon}`;
    }
    if (deal === 'ì ìì¸') {
      const dep = formatSinglePrice(deposit);
      const mon = formatSinglePrice(monthly);
      return `${dep}/${mon}`;
    }
    return '-';
  }

  /**
   * Convert square meters to pyeong (1 pyeong = 3.3 mÂ²)
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
   * Format area with both mÂ² and pyeong
   * @param {number} m2 - Area in square meters
   * @returns {string} Formatted area string
   */
  function formatArea(m2) {
    if (!m2) return '-';
    const py = m2ToPy(m2);
    return `${m2}mÂ² (${py}í)`;
  }

  /**
   * Calculate relative time (e.g., "2ìê° ì ", "3ì¼ ì ")
   * @param {string} dateStr - ISO date string
   * @returns {string} Relative time string
   */
  function timeAgo(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'ë°©ê¸ ì ';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}ë¶ ì `;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}ìê° ì `;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}ì¼ ì `;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}ê°ì ì `;
    return `${Math.floor(seconds / 31536000)}ë ì `;
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
      if (deal === 'ë§¤ë§¤') return listing.price || 0;
      if (deal === 'ì ì¸') return listing.deposit || 0;
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
    } else if (s.typeTab !== 'ì ì²´') {
      filtered = filtered.filter(l => (l.type || '') === s.typeTab);
    }

    // 2. DEAL TYPE FILTER (multi-select support)
    if (s.deals && s.deals.length > 0) {
      filtered = filtered.filter(l => s.deals.includes(l.deal || ''));
    } else if (s.deal !== 'ì ì²´') {
      filtered = filtered.filter(l => (l.deal || '') === s.deal);
    }

    // 3. FLOOR TYPE FILTER (B1 format ì§ì: "B1/5ì¸µ", "B2/3ì¸µ" ë±)
    if (s.floor !== 'ì ì²´') {
      filtered = filtered.filter(l => {
        const floor = l.floor_current ? l.floor_current.toString() : '';
        switch (s.floor) {
          case 'ì§ì': return floor !== '' && !floor.includes('ì§í') && !floor.includes('ë°') && !/^B\d/i.test(floor);
          case 'ì§í': return floor.includes('ì§í') || /^B\d/i.test(floor);
          case 'ë°ì§í': return floor.includes('ë°ì§í') || /^B0\.5/i.test(floor) || floor.includes('ë°');
          case 'ì¥í': return floor.includes('ì¥') || floor.includes('PH') || /penthouse/i.test(floor);
          case 'ë¨ë': return floor === 'ë¨ë' || floor.includes('ë¨ë');
          default: return true;
        }
      });
    }

    // 4. ROOM COUNT FILTER (multi-select support)
    var activeRoomCounts = (s.roomCounts && s.roomCounts.length > 0) ? s.roomCounts : (s.roomCount !== 'ì ì²´' ? [s.roomCount] : []);
    if (activeRoomCounts.length > 0) {
      filtered = filtered.filter(l => {
        const rooms = l.rooms || 0;
        return activeRoomCounts.some(function(rc) {
          switch (rc) {
            case '1ê°': return rooms === 1;
            case '1.5ê°': return rooms === 1.5;
            case '1-2ê°': return rooms >= 1 && rooms <= 2;
            case '2ê°': return rooms === 2;
            case '2-3ê°': return rooms >= 2 && rooms <= 3;
            case '3ê°': return rooms === 3;
            default: return true;
          }
        });
      });
    }

    // 5. DIRECTION FILTER (DB ë°ì´í° ì ë¶ null - ë°ì´í° ì¡´ì¬ ììë§ íí°ë§)
    if (s.direction !== 'ì ì²´') {
      var hasDirectionData = filtered.some(function(l) { return l.direction && l.direction !== ''; });
      if (hasDirectionData) {
        filtered = filtered.filter(l => (l.direction || '') === s.direction);
      }
    }

    // 6. PARKING FILTER
    if (s.parking !== 'ì ì²´') {
      filtered = filtered.filter(l => {
        const count = getParkingCount(l);
        const num = parseInt(s.parking, 10);
        return count >= num;
      });
    }

    // 7. BUILT YEAR FILTER
    if (s.builtYear !== 'ì ì²´') {
      const yearMatch = s.builtYear.match(/\d{4}/);
      const yearThreshold = yearMatch ? parseInt(yearMatch[0], 10) : null;
      if (yearThreshold) {
        filtered = filtered.filter(l => {
          const year = getBuiltYear(l.built_year);
          return year && year >= yearThreshold;
        });
      }
    }

    // 8. ROOM SHAPE FILTER (DB ì»¬ë¼ ìì - ë°ì´í° ì¡´ì¬ ììë§ íí°ë§)
    if (s.roomShape !== 'ì ì²´') {
      var hasRoomShapeData = filtered.some(function(l) { return l.room_shape || l.roomShape; });
      if (hasRoomShapeData) {
        filtered = filtered.filter(l => {
          const shape = l.room_shape || l.roomShape || '';
          return shape === s.roomShape;
        });
      }
      // ë°ì´í° ìì¼ë©´ íí° ë¬´ì (ì ì²´ ëª©ë¡ ì ì§)
    }

    // 8-1. LIVING SIZE FILTER (DB ì»¬ë¼ ìì - ë°ì´í° ì¡´ì¬ ììë§ íí°ë§)
    if (s.livingSize !== 'ì ì²´') {
      var hasLivingSizeData = filtered.some(function(l) { return l.living_size || l.livingSize; });
      if (hasLivingSizeData) {
        filtered = filtered.filter(l => {
          const size = l.living_size || l.livingSize || '';
          return size === s.livingSize;
        });
      }
    }

    // 8-2. SHORT TERM FILTER (DB ì»¬ë¼ ìì - ë°ì´í° ì¡´ì¬ ììë§ íí°ë§)
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
      // ìì íí° (DB ë°ì´í° ìì - ë°ì´í° ì¡´ì¬ ììë§ íí°ë§)
      var hasVideoData = filtered.some(function(l) { return l.has_video === true; });
      if (hasVideoData) {
        filtered = filtered.filter(l => l.has_video === true);
      }
    }
    if (s.checks.parkingAvailable) {
      filtered = filtered.filter(l => l.parking === true);
    }
    if (s.checks.emptyNow) {
      filtered = filtered.filter(l => l.status === 'ê°ì©');
    }
    if (s.checks.balcony) {
      // ë°ì½ë íí° (DB ë°ì´í° ì ë¶ false - ë°ì´í° ì¡´ì¬ ììë§ íí°ë§)
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
      // íìµì íí° (DB ë°ì´í° ì ë¶ false - ë°ì´í° ì¡´ì¬ ììë§ íí°ë§)
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

    // 10. REGION FILTER (êµ¬/êµ° + ë ë¨ì)
    if (s.selectedDongs && s.selectedDongs.length > 0) {
      // ë ë¨ì íí°ê° ìì¼ë©´ ë ê¸°ì¤ì¼ë¡ íí°ë§
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
        if (l.deal === 'ë§¤ë§¤') {
          basePrice = l.price || 0;
        } else if (l.deal === 'ì ì¸') {
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

    // 17. KEYWORD SEARCH (ë§¤ë¬¼ë²í¸ ê²ì ì§ì)
    if (s.keyword && s.keyword.trim() !== '') {
      const kw = s.keyword.trim();
      // ë§¤ë¬¼ë²í¸ í¨í´ ì²´í¬: ë§¤ë¬¼ë²í¸ 14115, 14115 ë±
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
            'ë§¤ë¬¼ë²í¸ ' + l.id
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

    // 22. DEDUPLICATION - ìì¬ì§(ì§ë²ì£¼ì)+ëí¸ì+ê±°ëì í+ê°ê²© ëì¼ ë§¤ë¬¼ ì¤ë³µ ì ê±°
    // address = ì§ë²ì£¼ì ì ì²´ (ì: ìì¸í¹ë³ì ê´ìêµ¬ ì ë¦¼ë 246-1)
    // address_detail = ë/í¸ì (ì: 1ì¸µ ì¼ë¶(102í¸))
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
   * Safe localStorage.setItem wrapper (QuotaExceededError ë°©ì§)
   */
  function _safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch(e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        if (window.WS && window.WS.showToast) {
          window.WS.showToast('â ï¸ ì ì¥ê³µê°ì´ ë¶ì¡±í©ëë¤. ë°±ì/ë³µììì ë¶íìí ë°ì´í°ë¥¼ ì ë¦¬í´ì£¼ì¸ì.', 'warning');
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
    var icon = type === 'success' ? 'â' : type === 'warning' ? 'â ï¸' : 'â';
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
  // AUTO DEDUP ENGINE - ìë ì¤ë³µ ë§¤ë¬¼ ì ê±°
  // ê¸°ì¤: ìì¬ì§(ì§ë²ì£¼ì ì ì²´) + ë/í¸ì(address_detail) + ê±°ëì í + ê°ê²©
  // ì´ë¯¸ì§ ì ë¬´, ì¬ì§ ìê¹ì§ ë¹êµíì¬ ë ì ë³´ê° ë§ì ë§¤ë¬¼ì ë³´ì¡´
  // ë°ì´í° ë¡ë ì ìë ì¤í, ì ê±° ê²°ê³¼ë¥¼ í ì¤í¸ë¡ ìë¦¼
  // ============================================================================
  window.WS._dedupNotifiedOnce = false; // ì²« ë¡ëììë§ í ì¤í¸ ìë¦¼

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
      // 2ê±´ ì´ì: ê°ì¥ ì¢ì ë§¤ë¬¼ 1ê±´ë§ ë³´ì¡´
      // ì°ì ìì: ì¬ì§ ë§ì ê² > ìµì  ID(ê°ì¥ ëì ID)
      arr.sort(function(a, b) {
        var aImgs = (a.images || a.listing_images || []).length;
        var bImgs = (b.images || b.listing_images || []).length;
        if (bImgs !== aImgs) return bImgs - aImgs; // ì¬ì§ ë§ì ì
        return (b.id || 0) - (a.id || 0); // ìµì  ID ì
      });
      kept.push(arr[0]); // ì²« ë²ì§¸(ìµì°ì ) ë³´ì¡´
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
          reason: 'ëì¼ë§¤ë¬¼(ìì¬ì§+ëí¸ì+ê±°ë+ê°ê²©)'
        });
      }
    });

    // ì¤ë³µ ì ê±° ë¡ê·¸ ì ì¥ (ìµê·¼ 1íë¶)
    window.WS._lastDedupLog = {
      timestamp: new Date().toISOString(),
      totalBefore: items.length,
      totalAfter: kept.length,
      removedCount: removed.length,
      removed: removed
    };

    // ì½ì ë¡ê·¸
    if (removed.length > 0) {
      _wsLog('[WISHES-DEDUP] ' + removed.length + 'ê±´ ì¤ë³µ ì ê±° ìë£ (' + items.length + ' â ' + kept.length + ')');
      _wsLog(removed.slice(0, 20));
    }

    // í ì¤í¸ ìë¦¼: ì²« ë¡ëììë§ 1í íì, ì´í ìë ìë¡ê³ ì¹¨ì ì½ìë§
    if (removed.length > 0 && !silent && !window.WS._dedupNotifiedOnce) {
      window.WS._dedupNotifiedOnce = true;
      setTimeout(function() {
        showToast('ì¤ë³µ ' + removed.length + 'ê±´ ì ê±° (' + items.length + 'â' + kept.length + ')', 'success');
      }, 800);
    }

    return kept;
  };

  // (ë¯¸ì¬ì© showDedupLog í¨ì ì ê±°ë¨ â ì¤ë³µ ì ê±° ê²°ê³¼ë ì½ì ë¡ê·¸ë¡ íì¸)

  // ============================================================================
  // DUPLICATE WATCHDOG - ì¤ë³µ ìì¬ ë§¤ë¬¼ ì¤ìê° ê°ì ìì§
  // ìë ìë¡ê³ ì¹¨ ìë§ë¤ ì¤í, ìì¬ ë§¤ë¬¼ ë°ê²¬ ì íì ìë¦¼
  // ============================================================================
  window.WS._dupWatchdog = function(items) {
    if (!items || items.length < 2) return;

    // 1ë¨ê³: ìê²© ì¤ë³µ (ì´ë¯¸ _autoDedupìì ì²ë¦¬ë¨, ì¬ê¸°ë ìì¬ ë§¤ë¬¼ ê°ì§)
    // 2ë¨ê³: ì£¼ì+ê±°ë+ê°ê²©ì ê°ì§ë§ ëí¸ìê° ë¤ë¥¸ ê²½ì° â "ìì¬" ë§¤ë¬¼
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
      // ê°ì ì£¼ì+ê±°ë+ê°ê²©ì¸ë° 2ê±´ ì´ì â ëí¸ìë§ ë¤ë¥¸ ì§ì§ ë¤ë¥¸ ë§¤ë¬¼ì¼ìë, ì¤ë³µì¼ìë
      // address_detailì´ ë¤ë¥¸ ê²½ì°ë§ ìì¬ì¼ë¡ ë¶ë¥
      var details = {};
      arr.forEach(function(l) { details[(l.address_detail||'').trim()] = true; });
      if (Object.keys(details).length < arr.length) {
        // ê°ì ëí¸ìê° ìì¼ë©´ ì´ë¯¸ _autoDedupìì ì ê±°ë¨, ë¬´ì
        return;
      }
      // ëí¸ìê° ì ë¶ ë¤ë¥´ì§ë§ ì ë¶ ë¹ì´ìê±°ë ë§¤ì° ì ì¬íë©´ ìì¬
      var emptyCount = arr.filter(function(l) { return !(l.address_detail||'').trim(); }).length;
      if (emptyCount >= 2) {
        // ëí¸ìê° ë¹ì´ìë ë§¤ë¬¼ì´ 2ê±´ ì´ì â ëì ìì¬
        suspects.push({
          address: arr[0].address,
          deal: arr[0].deal,
          deposit: arr[0].deposit,
          monthly: arr[0].monthly,
          price: arr[0].price,
          items: arr,
          reason: 'ëí¸ì ë¯¸ìë ¥ ëì¼ì¡°ê±´ ë§¤ë¬¼ ' + emptyCount + 'ê±´'
        });
      }
    });

    // ì´ì  ìë¦¼ê³¼ ë¹êµ (ê°ì ìì¬ê±´ì ë¤ì ì ëì)
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

  // ì¤ë³µ ìì¬ ë§¤ë¬¼ ìë¦¼ íì (ì­ì /ì ì§ ì í)
  window.WS._showDupSuspectAlert = function(suspects) {
    var existing = document.getElementById('ws-dup-suspect-alert');
    if (existing) existing.remove();

    var totalItems = suspects.reduce(function(s, g) { return s + g.items.length; }, 0);

    var div = document.createElement('div');
    div.id = 'ws-dup-suspect-alert';
    div.style.cssText = 'position:fixed;top:60px;right:20px;width:420px;max-height:80vh;background:#fff;border:2px solid #e53e3e;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.25);z-index:100010;animation:ws-slide-in 0.3s ease;overflow:hidden;display:flex;flex-direction:column;';

    var html = '<div style="background:linear-gradient(135deg,#e53e3e,#c53030);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">';
    html += '<div><div style="font-weight:700;font-size:14px;">â ï¸ ì¤ë³µ ìì¬ ë§¤ë¬¼ ê°ì§</div>';
    html += '<div style="font-size:11px;opacity:0.9;margin-top:2px;">' + suspects.length + 'ê·¸ë£¹ / ' + totalItems + 'ê±´ Â· ' + new Date().toLocaleTimeString('ko-KR') + '</div></div>';
    html += '<button class="ws-suspect-close" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;">&times;</button>';
    html += '</div>';
    html += '<div style="padding:8px 12px;overflow-y:auto;flex:1;">';

    suspects.forEach(function(group, gi) {
      html += '<div style="margin-bottom:12px;border:1px solid #fdd;border-radius:8px;overflow:hidden;">';
      html += '<div style="background:#fff5f5;padding:8px 12px;font-size:12px;font-weight:600;color:#c53030;">';
      html += 'ð ' + escHtml(group.address || '') + ' Â· ' + escHtml(group.deal || '') + ' Â· ';
      html += (group.deal === 'ë§¤ë§¤' ? (group.price||0) + 'ë§' : (group.deposit||0) + '/' + (group.monthly||0));
      html += ' <span style="color:#999;font-weight:400;">(' + group.reason + ')</span></div>';

      group.items.forEach(function(l) {
        html += '<div style="padding:6px 12px;border-top:1px solid #fdd;display:flex;align-items:center;justify-content:space-between;font-size:12px;" data-suspect-id="' + l.id + '">';
        html += '<div style="flex:1;">';
        html += '<span style="color:#666;">#' + l.id + '</span> ';
        html += escHtml(l.address_detail || '(ëí¸ì ë¯¸ìë ¥)');
        html += ' Â· ' + escHtml(l.title || '');
        html += '</div>';
        html += '<div style="display:flex;gap:4px;flex-shrink:0;">';
        html += '<button class="ws-suspect-keep" data-id="' + l.id + '" style="padding:3px 8px;background:#2D5A27;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ì ì§</button>';
        if (window.WS.isSuperAdmin()) {
          html += '<button class="ws-suspect-del" data-id="' + l.id + '" style="padding:3px 8px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ì­ì </button>';
        }
        html += '</div></div>';
      });
      html += '</div>';
    });

    html += '</div>';
    html += '<div style="padding:8px 12px;background:#f9f9f9;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">';
    html += '<span style="font-size:11px;color:#999;">ì¤ë³µê°ì ìì§ ì¤í ì¤</span>';
    html += '<button class="ws-suspect-dismiss" style="padding:4px 12px;background:#888;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ëª¨ë ë¬´ì</button>';
    html += '</div>';
    div.innerHTML = html;
    document.body.appendChild(div);

    // ì´ë²¤í¸ ë°ì¸ë©
    div.querySelector('.ws-suspect-close').addEventListener('click', function() { div.remove(); });
    div.querySelector('.ws-suspect-dismiss').addEventListener('click', function() { div.remove(); showToast('ìì¬ ë§¤ë¬¼ ìë¦¼ ë¬´ìë¨', 'success'); });

    div.querySelectorAll('.ws-suspect-keep').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        var row = this.closest('[data-suspect-id]');
        if (row) { row.style.background = '#e8f5e9'; row.innerHTML = '<div style="padding:6px 12px;color:#2D5A27;font-size:12px;">â #' + id + ' ì ì§ë¨</div>'; }
      });
    });

    div.querySelectorAll('.ws-suspect-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        // allListingsìì ì ê±°
        if (window.WS.allListings) {
          window.WS.allListings = window.WS.allListings.filter(function(l) { return String(l.id) !== String(id); });
          window.WS.refresh();
        }
        var row = this.closest('[data-suspect-id]');
        if (row) { row.style.background = '#ffebee'; row.innerHTML = '<div style="padding:6px 12px;color:#e53e3e;font-size:12px;">ðï¸ #' + id + ' ëª©ë¡ìì ì ê±°ë¨</div>'; }
        showToast('ë§¤ë¬¼ #' + id + ' ê²ìëª©ë¡ìì ì ê±°ë¨', 'warning');
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
  // ê²ì UI ì¤ë²ë ì´ë¥¼ ì¨ê¸°ë í¨ì (React DOM ê±´ëë¦¬ì§ ìì)
  function _hideSearchUI() {
    var overlay = document.getElementById('ws-search-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ì¬ì´ëë°ì 'ë§¤ë¬¼ ê²ì' ë§í¬ì ì´ë²¤í¸ë¥¼ ë°ì¸ë©íë í¨ì
  // ì ë²í¼ì ë§ë¤ì§ ìê³ , ê¸°ì¡´ Next.js ë§í¬ë¥¼ ê°ë¡ì±ì íì¥ ê²ì UI í¸ì¶
  function _bindSearchLinks() {
    var allLinks = document.querySelectorAll('nav a, aside a');
    allLinks.forEach(function(link) {
      if (link.getAttribute('data-ws-bound')) return; // ì´ë¯¸ ë°ì¸ë©ë¨
      var isSearchLink = false;
      if (link.href && link.href.indexOf('tab=search') !== -1) {
        isSearchLink = true;
      }
      if (link.textContent && link.textContent.trim().replace(/[^ê°-í£]/g, '') === 'ë§¤ë¬¼ê²ì') {
        isSearchLink = true;
      }
      if (isSearchLink) {
        link.setAttribute('data-ws-bound', 'true');
        // í¸ë² ì ë°ì´í° íë¦¬íì¹ ìì (í´ë¦­ ì ì ë¯¸ë¦¬ ë¡ë©)
        link.addEventListener('mouseenter', function() {
          if (typeof window.WS.loadData === 'function' && !window.WS._prefetchStarted && !window.WS._loadingData && (!window.WS.allListings || window.WS.allListings.length === 0)) {
            window.WS._prefetchStarted = true;
            window.WS.loadData();
          }
        });
        link.addEventListener('click', function(e) {
          // ë°ì´í° ë¡ë©ì´ ìì§ ì ììëì¼ë©´ ì¦ì ìì
          if (typeof window.WS.loadData === 'function' && !window.WS._loadingData && (!window.WS.allListings || window.WS.allListings.length === 0)) {
            window.WS.loadData();
          }
          setTimeout(function() { window.WS.showSearchUI(); }, 100);
        });
      } else {
        // ë¤ë¥¸ í­ ë§í¬ í´ë¦­ ì ê²ì ì¤ë²ë ì´ ì¨ê¸°ê¸°
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

    // URL ë³ê²½ ê°ì§: ìì í polling ë°©ì (Next.js ë¼ì°í°ë¥¼ ê±´ëë¦¬ì§ ìì)
    var _lastURL = location.href;
    function _checkSearchTab() {
      var isSearchContext = location.search.indexOf('tab=search') !== -1
        || location.pathname === '/search'
        || location.pathname.indexOf('/search') === 0;
      if (isSearchContext) {
        // ì´ë¯¸ ê²ì UIê° íìëì´ ìì¼ë©´ ì¤íµ
        var overlay = document.getElementById('ws-search-overlay');
        if (!overlay || overlay.style.display === 'none') {
          window.WS.showSearchUI();
        }
      } else {
        // ê²ì í­ì´ ìëë©´ ì¤ë²ë ì´ ì¨ê¸°ê¸°
        _hideSearchUI();
      }
    }
    setInterval(function() {
      if (location.href !== _lastURL) {
        _lastURL = location.href;
        _checkSearchTab();
        // URLì´ ë°ëìì¼ë©´ ì ë§í¬ìë ì´ë²¤í¸ ì¬ë°ì¸ë©
        setTimeout(function() { _bindSearchLinks(); }, 500);
      }
    }, 500);

    // ì´ê¸° ë¡ë ì ?tab=search ëë /search ê²½ë¡ì´ë©´ ë°ì´í° íë¦¬íì¹ ìì½ (loadData ì ì í ì¤í)
    if (location.search.indexOf('tab=search') !== -1
        || location.pathname === '/search'
        || location.pathname.indexOf('/search') === 0) {
      window.WS._prefetchOnReady = true;
    }
    setTimeout(_checkSearchTab, 300);

    // Next.jsê° ì¬ì´ëë°ë¥¼ ì¬ë ëë§í  ë ì´ë²¤í¸ ì¬ë°ì¸ë© (debounced)
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
    // React DOMì ì ë ê±´ëë¦¬ì§ ìë ê³ ì  ì¤ë²ë ì´ ë°©ì
    // document.bodyì ì¤ë²ë ì´ë¥¼ ì¶ê°íì¬ main ìì­ ìì íì

    // ì¤ë³µ í¸ì¶ ë°©ì´ (ë¹ ë¥¸ ì°ì í´ë¦­ ì)
    if (window.WS._showingSearchUI) return;
    window.WS._showingSearchUI = true;
    setTimeout(function() { window.WS._showingSearchUI = false; }, 300);

    // ì´ë¯¸ ê²ì UIê° ì¡´ì¬íë©´ ë³´ì¬ì£¼ê¸°ë§ íê³  ë¦¬í´
    var existingUI = document.getElementById('ws-search-overlay');
    if (existingUI) {
      existingUI.style.display = 'block';
      return;
    }

    // ì¬ì´ëë° ëë¹ ê°ì§
    // ì¬ì´ëë° ìì¼ë©´ 0 (/search íì´ì§ì©)
    var sidebar = document.querySelector('aside');
    var sidebarWidth = sidebar ? sidebar.offsetWidth : 0;

    // bodyì ê³ ì  ì¤ë²ë ì´ ì¶ê° (React DOM ê±´ëë¦¬ì§ ìì)
    var overlay = document.createElement('div');
    overlay.id = 'ws-search-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:' + sidebarWidth + 'px;right:0;bottom:0;z-index:50;overflow-y:auto;background:#f0f7ed;';
    overlay.innerHTML = `
      <div class="ws-search-container">
        <!-- Header -->
        <div class="ws-header">
          <h1 class="ws-title">WISHES ë§¤ë¬¼ê²ì</h1>
          <input type="text" class="ws-global-search" placeholder="ê²ìì´ë¥¼ ìë ¥íì¸ì">
          <div class="ws-header-buttons">
            <button class="ws-btn ws-btn-secondary" id="ws-btn-reset-all">ì´ê¸°í</button>
            <button class="ws-btn ws-btn-primary" id="ws-btn-search">ê²ì</button>
          </div>
        </div>

        <!-- View Mode Tabs -->
        <div class="ws-view-tabs">
          <button class="ws-tab ws-tab-active" data-view="search">ì£¼ìê²ìð</button>
          <button class="ws-tab" data-view="map">ì§ëë³´ê¸°ðºï¸</button>
          <button class="ws-tab" data-view="all">ì ì²´ë³´ê¸°ð</button>
        </div>

        <!-- Address Search Section -->
        <div class="ws-addr-section">
          <div class="ws-region-tabs" id="ws-region-tabs"></div>
          <div class="ws-districts" id="ws-districts"></div>
          <div class="ws-dongs" id="ws-dongs" style="display:none;"></div>
          <div class="ws-selected-regions" id="ws-selected-regions"></div>
          <div class="ws-jibun-range">
            <input type="text" class="ws-input" placeholder="ì§ë²(ìì)" id="ws-jibun-start">
            <input type="text" class="ws-input" placeholder="ì§ë²(ë)" id="ws-jibun-end">
          </div>
          <div class="ws-building-search">
            <input type="text" class="ws-input" placeholder="ê±´ë¬¼ëª ê²ì" id="ws-building-name">
            <input type="text" class="ws-input" placeholder="ê±´ë¬¼ID ê²ì" id="ws-building-id">
          </div>
        </div>

        <!-- Map Placeholder -->
        <div class="ws-map-container" style="display: none;" id="ws-map-container">
          <p>ì§ë ë³´ê¸°</p>
        </div>

        <!-- Type Tabs -->
        <div class="ws-type-tabs" id="ws-type-tabs"></div>

        <!-- Filter Section -->
        <div class="ws-filters-toggle" id="ws-filters-toggle">
          <span>â¼ íí° ì ê¸°/í¼ì¹ê¸°</span>
        </div>
        <div class="ws-filters-section" id="ws-filters-section"></div>

        <!-- ë§¤ë¬¼ ê´ë¦¬ íµí© ëìë³´ë -->
        <div class="ws-mgmt-dashboard" id="ws-mgmt-dashboard" style="display:flex;gap:4px;margin:6px 4px;flex-wrap:wrap;align-items:center;">
          <div class="ws-mgmt-stat ws-mgmt-stat-active" data-status-filter="all" style="flex:1;min-width:60px;padding:6px 8px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;" id="ws-mgmt-total">0</div>
            <div style="font-size:9px;opacity:0.9;">ì ì²´</div>
          </div>
          <div class="ws-mgmt-stat" data-status-filter="ê³µê°" style="flex:1;min-width:60px;padding:6px 8px;background:#fff;border:1.5px solid #22c55e;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;color:#16a34a;" id="ws-mgmt-public">0</div>
            <div style="font-size:9px;color:#16a34a;">ê³µê°</div>
          </div>
          <div class="ws-mgmt-stat" data-status-filter="ë¹ê³µê°" style="flex:1;min-width:60px;padding:6px 8px;background:#fff;border:1.5px solid #9ca3af;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;color:#6b7280;" id="ws-mgmt-private">0</div>
            <div style="font-size:9px;color:#6b7280;">ë¹ê³µê°</div>
          </div>
          <div class="ws-mgmt-stat" data-status-filter="ê³ì½ì¤" style="flex:1;min-width:60px;padding:6px 8px;background:#fff;border:1.5px solid #f59e0b;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;color:#d97706;" id="ws-mgmt-contracting">0</div>
            <div style="font-size:9px;color:#d97706;">ê³ì½ì¤</div>
          </div>
          <div class="ws-mgmt-stat" data-status-filter="ê³ì½ìë£" style="flex:1;min-width:60px;padding:6px 8px;background:#fff;border:1.5px solid #8b5cf6;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:15px;font-weight:800;color:#7c3aed;" id="ws-mgmt-completed">0</div>
            <div style="font-size:9px;color:#7c3aed;">ìë£</div>
          </div>
          <div style="display:flex;gap:4px;margin-left:auto;align-items:center;">
            <button id="ws-btn-new-listing" style="padding:6px 14px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-weight:700;white-space:nowrap;">+ ë§¤ë¬¼ë±ë¡</button>
            <div class="ws-bar-dropdown" style="position:relative;">
              <button class="ws-dropdown-trigger" style="padding:6px 10px;border:1.5px solid #7c3aed;color:#7c3aed;background:#fff;border-radius:8px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap;">âï¸ ì¼ê´ìì â¾</button>
              <div class="ws-dropdown-menu">
                <button class="ws-dropdown-item" id="ws-btn-bulk-upload">ð ëëë±ë¡</button>
                <button class="ws-dropdown-item" id="ws-btn-bulk-status">ð ì¼ê´ìíë³ê²½</button>
                <button class="ws-dropdown-item" id="ws-btn-bulk-autogen">ðï¸ AIì¼ê´ìì±</button>
                <button class="ws-dropdown-item" id="ws-btn-csv-export">ð CSVë´ë³´ë´ê¸°</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Results Header -->
        <div class="ws-results-header">
          <div class="ws-result-count">
            ê²ìê²°ê³¼: <strong id="ws-result-count">0</strong>ê±´
          </div>
          <div class="ws-result-controls" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <select class="ws-select" id="ws-sort-primary" style="padding:4px 8px;font-size:12px;">
              <option value="latest">ìµì ì</option>
              <option value="views">ì¡°íì</option>
              <option value="price_low">ê°ê²©â</option>
              <option value="price_high">ê°ê²©â</option>
              <option value="area_low">ë©´ì â</option>
              <option value="area_high">ë©´ì â</option>
            </select>
            <select class="ws-select" id="ws-sort-secondary" style="display:none;">
              <option value="none">ì¶ê°ì ë ¬ìì</option>
              <option value="latest">ìµì ì</option>
              <option value="views">ì¡°íì</option>
              <option value="price_low">ê°ê²©ë®ìì</option>
              <option value="price_high">ê°ê²©ëìì</option>
            </select>
            <select class="ws-select" id="ws-per-page" style="padding:4px 6px;font-size:12px;">
              <option value="10">10ê±´</option>
              <option value="20" selected>20ê±´</option>
              <option value="50">50ê±´</option>
              <option value="100">100ê±´</option>
            </select>
            <button class="ws-btn ws-btn-group-toggle" id="ws-group-toggle" title="ìì¬ì§ ê·¸ë£¹ ì ì²´ í¼ì¹¨/ë«í" style="padding:4px 8px;font-size:11px;">ðê·¸ë£¹</button>
            <label class="ws-checkbox-label" style="font-size:11px;">
              <input type="checkbox" id="ws-hide-images"> ì´ë¯¸ì§ì¨ê¹
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
            <h2>ê´ì¬ë§¤ë¬¼</h2>
            <div class="ws-favorites-list" id="ws-favorites-list"></div>
          </div>
        </div>

        <!-- Compare Modal -->
        <div class="ws-modal" id="ws-modal-compare" style="display: none;">
          <div class="ws-modal-content" style="max-width:900px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:16px;">ë§¤ë¬¼ ë¹êµ</h2>
            <div id="ws-compare-container"></div>
          </div>
        </div>

        <!-- Smart Recommend Modal -->
        <div class="ws-modal" id="ws-modal-smart-recommend" style="display: none;">
          <div class="ws-modal-content" style="max-width:800px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:4px;">ð¯ ì¤ë§í¸ ë§¤ë¬¼ ì¶ì²</h2>
            <p style="font-size:12px;color:#888;margin-bottom:16px;">ìíë ì¡°ê±´ì ìë ¥íë©´ ìµì ì ë§¤ë¬¼ì ì¶ì²í©ëë¤</p>

            <div id="ws-smart-recommend-form" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ì©ë</label>
                <select id="ws-sr-purpose" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                  <option value="">ì ì²´</option>
                  <option value="ì£¼ê±°">ì£¼ê±°ì©</option>
                  <option value="ìê°">ìê°</option>
                  <option value="ì¬ë¬´ì¤">ì¬ë¬´ì¤</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ê±°ëì í</label>
                <select id="ws-sr-deal" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                  <option value="">ì ì²´</option>
                  <option value="ì ì¸">ì ì¸</option>
                  <option value="ìì¸">ìì¸</option>
                  <option value="ë§¤ë§¤">ë§¤ë§¤</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">íì</label>
                <select id="ws-sr-type" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                  <option value="">ì ì²´</option>
                  <option value="ìë£¸">ìë£¸</option>
                  <option value="í¬ë£¸">í¬ë£¸</option>
                  <option value="ì°ë¦¬ë£¸">ì°ë¦¬ë£¸</option>
                  <option value="ì¤í¼ì¤í">ì¤í¼ì¤í</option>
                  <option value="ìíí¸">ìíí¸</option>
                  <option value="ë¹ë¼">ë¹ë¼</option>
                  <option value="ìê°">ìê°</option>
                  <option value="ì¬ë¬´ì¤">ì¬ë¬´ì¤</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ì§ì­ (í¤ìë)</label>
                <input type="text" id="ws-sr-area" placeholder="ì: ê°ë¨, ì­ì¼ë" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ë³´ì¦ê¸ ìµë (ë§ì)</label>
                <input type="number" id="ws-sr-deposit-max" placeholder="ì: 5000" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ìì¸ ìµë (ë§ì)</label>
                <input type="number" id="ws-sr-monthly-max" placeholder="ì: 100" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ë§¤ë§¤ê° ìµë (ë§ì)</label>
                <input type="number" id="ws-sr-price-max" placeholder="ì: 50000" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ë©´ì  ìµì (mÂ²)</label>
                <input type="number" id="ws-sr-area-min" placeholder="ì: 20" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ë©´ì  ìµë (mÂ²)</label>
                <input type="number" id="ws-sr-area-max" placeholder="ì: 60" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ë°© ì ìµì</label>
                <input type="number" id="ws-sr-rooms-min" placeholder="ì: 1" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;">ì¸µì (ìµì)</label>
                <input type="number" id="ws-sr-floor-min" placeholder="ì: 2" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div style="display:flex;flex-direction:column;justify-content:flex-end;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <label style="font-size:11px;display:flex;align-items:center;gap:3px;"><input type="checkbox" id="ws-sr-parking"> ì£¼ì°¨</label>
                  <label style="font-size:11px;display:flex;align-items:center;gap:3px;"><input type="checkbox" id="ws-sr-elevator"> ìë¦¬ë² ì´í°</label>
                  <label style="font-size:11px;display:flex;align-items:center;gap:3px;"><input type="checkbox" id="ws-sr-pet"> ë°ë ¤ëë¬¼</label>
                  <label style="font-size:11px;display:flex;align-items:center;gap:3px;"><input type="checkbox" id="ws-sr-fulloption"> íìµì</label>
                </div>
              </div>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:16px;">
              <button id="ws-sr-search-btn" style="flex:1;padding:10px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">ð ë§¤ë¬¼ ì¶ì² ê²ì</button>
              <button id="ws-sr-reset-btn" style="padding:10px 16px;background:#eee;color:#666;border:none;border-radius:8px;font-size:13px;cursor:pointer;">ì´ê¸°í</button>
            </div>

            <div id="ws-sr-results" style="max-height:400px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- Search History Modal -->
        <div class="ws-modal" id="ws-modal-history" style="display: none;">
          <div class="ws-modal-content" style="max-width:600px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:12px;">ð ìµê·¼ ê²ì íì¤í ë¦¬</h2>
            <p style="font-size:12px;color:#888;margin-bottom:12px;">ìµê·¼ íí° ì¡°í©ì ì ì¥íê³  ë¹ ë¥´ê² ë³µìí©ëë¤ (ìµë 10ê°)</p>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
              <input type="text" id="ws-history-name" placeholder="íì¬ íí° ì´ë¦ (ì: ê°ë¨ ìë£¸ ìì¸)" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
              <button id="ws-history-save-btn" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;white-space:nowrap;">ð¾ ì ì¥</button>
            </div>
            <div id="ws-history-list" style="max-height:400px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- AI Briefing Modal -->
        <div class="ws-modal" id="ws-modal-briefing" style="display: none;">
          <div class="ws-modal-content" style="max-width:800px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:16px;">AI ë§¤ë¬¼ ë¸ë¦¬í ìë£</h2>
            <div id="ws-briefing-container"></div>
          </div>
        </div>

        <!-- Customer Folder Modal -->
        <div class="ws-modal" id="ws-modal-customer" style="display: none;">
          <div class="ws-modal-content" style="max-width:650px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:12px;">ð¤ ê³ ê°ë³ ë§¤ë¬¼ í´ë</h2>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
              <input type="text" id="ws-customer-name" placeholder="ê³ ê°ëª ìë ¥ (ì: ê¹ì² ìë)" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;">
              <button id="ws-customer-add-btn" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;white-space:nowrap;">â í´ëìì±</button>
            </div>
            <div id="ws-customer-list" style="max-height:450px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- Building Group Modal -->
        <div class="ws-modal" id="ws-modal-building" style="display: none;">
          <div class="ws-modal-content" style="max-width:800px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:16px;">ð¢ ê±´ë¬¼ë³ ë§¤ë¬¼ ê·¸ë£¹</h2>
            <div id="ws-building-container" style="max-height:500px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- Price Change Log Modal -->
        <div class="ws-modal" id="ws-modal-changelog" style="display: none;">
          <div class="ws-modal-content" style="max-width:700px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:12px;">ð ë§¤ë¬¼ ë³ë ì´ë ¥</h2>
            <p style="font-size:12px;color:#888;margin-bottom:12px;">ê°ê²© ë° ìí ë³ê²½ ì´ë ¥ì ìëì¼ë¡ ì¶ì í©ëë¤</p>
            <div id="ws-changelog-container" style="max-height:450px;overflow-y:auto;"></div>
          </div>
        </div>

        <!-- Alert Settings Modal -->
        <div class="ws-modal" id="ws-modal-alerts" style="display: none;">
          <div class="ws-modal-content" style="max-width:600px;">
            <button class="ws-modal-close">&times;</button>
            <h2 style="color:#2D5A27;margin-bottom:12px;">ð ë§¤ë¬¼ ìë¦¼ ì¤ì </h2>
            <p style="font-size:12px;color:#888;margin-bottom:16px;">ì¡°ê±´ì ë§ë ì ê· ë§¤ë¬¼ì´ ë±ë¡ëë©´ ìëì¼ë¡ ìë¦¼ì íìí©ëë¤</p>
            <div style="background:#f8f9fa;border-radius:10px;padding:16px;margin-bottom:16px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                <div>
                  <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:4px;">í¤ìë</label>
                  <input type="text" id="ws-alert-keyword" placeholder="ì: ì­ì¼, ê°ë¨, ì¤í¼ì¤í" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;">
                </div>
                <div>
                  <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:4px;">ìµë ë³´ì¦ê¸ (ë§ì)</label>
                  <input type="number" id="ws-alert-maxprice" placeholder="ì: 5000" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;">
                </div>
              </div>
              <div style="display:flex;gap:10px;align-items:flex-end;">
                <div style="flex:1;">
                  <label style="font-size:11px;color:#666;font-weight:600;display:block;margin-bottom:4px;">ë§¤ë¬¼ ì í</label>
                  <select id="ws-alert-type" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;">
                    <option value="">ì ì²´</option>
                    <option value="ìë£¸">ìë£¸</option>
                    <option value="í¬ë£¸">í¬ë£¸</option>
                    <option value="ì¤í¼ì¤í">ì¤í¼ì¤í</option>
                    <option value="ìíí¸">ìíí¸</option>
                    <option value="ìê°">ìê°</option>
                    <option value="ì¬ë¬´ì¤">ì¬ë¬´ì¤</option>
                  </select>
                </div>
                <button id="ws-alert-add-btn" style="padding:8px 20px;background:#ed8936;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;">â ìë¦¼ ì¶ê°</button>
              </div>
            </div>
            <div id="ws-alert-list" style="max-height:300px;overflow-y:auto;"></div>
          </div>
        </div>
      </div>

      <!-- Bottom Action Bar (Reorganized) -->
      <div class="ws-bottom-bar">
        <!-- íµì¬ ì¡ì (í­ì íì) -->
        <div class="ws-bar-primary" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
          <button class="ws-bottom-btn" id="ws-btn-select-all" style="font-size:11px;padding:5px 8px;">ì ì²´ì í</button>
          <button class="ws-bottom-btn" id="ws-btn-deselect-all" style="font-size:11px;padding:5px 8px;">í´ì </button>
          <span id="ws-selected-count" style="font-size:11px;color:#2D5A27;font-weight:600;padding:0 4px;">0ê±´</span>
          <div class="ws-bar-divider"></div>
          <button class="ws-bottom-btn ws-btn-highlight" id="ws-btn-ai-briefing" style="font-size:11px;padding:5px 10px;">AIë¸ë¦¬í</button>
          <button class="ws-bottom-btn" id="ws-btn-compare" style="font-size:11px;padding:5px 8px;">ë¹êµ</button>
          <button class="ws-bottom-btn" id="ws-btn-add-favorites" style="font-size:11px;padding:5px 8px;">ê´ì¬+</button>
          <button class="ws-bottom-btn" id="ws-btn-view-favorites" style="font-size:11px;padding:5px 8px;">ê´ì¬ëª©ë¡ <span id="ws-fav-count" style="background:#e53e3e;color:#fff;border-radius:10px;padding:1px 5px;font-size:10px;">0</span></button>
          <button class="ws-bottom-btn" id="ws-btn-print" style="font-size:11px;padding:5px 8px;">ì¸ì</button>
          <button class="ws-bottom-btn" id="ws-btn-excel" style="font-size:11px;padding:5px 8px;">ìì</button>
          <label class="ws-checkbox-label" style="font-size:10px;">
            <input type="checkbox" id="ws-include-notes"> í¹ì´ì¬í­
          </label>
        </div>

        <!-- ì¹´íê³ ë¦¬ ëë¡­ì ë©ë´ ê·¸ë£¹ -->
        <div class="ws-bar-groups" style="display:flex;gap:4px;flex-wrap:wrap;">
          <!-- ê³µì  -->
          <div class="ws-bar-dropdown">
            <button class="ws-dropdown-trigger" style="border-color:#2563eb;color:#2563eb;font-size:11px;padding:5px 8px;">ð¤ ê³µì  â¾</button>
            <div class="ws-dropdown-menu">
              <button class="ws-dropdown-item" id="ws-btn-share-text">ð¬ ì¹´í¡ê³µì </button>
              <button class="ws-dropdown-item" id="ws-btn-pdf-briefing">ð PDFë¸ë¦¬í</button>
              <button class="ws-dropdown-item" id="ws-btn-share-link">ð ë§í¬ê³µì </button>
            </div>
          </div>

          <!-- ë¶ì -->
          <div class="ws-bar-dropdown">
            <button class="ws-dropdown-trigger" style="border-color:#d97706;color:#d97706;font-size:11px;padding:5px 8px;">ð ë¶ì â¾</button>
            <div class="ws-dropdown-menu">
              <button class="ws-dropdown-item" id="ws-btn-stats">ð íµê³</button>
              <button class="ws-dropdown-item" id="ws-btn-market-chart">ð ìì¸ë¶ì</button>
              <button class="ws-dropdown-item" id="ws-btn-turnover">ð íì ì¨</button>
              <button class="ws-dropdown-item" id="ws-btn-heatmap">ðºï¸ ë°ì§ë</button>
              <button class="ws-dropdown-item" id="ws-btn-price-changes">ð ë³ëê°ì§</button>
              <button class="ws-dropdown-item" id="ws-btn-fav-compare">âï¸ ì¦ê²¨ë¹êµ</button>
              <button class="ws-dropdown-item" id="ws-btn-custreport">ð ì¶ì²ë¦¬í¬í¸</button>
              <button class="ws-dropdown-item" id="ws-btn-smart-recommend">ð¯ ì¤ë§í¸ì¶ì²</button>
            </div>
          </div>

          <!-- ê´ë¦¬ -->
          <div class="ws-bar-dropdown">
            <button class="ws-dropdown-trigger" style="border-color:#059669;color:#059669;font-size:11px;padding:5px 8px;">ð ê´ë¦¬ â¾</button>
            <div class="ws-dropdown-menu">
              <button class="ws-dropdown-item" id="ws-btn-customer-folder">ð¤ ê³ ê°í´ë</button>
              <button class="ws-dropdown-item" id="ws-btn-building-group">ð¢ ê±´ë¬¼ê·¸ë£¹</button>
              <button class="ws-dropdown-item" id="ws-btn-memo-mgr">ð ë©ëª¨ê´ë¦¬</button>
              <button class="ws-dropdown-item" id="ws-btn-memosearch">ð ë©ëª¨ê²ì</button>
              <button class="ws-dropdown-item" id="ws-btn-search-history">ð íì¤í ë¦¬</button>
              <button class="ws-dropdown-item" id="ws-btn-changelog">ð ë³ëì´ë ¥</button>
              <button class="ws-dropdown-item" id="ws-btn-daily-briefing">ð ì¼ì¼ë¸ë¦¬í</button>
            </div>
          </div>

          <!-- ì¤ì  -->
          <div class="ws-bar-dropdown">
            <button class="ws-dropdown-trigger" style="border-color:#6366f1;color:#6366f1;font-size:11px;padding:5px 8px;">âï¸ ì¤ì  â¾</button>
            <div class="ws-dropdown-menu">
              <button class="ws-dropdown-item" id="ws-btn-alerts">ð ìë¦¼ì¤ì </button>
              <button class="ws-dropdown-item" id="ws-btn-presets">â¡ íë¦¬ì</button>
              <button class="ws-dropdown-item" id="ws-btn-quick-filter">â¡ íµíí°</button>
              <button class="ws-dropdown-item" id="ws-btn-auto-refresh">â±ï¸ ìëìë¡ê³ ì¹¨</button>
              <button class="ws-dropdown-item" id="ws-btn-darkmode">ð ë¤í¬ëª¨ë</button>
              <button class="ws-dropdown-item" id="ws-btn-backup">ð¾ ë°±ì/ë³µì</button>
              <button class="ws-dropdown-item" id="ws-btn-shortcuts">â¨ï¸ ë¨ì¶í¤</button>
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
      // í´ë¹ êµ¬ì ìí ë ì íë í´ì 
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

    // ì íë êµ¬/êµ°ìì ë ì´ë¦ ì¶ì¶ (ë¡ëë ë§¤ë¬¼ ë°ì´í° ê¸°ë°)
    var allListings = window.WS.allListings || [];
    var dongMap = {};
    allListings.forEach(function(l) {
      var addr = (l.address || '') + ' ' + (l.dong || '');
      selectedRegions.forEach(function(region) {
        if (addr.includes(region)) {
          // ì£¼ììì ë ì´ë¦ ì¶ì¶ (ì: "ìì¸ ê´ìêµ¬ ì ë¦¼ë 123" â "ì ë¦¼ë")
          var dongMatch = addr.match(/([ê°-í£]+[ëìë©´ë¦¬])\s/);
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
    html += '<div style="font-size:10px;color:#888;margin-bottom:4px;padding-left:4px;">ë ë¨ì íí° (ì í ê°ë¥)</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
    dongList.forEach(function(item) {
      var key = item.region + ' ' + item.dong;
      var isSelected = window.WS.state.selectedDongs.includes(key) ? 'ws-selected' : '';
      html += '<button class="ws-dong-btn ' + isSelected + '" data-dong-key="' + key + '" style="padding:2px 8px;font-size:11px;border:1px solid ' + (isSelected ? '#2D5A27' : '#ddd') + ';border-radius:12px;background:' + (isSelected ? '#E8F5E9' : '#fff') + ';color:' + (isSelected ? '#2D5A27' : '#666') + ';cursor:pointer;white-space:nowrap;">' + item.dong + ' <span style="font-size:9px;color:#999;">(' + item.count + ')</span></button>';
    });
    html += '</div></div>';
    container.innerHTML = html;

    // í´ë¦­ í¸ë¤ë¬
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

    const types = ['ì ì²´', 'ì§ë²', 'íì ë'];
    let html = '';
    types.forEach(type => {
      const value = type === 'ì ì²´' ? 'all' : type === 'ì§ë²' ? 'jibun' : 'district';
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
      if (type === 'ì ì²´') {
        counts[type] = window.WS.allListings ? window.WS.allListings.length : 0;
      } else {
        counts[type] = (window.WS.allListings || []).filter(l => (l.type || '') === type).length;
      }
    });

    let html = '';
    TYPES.forEach(type => {
      var isActive = '';
      if (type === 'ì ì²´') {
        isActive = (s.typeTabs.length === 0 && s.typeTab === 'ì ì²´') ? 'ws-tab-active' : '';
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
        if (value === 'ì ì²´') {
          s.typeTabs = [];
          s.typeTab = 'ì ì²´';
        } else {
          var arr = s.typeTabs;
          var idx = arr.indexOf(value);
          if (idx >= 0) { arr.splice(idx, 1); } else { arr.push(value); }
          s.typeTab = arr.length > 0 ? arr[0] : 'ì ì²´';
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

    // ââ 8-Column Grid Layout ââ
    html += '<div class="ws-filter-grid">';

    // Column 1: ê±°ëêµ¬ë¶ (ë³µìì í)
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">ê±°ëêµ¬ë¶</div><div class="ws-filter-col-body">';
    DEALS.forEach(deal => {
      var active = '';
      if (deal === 'ì ì²´') {
        active = (s.deals.length === 0 && s.deal === 'ì ì²´') ? 'ws-fchip-active' : '';
      } else {
        active = s.deals.includes(deal) ? 'ws-fchip-active' : '';
      }
      html += `<button class="ws-fchip ${active}" data-filter="deals" data-value="${deal}">${deal}</button>`;
    });
    html += '</div></div>';

    // Column 2: ë°©ê°¯ì (ë³µìì í)
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">ë°©ê°¯ì</div><div class="ws-filter-col-body">';
    ROOMS.forEach(room => {
      var active = '';
      if (room === 'ì ì²´') {
        active = (s.roomCounts.length === 0 && s.roomCount === 'ì ì²´') ? 'ws-fchip-active' : '';
      } else {
        active = s.roomCounts.includes(room) ? 'ws-fchip-active' : '';
      }
      html += `<button class="ws-fchip ${active}" data-filter="roomCounts" data-value="${room}">${room}</button>`;
    });
    html += '</div></div>';

    // Column 3: ë£¸íí
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">ë£¸íí</div><div class="ws-filter-col-body">';
    SHAPES.forEach(shape => {
      const active = s.roomShape === shape ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="roomShape" data-value="${shape}">${shape}</button>`;
    });
    html += '</div></div>';

    // Column 4: ì¸µêµ¬ë¶
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">ì¸µêµ¬ë¶</div><div class="ws-filter-col-body">';
    FLOORS.forEach(floor => {
      const active = s.floor === floor ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="floor" data-value="${floor}">${floor}</button>`;
    });
    html += '</div></div>';

    // Column 5: ì¤ê³µëë
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">ì¤ê³µëë</div><div class="ws-filter-col-body">';
    YEARS.forEach(year => {
      const active = s.builtYear === year ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="builtYear" data-value="${year}">${year}</button>`;
    });
    html += '</div></div>';

    // Column 6: ê±°ì¤í¬ê¸°
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">ê±°ì¤í¬ê¸°</div><div class="ws-filter-col-body">';
    LIVING_SIZES.forEach(size => {
      const active = s.livingSize === size ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="livingSize" data-value="${size}">${size}</button>`;
    });
    html += '</div></div>';

    // Column 7: ì£¼ì°¨ëì
    html += '<div class="ws-filter-col"><div class="ws-filter-col-header">ì£¼ì°¨ëì</div><div class="ws-filter-col-body">';
    PARKING.forEach(park => {
      const active = s.parking === park ? 'ws-fchip-active' : '';
      html += `<button class="ws-fchip ${active}" data-filter="parking" data-value="${park}">${park}</button>`;
    });
    html += '</div></div>';

    html += '</div>';

    // ââ ì¶ê°íí° Row (horizontal, checkboxes) ââ
    html += '<div class="ws-filter-hrow"><label>ì¶ê°íí°</label><div class="ws-checkbox-group">';
    const checkboxes = [
      { key: 'buildingPhoto', label: 'ê±´ë¬¼ì¬ì§ìì' },
      { key: 'interiorPhoto', label: 'ë´ë¶ì¬ì§ìì' },
      { key: 'video', label: 'ëìììì', noData: true },
      { key: 'shortTerm', label: 'ë¨ê¸°ìë', noData: true },
      { key: 'parkingAvailable', label: 'ì£¼ì°¨ê°ë¥' },
      { key: 'emptyNow', label: 'íì¬ê³µì¤' },
      { key: 'balcony', label: 'ë² ëë¤', noData: true },
      { key: 'noFullOption', label: 'íìµìì ì¸', noData: true },
      { key: 'fullOptionOnly', label: 'íìµìë§ë³´ê¸°', noData: true },
      { key: 'elevator', label: 'E/V' },
      { key: 'priceNego', label: 'ê¸ì¡ë¤ê³ ' },
      { key: 'loanAvailable', label: 'ì ì¸ëì¶ê°ë¥' }
    ];
    checkboxes.forEach(cb => {
      const checked = s.checks[cb.key] ? 'checked' : '';
      const dimStyle = cb.noData ? 'style="opacity:0.5;"' : '';
      html += `<label class="ws-checkbox-label" ${dimStyle}><input type="checkbox" class="ws-filter-checkbox" data-check="${cb.key}" ${checked}> ${cb.label}</label>`;
    });
    html += '</div></div>';

    // (ë°©í¥ íí°: DB ë°ì´í° ë¯¸ìë ¥ ìíë¡ UI ì ê±°ë¨. ë°ì´í° ì¤ë¹ ìë£ ì ë³µì)

    // ââ Price Grid (3 columns per row) ââ
    html += '<div class="ws-price-grid">';

    // Row 1: ê¸°ì¤ê°, ë³´ì¦ê¸, ìì¸
    html += '<div class="ws-price-cell"><label>ê¸°ì¤ê°</label><div class="ws-price-inputs">';
    html += `<input type="number" class="ws-input ws-price-input" placeholder="ìµì" id="ws-min-base-price" value="${s.minBasePrice}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-price-input" placeholder="ìµë" id="ws-max-base-price" value="${s.maxBasePrice}">`;
    html += '<span class="ws-unit-label">ë§ì</span>';
    html += '</div></div>';

    html += '<div class="ws-price-cell"><label>ë³´ì¦ê¸</label><div class="ws-price-inputs">';
    html += `<input type="number" class="ws-input ws-price-input" placeholder="ìµì" id="ws-min-deposit" value="${s.minDeposit}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-price-input" placeholder="ìµë" id="ws-max-deposit" value="${s.maxDeposit}">`;
    html += '<span class="ws-unit-label">ë§ì</span>';
    html += '</div></div>';

    html += '<div class="ws-price-cell"><label>ìì¸ê°</label><div class="ws-price-inputs">';
    html += `<input type="number" class="ws-input ws-price-input" placeholder="ìµì" id="ws-min-monthly" value="${s.minMonthly}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-price-input" placeholder="ìµë" id="ws-max-monthly" value="${s.maxMonthly}">`;
    html += '<span class="ws-unit-label">ë§ì</span>';
    html += `<label class="ws-checkbox-label"><input type="checkbox" id="ws-include-mgmt" ${s.includeMgmt ? 'checked' : ''}> ê´ë¦¬ë¹í¬í¨</label>`;
    html += '</div></div>';

    html += '</div>';

    // Row 2: ë§¤ë§¤ê°, ê³µê¸/ì ì©ë©´ì , ê³µê¸ë©´ì 
    html += '<div class="ws-price-grid">';

    html += '<div class="ws-price-cell"><label>ë§¤ë§¤ê°</label><div class="ws-price-inputs">';
    html += `<input type="number" class="ws-input ws-price-input" placeholder="ìµì" id="ws-min-sale-price" value="${s.minSalePrice}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-price-input" placeholder="ìµë" id="ws-max-sale-price" value="${s.maxSalePrice}">`;
    html += '<span class="ws-unit-label">ë§ì</span>';
    html += '</div></div>';

    html += '<div class="ws-price-cell"><label>ê³µê¸/ì ì©ë©´ì </label><div class="ws-price-inputs">';
    html += `<button class="ws-unit-toggle" id="ws-area-unit-toggle">${s.areaUnit === 'm2' ? 'mÂ²' : 'í'}</button>`;
    html += `<input type="number" class="ws-input ws-area-input" placeholder="ìµì" id="ws-min-area" value="${s.minArea}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-area-input" placeholder="ìµë" id="ws-max-area" value="${s.maxArea}">`;
    html += '</div></div>';

    html += '<div class="ws-price-cell"><label>ê³µê¸ë©´ì </label><div class="ws-price-inputs">';
    html += `<button class="ws-unit-toggle" id="ws-supply-unit-toggle">${s.supplyUnit === 'm2' ? 'mÂ²' : 'í'}</button>`;
    html += `<input type="number" class="ws-input ws-area-input" placeholder="ìµì" id="ws-min-supply" value="${s.minSupply}">`;
    html += `<span>~</span>`;
    html += `<input type="number" class="ws-input ws-area-input" placeholder="ìµë" id="ws-max-supply" value="${s.maxSupply}">`;
    html += '</div></div>';

    html += '</div>';

    // ââ Keyword Row ââ
    html += '<div class="ws-filter-hrow"><label>í¹ì´ì¬í­</label><div class="ws-keyword-input">';
    html += `<input type="text" class="ws-input" placeholder="ê²ì í¤ìë" id="ws-keyword" value="${s.keyword}">`;
    html += '<span class="ws-info-text">ê±´ë¬¼ëª, ì£¼ì, ì¤ëª ë±ìì ê²ìí©ëë¤</span>';
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

        // ë³µìì í íí° (deals, roomCounts)
        if (filter === 'deals') {
          if (value === 'ì ì²´') {
            window.WS.state.deals = [];
            window.WS.state.deal = 'ì ì²´';
          } else {
            var arr = window.WS.state.deals;
            var idx = arr.indexOf(value);
            if (idx >= 0) {
              arr.splice(idx, 1);
            } else {
              arr.push(value);
            }
            window.WS.state.deal = arr.length > 0 ? arr[0] : 'ì ì²´';
          }
          window.WS.renderFilters();
          window.WS.refresh();
          return;
        }

        if (filter === 'roomCounts') {
          if (value === 'ì ì²´') {
            window.WS.state.roomCounts = [];
            window.WS.state.roomCount = 'ì ì²´';
          } else {
            var arr2 = window.WS.state.roomCounts;
            var idx2 = arr2.indexOf(value);
            if (idx2 >= 0) {
              arr2.splice(idx2, 1);
            } else {
              arr2.push(value);
            }
            window.WS.state.roomCount = arr2.length > 0 ? arr2[0] : 'ì ì²´';
          }
          window.WS.renderFilters();
          window.WS.refresh();
          return;
        }

        // ê¸°ì¡´ ë¨ì¼ì í íí°
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
        // ë¨ì ë³í ì ìë ¥ê°ë ìë ë³í
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
        // ë¨ì ë³í ì ìë ¥ê°ë ìë ë³í
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

    // ê°ê²©/ë©´ì  ìë ¥ ëë°ì´ì¤ ì¬ë°ì¸ë© (íí° DOM ì¬ìì± í)
    if (window.WS._bindPriceDebounce) window.WS._bindPriceDebounce();
  }

  /**
   * Render listing cards
   */
  // ============================================================================
  // LISTING CARD RENDERER HELPER
  // ============================================================================
  // ì£¼ì íì: êµ¬ì£¼ì(ì§ë²) ì°ì , "ìì¸ì ê°ë¨êµ¬ ì­ì¼ë 123-4" íì
  function _shortenRegion(r) {
    // ìì¸í¹ë³ì â ìì¸ì, ê²½ê¸°ë â ê²½ê¸°, ì¸ì²ê´ì­ì â ì¸ì²ì ë±
    return r.replace(/í¹ë³ì$/, 'ì').replace(/ê´ì­ì$/, 'ì').replace(/í¹ë³ìì¹ì$/, 'ì').replace(/í¹ë³ìì¹ë$/, '');
  }
  function _getDisplayAddress(listing) {
    var addr = (listing.address || '').trim();
    // ëë¡ëªì£¼ì í¨í´: XXë¡, XXê¸¸
    var isRoadAddr = /\d+[ê°-í£]*ë¡(\s|$)/.test(addr) || /\d+[ê°-í£]*ê¸¸(\s|$)/.test(addr) || /[ê°-í£]+ë¡\s+\d/.test(addr) || /[ê°-í£]+ê¸¸\s+\d/.test(addr);
    if (isRoadAddr && listing.dong) {
      var guMatch = addr.match(/(ìì¸í¹ë³ì|ìì¸|ê²½ê¸°ë|ê²½ê¸°|ì¸ì²ê´ì­ì|ì¸ì²|ë¶ì°ê´ì­ì|ë¶ì°|ëêµ¬ê´ì­ì|ëêµ¬|ëì ê´ì­ì|ëì |ê´ì£¼ê´ì­ì|ê´ì£¼|ì¸ì°ê´ì­ì|ì¸ì°|ì¸ì¢í¹ë³ìì¹ì|ì¸ì¢|ì ì£¼í¹ë³ìì¹ë|ì ì£¼)\s+([ê°-í£]+[êµ¬êµ°ì])/);
      var gu = guMatch ? guMatch[2] : '';
      var region = guMatch ? _shortenRegion(guMatch[1]) : '';
      if (gu && listing.dong) {
        return region + ' ' + gu + ' ' + listing.dong;
      }
      return listing.dong + (addr ? ' (' + addr.split(' ').slice(-2).join(' ') + ')' : '');
    }
    // ì§ë²ì£¼ìë ì ì¤ì¬ì íì
    var shortened = addr
      .replace(/ìì¸í¹ë³ì/g, 'ìì¸ì')
      .replace(/ê²½ê¸°ë/g, 'ê²½ê¸°')
      .replace(/ì¸ì²ê´ì­ì/g, 'ì¸ì²ì')
      .replace(/ë¶ì°ê´ì­ì/g, 'ë¶ì°ì')
      .replace(/ëêµ¬ê´ì­ì/g, 'ëêµ¬ì')
      .replace(/ëì ê´ì­ì/g, 'ëì ì')
      .replace(/ê´ì£¼ê´ì­ì/g, 'ê´ì£¼ì')
      .replace(/ì¸ì°ê´ì­ì/g, 'ì¸ì°ì')
      .replace(/ì¸ì¢í¹ë³ìì¹ì/g, 'ì¸ì¢ì')
      .replace(/ì ì£¼í¹ë³ìì¹ë/g, 'ì ì£¼');
    // ë¹ì ì ì§ë²ë²í¸ ì ê±° (6ìë¦¬ ì´ì ì°ì ì«ìë ì§ë²ì´ ìë)
    shortened = shortened.replace(/\s+\d{6,}$/g, '').trim();
    // "ìì¸ì" ìì´ "ê°ë¨êµ¬"ë¡ ììíë©´ "ìì¸ì" ì¶ê°
    if (/^[ê°-í£]+êµ¬\s/.test(shortened) && !/ì/.test(shortened.split(' ')[0])) {
      shortened = 'ìì¸ì ' + shortened;
    }
    return shortened;
  }

  function _renderListingCard(listing, s) {
    var isFav = s.favorites.some(function(f) { return String(f) === String(listing.id); }) ? 'ws-favorite-active' : '';
    var hideImg = s.hideImages ? 'ws-hide-img' : '';
    var imgs = listing.images || listing.listing_images || [];
    var imageCount = imgs.length || 0;
    var firstImgUrl = imgs.length > 0 ? (imgs[0].url || imgs[0]) : '';
    var areaText = (listing.area_m2 != null && listing.area_m2 > 0) ? listing.area_m2 + 'mÂ² (' + Math.round(listing.area_m2 / 3.30579) + 'í)' : '-';
    var floorText = '';
    if (listing.floor_current) {
      var fc = String(listing.floor_current);
      // floor_currentê° ì´ë¯¸ "2/4ì¸µ" ë± ì¬ëì+ì¸µ í¬í¨ì´ë©´ ê·¸ëë¡ ì¬ì©
      if (fc.indexOf('/') >= 0 || fc.indexOf('ì¸µ') >= 0) {
        floorText = fc.replace(/ì¸µ$/, '') + 'ì¸µ';
      } else {
        floorText = fc + '/' + (listing.floor_total || '?') + 'ì¸µ';
      }
    }

    var isSelected = s.selectedIds.has(String(listing.id));
    return '<div class="ws-listing-card' + (isSelected ? ' ws-card-selected' : '') + '" data-listing-id="' + listing.id + '">' +
      '<input type="checkbox" class="ws-listing-checkbox" data-id="' + listing.id + '" ' + (s.selectedIds.has(String(listing.id)) ? 'checked' : '') + '>' +
      '<div class="ws-listing-image-wrap ' + hideImg + '">' +
        (firstImgUrl ? '<img data-src="' + escHtml(firstImgUrl) + '" alt="' + escHtml(listing.title || '') + '" class="ws-listing-image ws-lazy" style="width:100%;height:100%;object-fit:cover;background:#f0f0f0;" onerror="this.style.display=\'none\';this.nextElementSibling&&(this.nextElementSibling.style.display=\'flex\')"><div style="display:none;width:100%;height:100%;background:#e8e8e8;align-items:center;justify-content:center;color:#aaa;font-size:20px;">ð </div>' : '<div class="ws-listing-image" style="width:100%;height:100%;background:#e8e8e8;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:20px;">ð </div>') +
        (imageCount > 0 ? '<span class="ws-photo-badge">' + imageCount + 'ì¥</span>' : '') +
        '<span class="ws-time-badge">' + timeAgo(listing.created_at) + '</span>' +
        '<button class="ws-favorite-btn ' + isFav + '" data-id="' + listing.id + '">â</button>' +
        '<button class="ws-photo-upload-btn" data-id="' + listing.id + '" title="ì¬ì§ ë±ë¡/ê´ë¦¬">ð·+</button>' +
      '</div>' +
      '<div class="ws-listing-content">' +
        /* ââ ì¢ì¸¡: ë§¤ë¬¼ ì ë³´ (ì£¼ì ìë¨, ì ëª© íë¨) ââ */
        '<div class="ws-card-info">' +
          (function() {
            var addrText = _getDisplayAddress(listing);
            var bn = (listing.building_info && listing.building_info.ê±´ë¬¼ëª || '').trim().replace(/[Â·\-]\s*(ì² ê·¼ì½í¬ë¦¬í¸|ì² ê³¨|ì¡°ì |ëª©êµ¬ì¡°|ê²½ëì² ê³¨|ë²½ì)[ê°-í£]*/g, '').replace(/^\s*[Â·\-]\s*/, '').trim();
            var addrLine = escHtml(addrText);
            if (bn && bn.length > 1) addrLine += ' <span style="color:#888;font-weight:400;">(' + escHtml(bn) + ')</span>';
            var newBadge = (function(){ var c = listing.created_at ? new Date(listing.created_at) : null; return (c && (Date.now() - c.getTime()) < 86400000) ? '<span class="ws-new-badge">NEW</span>' : ''; })();
            // â ì¶ì² ìì´ì½: G=ê³µì¤í´ë½, O=ì¨íì°ì¤
            var sourceBadge = '';
            if (listing.source_site === 'gongsilclub') {
              sourceBadge = '<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;background:#4CAF50;color:#fff;font-size:11px;font-weight:800;margin-right:4px;vertical-align:middle;">G</span>';
            } else if (listing.source_site === 'onhouse') {
              sourceBadge = '<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;background:#FF9800;color:#fff;font-size:11px;font-weight:800;margin-right:4px;vertical-align:middle;">O</span>';
            }
            return '<p class="ws-listing-addr ws-addr-preview" data-listing-id="' + listing.id + '" style="cursor:pointer;" title="í´ë¦­íë©´ íµì¬ì ë³´ ë³´ê¸°">' + sourceBadge + addrLine + newBadge + '</p>';
          })() +
          '<p class="ws-listing-title-sub" data-listing-id="' + listing.id + '" style="cursor:pointer;" title="í´ë¦­íë©´ ìì¸ë³´ê¸°">' +
            escHtml(listing.title || '-') +
          '</p>' +
          '<p class="ws-listing-subtitle">' + escHtml(areaText) + ' | ' + escHtml(listing.type || '-') + '</p>' +
          '<div class="ws-listing-tags">' +
            (floorText ? '<span class="ws-tag-small">' + floorText + '</span>' : '') +
            (listing.rooms ? '<span class="ws-tag-small">' + listing.rooms + 'ê° ë°©</span>' : '') +
            (listing.bathrooms ? '<span class="ws-tag-small">' + listing.bathrooms + 'ê° ìì¤</span>' : '') +
            (listing.direction ? '<span class="ws-tag-small">' + listing.direction + '</span>' : '') +
            (listing.parking ? '<span class="ws-tag-small">ì£¼ì°¨' + (getParkingCount(listing) > 1 ? getParkingCount(listing) : 'ê°ë¥') + '</span>' : '') +
            (listing.elevator ? '<span class="ws-tag-small">EV</span>' : '') +
            (listing.full_option ? '<span class="ws-tag-small">íìµì</span>' : '') +
            (listing.status === 'ê°ì©' ? '<span class="ws-tag-small" style="background:#E8F5E9;color:#2D5A27;font-weight:600">ê³µì¤</span>' : '') +
            (window.WS.state.memos[String(listing.id)] ? '<span class="ws-tag-small" style="background:#FFF3E0;color:#E65100;font-weight:600">ðë©ëª¨</span>' : '') +
            ((window.WS.state.contacts[String(listing.id)] && window.WS.state.contacts[String(listing.id)].length > 0) ? '<span class="ws-tag-small" style="background:#E3F2FD;color:#1565C0;font-weight:600">ð' + window.WS.state.contacts[String(listing.id)].length + '</span>' : '') +
            (listing.heating_type && !/ì½í¬ë¦¬í¸|ì² ê³¨|ì¡°ì |ëª©êµ¬ì¡°|ê²½ë|ë²½ì|êµ¬ì¡°/.test(listing.heating_type) ? '<span class="ws-tag-small">' + escHtml(listing.heating_type) + '</span>' : '') +
          '</div>' +
        '</div>' +
        /* ââ ì°ì¸¡: ê°ê²© + ìí + ìì¸ë³´ê¸° ë²í¼ ââ */
        '<div class="ws-card-right">' +
          '<div class="ws-card-price-block">' +
            '<span class="ws-deal-type">' + escHtml(listing.deal || '-') + '</span>' +
            '<div class="ws-price-main">' + formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal) + '</div>' +
            (listing.maintenance_fee && listing.maintenance_fee > 0 ? '<span class="ws-maintenance">ê´ë¦¬ ' + listing.maintenance_fee + 'ë§</span>' : '<span class="ws-maintenance ws-maint-warn">ê´ë¦¬ë¹ë¯¸ìë ¥</span>') +
          '</div>' +
          '<div class="ws-card-controls">' +
            '<select class="ws-status-select" data-id="' + listing.id + '"' +
              ' style="' + (function(st){ return st === 'ë¹ê³µê°' ? 'color:#6b7280;background:#f3f4f6;border-color:#d1d5db;' : st === 'ê³ì½ì¤' ? 'color:#d97706;background:#fffbeb;border-color:#fbbf24;' : st === 'ê³ì½ìë£' ? 'color:#7c3aed;background:#f5f3ff;border-color:#a78bfa;' : 'color:#16a34a;background:#f0fdf4;border-color:#86efac;'; })(listing.status || 'ê³µê°') + '">' +
              '<option value="ê³µê°"' + ((listing.status || 'ê³µê°') === 'ê³µê°' ? ' selected' : '') + '>ê³µê°</option>' +
              '<option value="ë¹ê³µê°"' + (listing.status === 'ë¹ê³µê°' ? ' selected' : '') + '>ë¹ê³µê°</option>' +
              '<option value="ê³ì½ì¤"' + (listing.status === 'ê³ì½ì¤' ? ' selected' : '') + '>ê³ì½ì¤</option>' +
              '<option value="ê³ì½ìë£"' + (listing.status === 'ê³ì½ìë£' ? ' selected' : '') + '>ìë£</option>' +
            '</select>' +
            '<button class="ws-detail-btn" data-id="' + listing.id + '">ìì¸ë³´ê¸°</button>' +
          '</div>' +
          '<span class="ws-listing-id" style="cursor:pointer;" title="í´ë¦­íë©´ ë³µì¬ë©ëë¤" data-copy="' + listing.id + '">ë§¤ë¬¼ë²í¸ ' + listing.id + '</span>' +
        '</div>' +
      '</div>' +
      /* ââ íë¨ footer: ìì /ì­ì  (í¸ë² ì ë¸ì¶) ââ */
      '<div class="ws-card-footer">' +
        '<button class="ws-edit-btn" data-id="' + listing.id + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> ìì </button>' +
        (window.WS.isSuperAdmin() ? '<button class="ws-delete-btn" data-id="' + listing.id + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> ì­ì </button>' : '') +
      '</div>' +
    '</div>';
  }

  // ============================================================================
  // ADDRESS GROUPING HELPER
  // ============================================================================
  function _getAddressGroupKey(listing) {
    // ìì¬ì§ ê·¸ë£¹í í¤: address íë ì ì²´ (ì§ë²ì£¼ì í¬í¨)
    // ì: "ìì¸í¹ë³ì ê´ìêµ¬ ì ë¦¼ë 246-1" ì ì²´ê° ê·¸ë£¹í í¤
    // ê°ì ê±´ë¬¼(ì§ë²)ì ë¤ë¥¸ í¸ì ë§¤ë¬¼ë¤ì íëë¡ ë¬¶ì
    var addr = (listing.address || '').trim();
    return addr || 'ì£¼ì ë¯¸ì';
  }

  window.WS.renderListings = function() {
    const container = document.getElementById('ws-listings');
    if (!container) return;

    const s = window.WS.state;
    const filtered = window.WS.filtered || [];
    const start = (s.page - 1) * s.perPage;
    const end = start + s.perPage;
    const pageListings = filtered.slice(start, end);

    // ìì¬ì§ë³ ê·¸ë£¹í
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

    // ê·¸ë£¹í ìí ì´ê¸°í (ì²« ë¡ë ì)
    if (!window.WS._groupExpanded) window.WS._groupExpanded = {};

    let html = '';
    groupOrder.forEach(function(groupAddr) {
      var items = groups[groupAddr];
      if (items.length === 1) {
        // ë¨ì¼ ë§¤ë¬¼ì ê·¸ë¥ ë ëë§
        html += _renderListingCard(items[0], s);
      } else {
        // 2ê° ì´ì ë§¤ë¬¼ â ê·¸ë£¹ UI (í¼ì¹¨/ë«í, ì²« ë§¤ë¬¼ì í­ì íì)
        var groupId = 'ws-group-' + groupAddr.replace(/[^ê°-í£a-zA-Z0-9]/g, '_');
        var isExpanded = window.WS._groupExpanded[groupAddr] !== false; // ê¸°ë³¸: í¼ì¹¨
        var arrowIcon = isExpanded ? 'â¼' : 'â¶';
        var displayStyle = isExpanded ? '' : 'display:none;';
        var restCount = items.length - 1;

        html += '<div class="ws-address-group" data-group="' + escHtml(groupAddr) + '">' +
          '<div class="ws-group-header" data-group-key="' + escHtml(groupAddr) + '">' +
            '<span class="ws-group-arrow">' + arrowIcon + '</span>' +
            '<span class="ws-group-title">ð ' + escHtml(groupAddr) + '</span>' +
            '<span class="ws-group-count">' + items.length + 'ê±´</span>' +
          '</div>';

        // ì²« ë²ì§¸ ë§¤ë¬¼ì í­ì íì (ì íë ë³´ì)
        html += _renderListingCard(items[0], s);

        // ëë¨¸ì§ ë§¤ë¬¼ì í¼ì¹¨/ë«í
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
      html = '<div class="ws-no-results">ê²ì ê²°ê³¼ê° ììµëë¤.</div>';
    }

    container.innerHTML = html;

    // ê·¸ë£¹ í¼ì¹¨/ë«í ì´ë²¤í¸ ë°ì¸ë©
    container.querySelectorAll('.ws-group-header').forEach(function(header) {
      header.addEventListener('click', function() {
        var key = this.dataset.groupKey;
        var groupId = 'ws-group-' + key.replace(/[^ê°-í£a-zA-Z0-9]/g, '_');
        var body = document.getElementById(groupId);
        var arrow = this.querySelector('.ws-group-arrow');
        if (!body) return;
        if (body.style.display === 'none') {
          body.style.display = '';
          arrow.textContent = 'â¼';
          window.WS._groupExpanded[key] = true;
        } else {
          body.style.display = 'none';
          arrow.textContent = 'â¶';
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
   * Attach listing event listeners â ì´ë²¤í¸ ìì í¨í´
   * ë§¤ë¬¼ ì¹´ë ì»¨íì´ë(.ws-listings)ì ë¨ì¼ ë¦¬ì¤ëë¥¼ 1íë§ ë±ë¡íê³ ,
   * click/change ì´ë²¤í¸ë¥¼ data-* ìì±ì¼ë¡ ìì ì²ë¦¬í©ëë¤.
   * (ê¸°ì¡´: ë§¤ ë ëë§ë§ë¤ ê° ì¹´ë ììì ê°ë³ ë¦¬ì¤ë ë±ë¡ â ìì­~ìë°± ê°)
   */
  var _listingsDelegated = false;
  function attachListingListeners() {
    // Lazy-load images (IntersectionObserver) â ë§¤ ë ëë§ë§ë¤ ì¬ì¤ì  íì
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

    // ì´ë²¤í¸ ìì: 1íë§ ë±ë¡
    if (_listingsDelegated) return;
    _listingsDelegated = true;

    var listingsContainer = document.querySelector('.ws-listings') || document.querySelector('.ws-search-container');
    if (!listingsContainer) return;

    // helper: data-idë¡ ë§¤ë¬¼ ì°¾ê¸°
    function _findListing(id) {
      return (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
    }

    // âââ click ìì âââ
    listingsContainer.addEventListener('click', function(e) {
      var target = e.target;

      // 1) ë§¤ë¬¼ë²í¸ ë³µì¬
      var copyEl = target.closest('.ws-listing-id, .ws-copy-id');
      if (copyEl) {
        e.preventDefault();
        e.stopPropagation();
        var text = copyEl.dataset.copy || copyEl.textContent.trim();
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast(text + ' ë³µì¬ë¨', 'success');
        });
        return;
      }

      // 2) ì¦ê²¨ì°¾ê¸° ë²í¼
      var favEl = target.closest('.ws-favorite-btn');
      if (favEl) {
        e.preventDefault();
        window.WS.toggleFavorite(favEl.dataset.id);
        window.WS.renderListings();
        return;
      }

      // 3) ìì¸ë³´ê¸° ë²í¼
      var detailEl = target.closest('.ws-detail-btn');
      if (detailEl) {
        e.preventDefault();
        var listing = _findListing(detailEl.dataset.id);
        if (listing) window.WS.showDetail(listing);
        return;
      }

      // 4) ì£¼ì í´ë¦­ â íµíë¦¬ë·°
      var addrEl = target.closest('.ws-addr-preview[data-listing-id]');
      if (addrEl) {
        e.preventDefault();
        e.stopPropagation();
        var listing = _findListing(addrEl.dataset.listingId);
        if (listing) window.WS._showQuickPreview(listing, addrEl);
        return;
      }

      // 5) ì ëª© í´ë¦­ â ìì¸ë³´ê¸°
      var titleEl = target.closest('.ws-listing-title-sub[data-listing-id], .ws-listing-title[data-listing-id]');
      if (titleEl) {
        e.preventDefault();
        var listing = _findListing(titleEl.dataset.listingId);
        if (listing) window.WS.showDetail(listing);
        return;
      }

      // 6) ì¬ì§ ìë¡ë ë²í¼
      var photoEl = target.closest('.ws-photo-upload-btn');
      if (photoEl) {
        e.preventDefault();
        e.stopPropagation();
        var listing = _findListing(photoEl.dataset.id);
        if (listing) window.WS.showPhotoUploadModal(listing);
        return;
      }

      // 7) ìì  ë²í¼
      var editEl = target.closest('.ws-edit-btn');
      if (editEl) {
        e.preventDefault();
        e.stopPropagation();
        var listing = _findListing(editEl.dataset.id);
        if (listing) window.WS._showEditModal(listing);
        return;
      }

      // 8) ì­ì  ë²í¼
      var delEl = target.closest('.ws-delete-btn');
      if (delEl) {
        e.preventDefault();
        e.stopPropagation();
        var listing = _findListing(delEl.dataset.id);
        if (listing) window.WS._deleteListing(listing);
        return;
      }
    });

    // âââ change ìì (ì²´í¬ë°ì¤, ìí ìë í¸) âââ
    listingsContainer.addEventListener('change', function(e) {
      var target = e.target;

      // ì²´í¬ë°ì¤
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

      // ìí ë³ê²½ ëë¡­ë¤ì´
      if (target.classList.contains('ws-status-select')) {
        e.stopPropagation();
        window.WS._changeListingStatus(target.dataset.id, target.value);
        return;
      }
    });
  }

  // =========================================================
  // ì¬ì§ ë±ë¡/ê´ë¦¬ ëª¨ë¬
  // =========================================================
  window.WS.showPhotoUploadModal = function(listing) {
    // ê¸°ì¡´ ëª¨ë¬ ì ê±°
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
        '<h3 style="margin:0;font-size:18px;font-weight:700;color:#333;">ð· ì¬ì§ ë±ë¡</h3>' +
        '<button id="ws-photo-modal-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;padding:0 4px;">â</button>' +
      '</div>' +
      '<div style="margin-bottom:12px;padding:8px 12px;background:#f8f9fa;border-radius:8px;font-size:13px;color:#555;">' +
        '<strong>' + (listing.title || 'ë§¤ë¬¼') + '</strong> (ID: ' + listing.id + ')' +
      '</div>' +
      // ê¸°ì¡´ ì¬ì§ íì
      (imgListHtml ? '<div style="margin-bottom:16px;"><div style="font-size:13px;color:#888;margin-bottom:6px;">íì¬ ì¬ì§ (' + imgs.length + 'ì¥)</div>' + imgListHtml + '</div>' : '') +
      // ìë¡ë ìì­
      '<div id="ws-photo-dropzone" style="border:2px dashed #ccc;border-radius:12px;padding:32px 16px;text-align:center;cursor:pointer;transition:all 0.2s;background:#fafafa;">' +
        '<div style="font-size:36px;margin-bottom:8px;">ð</div>' +
        '<div style="font-size:14px;color:#666;font-weight:600;">í´ë¦­íê±°ë ëëê·¸íì¬ ì¬ì§ ì¶ê°</div>' +
        '<div style="font-size:12px;color:#aaa;margin-top:4px;">JPG, PNG ìµë 20ì¥ (ê° 10MB ì´í)</div>' +
        '<input type="file" id="ws-photo-file-input" multiple accept="image/*" style="display:none;">' +
      '</div>' +
      // ì íë íì¼ ë¯¸ë¦¬ë³´ê¸°
      '<div id="ws-photo-preview" style="margin-top:12px;"></div>' +
      // ìë¡ë ì§í ìí
      '<div id="ws-photo-progress" style="display:none;margin-top:12px;text-align:center;">' +
        '<div style="font-size:14px;color:#2D5A27;font-weight:600;">ìë¡ë ì¤...</div>' +
        '<div id="ws-photo-progress-bar" style="margin-top:8px;height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;">' +
          '<div id="ws-photo-progress-fill" style="width:0%;height:100%;background:#2D5A27;transition:width 0.3s;"></div>' +
        '</div>' +
      '</div>' +
      // ìë¡ë ë²í¼
      '<button id="ws-photo-upload-submit" style="display:none;margin-top:16px;width:100%;padding:12px;background:#2D5A27;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:background 0.2s;">' +
        'ì¬ì§ ë±ë¡íê¸°' +
      '</button>' +
    '</div>';

    document.body.appendChild(modal);

    // ì íë íì¼ ì ì¥ [{file, dataUrl, isMain}]
    var selectedFiles = [];
    var mainIndex = 0; // ì²«ë²ì§¸ê° ê¸°ë³¸ ë©ì¸ì¬ì§
    var dragSrcIdx = null;

    // ë«ê¸°
    document.getElementById('ws-photo-modal-close').addEventListener('click', function() {
      modal.remove();
    });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });

    // ëë¡­ì¡´ í´ë¦­
    var dropzone = document.getElementById('ws-photo-dropzone');
    var fileInput = document.getElementById('ws-photo-file-input');
    dropzone.addEventListener('click', function() { fileInput.click(); });

    // ëëê·¸ ì¤ ëë¡­ (íì¼ ì¶ê°)
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

    // íì¼ ì í
    fileInput.addEventListener('change', function() {
      handleFiles(this.files);
    });

    // ë¯¸ë¦¬ë³´ê¸° ë ëë§ (ììë³ê²½/ë©ì¸ì í ë°ì)
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
          // ìì ë²í¸
          '<div style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;">' + (idx + 1) + '</div>' +
          // ë©ì¸ì¬ì§ íì (ë³)
          '<button class="ws-main-btn" title="ë©ì¸ì¬ì§ ì§ì " style="position:absolute;top:-2px;left:-2px;width:22px;height:22px;border-radius:50%;background:' + (idx === mainIndex ? '#f59e0b' : 'rgba(0,0,0,0.4)') + ';color:#fff;border:none;font-size:12px;cursor:pointer;line-height:22px;padding:0;">â</button>' +
          // ì­ì  ë²í¼
          '<button class="ws-del-btn" style="position:absolute;top:-2px;right:-2px;width:20px;height:20px;border-radius:50%;background:#e53e3e;color:#fff;border:none;font-size:11px;cursor:pointer;line-height:20px;padding:0;">â</button>';

        // ë©ì¸ì¬ì§ í´ë¦­
        thumb.querySelector('.ws-main-btn').addEventListener('click', function(e) {
          e.stopPropagation();
          mainIndex = idx;
          renderPreview();
        });

        // ì­ì  í´ë¦­
        thumb.querySelector('.ws-del-btn').addEventListener('click', function(e) {
          e.stopPropagation();
          selectedFiles.splice(idx, 1);
          if (mainIndex >= selectedFiles.length) mainIndex = Math.max(0, selectedFiles.length - 1);
          if (mainIndex > idx) mainIndex--;
          renderPreview();
          if (selectedFiles.length === 0) submitBtn.style.display = 'none';
        });

        // ëëê·¸ ìì ë³ê²½
        thumb.addEventListener('dragstart', function(e) {
          dragSrcIdx = idx;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', idx);
          thumb.style.opacity = '0.4';
        });
        thumb.addEventListener('dragend', function() {
          thumb.style.opacity = '1';
          dragSrcIdx = null;
          // ëëê·¸ íì´ë¼ì´í¸ ì ê±°
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
          // ìì ë³ê²½
          var moved = selectedFiles.splice(dragSrcIdx, 1)[0];
          selectedFiles.splice(idx, 0, moved);
          // ë©ì¸ ì¸ë±ì¤ ìë°ì´í¸
          if (mainIndex === dragSrcIdx) { mainIndex = idx; }
          else if (dragSrcIdx < mainIndex && idx >= mainIndex) { mainIndex--; }
          else if (dragSrcIdx > mainIndex && idx <= mainIndex) { mainIndex++; }
          dragSrcIdx = null;
          renderPreview();
        });

        previewContainer.appendChild(thumb);
      });

      // ìë´ ë¬¸êµ¬
      if (selectedFiles.length > 0) {
        var hint = document.createElement('div');
        hint.style.cssText = 'font-size:11px;color:#999;margin-top:6px;text-align:center;';
        hint.textContent = 'ëëê·¸ë¡ ìì ë³ê²½ Â· â í´ë¦­ì¼ë¡ ë©ì¸ì¬ì§ ì§ì  (íì¬ ë©ì¸: ' + (mainIndex + 1) + 'ë²)';
        previewContainer.appendChild(hint);
        submitBtn.style.display = 'block';
        submitBtn.textContent = selectedFiles.length + 'ì¥ ì¬ì§ ë±ë¡íê¸°';
      }
    }

    function handleFiles(files) {
      var submitBtn = document.getElementById('ws-photo-upload-submit');
      var added = 0;

      Array.from(files).forEach(function(file) {
        if (!file.type.startsWith('image/')) return;
        if (file.size > 10 * 1024 * 1024) {
          window.WS.showToast(file.name + ': 10MB ì´ê³¼', 'error');
          return;
        }
        if (selectedFiles.length >= 20) {
          window.WS.showToast('ìµë 20ì¥ê¹ì§ ì í ê°ë¥í©ëë¤', 'error');
          return;
        }
        // ëê¸°ì ì¼ë¡ íì¼ ì¶ê° (dataUrlì ë¹ëê¸°ë¡ ë¡ë)
        var item = { file: file, dataUrl: '' };
        selectedFiles.push(item);
        added++;

        var reader = new FileReader();
        reader.onload = function(ev) {
          item.dataUrl = ev.target.result;
          // ëª¨ë  ë¯¸ë¦¬ë³´ê¸° ë¡ë ìë£ëë©´ ë ë
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
        submitBtn.textContent = selectedFiles.length + 'ì¥ ì¬ì§ ë±ë¡íê¸°';
      }
    }

    // ì´ë¯¸ì§ ìì¶ í¨ì: Canvasë¡ ë¦¬ì¬ì´ì¦ + JPEG ìì¶ (Vercel 4.5MB ì í ëì)
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

    // ìë¡ë ì¤í â 3ê° ë³ë ¬ ìë¡ëë¡ ìë ëí­ ê°ì 
    document.getElementById('ws-photo-upload-submit').addEventListener('click', function() {
      var submitBtn = this;
      var progressDiv = document.getElementById('ws-photo-progress');
      var progressFill = document.getElementById('ws-photo-progress-fill');

      if (selectedFiles.length === 0) return;

      submitBtn.disabled = true;
      submitBtn.style.background = '#999';
      submitBtn.textContent = 'ìì¶ ì¤...';
      progressDiv.style.display = 'block';
      progressFill.style.width = '2%';

      // 1ë¨ê³: ëª¨ë  ì´ë¯¸ì§ ëì ìì¶ (1024px, JPEG 70%, ëª©í 2MB ì´í)
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
        var CONCURRENCY = 3; // 3ê° ëì ìë¡ë

        submitBtn.textContent = 'ìë¡ë ì¤... (0/' + totalFiles + ')';
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
                if (r.status === 413) throw new Error('íì¼ í¬ê¸° ì´ê³¼ (413)');
                throw new Error('ìë² ì¤ë¥ (' + r.status + '): ' + (txt || '').substring(0, 200));
              }
              try { return JSON.parse(txt); } catch(e) { throw new Error('ìëµ íì± ì¤í¨'); }
            });
          })
          .then(function(result) {
            if (result.success && result.images) {
              result.images.forEach(function(img) { uploadedImages.push(img); });
              return true;
            }
            throw new Error(result.error || 'ì ì ìë ì¤ë¥');
          })
          .catch(function(err) {
            if (retryNum < MAX_RETRIES) {
              return new Promise(function(res) { setTimeout(res, 500); }).then(function() {
                return uploadOneFile(file, fileIdx, retryNum + 1);
              });
            }
            window.WS.showToast((fileIdx + 1) + 'ë²ì§¸ ì¬ì§ ì¤í¨: ' + err.message, 'error');
            failCount++;
            return false;
          });
        }

        // ë³ë ¬ ìë¡ë í (CONCURRENCYê° ëì)
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
                submitBtn.textContent = 'ìë¡ë ì¤... (' + completedCount + '/' + totalFiles + ')';

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
            window.WS.showToast(uploadedImages.length + 'ì¥ ë±ë¡ ìë£' + (failCount > 0 ? ' (' + failCount + 'ì¥ ì¤í¨)' : ''), failCount > 0 ? 'warning' : 'success');
          } else {
            window.WS.showToast('ì¬ì§ ìë¡ëì ì¤í¨íìµëë¤.', 'error');
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
      html += `<button class="ws-page-btn" data-page="${current - 1}">â</button>`;
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
      html += `<button class="ws-page-btn" data-page="${current + 1}">â¶</button>`;
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
   * Quick Preview Popup â ì£¼ì í´ë¦­ ì íµì¬ì ë³´ë§ ê°ëµí ë³´ì¬ì¤
   */
  window.WS._showQuickPreview = function(listing, anchorEl) {
    // ê¸°ì¡´ íµíë¦¬ë·° ì ê±°
    var existing = document.getElementById('ws-quick-preview');
    if (existing) existing.remove();

    var addrText = _getDisplayAddress(listing);
    var bn = (listing.building_info && listing.building_info.ê±´ë¬¼ëª || '').trim().replace(/[Â·\-]\s*(ì² ê·¼ì½í¬ë¦¬í¸|ì² ê³¨|ì¡°ì |ëª©êµ¬ì¡°|ê²½ëì² ê³¨|ë²½ì)[ê°-í£]*/g, '').replace(/^\s*[Â·\-]\s*/, '').trim();
    var areaM2 = listing.area_m2 ? listing.area_m2 + 'mÂ²(' + Math.round(listing.area_m2 / 3.30579) + 'í)' : '-';
    var floorInfo = '';
    if (listing.floor_current) {
      var fc = String(listing.floor_current);
      floorInfo = (fc.indexOf('/') >= 0 || fc.indexOf('ì¸µ') >= 0) ? fc.replace(/ì¸µ$/, '') + 'ì¸µ' : fc + '/' + (listing.floor_total || '?') + 'ì¸µ';
    }
    var priceText = formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal);
    var dealType = listing.deal || '-';
    var maint = (listing.maintenance_fee && listing.maintenance_fee > 0) ? listing.maintenance_fee + 'ë§' : 'ë¯¸ìë ¥';
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
          '<tr><td>ë©´ì </td><td>' + escHtml(areaM2) + '</td>' +
              '<td>ì¸µì</td><td>' + escHtml(floorInfo || '-') + '</td></tr>' +
          '<tr><td>ê´ë¦¬ë¹</td><td>' + escHtml(maint) + '</td>' +
              '<td>ë°©í¥</td><td>' + escHtml(direction || '-') + '</td></tr>' +
          '<tr><td>ì í</td><td>' + escHtml(listing.type || '-') + '</td>' +
              '<td>ì¤ê³µ</td><td>' + escHtml(builtYear || '-') + '</td></tr>' +
          (listing.rooms || listing.bathrooms ? '<tr><td>ë°©/ìì¤</td><td>' + (listing.rooms || '-') + '/' + (listing.bathrooms || '-') + '</td><td>ì¬ì§</td><td>' + imgs.length + 'ì¥</td></tr>' : '<tr><td>ì¬ì§</td><td colspan="3">' + imgs.length + 'ì¥</td></tr>') +
        '</table>' +
        '<div class="ws-qp-actions">' +
          '<button class="ws-qp-detail-btn" data-id="' + listing.id + '">ìì¸ë³´ê¸°</button>' +
          '<span class="ws-qp-id">ë§¤ë¬¼ë²í¸ ' + listing.id + '</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(popup);

    // ìì¹ ê³ì°: ì¹´ë ì£¼ì ìì íì
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

    // ë«ê¸° ë²í¼
    popup.querySelector('.ws-qp-close').addEventListener('click', function() { popup.remove(); });

    // ìì¸ë³´ê¸° ë²í¼
    popup.querySelector('.ws-qp-detail-btn').addEventListener('click', function() {
      popup.remove();
      window.WS.showDetail(listing);
    });

    // ë°ê¹¥ í´ë¦­ ì ë«ê¸°
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
        <p><span style="display:inline-block;background:#2D5A27;color:#fff;padding:1px 8px;border-radius:4px;font-size:12px;font-weight:700;margin-right:6px;cursor:pointer;" class="ws-copy-id" data-copy="${listing.id}">ë§¤ë¬¼ë²í¸ ${listing.id}</span>${listing.source_site === 'gongsilclub' ? '<span style="display:inline-block;padding:1px 8px;border-radius:4px;background:#4CAF50;color:#fff;font-size:11px;font-weight:700;margin-right:6px;">G ê³µì¤í´ë½</span>' : listing.source_site === 'onhouse' ? '<span style="display:inline-block;padding:1px 8px;border-radius:4px;background:#FF9800;color:#fff;font-size:11px;font-weight:700;margin-right:6px;">O ì¨íì°ì¤</span>' : ''}${escHtml(listing.address || '-')} ${escHtml(listing.dong || '')}</p>
      </div>

      <div class="ws-detail-gallery">
        ${(function() {
          var detailImgs = listing.images || listing.listing_images || [];
          var firstUrl = detailImgs.length > 0 ? (detailImgs[0].url || detailImgs[0]) : '';
          var imgUrls = detailImgs.map(function(img) { return img.url || img; });
          var total = imgUrls.length;
          if (total === 0) {
            return '<div class="ws-gallery-main ws-gallery-empty" id="ws-gallery-main" data-images="[]" data-current="0">' +
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#999;">' +
              '<div style="font-size:32px;">ð </div>' +
              '<div style="font-size:12px;">ë±ë¡ë ì¬ì§ì´ ììµëë¤</div>' +
              '</div></div>';
          }
          return '<div class="ws-gallery-main" id="ws-gallery-main"' +
            ' data-images="' + JSON.stringify(imgUrls).replace(/"/g, '&quot;') + '"' +
            ' data-current="0" title="í´ë¦­íë©´ íëë©ëë¤">' +
              '<img id="ws-gallery-img" src="' + escHtml(firstUrl) + '" alt="ë§¤ë¬¼ ì¬ì§" loading="eager" onerror="this.style.opacity=0.3;this.alt=\'ì´ë¯¸ì§ ë¡ë ì¤í¨\';">' +
              (total > 1 ? '<button type="button" class="ws-gallery-nav ws-gallery-prev" data-dir="-1" aria-label="ì´ì ">â¹</button>' +
                           '<button type="button" class="ws-gallery-nav ws-gallery-next" data-dir="1" aria-label="ë¤ì">âº</button>' : '') +
              '<div class="ws-gallery-counter"><span id="ws-gallery-idx">1</span> / ' + total + '</div>' +
              '<div class="ws-gallery-zoom-hint">ð í´ë¦­íì¬ íë</div>' +
            '</div>' +
            (total > 1 ? '<div class="ws-gallery-thumbs">' +
              detailImgs.map(function(img, idx) {
                var u = img.url || img;
                return '<img src="' + escHtml(u) + '" alt="thumbnail" class="ws-thumb' + (idx === 0 ? ' ws-thumb-active' : '') + '" data-url="' + escHtml(u) + '" data-idx="' + idx + '" loading="lazy">';
              }).join('') +
            '</div>' : '');
        })()}
      </div>

      ${(function() {
        // ì©ëë³ íë ë¶ë¦¬: ì¬ë¬´ì¤/ìê° vs ì£¼ê±°ì©
        var t = (listing.type || '').toLowerCase();
        var isOffice = /ì¬ë¬´|ì¤í¼ì¤|office/.test(t);
        var isStore = /ìê°|ì í¬|ë§¤ì¥|store|shop|ìë¹|ì¹´í|ìì|í¸ìì /.test(t);
        var isCommercial = isOffice || isStore;

        var basicHtml = '<div class="ws-detail-section"><h3>ê¸°ë³¸ì ë³´</h3><div class="ws-detail-grid">';
        basicHtml += '<div><strong>íì</strong> ' + (listing.type || '-') + '</div>';
        basicHtml += '<div><strong>ë©´ì </strong> ' + (formatArea(listing.area_m2) || '-') + (listing.area_supply_m2 ? ' (ê³µê¸ ' + formatArea(listing.area_supply_m2) + ')' : '') + '</div>';
        basicHtml += '<div><strong>ì¸µì</strong> ' + (listing.floor_current || '-') + '</div>';
        if (!isCommercial) {
          // ì£¼ê±°ì©: ë°©/ìì¤, ë°©í¥, êµ¬ì¡°
          basicHtml += '<div><strong>ë°©/ìì¤</strong> ' + (listing.rooms || '-') + 'ê° / ' + (listing.bathrooms || '-') + 'ê°</div>';
          basicHtml += '<div><strong>ë°©í¥</strong> ' + (listing.direction || '-') + '</div>';
          basicHtml += '<div><strong>êµ¬ì¡°</strong> ' + (listing.room_shape || listing.entrance_type || '-') + '</div>';
        } else {
          // ì¬ë¬´ì¤/ìê°: ì ì©ë¥ , ë°©í¥
          if (listing.area_supply_m2 && listing.area_m2) {
            var ratio = Math.round((listing.area_m2 / listing.area_supply_m2) * 100);
            basicHtml += '<div><strong>ì ì©ë¥ </strong> ' + ratio + '%</div>';
          }
          basicHtml += '<div><strong>ë°©í¥</strong> ' + (listing.direction || '-') + '</div>';
          if (isOffice && listing.rooms) {
            basicHtml += '<div><strong>íìì¤/ë£¸</strong> ' + listing.rooms + 'ê°</div>';
          }
          if (isStore) {
            basicHtml += '<div><strong>êµ¬ì¡°</strong> ' + (listing.room_shape || listing.entrance_type || '-') + '</div>';
          }
        }
        basicHtml += '</div></div>';

        // ê°ê²©ì ë³´
        var priceHtml = '<div class="ws-detail-section"><h3>ê°ê²©ì ë³´</h3><div class="ws-detail-grid">';
        priceHtml += '<div><strong>ê±°ëì í</strong> ' + (listing.deal || '-') + '</div>';
        priceHtml += '<div><strong>ê°ê²©</strong> ' + (formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal) || '-') + '</div>';
        // ê´ë¦¬ë¹
        var mf = listing.maintenance_fee;
        var mi = listing.maintenance_includes;
        if (mf && mf > 0) {
          priceHtml += '<div><strong>ê´ë¦¬ë¹</strong> ' + mf + 'ë§ì';
          if (mi) priceHtml += '<div style="font-size:11px;color:#16a34a;margin-top:2px;">â í¬í¨: ' + mi + '</div>';
          priceHtml += '</div>';
        } else {
          priceHtml += '<div><strong>ê´ë¦¬ë¹</strong> <span style="color:#f59e0b;font-style:italic;">ë¯¸ìë ¥</span></div>';
        }
        // ì¬ë¬´ì¤/ìê°: íë¹ ìëë£
        if (isCommercial && listing.area_m2 && listing.monthly) {
          var pyeong = listing.area_m2 / 3.30579;
          var rentPerPy = Math.round(listing.monthly / pyeong);
          priceHtml += '<div><strong>íë¹ ìëë£</strong> ì½ ' + rentPerPy + 'ë§</div>';
        }
        if (!isCommercial) {
          priceHtml += '<div><strong>ì ì¸ëì¶</strong> ' + (listing.loan_available ? 'ê°ë¥' : (listing.deal === 'ì ì¸' ? '<span style="color:#999;font-style:italic;">ë¯¸íì¸</span>' : '-')) + '</div>';
        }
        if (isStore && listing.rights_fee) priceHtml += '<div><strong>ê¶ë¦¬ê¸</strong> ' + listing.rights_fee + 'ë§</div>';
        if (listing.lease_period) priceHtml += '<div><strong>ìëê¸°ê°</strong> ' + listing.lease_period + '</div>';
        if (listing.price_per_pyeong) priceHtml += '<div><strong>íë¹ê°</strong> ' + listing.price_per_pyeong + 'ë§</div>';
        priceHtml += '</div></div>';

        // ìì¤/ìµì
        var facilHtml = '<div class="ws-detail-section"><h3>ìì¤/ìµì</h3><div class="ws-detail-grid">';
        // ê³µíµ: ì£¼ì°¨
        facilHtml += '<div><strong>ì£¼ì°¨</strong> ' + (listing.parking ? (getParkingCount(listing) > 1 ? getParkingCount(listing) + ' ë' : 'ê°ë¥') : (listing.building_info && listing.building_info.ì´ì£¼ì°¨ëì !== undefined ? (parseInt(listing.building_info.ì´ì£¼ì°¨ëì) > 0 ? parseInt(listing.building_info.ì´ì£¼ì°¨ëì) + ' ë <span style="color:#888;font-size:11px;">(ê±´ì¶ë¬¼ëì¥)</span>' : 'ë¶ê°') : '<span style="color:#999;font-style:italic;">ë¯¸íì¸</span>')) + '</div>';
        // ê³µíµ: ìë¦¬ë² ì´í°
        facilHtml += '<div><strong>ìë¦¬ë² ì´í°</strong> ' + (listing.elevator ? 'ìì' : (listing.building_info && listing.building_info.ì¹ì©ìë¦¬ë² ì´í° !== undefined ? (parseInt(listing.building_info.ì¹ì©ìë¦¬ë² ì´í°) > 0 ? parseInt(listing.building_info.ì¹ì©ìë¦¬ë² ì´í°) + ' ë <span style="color:#888;font-size:11px;">(ê±´ì¶ë¬¼ëì¥)</span>' : 'ìì') : '<span style="color:#999;font-style:italic;">ë¯¸íì¸</span>')) + '</div>';
        // ê³µíµ: ëë°©
        facilHtml += '<div><strong>ëë°©</strong> ' + (listing.heating_type || '-') + '</div>';

        if (isCommercial) {
          // ì¬ë¬´ì¤/ìê° ì ì© íë
          facilHtml += '<div><strong>ìì£¼ê°ë¥</strong> ' + (listing.available_date || '-') + '</div>';
          facilHtml += '<div><strong>ì¤ê³µëë</strong> ' + (getBuiltYear(listing.built_year) ? getBuiltYear(listing.built_year) + 'ë' : '-') + '</div>';
          facilHtml += '<div><strong>ë±ë¡ì¼</strong> ' + timeAgo(listing.created_at) + '</div>';
        } else {
          // ì£¼ê±°ì© ì ì© íë
          facilHtml += '<div><strong>ë°ë ¤ëë¬¼</strong> ' + (listing.pet ? 'ê°ë¥' : '<span style="color:#999;font-style:italic;">ë¯¸íì¸</span>') + '</div>';
          facilHtml += '<div><strong>ë² ëë¤</strong> ' + (listing.balcony ? 'ìì' : '<span style="color:#999;font-style:italic;">ë¯¸íì¸</span>') + '</div>';
          facilHtml += '<div><strong>íìµì</strong> ' + (listing.full_option ? 'ì' : '<span style="color:#999;font-style:italic;">ë¯¸íì¸</span>') + '</div>';
          facilHtml += '<div><strong>ìì£¼ê°ë¥</strong> ' + (listing.available_date || '-') + '</div>';
          facilHtml += '<div><strong>ì¤ê³µëë</strong> ' + (getBuiltYear(listing.built_year) ? getBuiltYear(listing.built_year) + 'ë' : '-') + '</div>';
          facilHtml += '<div><strong>ë±ë¡ì¼</strong> ' + timeAgo(listing.created_at) + '</div>';
        }
        facilHtml += '</div></div>';

        return basicHtml + priceHtml + facilHtml;
      })()}

      ${(function() {
        var bi = listing.building_info;
        if (!bi || typeof bi !== 'object') return '';
        var rows = [];
        if (bi.ê±´ë¬¼ëª) rows.push('<div><strong>ê±´ë¬¼ëª</strong> ' + escHtml(bi.ê±´ë¬¼ëª) + '</div>');
        if (bi.ì£¼ì©ë) rows.push('<div><strong>ì©ë</strong> ' + escHtml(bi.ì£¼ì©ë) + '</div>');
        if (bi.ê±´ë¬¼êµ¬ì¡°) rows.push('<div><strong>êµ¬ì¡°</strong> ' + escHtml(bi.ê±´ë¬¼êµ¬ì¡°) + '</div>');
        if (bi.ì¬ì©ì¹ì¸ì¼) rows.push('<div><strong>ì¬ì©ì¹ì¸ì¼</strong> ' + escHtml(String(bi.ì¬ì©ì¹ì¸ì¼).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')) + '</div>');
        if (bi.ì§ìì¸µì) rows.push('<div><strong>ì§ì/ì§í</strong> ' + bi.ì§ìì¸µì + 'ì¸µ/' + (bi.ì§íì¸µì || 0) + 'ì¸µ</div>');
        if (bi.ì¸ëì) rows.push('<div><strong>ì¸ëì</strong> ' + bi.ì¸ëì + 'ì¸ë' + (bi.í¸ì ? ' (' + bi.í¸ì + 'í¸)' : '') + '</div>');
        if (bi.ëì§ë©´ì  && parseFloat(bi.ëì§ë©´ì ) > 0) rows.push('<div><strong>ëì§ë©´ì </strong> ' + parseFloat(bi.ëì§ë©´ì ).toFixed(2) + 'mÂ²</div>');
        if (bi.ì°ë©´ì  && parseFloat(bi.ì°ë©´ì ) > 0) rows.push('<div><strong>ì°ë©´ì </strong> ' + parseFloat(bi.ì°ë©´ì ).toFixed(2) + 'mÂ²</div>');
        if (bi.ê±´ì¶ë©´ì  && parseFloat(bi.ê±´ì¶ë©´ì ) > 0) rows.push('<div><strong>ê±´ì¶ë©´ì </strong> ' + parseFloat(bi.ê±´ì¶ë©´ì ).toFixed(2) + 'mÂ²</div>');
        if (bi.ê±´íì¨ && parseFloat(bi.ê±´íì¨) > 0) rows.push('<div><strong>ê±´íì¨</strong> ' + parseFloat(bi.ê±´íì¨).toFixed(2) + '%</div>');
        if (bi.ì©ì ë¥  && parseFloat(bi.ì©ì ë¥ ) > 0) rows.push('<div><strong>ì©ì ë¥ </strong> ' + parseFloat(bi.ì©ì ë¥ ).toFixed(2) + '%</div>');
        if (bi.ì´ì£¼ì°¨ëì) rows.push('<div><strong>ì´ ì£¼ì°¨</strong> ' + bi.ì´ì£¼ì°¨ëì + 'ë' + (bi.ì¸ëë¹ì£¼ì°¨ëì ? ' (ì¸ëë¹ ' + bi.ì¸ëë¹ì£¼ì°¨ëì + ')' : '') + '</div>');
        var parkingDetail = [];
        if (bi.ì¥ë´ìì£¼ìì£¼ì°¨ && parseInt(bi.ì¥ë´ìì£¼ìì£¼ì°¨) > 0) parkingDetail.push('ì¥ë´ìì£¼ì ' + bi.ì¥ë´ìì£¼ìì£¼ì°¨);
        if (bi.ì¥ë´ê¸°ê³ìì£¼ì°¨ && parseInt(bi.ì¥ë´ê¸°ê³ìì£¼ì°¨) > 0) parkingDetail.push('ì¥ë´ê¸°ê³ì ' + bi.ì¥ë´ê¸°ê³ìì£¼ì°¨);
        if (bi.ì¥ì¸ìì£¼ìì£¼ì°¨ && parseInt(bi.ì¥ì¸ìì£¼ìì£¼ì°¨) > 0) parkingDetail.push('ì¥ì¸ìì£¼ì ' + bi.ì¥ì¸ìì£¼ìì£¼ì°¨);
        if (bi.ì¥ì¸ê¸°ê³ìì£¼ì°¨ && parseInt(bi.ì¥ì¸ê¸°ê³ìì£¼ì°¨) > 0) parkingDetail.push('ì¥ì¸ê¸°ê³ì ' + bi.ì¥ì¸ê¸°ê³ìì£¼ì°¨);
        if (parkingDetail.length > 0) rows.push('<div style="grid-column: span 2;"><strong>ì£¼ì°¨ìì¸</strong> ' + parkingDetail.join(' / ') + '</div>');
        if (bi.ì¹ì©ìë¦¬ë² ì´í°) rows.push('<div><strong>ì¹ì©EV</strong> ' + bi.ì¹ì©ìë¦¬ë² ì´í° + 'ë</div>');
        if (bi.ë¹ìì©ìë¦¬ë² ì´í°) rows.push('<div><strong>ë¹ìEV</strong> ' + bi.ë¹ìì©ìë¦¬ë² ì´í° + 'ë</div>');
        if (bi.íê°ì¼) rows.push('<div><strong>íê°ì¼</strong> ' + escHtml(String(bi.íê°ì¼).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')) + '</div>');
        if (bi.ì§ë¶êµ¬ì¡°) rows.push('<div><strong>ì§ë¶</strong> ' + escHtml(bi.ì§ë¶êµ¬ì¡°) + '</div>');
        if (bi.ëì¥êµ¬ë¶) rows.push('<div><strong>ëì¥êµ¬ë¶</strong> ' + escHtml(bi.ëì¥êµ¬ë¶) + '</div>');
        if (bi.ìë°ê±´ì¶ë¬¼ì¬ë¶) rows.push('<div><strong>ìë°ê±´ì¶ë¬¼</strong> <span style="color:' + (bi.ìë°ê±´ì¶ë¬¼ì¬ë¶ === 'ìì' || bi.ìë°ê±´ì¶ë¬¼ì¬ë¶ === 'N' ? '#2D5A27' : '#D32F2F') + ';font-weight:700;">' + escHtml(bi.ìë°ê±´ì¶ë¬¼ì¬ë¶) + '</span></div>');
        if (rows.length === 0) return '';
        return '<div class="ws-detail-section" style="background:#f0f7ed;border:1px solid #c8e6c9;border-radius:10px;padding:16px;">' +
          '<h3 style="color:#2D5A27;">ðï¸ ê±´ì¶ë¬¼ëì¥</h3>' +
          '<div class="ws-detail-grid" style="grid-template-columns: repeat(3, 1fr);">' + rows.join('') + '</div></div>';
      })()}

      <div class="ws-detail-section">
        <h3 style="display:flex;justify-content:space-between;align-items:center;">ìì¸ì¤ëª
          <button id="ws-ai-generate-${listing.id}" style="padding:6px 14px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;">
            â¨ AI SEO ì¤ëª ìì±
          </button>
        </h3>
        <div id="ws-ai-status-${listing.id}"></div>
        <p id="ws-description-text-${listing.id}" style="white-space:pre-line;font-size:14px;line-height:1.85;color:#333;padding:12px;background:#fafafa;border-radius:8px;">${escHtml(listing.description || 'ì¤ëªì´ ììµëë¤.')}</p>
      </div>

      ${listing.lat && listing.lng ? `
      <div class="ws-detail-section">
        <h3>ð ìì¹ ì ë³´</h3>
        <div id="ws-detail-minimap" style="width:100%;height:250px;border-radius:8px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#999;">
          <span>ðºï¸ ì§ë ë¡ë© ì¤...</span>
        </div>
        <p style="margin-top:6px;font-size:12px;color:#888;">${escHtml(listing.address || '')}</p>
      </div>` : ''}

      <div class="ws-detail-section ws-contacts-section" style="border:2px solid #2D5A27;border-radius:12px;padding:16px;background:#f8fdf6;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="margin:0;color:#2D5A27;display:flex;align-items:center;gap:6px;">ð ê´ê³ì ì°ë½ì² <span style="font-size:11px;color:#888;font-weight:normal;">(ì¤ê°ì¬ ì ì© - ê³ ê° ë¹ê³µê°)</span></h3>
          <button id="ws-contact-add-${listing.id}" style="padding:4px 12px;background:#2D5A27;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">+ ì¶ê°</button>
        </div>
        <div id="ws-contacts-list-${listing.id}" style="display:flex;flex-direction:column;gap:8px;">
          ${(function() {
            var contacts = window.WS.state.contacts[String(listing.id)] || [];
            if (contacts.length === 0) return '<div style="text-align:center;padding:16px;color:#999;font-size:13px;">ë±ë¡ë ì°ë½ì²ê° ììµëë¤.<br><span style="font-size:11px;">ì [+ ì¶ê°] ë²í¼ì¼ë¡ ì¬ì¥, ì¬ëª¨, ê´ë¦¬ì¸ ë±ì ë±ë¡íì¸ì</span></div>';
            return contacts.map(function(c, idx) {
              var roleColors = {
                'ì¬ì¥': '#D32F2F', 'ì¬ëª¨': '#C2185B', 'ê´ë¦¬ì¸': '#1976D2',
                'ê°ì¡±': '#F57C00', 'ìì°¨ì¸': '#388E3C', 'ë§¤ëì': '#7B1FA2',
                'ë§¤ìì': '#0097A7', 'ì¸ìì': '#5D4037', 'ê¸°í': '#616161'
              };
              var color = roleColors[c.role] || '#616161';
              return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-radius:8px;border:1px solid #e0e0e0;box-shadow:0 1px 2px rgba(0,0,0,0.05);">' +
                '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;color:#fff;background:' + color + ';white-space:nowrap;min-width:44px;text-align:center;">' + escHtml(c.role) + '</span>' +
                '<span style="font-size:13px;font-weight:600;color:#333;min-width:50px;">' + escHtml(c.name || '-') + '</span>' +
                '<a href="tel:' + escHtml(c.phone || '') + '" style="font-size:13px;color:#1976D2;text-decoration:none;font-weight:500;">' + escHtml(c.phone || '-') + '</a>' +
                (c.memo ? '<span style="font-size:11px;color:#888;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(c.memo) + '">ð¬ ' + escHtml(c.memo) + '</span>' : '') +
                '<button class="ws-contact-edit-btn" data-listing-id="' + listing.id + '" data-contact-idx="' + idx + '" style="padding:2px 6px;background:none;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:11px;color:#666;" title="ìì ">âï¸</button>' +
                '<button class="ws-contact-del-btn" data-listing-id="' + listing.id + '" data-contact-idx="' + idx + '" style="padding:2px 6px;background:none;border:1px solid #ffcdd2;border-radius:4px;cursor:pointer;font-size:11px;color:#D32F2F;" title="ì­ì ">ð</button>' +
                '</div>';
            }).join('');
          })()}
        </div>
      </div>

      <div class="ws-detail-section">
        <h3>ë©ëª¨</h3>
        <textarea class="ws-memo-input" id="ws-memo-${listing.id}" placeholder="ë§¤ë¬¼ì ëí ë©ëª¨ë¥¼ ìë ¥íì¸ì (ì: ê³ ê° Aë ê´ì¬, ì¤ë´ìí ìí¸)" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:12px;resize:vertical;">${window.WS.state.memos[String(listing.id)] || ''}</textarea>
        <div id="ws-memo-quicktags-${listing.id}"></div>
        <button class="ws-btn ws-btn-primary ws-memo-save-btn" data-listing-id="${listing.id}" style="margin-top:6px;padding:4px 12px;">ë©ëª¨ ì ì¥</button>
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

    // âââ ì´ë²¤í¸ ìì: container ë¨ì¼ ë¦¬ì¤ëë¡ ìì ì´ë²¤í¸ íµí© ì²ë¦¬ âââ
    // (ë§¤ë² showDetail í¸ì¶ ì innerHTML êµì²´ë¡ ê¸°ì¡´ ìì ë¦¬ì¤ëë ìë GCëì§ë§,
    //  ìì í¨í´ì¼ë¡ ë¦¬ì¤ë ìë¥¼ 12â1ë¡ ì¤ì¬ ë©ëª¨ë¦¬Â·ì±ë¥ ìµì í)
    if (!container._detailDelegated) {
      container._detailDelegated = true;
      container.addEventListener('click', function(e) {
        var target = e.target;

        // 1) ì ì¬ë§¤ë¬¼ í´ë¦­
        var similarEl = target.closest('[data-similar-id]');
        if (similarEl) {
          var id = similarEl.getAttribute('data-similar-id');
          var found = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
          if (found) window.WS.showDetail(found);
          return;
        }

        // 2) AI SEO ì¤ëª ìì± ë²í¼
        var aiEl = target.closest('[id^="ws-ai-generate-"]');
        if (aiEl) {
          var aiId = aiEl.id.replace('ws-ai-generate-', '');
          var aiListing = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(aiId); });
          if (aiListing) window.WS._runAutoGenerate(aiListing.id, aiListing);
          return;
        }

        // 3) ê°¤ë¬ë¦¬ ì¸ë¤ì¼ í´ë¦­
        var thumbEl = target.closest('.ws-thumb');
        if (thumbEl) {
          e.stopPropagation();
          var url = thumbEl.dataset.url;
          var idx = parseInt(thumbEl.dataset.idx || '0', 10);
          var mainGallery = document.getElementById('ws-gallery-main');
          var mainImg = document.getElementById('ws-gallery-img');
          if (mainGallery && url) {
            if (mainImg) mainImg.src = url;
            mainGallery.setAttribute('data-current', String(idx));
            var idxLabel = document.getElementById('ws-gallery-idx');
            if (idxLabel) idxLabel.textContent = String(idx + 1);
          }
          container.querySelectorAll('.ws-thumb').forEach(function(t) { t.classList.remove('ws-thumb-active'); });
          thumbEl.classList.add('ws-thumb-active');
          return;
        }

        // 3-1) ê°¤ë¬ë¦¬ ì´ì /ë¤ì íì´í
        var navEl = target.closest('.ws-gallery-nav');
        if (navEl) {
          e.stopPropagation();
          var dir = parseInt(navEl.dataset.dir || '1', 10);
          var mg = document.getElementById('ws-gallery-main');
          if (mg) {
            try {
              var imgs = JSON.parse(mg.getAttribute('data-images') || '[]');
              if (imgs.length > 0) {
                var cur = parseInt(mg.getAttribute('data-current') || '0', 10);
                var nxt = (cur + dir + imgs.length) % imgs.length;
                var gi = document.getElementById('ws-gallery-img');
                if (gi) gi.src = imgs[nxt];
                mg.setAttribute('data-current', String(nxt));
                var il = document.getElementById('ws-gallery-idx');
                if (il) il.textContent = String(nxt + 1);
                container.querySelectorAll('.ws-thumb').forEach(function(t) {
                  if (parseInt(t.dataset.idx, 10) === nxt) t.classList.add('ws-thumb-active');
                  else t.classList.remove('ws-thumb-active');
                });
              }
            } catch(ex) {}
          }
          return;
        }

                // 4) ë§¤ë¬¼ë²í¸ ë³µì¬
        var copyEl = target.closest('.ws-copy-id');
        if (copyEl) {
          e.preventDefault();
          var text = copyEl.dataset.copy || copyEl.textContent.trim();
          navigator.clipboard.writeText(text).then(function() {
            window.WS.showToast(text + ' ë³µì¬ë¨', 'success');
          });
          return;
        }

        // 5) ê°¤ë¬ë¦¬ ë©ì¸ ì´ë¯¸ì§ í´ë¦­ â ë¼ì´í¸ë°ì¤
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

        // 6) ë©ëª¨ ì ì¥ ë²í¼
        var memoBtn = target.closest('.ws-memo-save-btn');
        if (memoBtn) {
          var lid = memoBtn.dataset.listingId;
          var textarea = document.getElementById('ws-memo-' + lid);
          if (textarea) {
            window.WS.state.memos[String(lid)] = textarea.value;
            _safeSetItem('ws-memos', JSON.stringify(window.WS.state.memos));
            showToast('ë©ëª¨ê° ì ì¥ëììµëë¤.');
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

    // ========== ì°ë½ì²(í¸ëª) ê´ë¦¬ ì´ë²¤í¸ í¸ë¤ë¬ ==========
    (function() {
      var lid = String(listing.id);
      var ROLE_PRESETS = ['ì¬ì¥','ì¬ëª¨','ê´ë¦¬ì¸','ê°ì¡±','ìì°¨ì¸','ë§¤ëì','ë§¤ìì','ì¸ìì','ê¸°í'];

      // ì°ë½ì² ì¶ê°/ìì  íì
      function showContactForm(existingContact, editIdx) {
        var isEdit = existingContact != null;
        var c = existingContact || { role: '', name: '', phone: '', memo: '' };
        var backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        backdrop.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:360px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
          '<h4 style="margin:0 0 16px;font-size:16px;color:#2D5A27;">' + (isEdit ? 'âï¸ ì°ë½ì² ìì ' : 'ð ì°ë½ì² ì¶ê°') + '</h4>' +
          '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">í¸ëª (ì­í )</label>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;" id="ws-role-presets"></div>' +
          '<input type="text" id="ws-cf-role" value="' + escHtml(c.role) + '" placeholder="ì§ì  ìë ¥ ëë ììì ì í" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
          '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">ì´ë¦</label>' +
          '<input type="text" id="ws-cf-name" value="' + escHtml(c.name) + '" placeholder="ì: íê¸¸ë" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
          '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">ì íë²í¸</label>' +
          '<input type="tel" id="ws-cf-phone" value="' + escHtml(c.phone) + '" placeholder="010-1234-5678" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
          '<div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">ë©ëª¨ (ì í)</label>' +
          '<input type="text" id="ws-cf-memo" value="' + escHtml(c.memo) + '" placeholder="ì: ì¤í 2ì ì´í íµíê°ë¥, ì£¼ë§ ë¶ê°" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="ws-cf-cancel" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#666;">ì·¨ì</button>' +
          '<button id="ws-cf-save" style="flex:1;padding:10px;border:none;border-radius:8px;background:#2D5A27;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">' + (isEdit ? 'ìì ' : 'ì¶ê°') + '</button>' +
          '</div></div>';
        document.body.appendChild(backdrop);

        // ì­í  íë¦¬ì ë²í¼
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

        // ì·¨ì
        backdrop.querySelector('#ws-cf-cancel').addEventListener('click', function() { backdrop.remove(); });
        backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });

        // ì ì¥
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
          showToast(isEdit ? 'ì°ë½ì²ê° ìì ëììµëë¤.' : 'ì°ë½ì²ê° ì¶ê°ëììµëë¤.');
          // ìì¸ ëª¨ë¬ ìë¡ê³ ì¹¨
          window.WS.showDetail(listing);
        });
      }

      // ì¶ê° ë²í¼
      var addBtn = document.getElementById('ws-contact-add-' + lid);
      if (addBtn) addBtn.addEventListener('click', function() { showContactForm(null, null); });

      // ìì  ë²í¼ë¤
      container.querySelectorAll('.ws-contact-edit-btn').forEach(function(btn) {
        if (btn.dataset.listingId !== lid) return;
        btn.addEventListener('click', function() {
          var idx = parseInt(btn.dataset.contactIdx, 10);
          var contacts = window.WS.state.contacts[lid] || [];
          if (contacts[idx]) showContactForm(contacts[idx], idx);
        });
      });

      // ì­ì  ë²í¼ë¤
      container.querySelectorAll('.ws-contact-del-btn').forEach(function(btn) {
        if (btn.dataset.listingId !== lid) return;
        btn.addEventListener('click', function() {
          var idx = parseInt(btn.dataset.contactIdx, 10);
          if (confirm('ì´ ì°ë½ì²ë¥¼ ì­ì íìê² ìµëê¹?')) {
            var contacts = window.WS.state.contacts[lid] || [];
            contacts.splice(idx, 1);
            window.WS.state.contacts[lid] = contacts;
            _safeSetItem('ws-contacts', JSON.stringify(window.WS.state.contacts));
            showToast('ì°ë½ì²ê° ì­ì ëììµëë¤.');
            window.WS.showDetail(listing);
          }
        });
      });
    })();
    // ========== ì°ë½ì² ê´ë¦¬ ë ==========

    // Mini map for detail view - ì¹´ì¹´ì¤ë§µ ì¤ì  ë ëë§ (MAIN worldë¡ ì ë¬)
    if (listing.lat && listing.lng) {
      // map-main.jsê° ìì§ ë¡ëëì§ ììì¼ë©´ ë¡ë
      if (!window.WS._mapScriptLoaded && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        window.WS._mapScriptLoaded = true;
        var mapScript = document.createElement('script');
        mapScript.id = 'ws-kakao-map-script';
        mapScript.src = chrome.runtime.getURL('map-main.js');
        document.body.appendChild(mapScript);
        // SDK ë¡ë í ë¯¸ëë§µ ë ëë§
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
  window.WS._favCategoryFilter = 'ì ì²´';

  window.WS.showFavorites = function() {
    const modal = document.getElementById('ws-modal-favorites');
    const list = document.getElementById('ws-favorites-list');
    if (!modal || !list) return;

    const favIds = window.WS.state.favorites;
    const favListings = (window.WS.allListings || []).filter(l => favIds.some(f => String(f) === String(l.id)));
    const catStyles = window.WS._categoryStyles || {};
    var activeFilter = window.WS._favCategoryFilter || 'ì ì²´';

    // Count by category
    var catCounts = { 'ì ì²´': favListings.length };
    favListings.forEach(function(l) {
      var cat = window.WS.getFavCategory ? window.WS.getFavCategory(l.id) : '';
      if (cat) { catCounts[cat] = (catCounts[cat] || 0) + 1; }
    });
    var uncategorized = favListings.filter(function(l) { return !window.WS.getFavCategory(l.id); }).length;
    if (uncategorized > 0) catCounts['ë¯¸ë¶ë¥'] = uncategorized;

    // Filter listings
    var filteredFavs = favListings;
    if (activeFilter !== 'ì ì²´') {
      filteredFavs = favListings.filter(function(l) {
        var cat = window.WS.getFavCategory(l.id) || '';
        if (activeFilter === 'ë¯¸ë¶ë¥') return !cat;
        return cat === activeFilter;
      });
    }

    let html = '';

    // Category filter tabs
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #eee;">';
    var tabCats = ['ì ì²´'].concat(Object.keys(catStyles));
    if (catCounts['ë¯¸ë¶ë¥']) tabCats.push('ë¯¸ë¶ë¥');
    tabCats.forEach(function(cat) {
      var count = catCounts[cat] || 0;
      if (cat !== 'ì ì²´' && cat !== 'ë¯¸ë¶ë¥' && !count) return;
      var isActive = activeFilter === cat;
      var style = catStyles[cat];
      var bgColor = isActive ? (style ? style.bg : '#2D5A27') : '#f5f5f5';
      var txtColor = isActive ? (style ? style.color : '#fff') : '#888';
      var icon = style ? style.icon + ' ' : (cat === 'ì ì²´' ? 'ð ' : 'ð ');
      html += '<button data-fav-filter="' + escHtml(cat) + '" style="padding:5px 12px;border:none;border-radius:16px;font-size:11px;cursor:pointer;background:' + bgColor + ';color:' + txtColor + ';font-weight:' + (isActive ? '700' : '400') + ';white-space:nowrap;">' + icon + escHtml(cat) + ' (' + count + ')</button>';
    });
    html += '</div>';

    // Backup/Restore buttons
    html += '<div style="display:flex;gap:6px;margin-bottom:12px;">';
    html += '<button id="ws-fav-export" style="padding:4px 10px;border:1px solid #ddd;border-radius:6px;font-size:10px;background:#fff;cursor:pointer;color:#666;">ð¤ ì¦ê²¨ì°¾ê¸° ë´ë³´ë´ê¸°</button>';
    html += '</div>';

    if (filteredFavs.length === 0) {
      html += '<p style="text-align:center;color:#aaa;padding:30px 0;">í´ë¹ ì¹´íê³ ë¦¬ì ê´ì¬ë§¤ë¬¼ì´ ììµëë¤.</p>';
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
          thumb = '<div style="width:50px;height:50px;background:#eee;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;color:#ccc;">ð </div>';
        }
        html += thumb;

        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-weight:600;font-size:13px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(listing.title || 'ë§¤ë¬¼') + '</div>';
        html += '<div style="font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(listing.address || '') + ' Â· ' + escHtml(listing.type || '') + '</div>';
        html += '<div style="font-size:12px;font-weight:600;color:#e53e3e;">' + escHtml(formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal)) + '</div>';
        html += '</div>';

        // Category badge + picker button
        html += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">';
        if (catStyle) {
          html += '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:' + catStyle.bg + ';color:' + catStyle.color + ';font-weight:600;white-space:nowrap;">' + catStyle.icon + ' ' + escHtml(cat) + '</span>';
        }
        html += '<button data-cat-pick="' + listing.id + '" style="font-size:10px;padding:2px 8px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;color:#888;white-space:nowrap;" title="ì¹´íê³ ë¦¬ ì¤ì ">ð·ï¸</button>';
        html += '</div>';

        html += '<button class="ws-remove-fav" data-id="' + listing.id + '" style="flex-shrink:0;width:28px;height:28px;border:none;background:#fee;border-radius:50%;font-size:12px;cursor:pointer;color:#e53e3e;" title="ì ê±°">â</button>';
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
    if (favListings.length === 0) { window.WS.showToast('ë´ë³´ë¼ ì¦ê²¨ì°¾ê¸°ê° ììµëë¤', 'warning'); return; }

    var lines = ['ð WISHES ì¦ê²¨ì°¾ê¸° ëª©ë¡ (' + new Date().toLocaleDateString('ko-KR') + ')', ''];
    favListings.forEach(function(l, i) {
      var cat = window.WS.getFavCategory(l.id);
      var catStr = cat ? ' [' + cat + ']' : '';
      lines.push((i + 1) + '. ' + (l.title || 'ë§¤ë¬¼') + catStr);
      lines.push('   ð ' + (l.address || '-'));
      lines.push('   ð° ' + formatPrice(l.deposit, l.monthly, l.price, l.deal));
      lines.push('   ð  ' + (l.type || '-') + ' / ' + (l.deal || '-'));
      lines.push('');
    });

    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        window.WS.showToast('ì¦ê²¨ì°¾ê¸° ëª©ë¡ì´ í´ë¦½ë³´ëì ë³µì¬ëììµëë¤', 'success');
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
      showToast('ì íë ë§¤ë¬¼ì´ ììµëë¤.', 'warning');
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
        <title>WISHES ë§¤ë¬¼ ë¸ë¦¬í ìë£</title>
        <style>
          @page {
            size: A4;
            margin: 15mm 12mm 20mm 12mm;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Malgun Gothic', 'ë§ì ê³ ë', Arial, sans-serif;
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
              <div class="subtitle">ìì¸ Â· ê²½ê¸° ì¢í©ë¶ëì° ìë¹ì¤ | ë§¤ë¬¼ ë¸ë¦¬í ìë£</div>
              <div class="meta-info">
                <span>ì´ ${selected.length}ê±´ ì í</span>
                <span>ìì±ì¼ì: ${printDate}</span>
              </div>
            </div>
            <div style="width:80px;"></div>
          </div>
        </div>
    `;

    selected.forEach((listing, idx) => {
      var areaText = formatArea(listing.area_m2) || '-';
      var priceText = formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal);
      var builtText = getBuiltYear(listing.built_year) ? getBuiltYear(listing.built_year) + 'ë' : '-';

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
              ${listing.maintenance_fee ? `<div style="font-size:10px;color:#888;margin-top:2px;">ê´ë¦¬ë¹ ${escHtml(String(listing.maintenance_fee))}ë§</div>` : ''}
            </div>
          </div>
          <div style="font-size:11px;color:#888;margin-bottom:8px;">ð ${escHtml(listing.address || '-')} ${escHtml(listing.dong || '')}</div>
          <div class="info-grid">
            <div><strong>ì í</strong> ${escHtml(listing.type || '-')}</div>
            <div><strong>ë©´ì </strong> ${escHtml(areaText)}</div>
            <div><strong>ì¸µì</strong> ${escHtml(String(listing.floor_current || '-'))}/${escHtml(String(listing.floor_total || '-'))}ì¸µ</div>
            <div><strong>ë°©/ìì¤</strong> ${escHtml(String(listing.rooms || '-'))}ê°/${escHtml(String(listing.bathrooms || '-'))}ê°</div>
            <div><strong>ë°©í¥</strong> ${escHtml(listing.direction || '-')}</div>
            <div><strong>ì¤ê³µ</strong> ${escHtml(builtText)}</div>
          </div>
          <div class="tags">
            ${listing.parking ? '<span class="tag">ð¿ï¸ ì£¼ì°¨ê°ë¥</span>' : (listing.building_info && listing.building_info.ì´ì£¼ì°¨ëì !== undefined ? (parseInt(listing.building_info.ì´ì£¼ì°¨ëì) > 0 ? '<span class="tag">ð¿ï¸ ì£¼ì°¨ ' + parseInt(listing.building_info.ì´ì£¼ì°¨ëì) + 'ë</span>' : '<span class="tag tag-red">ì£¼ì°¨ë¶ê°</span>') : '')}
            ${listing.elevator ? '<span class="tag">ð ìë¦¬ë² ì´í°</span>' : (listing.building_info && listing.building_info.ì¹ì©ìë¦¬ë² ì´í° !== undefined && parseInt(listing.building_info.ì¹ì©ìë¦¬ë² ì´í°) > 0 ? '<span class="tag">ð EV ' + parseInt(listing.building_info.ì¹ì©ìë¦¬ë² ì´í°) + 'ë</span>' : '')}
            ${listing.pet ? '<span class="tag">ð¾ ë°ë ¤ëë¬¼</span>' : ''}
            ${listing.balcony ? '<span class="tag">ð  ë°ì½ë</span>' : ''}
            ${listing.full_option ? '<span class="tag">â¨ íìµì</span>' : ''}
            ${listing.loan_available ? '<span class="tag">ð¦ ëì¶ê°ë¥</span>' : ''}
            ${listing.status === 'ê°ì©' ? '<span class="tag" style="background:#c8e6c9;font-weight:700;">ê³µì¤</span>' : ''}
          </div>
          ${includeNotes && listing.description ? `<div class="desc">ð ${escHtml(listing.description)}</div>` : ''}
          ${window.WS.state.memos[String(listing.id)] ? `<div class="desc" style="color:#E65100;">ð¬ ì¤ê°ì¬ ë©ëª¨: ${escHtml(window.WS.state.memos[String(listing.id)])}</div>` : ''}
        </div>
      `;
    });

    html += `
        <div class="footer">
          <strong>WISHES</strong> | ìì¸ Â· ê²½ê¸° ì¢í©ë¶ëì° ìë¹ì¤<br>
          wishes.co.kr | ë³¸ ìë£ë ì°¸ê³ ì©ì´ë©° ì¤ì  ê³ì½ ì íì¥ íì¸ì´ íìí©ëë¤.
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
      showToast('ì íë ë§¤ë¬¼ì´ ììµëë¤.', 'warning');
      return;
    }

    const selected = (window.WS.allListings || []).filter(l => selectedIds.some(sid => String(sid) === String(l.id)));

    // BOM for Korean encoding in Excel
    let csv = '\uFEFF';
    csv += 'ë²í¸,ì ëª©,ì í,ê±°ëì í,ë³´ì¦ê¸(ë§ì),ìì¸(ë§ì),ë§¤ë§¤ê°(ë§ì),ê´ë¦¬ë¹(ë§ì),ë©´ì (mÂ²),íì,ì¸µ,ì´ì¸µ,ë°©,ìì¤,ë°©í¥,ì£¼ì°¨,ìë¦¬ë² ì´í°,íìµì,ìí,ì£¼ì,ë±ë¡ì¼\n';

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
    a.download = `WISHES_ë§¤ë¬¼_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Setup event listeners for main UI
   */
  function setupEventListeners() {
    // ìì í ì´ë²¤í¸ ë°ì¸ë© í¬í¼
    function _bindById(id, evt, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener(evt, fn);
    }

    // ëë¡­ì ë©ë´ í´ë¦­ í ê¸ (hoverê° ì ëë íê²½ ëì)
    document.querySelectorAll('.ws-dropdown-trigger').forEach(function(trigger) {
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        var parent = this.closest('.ws-bar-dropdown');
        var isOpen = parent.classList.contains('ws-dropdown-open');
        // ë¤ë¥¸ ì´ë¦° ëë¡­ë¤ì´ ë«ê¸°
        document.querySelectorAll('.ws-bar-dropdown.ws-dropdown-open').forEach(function(d) {
          d.classList.remove('ws-dropdown-open');
        });
        if (!isOpen) parent.classList.add('ws-dropdown-open');
      });
    });
    // ëë¡­ë¤ì´ í­ëª© í´ë¦­ ì ë©ë´ ë«ê¸°
    document.querySelectorAll('.ws-dropdown-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var parent = this.closest('.ws-bar-dropdown');
        if (parent) parent.classList.remove('ws-dropdown-open');
      });
    });
    // ë°ê¹¥ í´ë¦­ ì ëë¡­ë¤ì´ ë«ê¸°
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
      this.querySelector('span').textContent = isHidden ? 'â¼ íí° ì ê¸°/í¼ì¹ê¸°' : 'â¶ íí° í¼ì¹ê¸°';
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
        activeRegion: 'ì êµ­',
        selectedRegions: [],
        selectedDongs: [],
        addrType: 'all',
        typeTab: 'ì ì²´',
        typeTabs: [],
        deal: 'ì ì²´',
        deals: [],
        floor: 'ì ì²´',
        roomCount: 'ì ì²´',
        roomCounts: [],
        roomShape: 'ì ì²´',
        builtYear: 'ì ì²´',
        direction: 'ì ì²´',
        parking: 'ì ì²´',
        livingSize: 'ì ì²´',
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
        deal: 'ì ì²´',
        deals: [],
        floor: 'ì ì²´',
        roomCount: 'ì ì²´',
        roomCounts: [],
        roomShape: 'ì ì²´',
        builtYear: 'ì ì²´',
        direction: 'ì ì²´',
        parking: 'ì ì²´',
        livingSize: 'ì ì²´',
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

    // ìì¬ì§ ê·¸ë£¹ ì ì²´ í¼ì¹ê¸°/ë«ê¸° í ê¸
    _safeBtn('ws-group-toggle', function() {
      var bodies = document.querySelectorAll('.ws-group-body');
      if (!bodies.length) return;
      // íëë¼ë ë«íìì¼ë©´ ì ì²´ í¼ì¹ê¸°, ëª¨ë ì´ë ¤ìì¼ë©´ ì ì²´ ë«ê¸°
      var anyHidden = false;
      bodies.forEach(function(b) { if (b.style.display === 'none') anyHidden = true; });
      bodies.forEach(function(b) {
        b.style.display = anyHidden ? '' : 'none';
        var group = b.closest('.ws-address-group');
        var header = group ? group.querySelector('.ws-group-header') : null;
        var arrow = header ? header.querySelector('.ws-group-arrow') : null;
        if (arrow) arrow.textContent = anyHidden ? 'â¼' : 'â¶';
        var key = header ? header.dataset.groupKey : '';
        if (key) window.WS._groupExpanded[key] = anyHidden;
      });
      showToast(anyHidden ? 'ì ì²´ ê·¸ë£¹ í¼ì¹¨' : 'ì ì²´ ê·¸ë£¹ ë«í', 'success');
    });

    // Address search: ì§ë², ê±´ë¬¼ëª, ê±´ë¬¼ID
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
        showToast('ì íë ë§¤ë¬¼ì´ ììµëë¤.', 'warning');
        return;
      }
      selectedIds.forEach(id => {
        if (!window.WS.state.favorites.some(f => String(f) === String(id))) {
          window.WS.state.favorites.push(String(id));
        }
      });
      _safeSetItem('ws-favorites', JSON.stringify(window.WS.state.favorites));
      window.WS.updateFavCount();
      showToast(`${selectedIds.length}ê° ë§¤ë¬¼ì´ ê´ì¬ë§¤ë¬¼ì ì¶ê°ëììµëë¤.`);
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
    if (el) el.textContent = 'ì í: ' + window.WS.state.selectedIds.size + 'ê±´';
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

    // URL íë¼ë¯¸í°ì íí° ìí ì ì¥
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

      // ë³µìì í íí° ì²ë¦¬
      if (filter === 'deals') {
        if (value === 'ì ì²´') {
          if (s.deals.length === 0) chip.classList.add('ws-fchip-active');
          else chip.classList.remove('ws-fchip-active');
        } else {
          if (s.deals.includes(value)) chip.classList.add('ws-fchip-active');
          else chip.classList.remove('ws-fchip-active');
        }
        return;
      }
      if (filter === 'roomCounts') {
        if (value === 'ì ì²´') {
          if (s.roomCounts.length === 0) chip.classList.add('ws-fchip-active');
          else chip.classList.remove('ws-fchip-active');
        } else {
          if (s.roomCounts.includes(value)) chip.classList.add('ws-fchip-active');
          else chip.classList.remove('ws-fchip-active');
        }
        return;
      }

      // ë¨ì¼ì í íí°
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

  // ===== Admin API ê³µíµ ì¤ì  (v2.2.0) =====
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

  // ===== IndexedDB ìºì (v2.2.1 ì¶ê°) - ì¬ë¡ë ì¦ì íì =====
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
      // ì¤ì¼ë í¤ UI: ì¦ì ì¹´ë íí íì â ë¡ë© ëë ì ê±°
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
      container.innerHTML = skeletonCard.repeat(8) + '<div id="ws-load-status" style="text-align:center;padding:8px;font-size:11px;color:#aaa;">ë§¤ë¬¼ ë¡ë ì¤...</div>';
    }

    // ===== Admin API ë¨ì¼ í¸ì¶ ë¡ë© (v2.1.0) =====
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
            console.warn('[WISHES] Admin API í¸ì¶ ì¤í¨ (ì¬ìë ' + (retryCount + 1) + '/' + MAX_RETRIES + ', ' + delay + 'ms í):', err.message);
            return new Promise(function(resolve) {
              setTimeout(function() { resolve(fetchAllListings(retryCount + 1)); }, delay);
            });
          }
          console.error('[WISHES] Admin API í¸ì¶ ìµì¢ ì¤í¨:', err);
          return null;
        });
    }

    function finishLoad(allItems) {
      var elapsed = ((Date.now() - _loadStartTime) / 1000).toFixed(1);
      _wsLog('[WISHES] ì ì²´ ' + allItems.length + 'ê±´ ë¡ë ìë£ (' + elapsed + 'ì´)');
      if (allItems.length > 0) {
        // ====== ìë ì¤ë³µ ë§¤ë¬¼ ì ê±° (AUTO DEDUP) ======
        allItems = window.WS._autoDedup(allItems);
        // ì¤ë³µ ìì¬ ë§¤ë¬¼ ê°ì (ìê²© ì¤ë³µ ì ê±° í ëì¨ ê¸°ì¤ì¼ë¡ 2ì°¨ ê²ì¬)
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
            '<div style="font-size:20px;margin-bottom:8px;">ð</div>' +
            '<div>ë±ë¡ë ë§¤ë¬¼ì´ ìê±°ë ìëµ íìì´ ì¬ë°ë¥´ì§ ììµëë¤.</div></div>';
        }
      }
      window.WS._loadingData = false;
      if (window.WS.loadFilterFromURL) window.WS.loadFilterFromURL();
      window.WS.renderAll();
      window.WS.startAutoRefresh();
    }

    // ===== v2.2.1: IndexedDB ìºì ì°ì  íì =====
    var _cacheShown = false;
    wsCacheGet().then(function(cached) {
      if (cached && cached.data && cached.data.length > 0 && !window.WS.allListings) {
        var cacheAge = Math.round((Date.now() - cached.timestamp) / 1000);
        _wsLog('[WISHES] ð¾ ìºììì ' + cached.data.length + 'ê±´ ì¦ì ë¡ë (' + cacheAge + 'ì´ ì )');
        _cacheShown = true;
        finishLoad(normalizeImages(cached.data));
        window.WS._loadingData = true; // ë°±ê·¸ë¼ì´ë fetchë ê³ì
        var statusEl = document.getElementById('ws-load-status');
        if (statusEl) statusEl.innerHTML = 'â¡ ìºì íìë¨ Â· ìµì  ë°ì´í° ê°±ì  ì¤...';
      }
    });

    // Admin API ë¨ì¼ í¸ì¶ë¡ ì ì²´ ë§¤ë¬¼ ë¡ë
    fetchAllListings().then(function(allItems) {
      if (!allItems) {
        // API í¸ì¶ ì¤í¨ ì í´ë°±
        window.WS._loadingData = false;
        window.WS.allListings = [];
        window.WS.refresh();
        var container = document.getElementById('ws-listings');
        if (container) {
          container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#e53e3e;">' +
            '<div style="font-size:24px;margin-bottom:12px;">â ï¸</div>' +
            '<div>ë§¤ë¬¼ ë°ì´í°ë¥¼ ë¶ë¬ì¤ì§ ëª»íìµëë¤.</div>' +
            '<div style="margin-top:8px;font-size:13px;color:#999;">ë¤í¸ìí¬ ì°ê²°ì íì¸íê³  ë¤ì ìëí´ì£¼ì¸ì.</div>' +
            '<button id="ws-retry-btn" style="margin-top:16px;padding:8px 20px;background:#2D5A27;color:#fff;border:none;border-radius:6px;cursor:pointer;">ë¤ì ìë</button></div>';
          var retryBtn = document.getElementById('ws-retry-btn');
          if (retryBtn) { retryBtn.addEventListener('click', function() { window.WS.loadData(); }); }
        }
        return;
      }
      // v2.2.1: ì±ê³µ ì IndexedDBì ìºì ì ì¥
      wsCacheSet(allItems);
      finishLoad(allItems);
    });
  };

  // ?tab=search íë¦¬íì¹ ìì½ì´ ìì¼ë©´ ì¦ì ì¤í
  if (window.WS._prefetchOnReady) {
    window.WS._prefetchOnReady = false;
    window.WS.loadData();
  }

  // =========================================================
  // G) ì¹´ì¹´ì¤ë§µ ì°ë (Map View) - External file injection to MAIN world
  // =========================================================
  window.WS._mapScriptLoaded = false;

  window.WS.initMap = function() {
    var container = document.getElementById('ws-map-container');
    if (!container) return;

    // Prepare listings data for the MAIN world script
    var listings = window.WS.filtered || [];
    var validListings = listings.filter(function(l) { return l.lat && l.lng; });

    var listingsPayload = JSON.stringify(validListings.map(function(l) {
      // ê´ë¦¬ì íì´ì§ - ì íí ì¢í ì¬ì© (ì¤íì ìì)
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
  // H) AI ë¸ë¦¬í ìì¤í (AI Briefing System) - MOST IMPORTANT
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
          '<div style="font-size:40px;margin-bottom:16px;">ð</div>' +
          '<div style="font-size:16px;font-weight:600;color:#333;margin-bottom:8px;">ë§¤ë¬¼ì ì íí´ì£¼ì¸ì</div>' +
          '<div style="font-size:13px;">ë§¤ë¬¼ ëª©ë¡ìì ì²´í¬ë°ì¤ë¡ ë¸ë¦¬íí  ë§¤ë¬¼ì ì íí í ë¤ì ìëí´ì£¼ì¸ì.</div></div>';
      }
      return;
    }

    var modal = document.getElementById('ws-modal-briefing');
    var container = document.getElementById('ws-briefing-container');
    if (!modal || !container) return;

    modal.style.display = 'flex';
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
      '<div class="ws-loading-spinner"></div>' +
      '<div style="margin-top:16px;color:#2D5A27;font-weight:600;">AI ë¸ë¦¬í ìë£ ìì± ì¤...</div>' +
      '<div style="margin-top:8px;color:#888;font-size:13px;">' + selected.length + 'ê° ë§¤ë¬¼ Claude AI ë¶ì ì¤</div>' +
      '<div style="margin-top:4px;color:#aaa;font-size:11px;">ìµì  AI ëª¨ë¸(Claude Sonnet 4.6)ë¡ ë¶ìí©ëë¤</div></div>';

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
      _wsLog('[WISHES] AI ë¸ë¦¬í API ì¤ë¥: ' + (err.message || err));
      if (container) {
        container.innerHTML = '<div style="padding:24px;text-align:center;color:#e74c3c;">' +
          '<p style="font-size:15px;">â ï¸ AI ë¸ë¦¬í ìì± ì¤ ì¤ë¥ê° ë°ìíìµëë¤.</p>' +
          '<p style="font-size:13px;color:#888;">ì ì í ë¤ì ìëí´ì£¼ì¸ì.</p></div>';
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
      '<h2 style="margin:0;color:#2D5A27;font-size:20px;">WISHES AI ë§¤ë¬¼ ë¸ë¦¬í ìë£</h2>' +
      '<div style="color:#888;font-size:13px;margin-top:4px;">ìì±ì¼: ' + dateStr + ' | ì´ ' + listings.length + 'ê±´ | ð¤ Claude AI (Sonnet 4.6) ë¶ì</div>' +
      '</div>' +
      '<button id="ws-btn-download-briefing" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">ð PDF ë¤ì´ë¡ë</button>' +
      '</div></div>';

    aiBriefings.forEach(function(brief, idx) {
      var listing = listings[idx] || {};
      var mainImage = '';
      var _bImgs = listing.images || listing.listing_images || [];
      if (_bImgs.length > 0) {
        mainImage = _bImgs[0].url || _bImgs[0];
      }

      var priceDisplay = '';
      if (listing.deal === 'ìì¸') {
        priceDisplay = 'ë³´ì¦ê¸ ' + (listing.deposit ? (listing.deposit >= 10000 ? (listing.deposit/10000).toFixed(1) + 'ìµ' : listing.deposit + 'ë§') : '0') + ' / ìì¸ ' + (listing.monthly || 0) + 'ë§ì';
      } else if (listing.deal === 'ì ì¸') {
        priceDisplay = 'ì ì¸ê¸ ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + 'ìµ') : ((listing.deposit || 0) + 'ë§')) + 'ì';
      } else {
        priceDisplay = 'ë§¤ë§¤ê° ' + ((listing.price || 0) >= 10000 ? ((listing.price/10000).toFixed(1) + 'ìµ') : ((listing.price || 0) + 'ë§')) + 'ì';
      }

      html += '<div class="ws-briefing-item" style="page-break-inside:avoid;margin-bottom:24px;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">';

      // Header
      html += '<div style="background:linear-gradient(135deg,#f8faf8,#e8f5e9);padding:16px 20px;border-bottom:1px solid #e8e8e8;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<span style="background:#2D5A27;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">' + (idx+1) + '</span>' +
        '<div>' +
        '<div style="font-weight:700;font-size:16px;color:#333;">' + escHtml(listing.title || listing.type + ' ' + listing.deal) + '</div>' +
        '<div style="color:#666;font-size:13px;margin-top:2px;">ð ' + escHtml(listing.address || '') + '</div>' +
        '</div></div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:18px;font-weight:700;color:#e53e3e;">' + priceDisplay + '</div>' +
        '<div style="font-size:11px;color:#2D5A27;margin-top:2px;">ð¤ AI ë¶ì ìë£</div>' +
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
        (brief.analysis || brief.content || 'ë¶ì ë°ì´í°ë¥¼ ê°ì ¸ì¬ ì ììµëë¤.') +
        '</div>';

      html += '</div></div>';
    });

    html += '<div style="text-align:center;padding:16px;color:#aaa;font-size:12px;border-top:1px solid #e0e0e0;margin-top:8px;">' +
      'WISHES ë¶ëì° | AI ë§¤ë¬¼ ë¸ë¦¬í ìë£ (Claude Sonnet 4.6) | ' + dateStr + ' | ë³¸ ìë£ë AI ë¶ì ì°¸ê³ ì©ì´ë©°, ì¤ì  ê±°ë ì íì¥ íì¸ì´ íìí©ëë¤.' +
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
    var districtType = 'ì¼ë° ì£¼ê±°ì§ì­';
    var premiumDistricts = ['ê°ë¨êµ¬','ìì´êµ¬','ì¡íêµ¬','ë§í¬êµ¬','ì©ì°êµ¬','ì±ëêµ¬','ê´ì§êµ¬','ìë±í¬êµ¬','ì¢ë¡êµ¬'];
    var businessDistricts = ['ì¤êµ¬','ê°ë¨êµ¬','ìë±í¬êµ¬','ìì´êµ¬','ë§í¬êµ¬','ì¢ë¡êµ¬'];

    if (premiumDistricts.indexOf(district) >= 0) districtType = 'íë¦¬ë¯¸ì ì£¼ê±°/ìì ì§ì­';
    if (businessDistricts.indexOf(district) >= 0) districtType = 'íµì¬ ìë¬´/ìì ì§êµ¬';

    // Floor analysis
    var floorCurrent = parseInt(listing.floor_current) || 0;
    var floorTotal = parseInt(listing.floor_total) || 0;
    var floorAnalysis = '';
    if (floorCurrent <= 2) floorAnalysis = 'ì ì¸µ (ì ê·¼ì± ì°ì, ìì/íë¼ì´ë²ì ì£¼ì)';
    else if (floorCurrent <= 5) floorAnalysis = 'ì¤ì ì¸µ (ê· í ì¡í ì¸µì)';
    else if (floorCurrent <= 10) floorAnalysis = 'ì¤ì¸µ (ì±ê´/ì¡°ë§ ìí¸)';
    else if (floorCurrent <= 15) floorAnalysis = 'ì¤ê³ ì¸µ (ì¡°ë§ ì°ì)';
    else floorAnalysis = 'ê³ ì¸µ (íë¦¬ë¯¸ì ì¡°ë§, íê¸° ì ì)';

    // Direction analysis
    var directionScore = 3;
    var directionComment = '';
    var dir = listing.direction || '';
    if (dir.indexOf('ë¨') >= 0 && dir.indexOf('í¥') >= 0) { directionScore = 5; directionComment = 'ìµê³ ì ì±ê´ ì¡°ê±´'; }
    else if (dir === 'ë¨ëí¥' || dir === 'ë¨ìí¥') { directionScore = 4; directionComment = 'ìí¸í ì±ê´ ì¡°ê±´'; }
    else if (dir === 'ëí¥') { directionScore = 3; directionComment = 'ì¤ì  ì±ê´ ìí¸'; }
    else if (dir === 'ìí¥') { directionScore = 2; directionComment = 'ì¤í ìí¥ë¹ ì£¼ì'; }
    else if (dir.indexOf('ë¶') >= 0) { directionScore = 1; directionComment = 'ì±ê´ ë¶ë¦¬, ëë°©ë¹ ê³ ë ¤'; }
    else { directionComment = 'ë°©í¥ ì ë³´ ë¯¸íì¸'; }

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
    if (listing.deal === 'ìì¸') {
      totalPrice = (listing.deposit || 0) + ((listing.monthly || 0) * 12);
      pricePerPy = areaPy > 0 ? Math.round(totalPrice / areaPy) : 0;
    } else if (listing.deal === 'ì ì¸') {
      totalPrice = listing.deposit || 0;
      pricePerPy = areaPy > 0 ? Math.round(totalPrice / areaPy) : 0;
    } else {
      totalPrice = listing.price || 0;
      pricePerPy = areaPy > 0 ? Math.round(totalPrice / areaPy) : 0;
    }

    // Compare with same type listings
    var avgPrice = 0;
    var priceRank = 'ë³´íµ';
    if (sameType.length > 1) {
      var prices = sameType.map(function(l) {
        if (l.deal === 'ìì¸') return (l.deposit || 0) + ((l.monthly || 0) * 12);
        if (l.deal === 'ì ì¸') return l.deposit || 0;
        return l.price || 0;
      }).filter(function(p) { return p > 0; });

      if (prices.length > 0) {
        avgPrice = Math.round(prices.reduce(function(a, b) { return a + b; }, 0) / prices.length);
        var ratio = totalPrice / avgPrice;
        if (ratio < 0.85) priceRank = 'ë§¤ì° ì ë ´ (ìì¸ ëë¹ 15% ì´ì ì ë ´)';
        else if (ratio < 0.95) priceRank = 'ì ë ´ (ìì¸ ëë¹ 5~15% ì ë ´)';
        else if (ratio <= 1.05) priceRank = 'ì ì  (ìì¸ ìì¤)';
        else if (ratio <= 1.15) priceRank = 'ë¤ì ëì (ìì¸ ëë¹ 5~15% ëì)';
        else priceRank = 'ëì í¸ (ìì¸ ëë¹ 15% ì´ì ëì)';
      }
    }

    // Maintenance fee analysis
    var maintFee = listing.maintenance_fee || 0;
    var maintAnalysis = '';
    if (maintFee === 0) maintAnalysis = 'ê´ë¦¬ë¹ ìì (ê°ë³ ë©ë¶ ê°ë¥ì±)';
    else if (maintFee <= 5) maintAnalysis = 'ë§¤ì° ì ë ´í ê´ë¦¬ë¹';
    else if (maintFee <= 10) maintAnalysis = 'ì ì  ê´ë¦¬ë¹ ìì¤';
    else if (maintFee <= 20) maintAnalysis = 'ë¤ì ëì ê´ë¦¬ë¹';
    else maintAnalysis = 'ëì ê´ë¦¬ë¹ (í¬í¨ í­ëª© íì¸ íì)';

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
        if (ageYears <= 3) ageComment = 'ì ì¶ (ìµì  ì¤ë¹, íë¦¬ë¯¸ì ì»¨ëì)';
        else if (ageYears <= 7) ageComment = 'ì¤ì ì¶ (ìí¸í ì»¨ëì)';
        else if (ageYears <= 15) ageComment = 'ì¼ë° (ìí íì¸ ê¶ì¥)';
        else if (ageYears <= 25) ageComment = 'ë¸í (ë¦¬ëª¨ë¸ë§ ì¬ë¶ íì¸)';
        else ageComment = 'êµ¬ì¶ (ë¦¬ëª¨ë¸ë§/ì¬ê±´ì¶ ê°ë¥ì± ê²í )';
      }
    } else {
      ageComment = 'ì¤ê³µëë ì ë³´ ë¯¸íì¸';
    }

    // Amenity scoring
    var amenities = [];
    var amenityScore = 0;
    if (listing.parking) { amenities.push('ì£¼ì°¨ ê°ë¥'); amenityScore += 15; }
    if (listing.elevator) { amenities.push('ìë¦¬ë² ì´í°'); amenityScore += 10; }
    if (listing.pet) { amenities.push('ë°ë ¤ëë¬¼ íì©'); amenityScore += 5; }
    if (listing.balcony) { amenities.push('ë°ì½ë'); amenityScore += 8; }
    if (listing.full_option) { amenities.push('íìµì'); amenityScore += 12; }
    if (listing.loan_available) { amenities.push('ëì¶ ê°ë¥'); amenityScore += 10; }

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
    if (price.priceRank.indexOf('ì ë ´') >= 0) pros.push('ìì¸ ëë¹ í©ë¦¬ì ì¸ ê°ê²©');
    if (location.directionScore >= 4) pros.push('ì°ìí ì±ê´ ì¡°ê±´ (' + (listing.direction || '') + ')');
    if (condition.grade === 'A' || condition.grade === 'B') pros.push('ì°ìí ìì¤ ì»¨ëì (ë±ê¸: ' + condition.grade + ')');
    if (listing.parking) pros.push('ì£¼ì°¨ ê°ë¥');
    if (listing.elevator) pros.push('ìë¦¬ë² ì´í° ë³´ì ');
    if (listing.full_option) pros.push('íìµì (ì¦ì ìì£¼ ê°ë¥)');
    if (listing.loan_available) pros.push('ëì¶ ê°ë¥ (ìê¸ ê³í ì ì°)');
    if (listing.balcony) pros.push('ë°ì½ë ê³µê° íì© ê°ë¥');
    if (location.districtType.indexOf('íë¦¬ë¯¸ì') >= 0) pros.push('íë¦¬ë¯¸ì ìì§');
    if (location.floorCurrent >= 10) pros.push('ê³ ì¸µ ì¡°ë§');

    // Cons
    if (price.priceRank.indexOf('ë') >= 0) cons.push('ìì¸ ëë¹ ë¤ì ëì ê°ê²©ë');
    if (location.directionScore <= 2) cons.push('ì±ê´ ì¡°ê±´ ë¶ë¦¬ (' + (listing.direction || 'íì¸íì') + ')');
    if (condition.ageYears > 20) cons.push('ê±´ë¬¼ ë¸í (' + condition.ageYears + 'ë)');
    if (!listing.parking) cons.push('ì£¼ì°¨ ë¶ê°');
    if (!listing.elevator) cons.push('ìë¦¬ë² ì´í° ë¯¸ë³´ì ');
    if (location.floorCurrent <= 2 && location.floorTotal > 5) cons.push('ì ì¸µ (ìì/íë¼ì´ë²ì ì ì)');
    if ((listing.maintenance_fee || 0) > 15) cons.push('ê´ë¦¬ë¹ ëì í¸ (' + listing.maintenance_fee + 'ë§ì)');

    // If no pros/cons found, add general ones
    if (pros.length === 0) pros.push('ì¶ê° íì¥ íì¸ ê¶ì¥');
    if (cons.length === 0) cons.push('í¹ì´ì¬í­ ìì');

    // Target audience
    var areaPy = (listing.area_m2 || 0) * 0.3025;
    if (listing.type === 'ìë£¸' || listing.type === 'ì¤í¼ì¤í') {
      if (areaPy <= 10) targetAudience.push('1ì¸ ê°êµ¬', 'ì§ì¥ì¸', 'ëíì');
      else targetAudience.push('1ì¸ ê°êµ¬', 'ì í¼ë¶ë¶', 'ì§ì¥ì¸');
    } else if (listing.type === 'í¬ë£¸' || listing.type === 'ì°ë¦¬ë£¸') {
      targetAudience.push('ì í¼ë¶ë¶', 'ìê·ëª¨ ê°ì ', 'ë£¸ë©ì´í¸');
    } else if (listing.type === 'ìíí¸') {
      if (areaPy >= 30) targetAudience.push('ê°ì¡± ë¨ì', 'ì¥ê¸° ê±°ì£¼ì');
      else targetAudience.push('ìê·ëª¨ ê°ì ', 'ì í¼ë¶ë¶');
    } else if (listing.type === 'ì¬ë¬´ì¤') {
      targetAudience.push('ì¤íí¸ì', 'ìê·ëª¨ ì¬ìì', 'íë¦¬ëì');
    } else if (listing.type === 'ìê°') {
      targetAudience.push('ìììì', 'íëì°¨ì´ì¦', 'ìë§¤ì');
    } else {
      targetAudience.push('ì¼ë° ììì');
    }

    // Overall summary
    var summaryParts = [];
    if (listing.type) summaryParts.push(listing.type);
    if (listing.deal) summaryParts.push(listing.deal);
    summaryParts.push('ë§¤ë¬¼ë¡');
    if (pros.length > 0) summaryParts.push(pros[0] + 'ì´(ê°) ê°ì ìëë¤.');
    if (cons.length > 0 && cons[0] !== 'í¹ì´ì¬í­ ìì') summaryParts.push('ë¤ë§ ' + cons[0] + ' ì ì ê³ ë ¤ê° íìí©ëë¤.');

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
      '<h2 style="margin:0;color:#2D5A27;font-size:20px;">WISHES ë§¤ë¬¼ ë¸ë¦¬í ìë£</h2>' +
      '<div style="color:#888;font-size:13px;margin-top:4px;">ìì±ì¼: ' + dateStr + ' | ì´ ' + briefings.length + 'ê±´</div>' +
      '</div>' +
      '<button id="ws-btn-download-briefing" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">ð PDF ë¤ì´ë¡ë</button>' +
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
      if (l.deal === 'ìì¸') {
        priceDisplay = 'ë³´ì¦ê¸ ' + (l.deposit ? (l.deposit >= 10000 ? (l.deposit/10000).toFixed(1) + 'ìµ' : l.deposit + 'ë§') : '0') + ' / ìì¸ ' + (l.monthly || 0) + 'ë§ì';
      } else if (l.deal === 'ì ì¸') {
        priceDisplay = 'ì ì¸ê¸ ' + ((l.deposit || 0) >= 10000 ? ((l.deposit/10000).toFixed(1) + 'ìµ') : ((l.deposit || 0) + 'ë§')) + 'ì';
      } else {
        priceDisplay = 'ë§¤ë§¤ê° ' + ((l.price || 0) >= 10000 ? ((l.price/10000).toFixed(1) + 'ìµ') : ((l.price || 0) + 'ë§')) + 'ì';
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
        '<div style="font-size:12px;color:#888;margin-top:2px;">ê´ë¦¬ë¹ ' + (l.maintenance_fee || 0) + 'ë§ì</div>' +
        '</div></div></div>';

      // Body
      html += '<div style="padding:20px;">';

      // Image + Basic info row
      html += '<div style="display:flex;gap:20px;margin-bottom:20px;">';
      if (mainImage) {
        html += '<div style="width:200px;height:150px;flex-shrink:0;border-radius:8px;overflow:hidden;background:#f0f0f0;">' +
          '<img src="' + escHtml(mainImage) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent=\'ì´ë¯¸ì§ ìì\'">' +
          '</div>';
      }
      html += '<div style="flex:1;">' +
        '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
        '<tr><td style="padding:4px 8px;color:#888;width:80px;">ë§¤ë¬¼ì í</td><td style="padding:4px 8px;font-weight:600;">' + escHtml((l.type || '-') + ' / ' + (l.deal || '-')) + '</td>' +
        '<td style="padding:4px 8px;color:#888;width:80px;">ë©´ì </td><td style="padding:4px 8px;font-weight:600;">' + (l.area_m2 || 0) + 'ã¡ (' + pr.areaPy.toFixed(1) + 'í)</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#888;">ì¸µì</td><td style="padding:4px 8px;font-weight:600;">' + escHtml((l.floor_current || '-') + '/' + (l.floor_total || '-')) + 'ì¸µ</td>' +
        '<td style="padding:4px 8px;color:#888;">ë°©í¥</td><td style="padding:4px 8px;font-weight:600;">' + escHtml(l.direction || '-') + '</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#888;">ë°©/íì¥ì¤</td><td style="padding:4px 8px;font-weight:600;">' + escHtml((l.rooms || '-') + 'ê° / ' + (l.bathrooms || '-')) + 'ê°</td>' +
        '<td style="padding:4px 8px;color:#888;">íë¹ê°</td><td style="padding:4px 8px;font-weight:600;">' + (pr.pricePerPy ? pr.pricePerPy.toLocaleString() + 'ë§ì' : '-') + '</td></tr>' +
        '</table></div></div>';

      // Analysis sections
      // 1. Location Analysis
      html += '<div style="margin-bottom:16px;">' +
        '<div style="font-weight:700;color:#2D5A27;font-size:14px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e8f5e9;">ð ìì§ ë¶ì</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">ì§ì­ ë¶ë¥:</span> <strong>' + loc.districtType + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">ì¸µì ë¶ì:</span> <strong>' + loc.floorAnalysis + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">ì±ê´ ë°©í¥:</span> <strong>' + escHtml(l.direction || '-') + '</strong> (' + escHtml(loc.directionComment) + ')</div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">ì±ê´ ì ì:</span> <strong>' + 'â'.repeat(loc.directionScore) + 'â'.repeat(5 - loc.directionScore) + '</strong></div>' +
        '</div></div>';

      // 2. Price Analysis
      html += '<div style="margin-bottom:16px;">' +
        '<div style="font-weight:700;color:#2D5A27;font-size:14px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e8f5e9;">ð° ê°ê²© ë¶ì</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">ìì¸ íê°:</span> <strong style="color:' + (pr.priceRank.indexOf('ì ë ´') >= 0 ? '#2D5A27' : pr.priceRank.indexOf('ë') >= 0 ? '#e53e3e' : '#333') + ';">' + pr.priceRank + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">ëì¼ ì í:</span> <strong>' + pr.sameTypeCount + 'ê±´</strong> ë¹êµ ë¶ì</div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">ê´ë¦¬ë¹:</span> <strong>' + pr.maintAnalysis + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">íë¹ê°:</span> <strong>' + (pr.pricePerPy ? pr.pricePerPy.toLocaleString() + 'ë§ì/í' : 'ì°ì¶ ë¶ê°') + '</strong></div>' +
        '</div></div>';

      // 3. Condition Analysis
      html += '<div style="margin-bottom:16px;">' +
        '<div style="font-weight:700;color:#2D5A27;font-size:14px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e8f5e9;">ð  ìì¤ ë¶ì</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">ê±´ë¬¼ ì°ì:</span> <strong>' + cond.ageComment + '</strong></div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;"><span style="color:#888;">ìì¤ ë±ê¸:</span> <strong style="color:' + (cond.grade === 'A' ? '#2D5A27' : cond.grade === 'B' ? '#4CAF50' : cond.grade === 'C' ? '#FF9800' : '#e53e3e') + ';font-size:16px;">' + cond.grade + 'ë±ê¸</strong> (' + cond.totalScore + 'ì )</div>' +
        '<div style="background:#f8faf8;padding:8px 12px;border-radius:6px;grid-column:1/-1;"><span style="color:#888;">ë³´ì  ìì¤:</span> <strong>' + (cond.amenities.length > 0 ? cond.amenities.join(' Â· ') : 'ì ë³´ ë¯¸íì¸') + '</strong></div>' +
        '</div></div>';

      // 4. Recommendation
      html += '<div style="margin-bottom:12px;">' +
        '<div style="font-weight:700;color:#2D5A27;font-size:14px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e8f5e9;">â ì¢í© íê°</div>' +
        '<div style="background:#f0f7f0;padding:12px 16px;border-radius:8px;font-size:13px;line-height:1.8;">' +
        '<div style="margin-bottom:8px;font-weight:600;color:#333;">' + rec.summary + '</div>' +
        '<div style="display:flex;gap:16px;">' +
        '<div style="flex:1;">' +
        '<div style="color:#2D5A27;font-weight:700;margin-bottom:4px;">ð ì¥ì </div>' +
        rec.pros.map(function(p) { return '<div style="padding:2px 0;">â¢ ' + p + '</div>'; }).join('') +
        '</div>' +
        '<div style="flex:1;">' +
        '<div style="color:#e53e3e;font-weight:700;margin-bottom:4px;">ð ì£¼ìì¬í­</div>' +
        rec.cons.map(function(c) { return '<div style="padding:2px 0;">â¢ ' + c + '</div>'; }).join('') +
        '</div></div>' +
        '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #d0e8d0;">' +
        '<span style="color:#888;">ì¶ì² ëì:</span> <strong>' + rec.targetAudience.join(', ') + '</strong>' +
        '</div></div></div>';

      html += '</div></div>';
    });

    // Footer
    html += '<div style="text-align:center;padding:16px;color:#aaa;font-size:12px;border-top:1px solid #e0e0e0;margin-top:8px;">' +
      'WISHES ë¶ëì° | AI ë§¤ë¬¼ ë¸ë¦¬í ìë£ | ' + dateStr + ' | ë³¸ ìë£ë ì°¸ê³ ì©ì´ë©°, ì¤ì  ê±°ë ì íì¥ íì¸ì´ íìí©ëë¤.' +
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
    // script íê·¸ ì ê±° (XSS ë°©ì´)
    var sanitizedContent = htmlContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    printWindow.document.write('<!DOCTYPE html><html><head><title>WISHES ë§¤ë¬¼ ë¸ë¦¬í ìë£</title>' +
      '<style>' +
      'body{font-family:"Malgun Gothic","ë§ì ê³ ë",sans-serif;padding:20px;max-width:900px;margin:0 auto;color:#333;font-size:13px;}' +
      'table{border-collapse:collapse;width:100%;}td{padding:4px 8px;}' +
      '.ws-briefing-item{page-break-inside:avoid;margin-bottom:24px;border:1px solid #ddd;border-radius:12px;overflow:hidden;}' +
      '@media print{body{padding:10px;}.ws-briefing-item{break-inside:avoid;}button{display:none!important;}}' +
      '</style></head><body>' + sanitizedContent + '<script>setTimeout(function(){window.print();},500);<\/script></body></html>');
    printWindow.document.close();
  };

  // =========================================================
  // I) ë§¤ë¬¼ ë¹êµ ê¸°ë¥ (Compare Listings)
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
          '<div style="font-size:40px;margin-bottom:16px;">âï¸</div>' +
          '<div style="font-size:16px;font-weight:600;color:#333;margin-bottom:8px;">ë§¤ë¬¼ì 2ê° ì´ì ì íí´ì£¼ì¸ì</div>' +
          '<div style="font-size:13px;">ë§¤ë¬¼ ëª©ë¡ìì ì²´í¬ë°ì¤ë¡ ë¹êµí  ë§¤ë¬¼ì ì íí í ë¤ì ìëí´ì£¼ì¸ì.</div></div>';
      }
      return;
    }

    if (selected.length > 5) {
      selected = selected.slice(0, 5); // ìµë 5ê°ê¹ì§ë§ ë¹êµ
    }

    var modal = document.getElementById('ws-modal-compare');
    var container = document.getElementById('ws-compare-container');
    if (!modal || !container) return;

    modal.style.display = 'flex';

    var rows = [
      { label: 'ë§¤ë¬¼ì í', key: function(l) { return (l.type || '-') + ' / ' + (l.deal || '-'); } },
      { label: 'ê°ê²©', key: function(l) {
        return formatPrice(l.deposit, l.monthly, l.price, l.deal);
      }},
      { label: 'ê´ë¦¬ë¹', key: function(l) { return (l.maintenance_fee || 0) + 'ë§ì'; } },
      { label: 'ë©´ì (ã¡)', key: function(l) { return (l.area_m2 || '-') + 'ã¡'; } },
      { label: 'ë©´ì (í)', key: function(l) { return ((l.area_m2 || 0) * 0.3025).toFixed(1) + 'í'; } },
      { label: 'ì¸µì', key: function(l) { return (l.floor_current || '-') + '/' + (l.floor_total || '-') + 'ì¸µ'; } },
      { label: 'ë°©/íì¥ì¤', key: function(l) { return (l.rooms || '-') + 'ê°/' + (l.bathrooms || '-') + 'ê°'; } },
      { label: 'ë°©í¥', key: function(l) { return l.direction || '-'; } },
      { label: 'ì£¼ì', key: function(l) { return l.address || '-'; } },
      { label: 'ì£¼ì°¨', key: function(l) { return l.parking ? 'â ê°ë¥' : 'â ë¶ê°'; } },
      { label: 'ìë¦¬ë² ì´í°', key: function(l) { return l.elevator ? 'â ìì' : 'â ìì'; } },
      { label: 'ë°ë ¤ëë¬¼', key: function(l) { return l.pet ? 'â ê°ë¥' : 'â ë¶ê°'; } },
      { label: 'ë°ì½ë', key: function(l) { return l.balcony ? 'â ìì' : 'â ìì'; } },
      { label: 'íìµì', key: function(l) { return l.full_option ? 'â' : 'â'; } },
      { label: 'ëì¶', key: function(l) { return l.loan_available ? 'â ê°ë¥' : 'â ë¶ê°'; } },
      { label: 'ì¡°íì', key: function(l) { return (l.views || 0) + 'í'; } },
      { label: 'ë±ë¡ì¼', key: function(l) {
        if (!l.created_at) return '-';
        var d = new Date(l.created_at);
        return (d.getMonth()+1) + '/' + d.getDate();
      }},
      { label: 'ìí', key: function(l) { return l.status || '-'; } }
    ];

    var html = '<div style="overflow-x:auto;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:' + (200 + selected.length * 160) + 'px;">';

    // Header with images
    html += '<thead><tr style="background:#f8faf8;">' +
      '<th style="padding:12px 8px;text-align:left;font-weight:700;color:#2D5A27;border-bottom:2px solid #2D5A27;width:100px;">í­ëª©</th>';
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
  // J) ìë ê°±ì  (Auto-Refresh with New Listing Alerts)
  // =========================================================
  window.WS._autoRefreshTimer = null;
  window.WS._lastListingIds = new Set();

  window.WS.startAutoRefresh = function() {
    if (window.WS._autoRefreshTimer) return;

    // íì¬ ë§¤ë¬¼ IDë¡ ì´ê¸°í (ê¸°ì¡´ Set ë¦¬ì í ìë¡ ì±ì)
    window.WS._lastListingIds = new Set((window.WS.allListings || []).map(function(l) { return l.id; }));

    var _refreshFailCount = 0;
    window.WS._autoRefreshTimer = setInterval(function() {
      // ì°ì ì¤í¨ 5í ì ìë ìë¡ê³ ì¹¨ ì¤ë¨
      if (_refreshFailCount >= 5) {
        console.warn('Auto-refresh: ì°ì 5í ì¤í¨ë¡ ì¤ë¨ë¨');
        window.WS.stopAutoRefresh();
        return;
      }
      // Admin API ë¨ì¼ í¸ì¶ë¡ ì ì²´ ë§¤ë¬¼ ê°ì ¸ì¤ê¸° (v2.1.0)
      var ctrl = new AbortController();
      var tm = setTimeout(function() { ctrl.abort(); }, 30000);
      fetch(ADMIN_API_MINIMAL, {
        signal: ctrl.signal,
        headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN }
      })
        .then(function(r) {
          clearTimeout(tm);
          if (!r.ok) throw new Error('API error: ' + r.status);
          return r.json();
        })
        .then(function(data) {
          var allRefreshItems = [];
          if (data.success && Array.isArray(data.data)) {
            allRefreshItems = normalizeImages(data.data);
          }
          // ì ì²´ ë¡ë ìë£ - ë³ë ê°ì§
          _refreshFailCount = 0;
          if (allRefreshItems.length > 0) {
              var currentIds = new Set(allRefreshItems.map(function(l) { return l.id; }));
              var newListings = allRefreshItems.filter(function(l) {
                return !window.WS._lastListingIds.has(l.id);
              });
              var removedCount = 0;
              window.WS._lastListingIds.forEach(function(id) {
                if (!currentIds.has(id)) removedCount++;
              });
              if (newListings.length > 0 || removedCount > 0) {
                // ìë ì¤ë³µ ì ê±° + ìì¬ ê°ì
                allRefreshItems = window.WS._autoDedup(allRefreshItems, true);
                window.WS._dupWatchdog(allRefreshItems);
                window.WS.allListings = allRefreshItems;
                window.WS._lastListingIds = currentIds;
                if (window.WS.trackChanges) window.WS.trackChanges(allRefreshItems);
                if (window.WS.checkAlerts) window.WS.checkAlerts(allRefreshItems);
                if (window.WS.checkExpiringListings) window.WS.checkExpiringListings();
                if (window.WS.checkCustomerMatches) window.WS.checkCustomerMatches();
                window.WS.refresh();
                if (newListings.length > 0) {
                  window.WS._showNewListingBadge(newListings.length);
                }
              }
            }
          })
          .catch(function() {
            clearTimeout(tm);
            _refreshFailCount++;
            // ë¤í¸ìí¬ ì¤ë¥ ë¬´ì (5í ì°ì ì¤í¨ ì ìë ì¤ë¨)
          });
    }, 5 * 60 * 1000); // 5 minutes
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
    badge.innerHTML = 'ð ì ë§¤ë¬¼ ' + count + 'ê±´ì´ ë±ë¡ëììµëë¤!';
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
  // K) LIGHTBOX - ì´ë¯¸ì§ íì¤í¬ë¦° íë ë·°ì´
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
  // L) URL íë¼ë¯¸í° ëê¸°í - íí° ìíë¥¼ URLì ì ì¥/ë³µì
  // =========================================================
  window.WS.saveFilterToURL = function() {
    var s = window.WS.state;
    var params = new URLSearchParams();

    // tab=search íë¼ë¯¸í° í­ì ë³´ì¡´ (ê²ì UI íì± ìí ì ì§)
    var currentParams = new URLSearchParams(window.location.search);
    if (currentParams.has('tab')) params.set('tab', currentParams.get('tab'));

    if (s.typeTabs && s.typeTabs.length > 0) params.set('types', s.typeTabs.join(','));
    else if (s.typeTab && s.typeTab !== 'ì ì²´') params.set('type', s.typeTab);
    if (s.selectedRegion && s.selectedRegion !== 'ì êµ­') params.set('region', s.selectedRegion);
    if (s.selectedRegions && s.selectedRegions.length > 0) params.set('districts', s.selectedRegions.join(','));
    if (s.selectedDongs && s.selectedDongs.length > 0) params.set('dongs', s.selectedDongs.join('|'));
    if (s.deals && s.deals.length > 0) params.set('deals', s.deals.join(','));
    if (s.roomCounts && s.roomCounts.length > 0) params.set('rooms', s.roomCounts.join(','));
    if (s.buildingShapes && s.buildingShapes.length > 0) params.set('shapes', s.buildingShapes.join(','));
    if (s.entranceTypes && s.entranceTypes.length > 0) params.set('entrance', s.entranceTypes.join(','));
    if (s.builtAfter) params.set('builtAfter', s.builtAfter);
    if (s.direction && s.direction !== 'ì ì²´') params.set('dir', s.direction);
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

  // ========== Section M-1: ë§¤ë¬¼ íµê³ ëìë³´ë ==========

  window.WS.showStats = function() {
    var data = window.WS.filtered || [];
    if (data.length === 0) {
      window.WS.showToast('íìí  ë§¤ë¬¼ì´ ììµëë¤.', 'warning');
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
      var t = l.type || 'ê¸°í';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    // Deal type distribution
    var dealCounts = {};
    data.forEach(function(l) {
      var d = l.deal || 'ê¸°í';
      dealCounts[d] = (dealCounts[d] || 0) + 1;
    });

    // Region distribution (top 5)
    var regionCounts = {};
    data.forEach(function(l) {
      var addr = l.address || '';
      var parts = addr.split(' ');
      var region = parts.length >= 2 ? parts[0] + ' ' + parts[1] : (parts[0] || 'ê¸°í');
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
          '<div style="width:50px;font-size:11px;color:#888;">' + item[1] + 'ê±´ (' + pct + '%)</div>' +
          '</div>';
      });
      return html;
    }

    var html = '<div style="padding:8px;">';

    // Summary cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px;">';
    html += statCard('ð ', 'ì ì²´ ë§¤ë¬¼', data.length + 'ê±´', '');
    if (deposits.length > 0) html += statCard('ð°', 'íê·  ë³´ì¦ê¸', avg(deposits).toLocaleString() + 'ë§', min(deposits).toLocaleString() + '~' + max(deposits).toLocaleString() + 'ë§');
    if (monthlies.length > 0) html += statCard('ð', 'íê·  ìì¸', avg(monthlies).toLocaleString() + 'ë§', min(monthlies).toLocaleString() + '~' + max(monthlies).toLocaleString() + 'ë§');
    if (prices.length > 0) html += statCard('ð·ï¸', 'íê·  ë§¤ë§¤ê°', avg(prices).toLocaleString() + 'ë§', min(prices).toLocaleString() + '~' + max(prices).toLocaleString() + 'ë§');
    if (areas.length > 0) html += statCard('ð', 'íê·  ë©´ì ', avg(areas) + 'mÂ²', (avg(areas) / 3.30579).toFixed(1) + 'í');
    html += '</div>';

    // Type distribution chart
    var typeItems = Object.entries(typeCounts).sort(function(a, b) { return b[1] - a[1]; });
    html += '<div style="margin-bottom:20px;">';
    html += '<h3 style="font-size:14px;color:#333;margin-bottom:10px;">ð ë§¤ë¬¼ ì íë³ ë¶í¬</h3>';
    html += barChart(typeItems, data.length, '#4CAF50');
    html += '</div>';

    // Deal type chart
    var dealItems = Object.entries(dealCounts).sort(function(a, b) { return b[1] - a[1]; });
    html += '<div style="margin-bottom:20px;">';
    html += '<h3 style="font-size:14px;color:#333;margin-bottom:10px;">ð¼ ê±°ë ì íë³ ë¶í¬</h3>';
    html += barChart(dealItems, data.length, '#2D5A27');
    html += '</div>';

    // Top regions
    if (topRegions.length > 0) {
      html += '<div style="margin-bottom:20px;">';
      html += '<h3 style="font-size:14px;color:#333;margin-bottom:10px;">ð ì§ì­ë³ ë¶í¬ (TOP 5)</h3>';
      html += barChart(topRegions, data.length, '#FF9800');
      html += '</div>';
    }

    // Price range table
    if (deposits.length > 0) {
      html += '<div style="margin-bottom:12px;">';
      html += '<h3 style="font-size:14px;color:#333;margin-bottom:10px;">ð ë³´ì¦ê¸ ë¶í¬ ìì¸</h3>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<tr style="background:#2D5A27;color:#fff;"><td style="padding:6px 10px;">êµ¬ë¶</td><td style="padding:6px 10px;">ìµì</td><td style="padding:6px 10px;">ìµë</td><td style="padding:6px 10px;">íê· </td><td style="padding:6px 10px;">ì¤ìê°</td></tr>';
      html += '<tr style="background:#f8f9fa;"><td style="padding:6px 10px;">ë³´ì¦ê¸</td><td style="padding:6px 10px;">' + min(deposits).toLocaleString() + 'ë§</td><td style="padding:6px 10px;">' + max(deposits).toLocaleString() + 'ë§</td><td style="padding:6px 10px;">' + avg(deposits).toLocaleString() + 'ë§</td><td style="padding:6px 10px;">' + median(deposits).toLocaleString() + 'ë§</td></tr>';
      if (monthlies.length > 0) html += '<tr><td style="padding:6px 10px;">ìì¸</td><td style="padding:6px 10px;">' + min(monthlies).toLocaleString() + 'ë§</td><td style="padding:6px 10px;">' + max(monthlies).toLocaleString() + 'ë§</td><td style="padding:6px 10px;">' + avg(monthlies).toLocaleString() + 'ë§</td><td style="padding:6px 10px;">' + median(monthlies).toLocaleString() + 'ë§</td></tr>';
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
        '<h2 style="color:#2D5A27;margin-bottom:16px;">ð ë§¤ë¬¼ íµê³ ëìë³´ë</h2>' +
        '<div id="ws-stats-container"></div>' +
        '</div>';
      (document.querySelector('.ws-search-container') || document.body).appendChild(modal);
      modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.style.display = 'none'; });
      modal.addEventListener('click', function(e) { if (e.target === modal) modal.style.display = 'none'; });
    }
    document.getElementById('ws-stats-container').innerHTML = html;
    modal.style.display = 'flex';
  };

  // ========== Section M-2: ì¹´ì¹´ì¤í¡ ê³µì ì© íì¤í¸ ìì± ==========

  window.WS.generateShareText = function() {
    var selectedIds = Array.from(window.WS.state.selectedIds || []);
    if (selectedIds.length === 0) {
      window.WS.showToast('ê³µì í  ë§¤ë¬¼ì ì íí´ì£¼ì¸ì.', 'warning');
      return;
    }

    var allData = window.WS.allListings || [];
    var selected = [];
    selectedIds.forEach(function(id) {
      var found = allData.find(function(l) { return String(l.id) === String(id); });
      if (found) selected.push(found);
    });

    if (selected.length === 0) return;

    var text = 'ð  WISHES ë§¤ë¬¼ ìë´\n';
    text += 'ââââââââââââââ\n\n';

    selected.forEach(function(l, i) {
      text += 'ð ' + (i + 1) + '. ' + (l.title || '-') + '\n';
      // Price info
      if (l.deal === 'ìì¸' || l.monthly) {
        text += 'ð° ' + (l.deposit || 0) + '/' + (l.monthly || 0) + 'ë§ì (ìì¸)\n';
      } else if (l.deal === 'ì ì¸') {
        text += 'ð° ì ì¸ ' + (l.deposit || 0) + 'ë§ì\n';
      } else if (l.price) {
        text += 'ð° ë§¤ë§¤ ' + (Number(l.price) >= 10000 ? (l.price / 10000).toFixed(1) + 'ìµ' : l.price + 'ë§') + 'ì\n';
      }
      // Area
      if (l.area_m2) text += 'ð ' + l.area_m2 + 'mÂ² (' + (l.area_m2 / 3.30579).toFixed(1) + 'í)\n';
      // Floor
      if (l.floor_current) text += 'ð¢ ' + l.floor_current + '/' + (l.floor_total || '?') + 'ì¸µ\n';
      // Rooms
      if (l.rooms) text += 'ðª ' + l.rooms + 'ë°© ' + (l.bathrooms || '') + 'ìì¤\n';
      // Address
      if (l.address) text += 'ð ' + l.address + '\n';
      // Options
      var opts = [];
      if (l.parking && l.parking !== '0') opts.push('ì£¼ì°¨');
      if (l.elevator) opts.push('EV');
      if (l.full_option) opts.push('íìµì');
      if (l.balcony) opts.push('ë°ì½ë');
      if (opts.length > 0) text += 'â ' + opts.join(' Â· ') + '\n';
      text += '\n';
    });

    text += 'ââââââââââââââ\n';
    text += 'ð¿ WISHES ë¶ëì° | wishes.co.kr\n';
    text += 'ð ìë´ ë° ë¬¸ì íìí©ëë¤';

    // Copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        window.WS.showToast('ì¹´ì¹´ì¤í¡ ê³µì  íì¤í¸ê° ë³µì¬ëììµëë¤! ð¬', 'success');
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
      window.WS.showToast('ì¹´ì¹´ì¤í¡ ê³µì  íì¤í¸ê° ë³µì¬ëììµëë¤! ð¬', 'success');
    } catch(e) {
      window.WS.showToast('ë³µì¬ì ì¤í¨íìµëë¤. ì§ì  ë³µì¬í´ì£¼ì¸ì.', 'warning');
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
      typeTab: s.typeTab || 'ì ì²´',
      typeTabs: (s.typeTabs || []).slice(),
      selectedRegion: s.selectedRegion || 'ì êµ­',
      selectedRegions: (s.selectedRegions || []).slice(),
      selectedDongs: (s.selectedDongs || []).slice(),
      deals: (s.deals || []).slice(),
      roomCounts: (s.roomCounts || []).slice(),
      buildingShapes: (s.buildingShapes || []).slice(),
      entranceTypes: (s.entranceTypes || []).slice(),
      builtAfter: s.builtAfter || '',
      direction: s.direction || 'ì ì²´',
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
    else if (snap.typeTab && snap.typeTab !== 'ì ì²´') parts.push(snap.typeTab);
    if (snap.selectedRegion && snap.selectedRegion !== 'ì êµ­') parts.push(snap.selectedRegion);
    if (snap.selectedRegions && snap.selectedRegions.length > 0) parts.push(snap.selectedRegions.join('/'));
    if (snap.deals && snap.deals.length > 0) parts.push(snap.deals.join('/'));
    if (snap.roomCounts && snap.roomCounts.length > 0) parts.push(snap.roomCounts.join('/'));
    if (snap.keyword) parts.push('"' + snap.keyword + '"');
    if (snap.minDeposit || snap.maxDeposit) parts.push('ë³´ì¦ê¸ ' + (snap.minDeposit || '0') + '~' + (snap.maxDeposit || 'â'));
    if (snap.minBasePrice || snap.maxBasePrice) parts.push('ìì¸ ' + (snap.minBasePrice || '0') + '~' + (snap.maxBasePrice || 'â'));
    return parts.length > 0 ? parts.join(' Â· ') : 'íí° ìì';
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
    s.typeTab = f.typeTab || 'ì ì²´';
    s.selectedRegion = f.selectedRegion || 'ì êµ­';
    s.selectedRegions = (f.selectedRegions || []).slice();
    s.selectedDongs = (f.selectedDongs || []).slice();
    s.deals = (f.deals || []).slice();
    s.roomCounts = (f.roomCounts || []).slice();
    s.buildingShapes = (f.buildingShapes || []).slice();
    s.entranceTypes = (f.entranceTypes || []).slice();
    s.builtAfter = f.builtAfter || '';
    s.direction = f.direction || 'ì ì²´';
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
    window.WS.showToast('íí°ê° ë³µìëììµëë¤: ' + (entry.name || ''));
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
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#aaa;"><div style="font-size:32px;margin-bottom:8px;">ð­</div><div>ì ì¥ë ê²ì íì¤í ë¦¬ê° ììµëë¤</div><div style="font-size:12px;margin-top:4px;">ììì íì¬ íí° ì¡°í©ì ì´ë¦ì ì§ì íê³  ì ì¥íì¸ì</div></div>';
      return;
    }

    var html = '';
    list.forEach(function(entry) {
      var desc = window.WS._describeFilter(entry.filters);
      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:8px;background:#f8f9fa;border-radius:8px;border-left:3px solid #2D5A27;">';
      html += '<div style="flex:1;cursor:pointer;" data-history-load="' + entry.id + '">';
      html += '<div style="font-weight:600;font-size:14px;color:#333;margin-bottom:4px;">' + escHtml(entry.name) + '</div>';
      html += '<div style="font-size:11px;color:#888;">' + escHtml(desc) + '</div>';
      html += '<div style="font-size:11px;color:#aaa;margin-top:2px;">' + escHtml(entry.date) + ' Â· ê²°ê³¼ ' + (entry.resultCount || 0) + 'ê±´</div>';
      html += '</div>';
      html += '<button data-history-delete="' + entry.id + '" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ì­ì </button>';
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
        window.WS.showToast('íì¬ íí° ì¡°í©ì´ ì ì¥ëììµëë¤');
      });
    }
  };

  // ========== Section N: ê³ ê°ë³ ë§¤ë¬¼ í´ë ==========
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
        if (!name) { window.WS.showToast('ê³ ê°ëªì ìë ¥í´ì£¼ì¸ì'); return; }
        var folders = window.WS._getCustomerFolders();
        folders.push({ id: Date.now(), name: name, items: [], created: new Date().toLocaleDateString('ko-KR') });
        window.WS._saveCustomerFolders(folders);
        if (nameInput) nameInput.value = '';
        window.WS.renderCustomerFolders();
        window.WS.showToast(name + ' í´ëê° ìì±ëììµëë¤');
      });
    }
  };

  window.WS.addToCustomerFolder = function(folderId) {
    var selectedIds = Array.from(window.WS.state.selectedIds || []);
    if (selectedIds.length === 0) { window.WS.showToast('ë¨¼ì  ë§¤ë¬¼ì ì íí´ì£¼ì¸ì'); return; }
    var allListings = window.WS.allListings || [];
    var sel = allListings.filter(function(l) { return selectedIds.some(function(sid) { return String(sid) === String(l.id); }); });
    if (sel.length === 0) { window.WS.showToast('ì íë ë§¤ë¬¼ ë°ì´í°ë¥¼ ì°¾ì ì ììµëë¤'); return; }
    var folders = window.WS._getCustomerFolders();
    var folder = folders.find(function(f) { return f.id === folderId; });
    if (!folder) return;
    var added = 0;
    sel.forEach(function(item) {
      var itemId = String(item.id);
      var exists = folder.items.find(function(i) { return String(i.id) === itemId; });
      if (!exists) { folder.items.push({ id: itemId, name: item.title || item.address || 'ë§¤ë¬¼', price: (item.deposit || item.price || '') + '', address: item.address || '', added: new Date().toLocaleDateString('ko-KR') }); added++; }
    });
    window.WS._saveCustomerFolders(folders);
    window.WS.renderCustomerFolders();
    window.WS.showToast(added + 'ê±´ ë§¤ë¬¼ì´ ì¶ê°ëììµëë¤');
  };

  window.WS.deleteCustomerFolder = function(folderId) {
    var folders = window.WS._getCustomerFolders();
    folders = folders.filter(function(f) { return f.id !== folderId; });
    window.WS._saveCustomerFolders(folders);
    window.WS.renderCustomerFolders();
    window.WS.showToast('í´ëê° ì­ì ëììµëë¤');
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
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#aaa;"><div style="font-size:32px;margin-bottom:8px;">ð</div><div>ìì±ë ê³ ê° í´ëê° ììµëë¤</div><div style="font-size:12px;margin-top:4px;">ììì ê³ ê°ëªì ìë ¥íê³  í´ëë¥¼ ìì±íì¸ì</div></div>';
      return;
    }
    var html = '';
    folders.forEach(function(folder) {
      html += '<div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:12px;overflow:hidden;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f0fdf4;border-bottom:1px solid #e2e8f0;">';
      html += '<div><span style="font-weight:700;font-size:14px;color:#2D5A27;">ð¤ ' + escHtml(folder.name) + '</span>';
      html += '<span style="font-size:11px;color:#888;margin-left:8px;">ë§¤ë¬¼ ' + folder.items.length + 'ê±´ Â· ìì±: ' + escHtml(folder.created) + '</span></div>';
      html += '<div style="display:flex;gap:6px;">';
      html += '<button data-folder-add="' + folder.id + '" style="padding:4px 10px;background:#2D5A27;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">âì íì¶ê°</button>';
      html += '<button data-folder-pref="' + folder.id + '" style="padding:4px 10px;background:#7c3aed;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ð¯ì í¸ì¡°ê±´</button>';
      html += '<button data-folder-share="' + folder.id + '" style="padding:4px 10px;background:#FFA000;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ð¬ì¹´í¡ì ì¡</button>';
      html += '<button data-folder-del="' + folder.id + '" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ðì­ì </button>';
      html += '</div></div>';
      if (folder.items.length > 0) {
        html += '<div style="padding:8px 12px;">';
        folder.items.forEach(function(item) {
          html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #f1f1f1;font-size:12px;">';
          html += '<div style="flex:1;"><span style="font-weight:600;color:#333;">' + escHtml(item.name) + '</span>';
          html += ' <span style="color:#888;">' + escHtml(item.address || '') + '</span></div>';
          html += '<span style="color:#2D5A27;font-weight:600;white-space:nowrap;">' + escHtml(item.price || '') + '</span>';
          html += '<button data-folder-remove="' + folder.id + '|' + item.id + '" style="padding:2px 6px;background:#fed7d7;color:#e53e3e;border:none;border-radius:3px;font-size:10px;cursor:pointer;">â</button>';
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
        if (delEl) { if (confirm('ì´ í´ëë¥¼ ì­ì íìê² ìµëê¹?')) window.WS.deleteCustomerFolder(parseInt(delEl.getAttribute('data-folder-del'), 10)); return; }
        var shareEl = e.target.closest('[data-folder-share]');
        if (shareEl) { window.WS.shareFolderToKakao(parseInt(shareEl.getAttribute('data-folder-share'), 10)); return; }
        var removeEl = e.target.closest('[data-folder-remove]');
        if (removeEl) { var parts = removeEl.getAttribute('data-folder-remove').split('|'); window.WS.removeFromFolder(parseInt(parts[0], 10), parts[1]); }
      });
    }
  };

  // ê³ ê° í´ë ì¹´ì¹´ì¤í¡ ê³µì 
  window.WS.shareFolderToKakao = function(folderId) {
    var folders = window.WS._getCustomerFolders();
    var folder = folders.find(function(f) { return f.id === folderId; });
    if (!folder || folder.items.length === 0) {
      window.WS.showToast('í´ëì ë§¤ë¬¼ì´ ììµëë¤');
      return;
    }
    var text = 'ð  WISHES ë§¤ë¬¼ ë¸ë¦¬í\n';
    text += 'ââââââââââââââ\n';
    text += 'ð¤ ê³ ê°: ' + folder.name + '\n';
    text += 'ð ' + new Date().toLocaleDateString('ko-KR') + '\n';
    text += 'ââââââââââââââ\n\n';
    folder.items.forEach(function(item, idx) {
      text += 'ð ' + (idx + 1) + '. ' + (item.name || 'ë§¤ë¬¼') + '\n';
      if (item.address) text += 'ð ' + item.address + '\n';
      if (item.price) text += 'ð° ' + item.price + '\n';
      text += '\n';
    });
    text += 'ââââââââââââââ\n';
    text += 'ì´ ' + folder.items.length + 'ê±´ Â· WISHES ë¶ëì°\n';
    text += 'ð wishes.co.kr';

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        window.WS.showToast(folder.name + ' í´ë ë§¤ë¬¼ì´ ë³µì¬ëììµëë¤! ð¬');
      }).catch(function() { window.WS._fallbackCopy(text); });
    } else {
      window.WS._fallbackCopy(text);
      window.WS.showToast(folder.name + ' í´ë ë§¤ë¬¼ì´ ë³µì¬ëììµëë¤! ð¬');
    }
  };

  // ========== Section O: ê±´ë¬¼ë³ ê·¸ë£¹í ==========
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
    if (items.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;">íìí  ë§¤ë¬¼ ë°ì´í°ê° ììµëë¤</div>'; return; }

    // Group by address (extract building/dong)
    var groups = {};
    items.forEach(function(item) {
      var key = item.address || item.dong || 'ê¸°í';
      // Try to extract building name from address
      var parts = key.split(' ');
      if (parts.length > 2) key = parts.slice(0, 3).join(' ');
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    var sortedKeys = Object.keys(groups).sort(function(a, b) { return groups[b].length - groups[a].length; });

    var html = '<div style="margin-bottom:12px;font-size:13px;color:#666;">ì´ <strong>' + sortedKeys.length + 'ê°</strong> ê±´ë¬¼/ê·¸ë£¹ Â· ë§¤ë¬¼ <strong>' + items.length + 'ê±´</strong></div>';
    sortedKeys.forEach(function(key) {
      var group = groups[key];
      var prices = group.map(function(g) {
        var p = g.deposit || g.price || 0;
        return typeof p === 'string' ? (parseFloat(p.replace(/[^0-9.]/g, '')) || 0) : (p || 0);
      }).filter(function(p) { return p > 0; });
      var avgPrice = prices.length > 0 ? Math.round(prices.reduce(function(a, b) { return a + b; }, 0) / prices.length) : 0;

      html += '<div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px;overflow:hidden;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f7fafc;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">';
      html += '<div><span style="font-weight:700;font-size:14px;color:#2D5A27;">ð¢ ' + escHtml(key) + '</span>';
      html += '<span style="font-size:12px;color:#888;margin-left:8px;">' + group.length + 'ê±´</span></div>';
      if (avgPrice > 0) html += '<span style="font-size:12px;color:#2D5A27;font-weight:600;">íê·  ' + avgPrice.toLocaleString() + 'ë§</span>';
      html += '</div>';
      html += '<div style="display:none;padding:8px 12px;border-top:1px solid #e2e8f0;">';
      group.forEach(function(item) {
        var floorText = item.floor_current ? item.floor_current + '/' + (item.floor_total || '?') + 'ì¸µ' : '';
        var areaText = item.area_m2 ? item.area_m2 + 'mÂ²' : '';
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #f5f5f5;font-size:12px;">';
        html += '<span style="color:#555;flex:1;">' + escHtml(item.title || item.type || 'ë§¤ë¬¼') + (floorText ? ' Â· ' + escHtml(floorText) : '') + '</span>';
        html += '<span style="color:#2D5A27;font-weight:600;white-space:nowrap;">' + escHtml(String(item.deposit || item.price || '-')) + '</span>';
        html += '<span style="font-size:11px;color:#888;">' + escHtml(areaText) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    });
    container.innerHTML = html;
  };

  // ========== Section P: ë§¤ë¬¼ ìí ë³ê²½ ì¶ì  ==========
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
      var itemName = item.title || item.address || 'ë§¤ë¬¼';
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
        changes.push({ type: 'removed', id: id, name: snapshot[id].name || 'ë§¤ë¬¼', date: now });
        delete snapshot[id];
      }
    });

    if (changes.length > 0) {
      log = log.concat(changes);
      window.WS._saveChangeLog(log);

      // â ì¦ê²¨ì°¾ê¸° ë§¤ë¬¼ ê°ê²©ë³ë ìë¦¼ â
      var favIds = (window.WS.state && window.WS.state.favorites) ? window.WS.state.favorites.map(String) : [];
      if (favIds.length > 0) {
        var favChanges = changes.filter(function(c) {
          return favIds.indexOf(String(c.id)) !== -1 && (c.type === 'price' || c.type === 'status' || c.type === 'removed');
        });
        if (favChanges.length > 0) {
          var alertLines = favChanges.map(function(c) {
            if (c.type === 'price') return 'ð° ' + (c.name || 'ë§¤ë¬¼') + ': ' + c.oldPrice + 'â' + c.newPrice;
            if (c.type === 'status') return 'ð ' + (c.name || 'ë§¤ë¬¼') + ': ' + c.oldStatus + 'â' + c.newStatus;
            if (c.type === 'removed') return 'â ' + (c.name || 'ë§¤ë¬¼') + ': ì­ì ë¨';
            return '';
          });
          // íì ìë¦¼
          setTimeout(function() {
            window.WS._showFavAlert(favChanges, alertLines);
          }, 1000);
        }
      }
    }
    window.WS._saveSnapshot(snapshot);

    // âââ ì ë§¤ë¬¼ ìë AI ìì± í¸ë¦¬ê±° âââ
    // ìë¡ ë±ë¡ë ë§¤ë¬¼ì ê±´ì¶ë¬¼ëì¥ ì¡°í + AI ì ëª©/ì¤ëª/SEO ìë ìì±
    var newListings = changes.filter(function(c) { return c.type === 'new'; });
    if (newListings.length > 0) {
      newListings.forEach(function(nl, idx) {
        var listing = newData.find(function(l) { return String(l.id) === String(nl.id); });
        if (!listing) return;
        // ì´ë¯¸ ì ëª©/ì¤ëªì´ AIë¡ ìì±ë ê²½ì° ì¤íµ (descriptionì í¹ì  í¨í´ ìì¼ë©´)
        if (listing.description && listing.description.length > 100) return;
        // ìì°¨ ì²ë¦¬ (API ë¶í ë°©ì§): 3ì´ ê°ê²©
        setTimeout(function() {
          window.WS._autoGenerateForNewListing(listing);
        }, (idx + 1) * 3000);
      });
      if (newListings.length > 0) {
        showToast('ì ë§¤ë¬¼ ' + newListings.length + 'ê±´ ê°ì§ â AI ìë ìì± ìì', 'info');
      }
    }

    return changes;
  };

  // ì¦ê²¨ì°¾ê¸° ë§¤ë¬¼ ë³ë íì ìë¦¼
  window.WS._showFavAlert = function(favChanges, alertLines) {
    var existing = document.getElementById('ws-fav-alert');
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.id = 'ws-fav-alert';
    div.style.cssText = 'position:fixed;top:60px;right:20px;width:340px;background:#fff;border:2px solid #ed8936;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);z-index:100010;animation:ws-slide-in 0.3s ease;overflow:hidden;';
    var html = '<div style="background:linear-gradient(135deg,#ed8936,#dd6b20);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">';
    html += '<div style="font-weight:700;font-size:14px;">â­ ê´ì¬ë§¤ë¬¼ ë³ë ìë¦¼</div>';
    html += '<button id="ws-fav-alert-close" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;">&times;</button>';
    html += '</div>';
    html += '<div style="padding:12px 16px;max-height:200px;overflow-y:auto;">';
    alertLines.forEach(function(line) {
      html += '<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333;">' + line + '</div>';
    });
    html += '</div>';
    html += '<div style="padding:8px 16px;background:#fffbf0;text-align:right;">';
    html += '<span style="font-size:11px;color:#999;">' + favChanges.length + 'ê±´ ë³ë ê°ì§ Â· ' + new Date().toLocaleTimeString('ko-KR') + '</span>';
    html += '</div>';
    div.innerHTML = html;
    document.body.appendChild(div);

    div.querySelector('#ws-fav-alert-close').addEventListener('click', function() { div.remove(); });
    // 15ì´ í ìë ë«í
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
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#aaa;"><div style="font-size:32px;margin-bottom:8px;">ð</div><div>ë³ë ì´ë ¥ì´ ììµëë¤</div><div style="font-size:12px;margin-top:4px;">ë§¤ë¬¼ ë°ì´í°ê° ê°±ì ëë©´ ìëì¼ë¡ ì¶ì ë©ëë¤</div></div>';
      return;
    }

    var typeLabels = { 'new': 'ð ì ê·', 'price': 'ð° ê°ê²©ë³ê²½', 'status': 'ð ìíë³ê²½', 'removed': 'â ì­ì ' };
    var typeColors = { 'new': '#48bb78', 'price': '#ed8936', 'status': '#4299e1', 'removed': '#e53e3e' };

    // Show recent first, limit 50
    var recent = log.slice(-50).reverse();
    var html = '<div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">';
    html += '<span style="font-size:12px;color:#888;">ìµê·¼ ë³ë ' + recent.length + 'ê±´ (ì ì²´ ' + log.length + 'ê±´)</span>';
    html += '<button id="ws-changelog-clear" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ì´ë ¥ì´ê¸°í</button>';
    html += '</div>';

    recent.forEach(function(entry) {
      var color = typeColors[entry.type] || '#888';
      var label = typeLabels[entry.type] || entry.type;
      html += '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;margin-bottom:6px;background:#fafafa;border-radius:8px;border-left:3px solid ' + color + ';">';
      html += '<div style="min-width:80px;"><span style="font-size:11px;font-weight:700;color:' + color + ';">' + label + '</span></div>';
      html += '<div style="flex:1;">';
      html += '<div style="font-weight:600;font-size:13px;color:#333;">' + escHtml(entry.name) + '</div>';
      if (entry.type === 'price') {
        html += '<div style="font-size:12px;color:#888;margin-top:2px;">' + escHtml(entry.oldPrice) + ' â <span style="color:#e53e3e;font-weight:600;">' + escHtml(entry.newPrice) + '</span></div>';
      } else if (entry.type === 'status') {
        html += '<div style="font-size:12px;color:#888;margin-top:2px;">' + escHtml(entry.oldStatus) + ' â <span style="font-weight:600;">' + escHtml(entry.newStatus) + '</span></div>';
      }
      html += '<div style="font-size:10px;color:#bbb;margin-top:3px;">' + escHtml(entry.date) + '</div>';
      html += '</div></div>';
    });
    container.innerHTML = html;

    // Clear button
    var clearBtn = document.getElementById('ws-changelog-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (confirm('ëª¨ë  ë³ë ì´ë ¥ì ì´ê¸°ííìê² ìµëê¹?')) {
          window.WS._saveChangeLog([]);
          window.WS._saveSnapshot({});
          window.WS.showChangelog();
          window.WS.showToast('ë³ë ì´ë ¥ì´ ì´ê¸°íëììµëë¤');
        }
      });
    }
  };

  // ========== Section Q: ë§¤ë¬¼ ìë¦¼ ì¤ì  ==========
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
    badge.innerHTML = 'ð ìë¦¼ ì¡°ê±´ ë§¤ì¹­ ' + count + 'ê±´';
    badge.addEventListener('click', function() { badge.remove(); });
    document.body.appendChild(badge);
    // Auto dismiss after 8s
    setTimeout(function() { if (badge.parentNode) badge.remove(); }, 8000);
  };

  // ========== Section R: ìë¦¼ ì¤ì  UI ==========
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
          window.WS.showToast('ìµì íëì ì¡°ê±´ì ìë ¥í´ì£¼ì¸ì');
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
        window.WS.showToast('ìë¦¼ ì¡°ê±´ì´ ì¶ê°ëììµëë¤');
      });
    }
  };

  window.WS.renderAlertList = function() {
    var container = document.getElementById('ws-alert-list');
    if (!container) return;
    var alerts = window.WS._getAlerts();

    if (alerts.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:30px 20px;color:#aaa;"><div style="font-size:28px;margin-bottom:8px;">ð</div><div>ë±ë¡ë ìë¦¼ ì¡°ê±´ì´ ììµëë¤</div><div style="font-size:12px;margin-top:4px;">ììì ì¡°ê±´ì ì¤ì íê³  ìë¦¼ì ì¶ê°íì¸ì</div></div>';
      return;
    }

    var html = '<div style="font-size:12px;color:#888;margin-bottom:8px;">ë±ë¡ë ìë¦¼ ' + alerts.length + 'ê°</div>';
    alerts.forEach(function(alert) {
      var condParts = [];
      if (alert.keyword) condParts.push('í¤ìë: ' + alert.keyword);
      if (alert.maxPrice) condParts.push('ë³´ì¦ê¸ ' + parseInt(alert.maxPrice).toLocaleString() + 'ë§ ì´í');
      if (alert.propertyType) condParts.push('ì í: ' + alert.propertyType);
      var condText = condParts.join(' Â· ');

      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:8px;background:' + (alert.active ? '#fffbeb' : '#f5f5f5') + ';border-radius:8px;border-left:3px solid ' + (alert.active ? '#ed8936' : '#ccc') + ';">';
      html += '<div style="flex:1;">';
      html += '<div style="font-size:13px;font-weight:600;color:' + (alert.active ? '#333' : '#999') + ';">' + escHtml(condText) + '</div>';
      html += '<div style="font-size:11px;color:#aaa;margin-top:2px;">ìì±: ' + escHtml(alert.created) + ' Â· ' + (alert.active ? 'ð¢ íì±' : 'â¸ ë¹íì±') + '</div>';
      html += '</div>';
      html += '<button data-alert-toggle="' + alert.id + '" style="padding:4px 10px;background:' + (alert.active ? '#f0f0f0' : '#ed8936') + ';color:' + (alert.active ? '#666' : '#fff') + ';border:none;border-radius:4px;font-size:11px;cursor:pointer;">' + (alert.active ? 'â¸ë¹íì±' : 'â¶íì±') + '</button>';
      html += '<button data-alert-delete="' + alert.id + '" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ðì­ì </button>';
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
          window.WS.showToast('ìë¦¼ì´ ì­ì ëììµëë¤');
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

  // ========== Section S: íí° íë¦¬ì ìí´ë¦­ ==========
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
        '<h2 style="color:#2D5A27;margin-bottom:12px;">â¡ íí° íë¦¬ì</h2>' +
        '<p style="font-size:12px;color:#888;margin-bottom:16px;">ìì£¼ ì¬ì©íë ê²ì ì¡°ê±´ì ìí´ë¦­ì¼ë¡ ì ì©í  ì ììµëë¤</p>' +
        '<div style="display:flex;gap:8px;margin-bottom:16px;">' +
          '<input type="text" id="ws-preset-name" placeholder="íë¦¬ì ì´ë¦ (ì: ê°ë¨ ì¤í¼ì¤í)" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          '<button id="ws-preset-save-btn" style="padding:8px 16px;background:#2D5A27;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;white-space:nowrap;">ð¾ íì¬íí°ì ì¥</button>' +
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
        if (!name) { window.WS.showToast('íë¦¬ì ì´ë¦ì ìë ¥í´ì£¼ì¸ì'); return; }
        var snapshot = window.WS._getCurrentFilterSnapshot ? window.WS._getCurrentFilterSnapshot() : {};
        var presets = window.WS._getPresets();
        if (presets.length >= 10) { window.WS.showToast('íë¦¬ìì ìµë 10ê°ê¹ì§ ì ì¥ ê°ë¥í©ëë¤'); return; }
        presets.push({ id: Date.now(), name: name, filters: snapshot, created: new Date().toLocaleDateString('ko-KR') });
        window.WS._savePresets(presets);
        if (nameInput) nameInput.value = '';
        window.WS.renderPresets();
        window.WS.showToast(name + ' íë¦¬ìì´ ì ì¥ëììµëë¤');
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
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa;"><div style="font-size:28px;margin-bottom:8px;">â¡</div><div>ì ì¥ë íë¦¬ìì´ ììµëë¤</div><div style="font-size:12px;margin-top:4px;">íì¬ íí°ë¥¼ ì¤ì í í ì´ë¦ì ì§ì íê³  ì ì¥íì¸ì</div></div>';
      return;
    }
    var html = '';
    presets.forEach(function(preset) {
      var desc = window.WS._describeFilter ? window.WS._describeFilter(preset.filters) : 'íí° ì¡°í©';
      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:8px;background:#f0fdf4;border-radius:8px;border-left:3px solid #2D5A27;cursor:pointer;" data-preset-apply="' + preset.id + '">';
      html += '<div style="font-size:20px;">â¡</div>';
      html += '<div style="flex:1;">';
      html += '<div style="font-weight:700;font-size:14px;color:#2D5A27;">' + escHtml(preset.name) + '</div>';
      html += '<div style="font-size:11px;color:#888;margin-top:2px;">' + escHtml(desc) + '</div>';
      html += '</div>';
      html += '<button data-preset-del="' + preset.id + '" style="padding:4px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;" onclick="event.stopPropagation()">ì­ì </button>';
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
          window.WS.showToast('íë¦¬ìì´ ì­ì ëììµëë¤');
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

  // ========== Section T: ì ì¬ ë§¤ë¬¼ ì¶ì² (ê³ ê° ëì¦ ê¸°ë°) ==========
  // ë§¤ì¹­ ê¸°ì¤: ê°ì ê±°ëì í íì â ê°ê²©ë(ë³´ì¦ê¸+ìì¸) + ëë¤(êµ¬/ë) + ë©´ì  + ì í + ì¸µì
  // ê° í­ëª©ë³ ê·¼ê±° íê·¸ë¡ ì ì¶ì²ëëì§ ëªíí íì
  window.WS.showSimilarListings = function(listing) {
    if (!listing) return '';
    var allListings = window.WS.allListings || [];
    if (allListings.length < 2) return '';

    // ââ ê¸°ì¤ ë§¤ë¬¼ íµì¬ ì ë³´ ì¶ì¶ ââ
    var targetDeal = (listing.deal || '').trim();
    if (!targetDeal) return ''; // ê±°ëì í ìì¼ë©´ ì¶ì² ë¶ê°

    var targetDeposit = parseFloat(listing.deposit || 0);
    var targetMonthly = parseFloat(listing.monthly || 0);
    var targetPrice = parseFloat(listing.price || 0);
    var targetArea = parseFloat(listing.area_m2 || 0);
    var targetType = (listing.type || '').trim();

    // ì£¼ììì êµ¬/ë ì¶ì¶
    var addrParts = (listing.address || '').replace(/ìì¸í¹ë³ì|ê²½ê¸°ë|ì¸ì²ê´ì­ì/g, '').trim().split(/\s+/);
    var targetGu = '';
    var targetDong = '';
    addrParts.forEach(function(p) {
      if (/[êµ¬êµ°]$/.test(p) && !targetGu) targetGu = p;
      if (/[ëìë©´ë¦¬ê°ë¡ê¸¸]$/.test(p) && !targetDong && !/[êµ¬êµ°ìë]$/.test(p)) targetDong = p;
    });
    if (!targetGu && listing.dong) {
      targetDong = listing.dong;
    }

    var targetFloor = parseInt(listing.floor_current) || 0;

    // ââ ì¤ì½ì´ë§ ââ
    var scored = allListings.filter(function(l) {
      // ìê¸° ìì  ì ì¸, ê°ì ê±°ëì íë§
      return String(l.id) !== String(listing.id) && (l.deal || '').trim() === targetDeal;
    }).map(function(l) {
      var score = 0;
      var reasons = [];

      // 1. ê°ê²© ì ì¬ë (ìµë 30ì ) â ê±°ëì íë³ ë¹êµ
      var isRent = /ìì¸|ì ì¸/.test(targetDeal);
      if (isRent) {
        var lDep = parseFloat(l.deposit || 0);
        var lMon = parseFloat(l.monthly || 0);
        // ë³´ì¦ê¸ ì ì¬ë
        if (targetDeposit > 0 && lDep > 0) {
          var depDiff = Math.abs(lDep - targetDeposit) / targetDeposit;
          if (depDiff <= 0.15) { score += 15; reasons.push('ë³´ì¦ê¸ì ì¬'); }
          else if (depDiff <= 0.3) { score += 8; reasons.push('ë³´ì¦ê¸ê·¼ì '); }
        } else if (targetDeposit === 0 && lDep === 0) {
          score += 10;
        }
        // ìì¸ ì ì¬ë
        if (targetMonthly > 0 && lMon > 0) {
          var monDiff = Math.abs(lMon - targetMonthly) / targetMonthly;
          if (monDiff <= 0.15) { score += 15; reasons.push('ìì¸ì ì¬'); }
          else if (monDiff <= 0.3) { score += 8; reasons.push('ìì¸ê·¼ì '); }
        } else if (/ì ì¸/.test(targetDeal)) {
          // ì ì¸ë ë³´ì¦ê¸ë§ ë¹êµ
          if (targetDeposit > 0 && lDep > 0) {
            var tDiff = Math.abs(lDep - targetDeposit) / targetDeposit;
            if (tDiff <= 0.1) score += 10;
          }
        }
      } else {
        // ë§¤ë§¤
        var lPr = parseFloat(l.price || 0);
        if (targetPrice > 0 && lPr > 0) {
          var prDiff = Math.abs(lPr - targetPrice) / targetPrice;
          if (prDiff <= 0.1) { score += 30; reasons.push('ê°ê²©ì ì¬'); }
          else if (prDiff <= 0.2) { score += 20; reasons.push('ê°ê²©ê·¼ì '); }
          else if (prDiff <= 0.35) { score += 10; reasons.push('ê°ê²©ëë¹ì·'); }
        }
      }

      // 2. ì§ì­ ì ì¬ë (ìµë 25ì )
      var lAddrParts = (l.address || '').replace(/ìì¸í¹ë³ì|ê²½ê¸°ë|ì¸ì²ê´ì­ì/g, '').trim().split(/\s+/);
      var lGu = '', lDong = '';
      lAddrParts.forEach(function(p) {
        if (/[êµ¬êµ°]$/.test(p) && !lGu) lGu = p;
        if (/[ëìë©´ë¦¬ê°ë¡ê¸¸]$/.test(p) && !lDong && !/[êµ¬êµ°ìë]$/.test(p)) lDong = p;
      });
      if (!lGu && l.dong) lDong = l.dong;

      if (targetDong && lDong === targetDong && targetGu && lGu === targetGu) {
        score += 25; reasons.push('ê°ìë');
      } else if (targetGu && lGu === targetGu) {
        score += 15; reasons.push('ê°ìêµ¬');
      } else if (targetDong && lDong === targetDong) {
        score += 10; reasons.push('ëì´ë¦ì¼ì¹');
      }

      // 3. ë©´ì  ì ì¬ë (ìµë 15ì )
      var lArea = parseFloat(l.area_m2 || 0);
      if (targetArea > 0 && lArea > 0) {
        var areaDiff = Math.abs(lArea - targetArea) / targetArea;
        if (areaDiff <= 0.1) { score += 15; reasons.push('ë©´ì ì ì¬'); }
        else if (areaDiff <= 0.25) { score += 8; reasons.push('ë©´ì ê·¼ì '); }
      }

      // 4. ë§¤ë¬¼ ì í ì¼ì¹ (ìµë 15ì )
      var lType = (l.type || '').trim();
      if (targetType && lType === targetType) {
        score += 15; reasons.push('ê°ìì í');
      } else if (targetType && lType) {
        // ì ì¬ ì í (ìë£¸âí¬ë£¸, ì¤í¼ì¤íâì¬ë¬´ì¤ ë±)
        var simGroups = [
          ['ìë£¸', 'í¬ë£¸', 'ì°ë¦¬ë£¸', '1.5ë£¸'],
          ['ì¤í¼ì¤í', 'ì¬ë¬´ì¤', 'ì¬ë¬´ê³µê°'],
          ['ìíí¸', 'ë¹ë¼', 'ì°ë¦½', 'ë¤ì¸ë'],
          ['ìê°', 'ì í¬', 'ë§¤ì¥', 'ìë¹', 'ì¹´í']
        ];
        var isSim = simGroups.some(function(g) {
          return g.some(function(k) { return targetType.indexOf(k) >= 0; }) &&
                 g.some(function(k) { return lType.indexOf(k) >= 0; });
        });
        if (isSim) { score += 8; reasons.push('ì ì¬ì í'); }
      }

      // 5. ì¸µì ì ì¬ë (ìµë 10ì )
      var lFloor = parseInt(l.floor_current) || 0;
      if (targetFloor > 0 && lFloor > 0) {
        var flDiff = Math.abs(lFloor - targetFloor);
        if (flDiff === 0) { score += 10; reasons.push('ê°ìì¸µ'); }
        else if (flDiff <= 2) { score += 5; reasons.push('ë¹ì·íì¸µ'); }
      }

      // 6. ì¶ê° ë³´ëì¤ (ì¬ì§ ìë ë§¤ë¬¼ +3, ê³µì¤ +2)
      var imgs = l.images || l.listing_images || [];
      if (imgs.length > 0) score += 3;
      if (l.status === 'ê°ì©' || l.status === 'ê³µê°') score += 2;

      return { listing: l, score: score, reasons: reasons };
    }).filter(function(s) { return s.score >= 25 && s.reasons.length >= 2; })
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, 5);

    if (scored.length === 0) return '';

    var maxScore = scored[0].score;

    var html = '<div style="margin-top:16px;padding-top:16px;border-top:2px solid #e2e8f0;">';
    html += '<h3 style="font-size:14px;font-weight:700;color:#2D5A27;margin-bottom:4px;">ì ì¬ ë§¤ë¬¼ ì¶ì² (' + scored.length + 'ê±´)</h3>';
    html += '<p style="font-size:11px;color:#999;margin:0 0 12px;">ê±°ëì íÂ·ê°ê²©ëÂ·ì§ì­Â·ë©´ì  ê¸°ì¤ ë§¤ì¹­</p>';

    scored.forEach(function(s) {
      var l = s.listing;
      var matchPct = Math.min(100, Math.round((s.score / maxScore) * 100));
      var barColor = matchPct >= 80 ? '#2D5A27' : matchPct >= 60 ? '#f59e0b' : '#94a3b8';

      // ê°ê²© íì
      var priceDisplay = '';
      if (/ìì¸/.test(l.deal)) {
        priceDisplay = (l.deposit || 0) + '/' + (l.monthly || 0) + 'ë§';
      } else if (/ì ì¸/.test(l.deal)) {
        priceDisplay = (l.deposit || 0) + 'ë§';
      } else {
        priceDisplay = (l.price || 0) + 'ë§';
      }

      // ì£¼ì ê°ëµ íì
      var shortAddr = _getDisplayAddress(l);
      var areaText = l.area_m2 ? Math.round(l.area_m2 / 3.30579) + 'í' : '';

      html += '<div class="ws-similar-item" style="padding:10px 12px;margin-bottom:6px;background:#fff;border-radius:8px;cursor:pointer;border:1px solid #e8e8e8;transition:all .15s;" data-similar-id="' + l.id + '">';

      // ìë¨: ë§¤ì¹­ë¥  ë° + ê°ê²©
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;flex:1;">';
      html += '<div style="font-size:14px;font-weight:800;color:' + barColor + ';">' + matchPct + '%</div>';
      html += '<div style="flex:1;height:4px;background:#f0f0f0;border-radius:2px;overflow:hidden;max-width:80px;"><div style="height:100%;width:' + matchPct + '%;background:' + barColor + ';border-radius:2px;"></div></div>';
      html += '</div>';
      html += '<div style="text-align:right;"><span style="font-size:14px;font-weight:800;color:#e53e3e;">' + escHtml(priceDisplay) + '</span> <span style="font-size:10px;color:#888;">' + escHtml(l.deal || '') + '</span></div>';
      html += '</div>';

      // ì¤ë¨: ì£¼ì + ë©´ì  + ì í
      html += '<div style="font-size:12px;color:#555;margin-bottom:5px;">' + escHtml(shortAddr) + (areaText ? ' Â· ' + areaText : '') + (l.type ? ' Â· ' + escHtml(l.type) : '') + '</div>';

      // íë¨: ë§¤ì¹­ ê·¼ê±° íê·¸
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
      s.reasons.forEach(function(r) {
        var tagColor = /ê°ìë|ê°ìêµ¬/.test(r) ? '#3b82f6' : /ê°ê²©|ë³´ì¦ê¸|ìì¸/.test(r) ? '#ef4444' : /ë©´ì /.test(r) ? '#8b5cf6' : /ì í/.test(r) ? '#f59e0b' : '#6b7280';
        html += '<span style="display:inline-block;padding:1px 6px;background:' + tagColor + '12;color:' + tagColor + ';border-radius:3px;font-size:10px;font-weight:600;">' + escHtml(r) + '</span>';
      });
      html += '</div>';

      html += '</div>';
    });
    html += '</div>';
    return html;
  };

  // ========== Section V: ë©ëª¨ íê·¸ & ê²ì ==========
  window.WS.getMemoTags = function(memoText) {
    if (!memoText) return [];
    var tags = memoText.match(/#[ê°-í£a-zA-Z0-9_]+/g) || [];
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
    html += '<h2 style="font-size:18px;font-weight:800;color:#2D5A27;margin:0;">ð ë©ëª¨ ê´ë¦¬</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">â</button>';
    html += '</div>';

    var tagMap = window.WS.getAllMemoTags();
    var tagKeys = Object.keys(tagMap).sort(function(a, b) { return tagMap[b] - tagMap[a]; });

    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:12px;color:#888;margin-bottom:6px;">ð íê·¸ í´ë¼ì°ë (ë©ëª¨ì #íê·¸ ìë ¥ ì ìë ì¸ì)</div>';
    if (tagKeys.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      tagKeys.forEach(function(tag) {
        html += '<button data-memo-tag="' + escHtml(tag) + '" style="padding:4px 12px;background:#f0fdf4;border:1px solid #2D5A27;color:#2D5A27;border-radius:20px;font-size:12px;cursor:pointer;">' + escHtml(tag) + ' <span style="color:#aaa;font-size:10px;">' + tagMap[tag] + '</span></button>';
      });
      html += '</div>';
    } else {
      html += '<div style="color:#ccc;font-size:12px;">íê·¸ê° ììµëë¤. ë©ëª¨ì #ê¸ë§¤ #ì¶ì² ë±ì ìë ¥í´ë³´ì¸ì</div>';
    }
    html += '</div>';

    html += '<div style="margin-bottom:16px;"><input type="text" id="ws-memo-search" placeholder="ë©ëª¨ ëë íê·¸ ê²ì..." style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:13px;box-sizing:border-box;"></div>';
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
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa;"><div style="font-size:28px;margin-bottom:8px;">ð</div><div>' + (filterText ? 'ê²ì ê²°ê³¼ê° ììµëë¤' : 'ì ì¥ë ë©ëª¨ê° ììµëë¤') + '</div></div>';
      return;
    }

    var html = '<div style="font-size:12px;color:#888;margin-bottom:8px;">ë©ëª¨ ' + entries.length + 'ê±´</div>';
    entries.forEach(function(entry) {
      var tags = window.WS.getMemoTags(entry.text);
      var name = entry.listing ? (entry.listing.title || 'ë§¤ë¬¼') : '(ì­ì ë ë§¤ë¬¼ ID:' + entry.id + ')';
      var addr = entry.listing ? (entry.listing.address || '') : '';

      html += '<div style="padding:12px;margin-bottom:8px;background:#fafafa;border-radius:8px;border-left:3px solid #2D5A27;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
      html += '<div style="font-weight:600;font-size:13px;color:#333;">' + escHtml(name) + '</div>';
      if (entry.listing) {
        html += '<button data-memo-goto="' + entry.id + '" style="padding:3px 10px;background:#2D5A27;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;">ìì¸ë³´ê¸°</button>';
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

  // ========== Section W: í¤ë³´ë ë¨ì¶í¤ ==========
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

    var html = '<div style="font-weight:700;font-size:14px;color:#2D5A27;margin-bottom:10px;">â¨ï¸ ë¨ì¶í¤ ìë´</div>';
    var shortcuts = [
      ['Ctrl + F', 'í¤ìë ê²ì í¬ì»¤ì¤'],
      ['Ctrl + P', 'ì í ë§¤ë¬¼ ì¸ì'],
      ['Ctrl + A', 'ì ì²´ ì í'],
      ['Ctrl + S', 'íµê³ ëìë³´ë'],
      ['Esc', 'ëª¨ë¬ ë«ê¸°'],
      ['?', 'ì´ ëìë§ íì/ë«ê¸°']
    ];
    shortcuts.forEach(function(s) {
      html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f0f0;">';
      html += '<kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-family:monospace;font-size:11px;border:1px solid #ddd;">' + s[0] + '</kbd>';
      html += '<span style="color:#666;">' + s[1] + '</span>';
      html += '</div>';
    });
    html += '<div style="text-align:center;margin-top:8px;color:#aaa;font-size:10px;">ìë¬´ í¤ë ëë¥´ë©´ ë«í</div>';
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

  // ========== Section X: ëë°ì´ì¤ & ìë ¥ ìµì í ==========
  // ë ëë§ í í¸ì¶ ê°ë¥íëë¡ í¨ìë¡ ë¸ì¶ (DOM ì¬ìì± ì ì¬ë°ì¸ë©)
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
  // ì´ê¸° ë°ì¸ë© ìë
  window.WS._bindPriceDebounce();

  // ========== Section Y: ì¼ì¼ ë¸ë¦¬í ìë ìì± ==========
  window.WS.generateDailyBriefing = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) {
      window.WS.showToast('ë§¤ë¬¼ ë°ì´í°ê° ììµëë¤', 'warning');
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
      if (st.indexOf('ê³ì½') >= 0) stats.contracting++;
      else if (st.indexOf('ìë£') >= 0) stats.completed++;
      else stats.available++;

      var t = item.type || 'ê¸°í';
      typeCount[t] = (typeCount[t] || 0) + 1;

      var d = item.deal || 'ê¸°í';
      dealCount[d] = (dealCount[d] || 0) + 1;

      var addr = (item.address || '').split(' ');
      var region = addr.length >= 2 ? addr[0] + ' ' + addr[1] : (addr[0] || 'ê¸°í');
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
    var text = 'ð WISHES ì¼ì¼ ë§¤ë¬¼ ë¸ë¦¬í\n';
    text += 'âââââââââââââââââ\n';
    text += 'ð ' + todayStr + '\n\n';

    text += 'ð ì ì²´ íí©\n';
    text += '  ì´ ë§¤ë¬¼: ' + stats.total + 'ê±´\n';
    text += '  ê°ì©: ' + stats.available + 'ê±´ | ê³ì½ì¤: ' + stats.contracting + 'ê±´ | ìë£: ' + stats.completed + 'ê±´\n\n';

    text += 'ð¢ ë§¤ë¬¼ ì í TOP3\n';
    topTypes.forEach(function(t, i) { text += '  ' + (i + 1) + '. ' + t[0] + ': ' + t[1] + 'ê±´\n'; });
    text += '\n';

    text += 'ð ì§ì­ TOP3\n';
    topRegions.forEach(function(r, i) { text += '  ' + (i + 1) + '. ' + r[0] + ': ' + r[1] + 'ê±´\n'; });
    text += '\n';

    if (avgDeposit > 0) {
      text += 'ð° ë³´ì¦ê¸ ë¶ì\n';
      text += '  íê· : ' + avgDeposit.toLocaleString() + 'ë§ | ìµì : ' + minDeposit.toLocaleString() + 'ë§ | ìµê³ : ' + maxDeposit.toLocaleString() + 'ë§\n\n';
    }

    if (recentChanges.length > 0) {
      text += 'ð ìµê·¼ 24ìê° ë³ë (' + recentChanges.length + 'ê±´)\n';
      recentChanges.slice(0, 5).forEach(function(c) {
        text += '  Â· ' + escHtml(c.title || 'ë§¤ë¬¼') + ': ' + escHtml(c.changeType || 'ë³ë') + '\n';
      });
      if (recentChanges.length > 5) text += '  ... ì¸ ' + (recentChanges.length - 5) + 'ê±´\n';
      text += '\n';
    }

    text += 'âââââââââââââââââ\n';
    text += 'ð  WISHES | wishes.co.kr\n';

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
    html += '<h2 style="font-size:18px;font-weight:800;color:#2D5A27;margin:0;">ð ì¼ì¼ ë¸ë¦¬í</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">â</button>';
    html += '</div>';
    html += '<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.7;color:#333;background:#fafafa;padding:16px;border-radius:8px;max-height:50vh;overflow-y:auto;">' + escHtml(text) + '</pre>';
    html += '<div style="display:flex;gap:8px;margin-top:12px;">';
    html += '<button id="ws-daily-copy" style="flex:1;padding:10px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;">ð í´ë¦½ë³´ë ë³µì¬</button>';
    html += '<button id="ws-daily-kakao" style="flex:1;padding:10px;background:#FFA000;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;">ð¬ ì¹´í¡ ê³µì </button>';
    html += '</div></div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('ws-daily-copy').addEventListener('click', function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast('ë¸ë¦¬í íì¤í¸ê° ë³µì¬ëììµëë¤!', 'success');
        }).catch(function() { window.WS._fallbackCopy(text); });
      } else {
        window.WS._fallbackCopy(text);
      }
    });

    document.getElementById('ws-daily-kakao').addEventListener('click', function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast('ë³µì¬ ìë£! ì¹´ì¹´ì¤í¡ì ë¶ì¬ë£ê¸° í´ì£¼ì¸ì ð¬', 'success');
        }).catch(function() { window.WS._fallbackCopy(text); });
      } else {
        window.WS._fallbackCopy(text);
      }
    });
  };

  // ========== Section Z: ë¤í¬ëª¨ë í ê¸ ==========
  window.WS._darkModeStyleId = 'ws-dark-mode-style';

  window.WS.isDarkMode = function() {
    return localStorage.getItem('ws_dark_mode') === 'true';
  };

  window.WS.toggleDarkMode = function() {
    var current = window.WS.isDarkMode();
    _safeSetItem('ws_dark_mode', current ? 'false' : 'true');
    window.WS._applyDarkMode(!current);
    window.WS.showToast(!current ? 'ð ë¤í¬ëª¨ë ON' : 'âï¸ ë¼ì´í¸ëª¨ë ON');
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
    if (btn) btn.innerHTML = enabled ? 'âï¸ë¼ì´í¸' : 'ðë¤í¬';
  };

  // Apply dark mode on load if previously enabled
  if (window.WS.isDarkMode()) {
    window.WS._applyDarkMode(true);
  }

  // ========== Section AA: ë§ë£ ìì  ë§¤ë¬¼ íì ==========
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
    badge.innerHTML = 'â° ë§ë£ ìë° ' + expiring.length + 'ê±´' + (urgentCount > 0 ? ' <span style="color:#e53e3e;font-weight:700;">(30ì¼+ ' + urgentCount + 'ê±´)</span>' : '');
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
    html += '<h2 style="font-size:18px;font-weight:800;color:#ed8936;margin:0;">â° ë§ë£ ìë° ë§¤ë¬¼ (' + expiring.length + 'ê±´)</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">â</button>';
    html += '</div>';
    html += '<div style="font-size:12px;color:#888;margin-bottom:12px;">ë±ë¡ì¼ë¡ë¶í° 25ì¼ ì´ì ê²½ê³¼ë ë§¤ë¬¼ìëë¤. ê°±ì  ëë ìí íì¸ì´ íìí©ëë¤.</div>';

    // Sort by days descending
    expiring.sort(function(a, b) { return b.days - a.days; });

    html += '<div id="ws-expiring-list" style="max-height:50vh;overflow-y:auto;">';
    expiring.forEach(function(e) {
      var l = e.listing;
      var bgColor = e.urgent ? '#fff5f5' : '#fffbeb';
      var borderColor = e.urgent ? '#e53e3e' : '#ed8936';
      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:8px;background:' + bgColor + ';border-radius:8px;border-left:3px solid ' + borderColor + ';cursor:pointer;" data-expiry-id="' + l.id + '">';
      html += '<div style="min-width:50px;text-align:center;"><div style="font-size:18px;font-weight:700;color:' + borderColor + ';">' + e.days + '</div><div style="font-size:9px;color:#aaa;">ì¼ ê²½ê³¼</div></div>';
      html += '<div style="flex:1;">';
      html += '<div style="font-weight:600;font-size:13px;color:#333;">' + escHtml(l.title || 'ë§¤ë¬¼') + '</div>';
      html += '<div style="font-size:11px;color:#888;">' + escHtml(l.address || '') + ' Â· ' + escHtml(l.type || '') + '</div>';
      html += '</div>';
      html += '<div style="text-align:right;">';
      html += '<div style="font-size:12px;font-weight:700;color:#e53e3e;">' + escHtml(l.deposit ? l.deposit + 'ë§' : (l.price ? l.price + 'ë§' : '-')) + '</div>';
      html += '<div style="font-size:10px;color:#aaa;">' + escHtml(l.deal || '') + '</div>';
      html += '</div>';
      if (e.urgent) html += '<span style="font-size:9px;background:#fed7d7;color:#e53e3e;padding:2px 6px;border-radius:3px;font-weight:600;">ë§ë£ìë°</span>';
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

  // ========== Section AB: ê³ ê°ë³ ìë ë§¤ì¹­ ==========
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
      var customerName = folder ? folder.name : 'ê³ ê° #' + folderId;
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
    badge.innerHTML = 'ð¯ ê³ ê° ë§¤ì¹­ ' + results.length + 'ëª / ' + total + 'ê±´';
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
    html += '<h2 style="font-size:18px;font-weight:800;color:#2D5A27;margin:0;">ð¯ ê³ ê° ìë ë§¤ì¹­ ê²°ê³¼</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">â</button>';
    html += '</div>';

    results.forEach(function(r) {
      html += '<div style="margin-bottom:16px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">';
      html += '<div style="padding:10px 14px;background:#f0fdf4;border-bottom:1px solid #e2e8f0;font-weight:700;color:#2D5A27;">ð¤ ' + escHtml(r.customerName) + ' <span style="font-weight:400;font-size:12px;color:#888;">ë§¤ì¹­ ' + r.total + 'ê±´</span></div>';
      r.matches.forEach(function(item) {
        var priceText = item.deposit ? item.deposit + 'ë§' : (item.price ? item.price + 'ë§' : '-');
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f1f1f1;font-size:12px;cursor:pointer;" data-match-id="' + item.id + '">';
        html += '<div style="flex:1;"><span style="font-weight:600;color:#333;">' + escHtml(item.title || 'ë§¤ë¬¼') + '</span> <span style="color:#888;">' + escHtml(item.address || '') + '</span></div>';
        html += '<span style="color:#e53e3e;font-weight:600;white-space:nowrap;">' + escHtml(String(priceText)) + '</span>';
        html += '</div>';
      });
      if (r.total > 5) html += '<div style="padding:6px 14px;font-size:11px;color:#888;text-align:center;">... ì¸ ' + (r.total - 5) + 'ê±´</div>';
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
    var customerName = folder ? folder.name : 'ê³ ê°';
    var existing = window.WS._getCustomerPrefs()[folderId] || {};

    var existing_modal = document.getElementById('ws-modal-setpref');
    if (existing_modal) existing_modal.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-setpref';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:450px;width:95%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    html += '<h2 style="font-size:16px;font-weight:800;color:#2D5A27;margin:0;">ð¯ ' + escHtml(customerName) + 'ë ì í¸ì¡°ê±´</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">â</button>';
    html += '</div>';
    html += '<div style="display:grid;gap:10px;">';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">ì í¸ ì§ì­</label><input type="text" id="ws-pref-region" value="' + escHtml(existing.region || '') + '" placeholder="ì: ìì¸ ê°ë¨êµ¬" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">ë§¤ë¬¼ ì í</label><select id="ws-pref-type" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">';
    ['', 'ìë£¸', 'í¬ë£¸', 'ì¤í¼ì¤í', 'ìíí¸', 'ìê°', 'ì¬ë¬´ì¤', 'ë¹ë¼', 'í ì§'].forEach(function(t) {
      html += '<option value="' + t + '"' + (existing.type === t ? ' selected' : '') + '>' + (t || 'ì ì²´') + '</option>';
    });
    html += '</select></div>';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">ê±°ëë°©ì</label><select id="ws-pref-deal" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">';
    ['', 'ìì¸', 'ì ì¸', 'ì ìì¸', 'ë§¤ë§¤'].forEach(function(d) {
      html += '<option value="' + d + '"' + (existing.deal === d ? ' selected' : '') + '>' + (d || 'ì ì²´') + '</option>';
    });
    html += '</select></div>';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">ìµë ë³´ì¦ê¸ (ë§ì)</label><input type="number" id="ws-pref-maxdeposit" value="' + escHtml(existing.maxDeposit || '') + '" placeholder="ì: 5000" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>';
    html += '<div><label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">ìµì ë©´ì  (mÂ²)</label><input type="number" id="ws-pref-minarea" value="' + escHtml(existing.minArea || '') + '" placeholder="ì: 20" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;margin-top:16px;">';
    html += '<button id="ws-pref-save" style="flex:1;padding:10px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;">ð¾ ì ì¥</button>';
    html += '<button id="ws-pref-clear" style="padding:10px 16px;background:#e2e8f0;color:#666;border:none;border-radius:8px;font-size:13px;cursor:pointer;">ì´ê¸°í</button>';
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
      window.WS.showToast(customerName + 'ë ì í¸ì¡°ê±´ì´ ì ì¥ëììµëë¤', 'success');
      // Immediately check matches
      window.WS.checkCustomerMatches();
    });

    document.getElementById('ws-pref-clear').addEventListener('click', function() {
      var prefs = window.WS._getCustomerPrefs();
      delete prefs[folderId];
      window.WS._saveCustomerPrefs(prefs);
      modal.remove();
      window.WS.showToast('ì í¸ì¡°ê±´ì´ ì´ê¸°íëììµëë¤');
    });
  };

  // ========== Section AC: ì¦ê²¨ì°¾ê¸° ì¹´íê³ ë¦¬ ==========
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
    'ê¸ë§¤': { bg: '#fed7d7', color: '#e53e3e', icon: 'ð¥' },
    'ì¶ì²': { bg: '#c6f6d5', color: '#2D5A27', icon: 'â­' },
    'ëê¸°': { bg: '#fefcbf', color: '#975a16', icon: 'â³' },
    'VIP': { bg: '#e9d8fd', color: '#6b46c1', icon: 'ð' },
    'ë³´ë¥': { bg: '#e2e8f0', color: '#718096', icon: 'â¸' }
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

    var html = '<div style="font-size:11px;color:#888;padding:2px 6px;margin-bottom:4px;">ì¹´íê³ ë¦¬ ì í</div>';
    var cats = Object.keys(window.WS._categoryStyles);
    cats.forEach(function(cat) {
      var s = window.WS._categoryStyles[cat];
      var isActive = current === cat;
      html += '<div data-cat="' + cat + '" style="display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;border-radius:6px;margin-bottom:2px;background:' + (isActive ? s.bg : 'transparent') + ';font-weight:' + (isActive ? '700' : '400') + ';">';
      html += '<span>' + s.icon + '</span><span style="font-size:12px;color:' + s.color + ';">' + cat + '</span>';
      if (isActive) html += '<span style="margin-left:auto;font-size:10px;">â</span>';
      html += '</div>';
    });
    // Remove category option
    if (current) {
      html += '<div data-cat="" style="display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;border-radius:6px;border-top:1px solid #eee;margin-top:4px;">';
      html += '<span>â</span><span style="font-size:12px;color:#999;">ì¹´íê³ ë¦¬ í´ì </span></div>';
    }

    picker.innerHTML = html;
    document.body.appendChild(picker);

    picker.addEventListener('click', function(e) {
      var catEl = e.target.closest('[data-cat]');
      if (catEl) {
        var cat = catEl.getAttribute('data-cat');
        window.WS.setFavCategory(listingId, cat);
        picker.remove();
        window.WS.showToast(cat ? 'ì¹´íê³ ë¦¬: ' + cat : 'ì¹´íê³ ë¦¬ í´ì ');
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

  // ========== Section AD: ë°ì´í° ë°±ì/ë³µì ==========
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
          if (Array.isArray(parsed)) count = parsed.length + 'ê±´';
          else if (typeof parsed === 'object') count = Object.keys(parsed).length + 'ê±´';
        } catch(e) {}
        dataInfo.push({ key: key, size: size, count: count });
      }
    });

    var sizeStr = totalSize < 1024 ? totalSize + 'B' : (totalSize / 1024).toFixed(1) + 'KB';

    var html = '<div style="background:#fff;border-radius:16px;max-width:520px;width:95%;max-height:85vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    html += '<h2 style="font-size:18px;font-weight:800;color:#6366f1;margin:0;">ð¾ ë°ì´í° ë°±ì/ë³µì</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">â</button>';
    html += '</div>';

    // Current data summary
    html += '<div style="background:#f8f7ff;border:1px solid #e0e0ff;border-radius:10px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#6366f1;margin-bottom:8px;">ð íì¬ ì ì¥ ë°ì´í°</div>';
    if (dataInfo.length === 0) {
      html += '<div style="font-size:12px;color:#aaa;">ì ì¥ë ë°ì´í°ê° ììµëë¤.</div>';
    } else {
      var keyLabels = {
        'ws-favorites': 'â­ ì¦ê²¨ì°¾ê¸°', 'ws-memos': 'ð ë©ëª¨',
        'ws-search-history': 'ð ê²ìê¸°ë¡', 'ws_customer_folders': 'ð¤ ê³ ê°í´ë',
        'ws_changelog': 'ð ë³ëì´ë ¥', 'ws_data_snapshot': 'ð¸ ë°ì´í°ì¤ëì·',
        'ws_alerts': 'ð ìë¦¼ì¤ì ', 'ws_filter_presets': 'â¡ íí°íë¦¬ì',
        'ws_dark_mode': 'ð ë¤í¬ëª¨ë', 'ws_customer_prefs': 'ð¯ ê³ ê°ì í¸ì¡°ê±´',
        'ws_fav_categories': 'ð·ï¸ ì¦ê²¨ì°¾ê¸°ì¹´íê³ ë¦¬'
      };
      dataInfo.forEach(function(d) {
        var label = keyLabels[d.key] || d.key;
        html += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;color:#555;">';
        html += '<span>' + label + '</span>';
        html += '<span style="color:#888;">' + d.count + (d.count ? ' Â· ' : '') + (d.size < 1024 ? d.size + 'B' : (d.size / 1024).toFixed(1) + 'KB') + '</span>';
        html += '</div>';
      });
      html += '<div style="border-top:1px solid #ddd;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:#6366f1;"><span>í©ê³</span><span>' + sizeStr + '</span></div>';
    }
    html += '</div>';

    // Buttons
    html += '<div style="display:grid;gap:10px;">';
    html += '<button id="ws-backup-export" style="padding:14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;text-align:left;">ð¤ ë°±ì íì¼ ë¤ì´ë¡ë<br><span style="font-size:11px;font-weight:400;opacity:0.8;">ëª¨ë  ì¤ì ì JSON íì¼ë¡ ë´ë³´ëëë¤</span></button>';
    html += '<button id="ws-backup-clipboard" style="padding:12px;background:#f0f0ff;color:#6366f1;border:1px solid #c7d2fe;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">ð í´ë¦½ë³´ëë¡ ë³µì¬</button>';
    html += '<div style="position:relative;">';
    html += '<button id="ws-backup-import-btn" style="width:100%;padding:14px;background:#fff;color:#059669;border:2px dashed #059669;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;text-align:left;">ð¥ ë°±ì íì¼ìì ë³µì<br><span style="font-size:11px;font-weight:400;color:#888;">JSON íì¼ì ì ííê±°ë íì¤í¸ë¥¼ ë¶ì¬ë£ê¸°</span></button>';
    html += '<input type="file" id="ws-backup-file-input" accept=".json" style="display:none;">';
    html += '</div>';
    html += '<textarea id="ws-backup-paste" placeholder="ëë ì¬ê¸°ì ë°±ì JSONì ë¶ì¬ë£ê¸°..." style="width:100%;height:80px;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;display:none;"></textarea>';
    html += '<button id="ws-backup-paste-apply" style="padding:10px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:none;">â ë¶ì¬ë£ê¸° ë°ì´í° ì ì©</button>';
    html += '<button id="ws-backup-reset" style="padding:10px;background:#fff;color:#e53e3e;border:1px solid #fecaca;border-radius:8px;font-size:12px;cursor:pointer;margin-top:8px;">ðï¸ ëª¨ë  ì¤ì  ì´ê¸°í</button>';
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
      window.WS.showToast('ë°±ì íì¼ì´ ë¤ì´ë¡ëëììµëë¤', 'success');
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
          window.WS.showToast('ë°±ì ë°ì´í°ê° í´ë¦½ë³´ëì ë³µì¬ëììµëë¤', 'success');
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
      if (!text) { window.WS.showToast('ë¶ì¬ë£ê¸°í  ë°ì´í°ê° ììµëë¤', 'warning'); return; }
      window.WS._applyBackup(text, modal);
    });

    // Reset all
    document.getElementById('ws-backup-reset').addEventListener('click', function() {
      if (!confirm('ì ë§ ëª¨ë  ì¤ì ì ì´ê¸°ííìê² ìµëê¹?\nì¦ê²¨ì°¾ê¸°, ë©ëª¨, ê³ ê°í´ë ë± ëª¨ë  ë°ì´í°ê° ì­ì ë©ëë¤.')) return;
      window.WS._backupKeys.forEach(function(key) {
        localStorage.removeItem(key);
      });
      window.WS.showToast('ëª¨ë  ì¤ì ì´ ì´ê¸°íëììµëë¤', 'success');
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
        window.WS.showToast('ë³µìí  ë°ì´í°ê° ììµëë¤. ì¬ë°ë¥¸ ë°±ì íì¼ì¸ì§ íì¸íì¸ì.', 'warning');
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

      window.WS.showToast(restoredCount + 'ê° í­ëª©ì´ ë³µìëììµëë¤', 'success');
      if (modal) modal.remove();
    } catch(e) {
      window.WS.showToast('ë°±ì íì¼ íìì´ ì¬ë°ë¥´ì§ ììµëë¤: ' + e.message, 'error');
    }
  };

  // ========== Section AE: ì§ì­ë³ ìì¸ ë¶ì ì°¨í¸ ==========
  window.WS.showMarketAnalysis = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) {
      window.WS.showToast('ë§¤ë¬¼ ë°ì´í°ê° ììµëë¤', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-market');
    if (existing) existing.remove();

    // 1) ì§ì­ë³ íê·  ë³´ì¦ê¸ ë¶ì
    var regionStats = {};
    var typeStats = {};
    var dealStats = {};
    var priceRanges = { '1000ë§ ì´í': 0, '1000~3000ë§': 0, '3000~5000ë§': 0, '5000ë§~1ìµ': 0, '1ìµ~3ìµ': 0, '3ìµ ì´ì': 0 };

    allData.forEach(function(item) {
      // ì§ì­ ì¶ì¶ (ì£¼ììì êµ¬ ë¨ì)
      var addr = item.address || '';
      var guMatch = addr.match(/([ê°-í£]+[êµ¬êµ°ì])/);
      var gu = guMatch ? guMatch[1] : 'ê¸°í';

      var dep = parseFloat(String(item.deposit || 0).replace(/[^0-9.]/g, '')) || 0;
      var monthly = parseFloat(String(item.monthly || 0).replace(/[^0-9.]/g, '')) || 0;
      var salePrice = parseFloat(String(item.price || 0).replace(/[^0-9.]/g, '')) || 0;
      var area = parseFloat(item.area_m2 || 0) || 1;

      // ì§ì­ë³
      if (!regionStats[gu]) regionStats[gu] = { count: 0, totalDeposit: 0, totalMonthly: 0, totalArea: 0 };
      regionStats[gu].count++;
      regionStats[gu].totalDeposit += dep;
      regionStats[gu].totalMonthly += monthly;
      regionStats[gu].totalArea += area;

      // ì íë³
      var type = item.type || 'ê¸°í';
      if (!typeStats[type]) typeStats[type] = { count: 0, totalDeposit: 0, totalMonthly: 0 };
      typeStats[type].count++;
      typeStats[type].totalDeposit += dep;
      typeStats[type].totalMonthly += monthly;

      // ê±°ëë°©ìë³
      var deal = item.deal || 'ê¸°í';
      if (!dealStats[deal]) dealStats[deal] = { count: 0, totalDeposit: 0, totalMonthly: 0, totalSale: 0 };
      dealStats[deal].count++;
      dealStats[deal].totalDeposit += dep;
      dealStats[deal].totalMonthly += monthly;
      dealStats[deal].totalSale += salePrice;

      // ê°ê²©ë ë¶í¬
      var mainPrice = dep || salePrice;
      if (mainPrice <= 1000) priceRanges['1000ë§ ì´í']++;
      else if (mainPrice <= 3000) priceRanges['1000~3000ë§']++;
      else if (mainPrice <= 5000) priceRanges['3000~5000ë§']++;
      else if (mainPrice <= 10000) priceRanges['5000ë§~1ìµ']++;
      else if (mainPrice <= 30000) priceRanges['1ìµ~3ìµ']++;
      else priceRanges['3ìµ ì´ì']++;
    });

    var modal = document.createElement('div');
    modal.id = 'ws-modal-market';
    modal.className = 'ws-modal';
    modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;max-width:750px;width:95%;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">';
    html += '<h2 style="font-size:20px;font-weight:800;color:#d97706;margin:0;">ð ìì¸ ë¶ì ë¦¬í¬í¸</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">â</button>';
    html += '</div>';
    html += '<div style="font-size:11px;color:#888;margin-bottom:16px;">ë³´ì  ë§¤ë¬¼ ' + allData.length + 'ê±´ ê¸°ì¤ Â· ' + new Date().toLocaleDateString('ko-KR') + '</div>';

    // ââ í­ ìì­ ââ
    html += '<div id="ws-market-tabs" style="display:flex;gap:6px;margin-bottom:16px;border-bottom:2px solid #eee;padding-bottom:8px;">';
    html += '<button data-mtab="region" style="padding:6px 14px;border:none;border-radius:8px 8px 0 0;font-size:12px;cursor:pointer;background:#d97706;color:#fff;font-weight:700;">ðºï¸ ì§ì­ë³</button>';
    html += '<button data-mtab="type" style="padding:6px 14px;border:none;border-radius:8px 8px 0 0;font-size:12px;cursor:pointer;background:#f5f5f5;color:#888;">ð  ì íë³</button>';
    html += '<button data-mtab="price" style="padding:6px 14px;border:none;border-radius:8px 8px 0 0;font-size:12px;cursor:pointer;background:#f5f5f5;color:#888;">ð° ê°ê²©ë</button>';
    html += '<button data-mtab="deal" style="padding:6px 14px;border:none;border-radius:8px 8px 0 0;font-size:12px;cursor:pointer;background:#f5f5f5;color:#888;">ð ê±°ëë³</button>';
    html += '</div>';

    // ââ ì§ì­ë³ ì°¨í¸ ââ
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
      html += '<span style="font-size:11px;color:#888;">' + s.count + 'ê±´ Â· íê·  ' + escHtml(String(avgArea)) + 'mÂ²</span>';
      html += '</div>';
      html += '<div style="display:flex;align-items:center;gap:8px;">';
      html += '<div style="flex:1;background:#f5f5f5;border-radius:6px;height:28px;overflow:hidden;position:relative;">';
      html += '<div style="width:' + barWidth + '%;height:100%;background:linear-gradient(90deg,#d97706,#f59e0b);border-radius:6px;transition:width 0.5s;"></div>';
      html += '<span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:600;color:#555;">ë³´ì¦ê¸ íê·  ' + escHtml(String(avgDep)) + 'ë§</span>';
      html += '</div>';
      if (avgMonthly > 0) {
        html += '<span style="font-size:10px;color:#e53e3e;white-space:nowrap;font-weight:600;">ì ' + escHtml(String(avgMonthly)) + 'ë§</span>';
      }
      html += '</div></div>';
    });
    html += '</div>';

    // ââ ì íë³ ì°¨í¸ ââ
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
      html += '<span style="font-size:12px;font-weight:600;">' + s.count + 'ê±´ (' + pct + '%)</span>';
      html += '</div>';
      html += '</div>';
      html += '<div style="text-align:right;min-width:120px;">';
      html += '<div style="font-size:12px;font-weight:600;color:#333;">ë³´ì¦ê¸ ' + escHtml(String(avgDep)) + 'ë§</div>';
      if (avgMonthly > 0) html += '<div style="font-size:10px;color:#e53e3e;">ìì¸ ' + escHtml(String(avgMonthly)) + 'ë§</div>';
      html += '</div></div>';
    });
    html += '</div>';

    // ââ ê°ê²©ë ë¶í¬ ââ
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
      html += '<span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:600;color:#333;">' + count + 'ê±´ (' + pct + '%)</span>';
      html += '</div></div>';
    });
    html += '</div>';

    // ââ ê±°ëë°©ìë³ ââ
    html += '<div id="ws-market-deal" class="ws-market-panel" style="display:none;">';
    var dealKeys = Object.keys(dealStats).sort(function(a, b) { return dealStats[b].count - dealStats[a].count; });
    var dealColors = { 'ìì¸': '#e53e3e', 'ì ì¸': '#3182ce', 'ì ìì¸': '#805ad5', 'ë§¤ë§¤': '#d97706' };

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
      html += '<span style="font-size:12px;color:#888;">' + s.count + 'ê±´ (' + pct + '%)</span>';
      html += '</div>';
      html += '<div style="display:flex;gap:16px;flex-wrap:wrap;">';
      if (avgDep > 0) html += '<div style="font-size:12px;"><span style="color:#888;">íê·  ë³´ì¦ê¸</span> <strong style="color:#333;">' + escHtml(String(avgDep)) + 'ë§</strong></div>';
      if (avgMonthly > 0) html += '<div style="font-size:12px;"><span style="color:#888;">íê·  ìì¸</span> <strong style="color:#e53e3e;">' + escHtml(String(avgMonthly)) + 'ë§</strong></div>';
      if (avgSale > 0) html += '<div style="font-size:12px;"><span style="color:#888;">íê·  ë§¤ë§¤ê°</span> <strong style="color:#d97706;">' + escHtml(String(avgSale)) + 'ë§</strong></div>';
      html += '</div></div>';
    });
    html += '</div>';

    // ââ ìì½ ì¸ì¬ì´í¸ ââ
    html += '<div style="margin-top:16px;padding:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#d97706;margin-bottom:8px;">ð¡ ì¸ì¬ì´í¸</div>';

    // ê°ì¥ ë§¤ë¬¼ ë§ì ì§ì­
    var topRegion = regionKeys.length > 0 ? regionKeys[0] : '-';
    var topRegionCount = regionKeys.length > 0 ? regionStats[regionKeys[0]].count : 0;
    // ê°ì¥ ë¹ì¼ ì§ì­
    var expensiveRegion = regionKeys.reduce(function(best, gu) {
      var avg = regionStats[gu].count > 0 ? regionStats[gu].totalDeposit / regionStats[gu].count : 0;
      var bestAvg = best ? (regionStats[best].count > 0 ? regionStats[best].totalDeposit / regionStats[best].count : 0) : 0;
      return avg > bestAvg ? gu : best;
    }, regionKeys[0] || '-');
    var expAvg = expensiveRegion && regionStats[expensiveRegion] ? Math.round(regionStats[expensiveRegion].totalDeposit / regionStats[expensiveRegion].count) : 0;

    html += '<div style="font-size:12px;color:#555;line-height:1.8;">';
    html += 'â¢ ë§¤ë¬¼ ì§ì¤ ì§ì­: <strong>' + escHtml(topRegion) + '</strong> (' + topRegionCount + 'ê±´)<br>';
    html += 'â¢ íê·  ë³´ì¦ê¸ ìµê³  ì§ì­: <strong>' + escHtml(expensiveRegion) + '</strong> (' + escHtml(String(expAvg)) + 'ë§ì)<br>';
    html += 'â¢ ê°ì¥ ë§ì ê±°ëì í: <strong>' + escHtml(dealKeys.length > 0 ? dealKeys[0] : '-') + '</strong><br>';
    html += 'â¢ ê°ì¥ ë§ì ë§¤ë¬¼ì í: <strong>' + escHtml(typeKeys.length > 0 ? typeKeys[0] : '-') + '</strong>';
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

  // ========== Section AF: ë§¤ë¬¼ íì ì¨/ì¬ê³  ë¶ì ==========
  window.WS.showTurnoverAnalysis = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) {
      window.WS.showToast('ë§¤ë¬¼ ë°ì´í°ê° ììµëë¤', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-turnover');
    if (existing) existing.remove();

    var now = new Date();
    var totalActive = 0;
    var totalDays = 0;
    var ageGroups = { '1ì£¼ì¼ ì´ë´': [], '2ì£¼ì¼ ì´ë´': [], '1ê°ì ì´ë´': [], '1~2ê°ì': [], '2ê°ì ì´ì': [] };
    var typeAge = {};
    var regionAge = {};
    var longStay = []; // 30ì¼ ì´ì ì²´ë¥

    allData.forEach(function(item) {
      var regDate = new Date(item.created_at || item.registered_at || item.date);
      if (isNaN(regDate.getTime())) return;

      var days = Math.floor((now - regDate) / (1000 * 60 * 60 * 24));
      totalActive++;
      totalDays += days;

      // Age group classification
      if (days <= 7) ageGroups['1ì£¼ì¼ ì´ë´'].push(item);
      else if (days <= 14) ageGroups['2ì£¼ì¼ ì´ë´'].push(item);
      else if (days <= 30) ageGroups['1ê°ì ì´ë´'].push(item);
      else if (days <= 60) ageGroups['1~2ê°ì'].push(item);
      else ageGroups['2ê°ì ì´ì'].push(item);

      // By type
      var type = item.type || 'ê¸°í';
      if (!typeAge[type]) typeAge[type] = { count: 0, totalDays: 0 };
      typeAge[type].count++;
      typeAge[type].totalDays += days;

      // By region
      var addr = item.address || '';
      var guMatch = addr.match(/([ê°-í£]+[êµ¬êµ°ì])/);
      var gu = guMatch ? guMatch[1] : 'ê¸°í';
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
    html += '<h2 style="font-size:20px;font-weight:800;color:#0891b2;margin:0;">ð ë§¤ë¬¼ íì ì¨ ë¶ì</h2>';
    html += '<button class="ws-modal-close" style="width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer;">â</button>';
    html += '</div>';

    // ââ Summary cards ââ
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">';

    var newThisWeek = ageGroups['1ì£¼ì¼ ì´ë´'].length;
    var longCount = longStay.length;
    var freshRate = totalActive > 0 ? Math.round(((ageGroups['1ì£¼ì¼ ì´ë´'].length + ageGroups['2ì£¼ì¼ ì´ë´'].length) / totalActive) * 100) : 0;

    var cards = [
      { label: 'ì ì²´ ë§¤ë¬¼', value: totalActive + 'ê±´', color: '#0891b2', icon: 'ð ' },
      { label: 'íê·  ë±ë¡ì¼ì', value: avgDays + 'ì¼', color: avgDays > 30 ? '#e53e3e' : '#059669', icon: 'ð' },
      { label: 'ì ê·(1ì£¼)', value: newThisWeek + 'ê±´', color: '#059669', icon: 'ð' },
      { label: 'ì¥ê¸°ì²´ë¥(30ì¼+)', value: longCount + 'ê±´', color: longCount > 5 ? '#e53e3e' : '#d97706', icon: 'â°' }
    ];

    cards.forEach(function(c) {
      html += '<div style="background:#f8f8f8;border-radius:10px;padding:12px;text-align:center;border-top:3px solid ' + c.color + ';">';
      html += '<div style="font-size:20px;margin-bottom:4px;">' + c.icon + '</div>';
      html += '<div style="font-size:18px;font-weight:800;color:' + c.color + ';">' + c.value + '</div>';
      html += '<div style="font-size:10px;color:#888;">' + c.label + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // ââ ì¬ê³  ì°ë ¹ ë¶í¬ ë° ì°¨í¸ ââ
    html += '<div style="margin-bottom:20px;">';
    html += '<h3 style="font-size:14px;font-weight:700;color:#333;margin-bottom:10px;">ð ì¬ê³  ì°ë ¹ ë¶í¬</h3>';

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
      html += '<span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:600;color:#333;">' + count + 'ê±´ (' + pct + '%)</span>';
      html += '</div></div>';
    });
    html += '</div>';

    // ââ ì íë³ íê·  ì²´ë¥ì¼ ââ
    html += '<div style="margin-bottom:20px;">';
    html += '<h3 style="font-size:14px;font-weight:700;color:#333;margin-bottom:10px;">ð  ì íë³ íê·  ì²´ë¥ì¼</h3>';
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
      html += '<div style="font-size:18px;font-weight:800;color:' + txtColor + ';">' + avgD + 'ì¼</div>';
      html += '<div style="font-size:10px;color:#888;">' + s.count + 'ê±´</div>';
      html += '</div>';
    });
    html += '</div></div>';

    // ââ ì¥ê¸°ì²´ë¥ ë§¤ë¬¼ ë¦¬ì¤í¸ ââ
    if (longStay.length > 0) {
      html += '<div style="margin-bottom:16px;">';
      html += '<h3 style="font-size:14px;font-weight:700;color:#e53e3e;margin-bottom:10px;">â ï¸ ì¥ê¸°ì²´ë¥ ë§¤ë¬¼ (' + longStay.length + 'ê±´) â ê°ê²©/ì¡°ê±´ ì¬ê²í  íì</h3>';
      html += '<div style="max-height:200px;overflow-y:auto;">';

      longStay.slice(0, 10).forEach(function(e) {
        var l = e.listing;
        var urgencyColor = e.days >= 60 ? '#e53e3e' : '#d97706';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:4px;background:#fef2f2;border-radius:6px;border-left:3px solid ' + urgencyColor + ';cursor:pointer;font-size:12px;" data-turnover-id="' + l.id + '">';
        html += '<div style="min-width:40px;text-align:center;font-weight:800;color:' + urgencyColor + ';">' + e.days + 'ì¼</div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(l.title || 'ë§¤ë¬¼') + '</div>';
        html += '<div style="font-size:10px;color:#888;">' + escHtml(l.address || '') + ' Â· ' + escHtml(l.type || '') + '</div>';
        html += '</div>';
        html += '<div style="font-weight:600;color:#e53e3e;white-space:nowrap;">' + escHtml(l.deposit ? l.deposit + 'ë§' : (l.price ? l.price + 'ë§' : '-')) + '</div>';
        html += '</div>';
      });

      if (longStay.length > 10) {
        html += '<div style="text-align:center;padding:6px;font-size:11px;color:#888;">... ì¸ ' + (longStay.length - 10) + 'ê±´</div>';
      }
      html += '</div></div>';
    }

    // ââ ì¸ì¬ì´í¸ ââ
    html += '<div style="padding:14px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#0891b2;margin-bottom:8px;">ð¡ íì ì¨ ì¸ì¬ì´í¸</div>';
    html += '<div style="font-size:12px;color:#555;line-height:1.8;">';
    html += 'â¢ ì ì ë ì§ì: <strong>' + freshRate + '%</strong> (2ì£¼ ì´ë´ ë§¤ë¬¼ ë¹ì¨' + (freshRate >= 50 ? ' â ìí¸' : freshRate >= 30 ? ' â ë³´íµ' : ' â ê°±ì  íì') + ')<br>';

    // Slowest type
    if (typeKeys.length > 0 && typeAge[typeKeys[0]] && typeAge[typeKeys[0]].count > 0) {
      var slowest = typeKeys[0];
      var slowDays = Math.round(typeAge[slowest].totalDays / typeAge[slowest].count);
      html += 'â¢ ê°ì¥ ëë¦° ì í: <strong>' + escHtml(slowest) + '</strong> (íê·  ' + slowDays + 'ì¼)<br>';
    }

    // Fastest type
    if (typeKeys.length > 1 && typeAge[typeKeys[typeKeys.length - 1]] && typeAge[typeKeys[typeKeys.length - 1]].count > 0) {
      var fastest = typeKeys[typeKeys.length - 1];
      var fastDays = Math.round(typeAge[fastest].totalDays / typeAge[fastest].count);
      html += 'â¢ ê°ì¥ ë¹ ë¥¸ ì í: <strong>' + escHtml(fastest) + '</strong> (íê·  ' + fastDays + 'ì¼)<br>';
    }

    html += 'â¢ ì¥ê¸°ì²´ë¥ ë¹ì¨: <strong>' + (totalActive > 0 ? Math.round((longCount / totalActive) * 100) : 0) + '%</strong>';
    if (longCount > 0) html += ' â ê°ê²© ì¡°ì  ëë ë§¤ë¬¼ ê°±ì ì ê²í íì¸ì';
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

  // ========== Section AG: ë§¤ë¬¼ ìì¸ ë©ëª¨ ìëìì± íê·¸ ==========
  window.WS._memoQuickTags = [
    'â ì¦ììì£¼', 'ð ì´ì ë³´ê´', 'ð ì°ë½ìë£', 'ð íì¥íì¸íì',
    'ð° ê°ê²©íìê°ë¥', 'ð¨ ìë¦¬íì', 'â­ ì¶ì²ë§¤ë¬¼', 'ð« ê³ì½ë¶ê°',
    'ð¸ ì¬ì§ì´¬ìíì', 'ðï¸ ë¦¬ëª¨ë¸ë§', 'ð¤ ì§ì£¼ì¸ì§ê±°ë', 'ð ìë¥íì¸ì¤'
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
  // Section AH: ë§¤ë¬¼ PDF ë¸ë¦¬í ìë£ ìì±
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
      window.WS.showToast('PDFë¡ ë´ë³´ë¼ ë§¤ë¬¼ì ë¨¼ì  ì íí´ì£¼ì¸ì', 'warning');
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
    html += '<div><div style="font-size:18px;font-weight:800;">ð PDF ë¸ë¦¬í ìë£</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + selected.length + 'ê±´ ë§¤ë¬¼ Â· ê³ ê° ì ë¬ì© ì ë¬¸ ìë£</div></div>';
    html += '<button id="ws-pdf-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    // ì¤ì  ìµì
    html += '<div style="padding:20px 24px;border-bottom:1px solid #eee;">';
    html += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:12px;">ð í¬í¨ í­ëª© ì¤ì </div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    var pdfOpts = [
      { id: 'pdf-opt-photo', label: 'ð¸ ëíì¬ì§', checked: true },
      { id: 'pdf-opt-price', label: 'ð° ê°ê²©ì ë³´', checked: true },
      { id: 'pdf-opt-area', label: 'ð ë©´ì /êµ¬ì¡°', checked: true },
      { id: 'pdf-opt-extra', label: 'ð  ì¶ê°ì ë³´', checked: true },
      { id: 'pdf-opt-memo', label: 'ð ë©ëª¨/í¹ì´ì¬í­', checked: true },
      { id: 'pdf-opt-map', label: 'ðºï¸ ìì¹ì ë³´', checked: true },
      { id: 'pdf-opt-desc', label: 'ð ìì¸ì¤ëª', checked: false },
      { id: 'pdf-opt-category', label: 'ð·ï¸ ì¹´íê³ ë¦¬', checked: true }
    ];
    pdfOpts.forEach(function(opt) {
      html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#555;cursor:pointer;">';
      html += '<input type="checkbox" id="' + opt.id + '"' + (opt.checked ? ' checked' : '') + ' style="accent-color:#2D5A27;"> ' + opt.label;
      html += '</label>';
    });
    html += '</div>';

    // ê³ ê°ëª ìë ¥
    html += '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;">';
    html += '<label style="font-size:13px;font-weight:600;color:#555;">ê³ ê°ëª:</label>';
    html += '<input type="text" id="ws-pdf-customer" placeholder="ì: ê¹ì² ì ê³ ê°ë" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;">';
    html += '</div>';
    html += '</div>';

    // ë¯¸ë¦¬ë³´ê¸°
    html += '<div style="padding:20px 24px;">';
    html += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:12px;">ðï¸ ë¯¸ë¦¬ë³´ê¸°</div>';
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
      if (listing.deal === 'ìì¸') {
        html += 'ë³´ì¦ê¸ ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + 'ìµ') : ((listing.deposit || 0) + 'ë§')) + ' / ìì¸ ' + (listing.monthly || 0) + 'ë§ì';
      } else if (listing.deal === 'ì ì¸') {
        html += 'ì ì¸ê¸ ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + 'ìµ') : ((listing.deposit || 0) + 'ë§')) + 'ì';
      } else {
        html += 'ë§¤ë§¤ê° ' + ((listing.price || 0) >= 10000 ? ((listing.price/10000).toFixed(1) + 'ìµ') : ((listing.price || 0) + 'ë§')) + 'ì';
      }
      html += '</div></div></div>';
    });

    html += '</div></div>';

    // ë²í¼
    html += '<div style="padding:16px 24px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;">';
    html += '<button id="ws-pdf-html-export" style="padding:10px 20px;background:#f0f0f0;border:1px solid #ddd;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">ð¨ï¸ ì¸ìì© HTML</button>';
    html += '<button id="ws-pdf-clipboard" style="padding:10px 20px;background:#e8f5e9;border:1px solid #4CAF50;color:#2D5A27;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">ð íì¤í¸ ë³µì¬</button>';
    html += '<button id="ws-pdf-generate" style="padding:10px 24px;background:linear-gradient(135deg,#2D5A27,#4CAF50);border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;">ð PDF ìì±</button>';
    html += '</div></div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    // Events
    document.getElementById('ws-pdf-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // PDF ìì± (ì¸ì ë°©ì)
    document.getElementById('ws-pdf-generate').addEventListener('click', function() {
      window.WS._generatePrintablePDF(selected, memos, favCats);
    });

    // ì¸ìì© HTML
    document.getElementById('ws-pdf-html-export').addEventListener('click', function() {
      window.WS._generatePrintablePDF(selected, memos, favCats);
    });

    // íì¤í¸ ë³µì¬
    document.getElementById('ws-pdf-clipboard').addEventListener('click', function() {
      var customerName = document.getElementById('ws-pdf-customer').value || '';
      var text = '';
      if (customerName) text += 'ð ' + customerName + 'ëì ìí ë§¤ë¬¼ ìë´ì\n';
      text += 'ââââââââââââââââââââ\n';
      text += 'ð¢ WISHES ë¶ëì° ë§¤ë¬¼ ë¸ë¦¬í\n';
      text += 'ð ìì±ì¼: ' + new Date().toLocaleDateString('ko-KR') + '\n';
      text += 'ââââââââââââââââââââ\n\n';

      selected.forEach(function(listing, idx) {
        text += 'ã' + (idx + 1) + 'ã ' + (listing.title || '-') + '\n';
        text += 'ð ì£¼ì: ' + (listing.address || '-') + '\n';
        text += 'ð° ê±°ë: ' + (listing.deal || '-');
        if (listing.deal === 'ìì¸') {
          text += ' Â· ë³´ì¦ê¸ ' + (listing.deposit || 0) + 'ë§ / ìì¸ ' + (listing.monthly || 0) + 'ë§\n';
        } else if (listing.deal === 'ì ì¸') {
          text += ' Â· ì ì¸ê¸ ' + (listing.deposit || 0) + 'ë§ì\n';
        } else {
          text += ' Â· ë§¤ë§¤ê° ' + (listing.price || 0) + 'ë§ì\n';
        }
        text += 'ð ë©´ì : ' + (listing.area_m2 || '-') + 'mÂ² (' + (listing.area_m2 ? (listing.area_m2 / 3.30579).toFixed(1) : '-') + 'í)\n';
        text += 'ð  ì í: ' + (listing.type || '-') + ' Â· ' + (listing.floor_current || '-') + '/' + (listing.floor_total || '-') + 'ì¸µ\n';
        if (listing.direction) text += 'ð§­ ë°©í¥: ' + listing.direction + '\n';
        if (listing.parking) text += 'ð¿ï¸ ì£¼ì°¨: ' + listing.parking + '\n';
        if (listing.elevator) text += 'ð ìë¦¬ë² ì´í°: ' + listing.elevator + '\n';
        var memo = memos[listing.id];
        if (memo) text += 'ð ë©ëª¨: ' + memo + '\n';
        text += '\n';
      });

      text += 'ââââââââââââââââââââ\n';
      text += 'WISHES | wishes.co.kr\n';
      text += 'ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì° ìë¹ì¤\n';

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast('ë¸ë¦¬í íì¤í¸ê° ë³µì¬ëììµëë¤!', 'success');
        }).catch(function() {
          window.WS._fallbackCopy(text);
        });
      } else {
        window.WS._fallbackCopy(text);
      }
    });
  };

  // PDFì© ì¸ì íì´ì§ ìì±
  window.WS._generatePrintablePDF = function(selected, memos, favCats) {
    var customerName = document.getElementById('ws-pdf-customer') ? document.getElementById('ws-pdf-customer').value : '';
    var opts = {};
    ['pdf-opt-photo','pdf-opt-price','pdf-opt-area','pdf-opt-extra','pdf-opt-memo','pdf-opt-map','pdf-opt-desc','pdf-opt-category'].forEach(function(id) {
      var el = document.getElementById(id);
      opts[id] = el ? el.checked : true;
    });

    var printHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>WISHES ë§¤ë¬¼ ë¸ë¦¬í</title>';
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

    // íì§
    printHtml += '<div class="cover">';
    printHtml += '<div style="font-size:60px;margin-bottom:20px;">ð </div>';
    printHtml += '<h1>WISHES ë§¤ë¬¼ ë¸ë¦¬í</h1>';
    if (customerName) printHtml += '<div class="sub">' + escHtml(customerName) + 'ëì ìí ë§ì¶¤ ë§¤ë¬¼ ìë´</div>';
    printHtml += '<div class="sub">' + selected.length + 'ê±´ì ìì ë ë§¤ë¬¼ ì ë³´</div>';
    printHtml += '<div class="date">' + new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' }) + ' ìì±</div>';
    printHtml += '<div style="margin-top:40px;padding-top:20px;border-top:2px solid #e8f5e9;">';
    printHtml += '<div style="font-size:14px;color:#2D5A27;font-weight:700;">WISHES | ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì° ìë¹ì¤</div>';
    printHtml += '<div style="font-size:12px;color:#888;margin-top:4px;">wishes.co.kr</div>';
    printHtml += '</div></div>';

    // ë§¤ë¬¼ ëª©ë¡
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

      // ê°ê²©
      if (opts['pdf-opt-price']) {
        printHtml += '<div class="price-tag">';
        if (listing.deal === 'ìì¸') {
          printHtml += 'ë³´ì¦ê¸ ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + 'ìµ') : ((listing.deposit || 0) + 'ë§')) + ' / ìì¸ ' + (listing.monthly || 0) + 'ë§ì';
        } else if (listing.deal === 'ì ì¸') {
          printHtml += 'ì ì¸ê¸ ' + ((listing.deposit || 0) >= 10000 ? ((listing.deposit/10000).toFixed(1) + 'ìµ') : ((listing.deposit || 0) + 'ë§')) + 'ì';
        } else {
          printHtml += 'ë§¤ë§¤ê° ' + ((listing.price || 0) >= 10000 ? ((listing.price/10000).toFixed(1) + 'ìµ') : ((listing.price || 0) + 'ë§')) + 'ì';
        }
        if (listing.maintenance_fee) printHtml += ' <span style="font-size:11px;color:#888;">(ê´ë¦¬ë¹ ' + listing.maintenance_fee + 'ë§)</span>';
        printHtml += '</div>';
      }

      printHtml += '<div style="font-size:12px;color:#666;margin-bottom:8px;">ð ' + escHtml(listing.address || '-') + '</div>';

      // ì ë³´ ê·¸ë¦¬ë
      if (opts['pdf-opt-area']) {
        printHtml += '<div class="info-grid">';
        printHtml += '<div class="info-item"><span class="info-label">ë©´ì </span><span class="info-value">' + (listing.area_m2 || '-') + 'mÂ² (' + (listing.area_m2 ? (listing.area_m2 / 3.30579).toFixed(1) : '-') + 'í)</span></div>';
        printHtml += '<div class="info-item"><span class="info-label">ì¸µì</span><span class="info-value">' + (listing.floor_current || '-') + '/' + (listing.floor_total || '-') + 'ì¸µ</span></div>';
        printHtml += '<div class="info-item"><span class="info-label">ì í</span><span class="info-value">' + escHtml(listing.type || '-') + '</span></div>';
        printHtml += '<div class="info-item"><span class="info-label">ë°©/ìì¤</span><span class="info-value">' + (listing.rooms || '-') + '/' + (listing.bathrooms || '-') + '</span></div>';
        printHtml += '</div>';
      }

      if (opts['pdf-opt-extra']) {
        printHtml += '<div class="info-grid">';
        if (listing.direction) printHtml += '<div class="info-item"><span class="info-label">ë°©í¥</span><span class="info-value">' + escHtml(listing.direction) + '</span></div>';
        if (listing.parking) printHtml += '<div class="info-item"><span class="info-label">ì£¼ì°¨</span><span class="info-value">' + escHtml(listing.parking) + '</span></div>';
        if (listing.elevator) printHtml += '<div class="info-item"><span class="info-label">ìë² </span><span class="info-value">' + listing.elevator + '</span></div>';
        if (listing.pet) printHtml += '<div class="info-item"><span class="info-label">ë°ë ¤ëë¬¼</span><span class="info-value">' + listing.pet + '</span></div>';
        if (listing.built_year) printHtml += '<div class="info-item"><span class="info-label">ì¤ê³µ</span><span class="info-value">' + listing.built_year + '</span></div>';
        printHtml += '</div>';
      }

      if (opts['pdf-opt-desc'] && listing.description) {
        printHtml += '<div style="margin-top:8px;font-size:11px;color:#555;line-height:1.6;border-top:1px solid #f0f0f0;padding-top:8px;">' + escHtml(listing.description).substring(0, 200) + '</div>';
      }

      if (opts['pdf-opt-memo'] && memos[listing.id]) {
        printHtml += '<div class="memo-box">ð ' + escHtml(memos[listing.id]) + '</div>';
      }

      if (opts['pdf-opt-map'] && listing.lat && listing.lng) {
        printHtml += '<div style="margin-top:8px;font-size:11px;color:#888;">ðºï¸ ì¢í: ' + listing.lat.toFixed(4) + ', ' + listing.lng.toFixed(4) + '</div>';
      }

      printHtml += '</div></div>';
    });

    // í¸í°
    printHtml += '<div class="footer">';
    printHtml += 'ë³¸ ìë£ë WISHES(wishes.co.kr)ìì ìì±ë ë§¤ë¬¼ ë¸ë¦¬í ìë£ìëë¤.<br>';
    printHtml += 'ìê¸° ì ë³´ë ì°¸ê³ ì©ì´ë©°, ì¤ì  ê³ì½ ì íì¥ íì¸ì´ íìí©ëë¤.';
    printHtml += '</div>';
    printHtml += '</body></html>';

    var printWin = window.open('', '_blank', 'width=800,height=600');
    if (printWin) {
      printWin.document.write(printHtml);
      printWin.document.close();
      setTimeout(function() { printWin.print(); }, 500);
      window.WS.showToast('PDF ë¸ë¦¬í ìë£ê° ìì±ëììµëë¤. ì¸ì ëíìììì PDFë¡ ì ì¥í´ì£¼ì¸ì.', 'success');
    } else {
      window.WS.showToast('íìì´ ì°¨ë¨ëììµëë¤. íì ì°¨ë¨ì í´ì í´ì£¼ì¸ì.', 'error');
    }
  };

  // ============================================================================
  // Section AI: ë§¤ë¬¼ ì¤ëì· ë¹êµ (ê°ê²© ë³ë ê°ì§)
  // ============================================================================
  window.WS._snapshotKey = 'ws_price_snapshots';

  window.WS._getSnapshots = function() {
    try { return JSON.parse(localStorage.getItem(window.WS._snapshotKey) || '{}'); } catch(e) { return {}; }
  };

  window.WS._saveSnapshots = function(data) {
    _safeSetItem(window.WS._snapshotKey, JSON.stringify(data));
  };

  // ìë ì¤ëì· ì ì¥ (ë°ì´í° ë¡ë ì í¸ì¶)
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
        // ê°ê²© ë³ë ê°ì§
        if (prev.price !== current.price && (prev.price > 0 || current.price > 0)) {
          changes.push({ listing: listing, field: 'ë§¤ë§¤ê°', from: prev.price, to: current.price, date: prev.date });
        }
        if (prev.deposit !== current.deposit && (prev.deposit > 0 || current.deposit > 0)) {
          changes.push({ listing: listing, field: 'ë³´ì¦ê¸', from: prev.deposit, to: current.deposit, date: prev.date });
        }
        if (prev.monthly !== current.monthly && (prev.monthly > 0 || current.monthly > 0)) {
          changes.push({ listing: listing, field: 'ìì¸', from: prev.monthly, to: current.monthly, date: prev.date });
        }
        if (prev.status !== current.status && prev.status && current.status) {
          changes.push({ listing: listing, field: 'ìí', from: prev.status, to: current.status, date: prev.date });
        }
      }

      snapshots[id] = current;
    });

    window.WS._saveSnapshots(snapshots);
    window.WS._latestChanges = changes;

    // ë³ë ìì¼ë©´ ìë¦¼
    if (changes.length > 0) {
      window.WS._showPriceChangeAlert(changes);
    }
  };

  window.WS._showPriceChangeAlert = function(changes) {
    var alertDiv = document.createElement('div');
    alertDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#fff;border-left:4px solid #ed8936;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,0.15);padding:16px 20px;z-index:100001;max-width:350px;animation:slideInRight 0.4s ease;';
    alertDiv.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<div style="font-size:14px;font-weight:700;color:#ed8936;">ð ë§¤ë¬¼ ë³ë ê°ì§!</div>' +
      '<button onclick="this.closest(\'div\').remove()" style="background:none;border:none;cursor:pointer;font-size:16px;color:#999;">â</button></div>' +
      '<div style="font-size:13px;color:#555;">' + changes.length + 'ê±´ì ê°ê²©/ìí ë³ëì´ ë°ê²¬ëììµëë¤.</div>' +
      '<button id="ws-view-changes-alert" style="margin-top:10px;width:100%;padding:8px;background:#ed8936;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">ìì¸í ë³´ê¸°</button>';

    (document.querySelector('.ws-search-container') || document.body).appendChild(alertDiv);

    document.getElementById('ws-view-changes-alert').addEventListener('click', function() {
      alertDiv.remove();
      window.WS.showPriceChanges();
    });

    // 10ì´ í ìë ë«ê¸°
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
    html += '<div><div style="font-size:18px;font-weight:800;">ð ë§¤ë¬¼ ë³ë ë´ì­</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + changes.length + 'ê±´ì ë³ë ê°ì§</div></div>';
    html += '<button id="ws-changes-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    html += '<div style="padding:16px 24px;">';

    if (changes.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:#999;">';
      html += '<div style="font-size:40px;margin-bottom:12px;">â</div>';
      html += '<div style="font-size:14px;">ê°ê²© ë³ë ìì</div>';
      html += '<div style="font-size:12px;margin-top:4px;">ëª¨ë  ë§¤ë¬¼ ê°ê²©ì´ ì´ì ê³¼ ëì¼í©ëë¤.</div>';
      html += '</div>';
    } else {
      changes.forEach(function(c, idx) {
        var diff = c.to - c.from;
        var isUp = diff > 0;
        var arrow = isUp ? 'ð' : 'ð';
        var diffColor = isUp ? '#e53e3e' : '#2D5A27';
        var diffText = (isUp ? '+' : '') + diff;

        html += '<div style="display:flex;gap:12px;padding:12px;' + (idx > 0 ? 'border-top:1px solid #f0f0f0;' : '') + 'border-radius:8px;cursor:pointer;" data-change-id="' + c.listing.id + '">';
        html += '<div style="font-size:24px;line-height:1;">' + arrow + '</div>';
        html += '<div style="flex:1;">';
        html += '<div style="font-size:13px;font-weight:700;color:#333;">' + escHtml(c.listing.title || '-') + '</div>';
        html += '<div style="font-size:12px;color:#888;margin-top:2px;">' + escHtml(c.listing.address || '-') + '</div>';
        html += '<div style="margin-top:6px;display:flex;align-items:center;gap:8px;">';
        html += '<span style="font-size:12px;color:#999;">' + escHtml(c.field) + '</span>';
        html += '<span style="font-size:12px;color:#999;text-decoration:line-through;">' + c.from + 'ë§</span>';
        html += '<span style="font-size:12px;">â</span>';
        html += '<span style="font-size:13px;font-weight:700;color:' + diffColor + ';">' + c.to + 'ë§</span>';
        html += '<span style="font-size:11px;color:' + diffColor + ';background:' + (isUp ? '#fef2f2' : '#f0fdf4') + ';padding:2px 6px;border-radius:10px;">' + diffText + 'ë§</span>';
        html += '</div>';
        if (c.date) html += '<div style="font-size:10px;color:#bbb;margin-top:4px;">ì´ì  ê¸°ë¡: ' + c.date + '</div>';
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
  // Section AJ: ë§¤ë¬¼ ì¦ê²¨ì°¾ê¸° ë¹êµ ë¶ìí
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
      window.WS.showToast('ë¹êµí  ì¦ê²¨ì°¾ê¸° ë§¤ë¬¼ì´ 2ê° ì´ì íìí©ëë¤', 'warning');
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
    html += '<div><div style="font-size:18px;font-weight:800;">âï¸ ì¦ê²¨ì°¾ê¸° ë¹êµ ë¶ìí</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + favListings.length + 'ê° ë§¤ë¬¼ ìì¸ ë¹êµ</div></div>';
    html += '<button id="ws-fav-compare-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    // ë¹êµ íì´ë¸
    html += '<div style="padding:0;overflow-x:auto;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';

    // í¤ë
    html += '<thead><tr><th style="background:#f8f5ff;padding:12px 14px;text-align:left;font-weight:700;color:#7c3aed;border-bottom:2px solid #e9e3ff;min-width:100px;position:sticky;left:0;z-index:1;">í­ëª©</th>';
    favListings.forEach(function(l) {
      html += '<th style="background:#f8f5ff;padding:12px 14px;text-align:center;font-weight:700;color:#333;border-bottom:2px solid #e9e3ff;min-width:150px;">' + escHtml(l.title || '-').substring(0, 15) + '</th>';
    });
    html += '</tr></thead><tbody>';

    // ì¬ì§ í
    html += '<tr><td style="padding:10px 14px;font-weight:600;color:#7c3aed;background:#faf8ff;border-bottom:1px solid #f0f0f0;">ð¸ ì¬ì§</td>';
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

    // ë¹êµ í­ëª©ë¤
    var compareFields = [
      { label: 'ð° ê±°ëì í', fn: function(l) { return l.deal || '-'; } },
      { label: 'ðµ ê°ê²©', fn: function(l) {
        if (l.deal === 'ìì¸') return 'ë³´ì¦ê¸ ' + (l.deposit || 0) + 'ë§\nìì¸ ' + (l.monthly || 0) + 'ë§';
        if (l.deal === 'ì ì¸') return 'ì ì¸ê¸ ' + (l.deposit || 0) + 'ë§';
        return 'ë§¤ë§¤ê° ' + (l.price || 0) + 'ë§';
      }},
      { label: 'ð  ì í', fn: function(l) { return l.type || '-'; } },
      { label: 'ð ì£¼ì', fn: function(l) { return (l.address || '-').substring(0, 25); } },
      { label: 'ð ë©´ì ', fn: function(l) { return (l.area_m2 || '-') + 'mÂ² (' + (l.area_m2 ? (l.area_m2 / 3.30579).toFixed(1) : '-') + 'í)'; } },
      { label: 'ðï¸ ì¸µì', fn: function(l) { return (l.floor_current || '-') + '/' + (l.floor_total || '-') + 'ì¸µ'; } },
      { label: 'ðª ë°©/ìì¤', fn: function(l) { return (l.rooms || '-') + '/' + (l.bathrooms || '-'); } },
      { label: 'ð§­ ë°©í¥', fn: function(l) { return l.direction || '-'; } },
      { label: 'ð¿ï¸ ì£¼ì°¨', fn: function(l) { return l.parking || '-'; } },
      { label: 'ð ìë² ', fn: function(l) { return l.elevator || '-'; } },
      { label: 'ð¾ ë°ë ¤ëë¬¼', fn: function(l) { return l.pet || '-'; } },
      { label: 'ð° ê´ë¦¬ë¹', fn: function(l) { return l.maintenance_fee ? l.maintenance_fee + 'ë§' : '-'; } },
      { label: 'ð ë±ë¡ì¼', fn: function(l) { return l.created_at ? l.created_at.split('T')[0] : '-'; } },
      { label: 'ð·ï¸ ì¹´íê³ ë¦¬', fn: function(l) { return cats[l.id] || 'ë¯¸ë¶ë¥'; } },
      { label: 'ð ë©ëª¨', fn: function(l) { return memos[l.id] ? memos[l.id].substring(0, 50) : '-'; } }
    ];

    // ê°ê²© ìµì  íì´ë¼ì´í¸ë¥¼ ìí´ ë¯¸ë¦¬ ê³ì°
    var prices = favListings.map(function(l) {
      if (l.deal === 'ìì¸') return (l.deposit || 0) + (l.monthly || 0) * 12;
      if (l.deal === 'ì ì¸') return l.deposit || 0;
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
        // ê°ê²© ìµì  íì´ë¼ì´í¸
        if (field.label === 'ðµ ê°ê²©' && prices[li] === minPrice && minPrice > 0) {
          highlight = 'background:#f0fdf4;font-weight:700;color:#059669;';
        }
        html += '<td style="padding:10px 14px;text-align:center;border-bottom:1px solid #f0f0f0;' + highlight + 'white-space:pre-line;">' + escHtml(String(val)) + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    // ìì½
    html += '<div style="padding:16px 24px;border-top:1px solid #eee;background:#f8f5ff;border-radius:0 0 16px 16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:8px;">ð¡ ë¹êµ ìì½</div>';
    html += '<div style="font-size:12px;color:#555;line-height:1.8;">';

    // ìµì ê° ë§¤ë¬¼
    var cheapIdx = prices.indexOf(minPrice);
    if (cheapIdx >= 0 && minPrice > 0) {
      html += 'â¢ ê°ì¥ ê²½ì ì : <strong>' + escHtml(favListings[cheapIdx].title || '-') + '</strong><br>';
    }
    // ìµë ë©´ì 
    var areas = favListings.map(function(l) { return l.area_m2 || 0; });
    var maxArea = areas.length > 0 ? Math.max.apply(null, areas) : 0;
    var bigIdx = areas.indexOf(maxArea);
    if (bigIdx >= 0 && maxArea > 0) {
      html += 'â¢ ê°ì¥ ëì ë©´ì : <strong>' + escHtml(favListings[bigIdx].title || '-') + '</strong> (' + maxArea + 'mÂ²)<br>';
    }
    // ìµì  ë±ë¡
    var dates = favListings.map(function(l) { return l.created_at || ''; });
    var newest = dates.reduce(function(a, b) { return a > b ? a : b; }, '');
    var newIdx = dates.indexOf(newest);
    if (newIdx >= 0 && newest) {
      html += 'â¢ ê°ì¥ ìµê·¼ ë±ë¡: <strong>' + escHtml(favListings[newIdx].title || '-') + '</strong>';
    }
    html += '</div></div>';
    html += '</div>';

    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    document.getElementById('ws-fav-compare-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  };

  // ============================================================================
  // Section AL: ìë ìë¡ê³ ì¹¨ íì´ë¨¸ (ì¤ìê° ë§¤ë¬¼ ëª¨ëí°ë§)
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
    html += '<div><div style="font-size:18px;font-weight:800;">â±ï¸ ìë ìë¡ê³ ì¹¨</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">ì¤ìê° ë§¤ë¬¼ ëª¨ëí°ë§</div></div>';
    html += '<button id="ws-autorefresh-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    html += '<div style="padding:24px;">';

    // ìí íì
    html += '<div style="text-align:center;margin-bottom:20px;">';
    if (isRunning) {
      html += '<div style="font-size:48px;margin-bottom:8px;">ð¢</div>';
      html += '<div style="font-size:16px;font-weight:700;color:#059669;">ëª¨ëí°ë§ ì¤</div>';
      html += '<div id="ws-refresh-countdown" style="font-size:13px;color:#888;margin-top:4px;">ë¤ì ìë¡ê³ ì¹¨ê¹ì§ --:--</div>';
    } else {
      html += '<div style="font-size:48px;margin-bottom:8px;">â¸ï¸</div>';
      html += '<div style="font-size:16px;font-weight:700;color:#999;">ì ì§ë¨</div>';
    }
    html += '</div>';

    // ê°ê²© ì¤ì 
    html += '<div style="margin-bottom:20px;">';
    html += '<div style="font-size:13px;font-weight:600;color:#555;margin-bottom:8px;">ìë¡ê³ ì¹¨ ê°ê²©</div>';
    html += '<div style="display:flex;gap:8px;">';
    [1, 3, 5, 10, 15, 30].forEach(function(m) {
      var active = m === currentMin;
      html += '<button class="ws-refresh-interval" data-min="' + m + '" style="flex:1;padding:10px 0;border:' + (active ? '2px solid #059669' : '1px solid #ddd') + ';background:' + (active ? '#f0fdf4' : '#fff') + ';border-radius:8px;cursor:pointer;font-size:13px;font-weight:' + (active ? '700' : '500') + ';color:' + (active ? '#059669' : '#555') + ';">' + m + 'ë¶</button>';
    });
    html += '</div></div>';

    // ë²í¼
    html += '<div style="display:flex;gap:10px;">';
    if (isRunning) {
      html += '<button id="ws-refresh-stop" style="flex:1;padding:12px;background:#fef2f2;border:1px solid #e53e3e;color:#e53e3e;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">â¹ ì ì§</button>';
    } else {
      html += '<button id="ws-refresh-start" style="flex:1;padding:12px;background:linear-gradient(135deg,#059669,#34d399);border:none;color:#fff;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">â¶ ëª¨ëí°ë§ ìì</button>';
    }
    html += '</div>';

    // ìë¦¼ ì¤ì 
    html += '<div style="margin-top:16px;padding:12px;background:#f8faf8;border-radius:8px;font-size:12px;color:#666;">';
    html += 'ð¡ ìë ìë¡ê³ ì¹¨ ì ê°ê²© ë³ëì´ ê°ì§ëë©´ ìë¦¼ì´ íìë©ëë¤.';
    html += '</div>';

    html += '</div></div>';
    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    // Events
    var arCloseBtn = document.getElementById('ws-autorefresh-close');
    if (arCloseBtn) arCloseBtn.addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // ê°ê²© ì í
    modal.querySelectorAll('.ws-refresh-interval').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var min = parseInt(this.getAttribute('data-min'));
        _safeSetItem('ws_autorefresh_min', String(min));
        modal.remove();
        window.WS.showAutoRefreshTimer();
      });
    });

    // ìì/ì ì§
    var startBtn = document.getElementById('ws-refresh-start');
    var stopBtn = document.getElementById('ws-refresh-stop');

    if (startBtn) {
      startBtn.addEventListener('click', function() {
        window.WS._startAutoRefresh(currentMin);
        modal.remove();
        window.WS.showToast('â±ï¸ ' + currentMin + 'ë¶ ê°ê²© ìë ìë¡ê³ ì¹¨ ìì', 'success');
      });
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', function() {
        window.WS._stopAutoRefresh();
        modal.remove();
        window.WS.showToast('ìë ìë¡ê³ ì¹¨ ì ì§ë¨');
      });
    }

    // ì¹´ì´í¸ë¤ì´ ìë°ì´í¸
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
      // Admin API ë¨ì¼ í¸ì¶ë¡ ì ì²´ ë°ì´í° ë¤ì ê°ì ¸ì¤ê¸° (v2.1.0)
      fetch(ADMIN_API_MINIMAL, {
        headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN }
      })
        .then(function(r) {
          if (!r.ok) throw new Error('ìë² ì¤ë¥: ' + r.status);
          return r.json();
        })
        .then(function(data) {
          if (data.success && Array.isArray(data.data)) {
            var refreshItems = normalizeImages(data.data);
            if (refreshItems.length > 0) {
              window.WS.allListings = refreshItems;
              if (window.WS._autoSnapshot) window.WS._autoSnapshot();
              window.WS.renderAll();
              window.WS.showToast('ð ë§¤ë¬¼ ë°ì´í°ê° ê°±ì ëììµëë¤ (' + refreshItems.length + 'ê±´, ' + new Date().toLocaleTimeString('ko-KR') + ')');
            }
          }
        }).catch(function() {
          window.WS.showToast('ìë¡ê³ ì¹¨ ì¤í¨: ë¤í¸ìí¬ ì¤ë¥', 'error');
        });
      window.WS._autoRefreshStartTime = Date.now();
    }, ms);

    // ì¹´ì´í¸ë¤ì´ íìì© íì´ë¨¸
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
    el.textContent = 'ë¤ì ìë¡ê³ ì¹¨ê¹ì§ ' + m + ':' + (s < 10 ? '0' : '') + s;
  };

  // ============================================================================
  // Section AM: ë§¤ë¬¼ ë°ì§ë íí¸ë§µ (íì¤í¸ ê¸°ë°)
  // ============================================================================
  window.WS.showHeatmap = function() {
    var allData = window.WS.allListings || [];
    if (allData.length === 0) {
      window.WS.showToast('ë§¤ë¬¼ ë°ì´í°ê° ììµëë¤', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-heatmap');
    if (existing) existing.remove();

    // ì§ì­ë³ ì§ê³
    var regionData = {};
    var totalCount = 0;
    allData.forEach(function(l) {
      var addr = l.address || '';
      var match = addr.match(/([ê°-í£]+[êµ¬êµ°ì])/);
      var region = match ? match[1] : 'ê¸°í';
      if (!regionData[region]) {
        regionData[region] = { count: 0, totalPrice: 0, totalDeposit: 0, types: {}, deals: {} };
      }
      regionData[region].count++;
      totalCount++;
      regionData[region].totalPrice += (l.price || 0);
      regionData[region].totalDeposit += (l.deposit || 0);
      var type = l.type || 'ê¸°í';
      regionData[region].types[type] = (regionData[region].types[type] || 0) + 1;
      var deal = l.deal || 'ê¸°í';
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
    html += '<div><div style="font-size:18px;font-weight:800;">ðºï¸ ë§¤ë¬¼ ë°ì§ë ë¶ì</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + regionKeys.length + 'ê° ì§ì­ Â· ì´ ' + totalCount + 'ê±´</div></div>';
    html += '<button id="ws-heatmap-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    // íí¸ë§µ ê·¸ë¦¬ë
    html += '<div style="padding:20px 24px;">';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:20px;">';

    regionKeys.forEach(function(region) {
      var d = regionData[region];
      var intensity = d.count / maxRegionCount;
      // ìì: ì°í ì´ë¡ â ì§í ë¹¨ê°
      var r = Math.round(34 + intensity * 200);
      var g = Math.round(197 - intensity * 150);
      var b = Math.round(94 - intensity * 60);
      var bgColor = 'rgb(' + r + ',' + g + ',' + b + ')';
      var textColor = intensity > 0.5 ? '#fff' : '#333';
      var pct = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : '0.0';

      // ì£¼ì ì í
      var topType = Object.keys(d.types).sort(function(a, b) { return d.types[b] - d.types[a]; })[0] || '-';

      html += '<div style="background:' + bgColor + ';border-radius:12px;padding:14px;text-align:center;cursor:pointer;transition:transform 0.2s;" data-heatmap-region="' + escHtml(region) + '">';
      html += '<div style="font-size:15px;font-weight:800;color:' + textColor + ';">' + escHtml(region) + '</div>';
      html += '<div style="font-size:24px;font-weight:800;color:' + textColor + ';margin:4px 0;">' + d.count + '</div>';
      html += '<div style="font-size:10px;color:' + textColor + ';opacity:0.8;">' + pct + '% Â· ' + escHtml(topType) + '</div>';
      html += '</div>';
    });

    html += '</div>';

    // ìì¸ íì´ë¸
    html += '<div style="margin-top:10px;">';
    html += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:10px;">ð ì§ì­ë³ ìì¸ ë¶ì</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<tr style="background:#f8f8f8;"><th style="padding:8px;text-align:left;border-bottom:2px solid #e0e0e0;">ì§ì­</th><th style="padding:8px;text-align:center;">ë§¤ë¬¼ì</th><th style="padding:8px;text-align:center;">ë¹ì¨</th><th style="padding:8px;text-align:center;">íê· ë³´ì¦ê¸</th><th style="padding:8px;text-align:center;">ì£¼ìì í</th><th style="padding:8px;text-align:center;">ê±°ëì í</th></tr>';

    regionKeys.forEach(function(region, idx) {
      var d = regionData[region];
      var avgDep = d.count > 0 ? Math.round(d.totalDeposit / d.count) : 0;
      var pct = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : '0.0';
      var topType = Object.keys(d.types).sort(function(a, b) { return d.types[b] - d.types[a]; })[0] || '-';
      var topDeal = Object.keys(d.deals).sort(function(a, b) { return d.deals[b] - d.deals[a]; })[0] || '-';
      var bgRow = idx % 2 === 0 ? '#fff' : '#fafafa';

      html += '<tr style="background:' + bgRow + ';">';
      html += '<td style="padding:8px;font-weight:600;border-bottom:1px solid #f0f0f0;">' + escHtml(region) + '</td>';
      html += '<td style="padding:8px;text-align:center;font-weight:700;color:#2D5A27;border-bottom:1px solid #f0f0f0;">' + d.count + 'ê±´</td>';
      html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;">' + pct + '%</td>';
      html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;">' + (avgDep >= 10000 ? (avgDep / 10000).toFixed(1) + 'ìµ' : avgDep + 'ë§') + '</td>';
      html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;">' + escHtml(topType) + '</td>';
      html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;">' + escHtml(topDeal) + '</td>';
      html += '</tr>';
    });

    html += '</table></div>';

    // ì¸ì¬ì´í¸
    html += '<div style="margin-top:16px;padding:14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:8px;">ð¥ ë°ì§ë ì¸ì¬ì´í¸</div>';
    html += '<div style="font-size:12px;color:#555;line-height:1.8;">';
    if (regionKeys.length > 0) {
      html += 'â¢ ìµë¤ ë§¤ë¬¼ ì§ì­: <strong>' + escHtml(regionKeys[0]) + '</strong> (' + regionData[regionKeys[0]].count + 'ê±´, ' + (totalCount > 0 ? ((regionData[regionKeys[0]].count / totalCount) * 100).toFixed(0) : 0) + '%)<br>';
    }
    if (regionKeys.length > 1) {
      html += 'â¢ 2ì ì§ì­: <strong>' + escHtml(regionKeys[1]) + '</strong> (' + regionData[regionKeys[1]].count + 'ê±´)<br>';
    }
    var diverseRegions = regionKeys.filter(function(r) { return Object.keys(regionData[r].types).length >= 3; });
    if (diverseRegions.length > 0) {
      html += 'â¢ ë§¤ë¬¼ ë¤ìì± ëì ì§ì­: ' + diverseRegions.slice(0, 3).map(function(r) { return '<strong>' + escHtml(r) + '</strong>'; }).join(', ');
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
  // Section AN: ë§¤ë¬¼ ê³µì  ë§í¬ ìì± (ì í ë§¤ë¬¼ URL ê³µì )
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
      window.WS.showToast('ê³µì í  ë§¤ë¬¼ì ë¨¼ì  ì íí´ì£¼ì¸ì', 'warning');
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
    html += '<div><div style="font-size:18px;font-weight:800;">ð ë§¤ë¬¼ ê³µì </div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + selected.length + 'ê±´ ë§¤ë¬¼ ê³µì  ì¤ë¹</div></div>';
    html += '<button id="ws-share-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    html += '<div style="padding:20px 24px;">';

    // ê³µì  íì ì í
    html += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:12px;">ð ê³µì  íì</div>';
    html += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
    html += '<button class="ws-share-format" data-format="kakao" style="flex:1;padding:12px;background:#fee500;border:2px solid #f5d800;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;color:#3c1e1e;">ð¬ ì¹´ì¹´ì¤í¡</button>';
    html += '<button class="ws-share-format" data-format="sms" style="flex:1;padding:12px;background:#e8f5e9;border:2px solid #4CAF50;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;color:#2D5A27;">ð± ë¬¸ì/SMS</button>';
    html += '<button class="ws-share-format" data-format="email" style="flex:1;padding:12px;background:#e3f2fd;border:2px solid #2196f3;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;color:#1565c0;">ð§ ì´ë©ì¼</button>';
    html += '</div>';

    // ë¯¸ë¦¬ë³´ê¸°
    html += '<div id="ws-share-preview" style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:10px;padding:16px;margin-bottom:16px;font-size:12px;color:#555;line-height:1.8;white-space:pre-wrap;max-height:250px;overflow-y:auto;">';
    html += window.WS._generateShareText(selected, memos, 'kakao');
    html += '</div>';

    // ë³µì¬ ë²í¼
    html += '<button id="ws-share-copy" style="width:100%;padding:14px;background:linear-gradient(135deg,#2563eb,#60a5fa);border:none;color:#fff;border-radius:10px;cursor:pointer;font-size:15px;font-weight:700;">ð íì¤í¸ ë³µì¬íê¸°</button>';

    html += '</div></div>';
    modal.innerHTML = html;
    (document.querySelector('.ws-search-container') || document.body).appendChild(modal);

    // Events
    var shareCloseBtn = document.getElementById('ws-share-close');
    if (shareCloseBtn) shareCloseBtn.addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // íì ì í
    modal.querySelectorAll('.ws-share-format').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var format = this.getAttribute('data-format');
        modal.querySelectorAll('.ws-share-format').forEach(function(b) { b.style.opacity = '0.5'; });
        this.style.opacity = '1';
        var preview = document.getElementById('ws-share-preview');
        if (preview) preview.textContent = window.WS._generateShareText(selected, memos, format);
      });
    });

    // ë³µì¬
    document.getElementById('ws-share-copy').addEventListener('click', function() {
      var preview = document.getElementById('ws-share-preview');
      var text = preview ? preview.textContent : '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.WS.showToast('ë§¤ë¬¼ ì ë³´ê° ë³µì¬ëììµëë¤! ë¶ì¬ë£ê¸° í´ì£¼ì¸ì', 'success');
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
      text += 'ð  WISHES ë§¤ë¬¼ ìë´\n';
      text += 'ââââââââââââââ\n';
      text += 'ð ' + today + '\n\n';
      listings.forEach(function(l, i) {
        text += 'ã' + (i + 1) + 'ã ' + (l.title || '-') + '\n';
        text += 'ð ' + (l.address || '-') + '\n';
        text += 'ð° ' + (l.deal || '-') + ' ';
        if (l.deal === 'ìì¸') text += 'ë³´ì¦ê¸ ' + (l.deposit || 0) + 'ë§/ìì¸ ' + (l.monthly || 0) + 'ë§';
        else if (l.deal === 'ì ì¸') text += 'ì ì¸ê¸ ' + (l.deposit || 0) + 'ë§';
        else text += 'ë§¤ë§¤ê° ' + (l.price || 0) + 'ë§';
        text += '\n';
        text += 'ð ' + (l.area_m2 || '-') + 'mÂ² Â· ' + (l.type || '-') + ' Â· ' + (l.floor_current || '-') + 'ì¸µ\n';
        if (memos[l.id]) text += 'ð ' + memos[l.id] + '\n';
        text += '\n';
      });
      text += 'ââââââââââââââ\n';
      text += 'WISHES | wishes.co.kr ð';
    } else if (format === 'sms') {
      text += '[WISHES ë§¤ë¬¼ìë´] ' + today + '\n\n';
      listings.forEach(function(l, i) {
        text += (i + 1) + '. ' + (l.title || '-') + '\n';
        text += '  ' + (l.address || '-') + '\n';
        text += '  ' + (l.deal || '-') + ' ';
        if (l.deal === 'ìì¸') text += (l.deposit || 0) + '/' + (l.monthly || 0) + 'ë§';
        else if (l.deal === 'ì ì¸') text += (l.deposit || 0) + 'ë§';
        else text += (l.price || 0) + 'ë§';
        text += ' Â· ' + (l.area_m2 || '-') + 'mÂ²\n\n';
      });
      text += 'WISHES wishes.co.kr';
    } else {
      text += 'ìëíì¸ì, WISHES ë¶ëì°ìëë¤.\n\n';
      text += 'ìì²­íì  ë§¤ë¬¼ ' + listings.length + 'ê±´ì ìë´ëë¦½ëë¤.\n';
      text += 'ìì±ì¼: ' + today + '\n\n';
      listings.forEach(function(l, i) {
        text += 'â  ' + (i + 1) + '. ' + (l.title || '-') + '\n';
        text += '  - ì£¼ì: ' + (l.address || '-') + '\n';
        text += '  - ê±°ë: ' + (l.deal || '-');
        if (l.deal === 'ìì¸') text += ' (ë³´ì¦ê¸ ' + (l.deposit || 0) + 'ë§ / ìì¸ ' + (l.monthly || 0) + 'ë§)\n';
        else if (l.deal === 'ì ì¸') text += ' (ì ì¸ê¸ ' + (l.deposit || 0) + 'ë§)\n';
        else text += ' (ë§¤ë§¤ê° ' + (l.price || 0) + 'ë§)\n';
        text += '  - ë©´ì : ' + (l.area_m2 || '-') + 'mÂ² (' + (l.area_m2 ? (l.area_m2 / 3.30579).toFixed(1) : '-') + 'í)\n';
        text += '  - ì í: ' + (l.type || '-') + ' Â· ' + (l.floor_current || '-') + '/' + (l.floor_total || '-') + 'ì¸µ\n';
        if (l.direction) text += '  - ë°©í¥: ' + l.direction + '\n';
        if (l.parking) text += '  - ì£¼ì°¨: ' + l.parking + '\n';
        text += '\n';
      });
      text += 'ìì¸ ë¬¸ìë í¸íê² ì°ë½ì£¼ì¸ì.\nWISHES | wishes.co.kr';
    }
    return text;
  };

  // ============================================================================
  // Section AO: ìí´ë¦­ íí° íµë²í¼
  // ============================================================================
  window.WS._quickFilters = [
    { label: 'ð¥ ì ê·ë§¤ë¬¼', desc: '1ì£¼ì¼ ì´ë´', fn: function(l) { if (!l.created_at) return false; var d = (Date.now() - new Date(l.created_at).getTime()) / 86400000; return d <= 7; } },
    { label: 'ð° 1ìµì´í', desc: 'ë³´ì¦ê¸ ê¸°ì¤', fn: function(l) { return (l.deposit || l.price || 0) <= 10000; } },
    { label: 'ð  ìë£¸', desc: 'ìë£¸ë§', fn: function(l) { return (l.type || '').indexOf('ìë£¸') >= 0; } },
    { label: 'ð¢ ì¤í¼ì¤í', desc: 'ì¤í¼ì¤íë§', fn: function(l) { return (l.type || '').indexOf('ì¤í¼ì¤í') >= 0; } },
    { label: 'ð¦ ìì¸', desc: 'ìì¸ë§', fn: function(l) { return l.deal === 'ìì¸'; } },
    { label: 'ð¦ ì ì¸', desc: 'ì ì¸ë§', fn: function(l) { return l.deal === 'ì ì¸'; } },
    { label: 'ð ë§¤ë§¤', desc: 'ë§¤ë§¤ë§', fn: function(l) { return l.deal === 'ë§¤ë§¤'; } },
    { label: 'â­ ì¦ê²¨ì°¾ê¸°', desc: 'ê´ì¬ë§¤ë¬¼', fn: function(l) { var favs; try { favs = JSON.parse(localStorage.getItem('ws-favorites') || '[]'); } catch(e) { favs = []; } return favs.indexOf(String(l.id)) >= 0; } }
  ];

  window.WS._activeQuickFilter = null;

  window.WS.showQuickFilters = function() {
    var existing = document.getElementById('ws-quick-filter-bar');
    if (existing) { existing.remove(); window.WS._activeQuickFilter = null; window.WS.renderAll(); return; }

    var bar = document.createElement('div');
    bar.id = 'ws-quick-filter-bar';
    bar.style.cssText = 'display:flex;gap:6px;padding:8px 12px;background:linear-gradient(to right,#f0fdf4,#ecfeff);border:1px solid #a7f3d0;border-radius:10px;margin-bottom:10px;flex-wrap:wrap;align-items:center;';

    bar.innerHTML = '<span style="font-size:12px;font-weight:700;color:#059669;margin-right:4px;">â¡ íµíí°:</span>';

    window.WS._quickFilters.forEach(function(qf, idx) {
      bar.innerHTML += '<button class="ws-quick-filter-btn" data-qf-idx="' + idx + '" style="padding:6px 12px;background:#fff;border:1px solid #d1d5db;border-radius:20px;cursor:pointer;font-size:11px;font-weight:600;color:#555;transition:all 0.2s;white-space:nowrap;">' + qf.label + '</button>';
    });
    bar.innerHTML += '<button id="ws-qf-clear" style="padding:6px 12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:20px;cursor:pointer;font-size:11px;font-weight:600;color:#e53e3e;">â í´ì </button>';

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

        // í ê¸
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

        // íí° ì ì©
        var allData = window.WS.allListings || [];
        var filtered = allData.filter(qf.fn);
        window.WS.showToast(qf.label + ' ' + filtered.length + 'ê±´ íí°ë¨');

        // ë ëë§ (íí° ê²°ê³¼ë§)
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
        window.WS.showToast('íµíí° í´ì ë¨');
      }
    });
  };

  // renderAll íµí© í: íµíí° + ê²½ê³¼ì¼ ë°°ì§ (ì´ì¤ í ë°©ì§)
  var _origRenderAllBase = window.WS.renderAll;
  if (_origRenderAllBase) {
    window.WS.renderAll = function() {
      // 1) íµíí° íì±í ì íí°ë§ë ë°ì´í°ë¡ ë ëë§
      if (window.WS._activeQuickFilter !== null && window.WS._quickFilteredData) {
        var origData = window.WS.allListings;
        window.WS.allListings = window.WS._quickFilteredData;
        _origRenderAllBase.call(window.WS);
        window.WS.allListings = origData;
      } else {
        _origRenderAllBase.call(window.WS);
      }
      // 2) ë ëë§ í ê²½ê³¼ì¼ ë°°ì§ ì½ì
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
  // AP) í¤ë³´ë ë¨ì¶í¤ ìì¤í (Keyboard Shortcuts)
  // =========================================================

  window.WS._shortcutsEnabled = true;

  window.WS.showKeyboardShortcuts = function() {
    var existing = document.getElementById('ws-modal-shortcuts');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-shortcuts';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var shortcuts = [
      { key: 'Ctrl + A', desc: 'ì ì²´ ì í' },
      { key: 'Ctrl + D', desc: 'ì ì²´ í´ì ' },
      { key: 'Ctrl + F', desc: 'ê²ì í¬ì»¤ì¤' },
      { key: 'Ctrl + P', desc: 'PDF ë¸ë¦¬í' },
      { key: 'Ctrl + E', desc: 'ìì ë´ë³´ë´ê¸°' },
      { key: 'Ctrl + B', desc: 'AI ë¸ë¦¬í ìì±' },
      { key: 'Ctrl + K', desc: 'ì¹´ì¹´ì¤í¡ ê³µì ' },
      { key: 'Ctrl + M', desc: 'ë¤í¬ëª¨ë í ê¸' },
      { key: 'â/â', desc: 'íì´ì§ ì´ë' },
      { key: 'Esc', desc: 'ëª¨ë¬ ë«ê¸°' },
      { key: '?', desc: 'ë¨ì¶í¤ ëìë§' }
    ];

    var html = '<div style="background:#fff;border-radius:16px;width:480px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:18px;font-weight:800;">â¨ï¸ í¤ë³´ë ë¨ì¶í¤</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">ë¹ ë¥¸ ììì ìí ë¨ì¶í¤ ëª©ë¡</div></div>';
    html += '<button id="ws-shortcuts-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
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
    html += '<div style="font-size:12px;color:#666;text-align:center;">ð¡ ê²ìì°½ì í¬ì»¤ì¤ê° ìì ëë ë¨ì¶í¤ê° ë¹íì±íë©ëë¤.</div>';
    html += '</div></div>';

    modal.innerHTML = html;
    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    // ì´ë²¤í¸
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });
    var closeBtn = document.getElementById('ws-shortcuts-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });
  };

  // í¤ë³´ë ì´ë²¤í¸ í¸ë¤ë¬
  document.addEventListener('keydown', function(e) {
    if (!window.WS || !window.WS._shortcutsEnabled) return;

    // ìë ¥ íëì í¬ì»¤ì¤ê° ìì ëë ë¬´ì
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      // Escë§ ìì¸ ì²ë¦¬
      if (e.key === 'Escape') {
        e.target.blur();
        return;
      }
      return;
    }

    // Ctrl ì¡°í© ë¨ì¶í¤
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

    // ë¨ì¼ í¤
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
        // ëª¨ë¬ ë«ê¸°
        var modals = document.querySelectorAll('[id^="ws-modal-"]');
        modals.forEach(function(m) { m.remove(); });
        break;
      case '?':
        window.WS.showKeyboardShortcuts();
        break;
    }
  });

  // =========================================================
  // AQ) ë§¤ë¬¼ ê²½ê³¼ì¼ ë°°ì§ íì (Listing Age Badge)
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
    if (days <= 3) return '<span style="background:#f97316;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:6px;">' + days + 'ì¼ì </span>';
    if (days <= 7) return '<span style="background:#eab308;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:6px;">' + days + 'ì¼ì </span>';
    if (days <= 30) return '<span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px;">' + days + 'ì¼ì </span>';
    return '<span style="background:#d1d5db;color:#666;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px;">' + days + 'ì¼ì </span>';
  };

  // (ê²½ê³¼ì¼ ë°°ì§ë ì renderAll íµí© íìì ì²ë¦¬)

  // =========================================================
  // AR) ê³ ê°ë³ ì¶ì² ë§¤ë¬¼ ë¦¬í¬í¸ (Customer Match Report)
  // =========================================================

  window.WS.showCustomerReport = function() {
    var existing = document.getElementById('ws-modal-custreport');
    if (existing) existing.remove();

    // ê³ ê° í´ë ë¡ë (ë°°ì´ íí: [{id, name, items:[{id, name, ...}], created}])
    var foldersRaw = [];
    try { foldersRaw = JSON.parse(localStorage.getItem('ws_customer_folders') || '[]'); } catch(e) { foldersRaw = []; }
    if (!Array.isArray(foldersRaw)) foldersRaw = [];
    var prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('ws_customer_prefs') || '{}'); } catch(e) { prefs = {}; }

    var allData = window.WS.allListings || [];
    var customerNames = foldersRaw.map(function(f) { return f.name || 'ì´ë¦ìì'; });

    var modal = document.createElement('div');
    modal.id = 'ws-modal-custreport';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    var html = '<div style="background:#fff;border-radius:16px;width:700px;max-height:85vh;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;display:flex;flex-direction:column;">';
    html += '<div style="background:linear-gradient(135deg,#2D5A27,#4CAF50);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">';
    html += '<div><div style="font-size:18px;font-weight:800;">ð ê³ ê°ë³ ì¶ì² ë§¤ë¬¼ ë¦¬í¬í¸</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">ê³ ê° ì í¸ë ê¸°ë° ë§ì¶¤ ë§¤ë¬¼ ì¶ì²</div></div>';
    html += '<button id="ws-custreport-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    html += '<div style="padding:24px;overflow-y:auto;flex:1;">';

    if (customerNames.length === 0) {
      html += '<div style="text-align:center;padding:40px 20px;color:#999;">';
      html += '<div style="font-size:48px;margin-bottom:12px;">ð¤</div>';
      html += '<div style="font-size:16px;font-weight:600;">ë±ë¡ë ê³ ê°ì´ ììµëë¤</div>';
      html += '<div style="font-size:13px;margin-top:8px;">ê³ ê°í´ëìì ê³ ê°ì ë±ë¡íë©´ ë§ì¶¤ ì¶ì² ë¦¬í¬í¸ë¥¼ ìì±í©ëë¤.</div>';
      html += '</div>';
    } else {
      // ê° ê³ ê°ë³ ì¶ì² ë§¤ë¬¼
      foldersRaw.forEach(function(folder) {
        var name = folder.name || 'ì´ë¦ìì';
        var custPref = prefs[name] || {};
        var custItems = Array.isArray(folder.items) ? folder.items : [];
        var custFavIds = custItems.map(function(item) { return String(item.id || item); });

        // ê³ ê° ì í¸ë ë¶ì (ì ì¥ë ë§¤ë¬¼ ê¸°ë°)
        var custListings = custFavIds.map(function(id) {
          return allData.find(function(l) { return String(l.id) === String(id); });
        }).filter(Boolean);

        // ì í¸ ì í ë¶ì
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

        // ì í¸ ì í 1ì
        var prefType = Object.keys(typeCounts).sort(function(a, b) { return (typeCounts[b] || 0) - (typeCounts[a] || 0); })[0] || 'ì ì²´';
        var prefDeal = Object.keys(dealCounts).sort(function(a, b) { return (dealCounts[b] || 0) - (dealCounts[a] || 0); })[0] || 'ì ì²´';

        // ì¶ì² ë§¤ë¬¼ íí°ë§ (ì´ë¯¸ ë´ê¸´ ë§¤ë¬¼ ì ì¸)
        var recommended = allData.filter(function(l) {
          if (custFavIds.indexOf(String(l.id)) >= 0) return false;

          var typeMatch = prefType === 'ì ì²´' || l.type === prefType;
          var dealMatch = prefDeal === 'ì ì²´' || l.deal === prefDeal;

          // ê°ê²© ë²ì Â±30%
          var depositMatch = true;
          if (avgDeposit > 0 && l.deposit) {
            depositMatch = l.deposit >= avgDeposit * 0.7 && l.deposit <= avgDeposit * 1.3;
          }

          // ë©´ì  ë²ì Â±30%
          var areaMatch = true;
          if (avgArea > 0 && l.area_m2) {
            areaMatch = l.area_m2 >= avgArea * 0.7 && l.area_m2 <= avgArea * 1.3;
          }

          return typeMatch && dealMatch && (depositMatch || areaMatch);
        }).slice(0, 5); // ìì 5ê±´

        html += '<div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">';
        html += '<div style="background:#f0fdf4;padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">';
        html += '<div>';
        html += '<span style="font-size:16px;font-weight:700;color:#2D5A27;">ð¤ ' + escHtml(name) + '</span>';
        html += '<span style="font-size:12px;color:#888;margin-left:10px;">ê´ì¬ë§¤ë¬¼ ' + custFavIds.length + 'ê±´</span>';
        html += '</div>';
        html += '<div style="display:flex;gap:6px;">';
        if (prefType !== 'ì ì²´') html += '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:11px;">' + escHtml(prefType) + '</span>';
        if (prefDeal !== 'ì ì²´') html += '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:11px;">' + escHtml(prefDeal) + '</span>';
        if (avgArea > 0) html += '<span style="background:#f3e8ff;color:#6b21a8;padding:2px 8px;border-radius:10px;font-size:11px;">~' + avgArea + 'mÂ²</span>';
        html += '</div></div>';

        if (recommended.length === 0) {
          html += '<div style="padding:20px;text-align:center;color:#999;font-size:13px;">íì¬ ì¡°ê±´ì ë§ë ì¶ì² ë§¤ë¬¼ì´ ììµëë¤.</div>';
        } else {
          html += '<div style="padding:12px;">';
          recommended.forEach(function(l, idx) {
            var priceText = '';
            if (l.deal === 'ìì¸') priceText = ((l.deposit || 0) >= 10000 ? ((l.deposit / 10000).toFixed(1) + 'ìµ') : ((l.deposit || 0) + 'ë§')) + '/' + (l.monthly || 0) + 'ë§';
            else if (l.deal === 'ì ì¸') priceText = (l.deposit || 0) >= 10000 ? ((l.deposit / 10000).toFixed(1) + 'ìµ') : ((l.deposit || 0) + 'ë§');
            else priceText = (l.price || 0) >= 10000 ? ((l.price / 10000).toFixed(1) + 'ìµ') : ((l.price || 0) + 'ë§');

            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;' + (idx < recommended.length - 1 ? 'border-bottom:1px solid #f0f0f0;' : '') + '">';
            html += '<div style="flex:1;">';
            html += '<div style="font-size:13px;font-weight:600;color:#333;">' + (idx + 1) + '. ' + escHtml(l.title || '-') + '</div>';
            html += '<div style="font-size:11px;color:#888;margin-top:2px;">' + escHtml(l.type || '') + ' Â· ' + escHtml(l.deal || '') + ' Â· ' + (l.area_m2 || '-') + 'mÂ² Â· ' + escHtml(l.address || '') + '</div>';
            html += '</div>';
            html += '<div style="font-size:14px;font-weight:700;color:#2D5A27;white-space:nowrap;margin-left:12px;">' + escHtml(priceText) + '</div>';
            html += '</div>';
          });
          html += '</div>';
        }

        // ì¶ì² ê·¼ê±°
        html += '<div style="padding:10px 18px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:11px;color:#888;">';
        html += 'ð¡ ì¶ì² ê·¼ê±°: ';
        var reasons = [];
        if (prefType !== 'ì ì²´') reasons.push('ì í¸ì í ' + prefType);
        if (prefDeal !== 'ì ì²´') reasons.push('ì í¸ê±°ë ' + prefDeal);
        if (avgDeposit > 0) reasons.push('íê· ë³´ì¦ê¸ Â±30%');
        if (avgArea > 0) reasons.push('íê· ë©´ì  Â±30%');
        html += reasons.length > 0 ? reasons.join(', ') : 'ë±ë¡ë ê´ì¬ë§¤ë¬¼ ê¸°ë° ë¶ì';
        html += '</div></div>';
      });
    }

    // ë¦¬í¬í¸ ì ì²´ ë³µì¬ ë²í¼
    html += '<div style="margin-top:16px;text-align:center;">';
    html += '<button id="ws-custreport-copy" style="padding:10px 24px;background:linear-gradient(135deg,#2D5A27,#4CAF50);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">ð ë¦¬í¬í¸ íì¤í¸ ë³µì¬</button>';
    html += '</div>';

    html += '</div></div>';
    modal.innerHTML = html;

    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    // ì´ë²¤í¸
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var closeBtn = document.getElementById('ws-custreport-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });

    var copyBtn = document.getElementById('ws-custreport-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        var text = 'ð ê³ ê°ë³ ì¶ì² ë§¤ë¬¼ ë¦¬í¬í¸\n';
        text += 'ìì±ì¼: ' + new Date().toLocaleDateString('ko-KR') + '\n\n';

        foldersRaw.forEach(function(folder) {
          var name = folder.name || 'ì´ë¦ìì';
          var custItems = Array.isArray(folder.items) ? folder.items : [];
          var custFavIds = custItems.map(function(item) { return String(item.id || item); });
          var custListings = custFavIds.map(function(id) {
            return allData.find(function(l) { return String(l.id) === String(id); });
          }).filter(Boolean);

          text += 'âââ ' + name + ' ê³ ê° âââ\n';
          text += 'ê´ì¬ë§¤ë¬¼: ' + custFavIds.length + 'ê±´\n';

          // ê°ë¨ ì¶ì² ëª©ë¡
          var typeCounts2 = {};
          var dealCounts2 = {};
          custListings.forEach(function(l) {
            typeCounts2[l.type] = (typeCounts2[l.type] || 0) + 1;
            dealCounts2[l.deal] = (dealCounts2[l.deal] || 0) + 1;
          });
          var pt2 = Object.keys(typeCounts2).sort(function(a, b) { return (typeCounts2[b] || 0) - (typeCounts2[a] || 0); })[0] || 'ì ì²´';
          var pd2 = Object.keys(dealCounts2).sort(function(a, b) { return (dealCounts2[b] || 0) - (dealCounts2[a] || 0); })[0] || 'ì ì²´';
          text += 'ì í¸: ' + pt2 + ' / ' + pd2 + '\n\n';
        });

        text += '\n--- WISHES ì¤ê°ì¬ ë§¤ë¬¼ê²ì ---';

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function() {
            window.WS.showToast('ë¦¬í¬í¸ê° í´ë¦½ë³´ëì ë³µì¬ëììµëë¤!', 'success');
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
  // AS) ë§¤ë¬¼ ë©ëª¨ ê²ì ê¸°ë¥ (Memo Search)
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
    html += '<div><div style="font-size:18px;font-weight:800;">ð ë©ëª¨ ê²ì</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">ë©ëª¨ ë´ì©ì¼ë¡ ë§¤ë¬¼ì ë¹ ë¥´ê² ì°¾ê¸°</div></div>';
    html += '<button id="ws-memosearch-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    html += '<div style="padding:16px 24px;border-bottom:1px solid #eee;flex-shrink:0;">';
    html += '<input type="text" id="ws-memo-search-input" placeholder="ë©ëª¨ í¤ìëë¥¼ ìë ¥íì¸ì..." style="width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;" />';
    html += '</div>';

    html += '<div id="ws-memo-search-results" style="padding:16px 24px;overflow-y:auto;flex:1;">';

    // ì´ê¸° ëª©ë¡: ë©ëª¨ê° ìë ë§¤ë¬¼ ì ë¶ íì
    var memoIds = Object.keys(memos).filter(function(k) { return memos[k] && memos[k].trim().length > 0; });
    if (memoIds.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:#999;font-size:14px;">ð ì ì¥ë ë©ëª¨ê° ììµëë¤.</div>';
    } else {
      html += '<div style="font-size:12px;color:#888;margin-bottom:12px;">ë©ëª¨ê° ìë ë§¤ë¬¼: ' + memoIds.length + 'ê±´</div>';
      memoIds.forEach(function(id) {
        var listing = allData.find(function(l) { return String(l.id) === String(id); });
        var title = listing ? (listing.title || '-') : '(ì­ì ë ë§¤ë¬¼)';
        var memo = memos[id] || '';
        html += '<div class="ws-memo-result-item" style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;" data-id="' + escHtml(String(id)) + '">';
        html += '<div style="font-size:13px;font-weight:600;color:#333;">' + escHtml(title) + '</div>';
        html += '<div style="font-size:12px;color:#0ea5e9;margin-top:4px;white-space:pre-line;">' + escHtml(memo.substring(0, 100)) + (memo.length > 100 ? '...' : '') + '</div>';
        if (listing) {
          html += '<div style="font-size:11px;color:#888;margin-top:4px;">' + escHtml(listing.type || '') + ' Â· ' + escHtml(listing.deal || '') + ' Â· ' + escHtml(listing.address || '') + '</div>';
        }
        html += '</div>';
      });
    }
    html += '</div></div>';

    modal.innerHTML = html;
    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    // ì´ë²¤í¸
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var closeBtn = document.getElementById('ws-memosearch-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });

    // ê²ì ê¸°ë¥
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

        var rhtml = '<div style="font-size:12px;color:#888;margin-bottom:12px;">ê²ì ê²°ê³¼: ' + filtered.length + 'ê±´</div>';
        filtered.forEach(function(id) {
          var listing = allData.find(function(l) { return String(l.id) === String(id); });
          var title = listing ? (listing.title || '-') : '(ì­ì ë ë§¤ë¬¼)';
          var memo = memos[id] || '';

          // í¤ìë íì´ë¼ì´í¸
          var highlightedMemo = escHtml(memo.substring(0, 100));
          if (keyword) {
            var re = new RegExp('(' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
            highlightedMemo = highlightedMemo.replace(re, '<mark style="background:#fef08a;padding:0 2px;border-radius:2px;">$1</mark>');
          }

          rhtml += '<div class="ws-memo-result-item" style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;" data-id="' + escHtml(String(id)) + '">';
          rhtml += '<div style="font-size:13px;font-weight:600;color:#333;">' + escHtml(title) + '</div>';
          rhtml += '<div style="font-size:12px;color:#0ea5e9;margin-top:4px;white-space:pre-line;">' + highlightedMemo + (memo.length > 100 ? '...' : '') + '</div>';
          if (listing) {
            rhtml += '<div style="font-size:11px;color:#888;margin-top:4px;">' + escHtml(listing.type || '') + ' Â· ' + escHtml(listing.deal || '') + ' Â· ' + escHtml(listing.address || '') + '</div>';
          }
          rhtml += '</div>';
        });
        if (filtered.length === 0) {
          rhtml += '<div style="text-align:center;padding:20px;color:#999;font-size:13px;">ê²ì ê²°ê³¼ê° ììµëë¤.</div>';
        }
        resultsDiv.innerHTML = rhtml;
        }, 200); // 200ms ëë°ì´ì¤
      });
    }

    // ê²°ê³¼ í´ë¦­ ì í´ë¹ ë§¤ë¬¼ ìì¸ ë³´ê¸°
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
  // AT) ë¸ë¼ì°ì  ìë¦¼ (ì ë§¤ë¬¼/ê°ê²© ë³ë Push Notification)
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
    html += '<div><div style="font-size:18px;font-weight:800;">ð í¸ì ìë¦¼ ì¤ì </div><div style="font-size:12px;opacity:0.9;margin-top:4px;">ì ë§¤ë¬¼/ê°ê²© ë³ë ì ë¸ë¼ì°ì  ìë¦¼</div></div>';
    html += '<button id="ws-notiset-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    html += '<div style="padding:24px;">';

    // ê¶í ìí
    html += '<div style="text-align:center;margin-bottom:20px;">';
    if (permission === 'granted') {
      html += '<div style="font-size:40px;margin-bottom:8px;">â</div>';
      html += '<div style="font-size:14px;color:#059669;font-weight:600;">ìë¦¼ ê¶í íì©ë¨</div>';
    } else if (permission === 'denied') {
      html += '<div style="font-size:40px;margin-bottom:8px;">ð«</div>';
      html += '<div style="font-size:14px;color:#dc2626;font-weight:600;">ìë¦¼ ê¶í ì°¨ë¨ë¨</div>';
      html += '<div style="font-size:12px;color:#999;margin-top:4px;">ë¸ë¼ì°ì  ì¤ì ìì ìë¦¼ì íì©í´ì£¼ì¸ì.</div>';
    } else {
      html += '<div style="font-size:40px;margin-bottom:8px;">â</div>';
      html += '<div style="font-size:14px;color:#f59e0b;font-weight:600;">ìë¦¼ ê¶í ìì²­ íì</div>';
    }
    html += '</div>';

    // ìë¦¼ ìµì
    html += '<div style="margin-bottom:16px;">';
    html += '<label style="display:flex;align-items:center;padding:12px;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;margin-bottom:8px;">';
    html += '<input type="checkbox" id="ws-noti-newlisting" ' + (isEnabled ? 'checked' : '') + ' style="margin-right:10px;width:18px;height:18px;"> ';
    html += '<div><div style="font-size:14px;font-weight:600;">ð ì ë§¤ë¬¼ ë±ë¡ ìë¦¼</div><div style="font-size:11px;color:#888;">ìë ìë¡ê³ ì¹¨ ì ì ë§¤ë¬¼ì´ ê°ì§ëë©´ ìë¦¼</div></div>';
    html += '</label>';
    html += '<label style="display:flex;align-items:center;padding:12px;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;">';
    html += '<input type="checkbox" id="ws-noti-pricechange" ' + (isEnabled ? 'checked' : '') + ' style="margin-right:10px;width:18px;height:18px;"> ';
    html += '<div><div style="font-size:14px;font-weight:600;">ð ê°ê²© ë³ë ìë¦¼</div><div style="font-size:11px;color:#888;">ê´ì¬ë§¤ë¬¼ ê°ê²©ì´ ë³ëëë©´ ìë¦¼</div></div>';
    html += '</label>';
    html += '</div>';

    // ë²í¼
    if (permission !== 'granted') {
      html += '<button id="ws-noti-request" style="width:100%;padding:12px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">ð ìë¦¼ ê¶í ìì²­</button>';
    } else {
      html += '<button id="ws-noti-save" style="width:100%;padding:12px;background:linear-gradient(135deg,#059669,#34d399);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;">ð¾ ì¤ì  ì ì¥</button>';
    }

    html += '<div style="margin-top:12px;padding:10px;background:#fef3c7;border-radius:8px;font-size:11px;color:#92400e;">';
    html += 'ð¡ ìë ìë¡ê³ ì¹¨ì´ íì±íë ê²½ì°ìë§ ìë¦¼ì´ ëìí©ëë¤.';
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
              window.WS.showToast('ìë¦¼ ê¶íì´ íì©ëììµëë¤!', 'success');
              modal.remove();
              window.WS.showNotificationSettings();
            } else {
              window.WS.showToast('ìë¦¼ ê¶íì´ ê±°ë¶ëììµëë¤', 'warning');
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
        window.WS.showToast('ìë¦¼ ì¤ì ì´ ì ì¥ëììµëë¤', 'success');
        modal.remove();
      });
    }
  };

  // ìë¦¼ ë°ì¡ í¨ì
  // (ë¯¸ì¬ì© _sendNotification ë° ìë¦¼ ì¤ì  ë³µì ì½ë ì ê±°ë¨)

  // =========================================================
  // AU) ë§¤ë¬¼ ë¹êµ ì°¨í¸ (ìê°ì  ë° ì°¨í¸ ë¹êµ)
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
      window.WS.showToast('ë¹êµí  ë§¤ë¬¼ì 2ê° ì´ì ì íí´ì£¼ì¸ì', 'warning');
      return;
    }

    var existing = document.getElementById('ws-modal-comparechart');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-comparechart';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';

    // ë°ì´í° ì¤ë¹
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
    html += '<div><div style="font-size:18px;font-weight:800;">ð ë§¤ë¬¼ ë¹êµ ì°¨í¸</div><div style="font-size:12px;opacity:0.9;margin-top:4px;">' + selected.length + 'ê±´ ë§¤ë¬¼ ìê°ì  ë¹êµ</div></div>';
    html += '<button id="ws-comparechart-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">â</button>';
    html += '</div>';

    html += '<div style="padding:24px;overflow-y:auto;flex:1;">';

    // ë²ë¡
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">';
    selected.forEach(function(l, i) {
      html += '<span style="display:flex;align-items:center;gap:4px;font-size:12px;color:#555;">';
      html += '<span style="width:12px;height:12px;border-radius:3px;background:' + colors[i % colors.length] + ';display:inline-block;"></span>';
      html += escHtml((l.title || '-').substring(0, 20));
      html += '</span>';
    });
    html += '</div>';

    // ìì¸ë¶ì ì°¨í¸ ìì± í¨ì
    function priceBarChart(title, values, maxVal, unit) {
      var chartHtml = '<div style="margin-bottom:24px;">';
      chartHtml += '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:10px;">' + title + '</div>';
      values.forEach(function(val, i) {
        var pct = maxVal > 0 ? (val / maxVal * 100) : 0;
        var label = (val || 0) >= 10000 ? ((val / 10000).toFixed(1) + 'ìµ') : ((val || 0) + unit);
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

    // ë³´ì¦ê¸ ì°¨í¸
    if (deposits.some(function(v) { return v > 0; })) {
      html += priceBarChart('ð° ë³´ì¦ê¸', deposits, maxDeposit, 'ë§');
    }
    // ë§¤ë§¤ê° ì°¨í¸
    if (prices.some(function(v) { return v > 0; })) {
      html += priceBarChart('ð·ï¸ ë§¤ë§¤ê°', prices, maxPrice, 'ë§');
    }
    // ìì¸ ì°¨í¸
    if (monthlys.some(function(v) { return v > 0; })) {
      html += priceBarChart('ð ìì¸', monthlys, maxMonthly, 'ë§');
    }
    // ë©´ì  ì°¨í¸
    html += priceBarChart('ð ë©´ì ', areas, maxArea, 'mÂ²');

    // ì¢í© ë¹êµí
    html += '<div style="margin-top:16px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#f8fafc;">';
    html += '<th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">í­ëª©</th>';
    selected.forEach(function(l, i) {
      html += '<th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb;color:' + colors[i % colors.length] + ';">' + escHtml((l.title || '-').substring(0, 12)) + '</th>';
    });
    html += '</tr></thead><tbody>';

    var rows = [
      { label: 'ì í', fn: function(l) { return l.type || '-'; } },
      { label: 'ê±°ë', fn: function(l) { return l.deal || '-'; } },
      { label: 'ì¸µ', fn: function(l) { return (l.floor_current || '-') + '/' + (l.floor_total || '-') + 'F'; } },
      { label: 'ë°©/ìì¤', fn: function(l) { return (l.rooms || '-') + '/' + (l.bathrooms || '-'); } },
      { label: 'ë°©í¥', fn: function(l) { return l.direction || '-'; } },
      { label: 'ì£¼ì°¨', fn: function(l) { return l.parking ? 'ê°ë¥' : '-'; } },
      { label: 'EV', fn: function(l) { return l.elevator ? 'ìì' : '-'; } },
      { label: 'ê´ë¦¬ë¹', fn: function(l) { return l.maintenance_fee ? l.maintenance_fee + 'ë§' : '-'; } }
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
  // AV) URL íí° ìí ì ì¥/ë³µì - Section Lì íµí©ë¨ (ì¤ë³µ ì ê±°)
  // =========================================================

  // =========================================================
  // AW) ì¹´ì¹´ì¤í¡ ë§¤ë¬¼ ì¹´ë ê³µì  ê°ì  (Enhanced Share)
  // =========================================================

  window.WS.shareKakaoCard = function() {
    var ids = Array.from(window.WS.state.selectedIds || []);
    if (ids.length === 0) {
      window.WS.showToast('ð ê³µì í  ë§¤ë¬¼ì ì íí´ì£¼ì¸ì');
      return;
    }
    var allData = window.WS.allListings || [];
    var selected = [];
    ids.forEach(function(id) {
      var item = allData.find(function(l) { return String(l.id) === String(id); });
      if (item) selected.push(item);
    });
    if (selected.length === 0) {
      window.WS.showToast('â ï¸ ì íë ë§¤ë¬¼ ë°ì´í°ë¥¼ ì°¾ì ì ììµëë¤');
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
    html += '<h2 style="font-size:18px;font-weight:800;color:#3C1E1E;margin:0;">ð¬ ì¹´ì¹´ì¤í¡ ê³µì ì© ì¹´ë</h2>';
    html += '<button id="ws-kakaocard-close" style="width:32px;height:32px;border:none;background:rgba(0,0,0,0.1);border-radius:50%;font-size:16px;cursor:pointer;color:#3C1E1E;">â</button>';
    html += '</div>';
    html += '<div style="font-size:13px;color:#5C3D21;margin-top:4px;">' + selected.length + 'ê±´ ë§¤ë¬¼ ì¹´ë ë¯¸ë¦¬ë³´ê¸°</div>';
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
      if (item.deal === 'ë§¤ë§¤') {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + 'ìµ' : deposit + 'ë§');
      } else if (item.deal === 'ì ì¸') {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + 'ìµ' : deposit + 'ë§');
      } else {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + 'ìµ' : deposit + 'ë§') + '/' + monthly + 'ë§';
      }

      html += '<div style="border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;margin-bottom:12px;background:#fafafa;">';
      if (imgUrl) {
        html += '<div data-card-bg="' + escHtml(imgUrl) + '" style="height:140px;background:url(\'' + imgUrl.replace(/[\\()'"{}]/g, '\\$&') + '\') center/cover no-repeat;position:relative;">';
        html += '<span style="position:absolute;top:8px;left:8px;background:' + (item.deal === 'ë§¤ë§¤' ? '#2D5A27' : item.deal === 'ì ì¸' ? '#1e40af' : '#e53e3e') + ';color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">' + escHtml(item.deal || '') + '</span>';
        html += '</div>';
      }
      html += '<div style="padding:12px 16px;">';
      html += '<div style="font-weight:700;font-size:15px;color:#333;margin-bottom:4px;">' + escHtml(item.title || item.type + ' ' + item.deal) + '</div>';
      html += '<div style="font-size:22px;font-weight:800;color:#e53e3e;margin-bottom:6px;">' + escHtml(priceText) + '</div>';
      html += '<div style="font-size:12px;color:#888;">';
      html += 'ð ' + escHtml(item.address || 'ì£¼ì ë¯¸ë±ë¡');
      if (item.area_m2) html += ' Â· ' + item.area_m2 + 'ã¡';
      if (item.rooms) html += ' Â· ' + item.rooms + 'ë°©';
      if (item.floor_current) html += ' Â· ' + item.floor_current + 'ì¸µ';
      html += '</div>';
      if (item.maintenance_fee) html += '<div style="font-size:11px;color:#aaa;margin-top:4px;">ê´ë¦¬ë¹ ' + item.maintenance_fee + 'ë§ì</div>';
      html += '</div></div>';
    });

    // íì¤í¸ í¬ë§· ìì±
    var shareText = 'ð  WISHES ì¶ì² ë§¤ë¬¼ (' + selected.length + 'ê±´)\n';
    shareText += 'âââââââââââââââ\n\n';
    selected.forEach(function(item, idx) {
      var deposit = parseFloat(item.deposit) || 0;
      var monthly = parseFloat(item.monthly) || 0;
      var priceText = '';
      if (item.deal === 'ë§¤ë§¤' || item.deal === 'ì ì¸') {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + 'ìµ' : deposit + 'ë§');
      } else {
        priceText = (deposit >= 10000 ? (deposit / 10000).toFixed(1) + 'ìµ' : deposit + 'ë§') + '/' + monthly + 'ë§';
      }
      shareText += 'ð ' + (idx + 1) + '. ' + (item.title || item.type) + '\n';
      shareText += 'ð° ' + (item.deal || '') + ' ' + priceText + '\n';
      shareText += 'ð ' + (item.address || '') + '\n';
      if (item.area_m2) shareText += 'ð ' + item.area_m2 + 'ã¡';
      if (item.rooms) shareText += ' | ' + item.rooms + 'ë°©';
      if (item.floor_current) shareText += ' | ' + item.floor_current + '/' + (item.floor_total || '-') + 'ì¸µ';
      shareText += '\n';
      if (item.maintenance_fee) shareText += 'ð§ ê´ë¦¬ë¹ ' + item.maintenance_fee + 'ë§ì\n';
      shareText += '\n';
    });
    shareText += 'âââââââââââââââ\n';
    shareText += 'ð¢ WISHES ë¶ëì° | wishes.co.kr';

    html += '<div style="display:flex;gap:8px;margin-top:16px;">';
    html += '<button id="ws-kakaocard-copy" style="flex:1;padding:12px;background:#FEE500;color:#3C1E1E;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">ð íì¤í¸ ë³µì¬</button>';
    html += '<button id="ws-kakaocard-kakao" style="flex:1;padding:12px;background:#3C1E1E;color:#FEE500;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">ð¬ ì¹´ì¹´ì¤í¡ ì´ê¸°</button>';
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
          window.WS.showToast('â ì¹´ì¹´ì¤í¡ ê³µì  íì¤í¸ê° ë³µì¬ëììµëë¤!');
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
  // AX) ì¦ê²¨ì°¾ê¸° â ê³ ê°í´ë ìë ì°ë (Favorite to Folder Link)
  // =========================================================

  window.WS._showFolderPicker = function(listingId) {
    var folders;
    try { folders = JSON.parse(localStorage.getItem('ws_customer_folders') || '[]'); } catch(e) { folders = []; }
    if (!Array.isArray(folders)) folders = [];

    if (folders.length === 0) {
      window.WS.showToast('ð ê³ ê°í´ëê° ììµëë¤. ê³ ê°í´ëë¥¼ ë¨¼ì  ìì±í´ì£¼ì¸ì.');
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
    html += '<h3 style="margin:0;font-size:16px;font-weight:800;">ð ê³ ê°í´ëì ì¶ê°</h3>';
    html += '<div style="font-size:12px;opacity:0.85;margin-top:4px;">' + escHtml(listing.title || listing.type + ' ' + listing.deal) + '</div>';
    html += '</div>';
    html += '<div style="padding:16px 20px;max-height:300px;overflow-y:auto;">';

    folders.forEach(function(folder) {
      var itemCount = (folder.items || []).length;
      var alreadyIn = (folder.items || []).some(function(item) { return String(item.id || item) === String(listingId); });
      html += '<div class="ws-folder-pick-item" data-folder-id="' + escHtml(String(folder.id)) + '" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;margin-bottom:6px;border:1px solid ' + (alreadyIn ? '#4CAF50' : '#e0e0e0') + ';border-radius:10px;cursor:' + (alreadyIn ? 'default' : 'pointer') + ';background:' + (alreadyIn ? '#f0fdf0' : '#fff') + ';transition:all 0.2s;">';
      html += '<div>';
      html += '<div style="font-weight:600;font-size:14px;color:#333;">ð¤ ' + escHtml(folder.name) + '</div>';
      html += '<div style="font-size:11px;color:#888;margin-top:2px;">ê´ì¬ë§¤ë¬¼ ' + itemCount + 'ê±´</div>';
      html += '</div>';
      if (alreadyIn) {
        html += '<span style="font-size:12px;color:#4CAF50;font-weight:600;">â ì¶ê°ë¨</span>';
      } else {
        html += '<span style="font-size:20px;color:#2D5A27;">+</span>';
      }
      html += '</div>';
    });

    html += '</div>';
    html += '<div style="padding:12px 20px;border-top:1px solid #eee;text-align:center;">';
    html += '<button id="ws-folderpicker-skip" style="padding:8px 24px;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;font-size:13px;cursor:pointer;color:#666;">ê±´ëë°ê¸°</button>';
    html += '</div></div>';

    modal.innerHTML = html;
    var parent = document.querySelector('.ws-search-container') || document.body;
    parent.appendChild(modal);

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    var skipBtn = document.getElementById('ws-folderpicker-skip');
    if (skipBtn) skipBtn.addEventListener('click', function() { modal.remove(); });

    // í´ë í´ë¦­ ì´ë²¤í¸
    modal.querySelectorAll('.ws-folder-pick-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var folderId = parseInt(this.dataset.folderId, 10);
        var spanEl = this.querySelector('span');
        var alreadyAdded = spanEl && spanEl.textContent.indexOf('ì¶ê°ë¨') >= 0;
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
              window.WS.showToast('â ' + targetFolder.name + ' í´ëì ì¶ê°ëììµëë¤!');
            }
          }
        } catch(err) { /* localStorage error */ }
        modal.remove();
      });
    });
  };

  // toggleFavorite íí¹: ì¦ê²¨ì°¾ê¸° ì¶ê° ì í´ë ì í íì
  var _origToggleFavorite = window.WS.toggleFavorite;
  if (_origToggleFavorite) {
    window.WS.toggleFavorite = function(id) {
      var wasFavorite = (window.WS.state.favorites || []).some(function(f) { return String(f) === String(id); });
      _origToggleFavorite.call(window.WS, id);
      // ìë¡ ì¶ê°ë ê²½ì°ìë§ í´ë ì í íì íì
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
  // AY) ë¤í¬ëª¨ë ìì¤í ìë ì°ë (Auto Dark Mode)
  // =========================================================

  window.WS._autoDarkMode = (function() {
    try { return localStorage.getItem('ws_dark_auto') === 'true'; } catch(e) { return false; }
  })();

  window.WS._initAutoDarkMode = function() {
    if (!window.matchMedia) return;

    // ì´ì  ë¦¬ì¤ë ì ë¦¬ (ë©ëª¨ë¦¬ ëì ë°©ì§)
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
        window.WS.showToast(shouldDark ? 'ð ìì¤í ì¤ì ì ë°ë¼ ë¤í¬ëª¨ë ON' : 'âï¸ ìì¤í ì¤ì ì ë°ë¼ ë¼ì´í¸ëª¨ë ON');
      }
    }

    // ì°¸ì¡° ì ì¥ (ë¤ì í¸ì¶ ì ì ë¦¬ ê°ë¥íëë¡)
    window.WS._darkModeMediaQuery = mediaQuery;
    window.WS._darkModeChangeHandler = handleChange;

    // ì´ê¸° ì ì©
    if (window.WS._autoDarkMode && mediaQuery.matches && !window.WS.isDarkMode()) {
      _safeSetItem('ws_dark_mode', 'true');
      window.WS._applyDarkMode(true);
    }

    // ë³ê²½ ê°ì§
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
    }
  };

  // ë¤í¬ëª¨ë ì¤ì  ëª¨ë¬ (ìë/ìë ì í)
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
    html += '<h2 style="font-size:18px;font-weight:800;margin:0;">ð ë¤í¬ëª¨ë ì¤ì </h2>';
    html += '<button id="ws-darkmode-close" style="width:32px;height:32px;border:none;background:rgba(255,255,255,0.15);border-radius:50%;font-size:16px;cursor:pointer;color:#fff;">â</button>';
    html += '</div>';
    html += '<div style="font-size:12px;opacity:0.7;margin-top:4px;">íì¬ ìì¤í: ' + (systemDark ? 'ð ë¤í¬' : 'âï¸ ë¼ì´í¸') + '</div>';
    html += '</div>';
    html += '<div style="padding:20px 24px;">';

    // ìë í ê¸
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:10px;background:' + (isDark ? '#16213e' : '#f8f8f8') + ';">';
    html += '<div><div style="font-weight:600;font-size:14px;color:' + (isDark ? '#e0e0e0' : '#333') + ';">' + (isDark ? 'ð ë¤í¬ëª¨ë' : 'âï¸ ë¼ì´í¸ëª¨ë') + '</div>';
    html += '<div style="font-size:11px;color:#888;">íì¬ ìí</div></div>';
    html += '<button id="ws-darkmode-toggle" style="padding:8px 16px;background:' + (isDark ? '#4CAF50' : '#333') + ';color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">' + (isDark ? 'OFF' : 'ON') + '</button>';
    html += '</div>';

    // ìë ëª¨ë
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border:1px solid ' + (isAuto ? '#4CAF50' : '#e0e0e0') + ';border-radius:10px;background:' + (isAuto ? '#f0fdf0' : (isDark ? '#16213e' : '#f8f8f8')) + ';">';
    html += '<div><div style="font-weight:600;font-size:14px;color:' + (isDark && !isAuto ? '#e0e0e0' : '#333') + ';">ð ìì¤í ìë ì°ë</div>';
    html += '<div style="font-size:11px;color:#888;">OS ì¤ì ì ë°ë¼ ìë ì í</div></div>';
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
        window.WS.showToast('ð ìì¤í ì°ë ë¤í¬ëª¨ë íì±í');
      } else {
        window.WS.showToast('ð ìì¤í ì°ë ë¤í¬ëª¨ë ë¹íì±í');
      }
      modal.remove();
      window.WS.showDarkModeSettings();
    });
  };

  // ì´ê¸°í ì ìë ë¤í¬ëª¨ë ì¤í
  window.WS._initAutoDarkMode();

  // toggleDarkMode ì¤ë²ë¼ì´ë: ë²í¼ í´ë¦­ ì ì¤ì  ëª¨ë¬ íì
  // _safeBtnì´ ìµëªí¨ìë¡ ë±ë¡íë¯ë¡ removeEventListener ëì  í¨ì ìì²´ë¥¼ êµì²´
  window.WS._rawToggleDarkMode = window.WS.toggleDarkMode;
  window.WS.toggleDarkMode = function() {
    window.WS.showDarkModeSettings();
  };

  // =========================================================
  // AZ) ì¹´ì¹´ì¤í¡ ì¹´ë ê³µì  ë²í¼ ì°ê²°
  // =========================================================

  // generateShareTextë¥¼ ì¹´ë ê³µì ë¡ ì¤ë²ë¼ì´ë
  var _origGenerateShareText = window.WS.generateShareText;
  window.WS.generateShareText = function() {
    // ì í ë§¤ë¬¼ì´ ìì¼ë©´ ì¹´ëí ê³µì , ìì¼ë©´ ìë³¸ í¸ì¶
    var ids = Array.from(window.WS.state.selectedIds || []);
    if (ids.length > 0) {
      window.WS.shareKakaoCard();
    } else if (_origGenerateShareText) {
      _origGenerateShareText.call(window.WS);
    } else {
      window.WS.showToast('ð ê³µì í  ë§¤ë¬¼ì ì íí´ì£¼ì¸ì');
    }
  };

  // íë¨ ë°ì ì ë²í¼ ì¶ê° (HTML ííë¦¿ì ì¶ê°íê¸° ì´ë ¤ì´ ëì  ë²í¼)
  // ì´ ë¶ë¶ì showSearchUI í¸ì¶ í setTimeoutì¼ë¡ ì¤í
  var _origShowSearchUI = window.WS.showSearchUI;
  if (_origShowSearchUI) {
    window.WS.showSearchUI = function() {
      _origShowSearchUI.call(window.WS);
      setTimeout(function() {
        // í¸ì ìë¦¼ ë²í¼ â ì¤ì  ëë¡­ë¤ì´ì ì¶ê°
        if (!document.getElementById('ws-btn-notiset')) {
          var settingsMenu = document.querySelectorAll('.ws-dropdown-menu');
          var targetMenu = settingsMenu.length > 0 ? settingsMenu[settingsMenu.length - 1] : null;
          if (targetMenu) {
            var btn1 = document.createElement('button');
            btn1.className = 'ws-dropdown-item';
            btn1.id = 'ws-btn-notiset';
            btn1.textContent = 'ð í¸ììë¦¼';
            targetMenu.appendChild(btn1);
            btn1.addEventListener('click', function() {
              var parent = this.closest('.ws-bar-dropdown');
              if (parent) parent.classList.remove('ws-dropdown-open');
              window.WS.showNotificationSettings();
            });
          }
        }

        // ë¹êµ ì°¨í¸ ë²í¼ â ë¶ì ëë¡­ë¤ì´ì ì¶ê°
        if (!document.getElementById('ws-btn-comparechart')) {
          var analysisMenus = document.querySelectorAll('.ws-dropdown-menu');
          var analysisMenu = analysisMenus.length >= 2 ? analysisMenus[1] : null;
          if (analysisMenu) {
            var btn2 = document.createElement('button');
            btn2.className = 'ws-dropdown-item';
            btn2.id = 'ws-btn-comparechart';
            btn2.textContent = 'ð ë¹êµì°¨í¸';
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
  // Section AK: ê²ì ì¡°ê±´ URL ê³µì  (Search Condition URL Sharing)
  // ==========================================================================
  window.WS.shareSearchCondition = function() {
    var s = window.WS.state;
    var params = {};

    // ê¸°ë³¸ íí°
    if (s.activeRegion && s.activeRegion !== 'ì êµ­') params.region = s.activeRegion;
    if (s.selectedRegions && s.selectedRegions.length > 0) params.regions = s.selectedRegions.join(',');
    if (s.typeTab && s.typeTab !== 'ì ì²´') params.type = s.typeTab;
    if (s.deal && s.deal !== 'ì ì²´') params.deal = s.deal;
    if (s.floor && s.floor !== 'ì ì²´') params.floor = s.floor;
    if (s.roomCount && s.roomCount !== 'ì ì²´') params.rooms = s.roomCount;
    if (s.roomShape && s.roomShape !== 'ì ì²´') params.shape = s.roomShape;
    if (s.builtYear && s.builtYear !== 'ì ì²´') params.built = s.builtYear;
    if (s.direction && s.direction !== 'ì ì²´') params.dir = s.direction;
    if (s.parking && s.parking !== 'ì ì²´') params.park = s.parking;
    if (s.livingSize && s.livingSize !== 'ì ì²´') params.living = s.livingSize;

    // ê°ê²© íí°
    if (s.minBasePrice) params.bp1 = s.minBasePrice;
    if (s.maxBasePrice) params.bp2 = s.maxBasePrice;
    if (s.minDeposit) params.dp1 = s.minDeposit;
    if (s.maxDeposit) params.dp2 = s.maxDeposit;
    if (s.minMonthly) params.mt1 = s.minMonthly;
    if (s.maxMonthly) params.mt2 = s.maxMonthly;
    if (s.minSalePrice) params.sp1 = s.minSalePrice;
    if (s.maxSalePrice) params.sp2 = s.maxSalePrice;

    // ë©´ì  íí°
    if (s.minArea) params.a1 = s.minArea;
    if (s.maxArea) params.a2 = s.maxArea;

    // ì²´í¬ë°ì¤ íí°
    if (s.checks) {
      var activeChecks = Object.keys(s.checks).filter(function(k) { return s.checks[k]; });
      if (activeChecks.length > 0) params.chk = activeChecks.join(',');
    }

    // í¤ìë, ì ë ¬
    if (s.keyword) params.q = s.keyword;
    if (s.sortBy && s.sortBy !== 'latest') params.sort = s.sortBy;

    var paramStr = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');

    if (!paramStr) {
      window.WS.showToast('ì¤ì ë ê²ì ì¡°ê±´ì´ ììµëë¤', 'warning');
      return;
    }

    var shareUrl = 'https://wishes.co.kr/admin?sort=latest&wsf=' + btoa(unescape(encodeURIComponent(paramStr)));

    // ì¡°ê±´ ìì½ íì¤í¸ ìì±
    var summary = [];
    if (params.region) summary.push('ì§ì­: ' + params.region);
    if (params.type) summary.push('ì í: ' + params.type);
    if (params.deal) summary.push('ê±°ë: ' + params.deal);
    if (params.q) summary.push('í¤ìë: ' + params.q);
    if (params.dp1 || params.dp2) summary.push('ë³´ì¦ê¸: ' + (params.dp1 || '~') + '~' + (params.dp2 || '') + 'ë§');
    if (params.mt1 || params.mt2) summary.push('ìì¸: ' + (params.mt1 || '~') + '~' + (params.mt2 || '') + 'ë§');

    var shareText = 'ð WISHES ë§¤ë¬¼ê²ì ì¡°ê±´ ê³µì \n';
    if (summary.length > 0) shareText += summary.join(' / ') + '\n';
    shareText += '\nð ' + shareUrl;

    // ëª¨ë¬ íì
    var existing = document.getElementById('ws-modal-share-condition');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-modal-share-condition';
    modal.className = 'ws-modal';
    modal.innerHTML = '<div class="ws-modal-content" style="max-width:520px;">' +
      '<button class="ws-modal-close">&times;</button>' +
      '<h2 style="font-size:18px;font-weight:800;color:#2D5A27;margin:0 0 16px;">ð ê²ì ì¡°ê±´ ê³µì </h2>' +
      '<p style="font-size:12px;color:#888;margin-bottom:12px;">íì¬ íí° ì¡°ê±´ì´ URLë¡ ì¸ì½ë©ë©ëë¤. ëë£ìê² ê³µì íë©´ ê°ì ì¡°ê±´ì¼ë¡ ê²ìë©ëë¤.</p>' +
      '<div style="margin-bottom:12px;">' +
        '<label style="font-size:11px;color:#666;font-weight:600;">ì ì©ë ì¡°ê±´</label>' +
        '<div style="padding:10px;background:#f0fdf4;border-radius:8px;font-size:12px;color:#333;margin-top:4px;">' +
          (summary.length > 0 ? escHtml(summary.join(' | ')) : '<span style="color:#aaa;">ê¸°ë³¸ ì¡°ê±´ (ì ì²´)</span>') +
        '</div>' +
      '</div>' +
      '<textarea id="ws-share-condition-text" readonly style="width:100%;height:80px;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:11px;resize:none;color:#555;box-sizing:border-box;">' + escHtml(shareText) + '</textarea>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="ws-copy-condition" style="flex:1;padding:10px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">ð ë³µì¬íê¸°</button>' +
        '<button id="ws-copy-url-only" style="flex:1;padding:10px;background:#fff;color:#2D5A27;border:2px solid #2D5A27;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">ð URLë§ ë³µì¬</button>' +
      '</div>' +
    '</div>';

    var container = document.querySelector('.ws-search-container') || document.body;
    container.appendChild(modal);

    modal.querySelector('.ws-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('ws-copy-condition').addEventListener('click', function() {
      navigator.clipboard.writeText(shareText).then(function() {
        window.WS.showToast('ê²ì ì¡°ê±´ì´ ë³µì¬ëììµëë¤', 'success');
      }).catch(function() { window.WS._fallbackCopy(shareText); });
    });

    document.getElementById('ws-copy-url-only').addEventListener('click', function() {
      navigator.clipboard.writeText(shareUrl).then(function() {
        window.WS.showToast('URLì´ ë³µì¬ëììµëë¤', 'success');
      }).catch(function() { window.WS._fallbackCopy(shareUrl); });
    });
  };

  // URLìì ê²ì ì¡°ê±´ ë³µì
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

      window.WS.showToast('ê³µì ë ê²ì ì¡°ê±´ì´ ì ì©ëììµëë¤', 'success');
    } catch(e) { /* ë³µì ì¤í¨ ë¬´ì */ }
  };

  // ==========================================================================
  // Section AL: ì í ë§¤ë¬¼ PDF ì¹´íë¡ê·¸ ì¼ê´ ì¶ë ¥
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
      window.WS.showToast('ë§¤ë¬¼ì ë¨¼ì  ì íí´ì£¼ì¸ì', 'warning');
      return;
    }
    if (selected.length > 20) {
      window.WS.showToast('ìµë 20ê±´ê¹ì§ ì¼ê´ ì¶ë ¥ ê°ë¥í©ëë¤', 'warning');
      return;
    }

    var printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.WS.showToast('íìì´ ì°¨ë¨ëììµëë¤. íì íì© í ë¤ì ìëí´ì£¼ì¸ì.', 'error');
      return;
    }

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>WISHES ë§¤ë¬¼ ì¹´íë¡ê·¸</title><style>' +
      'body{font-family:"Malgun Gothic","ë§ì ê³ ë",sans-serif;padding:0;margin:0;color:#333;font-size:12px;background:#fff;}' +
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
        '<h1>WISHES ë§¤ë¬¼ ì¹´íë¡ê·¸</h1>' +
        '<p>ì´ ' + selected.length + 'ê±´ | ' + new Date().toLocaleDateString('ko-KR') + ' ê¸°ì¤</p>' +
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
        priceText = l.price ? l.price + 'ë§ì' : '-';
      }

      html += '<div class="card">';
      if (imgUrl) {
        html += '<img class="card-img" src="' + escHtml(imgUrl) + '" onerror="this.style.display=\'none\'">';
      } else {
        html += '<div class="card-img" style="display:flex;align-items:center;justify-content:center;color:#ccc;font-size:24px;">ð </div>';
      }
      html += '<div class="card-body">';
      html += '<div class="card-title">' + escHtml(l.title || 'ë§¤ë¬¼') + '</div>';
      html += '<div class="card-addr">' + escHtml(l.address || '') + '</div>';
      html += '<div class="card-price">' + escHtml(priceText) + '</div>';
      html += '<div class="card-info">';
      if (l.type) html += '<span class="card-tag">' + escHtml(l.type) + '</span>';
      if (l.deal) html += '<span class="card-tag">' + escHtml(l.deal) + '</span>';
      if (l.area) html += '<span class="card-tag">' + escHtml(l.area) + 'mÂ²</span>';
      if (l.floor_info) html += '<span class="card-tag">' + escHtml(l.floor_info) + '</span>';
      if (l.rooms) html += '<span class="card-tag">' + escHtml(l.rooms) + 'ê°</span>';
      if (l.direction) html += '<span class="card-tag">' + escHtml(l.direction) + '</span>';
      html += '</div></div></div>';
    });

    html += '</div>' +
      '<div class="catalog-footer">WISHES | ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì° ìë¹ì¤ | wishes.co.kr<br>ë³¸ ìë£ë ì°¸ê³ ì©ì´ë©° ì¤ì  ê³ì½ ì íì¥ íì¸ì´ íìí©ëë¤.</div>' +
      '<script>setTimeout(function(){window.print();},600);<\/script>' +
      '</body></html>';

    // script íê·¸ ì ê±° ë°©ì´ (htmlContentììë§ â ì¬ê¸°ì  ìì²´ ìì±ì´ë¯ë¡ ìì )
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ==========================================================================
  // ì´ê¸°í: URL ê³µì  ì¡°ê±´ ë³µì + ë²í¼ ì°ê²°
  // ==========================================================================
  // ì ê¸°ë¥ ë²í¼ ì½ì í¨ì (ê²ì UI íì í í¸ì¶)
  function _addNewFeatureButtons() {
    var shareMenus = document.querySelectorAll('.ws-dropdown-menu');
    var shareMenu = shareMenus.length >= 1 ? shareMenus[0] : null;
    if (!shareMenu) return;

    if (!document.getElementById('ws-btn-share-condition')) {
      var btn = document.createElement('button');
      btn.className = 'ws-dropdown-item';
      btn.id = 'ws-btn-share-condition';
      btn.textContent = 'ð ê²ìì¡°ê±´ ê³µì ';
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
      btn2.textContent = 'ð PDF ì¹´íë¡ê·¸';
      shareMenu.appendChild(btn2);
      btn2.addEventListener('click', function() {
        var parent = this.closest('.ws-bar-dropdown');
        if (parent) parent.classList.remove('ws-dropdown-open');
        window.WS.exportPdfCatalog();
      });
    }
  }

  // MutationObserverë¡ ê²ì UI ìì± ê°ì§ â ë²í¼ ì½ì
  (function _initNewFeatures() {
    var _btnAdded = false;
    var observer = new MutationObserver(function() {
      if (_btnAdded) return;
      var menu = document.querySelector('.ws-dropdown-menu');
      if (menu) {
        _btnAdded = true;
        observer.disconnect(); // ë©ë´ ë°ê²¬ í ë ì´ì ê°ì ë¶íì
        setTimeout(_addNewFeatureButtons, 300);
        // URL ê³µì  ì¡°ê±´ ë³µì
        if (window.WS._restoreFromShareUrl) {
          setTimeout(function() { window.WS._restoreFromShareUrl(); }, 500);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ì´ë¯¸ ë©ë´ê° ìì¼ë©´ ì¦ì ì¤í
    if (document.querySelector('.ws-dropdown-menu')) {
      _addNewFeatureButtons();
      if (window.WS._restoreFromShareUrl) window.WS._restoreFromShareUrl();
    }
  })();

  // ============================================================================
  // ë§¤ë¬¼ ê´ë¦¬ íµí© ê¸°ë¥ (Section MG)
  // ============================================================================

  // MG-1) ìí ëìë³´ë ìë°ì´í¸
  window.WS._updateMgmtDashboard = function() {
    var all = window.WS.allListings || [];
    var total = all.length;
    var pub = 0, priv = 0, contracting = 0, completed = 0;
    all.forEach(function(l) {
      var st = l.status || 'ê³µê°';
      if (st === 'ë¹ê³µê°') priv++;
      else if (st === 'ê³ì½ì¤') contracting++;
      else if (st === 'ê³ì½ìë£') completed++;
      else pub++;
    });
    var el = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val.toLocaleString(); };
    el('ws-mgmt-total', total);
    el('ws-mgmt-public', pub);
    el('ws-mgmt-private', priv);
    el('ws-mgmt-contracting', contracting);
    el('ws-mgmt-completed', completed);
  };

  // MG-2) ëìë³´ë ìí íí° í´ë¦­
  (function _initMgmtDashboard() {
    var _mgmtReady = false;
    var _initDash = function() {
      if (_mgmtReady) return;
      var dash = document.getElementById('ws-mgmt-dashboard');
      if (!dash) return;
      _mgmtReady = true;

      // ìí íí° í´ë¦­
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

      // ì ë§¤ë¬¼ ë±ë¡ ë²í¼
      var btnNew = document.getElementById('ws-btn-new-listing');
      if (btnNew) btnNew.addEventListener('click', function() { window.WS._showNewListingModal(); });

      // ëë ë±ë¡ ë²í¼
      var btnBulk = document.getElementById('ws-btn-bulk-upload');
      if (btnBulk) btnBulk.addEventListener('click', function() { window.WS._showBulkUploadModal(); });

      // ì¼ê´ ìí ë³ê²½
      var btnBulkSt = document.getElementById('ws-btn-bulk-status');
      if (btnBulkSt) btnBulkSt.addEventListener('click', function() { window.WS._bulkStatusChange(); });

      // AI ì¼ê´ ìëìì± (ê±´ì¶ë¬¼ëì¥ + AI ì¤ëª)
      var btnAutoGen = document.getElementById('ws-btn-bulk-autogen');
      if (btnAutoGen) btnAutoGen.addEventListener('click', function() { window.WS._runBulkAutoGenerate(); });

      // CSV ë´ë³´ë´ê¸°
      var btnCsv = document.getElementById('ws-btn-csv-export');
      if (btnCsv) btnCsv.addEventListener('click', function() { window.WS._exportCSV(); });
    };

    var obs = new MutationObserver(function() {
      _initDash();
      if (_mgmtReady) obs.disconnect(); // ëìë³´ë ì´ê¸°í ìë£ í ê°ì ì¤ë¨
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(_initDash, 500);
  })();

  // MG-3) ìí ë³ê²½ API í¸ì¶ â admin field-update ìëí¬ì¸í¸ ì¬ì©
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
        var errMsg = 'ìë² ì¤ë¥ (' + r.status + ')';
        try { var j = JSON.parse(txt); errMsg = j.error || j.message || errMsg; } catch(e) {}
        throw new Error(errMsg);
      });
    }).then(function(data) {
      var listing = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(id); });
      if (listing) listing.status = newStatus;
      window.WS._updateMgmtDashboard();
      showToast('ë§¤ë¬¼ #' + id + ' ìí â ' + newStatus + ' ë³ê²½ìë£', 'success');
    }).catch(function(err) {
      showToast('ìí ë³ê²½ ì¤ë¥: ' + err.message, 'error');
    });
  };

  // MG-4) ë§¤ë¬¼ ì­ì  (superadmin ì ì©)
  window.WS._deleteListing = function(listing) {
    if (!window.WS.isSuperAdmin()) {
      window.WS.showToast('â ë§¤ë¬¼ ì­ì ë ìµê³ ê´ë¦¬ìë§ ê°ë¥í©ëë¤.', 'error');
      return;
    }
    if (!confirm('ë§¤ë¬¼ #' + listing.id + ' [' + (listing.title || '') + '] ì(ë¥¼) ì­ì íìê² ìµëê¹?\n\nâ ï¸ ì´ ììì ëëë¦´ ì ììµëë¤.')) return;
    var token = localStorage.getItem('wishes_token') || localStorage.getItem('token') || '';
    fetch('https://wishes.co.kr/api/listings/' + listing.id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) {
      if (r.ok) return r.text().then(function(t) { if (!t || !t.trim()) return { success: true }; try { return JSON.parse(t); } catch(e) { return { success: true }; } });
      return r.text().then(function(t) { var msg = 'ìë² ì¤ë¥ (' + r.status + ')'; try { var j = JSON.parse(t); msg = j.error || j.message || msg; } catch(e) {} throw new Error(msg); });
    }).then(function(data) {
      window.WS.allListings = (window.WS.allListings || []).filter(function(l) { return String(l.id) !== String(listing.id); });
      window.WS.applyFilters();
      window.WS.renderListings();
      window.WS._updateMgmtDashboard();
      showToast('ë§¤ë¬¼ #' + listing.id + ' ì­ì ìë£', 'success');
    }).catch(function(err) {
      showToast('ì­ì  ì¤ë¥: ' + err.message, 'error');
    });
  };

  // MG-5) ë§¤ë¬¼ ìì  ëª¨ë¬
  window.WS._showEditModal = function(listing) {
    var old = document.getElementById('ws-edit-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-edit-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:600px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="margin:0;font-size:18px;font-weight:700;color:#2D5A27;">âï¸ ë§¤ë¬¼ ìì  (ID: ' + listing.id + ')</h3>' +
        '<button id="ws-edit-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">â</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ì ëª©</label><input id="ws-edit-title" value="' + escHtml(listing.title || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ê±°ëì í</label><select id="ws-edit-deal" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          '<option value="ìì¸"' + (listing.deal === 'ìì¸' ? ' selected' : '') + '>ìì¸</option>' +
          '<option value="ì ì¸"' + (listing.deal === 'ì ì¸' ? ' selected' : '') + '>ì ì¸</option>' +
          '<option value="ë§¤ë§¤"' + (listing.deal === 'ë§¤ë§¤' ? ' selected' : '') + '>ë§¤ë§¤</option>' +
        '</select></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ì£¼ì</label><input id="ws-edit-address" value="' + escHtml(listing.address || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ë/í¸ì</label><input id="ws-edit-detail" value="' + escHtml(listing.address_detail || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ë³´ì¦ê¸ (ë§ì)</label><input type="number" id="ws-edit-deposit" value="' + (listing.deposit || 0) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ìì¸ (ë§ì)</label><input type="number" id="ws-edit-monthly" value="' + (listing.monthly || 0) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ë§¤ë§¤ê° (ë§ì)</label><input type="number" id="ws-edit-price" value="' + (listing.price || 0) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ì í</label><select id="ws-edit-type" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          ['ìë£¸','í¬ë£¸','ì°ë¦¬ë£¸','ì¤í¼ì¤í','ìíí¸','ë¹ë¼','ìê°','ì¬ë¬´ì¤','ê¸°í'].map(function(t) { return '<option value="' + t + '"' + (listing.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
        '</select></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ë©´ì  (mÂ²)</label><input type="number" id="ws-edit-area" value="' + (listing.area_m2 || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ì¸µì</label><input id="ws-edit-floor" value="' + (listing.floor_current || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ê´ë¦¬ë¹ (ë§ì)</label><input type="number" id="ws-edit-maint" value="' + (listing.maintenance_fee || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ê´ë¦¬ë¹ í¬í¨í­ëª©</label><input id="ws-edit-maint-includes" value="' + escHtml(listing.maintenance_includes || '') + '" placeholder="ì: ìë, ì¸í°ë·, TV" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ìí</label><select id="ws-edit-status" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          '<option value="ê³µê°"' + ((listing.status || 'ê³µê°') === 'ê³µê°' ? ' selected' : '') + '>ê³µê°</option>' +
          '<option value="ë¹ê³µê°"' + (listing.status === 'ë¹ê³µê°' ? ' selected' : '') + '>ë¹ê³µê°</option>' +
          '<option value="ê³ì½ì¤"' + (listing.status === 'ê³ì½ì¤' ? ' selected' : '') + '>ê³ì½ì¤</option>' +
          '<option value="ê³ì½ìë£"' + (listing.status === 'ê³ì½ìë£' ? ' selected' : '') + '>ê³ì½ìë£</option>' +
        '</select></div>' +
      '</div>' +
      '<div style="grid-column:1/-1;margin-top:8px;"><label style="font-size:12px;color:#666;font-weight:600;">ìì¸ì¤ëª</label><textarea id="ws-edit-desc" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:vertical;">' + escHtml(listing.description || '') + '</textarea></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button id="ws-edit-cancel" style="padding:10px 20px;background:#f3f4f6;color:#333;border:none;border-radius:8px;font-size:14px;cursor:pointer;">ì·¨ì</button>' +
        '<button id="ws-edit-save" style="padding:10px 24px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:700;">ð¾ ì ì¥</button>' +
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
        return r.text().then(function(t) { var msg = 'ìë² ì¤ë¥ (' + r.status + ')'; try { var j = JSON.parse(t); msg = j.error || j.message || msg; } catch(e) {} throw new Error(msg); });
      }).then(function(data) {
        Object.keys(body).forEach(function(k) {
          if (body[k] !== null && body[k] !== undefined) listing[k] = body[k];
        });
        window.WS.applyFilters();
        window.WS.renderListings();
        window.WS._updateMgmtDashboard();
        modal.remove();
        showToast('ë§¤ë¬¼ #' + listing.id + ' ìì  ìë£!', 'success');
      }).catch(function(err) {
        showToast('ìì  ì¤ë¥: ' + err.message, 'error');
      });
    });
  };

  // MG-6) ì ë§¤ë¬¼ ë±ë¡ ëª¨ë¬
  window.WS._showNewListingModal = function() {
    var old = document.getElementById('ws-new-listing-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-new-listing-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:600px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="margin:0;font-size:18px;font-weight:700;color:#2D5A27;">â ì ë§¤ë¬¼ ë±ë¡</h3>' +
        '<button id="ws-new-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">â</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ì ëª© *</label><input id="ws-new-title" placeholder="ì: ê´ìêµ¬ ì ë¦¼ë ìë£¸" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ê±°ëì í *</label><select id="ws-new-deal" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"><option value="ìì¸">ìì¸</option><option value="ì ì¸">ì ì¸</option><option value="ë§¤ë§¤">ë§¤ë§¤</option></select></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ì£¼ì *</label><input id="ws-new-address" placeholder="ìì¸í¹ë³ì ê´ìêµ¬ ì ë¦¼ë 123-4" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ë/í¸ì</label><input id="ws-new-detail" placeholder="101ë 201í¸" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ë³´ì¦ê¸ (ë§ì)</label><input type="number" id="ws-new-deposit" value="0" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ìì¸ (ë§ì)</label><input type="number" id="ws-new-monthly" value="0" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ë§¤ë§¤ê° (ë§ì)</label><input type="number" id="ws-new-price" value="0" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ì í *</label><select id="ws-new-type" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
          ['ìë£¸','í¬ë£¸','ì°ë¦¬ë£¸','ì¤í¼ì¤í','ìíí¸','ë¹ë¼','ìê°','ì¬ë¬´ì¤','ê¸°í'].map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') +
        '</select></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ë©´ì  (mÂ²)</label><input type="number" id="ws-new-area" placeholder="33" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ì¸µì</label><input id="ws-new-floor" placeholder="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ê´ë¦¬ë¹ (ë§ì)</label><input type="number" id="ws-new-maint" placeholder="5" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ê´ë¦¬ë¹ í¬í¨í­ëª©</label><input id="ws-new-maint-includes" placeholder="ìë, ì¸í°ë·, TV" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
        '<div><label style="font-size:12px;color:#666;font-weight:600;">ë</label><input id="ws-new-dong" placeholder="ì ë¦¼ë" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>' +
      '</div>' +
      '<div style="margin-top:12px;"><label style="font-size:12px;color:#666;font-weight:600;">ìì¸ì¤ëª</label><textarea id="ws-new-desc" rows="3" placeholder="ë§¤ë¬¼ í¹ì´ì¬í­ ë±" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:vertical;"></textarea></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button id="ws-new-cancel" style="padding:10px 20px;background:#f3f4f6;color:#333;border:none;border-radius:8px;font-size:14px;cursor:pointer;">ì·¨ì</button>' +
        '<button id="ws-new-save" style="padding:10px 24px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:700;">ð ë±ë¡íê¸°</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    document.getElementById('ws-new-close').addEventListener('click', function() { modal.remove(); });
    document.getElementById('ws-new-cancel').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('ws-new-save').addEventListener('click', function() {
      var title = document.getElementById('ws-new-title').value.trim();
      var address = document.getElementById('ws-new-address').value.trim();
      if (!title || !address) { showToast('ì ëª©ê³¼ ì£¼ìë íììëë¤.', 'error'); return; }

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
        status: 'ê³µê°'
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
          showToast('ì ë§¤ë¬¼ì´ ë±ë¡ëììµëë¤! (ID: ' + (newListing.id || '?') + ')', 'success');
          // â ìëì¼ë¡ ê±´ì¶ë¬¼ëì¥ ì¡°í + AI ì¤ëª ìì± í¸ë¦¬ê±°
          if (newListing.id && window.WS._autoGenerateForNewListing) {
            setTimeout(function() {
              window.WS._autoGenerateForNewListing(newListing);
              showToast('ð¤ ê±´ì¶ë¬¼ëì¥ + AI ì¤ëª ìë ìì± ìì...', 'info');
            }, 2000);
          }
        } else {
          showToast('ë±ë¡ ì¤í¨: ' + (data.error || JSON.stringify(data)), 'error');
        }
      }).catch(function(err) {
        showToast('ë±ë¡ ì¤ë¥: ' + err.message, 'error');
      });
    });
  };

  // MG-7) ëë ë±ë¡ ëª¨ë¬
  window.WS._showBulkUploadModal = function() {
    var old = document.getElementById('ws-bulk-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-bulk-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:520px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<h3 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#7c3aed;">ð ë§¤ë¬¼ ëë ë±ë¡</h3>' +
      '<p style="font-size:13px;color:#666;margin-bottom:12px;">CSV íì¼ì ìë¡ëíì¬ ì¬ë¬ ë§¤ë¬¼ì í ë²ì ë±ë¡í  ì ììµëë¤.</p>' +
      '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px;color:#555;">' +
        '<strong>CSV íì ì»¬ë¼:</strong> title, address, deal, deposit, monthly, price, type<br>' +
        '<strong>ì í ì»¬ë¼:</strong> address_detail, dong, area_m2, floor_current, maintenance_fee, description' +
      '</div>' +
      '<div id="ws-bulk-dropzone" style="border:2px dashed #7c3aed;border-radius:12px;padding:32px;text-align:center;cursor:pointer;background:#faf5ff;">' +
        '<div style="font-size:32px;margin-bottom:8px;">ð</div>' +
        '<div style="font-size:14px;font-weight:600;color:#7c3aed;">CSV íì¼ì ëëê·¸íê±°ë í´ë¦­íì¬ ì í</div>' +
        '<input type="file" id="ws-bulk-file" accept=".csv" style="display:none;">' +
      '</div>' +
      '<div id="ws-bulk-preview" style="display:none;margin-top:12px;max-height:200px;overflow-y:auto;"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button id="ws-bulk-cancel" style="padding:8px 16px;background:#f3f4f6;color:#333;border:none;border-radius:8px;cursor:pointer;">ì·¨ì</button>' +
        '<button id="ws-bulk-submit" style="padding:8px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;display:none;">ð ì¼ê´ ë±ë¡</button>' +
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
        if (lines.length < 2) { showToast('CSVì ë°ì´í°ê° ììµëë¤.', 'error'); return; }
        var headers = lines[0].split(',').map(function(h) { return h.trim().replace(/"/g, ''); });
        parsedRows = [];
        for (var i = 1; i < lines.length; i++) {
          var vals = lines[i].split(',').map(function(v) { return v.trim().replace(/"/g, ''); });
          var row = {};
          headers.forEach(function(h, idx) { row[h] = vals[idx] || ''; });
          parsedRows.push(row);
        }
        preview.style.display = 'block';
        preview.innerHTML = '<div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px;">' + parsedRows.length + 'ê±´ ê°ì§ë¨</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f3f4f6;">' +
          headers.slice(0, 5).map(function(h) { return '<th style="padding:4px 6px;border:1px solid #ddd;">' + h + '</th>'; }).join('') +
          '</tr>' +
          parsedRows.slice(0, 5).map(function(row) {
            return '<tr>' + headers.slice(0, 5).map(function(h) { return '<td style="padding:4px 6px;border:1px solid #ddd;">' + (row[h] || '') + '</td>'; }).join('') + '</tr>';
          }).join('') +
          (parsedRows.length > 5 ? '<tr><td colspan="5" style="text-align:center;padding:4px;color:#888;">... ì¸ ' + (parsedRows.length - 5) + 'ê±´</td></tr>' : '') +
          '</table>';
        submitBtn.style.display = 'inline-block';
      };
      reader.readAsText(file, 'UTF-8');
    });

    submitBtn.addEventListener('click', function() {
      if (parsedRows.length === 0) return;
      var token = localStorage.getItem('wishes_token') || localStorage.getItem('token') || '';
      var success = 0, fail = 0, total = parsedRows.length;
      submitBtn.textContent = 'ë±ë¡ì¤... 0/' + total;
      submitBtn.disabled = true;

      function doNext(idx) {
        if (idx >= total) {
          showToast('ëë ë±ë¡ ìë£! (ì±ê³µ: ' + success + ', ì¤í¨: ' + fail + ')', success > 0 ? 'success' : 'error');
          modal.remove();
          if (success > 0) {
            window.WS.loadData();
            // â ëë ë±ë¡ í ìëì¼ë¡ ê±´ì¶ë¬¼ëì¥+AI ì¼ê´ ìì± ìë´
            showToast('ð¡ ìë¡ ë±ë¡ë ë§¤ë¬¼ì AI ì¤ëªì ì¶ê°íë ¤ë©´ "ðï¸ AIì¼ê´ìì±" ë²í¼ì ëë¬ì£¼ì¸ì!', 'info');
          }
          return;
        }
        var row = parsedRows[idx];
        var body = {
          title: row.title || '',
          address: row.address || '',
          deal: row.deal || 'ìì¸',
          deposit: parseInt(row.deposit) || 0,
          monthly: parseInt(row.monthly) || 0,
          price: parseInt(row.price) || 0,
          type: row.type || 'ìë£¸',
          address_detail: row.address_detail || '',
          dong: row.dong || '',
          area_m2: parseFloat(row.area_m2) || null,
          floor_current: row.floor_current || null,
          maintenance_fee: parseInt(row.maintenance_fee) || null,
          description: row.description || '',
          status: 'ê³µê°'
        };
        fetch('https://wishes.co.kr/api/listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(body)
        }).then(function(r) { return r.json(); }).then(function(d) {
          if (d.success || d.id || d.data) success++; else fail++;
        }).catch(function() { fail++; }).finally(function() {
          submitBtn.textContent = 'ë±ë¡ì¤... ' + (idx + 1) + '/' + total;
          setTimeout(function() { doNext(idx + 1); }, 100);
        });
      }
      doNext(0);
    });
  };

  // MG-8) ì¼ê´ ìí ë³ê²½
  window.WS._bulkStatusChange = function() {
    var selectedIds = Array.from(window.WS.state.selectedIds);
    if (selectedIds.length === 0) {
      showToast('ë¨¼ì  ë§¤ë¬¼ì ì íí´ì£¼ì¸ì.', 'warning');
      return;
    }

    var old = document.getElementById('ws-bulk-status-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ws-bulk-status-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<h3 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#d97706;">ð ì¼ê´ ìí ë³ê²½</h3>' +
      '<p style="font-size:14px;color:#333;">ì íë <strong>' + selectedIds.length + 'ê±´</strong>ì ë§¤ë¬¼ ìíë¥¼ ë³ê²½í©ëë¤.</p>' +
      '<select id="ws-bulk-new-status" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin:16px 0;">' +
        '<option value="ê³µê°">ð¢ ê³µê°</option>' +
        '<option value="ë¹ê³µê°">âª ë¹ê³µê°</option>' +
        '<option value="ê³ì½ì¤">ð¡ ê³ì½ì¤</option>' +
        '<option value="ê³ì½ìë£">â ê³ì½ìë£</option>' +
      '</select>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="ws-bst-cancel" style="padding:8px 16px;background:#f3f4f6;color:#333;border:none;border-radius:8px;cursor:pointer;">ì·¨ì</button>' +
        '<button id="ws-bst-apply" style="padding:8px 20px;background:#d97706;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">ì ì©</button>' +
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
          throw new Error('ìë² ì¤ë¥ (' + r.status + ')');
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
            showToast(total + 'ê±´ ìí â ' + newSt + ' ì¼ê´ ë³ê²½ ìë£!', 'success');
          }
        });
      });
    });
  };

  // MG-9) CSV ë´ë³´ë´ê¸°
  window.WS._exportCSV = function() {
    var items = window.WS.filtered || window.WS.allListings || [];
    if (items.length === 0) { showToast('ë´ë³´ë¼ ë§¤ë¬¼ì´ ììµëë¤.', 'warning'); return; }

    var headers = ['ID','ì ëª©','ì£¼ì','ë/í¸ì','ë','ì í','ê±°ë','ë³´ì¦ê¸','ìì¸','ë§¤ë§¤ê°','ê´ë¦¬ë¹','ë©´ì (mÂ²)','ì¸µ','ìí','ë±ë¡ì¼'];
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
        l.status || 'ê³µê°',
        l.created_at || ''
      ].join(',');
    });

    var csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'WISHES_ë§¤ë¬¼ëª©ë¡_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast(items.length + 'ê±´ CSV ë´ë³´ë´ê¸° ìë£!', 'success');
  };

  // MG-10) applyFiltersì ìí íí° ì ì© (ìë applyFilters íì¥)
  (function _patchApplyFiltersForStatus() {
    var _origApply = window.WS.applyFilters;
    window.WS.applyFilters = function(items) {
      var result = _origApply.call(window.WS, items || window.WS.allListings || []);
      // ìí íí° ì ì©
      var statusFilter = window.WS.state._statusFilter;
      if (statusFilter && result) {
        result = result.filter(function(l) {
          var st = l.status || 'ê³µê°';
          return st === statusFilter;
        });
      }
      // ê²°ê³¼ë¥¼ window.WS.filteredì í ë¹
      if (result) window.WS.filtered = result;
      // ëìë³´ë ìë°ì´í¸
      window.WS._updateMgmtDashboard();
      return result;
    };
  })();

  // MG-11) ì¬ì´ëë°ìì "ë§¤ë¬¼ ê´ë¦¬" í´ë¦­ ì â "ë§¤ë¬¼ ê²ì"ì¼ë¡ ë¦¬ë¤ì´ë í¸
  (function _redirectListingsToSearch() {
    var _redirectBound = false;
    function _tryRedirect() {
      if (_redirectBound) return;
      var links = document.querySelectorAll('a[href*="/admin/listings"], nav a, aside a');
      var found = false;
      links.forEach(function(link) {
        var text = link.textContent.trim();
        if (text.indexOf('ë§¤ë¬¼ ê´ë¦¬') !== -1 || (link.href && link.href.indexOf('/admin/listings') !== -1)) {
          found = true;
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            // ë§¤ë¬¼ ê²ì ë²í¼ í´ë¦­ ìë®¬ë ì´ì
            var searchBtn = document.querySelector('[data-ws-search-trigger]') || document.getElementById('ws-search-btn');
            if (searchBtn) {
              searchBtn.click();
            } else {
              // fallback: ë§¤ë¬¼ ê²ì ì¬ì´ëë° ìì´í ì°¾ê¸°
              var navItems = document.querySelectorAll('nav a, aside a, [class*="sidebar"] a');
              navItems.forEach(function(ni) {
                if (ni.textContent.trim().indexOf('ë§¤ë¬¼ ê²ì') !== -1) ni.click();
              });
            }
            showToast('ð¡ ë§¤ë¬¼ ê´ë¦¬ê° ë§¤ë¬¼ ê²ìì¼ë¡ íµí©ëììµëë¤!', 'info');
          });
          // ìê°ì ì¼ë¡ ë§¤ë¬¼ ê´ë¦¬ â ë§¤ë¬¼ íµí©ê²ì ì¼ë¡ íì¤í¸ ë³ê²½
          var textEl = link.querySelector('span') || link;
          if (textEl.textContent.indexOf('ë§¤ë¬¼ ê´ë¦¬') !== -1) {
            textEl.textContent = textEl.textContent.replace('ë§¤ë¬¼ ê´ë¦¬', 'ë§¤ë¬¼ íµí©ê´ë¦¬');
          }
        }
      });
      if (found) {
        _redirectBound = true;
        if (obs) obs.disconnect(); // ë°ì¸ë© ìë£ í ê°ì ì¤ë¨
      }
    }
    setTimeout(_tryRedirect, 1000);
    setTimeout(_tryRedirect, 3000);
    var obs = new MutationObserver(function() { _tryRedirect(); });
    obs.observe(document.body, { childList: true, subtree: true });
  })();

  // ========== AI SEO ìëìì± ê¸°ë¥ ==========

  // â ì ë§¤ë¬¼ ë±ë¡ ì ìë ì¤í:
  // 1) ê±´ì¶ë¬¼ëì¥ ì¡°í â ê¸°ë³¸ì ë³´/ë©´ì êµ¬ì¡°/ì¶ê°ì ë³´ DB íë ì§ì  ìë°ì´í¸ (PATCH)
  // 2) AI ì ëª©/ì¤ëª/SEO ìì± (ê¸ì¡ ì ì¸, ë§¤ë ¥ í¬ì¸í¸ ì¤ì¬)
  // 3) ì§ì  ë´ì© ì²¨ë¶ ë°©ì ì ì¸, API ìë ì²ë¦¬ë§
  // ìì í JSON íì± í¬í¼ (ëª¨ë  API í¸ì¶ìì ê³µíµ ì¬ì©)
  window.WS._safeJson = function(response) {
    if (!response.ok) {
      _wsLog('[WISHES-AI] HTTP ìëµ: ' + response.status + ' ' + response.statusText);
      return Promise.resolve({ success: false, error: 'HTTP ' + response.status, status: response.status });
    }
    return response.text().then(function(text) {
      if (!text || text.trim() === '') return { success: false, error: 'empty response' };
      try { return JSON.parse(text); }
      catch(e) {
        _wsLog('[WISHES-AI] JSON íì± ì¤í¨:', text.substring(0, 200));
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
          var delay = attempt * 2000; // 2ì´, 4ì´ ëë ì´
          _wsLog('[WISHES] ìë² ì¤ë¥ ' + r.status + ', ' + delay/1000 + 'ì´ í ì¬ìë (' + attempt + '/' + maxRetries + ')');
          return new Promise(function(resolve) {
            setTimeout(function() { resolve(tryFetch()); }, delay);
          });
        }
        return r;
      }).catch(function(err) {
        if (attempt < maxRetries) {
          attempt++;
          var delay = attempt * 2000;
          _wsLog('[WISHES] ë¤í¸ìí¬ ì¤ë¥, ' + delay/1000 + 'ì´ í ì¬ìë (' + attempt + '/' + maxRetries + '): ' + (err.message || err));
          return new Promise(function(resolve) {
            setTimeout(function() { resolve(tryFetch()); }, delay);
          });
        }
        throw err;
      });
    }
    return tryFetch();
  };

  // ìì¸/ê²½ê¸° ìêµ°êµ¬ì½ë ë§¤í (ê±´ì¶ë¬¼ëì¥ APIì©)
  window.WS._SIGUNGU_MAP = {
    // ìì¸í¹ë³ì
    'ì¢ë¡êµ¬':'11110','ì¤êµ¬':'11140','ì©ì°êµ¬':'11170','ì±ëêµ¬':'11200','ê´ì§êµ¬':'11215',
    'ëëë¬¸êµ¬':'11230','ì¤ëêµ¬':'11260','ì±ë¶êµ¬':'11290','ê°ë¶êµ¬':'11305','ëë´êµ¬':'11320',
    'ë¸ìêµ¬':'11350','ìíêµ¬':'11380','ìëë¬¸êµ¬':'11410','ë§í¬êµ¬':'11440','ìì²êµ¬':'11470',
    'ê°ìêµ¬':'11500','êµ¬ë¡êµ¬':'11530','ê¸ì²êµ¬':'11545','ìë±í¬êµ¬':'11560','ëìêµ¬':'11590',
    'ê´ìêµ¬':'11620','ìì´êµ¬':'11650','ê°ë¨êµ¬':'11680','ì¡íêµ¬':'11710','ê°ëêµ¬':'11740',
    // ê²½ê¸°ë ì£¼ì ì/êµ¬
    'ìììì¥ìêµ¬':'41111','ìììê¶ì êµ¬':'41113','ìììíë¬êµ¬':'41115','ììììíµêµ¬':'41117',
    'ì±ë¨ììì êµ¬':'41131','ì±ë¨ìì¤ìêµ¬':'41133','ì±ë¨ìë¶ë¹êµ¬':'41135',
    'ì©ì¸ìì²ì¸êµ¬':'41461','ì©ì¸ìê¸°í¥êµ¬':'41463','ì©ì¸ììì§êµ¬':'41465',
    'ê³ ììëìêµ¬':'41281','ê³ ììì¼ì°ëêµ¬':'41285','ê³ ììì¼ì°ìêµ¬':'41287',
    'ìììë§ìêµ¬':'41171','ìììëìêµ¬':'41173',
    'ë¶ì²ì':'41190','ê´ëªì':'41210','ííì':'41220','ìì°ììë¡êµ¬':'41271','ìì°ìë¨ìêµ¬':'41273',
    'ê³¼ì²ì':'41290','ììì':'41430','êµ°í¬ì':'41410','ìí¥ì':'41390','íì±ì':'41590',
    'íë¨ì':'41450','ì´ì²ì':'41500','ê¹í¬ì':'41570','ê´ì£¼ì':'41610','íì£¼ì':'41480',
    'ìì£¼ì':'41630','ìì ë¶ì':'41150','ë¨ìì£¼ì':'41360','êµ¬ë¦¬ì':'41310','í¬ì²ì':'41650',
    'ëëì²ì':'41250','ê°íêµ°':'41820','ì°ì²êµ°':'41800','ìíêµ°':'41830',
    // ì¸ì²ê´ì­ì ì£¼ì êµ¬
    'ì¸ì²ì¤êµ¬':'28110','ì¸ì²ëêµ¬':'28140','ì¸ì²ë¯¸ì¶íêµ¬':'28177','ì¸ì²ì°ìêµ¬':'28185',
    'ì¸ì²ë¨ëêµ¬':'28200','ì¸ì²ë¶íêµ¬':'28237','ì¸ì²ê³ìêµ¬':'28245','ì¸ì²ìêµ¬':'28260'
  };

  // ì£¼ì â ìêµ°êµ¬ì½ë + ë³¸ë²/ë¶ë² íì±
  window.WS._parseAddress = function(address) {
    if (!address) return null;
    var addr = address.trim();
    var result = { sigunguCd: null, bun: null, ji: null };
    var map = window.WS._SIGUNGU_MAP;

    // ê²½ê¸°ë ë³µí© ì/êµ¬ í¨í´: "ì±ë¨ì ë¶ë¹êµ¬" â "ì±ë¨ìë¶ë¹êµ¬"
    var gyeonggiMatch = addr.match(/(ììì|ì±ë¨ì|ì©ì¸ì|ê³ ìì|ììì|ìì°ì)\s*([\uAC00-\uD7A3]+êµ¬)/);
    if (gyeonggiMatch) {
      var key = gyeonggiMatch[1] + gyeonggiMatch[2];
      if (map[key]) result.sigunguCd = map[key];
    }

    // ì¸ì² í¨í´: "ì¸ì²ê´ì­ì ë¯¸ì¶íêµ¬" â "ì¸ì²ë¯¸ì¶íêµ¬"
    if (!result.sigunguCd) {
      var incheonMatch = addr.match(/ì¸ì²[^\s]*\s*([\uAC00-\uD7A3]+êµ¬)/);
      if (incheonMatch && map['ì¸ì²' + incheonMatch[1]]) {
        result.sigunguCd = map['ì¸ì²' + incheonMatch[1]];
      }
    }

    // ìì¸/ì¼ë° êµ¬ í¨í´: "ê°ë¨êµ¬", "ê´ìêµ¬" ë± (2~4ì íê¸ + êµ¬)
    if (!result.sigunguCd) {
      var guMatch = addr.match(/([\uAC00-\uD7A3]{2,4}êµ¬)\s/);
      if (guMatch && map[guMatch[1]]) {
        result.sigunguCd = map[guMatch[1]];
      }
    }

    // ì/êµ° í¨í´: "ë¶ì²ì", "ê´ëªì" ë± (fallback)
    if (!result.sigunguCd) {
      var siMatch = addr.match(/([\uAC00-\uD7A3]{2,4}[ìêµ°])\s/);
      if (siMatch && map[siMatch[1]]) {
        result.sigunguCd = map[siMatch[1]];
      }
    }

    // ë³¸ë²-ë¶ë² ì¶ì¶: "159-130" ëë "706-16" ëë "159"
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
    _wsLog('[WISHES-AI] ì ë§¤ë¬¼ ìë ìì± ìì: #' + lid);

    // â 1ë¨ê³: íì¥íë¡ê·¸ë¨ìì ì§ì  ê±´ì¶ë¬¼ëì¥ ì¡°í (ì£¼ì íì± â ìêµ°êµ¬ì½ë â GET API)
    var addressCodes = window.WS._parseAddress(listing.address);
    var buildingPromise;

    if (addressCodes) {
      var qs = 'sigunguCd=' + addressCodes.sigunguCd + '&bun=' + addressCodes.bun + '&ji=' + addressCodes.ji;
      _wsLog('[WISHES-AI] ê±´ì¶ë¬¼ëì¥ ì¡°í: ' + listing.address + ' â ' + qs);

      buildingPromise = fetch('https://wishes.co.kr/api/admin/building-registry?' + qs, {
        headers: { 'Authorization': 'Bearer wishes2026' }
      })
      .then(function(r) { return safeJson(r); })
      .then(function(bldgData) {
        if (bldgData.success && bldgData.data) {
          _wsLog('[WISHES-AI] â ê±´ì¶ë¬¼ëì¥ ì¡°í ì±ê³µ: #' + lid, bldgData.data);
          // ë¡ì»¬ ë°ì´í°ì ê±´ì¶ë¬¼ëì¥ ì ë³´ ë°ì
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
        _wsLog('[WISHES-AI] â­ï¸ ê±´ì¶ë¬¼ëì¥ ë°ì´í° ìì: #' + lid);
        return null;
      })
      .catch(function(err) {
        _wsLog('[WISHES-AI] ê±´ì¶ë¬¼ëì¥ ì¡°í ì¤ë¥: ' + err.message);
        return null;
      });
    } else {
      _wsLog('[WISHES-AI] â­ï¸ ì£¼ì íì± ë¶ê° (ìêµ°êµ¬ì½ë ë§¤í ìì): ' + (listing.address || ''));
      buildingPromise = Promise.resolve(null);
    }

    // â 2ë¨ê³: ê±´ì¶ë¬¼ëì¥ ê²°ê³¼ë¥¼ í¬í¨íì¬ AI ì ëª©/ì¤ëª ìë ìì±
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
            var icon = s.status === 'ok' ? 'â' : (s.status === 'skipped' ? 'â­ï¸' : 'â');
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
        _wsLog('[WISHES-AI] ìë ìì± ìë£: #' + lid + ' - ' + ((data.result && data.result.title) || ''));
      } else {
        _wsLog('[WISHES-AI] ìë ìì± ì¤í¨: #' + lid + ' - ' + (data.error || ''));
      }
    })
    .catch(function(err) {
      _wsLog('[WISHES-AI] ìë ìì± ì¤ë¥: #' + lid + ' - ' + err.message);
    });
  };

  // ë¨ì¼ ë§¤ë¬¼ AI SEO ì¤ëª ìì± (ìë ë²í¼ í´ë¦­)
  window.WS._runAutoGenerate = function(listingId, listing) {
    var statusEl = document.getElementById('ws-ai-status-' + listingId);
    var descEl = document.getElementById('ws-description-text-' + listingId);
    var btn = document.getElementById('ws-ai-generate-' + listingId);

    if (statusEl) {
      statusEl.innerHTML = '<div style="padding:12px;background:#f0f0ff;border-radius:8px;text-align:center;">' +
        '<div style="font-size:14px;color:#667eea;font-weight:600;">â¨ AI SEO ì¤ëª ìì± ì¤...</div>' +
        '<div style="font-size:11px;color:#999;margin-top:4px;">ê±´ì¶ë¬¼ëì¥ ì¡°í â AI ë¶ì â SEO ìµì í (ì½ 10~15ì´)</div></div>';
    }
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.textContent = 'ìì± ì¤...'; }

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
        // íë©´ ìë°ì´í¸
        if (descEl) descEl.innerHTML = escHtml(data.result.description || '');
        if (statusEl) {
          var tagsHtml = (data.result.tags || []).map(function(t) {
            return '<span style="display:inline-block;padding:2px 8px;background:#e8eaf6;color:#3f51b5;border-radius:12px;font-size:11px;margin:2px;">' + escHtml(t) + '</span>';
          }).join('');
          var kwHtml = (data.result.keywords || []).map(function(k) {
            return '<span style="display:inline-block;padding:2px 6px;background:#e8f5e9;color:#2e7d32;border-radius:4px;font-size:10px;margin:1px;">' + escHtml(k) + '</span>';
          }).join('');
          statusEl.innerHTML = '<div style="padding:12px;background:#f0fff0;border-radius:8px;border:1px solid #c8e6c9;">' +
            '<div style="font-size:13px;color:#2e7d32;font-weight:700;margin-bottom:6px;">â AI SEO ì¤ëª ìì± ìë£!</div>' +
            '<div style="font-size:12px;color:#333;margin-bottom:4px;"><strong>ì ëª©:</strong> ' + escHtml(data.result.title || '') + '</div>' +
            (data.result.meta_description ? '<div style="font-size:11px;color:#666;margin-bottom:8px;"><strong>ë©íì¤ëª:</strong> ' + escHtml(data.result.meta_description) + '</div>' : '') +
            (tagsHtml ? '<div style="margin-bottom:4px;"><strong style="font-size:11px;">íê·¸:</strong> ' + tagsHtml + '</div>' : '') +
            (kwHtml ? '<div><strong style="font-size:11px;">í¤ìë:</strong> ' + kwHtml + '</div>' : '') +
            (data.buildingInfo ? '<div style="margin-top:8px;font-size:11px;color:#888;"><strong>ê±´ì¶ë¬¼ëì¥:</strong> ' +
              (data.buildingInfo.ê±´ë¬¼ëª || '-') + ' / ' + (data.buildingInfo.ì¬ì©ì¹ì¸ì¼ || '-') + ' / ' + (data.buildingInfo.ê±´ë¬¼êµ¬ì¡° || '-') + '</div>' : '') +
            '</div>';
        }
        // ë¡ì»¬ ë°ì´í° ìë°ì´í¸
        var local = (window.WS.allListings || []).find(function(l) { return String(l.id) === String(listingId); });
        if (local) {
          if (data.result.title) local.title = data.result.title;
          if (data.result.description) local.description = data.result.description;
        }
        window.WS.showToast('AI SEO ì¤ëª ìì± ìë£!', 'success');
      } else {
        if (statusEl) statusEl.innerHTML = '<div style="padding:8px;background:#fff3e0;border-radius:8px;color:#e65100;font-size:12px;">â ï¸ ' + escHtml(data.error || 'ìì± ì¤í¨') + '</div>';
        window.WS.showToast('AI ìì± ì¤í¨: ' + (data.error || ''), 'error');
      }
    })
    .catch(function(err) {
      if (statusEl) statusEl.innerHTML = '<div style="padding:8px;background:#ffebee;border-radius:8px;color:#c62828;font-size:12px;">â ì¤ë¥: ' + escHtml(err.message) + '</div>';
      window.WS.showToast('AI ìì± ì¤ë¥: ' + err.message, 'error');
    })
    .finally(function() {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = 'â¨ AI SEO ì¤ëª ìì±'; }
    });
  };

  // âââ ì ì²´ ë§¤ë¬¼ ì¼ê´ ì²ë¦¬: ê±´ì¶ë¬¼ëì¥ ì¡°í â DBíë ìë°ì´í¸ â AI SEO ìì± (íë°©ì!) âââ
  window.WS._bulkState = null;
  window.WS._SINGLE_API = 'https://wishes.co.kr/api/admin/auto-generate';
  window.WS._FIELD_UPDATE_API = 'https://wishes.co.kr/api/admin/listings-field-update';
  window.WS._BUILDING_API = 'https://wishes.co.kr/api/admin/building-registry';
  window.WS._BUILDING_FULL_API = 'https://wishes.co.kr/api/admin/building-registry-full';
  window.WS._BATCH_SIZE = 20;

  window.WS._runBulkAutoGenerate = function() {
    var allListings = window.WS.allListings || [];
    if (allListings.length === 0) { window.WS.showToast('ë§¤ë¬¼ì´ ììµëë¤', 'error'); return; }

    // ë°ì´í° ë¡ë© ì¤ì´ë©´ ìë£ ëê¸° ìë´
    if (window.WS._loadingData) {
      window.WS.showToast('ë§¤ë¬¼ ë°ì´í°ë¥¼ ë¡ë© ì¤ìëë¤. ì ì²´ ë¡ë ìë£ í ë¤ì ìëí´ì£¼ì¸ì.', 'info');
      return;
    }

    if (window.WS._bulkState && window.WS._bulkState.running) {
      window.WS._bulkState.running = false;
      window.WS.showToast('ì¼ê´ ì²ë¦¬ ì¤ì§ ìì²­ë¨', 'info');
      return;
    }

    // ëª¨ë  ë§¤ë¬¼ ëì - ì ì²´ ë°ì´í° ëì (1000ê±´ ì í ìì)
    var targets = allListings.filter(function(l) {
      var needsBuilding = !l.built_year || !l.floor_total || !l.bathrooms || !l.area_supply_m2 || !l.elevator;
      var needsAI = !l.description || l.description.length < 50;
      return needsBuilding || needsAI;
    });

    if (targets.length === 0) {
      window.WS.showToast('ëª¨ë  ë§¤ë¬¼ì´ ì´ë¯¸ ìë£ëì´ ììµëë¤', 'success');
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

    // ì§í UI
    var overlay = document.createElement('div');
    overlay.id = 'ws-bulk-progress';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = '<div style="background:#fff;border-radius:16px;padding:32px;width:620px;max-width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="font-size:20px;font-weight:800;color:#333;">ðï¸ ì ì²´ ë§¤ë¬¼ ì¼ê´ ì²ë¦¬ (íë°© ëª¨ë)</div>' +
        '<div style="font-size:12px;color:#999;margin-top:4px;">ì ì²´ ' + allListings.length + 'ê±´ ì¤ ëì ' + state.total + 'ê±´ ì²ë¦¬ (ìë£: ' + state.skipped + 'ê±´ ê±´ëë)</div>' +
        '<div id="ws-bulk-mode" style="font-size:11px;color:#667eea;margin-top:4px;">ê±´ì¶ë¬¼ëì¥ ì¡°í â DB íë ìë°ì´í¸ â AI ì ëª©/ì¤ëª ìì±</div>' +
      '</div>' +
      '<div style="background:#f0f0f0;border-radius:8px;height:24px;overflow:hidden;margin-bottom:12px;">' +
        '<div id="ws-bulk-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:8px;transition:width 0.3s;"></div>' +
      '</div>' +
      '<div id="ws-bulk-stats" style="display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:8px;">' +
        '<span>ì§í: 0/' + state.total + '</span>' +
        '<span>â 0 | â 0</span>' +
        '<span>ë¨ììê°: ê³ì° ì¤...</span>' +
      '</div>' +
      '<div id="ws-bulk-substats" style="display:flex;justify-content:center;gap:20px;font-size:11px;color:#888;margin-bottom:12px;">' +
        '<span>ðï¸ ê±´ì¶ë¬¼ëì¥: 0ê±´</span><span>ð¤ AI ìì±: 0ê±´</span>' +
      '</div>' +
      '<div id="ws-bulk-log" style="background:#1a1a2e;color:#e0e0e0;border-radius:8px;padding:12px;height:220px;overflow-y:auto;font-family:monospace;font-size:11px;line-height:1.6;"></div>' +
      '<div style="text-align:center;margin-top:16px;">' +
        '<button id="ws-bulk-stop" style="padding:10px 24px;background:#e53935;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">â¹ ì¤ì§</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    document.getElementById('ws-bulk-stop').onclick = function() {
      state.running = false;
      this.textContent = 'ì¤ì§ ì¤...';
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
      var remainStr = remaining > 3600 ? Math.round(remaining/3600) + 'ìê° ' + Math.round((remaining%3600)/60) + 'ë¶' :
                      remaining > 60 ? Math.round(remaining/60) + 'ë¶ ' + (remaining%60) + 'ì´' : remaining + 'ì´';

      if (stats) stats.innerHTML =
        '<span>ì§í: ' + state.completed + '/' + state.total + ' (' + pct + '%)</span>' +
        '<span>â ' + state.success + ' | â ' + state.fail + '</span>' +
        '<span>ë¨ììê°: ~' + remainStr + '</span>';
      if (substats) substats.innerHTML =
        '<span>ðï¸ ê±´ì¶ë¬¼ëì¥: ' + state.buildingUpdated + 'ê±´</span><span>ð¤ AI ìì±: ' + state.aiGenerated + 'ê±´</span>';
    }

    // ===== ê°ë³ ë§¤ë¬¼ ì ì²´ ì²ë¦¬ (ê±´ì¶ë¬¼ëì¥ â DB ìë°ì´í¸ â AI ìì±) =====
    function processOneFull(listing) {
      if (!state.running) return Promise.resolve();
      var lid = String(listing.id);
      var safeJson = window.WS._safeJson;

      // --- STEP 1: ê±´ì¶ë¬¼ëì¥ ì¡°í ---
      var needsBuilding = !listing.built_year || !listing.floor_total || !listing.bathrooms || !listing.area_supply_m2 || !listing.elevator;
      var buildingPromise;

      if (needsBuilding && listing.address) {
        // ì building-registry-full API ì¬ì© (Kakaoë¡ bjdongCd ìë ì¡°í)
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

              // ê±´ì¶ë¬¼ëì¥ â DB íë ë§¤í (building-registry-full API íëëª)
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

              // DB íë ìë°ì´í¸ (ìë²ì ì ì¥)
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
                    addLog('  ðï¸ #' + lid + ' ê±´ì¶ë¬¼ëì¥ â DB ìë°ì´í¸ (' + Object.keys(fields).join(', ') + ')', 'field');
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

      // --- STEP 2: AI ì ëª©/ì¤ëª ìì± ---
      var needsAI = !listing.description || listing.description.length < 50;

      return buildingPromise.then(function(buildingData) {
        if (!needsAI) {
          // ê±´ì¶ë¬¼ëì¥ë§ ìë°ì´í¸íë©´ ëë ê²½ì°
          state.completed++;
          state.success++;
          addLog('[' + state.completed + '/' + state.total + '] â #' + lid + ' ê±´ì¶ë¬¼ëì¥ ìë°ì´í¸ ìë£ (AI ë¶íì)', 'success');
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
            addLog('[' + state.completed + '/' + state.total + '] â #' + lid + ' ' + (data.result.title || '').substring(0, 45), 'success');
          } else {
            state.fail++;
            addLog('[' + state.completed + '/' + state.total + '] â #' + lid + ' ' + (data.error || 'AI ìì± ì¤í¨'), 'error');
          }
          updateUI();
        });
      })
      .catch(function(err) {
        state.completed++;
        state.fail++;
        addLog('[' + state.completed + '/' + state.total + '] â #' + lid + ' ' + err.message, 'error');
        updateUI();
      });
    }

    // ===== ë©ì¸ ì¤í: ëì 3ê° ìì»¤ë¡ ìì°¨ ì²ë¦¬ =====
    var CONCURRENCY = 5;
    addLog('ð ì ì²´ ë§¤ë¬¼ ì¼ê´ ì²ë¦¬ ìì (' + state.total + 'ê±´, ëì ' + CONCURRENCY + 'ê°)', 'info');
    addLog('ð ì²ë¦¬ ìì: ê±´ì¶ë¬¼ëì¥ ì¡°í â DB íë ì ì¥ â AI ì ëª©/ì¤ëª ìì±', 'info');

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
      addLog('ð ìë£! ì±ê³µ: ' + state.success + ' / ì¤í¨: ' + state.fail + ' / ê±´ëë: ' + state.skipped, 'success');
      addLog('   ðï¸ ê±´ì¶ë¬¼ëì¥ DB ìë°ì´í¸: ' + state.buildingUpdated + 'ê±´ | ð¤ AI ìì±: ' + state.aiGenerated + 'ê±´', 'success');

      var stopBtn = document.getElementById('ws-bulk-stop');
      if (stopBtn) {
        stopBtn.textContent = 'â ë«ê¸°';
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

  // ========== ì¤ë§í¸ ë§¤ë¬¼ ì¶ì² ìì¤í ==========
  // ì©ë(ì£¼ê±°/ìê°/ì¬ë¬´ì¤), ê±°ëì í(ì ì¸/ìì¸/ë§¤ë§¤), íì, ì§ì­,
  // ê°ê²© ë²ì, ë©´ì , ë°© ì, ì¸µì, ì£¼ì°¨/ìë¦¬ë² ì´í°/ë°ë ¤ëë¬¼/íìµì ë±
  // ëª¨ë  ì¡°ê±´ì ì¢í©íì¬ ë§¤ì¹­ ì ì ê¸°ë°ì¼ë¡ ìµì ì ë§¤ë¬¼ì ì¶ì²

  window.WS.showSmartRecommend = function() {
    var modal = document.getElementById('ws-modal-smart-recommend');
    if (modal) modal.style.display = 'flex';

    // ê²ì ë²í¼ ì´ë²¤í¸
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
      showToast('ë§¤ë¬¼ ë°ì´í°ê° ììµëë¤', 'error');
      return;
    }

    // ì¡°ê±´ ìì§
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

    // ì©ëâíì ë§¤í (ì£¼ê±°: ìë£¸/í¬ë£¸/ìíí¸/ë¹ë¼/ì¤í¼ì¤í, ìê°/ì¬ë¬´ì¤)
    var purposeTypes = {
      'ì£¼ê±°': ['ìë£¸','í¬ë£¸','ì°ë¦¬ë£¸','ìíí¸','ë¹ë¼','ì¤í¼ì¤í','ì£¼í'],
      'ìê°': ['ìê°','ê·¼ì'],
      'ì¬ë¬´ì¤': ['ì¬ë¬´ì¤','ì¤í¼ì¤']
    };

    // ë§¤ì¹­ ì ì ê³ì°
    var scored = allData.map(function(l) {
      var score = 0;
      var maxScore = 0;
      var matchReasons = [];
      var failReasons = [];

      // ê±°ëì í (íì ì¡°ê±´)
      if (deal) {
        maxScore += 30;
        if ((l.deal || '') === deal) { score += 30; matchReasons.push('ê±°ëì í ì¼ì¹'); }
        else { failReasons.push('ê±°ëì í ë¶ì¼ì¹'); return null; }
      }

      // ì©ë
      if (purpose) {
        maxScore += 20;
        var allowedTypes = purposeTypes[purpose] || [];
        if (allowedTypes.some(function(t) { return (l.type || '').indexOf(t) !== -1; })) {
          score += 20; matchReasons.push('ì©ë ì¼ì¹');
        } else { failReasons.push('ì©ë ë¶ì¼ì¹'); return null; }
      }

      // íì
      if (type) {
        maxScore += 15;
        if ((l.type || '') === type) { score += 15; matchReasons.push('íì ì¼ì¹'); }
        else if ((l.type || '').indexOf(type) !== -1) { score += 8; matchReasons.push('íì ì ì¬'); }
        else { return null; }
      }

      // ì§ì­
      if (area) {
        maxScore += 15;
        var addrStr = ((l.address || '') + ' ' + (l.dong || '')).toLowerCase();
        var areaKeywords = area.split(/[,\s]+/).filter(Boolean);
        var areaMatch = areaKeywords.some(function(kw) { return addrStr.indexOf(kw.toLowerCase()) !== -1; });
        if (areaMatch) { score += 15; matchReasons.push('ì§ì­ ì¼ì¹'); }
        else { return null; }
      }

      // ë³´ì¦ê¸
      if (depositMax > 0) {
        maxScore += 10;
        var dep = l.deposit || 0;
        if (dep <= depositMax) { score += 10; matchReasons.push('ë³´ì¦ê¸ ë²ì ë´'); }
        else { failReasons.push('ë³´ì¦ê¸ ì´ê³¼'); return null; }
      }

      // ìì¸
      if (monthlyMax > 0) {
        maxScore += 10;
        var mon = l.monthly || 0;
        if (mon <= monthlyMax) { score += 10; matchReasons.push('ìì¸ ë²ì ë´'); }
        else { return null; }
      }

      // ë§¤ë§¤ê°
      if (priceMax > 0 && deal === 'ë§¤ë§¤') {
        maxScore += 10;
        var pr = l.price || 0;
        if (pr <= priceMax) { score += 10; matchReasons.push('ë§¤ë§¤ê° ë²ì ë´'); }
        else { return null; }
      }

      // ë©´ì 
      if (areaMin > 0 || areaMax > 0) {
        maxScore += 10;
        var m2 = l.area_m2 || 0;
        if (areaMin > 0 && m2 < areaMin) { return null; }
        if (areaMax > 0 && m2 > areaMax) { return null; }
        score += 10; matchReasons.push('ë©´ì  ë²ì ë´');
      }

      // ë°© ì
      if (roomsMin > 0) {
        maxScore += 5;
        if ((l.rooms || 0) >= roomsMin) { score += 5; matchReasons.push('ë°© ì ì¶©ì¡±'); }
        else { return null; }
      }

      // ì¸µì
      if (floorMin > 0) {
        maxScore += 5;
        if ((l.floor_current || 0) >= floorMin) { score += 5; matchReasons.push('ì¸µì ì¶©ì¡±'); }
        else { return null; }
      }

      // ìµì
      if (needParking) {
        maxScore += 3;
        if (l.parking) { score += 3; matchReasons.push('ì£¼ì°¨ ê°ë¥'); }
      }
      if (needElevator) {
        maxScore += 3;
        if (l.elevator) { score += 3; matchReasons.push('ìë¦¬ë² ì´í°'); }
      }
      if (needPet) {
        maxScore += 3;
        if (l.pet) { score += 3; matchReasons.push('ë°ë ¤ëë¬¼ ê°ë¥'); }
      }
      if (needFulloption) {
        maxScore += 3;
        if (l.full_option) { score += 3; matchReasons.push('íìµì'); }
      }

      // ê¸°ë³¸ ì ì (ì¡°ê±´ ë¯¸ìë ¥ììë ìµì ì ë ¬)
      if (maxScore === 0) maxScore = 1;
      var pct = Math.round((score / maxScore) * 100);

      return { listing: l, score: score, maxScore: maxScore, pct: pct, reasons: matchReasons };
    }).filter(Boolean);

    // ì ìì ì ë ¬
    scored.sort(function(a, b) { return b.pct - a.pct || b.score - a.score; });

    // ê²°ê³¼ íì
    var resultsEl = document.getElementById('ws-sr-results');
    if (!resultsEl) return;

    if (scored.length === 0) {
      resultsEl.innerHTML = '<div style="text-align:center;padding:30px;color:#999;"><div style="font-size:20px;margin-bottom:8px;">ð</div>ì¡°ê±´ì ë§ë ë§¤ë¬¼ì´ ììµëë¤.<br>ì¡°ê±´ì ìíí´ ë³´ì¸ì.</div>';
      return;
    }

    var top = scored.slice(0, 20);
    var html = '<div style="font-size:13px;color:#2D5A27;font-weight:700;margin-bottom:8px;">ð¯ ì¶ì² ê²°ê³¼: ' + scored.length + 'ê±´ ì¤ ìì ' + top.length + 'ê±´</div>';

    top.forEach(function(item, idx) {
      var l = item.listing;
      var priceText = l.deal === 'ë§¤ë§¤' ? formatPrice(0, 0, l.price, 'ë§¤ë§¤') : formatPrice(l.deposit, l.monthly, 0, l.deal);
      var matchColor = item.pct >= 80 ? '#2D5A27' : item.pct >= 60 ? '#F57F17' : '#888';
      var imgUrl = (l.images && l.images.length > 0) ? (l.images[0].url || l.images[0]) : '';

      html += '<div style="display:flex;gap:12px;padding:12px;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;background:#fff;" data-sr-id="' + l.id + '" onmouseover="this.style.boxShadow=\'0 4px 12px rgba(0,0,0,0.1)\'" onmouseout="this.style.boxShadow=\'none\'">';
      html += '<div style="width:80px;height:80px;border-radius:8px;background:#f0f0f0 center/cover no-repeat;flex-shrink:0;' + (imgUrl ? 'background-image:url(' + escHtml(imgUrl) + ')' : '') + '"></div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">';
      html += '<div style="font-size:14px;font-weight:700;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;">' + escHtml(l.title || l.address || 'ë§¤ë¬¼ #' + l.id) + '</div>';
      html += '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">';
      html += '<div style="width:40px;height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden;"><div style="width:' + item.pct + '%;height:100%;background:' + matchColor + ';border-radius:3px;"></div></div>';
      html += '<span style="font-size:11px;font-weight:700;color:' + matchColor + ';">' + item.pct + '%</span>';
      html += '</div></div>';
      html += '<div style="font-size:12px;color:#888;margin-bottom:4px;">' + escHtml(l.address || '') + ' Â· ' + escHtml(l.type || '') + ' Â· ' + (l.area_m2 ? formatArea(l.area_m2) : '-') + '</div>';
      html += '<div style="font-size:14px;font-weight:700;color:#2D5A27;">' + (priceText || '-') + '</div>';
      html += '<div style="font-size:10px;color:#999;margin-top:2px;">' + item.reasons.join(' Â· ') + '</div>';
      html += '</div></div>';
    });

    resultsEl.innerHTML = html;

    // í´ë¦­ ì´ë²¤í¸ (ìì¸ ëª¨ë¬ ì´ê¸°)
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
