'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const F = require('../js/flights.js');
const flight15 = require('../data/missions/flight-15.json');

const HOUR = 60 * 60 * 1000;

test('launch-day window is 48 hours before T-0 through 6 hours after', function () {
  assert.equal(F.LAUNCH_BEFORE_MS, 48 * HOUR);
  assert.equal(F.LAUNCH_AFTER_MS, 6 * HOUR);
  const t0 = Date.parse('2026-11-13T22:47:00Z');
  assert.equal(F.inLaunchWindow(t0 - 48 * HOUR, t0), true);
  assert.equal(F.inLaunchWindow(t0 - 48 * HOUR - 1, t0), false);
  assert.equal(F.inLaunchWindow(t0, t0), true);
  assert.equal(F.inLaunchWindow(t0 + 6 * HOUR, t0), true);
  assert.equal(F.inLaunchWindow(t0 + 6 * HOUR + 1, t0), false);
  assert.equal(F.inLaunchWindow(t0 - 47 * HOUR, t0), true);
  assert.equal(F.inLaunchWindow(NaN, t0), false);
});

test('a month-level placeholder does not open launch-day mode', function () {
  const coarse = F.decorate({
    name: 'Starship | SpaceX HLS LEO Demo',
    net: '2027-06-30T00:00:00Z',
    netPrecision: 'M',
    status: 'TBD',
    statusName: 'To Be Determined'
  });
  const now = Date.parse('2027-06-29T12:00:00Z');
  assert.equal(F.isPrecisePrecision('M', coarse.net), false);
  assert.equal(F.inLaunchWindow(now, coarse.netMs), true);
  assert.equal(F.selectLaunchDayFlight([coarse], now), null);
  assert.equal(F.coarseNetLabel(coarse), 'NET June 2027');
  assert.equal(F.decideMode('', [coarse], now).mode, 'hub');
});

test('day-or-better precision selects the flight inside the window', function () {
  const t0 = Date.parse('2026-12-10T18:00:00Z');
  const soon = F.decorate({
    id: 'flight-16',
    flightNumber: 16,
    name: 'Starship Flight 16',
    net: '2026-12-10T18:00:00Z',
    netPrecision: 'SEC',
    vehicles: 'B23 · S43'
  });
  const later = F.decorate({
    id: 'flight-17',
    flightNumber: 17,
    name: 'Starship Flight 17',
    net: '2026-12-12T16:00:00Z',
    netPrecision: 'D'
  });
  const picked = F.selectLaunchDayFlight([later, soon], t0 - 2 * HOUR);
  assert.equal(picked.id, 'flight-16');
  assert.equal(F.decideMode('', [later, soon], t0 - 2 * HOUR).mode, 'launch');
  assert.equal(F.decideMode('hub', [later, soon], t0 - 2 * HOUR).mode, 'hub');
});

test('overlapping windows prefer the flight that has already launched', function () {
  const launched = F.decorate({
    id: 'a', flightNumber: 20, name: 'Starship Flight 20',
    net: '2027-01-01T18:00:00Z', netPrecision: 'MIN'
  });
  const upcoming = F.decorate({
    id: 'b', flightNumber: 21, name: 'Starship Flight 21',
    net: '2027-01-03T16:00:00Z', netPrecision: 'MIN'
  });
  const now = Date.parse('2027-01-01T20:00:00Z');
  assert.equal(F.selectLaunchDayFlight([upcoming, launched], now).id, 'a');
});

