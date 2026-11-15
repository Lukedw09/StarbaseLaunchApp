/* StarbaseLaunchApp: hub plus the launch-day companion. Plain script, no build step. */
(function () {
  'use strict';
  var D = window.SB_DATA, G = window.SBGeo, F = window.SBFlights, P = D.PLACES;
  var $ = function (id) { return document.getElementById(id); };
  var PREF_KEY = 'sbla.prefs.v2', CLOCK_KEY = 'sbla.clocks.v2', LL2_KEY = 'sbla.ll2.v1';
  var WXKEY = 'sbla.wx.v1', GPSKEY = 'sbla.gps.v1', FIREDKEY = 'sbla.fired.v1', MIGRATED = 'sbla.migrated.v2';
  var LL2_PREV = 'https://ll.thespacedevs.com/2.2.0/launch/previous/?limit=40&mode=detailed&rocket__configuration__name=Starship';
  var LL2_UP = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&mode=detailed&rocket__configuration__name=Starship';

  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  var clocks = load(CLOCK_KEY, {}) || {};
  var prefs = load(PREF_KEY, {}) || {};
  if (!load(MIGRATED, false)) {
    var old = load('sbla.v1', null);
    if (old && typeof old === 'object') {
      ['site', 'target', 'tempMode', 'tempManualF', 'useWind', 'showMinor', 'soundAlerts'].forEach(function (k) {
        if (old[k] != null && prefs[k] == null) prefs[k] = old[k];
      });
      var planned = Date.parse('2026-11-13T22:45:00Z');
      var actual = Date.parse('2026-11-13T22:47:00Z');
      var ms = old.launchMs;
      if (ms === planned) ms = actual;
      if (isFinite(ms) && (ms !== actual || old.hold || old.shipFollow === false || old.shipMs)) {
        clocks['flight-15'] = clocks['flight-15'] || {
          launchMs: ms, hold: old.hold || null, shipFollow: old.shipFollow !== false, shipMs: old.shipMs || null
        };
      }
    }
    store(MIGRATED, true);
    store(PREF_KEY, prefs);
    store(CLOCK_KEY, clocks);
  }

  var state = Object.assign({
    site: 'gps', target: 'tower', tempMode: 'live', tempManualF: 70, useWind: true, showMinor: false, soundAlerts: true,
    launchMs: NaN, hold: null, shipFollow: true, shipMs: null
  }, prefs);

  var flights = null, manuals = [], vehicles = [], news = [], ll2Source = 'fallback';
  var mode = document.documentElement.dataset.mode === 'launch' ? 'launch' : 'hub';
  var preview = false, forced = null, active = null, M = null, EVENTS = [];
  var queryMode = (new URLSearchParams(location.search).get('mode') || '').toLowerCase();
  if (queryMode === 'launch' || queryMode === 'hub') forced = queryMode;

  var gps = load(GPSKEY, null);
  var gpsLive = false, gpsError = null;
  var wx = load(WXKEY, null);
  var fired = load(FIREDKEY, {}) || {};
  var heading = null, compassOn = false, compassSeen = 0, compassStart = 0;
  var armed = false, audio = null, wakeLock = null;
  var evCache = [], evSig = '', wxTimer = null, sectionObserver = null;

  function save() {
    store(PREF_KEY, {
      site: state.site, target: state.target, tempMode: state.tempMode, tempManualF: state.tempManualF,
      useWind: state.useWind, showMinor: state.showMinor, soundAlerts: state.soundAlerts
    });
    if (active && active.id) {
      clocks[active.id] = { launchMs: state.launchMs, hold: state.hold, shipFollow: state.shipFollow, shipMs: state.shipMs };
      store(CLOCK_KEY, clocks);
    }
  }

  function t0() { return state.hold ? state.launchMs + (Date.now() - state.hold.start) : state.launchMs; }
  function shipT() {
    if (!M || !M.shipCatchOffsetSec) return t0();
    return state.shipFollow || !state.shipMs ? t0() + M.shipCatchOffsetSec * 1000 : state.shipMs;
  }
  function defaultT0() { return M && M.launchUtcDefault ? Date.parse(M.launchUtcDefault) : NaN; }

  function observer() {
    if (state.site === 'gps' && gps) return { lat: gps.lat, lon: gps.lon, name: gpsLive ? 'Live GPS' : 'Last GPS fix', acc: gps.acc };
    if (state.site === 'gps') return Object.assign({ fallback: true }, P.outpost);
    return P[state.site] || P.outpost;
  }
  function tempC() {
    if (state.tempMode === 'manual' && isFinite(state.tempManualF)) return (state.tempManualF - 32) * 5 / 9;
    var c = wx && wx.data && wx.data.current;
    return c && isFinite(c.temperature_2m) ? (c.temperature_2m - 32) * 5 / 9 : 20;
  }
  function geom(target) {
    var o = observer(), t = P[target];
    var dist = G.distance(o.lat, o.lon, t.lat, t.lon);
    var brg = G.bearing(o.lat, o.lon, t.lat, t.lon);
    var path = G.bearing(t.lat, t.lon, o.lat, o.lon);
    var w = 0, c = wx && wx.data && wx.data.current;
    if (state.useWind && c) w = G.windAlong(c.wind_speed_10m * 0.44704, c.wind_direction_10m, path);
    var snd = G.soundDelay(dist, tempC(), w);
    return { dist: dist, brg: brg, delay: snd.seconds, speed: snd.speed, wind: w, elev: G.elevationAngle(dist, t.heightM || 0) };
  }

  function timesFor(events, launchMs, shipMs, withSound) {
    var out = [];
    (events || []).forEach(function (e) {
      var base = e.anchor === 'ship' && shipMs != null ? shipMs : launchMs;
      var at = base + e.t * 1000, extra = '';
      if (withSound && e.soundFrom) {
        var g = geom(e.soundFrom);
        at += g.delay * 1000;
        extra = g.delay.toFixed(1) + ' s after you see it';
      }
      out.push(Object.assign({}, e, { at: at, extra: extra }));
    });
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }
  function eventTimes() {
    var ship = M && M.shipCatchOffsetSec ? shipT() : null;
    return timesFor(EVENTS, t0(), ship, true);
  }

  function z(n) { return (n < 10 ? '0' : '') + n; }
  function km(m) { return (m / 1000).toFixed(2) + ' km'; }
  function mi(m) { return (m / 1609.344).toFixed(2) + ' mi'; }
  function deg(d) { return ('00' + Math.round(G.norm360(d)) % 360).slice(-3) + '°'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function human(s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + ' s';
    if (s < 3600) return Math.floor(s / 60) + ' m ' + z(s % 60) + ' s';
    if (s < 86400) return Math.floor(s / 3600) + ' h ' + z(Math.floor(s % 3600 / 60)) + ' m';
    return Math.floor(s / 86400) + ' d ' + Math.floor(s % 86400 / 3600) + ' h';
  }
  function kindTag(e) {
    if (e.aborted) return '<span class="tag abort">CALLED OFF</span>';
    if (e.kind === 'estimate') return '<span class="tag est">ESTIMATE</span>';
    if (e.kind === 'computed') return '<span class="tag computed">COMPUTED</span>';
    return e.webcast ? '<span class="tag">WEBCAST</span>' : '';
  }
  function whenText(f) {
    var coarse = F.coarseNetLabel(f);
    if (coarse) return coarse;
    if (!isFinite(f.netMs)) return 'Date not set';
    var p = String(f.netPrecision || '').toUpperCase();
    if (p === 'D' || p === 'DAY') return G.ctDay(f.netMs);
    return G.ctDay(f.netMs) + ' · ' + G.ctTime(f.netMs, true);
  }
  function flightTitle(f) {
    if (f.flightNumber) return 'Flight ' + f.flightNumber;
    return f.name || 'Starship';
  }

  function setClock(prefix, deltaMs, el) {
    if (!el || !$(prefix + 'T')) return;
    var c = G.tclock(deltaMs);
    $(prefix + 'T').textContent = 'T' + (c.sign === '-' ? '−' : '+');
    $(prefix + 'D').textContent = z(c.d); $(prefix + 'H').textContent = z(c.h);
    $(prefix + 'M').textContent = z(c.m); $(prefix + 'S').textContent = z(c.s);
    el.classList.toggle('plus', c.sign === '+');
  }

  function renderEventList(listId, items, launchMs, showAll) {
    var html = '', phase = '';
    items.forEach(function (e) {
      if (e.minor && !showAll) return;
      if (e.phase !== phase) { phase = e.phase || ''; html += '<li class="phase">' + esc((phase || 'Events').toUpperCase()) + '</li>'; }
      var day = Math.abs(e.at - launchMs) > 6 * 3600e3 ? G.ctDay(e.at) + ' ' : '';
      html += '<li class="ev' + (e.big ? ' big' : '') + (e.aborted ? ' abort' : '') + '" data-id="' + esc(e.id) + '" data-at="' + e.at + '">' +
        '<div><div class="tt">T' + G.fmtOffset((e.at - launchMs) / 1000) + '</div><div class="ct">' + day + G.ctTime(e.at, true) + '</div></div>' +
        '<div><div class="lbl">' + esc(e.label) + kindTag(e) + '</div>' +
        (e.extra ? '<div class="see">' + esc(e.extra) + '.</div>' : '') +
        (e.see ? '<div class="see">' + esc(e.see) + '</div>' : '') + '</div></li>';
    });
    $(listId).innerHTML = html || '<li class="note">No timeline published yet.</li>';
  }

  function renderTimeline() {
    if (!M) return;
    evCache = eventTimes();
    var sig = evCache.map(function (e) { return e.id + Math.round(e.at / 1000); }).join() + state.showMinor;
    if (sig === evSig) return;
    evSig = sig;
    renderEventList('eventList', evCache, t0(), state.showMinor);
  }
  function updateTimelineClasses(now) {
    if (!M) return;
    var vis = evCache.filter(function (e) { return !e.minor || state.showMinor; });
    var cur = null, next = null;
    for (var i = 0; i < vis.length; i++) { if (vis[i].at <= now) cur = vis[i]; else { next = vis[i]; break; } }
    var rows = document.querySelectorAll('#eventList .ev');
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j], at = +r.dataset.at;
      r.classList.toggle('past', at <= now && (!cur || r.dataset.id !== cur.id));
      r.classList.toggle('current', !!cur && r.dataset.id === cur.id);
      r.classList.toggle('next', !!next && r.dataset.id === next.id);
    }
    var first = vis[0];
    $('curEvent').textContent = cur ? cur.label : (first ? 'Waiting for the countdown' : '—');
    $('nextEvent').textContent = next ? next.label + ' in ' + human((next.at - now) / 1000) : '—';
    if (missionOver(now)) { $('curEvent').textContent = 'Mission complete'; $('nextEvent').textContent = M.shipCatchOffsetSec ? 'Ship catch window has passed' : '—'; }
  }

  function coord(lat, lon) { return lat.toFixed(5) + ', ' + lon.toFixed(5); }
  function renderLook() {
    var o = observer(), g = geom(state.target), now = new Date();
    var source, meta;
    if (state.site === 'gps' && gps) {
      source = gpsLive ? 'Live GPS' : 'Last GPS fix';
      meta = coord(gps.lat, gps.lon);
      if (isFinite(gps.acc)) meta += ' ±' + Math.round(gps.acc) + ' m';
      if (!gpsLive && gps.at) meta += ' · ' + G.ctTime(gps.at);
    } else if (state.site === 'gps') {
      source = 'Live GPS';
      meta = (gpsError ? 'GPS unavailable (' + gpsError + '). ' : 'Waiting for a fix. ') + 'Showing ' + P.outpost.name + ' until then. ' + coord(o.lat, o.lon);
    } else {
      source = o.name;
      meta = coord(o.lat, o.lon);
    }
    $('locSource').textContent = source;
    $('locMeta').textContent = meta;
    var site = state.site !== 'gps' ? P[state.site] : null;
    $('siteTip').textContent = site && site.tip ? site.tip : 'Live GPS uses where you are standing. The presets are the Outpost, the campground, and Port Isabel.';
    $('targetName').textContent = P[state.target].name;
    $('brg').textContent = deg(g.brg) + ' ' + G.compassPoint(g.brg);
    $('dist').innerHTML = km(g.dist) + '<div class="note" style="margin:2px 0 0">' + mi(g.dist) + '</div>';
    $('delay').innerHTML = g.delay.toFixed(1) + ' s<div class="note" style="margin:2px 0 0">' + g.speed.toFixed(0) + ' m/s</div>';
    var te = G.elevationAngle(geom('tower').dist, P.tower.heightM);
    $('elev').innerHTML = te.toFixed(1) + '° up<div class="note" style="margin:2px 0 0">low on the horizon</div>';
    var sun = G.sunPosition(now, o.lat, o.lon);
    var rel = G.norm360(sun.az - g.brg); if (rel > 180) rel -= 360;
    var side = Math.abs(rel) > 135 ? 'behind you' : Math.abs(rel) < 45 ? 'in front of you, near the target' : rel > 0 ? 'off your right side' : 'off your left side';
    $('sunInfo').textContent = sun.el > 0 ? 'Sun: ' + deg(sun.az) + ' ' + G.compassPoint(sun.az) + ', ' + sun.el.toFixed(0) + '° up. Facing the target, the sun is ' + side + '.' : 'Sun is below the horizon (' + deg(sun.az) + ' ' + G.compassPoint(sun.az) + ').';
    $('sunMark').classList.toggle('hide', sun.el <= 0);
    $('sunMark').style.transform = 'rotate(' + sun.az + 'deg)';
    $('arrow').style.transform = 'rotate(' + g.brg + 'deg)';
    var live = compassOn && heading != null && Date.now() - compassSeen < 3000;
    $('dial').classList.toggle('live', live);
    $('rose').style.transform = live ? 'rotate(' + (-heading) + 'deg)' : 'none';
    if (live) {
      var d = G.norm360(g.brg - heading); if (d > 180) d -= 360;
      $('turnHint').textContent = Math.abs(d) <= 7 ? '● ON TARGET · ' + P[state.target].short : (d > 0 ? 'TURN RIGHT ' : 'TURN LEFT ') + Math.abs(Math.round(d)) + '°';
      $('compassInfo').textContent = 'Compass live · heading ' + deg(heading) + '. Keep the phone flat and away from metal. Phone compasses can be off by several degrees.';
    } else {
      $('turnHint').textContent = 'FACE ' + G.compassPoint(g.brg) + ' · ' + deg(g.brg);
      if (compassOn && Date.now() - Math.max(compassSeen, compassStart) > 4000) $('compassInfo').textContent = 'No compass readings from this phone or browser. Use the bearing above with the sun or a landmark.';
    }
    var rows = '';
    ['tower', 'pad'].forEach(function (k) {
      var x = geom(k);
      rows += '<tr><td>' + esc(P[k].name) + '</td><td>' + deg(x.brg) + ' ' + G.compassPoint(x.brg) + '</td><td>' + km(x.dist) + '<br><span class="dim">' + mi(x.dist) + '</span></td><td>' + x.delay.toFixed(1) + ' s</td></tr>';
    });
    $('targetsTbl').querySelector('tbody').innerHTML = rows;
    $('towerNote').textContent = P.tower.note + ' Tower height about 144.5 m. Distances are straight-line.';
    if ($('cNow')) $('cNow').textContent = g.speed.toFixed(0) + ' m/s';
    if ($('catchNote')) $('catchNote').textContent = mode === 'launch' && M ? (M.catchNote || '') : '';
    if ($('lookTitle')) $('lookTitle').textContent = mode === 'launch' ? 'WHERE TO LOOK' : 'VIEWING GUIDE';
  }

  function startGps() {
    if (!('geolocation' in navigator)) { gpsError = 'not supported'; return; }
    navigator.geolocation.watchPosition(function (p) {
      gps = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
      gpsLive = true; gpsError = null; store(GPSKEY, gps); evSig = ''; renderLook();
    }, function (err) {
      gpsLive = false; gpsError = err.code === 1 ? 'permission denied' : err.code === 3 ? 'timed out' : 'no fix'; renderLook();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }

  function onOrient(e) {
    var h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
    else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) {
      var sa = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      h = G.norm360(360 - e.alpha + sa);
    }
    if (h == null) return;
    if (heading == null) heading = h;
    else { var dlt = G.norm360(h - heading); if (dlt > 180) dlt -= 360; heading = G.norm360(heading + dlt * 0.35); }
    compassSeen = Date.now();
  }
  function enableCompass() {
    var DOE = window.DeviceOrientationEvent;
    if (!DOE) { $('compassInfo').textContent = 'This browser has no compass support. Use the bearing with the sun or a landmark.'; return; }
    var go = function () {
      compassOn = true; compassSeen = 0; compassStart = Date.now();
      if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrient);
      window.addEventListener('deviceorientation', onOrient);
      $('compassBtn').textContent = 'COMPASS ON'; $('compassBtn').classList.add('armed');
      $('compassInfo').textContent = 'Waiting for compass… If nothing happens, move the phone in a figure-8 to calibrate it.';
    };
    if (typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then(function (r) { if (r === 'granted') go(); else $('compassInfo').textContent = 'Compass permission denied. Use the bearing with the sun or a landmark.'; })
        .catch(function () { $('compassInfo').textContent = 'Compass permission could not be requested.'; });
    } else go();
  }

  function missionOver(now) {
    if (!M || !M.complete || state.hold) return false;
    if (state.launchMs !== defaultT0()) return false;
    return now >= (M.shipCatchOffsetSec ? shipT() : t0());
  }
  function alertEvents() { return evCache.filter(function (e) { return e.alert && !e.aborted && !(M && M.complete && e.anchor === 'ship'); }); }
  function renderAlerts(now) {
    var html = '';
    alertEvents().forEach(function (e) {
      html += '<li class="' + (e.at <= now ? 'done' : '') + '"><span>' + esc(e.label) + kindTag(e) + '</span><span class="when">T' + G.fmtOffset((e.at - t0()) / 1000) + '<br><span class="dim">' + G.ctTime(e.at, true) + '</span></span>' +
        '<span class="sub">' + (e.extra ? esc(e.extra) + '. ' : '') + esc(e.see || '') + '</span></li>';
    });
    $('alertList').innerHTML = html || '<li class="note">No sound-arrival alerts in this flight\'s timeline.</li>';
  }
  function beep(freq, dur) {
    if (!audio) return;
    try {
      var o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq; o.type = 'sine'; g.gain.value = 0.0001;
      o.connect(g); g.connect(audio.destination);
      var t = audio.currentTime; g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* ignore */ }
  }
  function fire(e, test) {
    if (!state.soundAlerts) return;
    $('flashTitle').textContent = test ? 'TEST ALERT' : e.label.toUpperCase();
    $('flashSub').textContent = test ? 'This is what a sound-arrival alert looks like.' : (e.see || '');
    $('flash').hidden = false;
    if (navigator.vibrate) navigator.vibrate([500, 150, 500, 150, 900]);
    beep(880, 0.25); setTimeout(function () { beep(660, 0.4); }, 300);
    if (window.speechSynthesis && !test) { try { speechSynthesis.speak(new SpeechSynthesisUtterance(e.label)); } catch (x) { /* ignore */ } }
    setTimeout(function () { $('flash').hidden = true; }, 9000);
  }
  var lastTick = Date.now();
  function checkAlerts(now) {
    if (!M || mode !== 'launch' || missionOver(now)) { lastTick = now; return; }
    alertEvents().forEach(function (e) {
      var key = e.id + '@' + Math.round(e.at / 1000);
      var lead = (e.at - now) / 1000;
      if (armed && state.soundAlerts && e.soundFrom && lead > 0 && lead <= 3.05) { var k2 = key + ':' + Math.ceil(lead); if (!fired[k2]) { fired[k2] = 1; beep(1200, 0.08); } }
      if (now >= e.at && now - e.at < 15000 && lastTick < e.at && !fired[key]) {
        fired[key] = 1; store(FIREDKEY, fired);
        if (armed) fire(e);
      }
    });
    lastTick = now;
  }
  function renderArmInfo() {
    if (!state.soundAlerts) {
      $('armInfo').textContent = armed
        ? 'Armed, but sound-arrival alerts are switched off, so nothing will fire until you turn them on.'
        : 'Turn sound-arrival alerts on, then arm them. The phone needs to stay unlocked with this page open.';
      return;
    }
    if (!armed) {
      $('armInfo').textContent = 'Alerts are on. Arm them once, and the phone needs to stay unlocked with this page open.';
      return;
    }
    var vib = !!navigator.vibrate;
    $('armInfo').textContent = 'Armed: screen flash + beep' + (vib ? ' + vibration' : '') + (window.speechSynthesis ? ' + spoken call-out' : '') + '.' +
      (vib ? '' : ' This browser cannot vibrate (iPhone Safari does not support web vibration), so turn the volume up and watch for the flash.') +
      ('wakeLock' in navigator ? ' Screen kept awake.' : ' Keep the screen on yourself.');
  }
  function arm() {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) { audio = null; }
    armed = true;
    if (state.soundAlerts) { beep(880, 0.12); if (navigator.vibrate) navigator.vibrate(60); }
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
    $('armBtn').textContent = 'ALERTS ARMED'; $('armBtn').classList.add('armed');
    renderArmInfo();
  }
  document.addEventListener('visibilitychange', function () {
    if (armed && document.visibilityState === 'visible' && 'wakeLock' in navigator && (!wakeLock || wakeLock.released)) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
  });

  var WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail' };
  function wxUrl() {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + P.pad.lat + '&longitude=' + P.pad.lon +
      '&current=temperature_2m,relative_humidity_2m,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&hourly=temperature_2m,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&daily=sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&timeformat=unixtime&forecast_days=10';
  }
  function fetchWx() {
    if (mode !== 'launch') return;
    if (!navigator.onLine) { renderWx(true); return; }
    $('wxStatus').textContent = 'Updating…';
    fetch(wxUrl(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { wx = { data: j, at: Date.now() }; store(WXKEY, wx); evSig = ''; renderWx(false); renderAll(); })
      .catch(function () { renderWx(true); });
  }
  function hourAt(ms) {
    var h = wx && wx.data && wx.data.hourly; if (!h || !h.time) return null;
    var best = -1, bd = Infinity;
    for (var i = 0; i < h.time.length; i++) { var d = Math.abs(h.time[i] * 1000 - ms); if (d < bd) { bd = d; best = i; } }
    if (bd > 3600e3) return null;
    return { t: h.temperature_2m[best], w: h.wind_speed_10m[best], wd: h.wind_direction_10m[best], g: h.wind_gusts_10m[best], c: h.cloud_cover[best], v: h.visibility[best] };
  }
  function visTxt(m) { return isFinite(m) ? (m / 1609.344 >= 10 ? '10+ mi' : (m / 1609.344).toFixed(1) + ' mi') : '—'; }
  function renderWx(failed) {
    if (!wx || !wx.data || !wx.data.current) {
      $('wxStatus').textContent = failed ? 'No weather yet. Connect once to cache it.' : 'Loading…';
      return;
    }
    var c = wx.data.current, obsMs = c.time ? c.time * 1000 : wx.at, stale = failed || !navigator.onLine || Date.now() - obsMs > 45 * 60e3;
    $('wxStatus').textContent = (stale ? 'CACHED · ' : 'LIVE · ') + 'observed ' + G.ctDay(obsMs) + ' ' + G.ctTime(obsMs) + (stale && !navigator.onLine ? ' · you are offline' : '');
    $('wxTemp').textContent = Math.round(c.temperature_2m) + '°F';
    $('wxWind').innerHTML = Math.round(c.wind_speed_10m) + ' mph<div class="note" style="margin:2px 0 0">from ' + G.compassPoint(c.wind_direction_10m) + ' (' + deg(c.wind_direction_10m) + ')</div>';
    $('wxGust').textContent = Math.round(c.wind_gusts_10m) + ' mph';
    $('wxCloud').textContent = Math.round(c.cloud_cover) + '%';
    $('wxVis').textContent = visTxt(c.visibility);
    $('wxRh').textContent = Math.round(c.relative_humidity_2m) + '%';
    $('wxSky').textContent = WMO[c.weather_code] || ('Code ' + c.weather_code);
    var d = wx.data.daily, ss = null, T0 = t0();
    if (d && d.time) for (var i = 0; i < d.time.length; i++) if (Math.abs(d.sunset[i] * 1000 - T0) < 12 * 3600e3) ss = d.sunset[i] * 1000;
    if (!ss) { var s2 = G.sunsetNear(new Date(T0), P.pad.lat, P.pad.lon); ss = s2 && +s2; }
    $('wxSunset').textContent = ss ? G.ctDay(ss) + ' ' + G.ctTime(ss) : '—';
    var rows = '';
    var slots = [['T−0', T0]];
    if (M && M.shipCatchOffsetSec) slots.push(['Ship catch', shipT()]);
    slots.forEach(function (r) {
      var h = hourAt(r[1]);
      rows += '<tr><td>' + r[0] + '<br><span class="dim">' + G.ctDay(r[1]) + ' ' + G.ctTime(r[1]) + '</span></td>' +
        (h ? '<td>' + Math.round(h.t) + '°F</td><td>' + Math.round(h.w) + ' mph ' + G.compassPoint(h.wd) + '<br><span class="dim">gust ' + Math.round(h.g) + '</span></td><td>' + Math.round(h.c) + '%</td><td>' + visTxt(h.v) + '</td>'
          : '<td colspan="4" class="dim">Outside the forecast range</td>') + '</tr>';
    });
    $('wxFc').querySelector('tbody').innerHTML = rows;
  }

  function applyClock(flight) {
    active = flight;
    var def = Date.parse(flight.net);
    var saved = clocks[flight.id] || {};
    state.launchMs = isFinite(saved.launchMs) ? saved.launchMs : (isFinite(def) ? def : Date.now());
    state.hold = saved.hold || null;
    state.shipFollow = saved.shipFollow !== false;
    state.shipMs = saved.shipMs || null;
    var past = isFinite(flight.netMs) && flight.netMs <= Date.now();
    M = {
      name: flight.name || 'Starship',
      vehicles: flight.vehicles || '',
      pad: (flight.manual && flight.pad) ? flight.pad : [flight.pad, flight.location].filter(Boolean).join(' · '),
      launchUtcDefault: flight.net,
      windowMinutes: flight.windowMinutes || 0,
      launched: !!flight.launched || !!flight.complete || past,
      complete: !!flight.complete,
      status: flight.manual && flight.status ? flight.status : (flight.statusName || flight.status || ''),
      shipCatchOffsetSec: flight.shipCatchOffsetSec || 0,
      catchNote: flight.catchNote || '',
      manual: !!flight.manual
    };
    EVENTS = flight.events || [];
    evSig = '';
  }

  function renderTabs() {
    var tabs = mode === 'launch'
      ? [['#count', 'COUNT'], ['#timeline', 'TIMELINE'], ['#look', 'LOOK'], ['#alerts', 'SOUND'], ['#wx', 'WEATHER'], ['#ship', 'SHIP CATCH']]
      : [['#next', 'NEXT'], ['#history', 'FLIGHTS'], ['#vehicles', 'VEHICLES'], ['#look', 'GUIDE'], ['#news', 'NEWS']];
    $('tabs').innerHTML = tabs.map(function (t, i) {
      return '<a href="' + t[0] + '"' + (i === 0 ? ' class="active"' : '') + '>' + t[1] + '</a>';
    }).join('');
    var hash = location.hash;
    var visible = hash && document.querySelector(hash) && document.querySelector(hash).offsetParent !== null;
    if (!visible) history.replaceState(null, '', tabs[0][0]);
    if (sectionObserver) sectionObserver.disconnect();
    if ('IntersectionObserver' in window) {
      var links = document.querySelectorAll('#tabs a');
      sectionObserver = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id); });
        });
      }, { rootMargin: '-40% 0px -50% 0px' });
      document.querySelectorAll('main > section').forEach(function (s) { if (s.offsetParent !== null) sectionObserver.observe(s); });
    }
  }

  function renderSources() {
    var items = [];
    var seen = {};
    function add(name, url) {
      url = safeUrl(url);
      if (!name || !url || seen[url]) return;
      seen[url] = 1;
      items.push('<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(name) + '</a>');
    }
    Object.keys(D.SOURCES).forEach(function (k) { add(D.SOURCES[k].name, D.SOURCES[k].url); });
    if (mode === 'launch' && active && active.sources) {
      Object.keys(active.sources).forEach(function (k) { var s = active.sources[k]; if (s) add(s.name, s.url); });
    }
    add('Launch Library 2 (The Space Devs)', 'https://thespacedevs.com/');
    $('srcList').innerHTML = '<b>Sources:</b> ' + items.join(' · ');
  }

  function renderHub() {
    var now = Date.now();
    var next = F.selectNextFlight(flights || [], now);
    if (!next) {
      $('nextName').textContent = 'NO FLIGHT LISTED';
      $('nextVeh').textContent = '';
      $('nextStatus').textContent = 'No upcoming Starship flight is in the saved list.';
      $('hubClock').hidden = true;
      $('hubCoarse').hidden = true;
      $('nextDesc').textContent = '';
      $('nextNote').textContent = '';
      $('nextList').innerHTML = '';
    } else {
      $('nextName').textContent = (next.name || flightTitle(next)).toUpperCase();
      $('nextVeh').textContent = [next.vehicles, next.configuration, next.pad].filter(Boolean).join(' · ');
      var coarse = F.coarseNetLabel(next);
      var precise = F.isPrecisePrecision(next.netPrecision, next.net);
      $('hubCoarse').hidden = !coarse;
      $('hubClock').hidden = !precise;
      if (coarse) {
        $('hubCoarseVal').textContent = coarse.replace(/^NET\s+/, '');
        $('nextStatus').textContent = (next.netPrecisionDetail || 'Launch Library 2 has not published a clock time.') + ' Central Time is used once a time is set.';
      } else {
        $('nextStatus').textContent = [next.statusName || next.status, 'Central Time'].filter(Boolean).join(' · ');
        setClock('hub', now - next.netMs, $('hubClock'));
      }
      $('nextDesc').textContent = next.missionDescription || '';
      if (!precise) {
        $('nextNote').textContent = 'No clock time yet, so there is no countdown and no timeline. Launch-day mode starts 48 hours before a real T−0 and stays up until 6 hours after liftoff.';
        $('nextList').innerHTML = '';
      } else {
        $('nextNote').textContent = next.manual && (next.events || []).some(function (e) { return e.kind && e.kind !== 'll2'; })
          ? 'Timeline from this flight\'s mission file. COMPUTED rows use your distance. ESTIMATE rows are not from SpaceX.'
          : 'Timeline from Launch Library 2. A mission file replaces it when that file includes events.';
        var ship = next.shipCatchOffsetSec ? next.netMs + next.shipCatchOffsetSec * 1000 : null;
        renderEventList('nextList', timesFor(next.events, next.netMs, ship, true), next.netMs, true);
      }
    }

    var past = (flights || []).filter(function (f) { return isFinite(f.netMs) && (f.netMs <= now || f.complete); });
    past.sort(function (a, b) { return b.netMs - a.netMs; });
    var srcLine = ll2Source === 'network' ? 'Launch list: Launch Library 2, just loaded.'
      : ll2Source === 'cache' ? 'Launch list: the copy saved on this phone from Launch Library 2.'
      : 'Launch list: the copy bundled with this app.';
    $('listSource').textContent = srcLine + ' A mission file overrides any field it sets. Dates in Central Time when the time is known.';
    $('historyList').innerHTML = past.map(function (f) {
      return '<article class="card"><div class="row"><h3>' + esc(flightTitle(f)) + '</h3><span class="dim">' + esc(whenText(f)) + '</span></div>' +
        '<div class="v">' + esc(f.vehicles || 'Vehicles not listed') + '</div>' +
        (f.pad ? '<div class="note">' + esc(f.pad) + '</div>' : '') +
        '<p class="sum">' + esc(f.outcome || f.statusName || '') + '</p></article>';
    }).join('') || '<p class="note">No Starship flights in the saved list.</p>';

    var groups = { booster: [], ship: [] };
    (vehicles || []).forEach(function (v) {
      if (!v || (v.role !== 'booster' && v.role !== 'ship') || !v.serial) return;
      groups[v.role].push(v);
    });
    function serialNum(v) { var m = /(\d+)/.exec(v.serial || ''); return m ? +m[1] : -1; }
    function cards(list) {
      list.sort(function (a, b) { return serialNum(b) - serialNum(a); });
      return list.map(function (v) {
        var links = (v.sources || []).map(function (s) {
          var url = safeUrl(s && s.url);
          return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(s.name || 'Source') + '</a>' : esc(s && s.name || '');
        }).filter(Boolean).join(' · ');
        var flightsTxt = (v.flights || []).length ? 'Flight ' + v.flights.join(', ') : '';
        return '<article class="card"><div class="row"><h3>' + esc(v.serial) + '</h3><span class="pill">' + esc(v.status || '—') + '</span></div>' +
          '<div class="note">' + esc([v.name, v.block, flightsTxt].filter(Boolean).join(' · ')) + '</div>' +
          (v.summary ? '<p class="sum">' + esc(v.summary) + '</p>' : '') +
          (links ? '<div class="src">' + links + '</div>' : '') + '</article>';
      }).join('');
    }
    var vehicleHtml = '';
    if (groups.booster.length) vehicleHtml += '<div class="group-label">BOOSTERS</div>' + cards(groups.booster);
    if (groups.ship.length) vehicleHtml += '<div class="group-label">SHIPS</div>' + cards(groups.ship);
    $('vehicleList').innerHTML = vehicleHtml || '<p class="note">No vehicles in the vehicle file yet.</p>';

    var items = (news || []).slice().filter(function (n) { return n && (n.title || n.summary); });
    items.sort(function (a, b) {
      var da = Date.parse(a.date || '') || 0, db = Date.parse(b.date || '') || 0;
      return db - da;
    });
    $('newsList').innerHTML = items.length ? items.map(function (n) {
      var url = safeUrl(n.sourceUrl);
      var src = url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(n.sourceName || 'Source') + '</a>' : esc(n.sourceName || '');
      return '<article class="card"><div class="row"><h3>' + esc(n.title || 'Update') + '</h3><span class="dim">' + esc(n.date || '') + '</span></div>' +
        (n.summary ? '<p class="sum">' + esc(n.summary) + '</p>' : '') +
        (src ? '<div class="src">' + src + '</div>' : '') + '</article>';
    }).join('') : '<p class="note">No updates yet.</p>';
  }

  function renderLaunch() {
    if (!M) return;
    $('missionName').textContent = M.name.toUpperCase();
    $('missionVeh').textContent = [M.vehicles, M.pad].filter(Boolean).join(' · ');
    var custom = state.launchMs !== defaultT0();
    var over = missionOver(Date.now());
    $('launchStatus').textContent = custom ? 'T−0 SET ON THIS PHONE · CHECK SPACEX FOR UPDATES'
      : (M.complete || M.launched ? M.status : ('NET ' + G.ctDay(defaultT0()).toUpperCase() + ' · ' + G.ctTime(defaultT0(), true)));
    $('launchLocal').textContent = G.ctDay(t0()) + ' ' + G.ctTime(t0(), true);
    if (over && M.shipCatchOffsetSec) {
      $('windowLabel').textContent = 'SHIP CATCH';
      $('windowClose').textContent = G.ctDay(shipT()) + ' ' + G.ctTime(shipT());
    } else if (M.windowMinutes) {
      $('windowLabel').textContent = 'WINDOW CLOSES';
      $('windowClose').textContent = G.ctTime(state.launchMs + M.windowMinutes * 60e3);
    } else {
      $('windowLabel').textContent = 'WINDOW';
      $('windowClose').textContent = '—';
    }
    $('holdBanner').hidden = !state.hold;
    $('holdBtn').textContent = state.hold ? 'RESUME COUNT' : 'HOLD';
    var hasShip = !!M.shipCatchOffsetSec;
    $('shipClock').hidden = !hasShip;
    $('shipControls').hidden = !hasShip;
    $('shipEmpty').hidden = hasShip;
    $('shipStatus').textContent = !hasShip ? 'NO SHIP-CATCH TIME IN THE MISSION FILE'
      : (!state.shipFollow ? 'SET ON THIS PHONE' : (over ? (M.status || 'COMPLETE') : ('PLANNED · T' + G.fmtOffset(M.shipCatchOffsetSec) + ' FROM LIFTOFF')));
    $('shipWhenLabel').textContent = over ? 'CATCH TIME' : 'CATCH (EST.)';
    $('shipLocal').textContent = hasShip ? (G.ctDay(shipT()) + ' ' + G.ctTime(shipT(), true)) : '—';
    $('shipFollow').checked = !!state.shipFollow;
    $('shipForm').hidden = !!state.shipFollow || !hasShip;
    $('shipFollowText').textContent = hasShip ? ('Follow launch time (T' + G.fmtOffset(M.shipCatchOffsetSec) + ' from liftoff)') : 'Follow launch time';
    $('shipPadNote').textContent = M.catchNote || '';
    var spacex = (EVENTS || []).some(function (e) { return e.kind === 'spacex' || e.kind === 'computed' || e.kind === 'estimate'; });
    $('timelineNote').textContent = spacex
      ? 'Times from the mission file. SpaceX marks its rows approximate. COMPUTED rows use your distance. ESTIMATE rows are not from SpaceX. Ship-return rows follow the ship-catch clock.'
      : 'Times from Launch Library 2. Add events to this flight\'s mission file to replace them, including COMPUTED and ESTIMATE rows.';
    $('showMinor').checked = !!state.showMinor;
    $('useWind').checked = !!state.useWind;
    $('tempMode').value = state.tempMode;
    $('tempManual').value = state.tempManualF;
    document.querySelectorAll('#soundAlertSeg button').forEach(function (b) { b.classList.toggle('on', (b.dataset.sound === '1') === !!state.soundAlerts); });
    $('soundAlertInfo').textContent = state.soundAlerts
      ? 'On. Arm once, then liftoff sound and sonic-boom alerts flash the screen, beep, speak, and vibrate.'
      : 'Off. No flash, tone, voice, or vibration. Sound delays below still update.';
    renderArmInfo();
    renderTimeline();
    updateTimelineClasses(Date.now());
    setClock('clk', Date.now() - t0(), $('mainClock'));
    if (M.shipCatchOffsetSec) setClock('s', Date.now() - shipT(), $('shipClock'));
    $('nowLocal').textContent = G.ctTime(Date.now(), true);
    $('met').textContent = Date.now() >= t0() ? 'T' + G.fmtOffset((Date.now() - t0()) / 1000) : 'not launched';
    renderAlerts(Date.now());
    if (wx) renderWx(!navigator.onLine);
  }

  function renderAll() {
    if (!flights) return;
    if (mode === 'launch') renderLaunch();
    else renderHub();
    renderLook();
    renderSources();
    document.querySelectorAll('#siteSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.site === state.site); });
    document.querySelectorAll('#targetSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.target === state.target); });
  }

  function applyMode(decision) {
    mode = decision.mode;
    preview = !!decision.preview;
    document.documentElement.dataset.mode = mode;
    document.body.classList.toggle('mode-launch', mode === 'launch');
    document.body.classList.toggle('mode-hub', mode !== 'launch');
    $('modePill').textContent = mode === 'launch' ? (preview ? 'PREVIEW' : 'LAUNCH DAY') : 'HUB';
    $('previewBar').hidden = !(mode === 'launch' && preview);
    if (mode === 'launch' && decision.flight) applyClock(decision.flight);
    else { active = null; M = null; EVENTS = []; }
    document.title = mode === 'launch' && M ? ('StarbaseLaunchApp · ' + M.name) : 'StarbaseLaunchApp · Starship';
    renderTabs();
    renderAll();
    if (mode === 'launch') {
      fetchWx();
      if (!wxTimer) wxTimer = setInterval(fetchWx, 10 * 60e3);
    }
  }

  var tickN = 0;
  function tick() {
    var now = Date.now();
    if (flights && !forced && tickN > 0 && tickN % 240 === 0) {
      var again = F.decideMode(null, flights, now);
      var same = again.mode === mode && ((again.flight && active && again.flight.id === active.id) || (!again.flight && !active));
      if (!same) applyMode(again);
    }
    if (mode === 'launch' && M) {
      setClock('clk', now - t0(), $('mainClock'));
      if (M.shipCatchOffsetSec) setClock('s', now - shipT(), $('shipClock'));
      $('nowLocal').textContent = G.ctTime(now, true);
      $('met').textContent = now >= t0() ? 'T' + G.fmtOffset((now - t0()) / 1000) : 'not launched';
      if (state.hold) renderTimeline();
      updateTimelineClasses(now);
      checkAlerts(now);
      if (tickN % 20 === 0) renderAlerts(now);
    } else if (mode === 'hub' && flights) {
      var next = F.selectNextFlight(flights, now);
      if (next && F.isPrecisePrecision(next.netPrecision, next.net)) setClock('hub', now - next.netMs, $('hubClock'));
    }
    if (++tickN % 4 === 0) renderLook();
  }

  function bind() {
    $('holdBtn').onclick = function () {
      if (!M) return;
      if (state.hold) { state.launchMs += Date.now() - state.hold.start; state.hold = null; }
      else state.hold = { start: Date.now() };
      save(); evSig = ''; renderAll();
    };
    document.querySelectorAll('[data-shift]').forEach(function (b) {
      b.onclick = function () { if (!M) return; state.launchMs += +b.dataset.shift * 1000; save(); evSig = ''; renderAll(); };
    });
    $('editBtn').onclick = function () { if (!M) return; $('launchInput').value = G.utcToCtWall(t0()); $('editForm').hidden = false; };
    $('cancelEdit').onclick = function () { $('editForm').hidden = true; };
    $('resetLaunch').onclick = function () {
      if (!M) return;
      state.launchMs = defaultT0(); state.hold = null; save(); $('editForm').hidden = true; evSig = ''; renderAll();
    };
    $('editForm').onsubmit = function (e) {
      e.preventDefault();
      var ms = G.ctWallToUtc($('launchInput').value);
      if (isFinite(ms)) { state.launchMs = ms; state.hold = null; save(); $('editForm').hidden = true; evSig = ''; renderAll(); }
    };
    $('shipFollow').onchange = function () {
      state.shipFollow = this.checked;
      if (!this.checked) { state.shipMs = state.shipMs || shipT(); $('shipInput').value = G.utcToCtWall(state.shipMs); }
      save(); evSig = ''; renderAll();
    };
    $('shipForm').onsubmit = function (e) {
      e.preventDefault();
      var ms = G.ctWallToUtc($('shipInput').value);
      if (isFinite(ms)) { state.shipMs = ms; save(); evSig = ''; renderAll(); }
    };
    $('showMinor').onchange = function () { state.showMinor = this.checked; save(); evSig = ''; renderAll(); };
    $('useWind').onchange = function () { state.useWind = this.checked; save(); evSig = ''; renderAll(); };
    $('tempMode').onchange = function () { state.tempMode = this.value; save(); evSig = ''; renderAll(); };
    $('tempManual').oninput = function () { state.tempManualF = parseFloat(this.value); save(); evSig = ''; renderAll(); };
    document.querySelectorAll('#siteSeg button').forEach(function (b) {
      b.onclick = function () { state.site = b.dataset.site; save(); evSig = ''; renderAll(); };
    });
    document.querySelectorAll('#targetSeg button').forEach(function (b) {
      b.onclick = function () { state.target = b.dataset.target; save(); renderAll(); };
    });
    $('compassBtn').onclick = enableCompass;
    document.querySelectorAll('#soundAlertSeg button').forEach(function (b) {
      b.onclick = function () {
        state.soundAlerts = b.dataset.sound === '1';
        save();
        if (!state.soundAlerts) {
          $('flash').hidden = true;
          if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
        }
        renderAll();
      };
    });
    $('armBtn').onclick = arm;
    $('testBtn').onclick = function () {
      if (!state.soundAlerts) { renderArmInfo(); return; }
      if (!armed) arm();
      fire({ label: 'Test', see: '' }, true);
    };
    $('flashClose').onclick = function () { $('flash').hidden = true; };
    $('wxRefresh').onclick = fetchWx;
    var net = function () {
      var on = navigator.onLine;
      $('netStatus').textContent = on ? 'ONLINE' : 'OFFLINE';
      $('netStatus').className = 'pill ' + (on ? 'on' : 'off');
      if (on && mode === 'launch') fetchWx();
    };
    window.addEventListener('online', net);
    window.addEventListener('offline', net);
    net();
  }

  function registerSW() {
    var ok = 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    if (!ok) { $('swStatus').textContent = location.protocol === 'file:' ? 'Opened as a local file. Use a local web server so the flight list can load.' : ''; return; }
    navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; })
      .then(function () { $('swStatus').textContent = 'Saved for offline use. This page keeps working without signal.'; })
      .catch(function (e) { $('swStatus').textContent = 'Offline save unavailable: ' + e.message; });
  }

  function getJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }
  function loadManuals() {
    return getJson('data/missions/index.json').then(function (idx) {
      var files = (idx && idx.files) || [];
      return Promise.all(files.map(function (name) {
        if (!/^[\w.-]+$/.test(name)) return null;
        return getJson('data/missions/' + name).catch(function () { return null; });
      }));
    }).then(function (list) { return (list || []).filter(Boolean); }).catch(function () { return []; });
  }
  function fetchLl2() {
    var cache = load(LL2_KEY, null);
    var now = Date.now();
    if (F.cacheFresh(cache, now)) return Promise.resolve({ launches: cache.launches, source: 'cache' });
    return Promise.all([getJson(LL2_PREV), getJson(LL2_UP)]).then(function (pages) {
      var seen = {}, out = [];
      pages.forEach(function (page) {
        (page.results || []).forEach(function (raw) {
          var trimmed = F.trimLaunch(raw);
          if (!trimmed.ll2Id || seen[trimmed.ll2Id]) return;
          seen[trimmed.ll2Id] = 1;
          out.push(trimmed);
        });
      });
      if (!out.length) throw new Error('empty');
      store(LL2_KEY, { at: Date.now(), launches: out });
      return { launches: out, source: 'network' };
    }).catch(function () { return null; }).then(function (net) {
      if (net) return net;
      if (cache && Array.isArray(cache.launches) && cache.launches.length) return { launches: cache.launches, source: 'cache' };
      return getJson('data/ll2-fallback.json').then(function (j) {
        return { launches: (j && j.launches) || [], source: 'fallback' };
      }).catch(function () { return { launches: [], source: 'fallback' }; });
    });
  }

  bind();
  registerSW();
  startGps();
  renderLook();
  setInterval(tick, 250);
  Promise.all([
    loadManuals(),
    fetchLl2(),
    getJson('data/vehicles.json').catch(function () { return { vehicles: [] }; }),
    getJson('data/news.json').catch(function () { return { items: [] }; })
  ]).then(function (res) {
    manuals = res[0];
    ll2Source = res[1].source;
    vehicles = (res[2] && res[2].vehicles) || [];
    news = (res[3] && res[3].items) || [];
    flights = F.buildCatalog(res[1].launches, manuals);
    applyMode(F.decideMode(forced, flights, Date.now()));
  }).catch(function () {
    flights = flights || [];
    applyMode(F.decideMode(forced, flights, Date.now()));
  });

  window.SBApp = { state: state, geom: geom, observer: observer, t0: t0, shipT: shipT };
})();
