/* Starbase viewing spots. Flight timelines live in data/missions/. */
(function (root) {
  'use strict';

  var SOURCES = {
    ll2: { name: 'Launch Library 2: Orbital Launch Pad 2 (pad 235)', url: 'https://ll.thespacedevs.com/2.2.0/pad/235/' },
    osm: { name: 'Pad 2 tower position, OSM-traced (Starship Catch Simulator site notes)', url: 'https://dionismuzenitov.github.io/starship-catch-sim/docs/kb/starbase-catch-site-pad-a-b-dimensions-and-catch-history' },
    visit: { name: 'Visit Starbase: Rocket Ranch Boca Chica viewing spot', url: 'https://visit-starbase.com/watch/rocket-ranch' },
    rr: { name: 'Rocket Ranch FAQ', url: 'https://rocketranchstarbase.com/faq/' },
    camp: { name: 'Campendium: Rocket Ranch Boca Chica', url: 'https://maps.campendium.com/us/brownsville-tx/camping-rv/rocket-ranch-boca-chica' },
    nominatim: { name: 'OpenStreetMap Nominatim: Port Isabel, TX', url: 'https://nominatim.openstreetmap.org/search?q=Port+Isabel,+Texas&format=json' }
  };

  var PLACES = {
    pad: { id: 'pad', name: 'Launch mount (Pad 2)', short: 'MOUNT', lat: 25.996603, lon: -97.158251, heightM: 0, src: 'll2' },
    tower: { id: 'tower', name: 'Catch tower (Pad 2)', short: 'TOWER', lat: 25.99705, lon: -97.15807, heightM: 144.5, src: 'osm',
      note: 'The tower stands about 50 m north of the mount. These chopsticks caught Ship 42 on Nov 14, 2026. Position traced from OpenStreetMap, good to a few tens of metres.' },
    outpost: { id: 'outpost', name: 'Rocket Ranch Outpost (launch viewing)', lat: 25.96159, lon: -97.20539, src: 'visit',
      tip: 'The main launch viewing site, about 3.8 miles from the pad. The tower sits low, only about a degree above the horizon, so look just over the scrub. Have earplugs ready.' },
    campground: { id: 'campground', name: 'Rocket Ranch Campground (check-in)', lat: 25.947229, lon: -97.279813, src: 'camp',
      tip: 'Farther west, at the Rocket Ranch check-in on Palmito Hill Road. The bearing and the sound delay below are for this spot, not the Outpost.' },
    portisabel: { id: 'portisabel', name: 'Port Isabel (town centre)', lat: 26.0734119, lon: -97.2085844, src: 'nominatim',
      tip: 'Town centre, north of Starbase. A backup if you are not at the Rocket Ranch sites. Sound takes longer to arrive from here.' }
  };

  root.SB_DATA = { SOURCES: SOURCES, PLACES: PLACES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
