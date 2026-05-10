/**
 * content-v343-pricesnap-idb.js (2026-05-10)
 *
 * Fix 4 (사장님 명령 진단 끝까지 — localStorage quota 토스트 영구 fix):
 *   v340 가 ws_data_snapshot 만 IDB 이전. ws_price_snapshots 는 여전히 localStorage.
 *   60K 매물 × ~80 byte (price/deposit/monthly/status/date) = 5 MB.
 *   localStorage 5-10 MB quota 와 충돌 → 매번 토스트 + cleanup polling.
 *
 * 해결:
 *   ws_price_snapshots 도 IDB 로 (v340 와 동일 패턴, key 다름).
 *   localStorage: 0 (영구) → IDB: 50 MB+ (사실상 무제한).
 *   토스트 영구 사라짐.
 *
 * INVARIANT (I-STORAGE-3, 2026-05-10):
 *   ws_price_snapshots 는 IDB 단독. localStorage 사용 X.
 *   페이지 로드 시 v343 init 가 localStorage 의 옛 snapshot 자동 이전.
 *   v321 setItem wrapper 와 충돌 X (v343 가 outer 라 ws_price_snapshots 만 가로채고 native 호출 안 함).
 */
(function () {
  'use strict';
  if (window.__WS_V343_PRICESNAP_IDB__) return;
  window.__WS_V343_PRICESNAP_IDB__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DB_NAME = 'ws_pricesnap_db';
  var STORE = 'snap';
  var KEY = 'ws_price_snapshots';
  var SOURCE_KEY = 'ws_price_snapshots';

  var _idbCache = null;
  var _db = null;
  var _ready = false;

  function _openDb() {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function (e) {
          try {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
          } catch (_) {}
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
        req.onblocked = function () { reject(new Error('idb blocked')); };
      } catch (e) { reject(e); }
    });
  }

  function _idbGet(db, key) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (e) { reject(e); }
    });
  }

  function _idbPut(db, key, val) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction(STORE, 'readwrite');
        var req = tx.objectStore(STORE).put(val, key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      } catch (e) { reject(e); }
    });
  }

  // 페이지 로드 시 IDB 열기 + 마이그레이션
  (function init() {
    var origGet = Storage.prototype.getItem;
    var origRemove = Storage.prototype.removeItem;

    _openDb().then(function (db) {
      _db = db;
      // 1) localStorage 의 옛 ws_price_snapshots 검사 — 있으면 IDB 로 이전
      var lsRaw = null;
      try { lsRaw = origGet.call(localStorage, SOURCE_KEY); } catch (_) {}
      if (lsRaw && typeof lsRaw === 'string' && lsRaw.length > 100) {
        return _idbPut(db, KEY, lsRaw).then(function () {
          try { origRemove.call(localStorage, SOURCE_KEY); } catch (_) {}
          _idbCache = lsRaw;
          try {
            console.log('[v343-pricesnap-idb] migrated localStorage -> IDB: ' +
              Math.round(lsRaw.length / 1024) + 'KB. localStorage cleared.');
          } catch (_) {}
        });
      }
      // 2) 마이그레이션 대상 없음 -> IDB 에서 read
      return _idbGet(db, KEY).then(function (val) {
        _idbCache = (typeof val === 'string') ? val : null;
        try {
          console.log('[v343-pricesnap-idb] init: ' +
            (_idbCache ? Math.round(_idbCache.length / 1024) + 'KB cached' : 'empty IDB'));
        } catch (_) {}
      });
    }).then(function () {
      _ready = true;
    }).catch(function (e) {
      try { console.warn('[v343-pricesnap-idb] init failed:', e && e.message); } catch (_) {}
    });
  })();

  // localStorage.getItem 가로챔 — ws_price_snapshots 만 IDB cache 반환
  var origGet = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key) {
    if (this === localStorage && key === SOURCE_KEY) {
      return _idbCache; // null or string (sync)
    }
    return origGet.call(this, key);
  };

  // localStorage.setItem 가로챔 — ws_price_snapshots 만 IDB 저장
  var origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, val) {
    if (this === localStorage && key === SOURCE_KEY) {
      _idbCache = (typeof val === 'string') ? val : String(val == null ? '' : val);
      // async IDB 저장 (실패 무시)
      if (_db) {
        _idbPut(_db, KEY, _idbCache).catch(function () {});
      } else {
        // _db 아직 안 열림 - 짧은 wait 후 재시도
        var attempts = 0;
        var iv = setInterval(function () {
          attempts++;
          if (_db || attempts > 50) { // 5초 max
            clearInterval(iv);
            if (_db) _idbPut(_db, KEY, _idbCache).catch(function () {});
          }
        }, 100);
      }
      return; // localStorage 에 저장 X
    }
    return origSet.call(this, key, val);
  };

  // localStorage.removeItem 가로챔 — ws_price_snapshots 만 IDB 정리
  var origRemove = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function (key) {
    if (this === localStorage && key === SOURCE_KEY) {
      _idbCache = null;
      if (_db) _idbPut(_db, KEY, null).catch(function () {});
      return;
    }
    return origRemove.call(this, key);
  };

  // 진단 helper
  window.WS = window.WS || {};
  window.WS._priceSnapStatus = function () {
    try {
      console.log('[v343-pricesnap-idb] ready:', _ready,
        '| cache:', _idbCache ? Math.round(_idbCache.length / 1024) + 'KB' : 'null',
        '| db:', !!_db);
      return { ready: _ready, cacheKB: _idbCache ? Math.round(_idbCache.length / 1024) : 0 };
    } catch (e) { return null; }
  };
})();
