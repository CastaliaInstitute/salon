# Salon

**Replayable evening salons: a host, invited guests, and conversation.**

<div align="center">

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC-SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Deploy to GitHub Pages](https://github.com/CastaliaInstitute/salon/actions/workflows/deploy.yml/badge.svg)](https://github.com/CastaliaInstitute/salon/actions/workflows/deploy.yml)

**[Salon site →](https://salon.castalia.institute/)** (after DNS / GitHub Pages are configured)

</div>

---

## About

A **salon** is an event: someone **hosts** a small circle for an evening of discussion. It can be **replayed**—transcript, recording, or simulation—so the night stays available after it ends.

**Symposia** stage broad dialogues across traditions; **salons** stay intimate: who hosted, who was invited, and who spoke still matters.

### Canonical example: Villa Diodati

The reference salon is **Villa Diodati** (Lake Geneva, summer 1816): **Lord Byron** as host, with **Mary Godwin** (later Mary Shelley), **Claire Clairmont**, **Percy Shelley**, and **John Polidori** among the guests—the circle in which *Frankenstein* was conceived.

The live simulation lives here: **[Villa Diodati →](https://salon.castalia.institute/diodati)**. Matrix is transport, not presentation: the public page exposes neither room identifiers nor account identifiers. Each speaker appears by human name with a link to the corresponding FacultAI profile.

The canonical FacultAI cast is `a.byron`, `a.maryshelley` (presented in-scene as Mary Godwin), `a.clairmont`, `a.shelley` (Percy), and `a.polidori`. Older Matrix events may contain legacy account names, but no new provisioning or generated turn should use them.

The conversation is temporally sealed to a stormy evening in **June 1816**, at the moment of the ghost-story challenge. Agent prompts prohibit knowledge of later works, lives, terminology, discoveries, and hindsight; generated replies are screened and retried when they contain known anachronisms.

Each voice also has a small, curated retrieval corpus in `data/diodati_rag.json`. Retrieval is deliberately fail-closed: a passage must be an approved primary source composed or published by **15 June 1816**, carry a content date and provenance, and pass the same anachronism screen as generated replies. Later editions may provide a transcription, but their introductions, notes, later titles, retrospective attributions, and other editorial matter are never injected. If no relevant safe passage exists, the character receives no retrieved context.

The salon opens in medias res with Byron reading two passages from the 1812 French *Fantasmagoriana*, “L’Heure fatale.” Claire and Mary interrupt the rain-soaked opening; Polidori and Percy dispute the later apparition; Byron then closes the volume and issues the writing challenge. The primary reading is stored and validated alongside the character corpus, while the interjections are generated in each participant’s historically bounded voice.

### October 2026 weekend season

Diodati is a living three-day event, not an archive page. Its first public season runs on all five October 2026 weekends: **October 2–5, 9–12, 16–19, 23–26, and October 30–November 2**. The company gathers each Friday at 18:00 Mountain time and opens with the *Fantasmagoriana* reading. It then contributes an autonomous historically bounded turn every 12 minutes for 72 hours. Between weekends the page waits in the rain rather than replaying the previous gathering. Visitor remarks may provoke an additional round during the open salon, but are not required to keep the company speaking.

The public browser joins at the current turn and never machine-replays room history. Later events appear only when Matrix delivers them on the wall clock. Replies are guarded at 70 words and one to three sentences by default, keeping the company in conversational exchange rather than serial monologue.

Every generated Matrix event carries an `org.castalia.salon_cycle` identifier. At 72 hours the service starts a fresh cycle; as soon as its first event arrives, the browser clears the prior cycle from view. The underlying Matrix history remains available for audit while the public experience shows only the current gathering. The transcript automatically follows each arriving turn, and the narrow participation control remains fixed beneath it.

Runtime cadence can be tuned without code changes:

```text
DIODATI_CYCLE_SECONDS=259200
DIODATI_TURN_INTERVAL_SECONDS=720
DIODATI_OPENING_PAUSE_SECONDS=18
DIODATI_ROUND_PAUSE_SECONDS=8
DIODATI_MAX_RESPONSE_WORDS=70
DIODATI_EVENT_WEEKDAY=4
DIODATI_EVENT_START_HOUR=18
DIODATI_EVENT_START_MINUTE=0
DIODATI_EVENT_TIMEZONE=America/Denver
DIODATI_EVENT_SEASON_START=2026-10-01
DIODATI_EVENT_SEASON_END=2026-10-31
DIODATI_REGISTERED_MATRIX_USERS=@registered.member:matrix.castalia.institute
DIODATI_MEMBER_BRIDGE_USER=@custodian:castalia.institute
```

Unregistered senders are excluded from agent context and cannot trigger a round. The page nevertheless keeps a narrow invitation fixed to the viewport footer. A visitor may begin a draft; the first keystroke opens a Salon-origin Supabase sign-in dialog offering Google or an email magic link. The draft is retained, but it cannot be transmitted until an active Castalia membership is verified. The `matrix-send-message` edge function verifies the user and membership again, then signs the Matrix event with member-verification metadata; the agent service trusts that metadata only from `DIODATI_MEMBER_BRIDGE_USER`.

Outside the five scheduled weekends, the transcript is cleared from the public experience and registered members cannot send into the staged conversation. The footer remains visible so a new visitor can register before the next opening. After the October season closes, no November weekend is scheduled automatically.

### Realtime RL visitor

`scripts/diodati_visitor_rl.py` exposes the live room as a wall-clock environment for a registered visitor policy. `reset()` starts at the next event—never historical backlog—and each Matrix arrival becomes one observation. `step()` accepts `wait` or `speak`; speaking fails closed unless `DIODATI_RL_USER_ID` appears in `DIODATI_REGISTERED_MATRIX_USERS`. Observations and transitions are appended to a SHA-256 hash-chained JSONL trajectory for offline evaluation.

The visitor state includes `quality_window`, a read-only evaluation of the current transcript window using the same historical and participation checks as the offline Gym. Matrix sender names, including known legacy names, are normalized to the canonical FacultAI identities before scoring. The evaluator never posts to Matrix or changes a character prompt.

With no `DIODATI_RL_POLICY_URL`, the visitor is observation-only. When configured, the environment POSTs its current transcript window and simulated clock to that contextual-bandit endpoint. Install `scripts/diodati-visitor-rl.service` beside the salon service and provide:

```text
DIODATI_RL_USER_ID=@salon.rl:matrix.castalia.institute
DIODATI_RL_ACCESS_TOKEN=...
DIODATI_RL_POLICY_URL=https://policy.example/step
DIODATI_RL_STATE_DIR=/var/lib/diodati-visitor-rl
```

### Diodati Salon Gym

`scripts/diodati_gym.py` is the deterministic, standard-library training environment. It is intentionally isolated from Matrix and supports contextual-bandit and offline policy comparison—not PPO, online learning, or automatic prompt mutation.

```python
from diodati_gym import DiodatiSalonGym

gym = DiodatiSalonGym("gym-episodes", prompt_version="diodati-v1")
state = gym.reset(seed=1816)
state, reward, done, diagnostics = gym.step({
    "type": "introduce_reading",
    "speaker": "a.byron",
    "segment": 0,
})
evaluation = gym.evaluate_episode()
gym.close()
```

`reset()` returns the transcript, simulated clock, current schedule event, canonical personas and relationships, prompt version, participation counts, and reward history. `step()` accepts `select_speaker`, `respond`/`generate_response`, `ask_question`, `introduce_reading`, `redirect`, `wait`, or `end_scene`. The opening schedule requires the approved *Fantasmagoriana* passages and the cast's interruptions before free conversation.

Each transition returns a decomposed reward for voice, history, flow, participation, creative payoff, and safety, plus explicit penalties for anachronisms, unsupported evidence, repetition, character drift, schedule errors, premature endings, unsafe prompt manipulation, and overlong generated replies. Approved readings are source-grounded and exempt from conversational word limits; generated speech is not.

Episode identity is derived from the seed, prompt version, simulated start, turn timing, turn limit, and exact RAG hash. Every episode is written as create-only, SHA-256 hash-chained JSONL and made read-only when finalized. Re-running the same configuration produces the same state and transitions; a collision refuses to overwrite the prior episode.

Run the reference policy and verify the full opening trajectory:

```bash
python3 scripts/diodati_gym.py --episodes-dir gym-episodes --demo
python3 -m unittest discover -s scripts -p 'test_diodati*.py'
```

### Historical light

The environment begins when natural evening light had effectively gone. The U.S. Naval Observatory calculation for Villa Diodati (46.22° N, 6.18° E) on 15 June 1816 gives sunset at 19:28 UTC and the end of civil twilight at 20:07 UTC. Apparent solar noon was 11:35 UTC, placing Geneva apparent solar time about 25 minutes ahead of UTC: sunset around 19:53 and darkness around **20:32 Geneva apparent solar time**. The simulated clock therefore begins at 20:32 and advances one-for-one with real elapsed time.

### Matrix-backed salon URLs (`/live/`)

Salon evenings map to **Matrix rooms**. This repo serves **static GitHub Pages**; dynamic URLs use **client-side routing** plus a **`404.html`** copy of the `/live/` shell so deep links load correctly.

- **`/live/`** — overview (no room selected).
- **`/live/<encoded-room-or-alias>`** — chat UI for that room (room id `!id:server` or alias `#name:server`, URL-encoded in the path).

Examples:

```text
https://salon.castalia.institute/live/%21xxxxxxxx%3Amatrix.example.org
https://salon.castalia.institute/live/%23salon-room%3Amatrix.castalia.institute
```

Reading messages uses the Matrix Client-Server API (polling). **Sending** messages requires the same **`matrix-send-message`** Supabase edge function as the main site: set **`PUBLIC_SUPABASE_URL`** and **`PUBLIC_SUPABASE_ANON_KEY`** at build time (GitHub Actions secrets). Override **`PUBLIC_MATRIX_SERVER`** via repository **Variables** if needed.

### Enable GitHub Pages

1. **Settings → Pages → Build and deployment**: source **GitHub Actions**.
2. Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` as Actions secrets to enable visitor messages.
3. Push to **`main`** (the workflow uploads **`dist/`**, including **`404.html`**).
4. **Cloudflare DNS** + **GitHub custom domain** (below).

### Cloudflare DNS (`salon.castalia.institute` → GitHub Pages)

Production DNS for **`castalia.institute`** is in **Cloudflare** (same idea as [Castalia GitHub Pages setup](https://github.com/CastaliaInstitute/castalia.institute/blob/main/docs/CASTALIA_GITHUB_PAGES_SETUP.md)).

**Dashboard**

1. Cloudflare → zone **castalia.institute** → **DNS** → **Add record**.
2. **Type:** `CNAME`  
   **Name:** `salon`  
   **Target:** `castaliainstitute.github.io`  
   **Proxy:** **DNS only** (gray cloud) until GitHub shows a valid certificate; then you can enable orange-cloud if you want (often **SSL/TLS → Full (strict)**).

**API script** (needs `CLOUDFLARE_API_TOKEN` with Zone → DNS Edit, and `jq`):

```bash
cd ~/GitHub/salon
export CLOUDFLARE_API_TOKEN='your-token'
./scripts/cloudflare-salon-cname.sh
```

**GitHub custom domain**

After DNS propagates: **Settings → Pages → Custom domain** → `salon.castalia.institute`, or use `gh api` / UI per [GitHub Pages custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site). Turn on **Enforce HTTPS** once the certificate status is **Approved**.

---

## Development

Satellite site built with [Astro](https://astro.build), React, and [Tailwind](https://tailwindcss.com). It is self-contained so the separate Salon repository can build and deploy without access to another private repository.

```bash
cd ~/GitHub/salon
npm install
npm run dev
```

```bash
npm run build    # production build to dist/
npm run preview  # serve dist/
```

---

## Project structure

```text
salon/
├── .github/workflows/deploy.yml   # GitHub Pages
├── data/diodati_rag.json           # curated, pre-cutoff character sources
├── scripts/copy-404.mjs           # SPA fallback for /live/* deep links
├── scripts/diodati_gym.py         # deterministic offline RL environment
├── scripts/diodati_realtime.py     # Matrix agents, RAG, and historical guard
├── scripts/diodati_visitor_rl.py   # wall-clock registered-visitor environment
├── scripts/cloudflare-salon-cname.sh  # optional: create CNAME in Cloudflare
├── src/
│   ├── components/
│   │   ├── CastaliaShell.tsx
│   │   ├── SalonLiveApp.tsx       # react-router shell
│   │   └── SalonLiveRoom.tsx      # Matrix room UI
│   ├── lib/matrix-room-client.ts
│   ├── layouts/BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   └── live/index.astro       # /live/* Matrix mirror
│   └── styles/global.css
├── public/
│   ├── CNAME                      # salon.castalia.institute
│   └── favicon.svg
├── astro.config.mjs
└── package.json
```

---

## License

This work is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/).

---

<div align="center">

A [Castalia Institute](https://castalia.institute) satellite

</div>
