/* StarbaseLaunchApp: UI and live logic. Plain script, no build step. */
(function () {
  'use strict';
  var D = window.SB_DATA, G = window.SBGeo, M = D.MISSION, P = D.PLACES;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'sbla.v1', WXKEY = 'sbla.wx.v1', GPSKEY = 'sbla.gps.v1', FIREDKEY = 'sbla.fired.v1';
  var DEFAULT_T0 = Date.parse(M.launchUtcDefault);

  // ---------- state ----------
  var state = load(KEY, {}) || {};
  state = Object.assign({ launchMs: DEFAULT_T0, hold: null, shipFollow: true, shipMs: null, site: 'gps', target: 'tower',
    tempMode: 'live', tempManualF: 70, useWind: true, showMinor: false, soundAlerts: true }, state);
  function save() { store(KEY, state); }
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  var gps = load(GPSKEY, null);        // {lat, lon, acc, at}
  var gpsLive = false, gpsError = null;
  var wx = load(WXKEY, null);           // {data, at}
  var fired = load(FIREDKEY, {}) || {};
  var heading = null, compassOn = false, compassSeen = 0, compassStart = 0;
  var armed = false, audio = null, wakeLock = null;

  function t0() { return state.hold ? state.launchMs + (Date.now() - state.hold.start) : state.launchMs; }
  function shipT() { return state.shipFollow || !state.shipMs ? t0() + M.shipCatchOffsetSec * 1000 : state.shipMs; }

  // ---------- observer position + geometry ----------
  function observer() {
    if (state.site === 'gps' && gps) return { lat: gps.lat, lon: gps.lon, name: gpsLive ? 'Live GPS' : 'Last GPS fix', acc: gps.acc };
    if (state.site === 'gps') return Object.assign({ fallback: true }, P.outpost);
    return P[state.site];
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

  // ---------- events ----------
  function eventTimes() {
    var T0 = t0(), S = shipT(), out = [];
    D.EVENTS.forEach(function (e) {
      var base = e.anchor === 'ship' ? S : T0, at = base + e.t * 1000, extra = '';
      if (e.soundFrom) { var g = geom(e.soundFrom); at += g.delay * 1000; extra = g.delay.toFixed(1) + ' s after you see it'; }
      out.push(Object.assign({}, e, { at: at, extra: extra }));
    });
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  // ---------- formatting ----------
  function z(n) { return (n < 10 ? '0' : '') + n; }
  function km(m) { return (m / 1000).toFixed(2) + ' km'; }
  function mi(m) { return (m / 1609.344).toFixed(2) + ' mi'; }
  function deg(d) { return ('00' + Math.round(G.norm360(d)) % 360).slice(-3) + '°'; }
  function tLabel(ms) { return 'T' + G.fmtOffset((ms - t0()) / 1000); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function kindTag(e) {
    if (e.kind === 'estimate') return '<span class="tag est">ESTIMATE</span>';
    if (e.kind === 'computed') return '<span class="tag computed">COMPUTED</span>';
    return e.webcast ? '<span class="tag">WEBCAST</span>' : '';
  }

  // ---------- clocks ----------
  function setClock(prefix, deltaMs, el) {
    var c = G.tclock(deltaMs);
    $(prefix + 'T').textContent = 'T' + (c.sign === '-' ? '−' : '+');
    $(prefix + 'D').textContent = z(c.d); $(prefix + 'H').textContent = z(c.h); $(prefix + 'M').textContent = z(c.m); $(prefix + 'S').textContent = z(c.s);
    el.classList.toggle('plus', c.sign === '+');
  }

  // ---------- timeline ----------
  var evCache = [], evSig = '';
  function renderTimeline() {
    evCache = eventTimes();
    var sig = evCache.map(function (e) { return e.id + Math.round(e.at / 1000); }).join() + state.showMinor;
    if (sig === evSig) return; evSig = sig;
    var html = '', phase = '';
    evCache.forEach(function (e) {
      if (e.minor && !state.showMinor) return;
      if (e.phase !== phase) { phase = e.phase; html += '<li class="phase">' + esc(phase.toUpperCase()) + '</li>'; }
      html += '<li class="ev' + (e.big ? ' big' : '') + '" data-id="' + e.id + '" data-at="' + e.at + '">' +
        '<div><div class="tt">' + tLabel(e.at) + '</div><div class="ct">' + (Math.abs(e.at - t0()) > 6 * 3600e3 ? G.ctDay(e.at) + ' ' : '') + G.ctTime(e.at, true) + '</div></div>' +
        '<div><div class="lbl">' + esc(e.label) + kindTag(e) + '</div>' +
        (e.extra ? '<div class="see">' + esc(e.extra) + '.</div>' : '') +
        (e.see ? '<div class="see">' + esc(e.see) + '</div>' : '') + '</div></li>';
    });
    $('eventList').innerHTML = html;
  }
  function updateTimelineClasses(now) {
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
    $('curEvent').textContent = cur ? cur.label : (first ? 'Waiting for the countdown (starts ' + tLabel(first.at) + ')' : '—');
    if (cur && cur.id === 'snd_scatch' && now - cur.at > 600e3) $('curEvent').textContent = 'Mission complete';
    $('nextEvent').textContent = next ? next.label + ' in ' + human((next.at - now) / 1000) : '—';
  }
  function human(s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + ' s';
    if (s < 3600) return Math.floor(s / 60) + ' m ' + z(s % 60) + ' s';
    if (s < 86400) return Math.floor(s / 3600) + ' h ' + z(Math.floor(s % 3600 / 60)) + ' m';
    return Math.floor(s / 86400) + ' d ' + Math.floor(s % 86400 / 3600) + ' h';
  }

  // ---------- where to look ----------
  function coord(lat, lon) { return lat.toFixed(5) + ', ' + lon.toFixed(5); }
  function renderLook() {
    var o = observer(), g = geom(state.target), now = new Date();
    var source, meta;
    if (state.site === 'gps' && gps) {
      source = gpsLive ? 'Live GPS' : 'Last GPS fix';
      meta = coord(gps.lat, gps.lon);
      if (isFinite(gps.acc)) meta += ' \u00b1' + Math.round(gps.acc) + ' m';
      if (!gpsLive) meta += ' \u00b7 ' + G.ctTime(gps.at);
    } else if (state.site === 'gps') {
      source = 'Live GPS';
      meta = (gpsError ? 'GPS unavailable (' + gpsError + '). ' : 'Waiting for a fix. ') + 'Showing ' + P.outpost.name + ' until then. ' + coord(o.lat, o.lon);
    } else {
      source = o.name;
      meta = coord(o.lat, o.lon);
    }
    $('locSource').textContent = source;
    $('locMeta').textContent = meta;
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
    ['tower', 'pad'].forEach(function (k) { var x = geom(k); rows += '<tr><td>' + P[k].name + '</td><td>' + deg(x.brg) + ' ' + G.compassPoint(x.brg) + '</td><td>' + km(x.dist) + '<br><span class="dim">' + mi(x.dist) + '</span></td><td>' + x.delay.toFixed(1) + ' s</td></tr>'; });
    $('targetsTbl').querySelector('tbody').innerHTML = rows;
    $('towerNote').textContent = P.tower.note + ' Tower height about 144.5 m. Distances are straight-line.';
    $('cNow').textContent = g.speed.toFixed(0) + ' m/s';
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

  // ---------- compass ----------
  function onOrient(e) {
    var h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
    else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) {
      var sa = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      h = G.norm360(360 - e.alpha + sa);
    }
    if (h == null) return;
    if (heading == null) heading = h;
    else { var d = G.norm360(h - heading); if (d > 180) d -= 360; heading = G.norm360(heading + d * 0.35); }
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

  // ---------- alerts ----------
  function alertEvents() { return evCache.filter(function (e) { return e.alert; }); }
  function renderAlerts(now) {
    var html = '';
    alertEvents().forEach(function (e) {
      html += '<li class="' + (e.at <= now ? 'done' : '') + '"><span>' + esc(e.label) + kindTag(e) + '</span><span class="when">' + tLabel(e.at) + '<br><span class="dim">' + G.ctTime(e.at, true) + '</span></span>' +
        '<span class="sub">' + (e.extra ? esc(e.extra) + '. ' : '') + esc(e.see) + '</span></li>';
    });
    $('alertList').innerHTML = html;
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

  // ---------- weather ----------
  var WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail' };
  function wxUrl() {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + P.pad.lat + '&longitude=' + P.pad.lon +
      '&current=temperature_2m,relative_humidity_2m,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&hourly=temperature_2m,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&daily=sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&timeformat=unixtime&forecast_days=10';
  }
  function fetchWx() {
    if (!navigator.onLine) { renderWx(true); return; }
    $('wxStatus').textContent = 'Updating…';
    fetch(wxUrl(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { wx = { data: j, at: Date.now() }; store(WXKEY, wx); evSig = ''; renderWx(false); renderAll(); })
      .catch(function (e) { renderWx(true, e.message); });
  }
  function hourAt(ms) {
    var h = wx && wx.data && wx.data.hourly; if (!h || !h.time) return null;
    var best = -1, bd = Infinity;
    for (var i = 0; i < h.time.length; i++) { var d = Math.abs(h.time[i] * 1000 - ms); if (d < bd) { bd = d; best = i; } }
    if (bd > 3600e3) return null;
    return { t: h.temperature_2m[best], w: h.wind_speed_10m[best], wd: h.wind_direction_10m[best], g: h.wind_gusts_10m[best], c: h.cloud_cover[best], v: h.visibility[best] };
  }
  function visTxt(m) { return isFinite(m) ? (m / 1609.344 >= 10 ? '10+ mi' : (m / 1609.344).toFixed(1) + ' mi') : '—'; }
  function renderWx(failed, msg) {
    if (!wx || !wx.data) { $('wxStatus').textContent = failed ? 'No weather yet (' + (msg || 'offline') + '). Connect once to cache it.' : 'Loading…'; return; }
    var c = wx.data.current, obsMs = c.time ? c.time * 1000 : wx.at, stale = failed || !navigator.onLine || Date.now() - obsMs > 45 * 60e3;
    $('wxStatus').textContent = (stale ? 'CACHED · ' : 'LIVE · ') + 'observed ' + G.ctDay(obsMs) + ' ' + G.ctTime(obsMs) + (stale && !navigator.onLine ? ' · you are offline' : failed ? ' · weather service unreachable' : '');
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
    [['T−0', T0], ['Ship catch', shipT()]].forEach(function (r) {
      var h = hourAt(r[1]);
      rows += '<tr><td>' + r[0] + '<br><span class="dim">' + G.ctDay(r[1]) + ' ' + G.ctTime(r[1]) + '</span></td>' +
        (h ? '<td>' + Math.round(h.t) + '°F</td><td>' + Math.round(h.w) + ' mph ' + G.compassPoint(h.wd) + '<br><span class="dim">gust ' + Math.round(h.g) + '</span></td><td>' + Math.round(h.c) + '%</td><td>' + visTxt(h.v) + '</td>'
           : '<td colspan="4" class="dim">Outside the forecast range</td>') + '</tr>';
    });
    $('wxFc').querySelector('tbody').innerHTML = rows;
  }

  // ---------- main render ----------
  function renderStatic() {
    $('missionVeh').textContent = M.vehicles + ' · ' + M.pad;
    if ($('catchNote')) $('catchNote').textContent = M.catchNote;
    if ($('shipPadNote')) $('shipPadNote').textContent = M.catchNote;
    var src = '<b>Sources:</b> ';
    src += Object.keys(D.SOURCES).map(function (k) { var s = D.SOURCES[k]; return '<a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>'; }).join(' · ');
    $('srcList').innerHTML = src;
  }
  function renderAll() {
    var T0 = t0();
    var custom = state.launchMs !== DEFAULT_T0;
    var faa = String(M.status || '').replace(/^NET · /, '');
    $('launchStatus').textContent = custom ? 'T−0 SET ON THIS PHONE · CHECK SPACEX FOR UPDATES' : 'NET ' + G.ctDay(DEFAULT_T0).toUpperCase() + ' · WINDOW OPENS ' + G.ctTime(DEFAULT_T0) + ' · ' + faa;
    $('launchLocal').textContent = G.ctDay(T0) + ' ' + G.ctTime(T0, true);
    $('windowClose').textContent = G.ctTime(state.launchMs + M.windowMinutes * 60e3);
    $('holdBanner').hidden = !state.hold;
    $('holdBtn').textContent = state.hold ? 'RESUME COUNT' : 'HOLD';
    $('shipStatus').textContent = state.shipFollow ? 'ESTIMATE · T−0 + 22:32:34 FROM SPACEX TIMELINE · NEXT DAY' : 'SET ON THIS PHONE';
    $('shipLocal').textContent = G.ctDay(shipT()) + ' ' + G.ctTime(shipT(), true);
    $('shipFollow').checked = !!state.shipFollow; $('shipForm').hidden = !!state.shipFollow;
    $('showMinor').checked = !!state.showMinor; $('useWind').checked = !!state.useWind;
    $('tempMode').value = state.tempMode; $('tempManual').value = state.tempManualF;
    document.querySelectorAll('#soundAlertSeg button').forEach(function (b) { b.classList.toggle('on', (b.dataset.sound === '1') === !!state.soundAlerts); });
    $('soundAlertInfo').textContent = state.soundAlerts
      ? 'On. Arm once, then liftoff sound and sonic-boom alerts flash the screen, beep, speak, and vibrate.'
      : 'Off. No flash, tone, voice, or vibration for liftoff sound or sonic booms. Sound delays below still update.';
    renderArmInfo();
    document.querySelectorAll('#siteSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.site === state.site); });
    document.querySelectorAll('#targetSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.target === state.target); });
    renderTimeline(); renderLook(); renderAlerts(Date.now());
  }
  var tickN = 0;
  function tick() {
    var now = Date.now(), T0 = t0();
    setClock('clk', now - T0, $('mainClock'));
    setClock('s', now - shipT(), $('shipClock'));
    $('nowLocal').textContent = G.ctTime(now, true);
    $('met').textContent = now >= T0 ? 'T' + G.fmtOffset((now - T0) / 1000) : 'not launched';
    if (state.hold) renderTimeline();
    updateTimelineClasses(now);
    checkAlerts(now);
    if (++tickN % 4 === 0) { renderLook(); }
    if (tickN % 20 === 0) renderAlerts(now);
  }

  // ---------- wiring ----------
  function bind() {
    $('holdBtn').onclick = function () {
      if (state.hold) { state.launchMs += Date.now() - state.hold.start; state.hold = null; } else state.hold = { start: Date.now() };
      save(); evSig = ''; renderAll();
    };
    document.querySelectorAll('[data-shift]').forEach(function (b) { b.onclick = function () { state.launchMs += +b.dataset.shift * 1000; save(); evSig = ''; renderAll(); }; });
    $('editBtn').onclick = function () { $('launchInput').value = G.utcToCtWall(t0()); $('editForm').hidden = false; };
    $('cancelEdit').onclick = function () { $('editForm').hidden = true; };
    $('resetLaunch').onclick = function () { state.launchMs = DEFAULT_T0; state.hold = null; save(); $('editForm').hidden = true; evSig = ''; renderAll(); };
    $('editForm').onsubmit = function (e) {
      e.preventDefault(); var ms = G.ctWallToUtc($('launchInput').value);
      if (isFinite(ms)) { state.launchMs = ms; state.hold = null; save(); $('editForm').hidden = true; evSig = ''; renderAll(); }
    };
    $('shipFollow').onchange = function () {
      state.shipFollow = this.checked; if (!this.checked) { state.shipMs = state.shipMs || shipT(); $('shipInput').value = G.utcToCtWall(state.shipMs); }
      save(); evSig = ''; renderAll();
    };
    $('shipForm').onsubmit = function (e) { e.preventDefault(); var ms = G.ctWallToUtc($('shipInput').value); if (isFinite(ms)) { state.shipMs = ms; save(); evSig = ''; renderAll(); } };
    $('showMinor').onchange = function () { state.showMinor = this.checked; save(); evSig = ''; renderAll(); };
    $('useWind').onchange = function () { state.useWind = this.checked; save(); evSig = ''; renderAll(); };
    $('tempMode').onchange = function () { state.tempMode = this.value; save(); evSig = ''; renderAll(); };
    $('tempManual').oninput = function () { state.tempManualF = parseFloat(this.value); save(); evSig = ''; renderAll(); };
    document.querySelectorAll('#siteSeg button').forEach(function (b) { b.onclick = function () { state.site = b.dataset.site; save(); evSig = ''; renderAll(); }; });
    document.querySelectorAll('#targetSeg button').forEach(function (b) { b.onclick = function () { state.target = b.dataset.target; save(); renderAll(); }; });
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
    var net = function () { var on = navigator.onLine; $('netStatus').textContent = on ? 'ONLINE' : 'OFFLINE'; $('netStatus').className = 'pill ' + (on ? 'on' : 'off'); if (on) fetchWx(); };
    window.addEventListener('online', net); window.addEventListener('offline', net);
    $('netStatus').textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE'; $('netStatus').className = 'pill ' + (navigator.onLine ? 'on' : 'off');
    // tabs
    var links = document.querySelectorAll('#tabs a');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id); }); });
      }, { rootMargin: '-45% 0px -50% 0px' });
      document.querySelectorAll('main > section').forEach(function (s) { io.observe(s); });
    }
  }

  function registerSW() {
    var ok = 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    if (!ok) { $('swStatus').textContent = location.protocol === 'file:' ? 'Opened as a local file: offline mode needs the hosted (https) version.' : ''; return; }
    navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; })
      .then(function () { $('swStatus').textContent = 'Saved for offline use. This page keeps working without signal.'; })
      .catch(function (e) { $('swStatus').textContent = 'Offline mode unavailable: ' + e.message; });
  }

  renderStatic(); bind();
  if (wx) renderWx(!navigator.onLine);
  renderAll(); tick();
  setInterval(tick, 250);
  startGps(); fetchWx(); setInterval(fetchWx, 10 * 60e3);
  registerSW();
  window.SBApp = { state: state, geom: geom, observer: observer, eventTimes: eventTimes, t0: t0, shipT: shipT, fire: fire };
})();
