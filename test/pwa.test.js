'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const P = require('../js/pwa.js');

const root = path.join(__dirname, '..');
const origin = 'https://starbaselaunchapp.lukedw09.com';

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('ascii', 12, 16), 'IHDR');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('manifest is an installable Starship app', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Starship');
  assert.equal(manifest.short_name, 'Starship');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#050607');
  assert.equal(manifest.theme_color, '#050607');
  const icons = manifest.icons;
  const any192 = icons.find(function (icon) { return icon.sizes === '192x192' && icon.purpose === 'any'; });
  const any512 = icons.find(function (icon) { return icon.sizes === '512x512' && icon.purpose === 'any'; });
  const maskable = icons.find(function (icon) { return icon.purpose === 'maskable'; });
  assert.ok(any192 && any512 && maskable);
  function iconFile(src) { return path.join(root, src.replace(/^\//, '')); }
  assert.equal(pngSize(iconFile(any192.src)).w, 192);
  assert.equal(pngSize(iconFile(any512.src)).h, 512);
  assert.equal(pngSize(iconFile(maskable.src)).w, 512);
  assert.equal(pngSize(path.join(root, 'icons/apple-touch-icon.png')).w, 180);
  const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
  assert.equal(/spacex|starbase/i.test(svg), false);
});

test('the page exposes the manifest and the iOS install tags', function () {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Starship"/);
  assert.match(html, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
  assert.match(html, /name="theme-color" content="#050607"/);
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(app, /register\('\/sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(app, /decideMode\(forced, flights/);
});

test('shell files exist and the cache name drops the previous cache', function () {
  assert.equal(P.CACHE, 'sbla-shell-v9');
  assert.equal(P.WX_CACHE, 'sbla-wx');
  P.SHELL.forEach(function (item) {
    if (item === '/') return;
    assert.equal(fs.existsSync(path.join(root, item.slice(1))), true, item);
  });
  assert.deepEqual(P.cachesToDelete(['sbla-v8', 'sbla-shell-v9', 'sbla-wx', 'other']), ['sbla-v8', 'other']);
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(worker, /importScripts\('\/js\/pwa\.js'\)/);
  assert.match(worker, /skipWaiting/);
  assert.match(worker, /clients\.claim/);
  assert.equal(/push|notification/i.test(worker), false);
});

test('home-screen mode queries stay on the shell, and flight data stays network-first', function () {
  assert.equal(P.handlePlan(origin + '/?mode=launch', origin, 'GET'), 'network-first-shell');
  assert.equal(P.handlePlan(origin + '/?mode=hub', origin, 'GET'), 'network-first-shell');
  assert.equal(P.handlePlan(origin + '/index.html?mode=launch', origin, 'GET'), 'network-first-shell');
  assert.equal(P.cachePath(origin + '/?mode=launch', origin), '/');
  assert.equal(P.cachePath(origin + '/index.html?mode=hub', origin), '/');
  assert.equal(P.cachePath(origin + '/', origin), '/');

  ['/data/news.json', '/data/vehicles.json', '/data/ll2-fallback.json', '/data/missions/index.json', '/data/missions/flight-15.json'].forEach(function (item) {
    assert.equal(P.handlePlan(origin + item, origin, 'GET'), 'network-first-data', item);
    assert.equal(P.cachePath(origin + item, origin), item);
  });

  const ll2 = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&mode=detailed&rocket__configuration__name=Starship';
  assert.equal(P.handlePlan(ll2, origin, 'GET'), 'ignore');
  assert.equal(P.handlePlan('https://lldev.thespacedevs.com/2.2.0/launch/previous/', origin, 'GET'), 'ignore');
  assert.equal(P.handlePlan('https://api.open-meteo.com/v1/forecast?latitude=25.99', origin, 'GET'), 'network-first-weather');
  assert.equal(P.handlePlan(origin + '/sw.js', origin, 'GET'), 'ignore');
  assert.equal(P.handlePlan(origin + '/css/style.css', origin, 'POST'), 'ignore');
  assert.equal(P.handlePlan(origin + '/css/style.css', origin, 'GET'), 'network-first-shell');
});
