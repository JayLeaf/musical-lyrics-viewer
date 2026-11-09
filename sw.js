/* 오프라인용 서비스 워커: 앱 파일을 기기에 저장해 두고 인터넷 없이도 연다.
   앱을 고칠 때마다 VERSION을 올려야 새 파일로 바뀐다. */
var VERSION = 'v1.4.0';
var CACHE = 'lyrics-viewer-' + VERSION;
var ASSETS = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/cast.js', './js/parser.js', './js/db.js', './js/app.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  // cache: 'reload' — 브라우저 HTTP 캐시에 남은 예전 파일을 새 버전 저장소에 담지 않도록 서버에서 새로 받는다
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('lyrics-viewer-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/data/') >= 0) return; // 가사 버전 파일은 항상 새로 받기
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(function (r) { return r || fetch(req); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (r) { return r || fetch(req); }));
});