test('manual mission fields override LL2 and omitted fields stay', function () {
  const ll2 = F.decorate(F.trimLaunch({
    id: 'abc',
    slug: 'starship-flight-16',
    name: 'Starship | Flight 16',
    net: '2026-12-10T18:00:00Z',
    net_precision: { abbrev: 'SEC', description: 'The T-0 is accurate to the second.' },
    status: { abbrev: 'Go', name: 'Go for Launch', description: 'Still targeted.' },
    window_start: '2026-12-10T18:00:00Z',
    window_end: '2026-12-10T19:00:00Z',
    launch_service_provider: { name: 'SpaceX' },
    mission: { name: 'Flight 16', description: 'Sixteenth flight.' },
    pad: { name: 'Orbital Launch Pad 2', location: { name: 'SpaceX Starbase, TX, USA' } },
    rocket: {
      configuration: { full_name: 'Starship V3' },
      launcher_stage: [{ launcher: { serial_number: 'Booster 23' }, landing: { description: 'Planned catch.', success: null } }],
      spacecraft_stage: { spacecraft: { serial_number: 'S43', name: 'Ship 43' }, landing: {} }
    },
    timeline: [{ relative_time: '-PT50M', type: { abbrev: 'GO', description: 'GO for propellant load' } }]
  }));
  assert.equal(ll2.flightNumber, 16);
  assert.equal(ll2.vehicles, 'B23 · S43');
  assert.equal(ll2.provider, 'SpaceX');
  assert.ok(ll2.events.some(function (e) { return e.kind === 'll2' && e.label === 'GO for propellant load'; }));

  const merged = F.mergeFlight(ll2, {
    id: 'flight-16',
    flightNumber: 16,
    ll2Id: 'abc',
    name: 'Starship Flight 16',
    net: '2026-12-10T20:15:00Z',
    vehicles: 'B23 · S43',
    outcome: 'NET, vehicles assigned in the mission file.',
    events: [{ id: 'snd_liftoff', t: 0, anchor: 'launch', kind: 'computed', label: 'Liftoff sound arrives' }]
  });
  assert.equal(merged.name, 'Starship Flight 16');
  assert.equal(merged.net, '2026-12-10T20:15:00Z');
  assert.equal(merged.netMs, Date.parse('2026-12-10T20:15:00Z'));
  assert.equal(merged.vehicles, 'B23 · S43');
  assert.equal(merged.outcome, 'NET, vehicles assigned in the mission file.');
  assert.equal(merged.events.length, 1);
  assert.equal(merged.events[0].kind, 'computed');
  assert.equal(merged.statusName, 'Go for Launch');
  assert.equal(merged.missionDescription, 'Sixteenth flight.');
  assert.equal(merged.provider, 'SpaceX');
  assert.equal(merged.manual, true);

  const cleared = F.mergeFlight(ll2, { flightNumber: 16, outcome: null, vehicles: '' });
  assert.equal(cleared.outcome, null);
  assert.equal(cleared.vehicles, '');
  assert.equal(cleared.statusName, 'Go for Launch');

  const shifted = Date.parse('2026-12-11T01:00:00Z');
  assert.equal(F.inLaunchWindow(shifted, merged.netMs), true);
  assert.equal(F.inLaunchWindow(shifted, ll2.netMs), false);
  assert.equal(F.selectLaunchDayFlight([merged], shifted).id, 'flight-16');
});

