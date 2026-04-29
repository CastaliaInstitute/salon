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

The reference salon is **Villa Diodati** (Lake Geneva, summer 1816): **Lord Byron** as host, with **Percy Shelley**, **Mary Shelley**, and **John Polidori** among the guests—the circle in which *Frankenstein* was conceived.

The live simulation lives on the main institute site: **[Villa Diodati →](https://castalia.institute/salon/villa.diodati)**

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

1. Repo **Settings → Secrets and variables → Actions**: add **`CASTALIA_PLATFORM_READ_TOKEN`** — a fine-grained or classic PAT with **Contents: Read** on **`CastaliaInstitute/castalia-platform`** (the default `GITHUB_TOKEN` cannot clone other private repos).
2. **Settings → Pages → Build and deployment**: source **GitHub Actions**.
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

Satellite site built with [Astro](https://astro.build), [Tailwind](https://tailwindcss.com), and [`@castalia/platform`](https://github.com/CastaliaInstitute/castalia-platform) for the shared Castalia shell—same pattern as [Symposia](https://github.com/InquiryInstitute/symposia). CI checks out that private repo using **`CASTALIA_PLATFORM_READ_TOKEN`** (see above).

**Local clone layout** (so `file:../CastaliaInstitute/castalia-platform` resolves):

```text
~/GitHub/
├── salon/                         ← this repo
└── CastaliaInstitute/
    └── castalia-platform/         ← shared UI package (sibling path)
```

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
├── scripts/copy-404.mjs           # SPA fallback for /live/* deep links
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
