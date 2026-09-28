# Goal: villa-diodati-salon-pwa

## Outcome

Make the Villa Diodati salon an installable, mobile-friendly PWA at salon.castalia.institute whose conversation is powered by gemini-3.1-pro-preview via Google AI Studio credits.

**Product shape:** the salon is a *playing* event, not an always-on page — the public sees a static replay of the three-day conversation (Fri–Sun each weekend in October 2026); signed-in members can enter the salon during those windows and interact with the characters and the story.

## Success metrics

- Public (no auth) on a 375px phone viewport: the three-day replay is readable and navigable, cached offline, and the PWA passes the Lighthouse installable check.
- Signed-in member during an October Fri–Sun window: converses with the five personas (Byron, Mary, Percy, Polidori, Claire); replies come from `gemini-3.1-pro-preview` via the Supabase edge functions; zero OpenRouter requests in network traffic.
- All five October windows (Oct 2–4, 9–11, 16–18, 23–25, 30–Nov 1) show the correct weekend state (upcoming countdown / playing / archived).
- `salon.castalia.institute` deploys green via GitHub Actions and both experiences are verified in the installed app.

## Constraints

- **Deadline:** playable by Thu Oct 1, 2026 — first window opens Fri Oct 2 (Europe/Zurich).
- Salon repo stays static GitHub Pages (Astro); no server-side code added there.
- All AI calls go through Supabase edge functions; keys server-side only (`GEMINI_API_KEY`), never in client code.
- Google AI Studio (Gemini API, `gemini-3.1-pro-preview`) is the only LLM provider for this goal; the OpenRouter / key-service path is retired for the salon.
- Member auth reuses the existing Castalia member identity from the main site; no new credential system.

## Specs

<!-- Machine-parsed list: one spec per line, dependency order top to bottom.
     - <feature>                     no dependencies, start here
     - <feature> (depends: a, b)     starts only when a and b are complete
     Specs themselves live in .opencode/specs/<feature>/ and each goes through the
     three-gate workflow (requirements -> design -> tasks -> implement). -->

- villa-3day-replay
- villa-chat-gemini
- salon-pwa-shell
- salon-weekend-schedule (depends: villa-3day-replay)
- member-salon-entry (depends: villa-chat-gemini, salon-weekend-schedule)
- villa-pwa-launch (depends: salon-pwa-shell, salon-weekend-schedule, member-salon-entry)