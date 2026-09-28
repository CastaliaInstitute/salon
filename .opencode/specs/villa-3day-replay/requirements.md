# Requirements: villa-3day-replay

## Overview

Give the public (unauthenticated visitors) a readable, mobile-first replay of the Villa Diodati salon as a static conversation across three days (June 15–17, 1816), presented on salon.castalia.institute. No AI, no auth, and no runtime network calls for the replay content itself.

Source content already exists in CastaliaInstitute/castalia.institute: `villa-diodati/agenda.json` (three days, timed scenes with `scene`, `mood`, `characters`, `notes`, Europe/Zurich time) and `villa-diodati/journal-capsule.json` (persona voice, themes, motifs, quotes, journal notes for Mary, Percy, Byron, Polidori, Claire). The replay is a *static conversation*: scene content and persona voices are committed data in this repo, consumed at build time.

## Requirements

### Requirement: Static public replay

The salon's public face is the replay — it must read without sign-in and without any runtime AI service, so it can play every October weekend deterministically and offline.

#### Scenario: First visit from the featured card

- WHEN a visitor opens the Villa Diodati entry from the salon index, THE SYSTEM SHALL present the replay without requiring sign-in
- WHILE the replay renders, THE SYSTEM SHALL make no runtime calls to any LLM provider or third-party content API

### Requirement: Three-day structure and navigation

The replay mirrors the historical weekend: three days, each with timed scenes, so a visitor can consume the conversation the way the salon unfolded.

#### Scenario: Open replay

- WHEN the replay opens, THE SYSTEM SHALL present the three days (Fri–Sun framing over 1816-06-15..17) with day navigation (Day 1 / Day 2 / Day 3)

#### Scenario: Read a day

- WHEN a day is selected, THE SYSTEM SHALL list that day's scenes in chronological order, each showing its 1816 time, scene description, mood, and participating characters

#### Scenario: Open a scene

- WHEN a scene is opened, THE SYSTEM SHALL present the scene's conversation content plus, where available, the participants' journal notes from the persona capsule

### Requirement: Mobile-first presentation

Most visits come from phones mid-weekend; the replay must read cleanly at hand width in the villa palette.

#### Scenario: Small-phone viewport

- WHILE the replay renders, THE SYSTEM SHALL remain usable between 320px and 430px viewport width without horizontal scrolling

#### Scenario: Touch targets

- THE SYSTEM SHALL render all interactive targets in the replay with a minimum 44x44 CSS px touch target

#### Scenario: Villa look

- THE SYSTEM SHALL present the replay in the warm dark villa palette consistent with the index `.villa-theme` card

### Requirement: Offline readiness

The replay is a resident artifact for installed PWA users; once visited it must survive no-connection moments (caching mechanics owned by `salon-pwa-shell`).

#### Scenario: Offline reread

- IF the visitor is offline after having visited the replay, THE SYSTEM SHALL render the replay from the service-worker cache (`salon-pwa-shell`), with replay pages and data included as precache candidates

## Non-functional requirements

### Requirement: Lightweight public path

#### Scenario: Static weight

- THE SYSTEM SHALL render the public replay without client-side framework code on the replay route (plain HTML/CSS with minimal JS), so first load stays light on mobile

## Non-goals

- Live AI conversation, member sign-in, and "Enter the Salon" interactivity — owned by `villa-chat-gemini` and `member-salon-entry`
- Server-side code in the salon repo (stays static GitHub Pages)
- Scholarly apparatus; scenes are faithful reconstructions, not annotated sources

## Traceability

- Goal: villa-diodati-salon-pwa (public replay success metric)
- Feeds: `salon-weekend-schedule` (three-day structure drives Fri–Sun windows), `salon-pwa-shell` (precache list), `villa-pwa-launch` (end-to-end verification)
