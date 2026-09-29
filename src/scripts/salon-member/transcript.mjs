/**
 * Local transcript persistence for member salon conversations (R3).
 * Records: { id, at (ISO), personaId, role: 'member'|'character', text }.
 * Keys are per user, per season; seasons clear by explicit season id
 * (season-2026-10.json → "October 2026"), never by date guesswork.
 */

export const TRANSCRIPT_PREFIX = 'villa-diodati-transcript';
export const DRAFT_PREFIX = 'villa-diodati-draft';

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function transcriptKey(userId, seasonId) {
  return `${TRANSCRIPT_PREFIX}-${userId}-${slug(seasonId)}`;
}

export function draftKey(userId, seasonId) {
  return `${DRAFT_PREFIX}-${userId}-${slug(seasonId)}`;
}

export function makeTurn({ personaId, role, text }) {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { id, at: new Date().toISOString(), personaId, role, text };
}

const ROLES = new Set(['member', 'character']);

function sanitizeTurns(turns) {
  if (!Array.isArray(turns)) return [];
  return turns
    .filter((turn) => turn && typeof turn.text === 'string' && ROLES.has(turn.role))
    .map((turn) => ({
      id: typeof turn.id === 'string' ? turn.id : '',
      at: typeof turn.at === 'string' ? turn.at : new Date().toISOString(),
      personaId: typeof turn.personaId === 'string' ? turn.personaId : '',
      role: turn.role,
      text: turn.text,
    }));
}

export function loadTranscript(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return sanitizeTurns(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveTranscript(key, turns) {
  localStorage.setItem(key, JSON.stringify(sanitizeTurns(turns)));
}

export function appendTurn(key, turn) {
  const turns = loadTranscript(key);
  turns.push(turn);
  saveTranscript(key, turns);
  return turns;
}

export function clearTranscript(key) {
  localStorage.removeItem(key);
}

/** The single-companion thread for one persona, in order. */
export function threadFor(turns, personaId) {
  return turns.filter((turn) => turn.personaId === personaId);
}

/** Persona with the most recent activity across all threads, or null. */
export function latestPersona(turns) {
  let latest = null;
  for (const turn of turns) {
    if (!turn.personaId) continue;
    if (!latest || turn.at > latest.at) latest = turn;
  }
  return latest ? latest.personaId : null;
}
