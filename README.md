# Makan@118 (v2)

Find halal and Muslim-friendly lunch near Menara Merdeka 118, Kuala Lumpur.
**Costs nothing to run: no API keys, no tokens, no billing account.**

| Piece | What it uses | Cost |
|---|---|---|
| Map display | MapLibre GL + OpenFreeMap tiles | Free, no key |
| Restaurant data | OpenStreetMap via Overpass, saved in `places.json` | Free, no key |
| Halal "verified" status | Your own JAKIM portal checks in `overrides.json` | Free |
| Directions, photos and reviews | Links that open Google Maps | Free, no key |
| Street view (optional) | Mapillary links, looked up when you build the data | Free token, used only on your computer |
| Hosting | GitHub Pages | Free |

Visitors' browsers make **no API calls**. The site reads one static file, `places.json`.

---

## Files

| File | What it does |
|---|---|
| `index.html` | Layout, styles, settings (`window.CONFIG`), halal keywords, mall list |
| `components.jsx` | Halal scoring, place card, detail panel, links |
| `app.jsx` | Map, filters, list |
| `places.json` | The restaurant data (created by the script, never edited by hand) |
| `overrides.json` | Your JAKIM-verified places and any places added by hand |
| `scripts/build-places.mjs` | Fetches OpenStreetMap data and writes `places.json` |

---

## One-time setup

1. Install **Node.js** (LTS version) from nodejs.org. Check it works: `node --version` should print 18 or higher.
2. Put this folder into your GitHub repo (`rassyidramlan/makan118`). Replace the old files and delete `netlify.toml`.
3. Open a terminal in the project folder and build the data:
   ```
   node scripts/build-places.mjs --checklist
   ```
   This creates `places.json` and `jakim-checklist.csv`.
4. Test locally (the site needs a web server; double-clicking `index.html` will not work):
   ```
   python3 -m http.server 8000
   ```
   Then open http://localhost:8000. (Windows without Python: `npx serve .`)
5. Commit and push `places.json` along with the code.
6. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.**
   Within a minute or two the site is live at `https://rassyidramlan.github.io/makan118/`.

## Verifying halal status (do this once, then yearly)

1. Open `jakim-checklist.csv` in Excel. It lists unverified places within 1.5 km, nearest first.
2. Look each one up on the Halal Malaysia portal (myehalal.halal.gov.my) or the Verify Halal app.
   Certification is per outlet, so check the specific branch.
3. Add your results to `overrides.json`, keyed by `place_id`:
   ```json
   {
     "node/1234567890": { "halal": "cert",   "checked": "2026-11-28", "note": "JAKIM portal" },
     "way/987654321":   { "halal": "unsure", "checked": "2026-11-28", "note": "Not listed" }
   }
   ```
4. Re-run `node scripts/build-places.mjs`, then commit and push.

To add a place that is missing from OpenStreetMap, give it any key starting with `custom/`:
```json
"custom/warung-mak-teh": { "name": "Warung Mak Teh", "lat": 3.1405, "lng": 101.6998,
  "vicinity": "Jalan Hang Jebat", "types": ["restaurant", "malaysian"],
  "halal": "cert", "checked": "2026-11-28" }
```
(Better still, add it on openstreetmap.org too, so it shows up for everyone.)

## How halal status is decided

Checked in this order; the first match wins:

1. Your JAKIM check in `overrides.json` → **Halal**
2. OpenStreetMap `diet:halal=only` → **Halal**; `diet:halal=no` → **Unverified**
3. Red-flag words (pork, babi, bak kut teh, wine…) → **Unverified**
4. OpenStreetMap `diet:halal=yes`, or Muslim-food words and cuisines (nasi, mamak, arab…) → **Muslim-friendly**
5. Nothing known → **Unverified**

Keywords live in `index.html` under `window.HALAL_KEYWORDS` and match whole words only.

## Refreshing the data (monthly is plenty)

```
node scripts/build-places.mjs
git add places.json && git commit -m "Refresh places" && git push
```

## Optional extras

**Colleague reports.** Create a free Google Form (place name, halal status, comment), then paste its link into `REPORT_URL` in `index.html`.
A "Report halal status" link then appears on every place.

**Mapillary street view.** First check coverage at mapillary.com/app around M118. If it's good:
1. Create a free account → Developers → register an application → copy the **client token** (starts `MLY|`).
2. Build with the token. It is used only on your computer and never published:
   ```
   MAPILLARY_TOKEN="MLY|xxxx" node scripts/build-places.mjs        # Mac / Linux
   $env:MAPILLARY_TOKEN="MLY|xxxx"; node scripts/build-places.mjs  # Windows PowerShell
   ```
Places with a nearby image get a "Street view ↗" button.

**If OpenFreeMap is ever down: switch to a self-hosted Protomaps map.**
1. Download the `pmtiles` tool from github.com/protomaps/go-pmtiles/releases.
2. Cut out KL (find the latest build date at maps.protomaps.com/builds):
   `pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles kl.pmtiles --bbox=101.66,3.11,101.74,3.17`
3. Add `kl.pmtiles` to the repo, load the `pmtiles` and `@protomaps/basemaps` scripts, and point `MAP_STYLE` at a Protomaps style.
   See docs.protomaps.com → "MapLibre" for the exact snippet.

## Things to know

- **Library versions are pinned** (React 18.3.1, Babel 7, MapLibre 4.7.1). Don't unpin them; an unpinned Babel broke v1.
- **MapLibre uses [longitude, latitude]**, the reverse of Google's `{lat, lng}`.
- **Walking times are estimates:** straight-line distance × 1.3 at 80 m per minute. The Walk / Transit / Drive boxes open the real route in Google Maps.
- **Attribution:** keep "© OpenStreetMap contributors" and the map's attribution button. They're required by the data licence.