test('catalog matches on flight number and keeps an unmatched mission file', function () {
  const raw15 = {
    id: '0f867f0c-5422-4d44-93b8-d7faaae7019b',
    slug: 'starship-flight-15',
    name: 'Starship | Starlink Group 31-2 (Starship Flight 15)',
    net: '2026-11-30T00:00:00Z',
    net_precision: { abbrev: 'M', description: 'The T-0 is expected in the given month.' },
    status: { abbrev: 'TBD', name: 'To Be Determined' },
    mission: { name: 'Flight 15', description: 'Stale LL2 description that should survive.' },
    rocket: {
      launcher_stage: [{ launcher: { serial_number: 'Booster 22' }, landing: { description: 'Diverted offshore.', success: false } }],
      spacecraft_stage: { spacecraft: { serial_number: 'S42' }, landing: { description: 'Caught.', success: true } }
    },
    timeline: [{ relative_time: '-PT50M', type: { description: 'GO for propellant load' } }]
  };
  const raw14 = {
    id: 'flight-14-id',
    slug: 'starship-flight-14',
    name: 'Starship | Flight 14',
    net: '2026-09-28T12:48:59Z',
    net_precision: { abbrev: 'SEC' },
    status: { abbrev: 'Success', name: 'Launch Successful' },
    rocket: {
      launcher_stage: [{ launcher: { serial_number: 'Booster 21' }, landing: {} }],
      spacecraft_stage: { spacecraft: { serial_number: 'S41' }, landing: {} }
    },
    timeline: []
  };
  const extra = {
    id: 'flight-16',
    flightNumber: 16,
    name: 'Starship Flight 16',
    net: '2026-12-10T18:00:00Z',
    netPrecision: 'SEC',
    vehicles: 'B23 · S43',
    outcome: 'Not listed by Launch Library 2 yet.'
  };
  const cat = F.buildCatalog([raw15, raw14], [flight15, extra]);
  const f15 = cat.find(function (f) { return f.flightNumber === 15; });
  const f14 = cat.find(function (f) { return f.flightNumber === 14; });
  const f16 = cat.find(function (f) { return f.flightNumber === 16; });
  assert.ok(f15);
  assert.equal(f15.net, '2026-11-13T22:47:00Z');
  assert.equal(f15.vehicles, 'Super Heavy B22 · Ship S42');
  assert.equal(f15.archived, true);
  assert.equal(f15.id, 'flight-15');
  assert.equal(f15.missionDescription, 'Stale LL2 description that should survive.');
  assert.ok(f15.events.some(function (e) { return e.kind === 'computed' && e.id === 'snd_liftoff'; }));
  assert.ok(f15.events.some(function (e) { return e.kind === 'estimate'; }));
  assert.equal(f15.events.some(function (e) { return e.kind === 'll2'; }), false);
  assert.equal(f14.vehicles, 'B21 · S41');
  assert.equal(f14.manual, false);
  assert.equal(f16.outcome, 'Not listed by Launch Library 2 yet.');
  assert.equal(f16.manual, true);

  const now = Date.parse('2026-11-15T20:00:00Z');
  assert.equal(F.selectNextFlight(cat, now).flightNumber, 16);
  assert.equal(F.selectPreviewFlight(cat, now).id, 'flight-16');
  const without16 = cat.filter(function (f) { return f.flightNumber !== 16; });
  assert.equal(F.selectPreviewFlight(without16, now).id, 'flight-15');
  assert.equal(F.decideMode('launch', without16, now).preview, true);
  assert.equal(F.decideMode('launch', without16, now).flight.id, 'flight-15');
});

test('LL2 cache is kept for at least one hour and failures fall back quietly', function () {
  assert.equal(F.CACHE_TTL_MS, HOUR);
  const launches = [{ ll2Id: '1', name: 'Starship | Flight 14' }];
  const fresh = { at: 1_000_000, launches: launches };
  assert.equal(F.cacheFresh(fresh, fresh.at + HOUR - 1), true);
  assert.equal(F.cacheFresh(fresh, fresh.at + HOUR), false);
  assert.deepEqual(
    F.resolveLaunches({ now: fresh.at + 10 * 60 * 1000, cache: fresh, network: [{ ll2Id: 'new' }], fallback: [] }),
    { launches: launches, source: 'cache' }
  );
  const stale = { at: 0, launches: launches };
  assert.deepEqual(
    F.resolveLaunches({ now: HOUR + 5, cache: stale, network: null, fallback: [{ ll2Id: 'bundled' }] }),
    { launches: launches, source: 'cache' }
  );
  assert.deepEqual(
    F.resolveLaunches({ now: HOUR + 5, cache: null, network: null, fallback: [{ ll2Id: 'bundled' }] }),
    { launches: [{ ll2Id: 'bundled' }], source: 'fallback' }
  );
  assert.equal(F.resolveLaunches({ now: 0, cache: null, network: [], fallback: [] }).source, 'fallback');
});

test('Launch Library 2 timeline offsets parse to seconds', function () {
  assert.equal(F.parseDuration('-PT50M'), -3000);
  assert.equal(F.parseDuration('-PT35M33S'), -(35 * 60 + 33));
  assert.equal(F.parseDuration('PT2M19S'), 2 * 60 + 19);
  assert.equal(F.parseDuration('PT22H32M34S'), 22 * 3600 + 32 * 60 + 34);
  assert.equal(F.parseDuration('nope'), null);
});
