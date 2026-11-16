/* Installable app policy for the service worker.
 * The shell is cached so a home-screen launch still opens offline.
 * News, vehicles, mission files, and the bundled flight list stay network-first.
 * Launch Library 2 is not cached here; the page keeps that copy in localStorage.
 * Bump CACHE when the shell changes so activate drops the previous cache.
 */
(function (root) {
  'use strict';

  var CACHE = 'sbla-shell-v9';
  var WX_CACHE = 'sbla-wx';

  var SHELL = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/data.js',
    '/js/geo.js',
    '/js/flights.js',
    '/js/app.js',
    '/js/pwa.js',
    '/manifest.webmanifest',
    '/icons/icon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/maskable-512.png',
    '/icons/apple-touch-icon.png',
    '/data/news.json',
    '/data/vehicles.json',
    '/data/ll2-fallback.json',
    '/data/missions/index.json',
    '/data/missions/flight-15.json',
    '/assets/vehicles/b7.webp',
    '/assets/vehicles/b12.webp',
    '/assets/vehicles/s24.webp',
    '/assets/vehicles/s39.webp',
    '/assets/vehicles/ift2-b9-s25.webp'
  ];

  function classify(requestUrl, origin) {
    var u = new URL(requestUrl, origin || 'https://starbaselaunchapp.local');
    var host = u.hostname;
    if (host === 'll.thespacedevs.com' || host === 'lldev.thespacedevs.com') return 'passthrough';
    if (host === 'api.open-meteo.com') return 'weather';
    if (origin && u.origin !== origin) return 'passthrough';
    if (u.pathname === '/sw.js') return 'passthrough';
    if (u.pathname.indexOf('/data/') === 0) return 'data';
    return 'shell';
  }

  function handlePlan(requestUrl, origin, method) {
    if (method && method !== 'GET') return 'ignore';
    var kind = classify(requestUrl, origin);
    if (kind === 'passthrough') return 'ignore';
    if (kind === 'weather') return 'network-first-weather';
    if (kind === 'data') return 'network-first-data';
    return 'network-first-shell';
  }

  /* Navigations share one cache entry. The worker responds to the original
   * request, so ?mode=launch and ?mode=hub stay on the address the icon opened. */
  function cachePath(requestUrl, origin) {
    var u = new URL(requestUrl, origin || 'https://starbaselaunchapp.local');
    if (u.pathname === '/' || u.pathname === '/index.html') return '/';
    return u.pathname;
  }

  function cachesToDelete(keys) {
    return (keys || []).filter(function (k) { return k !== CACHE && k !== WX_CACHE; });
  }

  var api = {
    CACHE: CACHE,
    WX_CACHE: WX_CACHE,
    SHELL: SHELL,
    classify: classify,
    handlePlan: handlePlan,
    cachePath: cachePath,
    cachesToDelete: cachesToDelete
  };

  root.SBPwa = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
