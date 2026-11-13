/* Offline support: cache the app shell, keep the last weather response. */
var VERSION = 'sbla-v4';
var SHELL = ['./', 'index.html', 'css/style.css', 'js/data.js', 'js/geo.js', 'js/app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== 'sbla-wx'; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.hostname === 'api.open-meteo.com') {
    // Network first, fall back to the last good weather.
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open('sbla-wx').then(function (c) { c.put('wx-latest', copy); }); return res;
    }).catch(function () { return caches.open('sbla-wx').then(function (c) { return c.match('wx-latest'); }).then(function (r) { return r || Response.error(); }); }));
    return;
  }
  if (url.origin !== location.origin) return;
  // App shell: cache first, refresh the cache in the background.
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; }).catch(function () { return null; });
      if (hit) { e.waitUntil(net); return hit; }
      return net.then(function (res) { return res || (req.mode === 'navigate' ? c.match('index.html') : Response.error()); });
    });
  }));
});
