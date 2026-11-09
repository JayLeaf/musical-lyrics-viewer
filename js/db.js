/* IndexedDB 래퍼: songs(곡 데이터), meta(배역 지정·폴더 연결 등) */
(function () {
  'use strict';
  var db = null;

  function open() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('musical-lyrics', 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('songs')) d.createObjectStore('songs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function run(store, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, mode);
      var st = tx.objectStore(store);
      var req = fn(st);
      tx.oncomplete = function () { resolve(req && req.result); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }

  window.LDB = {
    open: open,
    all: function (store) { return run(store, 'readonly', function (s) { return s.getAll(); }); },
    get: function (store, key) { return run(store, 'readonly', function (s) { return s.get(key); }); },
    put: function (store, val, key) {
      return run(store, 'readwrite', function (s) { return key === undefined ? s.put(val) : s.put(val, key); });
    },
    del: function (store, key) { return run(store, 'readwrite', function (s) { return s.delete(key); }); }
  };
})();
