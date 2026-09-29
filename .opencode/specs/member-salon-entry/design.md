# Design: member-salon-entry

## Overview

Two surfaces, two repos, one dependency order: the salon Astro site gains an entry + chat experience (`/villa/enter/`) with Supabase OAuth on its own origin; the `villa-diodati-chat` edge function gains member JWT verification + a server-side playing-window gate + a 6s cadence cap before calling Gemini. Requirement id map: R1 = Member identity, R2 = Playing-window entry, R3 = Member conversation, R4 = Server-side gate, R5 = Abuse guard, R6 = Mobile ergonomics.

## Architecture

```mermaid
flowchart LR
    subgraph salon PWA (static)
      E["/villa/enter/ (Astro + vanilla module)"] --> S["supabase-js client (salon origin)<br/>PUBLIC_SUPABASE_URL/ANON_KEY"]
      E --> SG["salon-schedule engine (shared)"]
    end
    S -- "OAuth (Google/GitHub) + PKCE redirect" --> AUTH[(Supabase Auth)]
    E -- "villa-diodati-chat + member JWT" --> CX["villa-diodati-chat (edge)"]
    CX -- "engine twin: same season windows" --> G1{authed member?}
    G1 -- no --> E401
    G1 -- yes --> G2{playing window?}
    G2 -- no --> E403
    G2 -- yes --> G3{-pacedyclingo >6s?}
    G3 -- no --> LLM["llm-gateway -> gemini-3.1-pro-preview"]
```

## Components and interfaces

### Salon repo: `src/pages/villa/enter/index.astro` (+ `src/scripts/salon-member/`)

- Responsibility: auth-state aware entry view (R1), playing gate (R2, using the shared `salon-schedule` engine), and the chat surface (R3, R6) in villa palette.
- Interface:
  - `src/lib/salon-supabase.ts` — `createSalonSupabase()` reading `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` from env at build time (env.d.ts additions); no service keys.
  - Auth flows: `signInWithOAuth({ provider, options: { redirectTo: `${origin}/villa/enter/` } })` PKCE default; session restore on load; sign-out clears local session (R1).
  - `salon-member/chat-client.mjs` — `sendTurn({ persona, history, text, jwt })` POSTing to `${PUBLIC_SUPABASE_URL}/functions/v1/villa-diodati-chat` with `Authorization: Bearer <jwt>`; maps 401/403/429/5xx to friendly message states (R3, R4-aware).
  - Transcript: `localStorage['villa-diodati-transcript-<userId>-<seasonId>']` (R3).
  - No framework islands: vanilla module `client:load`-equivalent via bundled `<script>` (R6, matches `/villa/` posture).

### Castalia repo: `supabase/functions/villa-diodati-chat/index.ts` (edits, behind integration gate)

- Responsibility: member-only admission before any model spend (R4, R5).
- Interface:
  - Verify caller: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { headers: { Authorization } } }).auth.getUser()` — mirrors `matrix-auth-bridge`'s exact pattern (institutionally established).
  - Window gate: vendored `season-2026-10.json` twin inside the function (single-source note: file copied from salon repo at deploy; a deploy-check comment requires version match); same date-logic as the client engine.
  - Cadence: in-memory Map per isolate `lastTurnAt[userId]`; 429 under 6s (R5; documented per-isolate best-effort).
  - Order: auth → window → cadence → existing persona orchestration (unchanged prompts; model id gemini-3.1-pro-preview from `villa-chat-gemini`).

### Supabase dashboard (operator, behind integration gate)

- Redirect allow-list: `https://salon.castalia.institute/auth/callback` (+ `http://localhost:4321/...` for dev) added to Supabase Auth URL config — one dashboard change, executed once by the operator with the same credentials as the deploy.

## Data models

- Salon env: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` added to GH Actions secrets (same values the repo already uses for `matrix-send-message` — reuse, no new secrets).
- Local transcript records: `{ id, at (ISO), personaId, role: 'member'|'character', text }`.
- No DB migrations; no new tables (transcripts local-first v1).

## Error handling

- OAuth failure/redirect mismatch: entry view shows a retry card naming the provider; never a dead end.
- 401 → "Sign in again" state; 403 → season copy + next window (`Opens Fri 10/9`); 429 → gentle cadence prompt; network/timeout → retry offer preserving the unsent draft.

## Testing strategy

- Unit: salon-side play-day/window mapping already covered by `salon-schedule` tests; add tests for the transcript key schema and the edge function's window gate (portable: vendor the same engine into a test in castalia.institute).
- Local E2E (before deploy): entry view states render correctly at 320px with mocked auth states (no session / session / error).
- Hosted (gated on `villa-chat-gemini` + deploy): anon call → 401; member JWT call outside window → 403; inside window → persona reply via Gemini; 6s double-tap → 429 (R3, R4, R5).

## Risks and trade-offs

- **OAuth origin allow-list is an operator step** — cannot be automated with a tokenless CLI; documented as launch-day runbook item.
- Cadence cap is per-isolate (Supabase edge isolates can reset) — acceptable for friend-graded guardrails; real ledger would need a store (non-goal).
- Season data twin inside the edge function risks drift — mitigated by copy-on-deploy from the salon repo + a header constant comparing versions (build validates).
- localStorage per-season transcripts: device-local (stated); cross-device continuity is a future Matrix-backed feature.

## Traceability recap

- R1 → salon auth module + OAuth redirect flow
- R2 → entry gate (client engine + server twin)
- R3 → chat-client + transcript
- R4 → edge function gate
- R5 → cadence cap
- R6 → mobile ergonomics on `/villa/enter/`
