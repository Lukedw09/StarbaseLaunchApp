# StarbaseLaunchApp

**An unofficial Starship hub for Starbase, Texas.** Between flights it is a phone-friendly info page: the next flight, every Starship flight so far, a hand-kept vehicle list, a viewing guide, and news. From 48 hours before a real T−0 until 6 hours after liftoff it switches to the launch-day companion (countdown, timeline, where to look, sound, weather, ship catch).

> **Unofficial fan app.** It isn't affiliated with or endorsed by SpaceX or Rocket Ranch. All times are approximate and change often, so always go by official SpaceX updates and on-site staff.

The name and the site stay the same. There is no specs or math page.

## Hub

The tabs at the top, in normal mode:

### Next
A countdown to the next Starship flight, in **Central Time**, plus that flight's timeline.

If Launch Library 2 only has a month, quarter, or year (a placeholder, not a clock time), the page shows **NET June 2027** style text and does not count down to midnight on the last day of that period. The timeline appears once a real T−0 exists.

### Flights
Every integrated Starship flight from Launch Library 2: date, vehicles, and outcome. Newest first. A mission file in this repo replaces any field it sets.

### Vehicles
Boosters and ships from [`data/vehicles.json`](data/vehicles.json) only. The app does not invent this list from Launch Library 2.

### Guide
The same spots as the launch-day Look tab: live GPS, **Rocket Ranch Outpost**, **Rocket Ranch Campground**, and **Port Isabel**. Compass to the Pad 2 catch tower or the launch mount, plus bearing, distance, sound delay, and a short tip for each preset.

### News
Items from [`data/news.json`](data/news.json), newest first. An outside routine can replace that file. If it is empty, the page says there are no updates yet.

## Launch-day mode

The companion opens on its own when the current time is inside this window for a flight whose T−0 is known to the **day or better** (second, minute, hour, or day):

- opens **48 hours before** T−0
- closes **6 hours after** liftoff

Month, quarter, and year placeholders do not open it.

The tabs are the original companion: **Count**, **Timeline**, **Look**, **Sound**, **Weather**, and **Ship catch**. HOLD, +1 / +5 / +15, EDIT T−0, and reset to the published T−0 still work, and those edits stay on the phone, per flight. Editing T−0 on the phone does not move the 48-hour window. The window uses the merged flight time (Launch Library 2, then the mission file).

To preview the companion when a flight is not in that window, open `?mode=launch`. To force the hub even inside the window, open `?mode=hub`.

Flight 15 is the first mission file, [`data/missions/flight-15.json`](data/missions/flight-15.json). It is archived. Its SpaceX timeline, including the **COMPUTED** and **ESTIMATE** rows, is kept there and wins over Launch Library 2.

## Where the flight list comes from

