# Requirements: salon-weekend-schedule

## Overview

The salon is an event, not an always-on page: it **plays Fri–Sun each weekend in October 2026** (windows Oct 2–4, 9–11, 16–18, 23–25, 30–Nov 1, Europe/Zurich). Between windows the salon is *upcoming* (countdown) or *archived* (season closed). This spec provides the committed schedule data, the client-side state engine, and the badges that overlay the public replay and (later) gate member entry.

## Requirements

### Requirement: Season windows as committed data

The season must be a versioned artifact in the salon repo, reviewable and editable like the rest of the static content.

#### Scenario: Window data

- THE SYSTEM SHALL commit a season data file defining exactly five playing windows — 2026-10-02..04, 09..11, 16..18, 23..25, 30..11-01 — with `timezone: Europe/Zurich` and a weekend→replay-day mapping (Friday→Day 1, Saturday→Day 2, Sunday→Day 3)

### Requirement: Client-side state engine

Static GitHub Pages can't re-render per minute, so state is computed at view time from the committed data — still with zero network calls.

#### Scenario: State at view time

- WHEN a page carrying the schedule engine loads, THE SYSTEM SHALL compute the season state — `upcoming` (before the next window), `playing` (inside a window), `archived` (after the final window) — in Europe/Zurich time from the committed data, without any network request
- WHILE the salon is `playing`, THE SYSTEM SHALL also identify the current replay day (the weekend day currently in progress, per the mapping)
- IF the current time is a Friday/Saturday/Sunday inside a window, THE SYSTEM SHALL map that day to Day 1/2/3 respectively

### Requirement: Public badges on salon surfaces

Visitors must see whether the salon is playing without hunting; the featured card and the replay page are the two public surfaces today.

#### Scenario: Playing

- WHILE the salon is `playing`, THE SYSTEM SHALL label the featured card and the replay header "Playing now · Day N" in the villa palette

#### Scenario: Upcoming

- WHEN the salon is `upcoming`, THE SYSTEM SHALL label both surfaces "Opens Fri <M/D>" naming the next window start

#### Scenario: Archived

- WHEN the salon is `archived`, THE SYSTEM SHALL label both surfaces "Season closed" while the static replay remains fully readable

### Requirement: Honest, quiet failure

The schedule must never masquerade as truth if its data is missing.

#### Scenario: Missing or invalid data

- IF the season data file is absent or fails validation at build time, THE SYSTEM SHALL fail the build (no silent fallback to an invented state)

## Non-functional requirements

### Requirement: Lightweight integration

#### Scenario: Bundle impact

- THE SYSTEM SHALL implement the engine as plain inline/vanilla JS reading committed JSON at runtime, adding no framework bundle to `/` or `/villa/` and keeping `/villa/` a zero-runtime-fetch route

## Non-goals

- Member gating and "Enter the Salon" availability (owned by `member-salon-entry`)
- Notifications, calendars downloads, per-scene "now playing" pointers, or any timezone picker (Europe/Zurich is canonical)
- Season recurrence automation for seasons beyond October 2026 (data-editing covers future seasons)

## Traceability

- Goal: villa-diodati-salon-pwa (October windows success metric)
- Consumes: villa-3day-replay day structure (Day 1–3 ids)
- Feeds: member-salon-entry (playing-state gate), villa-pwa-launch (badge verification at system clock extremes)
