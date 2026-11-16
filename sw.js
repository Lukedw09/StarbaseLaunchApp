/* Starship service worker.
 * Precaches the app shell, then prefers the network so a deploy is not stuck
 * behind the previous copy. Offline, the cached shell still opens.
 * data/*.json is network-first. Launch Library 2 is left to the page, which
 * keeps its own localStorage copy and the bundled fallback.
 * Bump CACHE in js/pwa.js when the shell changes.
 */
importScripts('/js/pwa.js');
var P = self.SBPwa;

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(P.CACHE).then(function (cache) {
    return cache.addAll(P.SHELL);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(P.cachesToDelete(keys).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

function store(cacheName, key, response) {
  return caches.open(cacheName).then(function (cache) { return cache.put(key, response.clone()); });
}

function stored(request) {
  return new Request(self.location.origin + P.cachePath(request.url, self.location.origin));
}

function fromCache(request, shell) {
  return caches.open(P.CACHE).then(function (cache) {
    return cache.match(stored(request)).then(function (hit) {
      if (hit) return hit;
      if (!shell || request.mode !== 'navigate') return Response.error();
      return cache.match('/').then(function (root) {
        if (root) return root;
        return cache.match('/index.html').then(function (index) { return index || Response.error(); });
      });
    });
  });
}

function networkFirst(request, shell) {
  return fetch(request).then(function (response) {
    if (!response || !response.ok || response.type !== 'basic' || response.redirected) return response;
    return store(P.CACHE, stored(request), response).then(function () { return response; }, function () { return response; });
  }).catch(function () { return fromCache(request, shell); });
}

function networkWeather(request) {
  var key = new Request(self.location.origin + '/wx-latest');
  return fetch(request).then(function (response) {
    if (!response || !response.ok) return response;
    return store(P.WX_CACHE, key, response).then(function () { return response; });
  }).catch(function () {
    return caches.open(P.WX_CACHE).then(function (cache) {
      return cache.match(key).then(function (hit) { return hit || Response.error(); });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var plan = P.handlePlan(event.request.url, self.location.origin, event.request.method);
  if (plan === 'ignore') return;
  if (plan === 'network-first-weather') {
    event.respondWith(networkWeather(event.request));
    return;
  }
  event.respondWith(networkFirst(event.request, plan === 'network-first-shell'));
});
