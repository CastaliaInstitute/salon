# Tasks: salon-weekend-schedule

<!-- Req id map: R1 Season data · R2 State engine · R3 Badges · R4 Honest failure · R5 Lightweight integration -->

## 1. Data and engine

- [x] 1.1 Create src/data/villa-diodati/season-2026-10.json (five windows, Europe/Zurich, Fri–Sun replay mapping) (R1)
- [x] 1.2 Create src/scripts/salon-schedule/engine.mjs: pure evaluate(windows, playDayMap, nowInfo) with upcoming/playing/archived + nextWindowStartDate + replayDayId (R2)

## 2. Build gate and badges

- [x] 2.1 Create scripts/validate-season.mjs (5 sorted non-overlapping windows, ISO dates, exact mapping keys) and wire it into the npm build chain (R4)
- [x] 2.2 Add badges to index.astro featured card and villa/index.astro kicker (Playing now · Day N / Opens Fri M/D / Season closed; static no-JS default) with the bundled vanilla script consuming engine + season JSON (R3, R5)
- [x] 2.3 Confirm /villa/ stays fetch-free and the badge script adds no framework bundle (R5)

## 3. Verification

- [x] 3.1 Node unit test table for evaluate: before w1, every window on Fri/Sat/Sun, DST-end Oct 25 + CET-boundary Oct 30, between windows, after w5 (R1, R2)
- [x] 3.2 npm run build green (validation gate exercised); preview check of badges on / and /villa/ (R3, R4)
- [x] 3.3 DevTools: badge path issues zero network requests; /villa/ zero runtime fetches retained (R5)