The page asks [Launch Library 2](https://thespacedevs.com/) (The Space Devs, free tier) in the browser for previous and upcoming launches whose rocket is named Starship:

- `https://ll.thespacedevs.com/2.2.0/launch/previous/?rocket__configuration__name=Starship`
- `https://ll.thespacedevs.com/2.2.0/launch/upcoming/?rocket__configuration__name=Starship`

A trimmed copy is saved in `localStorage` under `sbla.ll2.v1` and reused for **one hour**, so a phone does not hit the rate limit on every open. If the request fails, the page uses that saved copy, or [`data/ll2-fallback.json`](data/ll2-fallback.json) if nothing is saved. It does not show an error.

## Mission files

`data/missions/index.json` lists the files to load:

```json
{ "files": ["flight-15.json"] }
```

Each file is one flight. Matching to a Launch Library 2 launch, in order: `ll2Id`, then `slug`, then `flightNumber`. A file that matches none of them is added as its own flight, which is how you can list a flight before LL2 does.

**Any key you set replaces the LL2 value, including `null` and `""`.** Keys you leave out keep the LL2 value. If you set `events`, that array replaces the whole LL2 timeline.

| Field | Meaning |
| --- | --- |
| `id` | Stable id. Phone settings for T−0 are stored under this. |
| `flightNumber` | 1, 2, 3… Used to match LL2 names like "Flight 15". |
| `ll2Id` | Launch Library 2 launch UUID. |
| `slug` | LL2 slug, another way to match. |
| `archived` | `true` once the flight is over and the file is the record. |
| `name`, `vehicles`, `pad` | What the countdown and the history row show. |
| `net` | T−0 as an ISO UTC timestamp. |
| `netPrecision` | `SEC`, `MIN`, `HR`, or `D` for a real clock time. `M`, `Q`, or `Y` stay on the hub. |
| `windowMinutes` | Length of the launch window after T−0. |
| `launched`, `complete` | Banner state for the companion. |
| `status` | Status line on the countdown when this file is in charge. |
| `outcome` | One line on the history card. |
| `shipCatchOffsetSec` | Seconds from liftoff to the ship catch. Omit it to hide that clock. |
| `catchNote` | Shown on Look and Ship catch during launch day. |
| `events` | Timeline rows. Replaces LL2 when present. |
| `sources` | Map of `{ "name": "...", "url": "https://..." }` cited in the footer. |

An event row:

| Field | Meaning |
| --- | --- |
| `id` | Stable id. |
| `t` | Seconds from the anchor. Negative is before. |
| `anchor` | `launch` (from T−0) or `ship` (from the ship-catch time). |
| `phase` | Group label, such as `Countdown`. |
| `label` | Row title. |
| `kind` | `spacex`, `computed`, `estimate`, or `ll2`. |
| `see` | What you should see or hear from the ground. |
| `minor` | Hidden until "Show minor countdown steps" is on. |
| `big` | Heavier type, for liftoff and catches. |
| `alert` | Arms a sound-arrival alert. |
| `soundFrom` | `pad` or `tower`. The row's clock time adds your sound delay. |
| `aborted` | Draws the row as called off. |
| `webcast` | Tags the row as webcast-only. |

After adding a file, list it in `data/missions/index.json` and in the `SHELL` array in `sw.js` so it is available offline.

## `data/vehicles.json`

Hand-edited. The app only reads it.

```json
{
  "updated": "2026-11-15",
  "vehicles": [
    {
      "id": "B22",
      "role": "booster",
      "serial": "B22",
      "name": "Super Heavy Booster 22",
      "block": "Block 3",
      "status": "Destroyed",
      "flights": [15],
      "summary": "One or two sentences.",
      "sources": [{ "name": "SpaceX — Starship Flight 15", "url": "https://www.spacex.com/launches/starship-flight-15" }]
    }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable id. |
| `role` | yes | `booster` or `ship`. Anything else is skipped. |
| `serial` | yes | Shown as the card title, such as `B22` or `S42`. |
| `status` | yes | Short status, such as `Caught`, `Expended`, or `Destroyed`. |
| `sources` | yes | At least one `{ "name", "url" }`. Cite the page you used. |
| `name`, `block` | no | Subtitle. |
| `flights` | no | Array of flight numbers. |
| `summary` | no | One or two sentences. |
| `updated` | no | Date you last edited the file. |
| `image` | no | Repo path such as `assets/vehicles/b12.webp`. Only `assets/vehicles/` files are shown. |
| `imageCredit` | no | Photographer or rights holder, shown under the photo. |
| `imageLicense` | no | Short license name, such as `CC BY-SA 2.0` or `Public domain`. |
| `imageSourceUrl` | no | `https` page for the original photo. The credit line links here. |

Leave `image` off when you do not have a photo whose caption names that serial and whose license allows reuse here with credit. The card then shows a steel booster or ship silhouette. Do not point `image` at a hotlinked URL.

The page sorts each group by serial number, highest first. The seeded list is flown vehicles only, cited to the [list of Starship launches](https://en.wikipedia.org/wiki/List_of_Starship_launches) for Flights 1–14 and to [SpaceX's Flight 15 page](https://www.spacex.com/launches/starship-flight-15) for B22 and S42. Add vehicles still in the yard when you have a source.

## Image credits

Photographs in `assets/vehicles/` are not covered by the MIT license. Each copy is offered under the same license as the original. They are resized WebP files, about 800 px wide, for this unofficial non-commercial fan site.

| Vehicle | What the caption identifies | Credit | License | Source |
| --- | --- | --- | --- | --- |
| B7 | Super Heavy booster, serial no. B7, on the pad in February 2023 | Mobilus In Mobili | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:SpaceX_Starship_Superheavy_Testing_February_2023_(cropped).jpg) |
| B9 and S25 | Flight 2 vehicles S25 and B9 during ascent | Osunpokeh | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Starship-IFT2-ascent_(close_cropped).jpg) |
| B12 | The booster returning to the tower on flight test 5 (Booster 12) | Steve Jurvetson | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Starship_Booster_Return_on_Final_Approach_(54063904149).jpg) |
| S24 | The Booster 7 / Ship 24 stack, 16 April 2023 | Jenny Hautmann | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Full_Stack_starship_crop_straight.jpg) |
| S39 | Heat shield of Ship 39 inside Megabay 2 | Alexander Kubitza, U.S. Navy | Public domain (U.S. government work) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ship_39_in_Megabay_2,_Starbase,_Texas_(cropped).jpg) |

The other flown vehicles in the seed file have no photo here. Commons and similar collections did not have a picture whose caption named that serial and whose license allows this use. Those cards use the silhouette.

## `data/news.json`

An outside routine can rewrite this file from SpaceX's updates page and @SpaceX on X. The page only renders it, newest first.

```json
{
  "items": [
    {
      "date": "2026-11-14",
      "title": "Ship 42 caught at the Pad 2 tower",
      "summary": "One short paragraph.",
      "sourceUrl": "https://www.spacex.com/launches/starship-flight-15",
      "sourceName": "SpaceX"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `date` | `YYYY-MM-DD`. Sort key. |
| `title` | Card title. |
| `summary` | Short paragraph. Optional. |
| `sourceUrl` | `http` or `https` link. Other schemes are dropped. |
| `sourceName` | Link text, such as `SpaceX`. |

An empty `items` array shows "No updates yet."

## Viewing spots

| Place | Coordinates | Source |
| --- | --- | --- |
| Launch mount, Pad 2 | 25.996603° N, 97.158251° W | [Launch Library 2 pad 235](https://ll.thespacedevs.com/2.2.0/pad/235/) |
| Catch tower, Pad 2 | 25.99705° N, 97.15807° W, about 144.5 m tall | [Starship Catch Simulator site notes](https://dionismuzenitov.github.io/starship-catch-sim/docs/kb/starbase-catch-site-pad-a-b-dimensions-and-catch-history) |
| Rocket Ranch Outpost | 25.96159° N, 97.20539° W | [Visit Starbase](https://visit-starbase.com/watch/rocket-ranch), [Rocket Ranch FAQ](https://rocketranchstarbase.com/faq/) |
| Rocket Ranch Campground | 25.947229° N, 97.279813° W | [Campendium](https://maps.campendium.com/us/brownsville-tx/camping-rv/rocket-ranch-boca-chica) |
| Port Isabel | 26.07341° N, 97.20858° W | [OpenStreetMap](https://www.openstreetmap.org/relation/114514) |

From the Outpost the tower is about **050° (northeast), 6.2 km / 3.8 mi**, and the sound takes about **18 seconds**.

Distance and bearing use the great-circle formula. Sound speed is `331.3 × √(1 + T/273.15)` m/s, plus the wind along the path. Tower elevation includes Earth curvature and typical refraction. The compass uses `webkitCompassHeading` on iPhone and absolute device orientation on Android.

## Run it locally

Static files. A local server is required so the mission, vehicle, and news files can load:

```bash
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/` for the hub and `http://127.0.0.1:8765/?mode=launch` for the launch-day preview.

After one visit on https (or localhost), the service worker keeps a copy for offline use. Weather still needs a network the first time, then shows the last reading.

Cloudflare Workers Builds deploys the repo as static assets (`wrangler.jsonc`). Pushes to `main` run `npx wrangler deploy`. Other branches run `npx wrangler preview`, which needs the empty `previews` block in that file.

**Install it to the home screen:**

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** menu → *Add to Home screen* / *Install app*

## Tests

```bash
node --test test/flights.test.js
```

or `npm test`. They cover the 48-hour / 6-hour window, coarse dates staying on the hub, and mission-file fields overriding Launch Library 2 (including the archived Flight 15 timeline).

## License

MIT © 2026 Luke de Wet. See [LICENSE](LICENSE).

Starship and SpaceX are trademarks of Space Exploration Technologies Corp. This project is an independent fan project and uses no SpaceX logos.
