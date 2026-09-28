# Design: salon-pwa-shell

## Overview

Handwritten, dependency-free PWA plumbing for the Astro static site: a `public/manifest.webmanifest`, a small `public/sw.js` service worker with a build-time-stamped version, generated icons, an `/offline.html` fallback page, and BaseLayout meta tags. No new npm dependencies (repo stays lean and GitHub Pages compatible). Requirement id map: R1 = Installable web app, R2 = Cached app shell, R3 = Deep links intact, R4 = Mobile ergonomics, R5 = Static-only constraint.

## Architecture

```mermaid
flowchart LR
    GH[GitHub Actions build] --> STAMP["node scripts/sw-version.mjs<br/>stamps __CACHE_VERSION__"]
    STAMP --> DIST[dist/ = public/* + astro output]
    DIST --> SW[sw.js]
    SW -- precache --> SH[/'/', '/villa/', '/offline.html', CSS|manifest|icons]
    SW -- runtime cache-first --> IMM[hashed /_astro/* assets]
    SW -- network-first navigations --> NET[(origin)]
    NET -- offline miss --> OFF[/offline.html/]
```

## Components and interfaces

### public/manifest.webmanifest

- Responsibility: identity + installability. `name: "Castalia Salon"`, `short_name: "Salon"`, `id: "/salon/"`-relative `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `background_color/theme_color: "#1e1a16"`, `icons`: 192 + 512 regular and `purpose: "maskable"` entries.
- Serves: R1.

### public/sw.js

- Responsibility: offline behavior. Vanilla service worker; `CACHE_VERSION` placeholder `__CACHE_VERSION__` replaced at build.
- Interface:
  - `install`: `cache.addAll(precacheList)` (shell: `/`, `/villa/`, `/offline.html`, main CSS, manifest, icons) → `skipWaiting()` (registered after preload resolves).
  - `activate`: delete stale caches → `clients.claim()`.
  - `fetch` strategy:
    - navigations (`mode: 'navigate'`): network-first; on success put copy in runtime cache; on failure serve cached navigation else `/offline.html` (R2, R3).
    - cache-first for same-origin `image/*`, `text/css`, `application/javascript`, `font/*`, `application/manifest+json` — hashed `/_astro/*` assets are immutable, cheap wins (R2).
    - everything else (e.g. Matrix API calls from `/live/`): network-only (keeps `/live/*` behavior intact, R3).
- Serves: R2, R3.

### public/offline.html

- Responsibility: branded villa-dark "The candles are lit, but the network is not." fallback page, self-contained (inline styles, no external fetches).
- Serves: R2.

### src/components/SalonSWRegistry.astro (inline in BaseLayout)

- Responsibility: register `/sw.js` after `window.load` in production (skip when `location.hostname === 'localhost'` or `import.meta.env.DEV`).
- Serves: R1, R2.

### scripts/generate-icons.mjs

- Responsibility: render `public/icons/icon.svg` (candle monogram on `#1e1a16`) to `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` (maskable = padded 80% safe-zone) using macOS `sips`/`qlmanage` SVG→PNG fallback chain, verifying dimensions via `sips -g pixelWidth`; script exits non-zero on any failure so CI catches it.
- Serves: R1.

### scripts/sw-version.mjs

- Responsibility: stamp `__CACHE_VERSION__` → ISO build timestamp so every deploy activates a fresh cache and purges old entries.
- Serves: R2.

### src/layouts/BaseLayout.astro (edit)

- Responsibility: add `<link rel="manifest">`, `<meta name="theme-color" content="#1e1a16">`, `apple-touch-icon` links, `apple-mobile-web-app-capable/title/status-bar-style`, `viewport-fit=cover` in the existing viewport meta; mount `SalonSWRegistry`. Global CSS gains `env(safe-area-inset-*)` padding utilities for fixed/sticky elements only (no layout churn).
- Serves: R1, R4.

### package.json (edit)

- `build` script becomes `astro build && node scripts/sw-version.mjs` so the stamp always preempts upload. (R5, R2.)

## Data models

- Cache names: `salon-shell-${CACHE_VERSION}` (precache) and `salon-runtime-${CACHE_VERSION}` (runtime); activation sweeps both prefixes.
- Precache list is a literal array in `sw.js`; `/villa/` inclusion is the `villa-3day-replay` contract point (single source of truth documented in sw.js header comment).

## Error handling

- `cache.addAll` failure during install (any 404 asset) → the SW aborts install with a console warning and leaves the old cache active; site continues online — SW is strictly additive.
- `navigate` miss offline → `/offline.html` (never redirect loops: it is precached).
- Dev mode (`npm run dev`): registry no-ops; devs get normal live behavior (R5-friendly workflow).

## Testing strategy

- Build verification: `npm run build` + `npm run preview`; DevTools → Application: manifest valid, SW activated on second load, cache contains shell entries.
- Offline drill: DevTools offline + cold navigate to `/` and `/villa/` → cached; navigate to arbitrary uncached path → `/offline.html` (R2, R3).
- Deep-link regression: `/live/%23salon-room%3Amatrix.castalia.institute` still renders the room view with SW active (R3).
- Device check: iOS Safari Home Screen launch standalone; Chromium install prompt pass (R1).
- Lighthouse (category: Installable) on preview URL (final gate lives in `villa-pwa-launch`).

## Risks and trade-offs

- Handwritten SW vs `vite-plugin-pwa`: inline SW keeps deps at zero and GitHub Pages quirks controllable (no plugin assumptions about base paths); cost is manual precache bookkeeping — mitigated by runtime cache-first for hashed assets and network-first navigations (correct by construction for content).
- GH Pages 404.html interplay: network-first navigations mean deep links hitting the 404 copy still work online; offline unknown navigations get `/offline.html` — accepted v1 trade-off (recorded in requirements Non-goals).
- Open question for tasks: exact candle-glyph SVG art for the icon (kept deliberately simple; mono-color for maskable safety).
