# trip_io

**Plan faster. Travel smarter. Discover Yaoundé.**

A tourism discovery application for Yaoundé, Cameroon. Bilingual (EN / FR),
dark by design, and built around real places rather than placeholder content.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check and bundle to dist/
npm run preview  # serve the built output
```

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · Framer Motion · Lucide ·
React Router.

## How it is organised

```
src/
  components/     reusable UI, layout chrome, map, QR, cards
  data/           destinations, categories, seeded community content
  lib/            i18n, itinerary generation, helpers, Supabase schema
  pages/          one file per route
  store/          application state (language, auth, favourites, itineraries)
  types/          domain types, mirroring the database schema
```

`src/store/AppContext.tsx` holds all user state and persists it to
localStorage. Its shape matches the tables in `src/lib/schema.sql`, so moving
to Supabase is a change of data source rather than a rewrite of the interface.

## The data

Every destination is a real place in Yaoundé. A few decisions worth knowing:

- **Locations are given by quarter** — Bastos, Mvolyé, Biyem-Assi, Briqueterie —
  rather than street addresses. Yaoundé addressing is largely informal, and an
  invented street number would be worse than none. Coordinates are accurate to
  the locality and drive both the map and the "nearby" ordering.
- **Prices are in FCFA and marked indicative.** Entry fees for Cameroonian
  museums change often and are rarely published.
- **Photographs come from Wikimedia Commons**, which is licensed for reuse.
  Attribution for each file is kept in
  `public/images/destinations/_attribution.json`.
- **Some photographs show the city rather than the exact place.** Commons has
  no picture of most hotels and cafés here. Those records carry
  `imageIsContextual: true` and the interface says so on the destination page,
  because letting a stand-in pass as the real thing is the fastest way to lose
  a local user's trust.

## Configuration

Both are optional; the app runs fully without either.

| Variable | Effect when set |
|---|---|
| `VITE_MAPBOX_TOKEN` | Swap the coordinate plane in `StaticMap` for real tiles |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Point the store at Supabase instead of localStorage |

### The map

No Mapbox token is configured, so rather than an empty grey box the map
projects real latitude and longitude onto a styled plane. Markers sit in their
true relative positions, so the shape of the city is accurate — the centre
clustered along the Mfoundi valley, Bastos north, Mvolyé south, Olembé well
out. Zoom, category filtering, search and marker selection all work.
`src/components/StaticMap.tsx` is the single file to replace when a token is
available.

### The QR code

`QrPanel` renders a deterministic SVG rather than encoding a real payload: a
scannable code would need either a dependency or an external image request,
and the production URL is not fixed yet. It takes the payload it *would*
encode, so swapping in an encoder is a one-line change.

## Accessibility

Semantic landmarks throughout, visible focus rings on every interactive
element (the palette is dark, so the default outline is not enough), `aria-pressed`
on toggles, live regions on the result count, and `prefers-reduced-motion`
honoured — the starfield paints one static frame instead of animating, and
transitions collapse to near-zero.

## What is not built

Stated plainly rather than implied:

- **Authentication is a UI, not a backend.** Signing in creates a local session;
  no password is checked and nothing is sent anywhere. The Supabase schema
  includes the tables and row-level security policies it would need.
- **The Google button** signs you in locally. It does not talk to Google.
- **Downloads** on the landing page open the web app; there is no APK or
  TestFlight build behind them.
- **Community and submission content is seeded**, and moderation status is
  fixed rather than driven by a real review queue.
