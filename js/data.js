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
    spacecom: { name: 'Space.com live blog: FAA license granted for Flight 15, Nov 13 2026', url: 'https://www.space.com/news/live/spacex-starship-flight-15-live-updates-nov-13-2026-starship-first-double-landing-attempt' },
    spacecomFlight: { name: 'Space.com: Flight 15 liftoff 22:47 UTC, booster catch aborted, ship catch still planned', url: 'https://www.space.com/space-exploration/launches-spacecraft/spacex-starship-flight-15-chopsticks-double-catch-super-heavy-ship' },
    nbc: { name: 'NBC News: Flight 15 launch, booster recovery aborted', url: 'https://www.nbcnews.com/science/space/spacex-launches-15th-starship-flight-aborts-booster-recovery-maneuver-rcna609274' },
    krgvFlight: { name: 'KRGV: booster splashdown in the Gulf, ship catch still planned', url: 'https://www.krgv.com/news/spacex-approved-for-starships-15th-test-flight-at-boca-chica/' },
    spacexPost: { name: 'SpaceX on X: Super Heavy has diverted to an offshore splashdown in the Gulf', url: 'https://x.com/SpaceX' }
  };

  var MISSION = {
    name: 'Starship Flight 15',
    vehicles: 'Super Heavy B22 · Ship S42',
    pad: 'Orbital Launch Pad 2 · Starbase, TX',
    // Actual liftoff Fri Nov 13 2026, 22:47 UTC = 4:47 PM CST (Space.com, NBC, KRGV). The window had opened at 22:45 UTC.
    launchUtcDefault: '2026-11-13T22:47:00Z',
    windowMinutes: 75,
    launched: true,
    // Booster catch called off; B22 splashed down in the Gulf about 6.5 min after launch (SpaceX on X).
    // Ship catch still planned at the Pad 2 tower, T+22:32:34 from this liftoff (about 22.5 h, ~3:17–3:20 PM CST Sat).
    status: 'In flight · liftoff 4:47 PM CST · booster splashdown in the Gulf · ship catch still planned',
    shipCatchOffsetSec: 22 * 3600 + 32 * 60 + 34, // T+22:32:34 from actual liftoff (SpaceX timeline)
    catchNote: 'Booster catch was called off: B22 splashed down in the Gulf about 6.5 min after the 4:47 PM CST liftoff. Ship catch is still planned at this Pad 2 tower, T+22:32:34 from that liftoff. Checkpoints near T+7h15m and T+20h41m can end in a splashdown instead. Deorbit burn is about T+21:36. Pad 1 is under reconstruction.'
  };

  // Places. kind: 'target' (things to look at) or 'site' (where you stand).
  var PLACES = {
    pad:   { id: 'pad',   name: 'Launch mount (Pad 2)', short: 'MOUNT', lat: 25.996603, lon: -97.158251, heightM: 0, src: 'll2' },
    tower: { id: 'tower', name: 'Catch tower (Pad 2)',  short: 'TOWER', lat: 25.99705,  lon: -97.15807,  heightM: 144.5, src: 'osm',
             note: 'Ship catch is still planned at this tower. The booster catch was called off. It stands about 50 m north of the mount. Position traced from OpenStreetMap, good to a few tens of metres.' },
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
      see: 'The tower catch was later called off. The booster went to the Gulf, not the Pad 2 tower.' },
    { id: 'boom_b', t: 345, anchor: 'launch', phase: 'Ascent & booster return', label: 'Sonic booms possible (booster return)', kind: 'estimate', aborted: true,
      see: 'Does not apply. The booster did not return to the tower.' },
    { id: 'blb', t: 370, anchor: 'launch', phase: 'Ascent & booster return', label: 'Booster landing burn at the tower', kind: 'spacex', big: true, aborted: true,
      see: 'Called off. There was no landing burn into the Pad 2 tower.' },
    { id: 'bcatch', t: 390, anchor: 'launch', phase: 'Ascent & booster return', label: 'BOOSTER SPLASHDOWN', kind: 'estimate', big: true,
      see: 'Tower catch called off. Super Heavy B22 made a controlled splashdown in the Gulf of Mexico about 6.5 min after launch. SpaceX: "Super Heavy has diverted to an offshore splashdown in the Gulf."' },
    { id: 'snd_bcatch', t: 370, anchor: 'launch', soundFrom: 'tower', phase: 'Ascent & booster return', label: 'Landing-burn sound at the tower', kind: 'computed', aborted: true,
      see: 'No tower landing-burn roar. The booster splashed down offshore.' },
    { id: 'seco', t: 489, anchor: 'launch', phase: 'Ship to orbit', label: 'Starship engine cutoff', kind: 'spacex', webcast: true,
      see: 'The ship is far downrange. Follow it on the webcast.' },
    { id: 'oib', t: 1570, anchor: 'launch', phase: 'Ship to orbit', label: 'Orbital insertion burn start', kind: 'spacex', webcast: true, see: '' },
    { id: 'oibend', t: 1590, anchor: 'launch', phase: 'Ship to orbit', label: 'Orbital insertion burn shutdown', kind: 'spacex', webcast: true, see: 'Ship in orbit at about 275 km, then deploying 26 Starlink V3.' },
    { id: 'pd', t: 2101, anchor: 'launch', phase: 'On orbit', label: 'Payload deploy start', kind: 'spacex', webcast: true, see: '26 Starlink V3 satellites.' },
    { id: 'pdend', t: 4660, anchor: 'launch', phase: 'On orbit', label: 'Payload deploy complete', kind: 'spacex', webcast: true, see: '' },
    { id: 'hi1', t: 5266, anchor: 'launch', phase: 'On orbit', label: 'Early Hawaii return check', kind: 'spacex', webcast: true, see: 'First chance to bring the ship down early over the ocean.' },
    { id: 'chile', t: 26135, anchor: 'launch', phase: 'On orbit', label: 'Mid Chile return check', kind: 'spacex', webcast: true, see: 'Contingency checkpoint near T+7h15m. A no-go can end in an ocean splashdown instead of the tower catch.' },
    { id: 'hi2', t: 74515, anchor: 'launch', phase: 'On orbit', label: 'Final Hawaii return check', kind: 'spacex', webcast: true, see: 'Last contingency checkpoint, near T+20h41m, before the planned deorbit. A no-go means a splashdown.' },

    // Ship return: SpaceX times expressed relative to catch (T+22:32:34) so they move with the ship-catch clock.
    { id: 'deorbit', t: 77757 - 81154, anchor: 'ship', phase: 'Ship return & catch', label: 'Deorbit burn start', kind: 'spacex', webcast: true, see: 'About T+21:36, if the team is still GO for the Pad 2 tower.' },
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
      see: 'Still the plan: catch at the Pad 2 tower. The booster catch was called off. A no-go on the way home means a splashdown instead.' },
    { id: 'snd_scatch', t: 81136 - 81154, anchor: 'ship', soundFrom: 'tower', phase: 'Ship return & catch', label: 'Ship landing-burn sound arrives', kind: 'computed', alert: true,
      see: 'The roar of the ship landing burn arrives after you see it.' }
  ];

  root.SB_DATA = { SOURCES: SOURCES, MISSION: MISSION, PLACES: PLACES, EVENTS: EVENTS };
})(typeof window !== 'undefined' ? window : globalThis);
