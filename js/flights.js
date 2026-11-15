/* Starship flight list: Launch Library 2 plus hand-written mission files.
 * A mission file wins wherever it sets a field. Omitted fields stay with LL2.
 * No DOM. Used by the page and by node --test. */
(function (root) {
  'use strict';

  var LAUNCH_BEFORE_MS = 48 * 60 * 60 * 1000;
  var LAUNCH_AFTER_MS = 6 * 60 * 60 * 1000;
  var CACHE_TTL_MS = 60 * 60 * 1000;

  var COARSE = { M: 1, MON: 1, MONTH: 1, Q: 1, QUARTER: 1, Y: 1, YEAR: 1, TBC: 1, TBD: 1 };
  var PRECISE = { SEC: 1, SECOND: 1, MIN: 1, MINUTE: 1, HR: 1, H: 1, HOUR: 1, D: 1, DAY: 1 };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function isLaunchWindow(nowMs, t0Ms) {
    if (!isFinite(nowMs) || !isFinite(t0Ms)) return false;
    return nowMs >= t0Ms - LAUNCH_BEFORE_MS && nowMs <= t0Ms + LAUNCH_AFTER_MS;
  }

  function isPrecisePrecision(prec, net) {
    var p = String(prec || '').toUpperCase();
    if (COARSE[p]) return false;
    if (PRECISE[p]) return true;
    if (!net) return false;
    return !/T00:00:00(?:\.0+)?Z$/.test(String(net));
  }

  function flightNumberFromText() {
    for (var i = 0; i < arguments.length; i++) {
      var s = String(arguments[i] || '').replace(/[-_]+/g, ' ');
      var m = /flight\s+(\d+)/i.exec(s);
      if (m) return +m[1];
      m = /integrated flight test\s+(\d+)/i.exec(s);
      if (m) return +m[1];
      if (/integrated flight test\s*$/i.test(s.trim())) return 1;
    }
    return null;
  }

  // ISO-8601 durations used by Launch Library 2 timelines: -PT50M, PT2M19S, PT22H32M34S.
  function parseDuration(iso) {
    if (iso == null || typeof iso !== 'string') return null;
    var sign = 1;
    var t = iso.trim();
    if (t.charAt(0) === '-') { sign = -1; t = t.slice(1); }
    else if (t.charAt(0) === '+') t = t.slice(1);
    var m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(t);
    if (!m || t.charAt(0) !== 'P') return null;
    var sec = (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
    return sign * sec;
  }

  function sentence(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    var cut = s.search(/\.\s|\.$/);
    if (cut === -1) return s.length > 220 ? s.slice(0, 217).trim() + '…' : s;
    return s.slice(0, cut + 1);
  }

  function prettySerial(s, role) {
    if (!s) return '';
    var m = /(?:booster|ship|[bs])\s*(\d+)/i.exec(s);
    if (!m) return String(s);
    var kind = role || (/ship/i.test(s) ? 'ship' : 'booster');
    return (kind === 'ship' ? 'S' : 'B') + m[1];
  }

  function vehicleLine(booster, ship) {
    var b = prettySerial(booster, 'booster');
    var s = prettySerial(ship, 'ship');
    return [b, s].filter(Boolean).join(' · ');
  }

  function timelineToEvents(timeline) {
    var events = [];
    (timeline || []).forEach(function (ev, i) {
      var sec = parseDuration(ev && ev.t);
      if (sec == null || !isFinite(sec)) return;
      events.push({
        id: 'll2-' + i,
        t: sec,
        anchor: 'launch',
        phase: sec < 0 ? 'Countdown' : 'Flight',
        label: (ev.label || ev.abbrev || 'Event'),
        kind: 'll2'
      });
    });
    if (!events.length) {
      events.push({ id: 'liftoff', t: 0, anchor: 'launch', phase: 'Flight', label: 'Liftoff (NET)', kind: 'll2', big: true });
    } else if (!events.some(function (e) { return e.t === 0; })) {
      events.push({ id: 'liftoff', t: 0, anchor: 'launch', phase: 'Flight', label: 'Liftoff', kind: 'll2', big: true });
    }
    events.sort(function (a, b) { return a.t - b.t; });
    return events;
  }

  function trimLaunch(raw) {
    raw = raw || {};
    var rocket = raw.rocket || {};
    var cfg = rocket.configuration || {};
    var stages = rocket.launcher_stage || [];
    var stage = stages[0] || {};
    var launcher = stage.launcher || {};
    var bland = stage.landing || {};
    var sc = rocket.spacecraft_stage || {};
    if (Array.isArray(sc)) sc = sc[0] || {};
    var craft = sc.spacecraft || {};
    var sland = sc.landing || {};
    var mission = raw.mission || {};
    var pad = raw.pad || {};
    var loc = (pad && pad.location) || {};
    var status = raw.status || {};
    var prec = raw.net_precision || {};
    var lsp = raw.launch_service_provider || {};
    var timeline = [];
    (raw.timeline || []).forEach(function (ev) {
      var typ = ev.type || {};
      timeline.push({ t: ev.relative_time, label: typ.description || typ.abbrev || '', abbrev: typ.abbrev || '' });
    });
    var statusAbbrev = typeof status === 'string' ? status : (status.abbrev || '');
    var statusName = typeof status === 'string' ? (raw.statusName || '') : (status.name || '');
    return {
      ll2Id: raw.id || raw.ll2Id || null,
      url: raw.url || '',
      slug: raw.slug || '',
      name: raw.name || '',
      net: raw.net || null,
      netPrecision: prec.abbrev || raw.netPrecision || '',
      netPrecisionDetail: prec.description || raw.netPrecisionDetail || '',
      windowStart: raw.window_start || raw.windowStart || null,
      windowEnd: raw.window_end || raw.windowEnd || null,
      status: statusAbbrev,
      statusName: statusName,
      statusDetail: (typeof status === 'object' && status.description) || raw.statusDetail || '',
      failreason: raw.failreason || '',
      provider: lsp.name || raw.provider || '',
      missionName: mission.name || raw.missionName || '',
      missionDescription: mission.description || raw.missionDescription || '',
      pad: (pad && pad.name) || (typeof raw.pad === 'string' ? raw.pad : '') || '',
      location: loc.name || raw.location || '',
      configuration: cfg.full_name || cfg.name || raw.configuration || '',
      booster: launcher.serial_number || raw.booster || '',
      boosterLanding: bland.description || raw.boosterLanding || '',
      boosterLandingSuccess: bland.success != null ? bland.success : (raw.boosterLandingSuccess != null ? raw.boosterLandingSuccess : null),
      ship: craft.serial_number || craft.name || raw.ship || '',
      shipLanding: sland.description || raw.shipLanding || '',
      shipLandingSuccess: sland.success != null ? sland.success : (raw.shipLandingSuccess != null ? raw.shipLandingSuccess : null),
      timeline: timeline.length ? timeline : (raw.timeline || [])
    };
  }

  function windowMinutesOf(net, windowEnd) {
    if (!net || !windowEnd) return null;
    var w = (Date.parse(windowEnd) - Date.parse(net)) / 60000;
    if (!isFinite(w) || w < 1 || w > 24 * 60) return null;
    return Math.round(w);
  }

  function landingLine(serial, role, success, description) {
    if (!serial) return '';
    var name = prettySerial(serial, role);
    var d = String(description || '').toLowerCase();
    if (success !== false && /caught|returned to (the |its )?launch site|successfully returned/.test(d)) return name + ' caught';
    if (success === true && /splash/.test(d)) return name + ' splashed down';
    if (success === true) return name + ' landing succeeded';
    if (success === false) return name + ' lost';
    if (/no landing/.test(d)) return name + ' not recovered';
    return '';
  }

  function outcomeOf(t) {
    var parts = [];
    if (t.statusName) parts.push(String(t.statusName).replace(/\.$/, ''));
    var b = landingLine(t.booster, 'booster', t.boosterLandingSuccess, t.boosterLanding);
    var s = landingLine(t.ship, 'ship', t.shipLandingSuccess, t.shipLanding);
    if (b) parts.push(b);
    if (s) parts.push(s);
    var fail = sentence(t.failreason);
    if (fail && parts.join(' ').indexOf(fail.slice(0, 40)) === -1) parts.push(fail.replace(/\.$/, ''));
    if (!parts.length) return '';
    return parts.join('. ') + '.';
  }

  function decorate(trimmed) {
    trimmed = trimmed || {};
    var netMs = trimmed.net ? Date.parse(trimmed.net) : NaN;
    var flightNumber = trimmed.flightNumber != null ? trimmed.flightNumber : flightNumberFromText(trimmed.name, trimmed.missionName, trimmed.slug);
    var events = Array.isArray(trimmed.events) && trimmed.events.length && trimmed.events[0].t != null && trimmed.events[0].kind
      ? trimmed.events
      : timelineToEvents(trimmed.timeline);
    return {
      ll2Id: trimmed.ll2Id || null,
      url: trimmed.url || '',
      slug: trimmed.slug || '',
      name: trimmed.name || trimmed.missionName || 'Starship',
      flightNumber: flightNumber,
      net: trimmed.net || null,
      netMs: isFinite(netMs) ? netMs : NaN,
      netPrecision: trimmed.netPrecision || '',
      netPrecisionDetail: trimmed.netPrecisionDetail || '',
      windowStart: trimmed.windowStart || null,
      windowEnd: trimmed.windowEnd || null,
      windowMinutes: trimmed.windowMinutes != null ? trimmed.windowMinutes : windowMinutesOf(trimmed.net, trimmed.windowEnd),
      status: trimmed.status || '',
      statusName: trimmed.statusName || '',
      statusDetail: trimmed.statusDetail || '',
      outcome: trimmed.outcome || outcomeOf(trimmed),
      failreason: trimmed.failreason || '',
      provider: trimmed.provider || '',
      vehicles: trimmed.vehicles || vehicleLine(trimmed.booster, trimmed.ship),
      booster: trimmed.booster || '',
      ship: trimmed.ship || '',
      missionName: trimmed.missionName || '',
      missionDescription: trimmed.missionDescription || '',
      pad: trimmed.pad || '',
      location: trimmed.location || '',
      configuration: trimmed.configuration || '',
      events: events,
      id: trimmed.id || trimmed.slug || trimmed.ll2Id || (flightNumber ? 'flight-' + flightNumber : ''),
      manual: !!trimmed.manual,
      archived: !!trimmed.archived,
      launched: !!trimmed.launched,
      complete: !!trimmed.complete,
      shipCatchOffsetSec: trimmed.shipCatchOffsetSec != null ? trimmed.shipCatchOffsetSec : null,
      catchNote: trimmed.catchNote || '',
      sources: trimmed.sources || null
    };
  }

  // Keys present on the mission file replace LL2, including null and "".
  // Omitted keys keep the LL2 value. `events`, when present, replaces the timeline.
  function mergeFlight(ll2, manual) {
    var out = Object.assign({}, ll2 || {});
    if (manual) {
      Object.keys(manual).forEach(function (k) {
        if (manual[k] !== undefined) out[k] = manual[k];
      });
      out.manual = true;
      if (manual.archived) out.archived = true;
    }
    if (out.net) {
      var ms = Date.parse(out.net);
      if (isFinite(ms)) out.netMs = ms;
    }
    if (out.flightNumber == null) out.flightNumber = flightNumberFromText(out.name, out.missionName, out.slug);
    if (!out.id) out.id = (manual && manual.id) || out.slug || out.ll2Id || (out.flightNumber ? 'flight-' + out.flightNumber : '');
    if (!out.events) out.events = [];
    return out;
  }

  function matchIndex(ll2, manuals, used) {
    var keys = ['ll2Id', 'slug', 'flightNumber'];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (ll2[key] == null || ll2[key] === '') continue;
      for (var j = 0; j < manuals.length; j++) {
        if (used[j]) continue;
        if (manuals[j] && manuals[j][key] != null && manuals[j][key] === ll2[key]) return j;
      }
    }
    return -1;
  }

  function mergeCatalog(normalized, manuals) {
    manuals = manuals || [];
    var used = {};
    var out = [];
    (normalized || []).forEach(function (ll2) {
      var j = matchIndex(ll2, manuals, used);
      if (j >= 0) used[j] = true;
      out.push(mergeFlight(ll2, j >= 0 ? manuals[j] : null));
    });
    manuals.forEach(function (m, j) {
      if (!used[j]) out.push(mergeFlight(decorate({}), m));
    });
    return out;
  }

  function normalizeLaunch(item) {
    if (!item) return decorate({});
    if (item.rocket || item.net_precision || (item.status && typeof item.status === 'object')) return decorate(trimLaunch(item));
    return decorate(item);
  }

  function buildCatalog(launches, manuals) {
    var norm = (launches || []).map(normalizeLaunch);
    return mergeCatalog(norm, manuals || []);
  }

  function selectLaunchDayFlight(flights, nowMs) {
    var hits = (flights || []).filter(function (f) {
      return isFinite(f.netMs) && isPrecisePrecision(f.netPrecision, f.net) && isLaunchWindow(nowMs, f.netMs);
    });
    hits.sort(function (a, b) {
      var aAfter = nowMs >= a.netMs ? 0 : 1;
      var bAfter = nowMs >= b.netMs ? 0 : 1;
      if (aAfter !== bAfter) return aAfter - bAfter;
      return Math.abs(nowMs - a.netMs) - Math.abs(nowMs - b.netMs);
    });
    return hits[0] || null;
  }

  function selectNextFlight(flights, nowMs) {
    var list = (flights || []).filter(function (f) {
      return isFinite(f.netMs) && f.netMs > nowMs && !f.complete;
    });
    list.sort(function (a, b) { return a.netMs - b.netMs; });
    return list[0] || null;
  }

  function selectPreviewFlight(flights, nowMs) {
    var live = selectLaunchDayFlight(flights, nowMs);
    if (live) return live;
    var next = selectNextFlight(flights, nowMs);
    if (next && isPrecisePrecision(next.netPrecision, next.net)) return next;
    var manual = (flights || []).filter(function (f) {
      return f.manual && (f.events || []).some(function (e) { return e.kind && e.kind !== 'll2'; });
    });
    manual.sort(function (a, b) { return (b.netMs || 0) - (a.netMs || 0); });
    if (manual.length) return manual[0];
    var past = (flights || []).filter(function (f) { return isFinite(f.netMs) && f.netMs <= nowMs; });
    past.sort(function (a, b) { return b.netMs - a.netMs; });
    return past[0] || next || null;
  }

  function decideMode(queryMode, flights, nowMs) {
    var q = String(queryMode || '').toLowerCase();
    var live = selectLaunchDayFlight(flights, nowMs);
    if (q === 'hub') return { mode: 'hub', flight: null, preview: false };
    if (q === 'launch') {
      return { mode: 'launch', flight: live || selectPreviewFlight(flights, nowMs), preview: !live };
    }
    if (live) return { mode: 'launch', flight: live, preview: false };
    return { mode: 'hub', flight: null, preview: false };
  }

  function coarseNetLabel(f) {
    if (!f || !f.net || isPrecisePrecision(f.netPrecision, f.net)) return null;
    var d = new Date(f.net);
    if (!isFinite(d.getTime())) return null;
    var p = String(f.netPrecision || '').toUpperCase();
    if (p === 'Y' || p === 'YEAR') return 'NET ' + d.getUTCFullYear();
    if (p === 'Q' || p === 'QUARTER') return 'NET Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + ' ' + d.getUTCFullYear();
    if (p === 'M' || p === 'MON' || p === 'MONTH' || COARSE[p] || !p) return 'NET ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    return 'NET ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function cacheFresh(entry, nowMs) {
    if (!entry || !isFinite(entry.at) || !Array.isArray(entry.launches)) return false;
    var age = nowMs - entry.at;
    return age >= 0 && age < CACHE_TTL_MS;
  }

  // network === null means the request failed. A fresh cache wins. A failed
  // request falls through to a stale cache, then the bundled file.
  function resolveLaunches(opts) {
    opts = opts || {};
    if (cacheFresh(opts.cache, opts.now)) return { launches: opts.cache.launches, source: 'cache' };
    if (Array.isArray(opts.network) && opts.network.length) return { launches: opts.network, source: 'network' };
    if (opts.cache && Array.isArray(opts.cache.launches) && opts.cache.launches.length) return { launches: opts.cache.launches, source: 'cache' };
    if (Array.isArray(opts.fallback)) return { launches: opts.fallback, source: 'fallback' };
    return { launches: [], source: 'fallback' };
  }

  var api = {
    LAUNCH_BEFORE_MS: LAUNCH_BEFORE_MS,
    LAUNCH_AFTER_MS: LAUNCH_AFTER_MS,
    CACHE_TTL_MS: CACHE_TTL_MS,
    inLaunchWindow: isLaunchWindow,
    isPrecisePrecision: isPrecisePrecision,
    flightNumberFromText: flightNumberFromText,
    parseDuration: parseDuration,
    prettySerial: prettySerial,
    trimLaunch: trimLaunch,
    decorate: decorate,
    mergeFlight: mergeFlight,
    mergeCatalog: mergeCatalog,
    buildCatalog: buildCatalog,
    selectLaunchDayFlight: selectLaunchDayFlight,
    selectNextFlight: selectNextFlight,
    selectPreviewFlight: selectPreviewFlight,
    decideMode: decideMode,
    coarseNetLabel: coarseNetLabel,
    cacheFresh: cacheFresh,
    resolveLaunches: resolveLaunches
  };

  root.SBFlights = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
