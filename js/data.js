/* StarbaseLaunchApp mission data.
 * Every number here comes from a public source listed in SOURCES, or is
 * marked kind:'estimate' / kind:'computed' and labelled as such in the UI. */
(function (root) {
  'use strict';

  var SOURCES = {
    spacex: { name: 'SpaceX Flight 15 mission page (timeline "All Times Approximate")', url: 'https://www.spacex.com/launches/starship-flight-15' },
    ll2: { name: 'Launch Library 2: Orbital Launch Pad 2 (pad 235)', url: 'https://ll.thespacedevs.com/2.2.0/pad/235/' },
    osm: { name: 'Pad 2 tower position, OSM-traced (Starship Catch Simulator site notes)', url: 'https://dionismuzenitov.github.io/starship-catch-sim/docs/kb/starbase-catch-site-pad-a-b-dimensions-and-catch-history' },
    visit: { name: 'Visit Starbase: Rocket Ranch Boca Chica viewing spot', url: 'https://visit-starbase.com/watch/rocket-ranch' },
    rr: { name: 'Rocket Ranch FAQ', url: 'https://rocketranchstarbase.com/faq/' },
    camp: { name: 'Campendium: Rocket Ranch Boca Chica', url: 'https://maps.campendium.com/us/brownsville-tx/camping-rv/rocket-ranch-boca-chica' },
    nominatim: { name: 'OpenStreetMap Nominatim: Port Isabel, TX', url: 'https://nominatim.openstreetmap.org/search?q=Port+Isabel,+Texas&format=json' },
    krgv: { name: 'KRGV: sonic booms possible during both returns', url: 'https://www.krgv.com/news/spacex-sets-target-date-for-15th-starship-launch-at-starbase' },
    meteo: { name: 'Open-Meteo forecast API', url: 'https://open-meteo.com/' },
    catchUpd: { name: 'SpaceX: first planned Starship catch, tower at Pad 2', url: 'https://www.spacex.com/updates/starship-catch' },
    flight11: { name: 'SpaceX: Flight 11, final launch from the previous Pad 1 configuration', url: 'https://www.spacex.com/launches/starship-flight-11' },
    spacecom: { name: 'Space.com live blog: FAA license granted for Flight 15, Nov 13 2026', url: 'https://www.space.com/news/live/spacex-starship-flight-15-live-updates-nov-13-2026-starship-first-double-landing-attempt' }
  };

  var MISSION = {
    name: 'Starship Flight 15',
    vehicles: 'Super Heavy B22 · Ship S42',
    pad: 'Orbital Launch Pad 2 · Starbase, TX',
    // Window opens 4:45 PM CST Fri Nov 13 2026 = 22:45 UTC (SpaceX page).
    launchUtcDefault: '2026-11-13T22:45:00Z',
    windowMinutes: 75,
    // SpaceX's own Flight 15 page still says pending regulatory approval.
    // Space.com reported the FAA license on the afternoon of Fri Nov 13, 2026. Liftoff is still the 4:45 PM CT window.
    status: 'NET · FAA license granted (per Space.com)',
    shipCatchOffsetSec: 22 * 3600 + 32 * 60 + 34, // T+22:32:34 (SpaceX timeline)
    // Flight 15 timeline: booster "landing burn shutdown and catch" at 00:06:35, ship at 22:32:34.
    // Both are a return to the launch site. The catch update sends the ship to the tower at Pad 2.
    // Flight 11 was the final launch from Pad 1's previous configuration; that pad is under reconstruction.
    catchNote: 'Both the booster catch (about T+6:35) and the ship catch (T+22:32:34) are at the same Pad 2 tower. Pad 1 is under reconstruction.'
  };

  // Places. kind: 'target' (things to look at) or 'site' (where you stand).
  var PLACES = {
    pad:   { id: 'pad',   name: 'Launch mount (Pad 2)', short: 'MOUNT', lat: 25.996603, lon: -97.158251, heightM: 0, src: 'll2' },
    tower: { id: 'tower', name: 'Catch tower (Pad 2)',  short: 'TOWER', lat: 25.99705,  lon: -97.15807,  heightM: 144.5, src: 'osm',
             note: 'Same tower for the booster catch and the ship catch. It stands about 50 m north of the mount. Position traced from OpenStreetMap, good to a few tens of metres.' },
    outpost:    { id: 'outpost',    name: 'Rocket Ranch Outpost (launch viewing)', lat: 25.96159,   lon: -97.20539,   src: 'visit' },
    campground: { id: 'campground', name: 'Rocket Ranch Campground (check-in)',    lat: 25.947229,  lon: -97.279813,  src: 'camp' },
    portisabel: { id: 'portisabel', name: 'Port Isabel (town centre)',             lat: 26.0734119, lon: -97.2085844, src: 'nominatim' }
  };

  // anchor: 'launch' = seconds from liftoff; 'ship' = seconds relative to the ship catch time.
  // kind: 'spacex' (official, approximate), 'computed' (from your distance), 'estimate'.
  // alert: fires an on-screen / vibration / beep alert.
  var EVENTS = [
    { id: 'poll',   t: -3000, anchor: 'launch', phase: 'Countdown', label: 'GO for propellant load', kind: 'spacex',
      see: 'Flight director poll. Venting usually starts soon after: white vapour clouds around the stack.' },
    { id: 'blox',   t: -2133, anchor: 'launch', phase: 'Countdown', label: 'Booster LOX load underway', kind: 'spacex',
      see: 'Frost and vapour spread over the booster as it fills with super-cold propellant.' },
    { id: 'bch4',   t: -2130, anchor: 'launch', phase: 'Countdown', label: 'Booster fuel (methane) load underway', kind: 'spacex', minor: true, see: '' },
    { id: 'slox',   t: -2112, anchor: 'launch', phase: 'Countdown', label: 'Ship LOX load underway', kind: 'spacex', minor: true, see: '' },
    { id: 'sch4',   t: -2111, anchor: 'launch', phase: 'Countdown', label: 'Ship fuel load underway', kind: 'spacex', minor: true, see: 'Both stages are now loading. Venting from the ship too.' },
    { id: 'chill',  t: -1300, anchor: 'launch', phase: 'Countdown', label: 'Raptor engine chill (booster + ship)', kind: 'spacex',
      see: 'More venting around the engine section at the bottom of the booster.' },
    { id: 'bdone',  t: -170,  anchor: 'launch', phase: 'Countdown', label: 'Booster propellant load complete', kind: 'spacex', see: 'Earplugs in now.' },
    { id: 'sdone',  t: -130,  anchor: 'launch', phase: 'Countdown', label: 'Ship propellant load complete', kind: 'spacex', see: '' },
    { id: 'go',     t: -30,   anchor: 'launch', phase: 'Countdown', label: 'Flight director verifies GO for launch', kind: 'spacex', see: 'Last 30 seconds. Eyes on the pad.' },
    { id: 'deluge', t: -17,   anchor: 'launch', phase: 'Countdown', label: 'Flame diverter activation', kind: 'spacex',
      see: 'Water starts flowing through the flame diverter under the mount. You may see spray at the base.' },
    { id: 'start',  t: -3,    anchor: 'launch', phase: 'Countdown', label: 'Booster engine startup', kind: 'spacex',
      see: 'A bright flash and a billowing cloud at the base. No sound yet.' },

    { id: 'liftoff', t: 0, anchor: 'launch', phase: 'Ascent & booster return', label: 'LIFTOFF', kind: 'spacex', big: true,
      see: 'The rocket climbs in silence at first. The sound is still on its way to you.' },
    { id: 'snd_liftoff', t: 0, anchor: 'launch', soundFrom: 'pad', phase: 'Ascent & booster return', label: 'Liftoff sound arrives', kind: 'computed', alert: true,
      see: 'A deep, crackling roar arrives and keeps rolling for a minute or more. You may feel it in your chest.' },
    { id: 'maxq', t: 58, anchor: 'launch', phase: 'Ascent & booster return', label: 'Max Q', kind: 'spacex',
      see: 'Peak aerodynamic stress. The rocket is climbing out over the Gulf to the east.' },
    { id: 'meco', t: 139, anchor: 'launch', phase: 'Ascent & booster return', label: 'Super Heavy MECO', kind: 'spacex',
      see: 'Most booster engines shut down. It is now a bright point high in the east.' },
    { id: 'hotstage', t: 141, anchor: 'launch', phase: 'Ascent & booster return', label: 'Hot staging', kind: 'spacex', big: true,
      see: 'Ship engines light while still attached to the booster. With clear skies you may see a flash and the two stages split. Binoculars help.' },
    { id: 'bb', t: 146, anchor: 'launch', phase: 'Ascent & booster return', label: 'Boostback burn start', kind: 'spacex',
      see: 'The booster flips and fires back toward Starbase. If liftoff slips past sunset, a sunlit plume against a darker sky is possible.' },
    { id: 'bbend', t: 182, anchor: 'launch', phase: 'Ascent & booster return', label: 'Boostback burn shutdown', kind: 'spacex',
      see: 'Booster is now falling back toward the tower, unpowered.' },
    { id: 'boom_b', t: 345, anchor: 'launch', phase: 'Ascent & booster return', label: 'Sonic booms possible (booster return)', kind: 'estimate', alert: true,
      see: 'Super Heavy comes home faster than sound, so expect one or more sharp booms in roughly the next minute. Timing is an estimate, not from SpaceX.' },
    { id: 'blb', t: 370, anchor: 'launch', phase: 'Ascent & booster return', label: 'Booster landing burn start', kind: 'spacex', big: true,
      see: 'Look at the tower, low on the horizon. Engines relight as a bright light dropping onto the tower.' },
    { id: 'bcatch', t: 395, anchor: 'launch', phase: 'Ascent & booster return', label: 'BOOSTER CATCH', kind: 'spacex', big: true,
      see: 'Landing burn shutdown and catch by the Pad 2 tower chopsticks. The ship comes back to this same tower.' },
    { id: 'snd_bcatch', t: 370, anchor: 'launch', soundFrom: 'tower', phase: 'Ascent & booster return', label: 'Landing-burn sound arrives', kind: 'computed', alert: true,
      see: 'The landing-burn roar reaches you after you see it, so the catch looks quiet at first.' },
    { id: 'seco', t: 489, anchor: 'launch', phase: 'Ship to orbit', label: 'Starship engine cutoff', kind: 'spacex', webcast: true,
      see: 'The ship is far downrange. Follow it on the webcast.' },
    { id: 'oib', t: 1570, anchor: 'launch', phase: 'Ship to orbit', label: 'Orbital insertion burn start', kind: 'spacex', webcast: true, see: '' },
    { id: 'oibend', t: 1590, anchor: 'launch', phase: 'Ship to orbit', label: 'Orbital insertion burn shutdown', kind: 'spacex', webcast: true, see: 'Ship in orbit at about 275 km.' },
    { id: 'pd', t: 2101, anchor: 'launch', phase: 'On orbit', label: 'Payload deploy start', kind: 'spacex', webcast: true, see: '26 Starlink V3 satellites.' },
    { id: 'pdend', t: 4660, anchor: 'launch', phase: 'On orbit', label: 'Payload deploy complete', kind: 'spacex', webcast: true, see: '' },
    { id: 'hi1', t: 5266, anchor: 'launch', phase: 'On orbit', label: 'Early Hawaii return check', kind: 'spacex', webcast: true, see: 'First chance to bring the ship down early over the ocean.' },
    { id: 'chile', t: 26135, anchor: 'launch', phase: 'On orbit', label: 'Mid Chile return check', kind: 'spacex', webcast: true, see: '' },
    { id: 'hi2', t: 74515, anchor: 'launch', phase: 'On orbit', label: 'Final Hawaii return check', kind: 'spacex', webcast: true, see: 'Last early-return option before the planned deorbit.' },

    // Ship return: SpaceX times expressed relative to catch (T+22:32:34) so they move with the ship-catch clock.
    { id: 'deorbit', t: 77757 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Deorbit burn start', kind: 'spacex', webcast: true, see: 'Committed to come home if the team is GO.' },
    { id: 'deorbitend', t: 77767 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Deorbit burn shutdown', kind: 'spacex', webcast: true, see: '' },
    { id: 'entry', t: 79846 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Starship entry', kind: 'spacex', webcast: true,
      see: 'Plasma views on the webcast. SpaceX describes a glide toward Starbase from the Pacific side. The exact ground track is not published here.' },
    { id: 'boom_s', t: 80954 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Sonic boom possible (ship return)', kind: 'estimate', alert: true,
      see: 'Ship is slowing through the speed of sound near Starbase. A boom is possible around now. Timing is an estimate.' },
    { id: 'transonic', t: 80974 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Starship transonic', kind: 'spacex',
      see: 'Scan the sky above and around the tower for a falling dot, belly first.' },
    { id: 'subsonic', t: 81013 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Starship subsonic', kind: 'spacex', see: '' },
    { id: 'slb', t: 81136 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Ship landing burn start', kind: 'spacex', big: true,
      see: 'Engines light just above the tower.' },
    { id: 'flip', t: 81138 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Landing flip', kind: 'spacex', big: true,
      see: 'The ship swings from belly-first to upright. This is the big moment to watch.' },
    { id: 's32', t: 81146 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Landing burn 3 → 2 engines', kind: 'spacex', minor: true, see: '' },
    { id: 's21', t: 81153 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Landing burn 2 → 1 engine', kind: 'spacex', minor: true, see: '' },
    { id: 'scatch', t: 0, anchor: 'ship', phase: 'Ship return & catch', label: 'SHIP CATCH', kind: 'spacex', big: true,
      see: 'Landing burn shutdown and catch at the same Pad 2 tower as the booster, if all goes to plan.' },
    { id: 'snd_scatch', t: 81136 - 81154, anchor: 'ship', soundFrom: 'tower', phase: 'Ship return & catch', label: 'Ship landing-burn sound arrives', kind: 'computed', alert: true,
      see: 'The roar of the ship landing burn arrives after you see it.' }
  ];

  root.SB_DATA = { SOURCES: SOURCES, MISSION: MISSION, PLACES: PLACES, EVENTS: EVENTS };
})(typeof window !== 'undefined' ? window : globalThis);
