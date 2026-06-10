# Makan@118

Find halal and Muslim-friendly food near Menara Merdeka 118, Kuala Lumpur.

Live at: **https://makan118.netlify.app**

---

## What it does

- Searches 150–300+ restaurants, cafes, kopitiams, bakeries and food courts within a adjustable radius (up to 10km)
- Estimates halal status (Certified / Muslim-friendly / Unverified) from place names and types
- Filters by cuisine type, halal status, and travel mode (Walk / Transit / Drive)
- Shows travel time and distance from Merdeka 118 for each place
- Full detail panel with photos, opening hours, phone, website, and Google Maps directions
- Colour-coded map pins (green = Halal, amber = Friendly, red = Unverified)

---

## How to make changes

All app logic lives in three files:

| File | What it controls |
|---|---|
| `index.html` | Layout, CSS, config (coordinates, API key placeholder, halal keywords, mall list) |
| `components.jsx` | PlaceCard, DetailPanel, HalalBadge, utility functions |
| `app.jsx` | Search logic, filters, map, state management |

Edit any file on GitHub → commit → Netlify auto-deploys within ~1 minute.

---

## Key settings (in index.html)

```js
window.CONFIG = {
  MERDEKA118: { lat: 3.14265, lng: 101.71072 }, // origin pin
  DEFAULT_RADIUS: 1500  // default search radius in metres
};
```

To add more halal keywords:
```js
window.HALAL_KEYWORDS = {
  cert:     [...],   // treated as Halal Certified
  friendly: [...],   // treated as Muslim Friendly
  unlikely: [...]    // treated as Unverified
};
```

---

## Deployment

Hosted on **Netlify**, connected to this GitHub repo.

- Push to `main` → Netlify auto-deploys
- API key is stored as `MAPS_KEY` in Netlify environment variables
- `netlify.toml` injects the key into `index.html` at build time
- The key itself is restricted to this domain in Google Cloud Console

## APIs used

- Google Maps JavaScript API (map display)
- Google Places API (restaurant search + details + photos)
- Google Distance Matrix API (travel times)
