# Tasks: salon-pwa-shell

<!-- Req id map: R1 Installable web app · R2 Cached app shell · R3 Deep links intact · R4 Mobile ergonomics · R5 Static-only constraint -->

## 1. Static assets

- [x] 1.1 Create public/manifest.webmanifest: name/short name, display standalone, start_url & scope, villa dark theme/background colors, 192+512 icons incl. maskable (R1)
- [x] 1.2 Create public/icons/icon.svg (candle monogram on #1e1a16) and scripts/generate-icons.mjs producing the four PNGs via sips/qlmanage with dimension verification (R1)
- [x] 1.3 Create public/offline.html: self-contained villa-dark fallback page (R2)

## 2. Service worker and metadata

- [x] 2.1 Write public/sw.js (version-stamped precache incl. /villa/, network-first navigations, cache-first static, network-only for /live/ APIs, skipWaiting+claim, stale-sweep) and scripts/sw-version.mjs wired into the npm build script (R2, R3, R5)
- [x] 2.2 Edit BaseLayout: manifest link, theme-color, apple-touch-icon + apple metas, viewport-fit=cover, and production-only SW registration (dev no-op) (R1, R4)
- [x] 2.3 Add safe-area-inset padding utilities to global.css for fixed/sticky elements (R4)

## 3. Verification

- [x] 3.1 Preview drill: SW activates on second load; offline reread of visited routes; uncached navigation shows /offline.html; build stamp changed per build (R2, R5)
- [x] 3.2 Regression: /live/<room> deep link still renders the room view with the SW active (R3)
- [ ] 3.3 Install checks: Chromium installability pass + iOS Add to Home Screen standalone launch with correct icon/status bar (R1, R4)
