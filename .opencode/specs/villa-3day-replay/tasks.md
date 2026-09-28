# Tasks: villa-3day-replay

<!-- Req id map: R1 Static public replay · R2 Three-day structure & navigation · R3 Mobile-first presentation · R4 Offline readiness · R5 Lightweight public path -->

## 1. Static data vendoring

- [ ] 1.1 Write scripts/vendor-villa-data.mjs: read sibling castalia.institute villa-diodati JSON, write src/data/villa-diodati/three-days.json + capsule.json with schema asserts (3 days, start 1816-06-15, non-empty scenes) (R1, R2)
- [ ] 1.2 Run the vendoring script and commit the vendored data files (R1)

## 2. Replay page

- [ ] 2.1 Create src/styles/villa.css: villa dark palette tokens, scene card/Disclosure styles, 44px min touch targets, 320–430px fluid layout (R3)
- [ ] 2.2 Create src/pages/villa/index.astro: /villa/ route rendering Day 1–3 with #day anchors, sticky compact day nav, `<details>` scenes (time, prose, mood, characters, journal notes/quotes) served from the vendored JSON with zero runtime fetches (R1, R2)
- [ ] 2.3 Update index.astro featured card to point at /villa/ first, keeping the main-site simulation link for members (R2)

## 3. Verification

- [ ] 3.1 Run npm run build + astro check: green CI build proves static render of all three days (R1, R5)
- [ ] 3.2 Manual device pass on npm run preview at 320px and 430px: no horizontal scroll, ≥44px targets, villa palette; record evidence in spec (R3)
- [ ] 3.3 Confirm the /villa/ route ships zero client framework JS bundles in dist (R5)
- [ ] 3.4 Add /villa/ + data to the shell precache contract (sw.js precache list lands in salon-pwa-shell; record the manifest that route uses) (R4)
