/**
 * Member chat client for the villa-diodati-chat edge function (R3).
 *
 * Request body mirrors the deployed function exactly (supabase/functions/
 * villa-diodati-chat/index.ts): { speaker, cue?, history: [{ speaker, content }] }.
 * There is no `message` key — the member's words are appended to `history` as
 * the final turn so the function renders them into RECENT CONVERSATION.
 * Response: { message, actions?, format }.
 */

export const REQUEST_TIMEOUT_MS = 30_000;

export function chatEndpoint(config) {
  return `${config.url}/functions/v1/villa-diodati-chat`;
}

/**
 * Send one member turn.
 * @param {object} params
 * @param {string} params.endpoint    Edge function URL
 * @param {string} params.jwt         Member access token
 * @param {string} [params.anonKey]   Publishable anon key (apikey header, mirrors main-site callEdgeFunction)
 * @param {string} params.personaId   Persona id, e.g. 'mary-shelley'
 * @param {Array<{speaker: string, content: string}>} params.history  Thread so far, member turn excluded
 * @param {string} params.text        Member's message
 * @param {string} [params.memberLabel] Speaker label for the member's turn in history
 * @returns {Promise<{ok: true, message: string, actions?: string[], format?: string}
 *                  | {ok: false, reason: 'auth'|'window'|'cadence'|'network'|'server', status?: number, detail?: string}>}
 */
export async function sendTurn({ endpoint, jwt, anonKey, personaId, history, text, memberLabel = 'Member' }) {
  const body = {
    speaker: personaId,
    history: [...history, { speaker: memberLabel, content: text }],
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`,
  };
  if (anonKey) headers.apikey = anonKey;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) return { ok: false, reason: 'auth', status: 401 };
  if (response.status === 403) {
    const problem = await response.json().catch(() => null);
    return { ok: false, reason: 'window', status: 403, detail: problem?.error ?? undefined };
  }
  if (response.status === 429) {
    const problem = await response.json().catch(() => null);
    return { ok: false, reason: 'cadence', status: 429, detail: problem?.error ?? undefined };
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    return { ok: false, reason: 'server', status: response.status, detail: problem?.error ?? undefined };
  }

  const data = await response.json().catch(() => null);
  const message = data?.message;
  if (typeof message !== 'string' || !message.trim()) {
    return { ok: false, reason: 'server', status: response.status };
  }
  return { ok: true, message: message.trim(), actions: data.actions, format: data.format };
}

/**
 * Split a persona turn into speech beats: the optional `<pause>` marker becomes
 * a beat break; a trailing `[Emotion: …]` tag is peeled off for quiet display.
 */
export function formatSpeech(message) {
  const emotionMatch = message.match(/\[Emotion:\s*([^\]]+)\]\s*$/i);
  const emotion = emotionMatch ? emotionMatch[1].trim() : null;
  const withoutEmotion = emotionMatch ? message.slice(0, emotionMatch.index).trim() : message;
  const beats = withoutEmotion
    .split(/<pause>/i)
    .map((beat) => beat.trim())
    .filter(Boolean);
  return { beats, emotion };
}
