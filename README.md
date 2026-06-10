# Makan@118 — Live Restaurant Finder

Find food near Merdeka 118, Kuala Lumpur.

## Features
- Live Google Places search with photos
- Halal scoring engine (Likely / Check / Not Halal)
- Mall detection badge
- Travel times from Merdeka 118 (walk · drive · transit)
- Full detail panel: hours, phone, website, directions
- Filter chips: Mamak, Cafe, Fast Food, Western, Japanese, Korean
- Sort by: Top Rated / Most Reviews / Halal First
- Dark map with custom styling

## Setup (5 minutes)

### 1. Get a Google Maps API key
- Go to https://console.cloud.google.com/
- Create a project → Enable these APIs:
  - Maps JavaScript API
  - Places API
  - Distance Matrix API

### 2. Replace the key
In `index.html`, replace **both** instances of `REPLACE_WITH_YOUR_KEY`:

```html
window.CONFIG = { GOOGLE_API_KEY: "AIza...", ... }
...
<script src="https://maps.googleapis.com/maps/api/js?key=AIza...">
```

### 3. Deploy (pick one)

**GitHub Pages** (free):
1. Push files to a GitHub repo
2. Settings → Pages → Source: main branch / root
3. Your URL: `https://yourusername.github.io/reponame`

**Netlify** (free, drag & drop):
1. Go to https://netlify.com
2. Drag the folder onto the deploy area
3. Done — live URL in 30 seconds

**Local** (for testing only):
```bash
npx serve .
```
(Do NOT open index.html directly as a file — Google Maps requires HTTP)

## Tweak search radius
In `index.html`:
```js
window.CONFIG = {
  SEARCH_RADIUS: 1500  // metres from Merdeka 118
}
```

## Halal scoring
The scoring engine in `components.jsx` uses keyword matching on place names, addresses, and types.
You can extend `window.HALAL_KEYWORDS.likely` / `.check` / `.unlikely` arrays freely.
