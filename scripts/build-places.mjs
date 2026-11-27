// ─────────────────────────────────────────────────────────────────────────────
// Makan@118 — data builder
//
// Fetches eateries around Menara Merdeka 118 from OpenStreetMap (Overpass API,
// free, no key), cleans them up, merges your hand-verified halal list
// (overrides.json) and writes places.json for the website to read.
//
// Run from the project folder (Node 18 or newer):
//   node scripts/build-places.mjs              → writes places.json
//   node scripts/build-places.mjs --checklist  → also writes jakim-checklist.csv
//
// Optional Mapillary street-view links (free token, never published):
//   MAPILLARY_TOKEN=MLY|xxxx node scripts/build-places.mjs
//   (Windows PowerShell:  $env:MAPILLARY_TOKEN="MLY|xxxx"; node scripts/build-places.mjs)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Menara Merdeka 118 — verified pin (search centre)
const CENTER = { lat: 3.1419784034925144, lng: 101.70065939255888 };
// Street-level pedestrian entrance — all distances are measured from here
const WALK_ORIGIN = { lat: 3.1412, lng: 101.7004 };
const RADIUS = 3000;          // metres, straight line
const CHECKLIST_RADIUS = 1500; // metres — places worth checking on the JAKIM portal first

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// nodes + ways only (relations can group outlets far away — see README)
const QUERY = `
[out:json][timeout:90];
(
  nw["amenity"~"^(restaurant|cafe|fast_food|food_court)$"](around:${RADIUS},${CENTER.lat},${CENTER.lng});
  nw["shop"~"^(bakery|pastry)$"](around:${RADIUS},${CENTER.lat},${CENTER.lng});
);
out center tags;`;

// ── helpers ──────────────────────────────────────────────────────────────────

function crow(lat, lng, o = WALK_ORIGIN) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat - o.lat) * r, dLng = (lng - o.lng) * r;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(o.lat * r) * Math.cos(lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchOverpass() {
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      console.log('Querying ' + url + ' …');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Makan118/2.0 (personal lunch finder)',
        },
        body: 'data=' + encodeURIComponent(QUERY),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      return json.elements || [];
    } catch (e) {
      console.warn('  failed: ' + e.message);
    }
  }
  throw new Error('All Overpass servers failed. Wait a few minutes and try again.');
}

function address(t) {
  if (t['addr:full']) return t['addr:full'];
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const area = t['addr:suburb'] || t['addr:city'] || '';
  return [street, area].filter(Boolean).join(', ');
}

function normalise(e) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!t.name || lat == null || lng == null) return null;
  const cuisines = (t.cuisine || '')
    .split(';').map(s => s.trim().toLowerCase()).filter(Boolean);
  return {
    place_id: `${e.type}/${e.id}`,
    name: t.name,
    vicinity: address(t),
    types: [t.amenity || t.shop, ...cuisines].filter(Boolean),
    lat: +lat.toFixed(6),
    lng: +lng.toFixed(6),
    _crow: crow(lat, lng),
    halal: t['diet:halal'] || null,                 // 'only' | 'yes' | 'no' | null
    hours: t.opening_hours || null,                 // raw OSM opening_hours text
    phone: t.phone || t['contact:phone'] || null,
    website: t.website || t['contact:website'] || null,
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

const elements = await fetchOverpass();
console.log(`Overpass returned ${elements.length} elements`);

let places = elements.map(normalise).filter(Boolean)
  .filter(p => p._crow <= RADIUS);

// Remove exact duplicates (same name mapped as both a pin and a building)
const seen = new Map();
places = places.filter(p => {
  const key = p.name.toLowerCase().replace(/\s+/g, ' ');
  const prev = seen.get(key);
  if (prev && Math.abs(prev.lat - p.lat) < 0.0005 && Math.abs(prev.lng - p.lng) < 0.0005) return false;
  seen.set(key, p);
  return true;
});

// Merge your verified halal list
const overrides = existsSync('overrides.json')
  ? JSON.parse(readFileSync('overrides.json', 'utf8')) : {};
let verifiedCount = 0, addedCount = 0;
for (const [id, o] of Object.entries(overrides)) {
  if (id.startsWith('_')) continue;                  // comment keys
  const p = places.find(x => x.place_id === id);
  if (p) {
    if (o.halal) { p.verified = { halal: o.halal, checked: o.checked || null, note: o.note || null }; verifiedCount++; }
    if (o.name) p.name = o.name;                     // allow name fixes
  } else if (o.name && o.lat != null && o.lng != null) {
    // A place missing from OpenStreetMap that you add by hand
    places.push({
      place_id: id, name: o.name, vicinity: o.vicinity || '',
      types: o.types || ['restaurant'], lat: o.lat, lng: o.lng,
      _crow: crow(o.lat, o.lng), halal: null, hours: o.hours || null,
      phone: o.phone || null, website: o.website || null,
      verified: o.halal ? { halal: o.halal, checked: o.checked || null, note: o.note || null } : undefined,
    });
    addedCount++;
  } else {
    console.warn(`  overrides.json: "${id}" not found in this run (moved, renamed or outside ${RADIUS} m)`);
  }
}

// Optional: nearest Mapillary street-level image for each place
const MLY = process.env.MAPILLARY_TOKEN;
if (MLY) {
  console.log('Looking up Mapillary images (about 0.2 s per place) …');
  const d = 0.0004; // ≈ 45 m box around each place
  let found = 0;
  for (const p of places) {
    const bbox = [p.lng - d, p.lat - d, p.lng + d, p.lat + d].map(n => n.toFixed(6)).join(',');
    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(MLY)}&fields=id&bbox=${bbox}&limit=1`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        if (j.data && j.data[0]) { p.mly = j.data[0].id; found++; }
      }
    } catch { /* skip this place */ }
    await sleep(200);
  }
  console.log(`  ${found} of ${places.length} places have a nearby Mapillary image`);
}

places.sort((a, b) => a._crow - b._crow);

const out = {
  generated_at: new Date().toISOString(),
  origin: WALK_ORIGIN,
  radius: RADIUS,
  count: places.length,
  places,
};
writeFileSync('places.json', JSON.stringify(out));

// Summary
const tagged = places.filter(p => p.halal).length;
const withCuisine = places.filter(p => p.types.length > 1).length;
const withHours = places.filter(p => p.hours).length;
console.log(`\n✔ places.json written — ${places.length} places within ${RADIUS / 1000} km`);
console.log(`  diet:halal tagged : ${tagged}`);
console.log(`  cuisine tagged    : ${withCuisine}`);
console.log(`  opening hours     : ${withHours}`);
console.log(`  verified by you   : ${verifiedCount}  (added by hand: ${addedCount})`);

// Optional JAKIM checklist
if (process.argv.includes('--checklist')) {
  const esc = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = places
    .filter(p => p._crow <= CHECKLIST_RADIUS && !p.verified)
    .map(p => [p.place_id, p.name, p.vicinity, p._crow, p.halal || '', '', ''].map(esc).join(','));
  writeFileSync('jakim-checklist.csv',
    'place_id,name,address,distance_m,osm_halal_tag,jakim_result (cert/unsure),checked_date\n' + rows.join('\n'));
  console.log(`✔ jakim-checklist.csv written — ${rows.length} unverified places within ${CHECKLIST_RADIUS} m`);
}
