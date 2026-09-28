# Requirements: villa-chat-gemini

## Overview

Switch the Villa Diodati conversation backend from OpenRouter to Google AI Studio (Gemini API), so the salon runs on the institute's Google AI Studio credits. Model: `gemini-3.1-pro-preview` (user-confirmed; Gemini 2.5 is deprecated with ~Oct 16, 2026 shutdown). All key material stays server-side in Supabase edge function secrets.

Current chain: client → `villa-diodati-chat` (host orchestration: 5 personas, temperature 0.92, max_tokens 500, last-8-turn truncation) → `llm-gateway` (OpenAI-compat surface, OpenRouter-only, `openai/gpt-oss-120b` default, Railway key-service fallback) → OpenRouter.

## Requirements

### Requirement: Gemini provider routing

Member chat must be answered by Google AI Studio so its credits pay for the salon.

#### Scenario: Persona turn

- WHEN `villa-diodati-chat` requests a persona reply, THE SYSTEM SHALL call Google AI Studio's OpenAI-compatible Gemini endpoint with the `gemini-3.1-pro-preview` model id, passing the persona prompt and conversation history unchanged from the current edge function behavior
- WHEN a gateway request omits a model, THE SYSTEM SHALL default to `gemini-3.1-pro-preview`

### Requirement: OpenAI-compatible surface preserved

Existing clients (web chat, tests, SDK users) must keep working across the provider swap.

#### Scenario: Same response contract

- WHEN the gateway returns a successful reply, THE SYSTEM SHALL keep the existing `villa-diodati-chat` → client contract (`{ message, actions?, format: 'text' }`) unchanged
- WHILE the salon route serves chat completions, THE SYSTEM SHALL remain OpenAI-compatible (messages in, chat.completions out)

### Requirement: OpenRouter retirement for the salon

No salon traffic or fallback may quietly flow to OpenRouter; credits and observability must be single-provider.

#### Scenario: Normal operation

- WHILE `GEMINI_API_KEY` is configured, THE SYSTEM SHALL make zero requests to `openrouter.ai` and zero calls to the Railway key-rotation service on the salon route

#### Scenario: Keep-salon-simple

- THE SYSTEM SHALL remove the salon's reliance on `openai/gpt-oss-120b:free` as the requested model in `villa-diodati-chat`

### Requirement: Server-side key only

The Google AI Studio key belongs to the institute and must never reach the browser.

#### Scenario: Key storage

- THE SYSTEM SHALL read `GEMINI_API_KEY` from Supabase edge function secrets (e.g. `supabase secrets set GEMINI_API_KEY`), never from `import.meta.env` or client bundles

### Requirement: Failure transparency

Night owls on phones need an honest error, not a hang, when upstream fails.

#### Scenario: Upstream error

- IF the Gemini call fails (missing key, 4xx/5xx from Google), THE SYSTEM SHALL return an OpenAI-compat error response naming the provider and upstream status, with no key material included

#### Scenario: Still-latency-bounded

- THE SYSTEM SHALL return persona replies within the chat UX's existing 30-second timeout under normal Gemini latency

## Non-functional requirements

### Requirement: Prompt behavior preserved

#### Scenario: Persona fidelity

- THE SYSTEM SHALL preserve the existing model config in `villa-diodati-chat`: temperature 0.92, max_tokens 500, per-persona system prompts, temporal constraints, and last-8-turn history truncation

## Non-goals

- Any client-side Gemini calls
- RAG corpus changes, persona authoring, or new characters (prompt content is stable in this spec)
- Migrating other institute features (faculty chat, tournaments) off OpenRouter — salon route only

## Traceability

- Goal: villa-diodati-salon-pwa (member-experience success metric; zero OpenRouter traffic)
- Feeds: `member-salon-entry` (interactive chat consumes this route), `villa-pwa-launch` (verification: replies arrive via Gemini)
