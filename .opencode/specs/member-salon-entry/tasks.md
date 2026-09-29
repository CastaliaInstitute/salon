# Tasks: member-salon-entry

<!-- Req id map: R1 Member identity · R2 Playing-window entry · R3 Member conversation · R4 Server-side gate · R5 Abuse guard · R6 Mobile ergonomics. INTEGRATION GATE: tasks 3.x require villa-chat-gemini completion (deployed functions) — do not start them before it completes. -->

## 1. Salon-side auth and entry (no backend needed)

- [ ] 1.1 Add env contract + src/lib/salon-supabase.ts (PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY via build env; no service keys) and env.d.ts types (R1)
- [ ] 1.2 Build /villa/enter/: entry view states (signed-out card with Google/GitHub sign-in; signed-in roster view; error/retry card) mirroring the main site's OAuth helpers (R1)
- [ ] 1.3 Wire playing-window entry to the shared salon-schedule engine: Enter opens only while playing; upcoming shows "Opens Fri M/D"; archived shows "Season closed" (R2)

## 2. Salon-side chat surface (UI ready pre-deploy)

- [ ] 2.1 Build the persona chooser (five characters in villa cards) and chat surface with localStorage per-user/per-season transcript (R3)
- [ ] 2.2 Implement salon-member/chat-client.mjs sendTurn with JWT auth header + 401/403/429/timeout mapping to friendly states and draft preservation (R3, R4-aware)
- [ ] 2.3 Mobile ergonomics: keyboard-aware composer, 44px targets, newest turn in view (R6)
- [ ] 2.4 Local E2E at 320/430px: mock the three states, transcript restore, badge-gated entry (R2, R3, R6)

## 3. Server-side gate (INTEGRATION GATE: after villa-chat-gemini)

- [ ] 3.1 Edit villa-diodati-chat: member JWT verification (matrix-auth-bridge pattern), ordering auth → window → cadence → orchestration (R4)
- [ ] 3.2 Vendor the season windows twin into the function + version-match comment; server window computation identical to client engine (R2, R4)
- [ ] 3.3 Add the 6-second per-member cadence cap with 429 copy (R5)
- [ ] 3.4 Operator step, in deploy session: add salon.castalia.institute/auth/callback (and localhost dev callback) to Supabase Auth redirect allow-list (R1)
- [ ] 3.5 Hosted verification: anon → 401; member out-of-window → 403; member in-window → Gemini persona reply under 30s; 6s double-turn → 429 (R3, R4, R5)
