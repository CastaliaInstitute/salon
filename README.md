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

### Three-day realtime cycle

Diodati is a living three-day event, not an archive page. The agent service starts a cycle with the *Fantasmagoriana* reading, then contributes an autonomous historically bounded turn every 12 minutes by default. Visitor remarks may provoke an additional round, but are not required to keep the company speaking.

Every generated Matrix event carries an `org.castalia.salon_cycle` identifier. At 72 hours the service starts a fresh cycle; as soon as its first event arrives, the browser clears the prior cycle from view. The underlying Matrix history remains available for audit while the public experience shows only the current gathering. The transcript automatically follows each arriving turn, and the narrow participation control remains fixed beneath it.

Runtime cadence can be tuned without code changes:

```text
DIODATI_CYCLE_SECONDS=259200
DIODATI_TURN_INTERVAL_SECONDS=720
DIODATI_OPENING_PAUSE_SECONDS=18
DIODATI_ROUND_PAUSE_SECONDS=8
```

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
├── scripts/diodati_realtime.py     # Matrix agents, RAG, and historical guard
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
