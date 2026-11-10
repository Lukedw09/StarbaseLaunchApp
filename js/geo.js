/* Pure math helpers: distances, bearings, sound, sun, time zones. No DOM. */
(function (root) {
  'use strict';
  var R = 6371008.8; // mean Earth radius, m
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var TZ = 'America/Chicago';

  function norm360(a) { a = a % 360; return a < 0 ? a + 360 : a; }

  // Great-circle distance in metres (haversine).
  function distance(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * D2R, p2 = lat2 * D2R, dp = (lat2 - lat1) * D2R, dl = (lon2 - lon1) * D2R;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Initial great-circle bearing from point 1 to point 2, degrees clockwise from true north.
  function bearing(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return norm360(Math.atan2(y, x) * R2D);
  }

  var POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function compassPoint(deg) { return POINTS[Math.round(norm360(deg) / 22.5) % 16]; }

  // Speed of sound in dry air, m/s, from temperature in Celsius.
  function speedOfSound(tempC) { return 331.3 * Math.sqrt(1 + tempC / 273.15); }

  // Wind component along the sound path (m/s, + = tailwind helping sound reach you).
  // windFromDeg: meteorological direction the wind blows FROM. pathDeg: bearing from source to you.
  function windAlong(windSpeedMs, windFromDeg, pathDeg) {
    if (!isFinite(windSpeedMs) || !isFinite(windFromDeg)) return 0;
    var windTo = norm360(windFromDeg + 180);
    return windSpeedMs * Math.cos((windTo - pathDeg) * D2R);
  }

  function soundDelay(distM, tempC, windAlongMs) {
    var c = speedOfSound(isFinite(tempC) ? tempC : 20) + (windAlongMs || 0);
    return { seconds: distM / c, speed: c };
  }

  // Apparent elevation angle (deg) of a point heightM tall at distance distM, incl. Earth curvature + refraction (k=0.13).
  function elevationAngle(distM, heightM, eyeM) {
    var drop = distM * distM / (2 * R) * (1 - 0.13);
    return Math.atan2((heightM || 0) - (eyeM || 1.6) - drop, distM) * R2D;
  }

  // Low-precision solar position (NOAA-style), good to ~0.1 deg. Returns {az, el} in degrees.
  function sunPosition(date, lat, lon) {
    var jd = date.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0;
    var L = norm360(280.460 + 0.9856474 * n), g = norm360(357.528 + 0.9856003 * n) * D2R;
    var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
    var eps = (23.439 - 0.0000004 * n) * D2R;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    var gmst = norm360(280.46061837 + 360.98564736629 * n);
    var ha = (norm360(gmst + lon - ra * R2D)) * D2R;
    var phi = lat * D2R;
    var el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
    var az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
    return { az: norm360(az * R2D), el: el * R2D };
  }

  // Sunset (sun centre at -0.833 deg) on the local afternoon of `date`, by bisection.
  function sunsetNear(date, lat, lon) {
    var noon = new Date(date.getTime()); // search 12:00..23:59 local-ish window around given date
    var startMs = ctMidnightUtc(date) + 12 * 3600e3, endMs = startMs + 10 * 3600e3;
    var f = function (ms) { return sunPosition(new Date(ms), lat, lon).el + 0.833; };
    if (f(startMs) < 0 || f(endMs) > 0) return null;
    for (var i = 0; i < 40; i++) { var mid = (startMs + endMs) / 2; if (f(mid) > 0) startMs = mid; else endMs = mid; }
    return new Date((startMs + endMs) / 2);
  }

  // ---- Central Time helpers ----
  var fmtParts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function ctParts(ms) {
    var o = {}; fmtParts.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
  }
  function ctOffsetMs(ms) { var p = ctParts(ms); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; }
  // "2026-11-13T16:45" (Central wall time) -> UTC ms
  function ctWallToUtc(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(str || '');
    if (!m) return NaN;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    var utc = guess - ctOffsetMs(guess);
    return guess - ctOffsetMs(utc);
  }
  function utcToCtWall(ms) {
    var p = ctParts(ms), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return p.y + '-' + z(p.mo) + '-' + z(p.d) + 'T' + z(p.h) + ':' + z(p.mi) + ':' + z(p.s);
  }
  function ctMidnightUtc(date) { var p = ctParts(date.getTime()); return ctWallToUtc(p.y + '-' + String(p.mo).padStart(2, '0') + '-' + String(p.d).padStart(2, '0') + 'T00:00'); }
  function ctAbbrev(ms) {
    var s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' }).format(new Date(ms));
    return (s.split(' ').pop()) || 'CT';
  }
  var fmtTime = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  var fmtTimeShort = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  var fmtDay = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
  function ctTime(ms, withSec) { return (withSec ? fmtTime : fmtTimeShort).format(new Date(ms)) + ' ' + ctAbbrev(ms); }
  function ctDay(ms) { return fmtDay.format(new Date(ms)); }

  // Signed T-clock: returns {sign:'-'|'+', d, h, m, s}
  function tclock(deltaMs) {
    var sign = deltaMs < 0 ? '-' : '+';
    var t = Math.floor(Math.abs(deltaMs) / 1000);
    if (deltaMs < 0) t = Math.ceil(Math.abs(deltaMs) / 1000);
    return { sign: sign, d: Math.floor(t / 86400), h: Math.floor(t % 86400 / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 };
  }
  function fmtOffset(sec) {
    var s = Math.round(Math.abs(sec)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    return (sec < 0 ? '−' : '+') + z(h) + ':' + z(m) + ':' + z(x);
  }

  root.SBGeo = {
    distance: distance, bearing: bearing, compassPoint: compassPoint, norm360: norm360,
    speedOfSound: speedOfSound, windAlong: windAlong, soundDelay: soundDelay, elevationAngle: elevationAngle,
    sunPosition: sunPosition, sunsetNear: sunsetNear,
    ctWallToUtc: ctWallToUtc, utcToCtWall: utcToCtWall, ctTime: ctTime, ctDay: ctDay, ctAbbrev: ctAbbrev,
    tclock: tclock, fmtOffset: fmtOffset, TZ: TZ
  };
})(typeof window !== 'undefined' ? window : globalThis);
