# Tasks: villa-chat-gemini

<!-- Repo: CastaliaInstitute/castalia.institute (edge functions live there). Req id map: R1 Gemini provider routing · R2 OpenAI-compatible surface · R3 OpenRouter retirement (salon) · R4 Server-side key only · R5 Failure transparency · R6 Prompt behavior preserved -->

## 1. Gateway provider router

- [x] 1.1 In supabase/functions/llm-gateway/index.ts add resolveUpstream(model) (gemini- prefix → Google AI Studio OpenAI-compat URL + GEMINI_API_KEY) and the Google executor reusing the forwarded-subset passing; keep OpenRouter branch untouched for other models (R1, R2)
- [x] 1.2 Implement LLM_GATEWAY_DEFAULT_PROVIDER=gemini default-toggle and provider-aware key checks (R1, R3)
- [x] 1.3 Map Google upstream errors to OpenAI-compat shape with provider tag; no key material in responses (R5)

## 2. Salon chat switch

- [x] 2.1 In supabase/functions/villa-diodati-chat/index.ts request model gemini-3.1-pro-preview (replacing openai/gpt-oss-120b:free); leave personas, temperature 0.92, max_tokens 500, 8-turn truncation unchanged (R1, R3, R6)

## 3. Deploy and verify (hosted)

- [x] 3.1 Set GEMINI_API_KEY as an edge secret on the linked project (ref pilmscrodlitdrygabvo — corrected from the stale xougqdomkoisrxdnagcj doc) via supabase secrets set (R4)
- [x] 3.2 Deploy llm-gateway and villa-diodati-chat to the hosted project (R2)
- [x] 3.3 Hosted probe: scripted curl session — all five personas return first-person replies via gemini-3.1-pro-preview; response contract unchanged (R2, R6)
- [x] 3.4 Hosted probe: assert zero openrouter.ai / key-service requests occur during the salon run; verify error-path honesty with a deliberately bad key in a staging secret check (R3, R5)
- [x] 3.5 Document the new model id + LLM_GATEWAY_MODELS env in the gateway README for future id bumps (R1)
