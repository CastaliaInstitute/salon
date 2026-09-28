# Requirements: salon-pwa-shell

## Overview

Make salon.castalia.institute an installable, mobile-friendly PWA with a service-worker-cached shell, so the October weekends work like an event app: add to Home Screen, quick launch, and the public replay still reads with no connection. Mechanics here; content comes from `villa-3day-replay`.

## Requirements

### Requirement: Installable web app

Visitors who add the salon to Home Screen should get a standalone app experience with correct branding.

#### Scenario: Add to Home Screen

- WHEN Chromium or Safari evaluates installability, THE SYSTEM SHALL pass as installable: valid web app manifest (name, short name, `display: standalone`, `start_url`, theme `#1e1a16` villa dark, background color, 192px and 512px icons including maskable variants) served over HTTPS

#### Scenario: iOS Home Screen

- WHEN an iOS user adds the salon via Safari share sheet, THE SYSTEM SHALL launch standalone (browser-chrome-free) with the correct apple-touch-icon and status-bar styling meta tags

### Requirement: Cached app shell

The salon must survive thin conference-hall Wi-Fi and offline rereads.

#### Scenario: First visit precache

- WHEN the service worker installs, THE SYSTEM SHALL precache the app shell and the villa replay route resources (assets listed by `villa-3day-replay`), using a cache version strategy safe for GitHub Pages deploys

#### Scenario: Offline reread

- IF the user requests a previously visited (or precached) route while offline, THE SYSTEM SHALL serve it from the service-worker cache instead of the network

#### Scenario: Offline unknown route

- IF the user requests an uncached route while offline, THE SYSTEM SHALL render the branded offline fallback page from the cache instead of the browser's error

### Requirement: Deep links stay intact

The existing `/live/*` Matrix mirror and `404.html` SPA fallback must keep working; the PWA must not regress the satellite's existing contract.

#### Scenario: Deep link on slow network

- WHEN `/live/<room-id>` deep links are opened from another app or site, THE SYSTEM SHALL continue rendering the correct room view through the existing `404.html` copy mechanism

### Requirement: Mobile ergonomics

The salon is read on phones at night; layout must respect device chrome.

#### Scenario: Safe areas on notch devices

- THE SYSTEM SHALL set viewport and safe-area handling so content respects iOS/Android display cutouts and home-bar insets

#### Scenario: Medium phone viewport

- WHILE the app renders, THE SYSTEM SHALL remain usable from 320px to 430px viewport width without horizontal scrolling (site-wide baseline)

## Non-functional requirements

### Requirement: Static-only constraint

#### Scenario: Works on GitHub Pages

- THE SYSTEM SHALL implement the service worker and manifest as static assets compatible with GitHub Pages hosting (no server-side code added to the salon repo)

## Non-goals

- Push notifications, background sync, caching the Matrix `/live/*` room data offline (v1 replays chat only online)
- Analytics or install-prompt UX campaigns

## Traceability

- Goal: villa-diodati-salon-pwa (installability + offline success metrics)
- Consumes: `villa-3day-replay` precache list (dependency direction: replay feeds shell's precache set; shell provides the cache R9 requires)
- Feeds: `villa-pwa-launch` (Lighthouse/offline/device verification)
