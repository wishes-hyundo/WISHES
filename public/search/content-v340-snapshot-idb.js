/**
 * content-v340-snapshot-idb.js (2026-05-10)
 *
 * Step D Plan C: ws_data_snapshot localStorage → IndexedDB 이전.
 *   localStorage 5MB 한도 → IndexedDB 50MB+. 모든 62K 매물 baseline 추적 + quota 토스트 영구 사라짐.
 */
(function () {
  'use strict';
  if (window.__WS_V340_SNAPSHOT_IDB__) return;
  window.__WS_V340_SNAPSHOT_IDB__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DB_NAME = 'ws_snapshot_db';
  var STORE = 'snap';
  var KEY = 'ws_data_snapshot';
  var SOURCE_KEY = 'ws_data_snapshot';

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

  (function init() {
    var origGetInner = Storage.prototype.getItem;
    var origRemoveInner = Storage.prototype.removeItem;
    _openDb().then(function (db) {
      _db = db;
      var lsRaw = null;
      try { lsRaw = origGetInner.call(localStorage, SOURCE_KEY); } catch (_) {}
      if (lsRaw && typeof lsRaw === 'string' && lsRaw.length > 100) {
        return _idbPut(db, KEY, lsRaw).then(function () {
          try { origRemoveInner.call(localStorage, SOURCE_KEY); } catch (_) {}
          _idbCache = lsRaw;
          try {
            console.log('[v340-snapshot-idb] migrated localStorage → IDB: ' +
              Math.round(lsRaw.length / 1024) + 'KB. localStorage cleared.');
          } catch (_) {}
        });
      }
      return _idbGet(db, KEY).then(function (val) {
        _idbCache = (typeof val === 'string') ? val : null;
        try {
          console.log('[v340-snapshot-idb] init: ' +
            (_idbCache ? Math.round(_idbCache.length / 1024) + 'KB cached' : 'empty IDB'));
        } catch (_) {}
      });
    }).then(function () {
      _ready = true;
    }).catch(function (e) {
      try { console.warn('[v340-snapshot-idb] init failed:', e && e.message); } catch (_) {}
    });
  })();

  var origGet = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key) {
    if (this === localStorage && key === SOURCE_KEY) {
      return _idbCache;
    }
    return origGet.call(this, key);
  };

  var origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, val) {
    if (this === localStorage && key === SOURCE_KEY) {
      _idbCache = (typeof val === 'string') ? val : String(val == null ? '' : val);
      if (_db) {
        _idbPut(_db, KEY, _idbCache).catch(function () {});
      } else {
        var attempts = 0;
        var iv = setInterval(function () {
          attempts++;
          if (_db || attempts > 50) {
            clearInterval(iv);
            if (_db) _idbPut(_db, KEY, _idbCache).catch(function () {});
          }
        }, 100);
      }
      return;
    }
    return origSet.call(this, key, val);
  };

  var origRemove = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function (key) {
    if (this === localStorage && key === SOURCE_KEY) {
      _idbCache = null;
      if (_db) _idbPut(_db, KEY, null).catch(function () {});
      return;
    }
    return origRemove.call(this, key);
  };

  window.WS = window.WS || {};
  window.WS._idbStatus = function () {
    try {
      console.log('[v340-snapshot-idb] ready:', _ready,
        '| cache:', _idbCache ? Math.round(_idbCache.length / 1024) + 'KB' : 'null',
        '| db:', !!_db);
      return { ready: _ready, cacheKB: _idbCache ? Math.round(_idbCache.length / 1024) : 0 };
    } catch (e) { return null; }
  };
})();
