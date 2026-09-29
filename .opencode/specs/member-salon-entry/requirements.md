# Requirements: member-salon-entry

## Overview

The public sees the static replay; **members** can enter the salon while it plays and interact with the characters and the story. Membership = an authenticated user of the main Castalia Supabase project (`pilmscrodlitdrygabvo`), proven on the salon origin by the same OAuth providers the main site uses (Google / GitHub). Conversations run through the existing `villa-diodati-chat` edge function, now Gemini-backed (`villa-chat-gemini`).

**Integration gate:** tasks that verify or serve the *member chat experience end-to-end* are pinned to the completion of `villa-chat-gemini` (deployed functions). Salon-side UI that does not need the live backend may proceed.

## Requirements

### Requirement: Member identity on the salon PWA

Members bring the identity they already have; no new credential system on the salon site.

#### Scenario: Sign in

- WHEN a visitor taps "Enter the Salon" while signed out, THE SYSTEM SHALL present sign-in with the providers the main site offers (Google, GitHub) and return them to the entry view after completing the OAuth flow back on salon.castalia.institute

#### Scenario: Session continuity

- WHEN a signed-in member returns to the PWA within the session lifetime, THE SYSTEM SHALL restore their authenticated state without re-signing-in

#### Scenario: Sign out

- WHEN a member signs out, THE SYSTEM SHALL clear the local session and return the entry view to its signed-out state

### Requirement: Playing-window entry

The interactive salon is an event: it opens with each weekend window and otherwise politely refuses — including for signed-in members.

#### Scenario: Enter while playing

- WHILE the salon is `playing` and the member is signed in, THE SYSTEM SHALL admit them to the interactive salon view
- WHEN the salon is not `playing` (upcoming or archived), THE SYSTEM SHALL show the entry as unavailable with the reason and, for `upcoming`, the next window start (same copy as the season badge)

### Requirement: Member conversation with the characters

The heart of the member experience: a mobile chat with the Diodati circle.

#### Scenario: Choose a companion

- WHEN the member enters the salon, THE SYSTEM SHALL present the five characters (Byron, Mary, Percy, Polidori, Claire) as the conversation partner options

#### Scenario: Exchange a turn

- WHEN a member sends a message, THE SYSTEM SHALL call the `villa-diodati-chat` edge function with the member's session JWT, a chosen persona, and the running conversation, and render the character's reply
- WHEN a reply arrives, THE SYSTEM SHALL display it within the existing 30-second timeout budget with in-transit feedback

#### Scenario: Transcript persistence

- WHILE a member converses, THE SYSTEM SHALL persist the transcript locally (per user, per season) so returning within the window restores the conversation without any server-side store

### Requirement: Server-side member gate

Client-side hiding is not access control; the edge function is the gate.

#### Scenario: Unauthenticated caller

- WHEN `villa-diodati-chat` receives a request without a valid member session JWT, THE SYSTEM SHALL return 401 with a clear, non-leaking error message and make no model call

#### Scenario: Out-of-window call

- IF an authenticated member calls `villa-diodati-chat` while the salon is not `playing` (computed server-side from the same October season data), THE SYSTEM SHALL return 403 with the next window start and make no model call

### Requirement: Modest abuse guard

Credits are real money; a per-member cadence guard limits runaway loops while staying invisible to behaved guest-speakers.

#### Scenario: Cadence cap

- WHEN a single member issues more than one salon turn within 6 seconds, THE SYSTEM SHALL reject the extra turn with a 429 asking them to pace themselves (per-isolate best-effort, documented)

## Non-functional requirements

### Requirement: Mobile chat ergonomics

#### Scenario: Composing on a phone

- THE SYSTEM SHALL keep the composer reachable with the on-screen keyboard open (viewport-aware), maintain 44px touch targets, and keep the newest turn in view while reading

## Non-goals

- New personas, prompts, RAG/corpus changes (the salon cast is fixed for the season)
- Server-side transcript storage or Matrix-room persistence for member chats (v1 parity with the main-site chat's local transcript)
- Ticketed tiers / entitlement checks beyond "authenticated member"
- Group/scene-orchestrated turns (single-companion exchanges only)

## Traceability

- Goal: villa-diodati-salon-pwa (member success metric: converse with five personas via Gemini, zero OpenRouter)
- Consumes: `villa-chat-gemini` backend (integration gate), `salon-weekend-schedule` engine/state
- Feeds: `villa-pwa-launch` (end-to-end member verification in the installed app)
