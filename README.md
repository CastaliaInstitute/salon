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

---

## Development

Satellite site built with [Astro](https://astro.build), [Tailwind](https://tailwindcss.com), and [`@castalia/platform`](https://github.com/CastaliaInstitute/castalia-platform) for the shared Castalia shell—same pattern as [Symposia](https://github.com/InquiryInstitute/symposia).

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
├── src/
│   ├── components/CastaliaShell.tsx
│   ├── layouts/BaseLayout.astro
│   ├── pages/index.astro
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
