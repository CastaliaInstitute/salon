# Salon project status

Updated: 2026-07-29  
Repository: `CastaliaInstitute/salon`  
Public URL: GitHub Pages / configured deployment target

## Current state

- **Readiness:** Public Astro presentation layer with a Matrix live-room concept and a Villa Diodati simulation link.
- **Validated source:** Home page, `/live/` route, Matrix room contract, and `castalia.institute/salon/villa.diodati` link are present in source.
- **Change in this review:** Added a grounded observatory-room hero image with a visible provenance line; the image is treated as editorial atmosphere, not documentary evidence.
- **Editorial boundary:** The historical Villa Diodati claims should retain source notes when the simulation becomes a published archive.

## Risks and next actions

1. Run `npm run build` and verify the `/live/` route with a URL-encoded room identifier.
2. Add an explicit privacy/consent policy before replay or transcript storage is enabled.
3. Add a stable data model for hosts, guests, date, source, and replay artifact.

Art provenance: generated editorial still life, saved at `public/assets/salon-observatory.png`.
