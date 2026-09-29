/**
 * Browser session glue for member salon entry (R1).
 * Persists the Supabase session from src/lib/salon-supabase.ts in
 * localStorage['salon-auth-session'] and drives restore / refresh / sign-out.
 */
import {
  authorizeUrl,
  fetchUser,
  parseAuthFragment,
  refreshTokens,
  revokeSession,
  salonSupabaseConfig,
} from '../../lib/salon-supabase';

export const SESSION_KEY = 'salon-auth-session';
const PROVIDER_KEY = 'salon-auth-provider';

/** Slack so a token is refreshed before it can expire mid-composition. */
const EXPIRY_SLACK_SECONDS = 60;

const CONFIG = salonSupabaseConfig();

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) return null;
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PROVIDER_KEY);
}

export function currentSession() {
  return readSession();
}

export function isConfigured() {
  return CONFIG.configured;
}

/** Remember which provider opened the OAuth redirect (the implicit flow carries no provider name back). */
export function signInWith(provider, redirectTo) {
  if (!CONFIG.configured) throw new Error('Salon entry is not configured');
  localStorage.setItem(PROVIDER_KEY, provider);
  window.location.assign(authorizeUrl(CONFIG, provider, redirectTo));
}

/**
 * Consume an OAuth return URL fragment (tokens arrive in #…) and persist the session.
 * Returns { kind: 'session' | 'error' | 'pkce-code' | 'none', session?, reason? }.
 */
export async function completeOAuthRedirect() {
  if (!CONFIG.configured) return { kind: 'none' };
  const parsed = parseAuthFragment(window.location.hash);
  if (parsed.kind === 'none' && window.location.search) {
    // PKCE-style ?code= return: cannot be exchanged client-side (TODO(supabase-js)).
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) return { kind: 'pkce-code', code };
  }
  if (parsed.kind === 'error') return { kind: 'error', reason: parsed.error, description: parsed.description };
  if (parsed.kind === 'pkce-code') return parsed;
  if (parsed.kind !== 'session') return { kind: 'none' };

  let user;
  try {
    user = await fetchUser(CONFIG, parsed.tokens.accessToken);
  } catch {
    return { kind: 'error', reason: 'user-fetch-failed' };
  }
  const provider =
    parsed.tokens.provider || localStorage.getItem(PROVIDER_KEY) || user.provider || 'unknown';
  const session = {
    access_token: parsed.tokens.accessToken,
    refresh_token: parsed.tokens.refreshToken,
    expires_at: parsed.tokens.expiresAt,
    provider,
    user,
  };
  saveSession(session);
  // Strip the sensitive fragment from the URL and history.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  localStorage.removeItem(PROVIDER_KEY);
  return { kind: 'session', session };
}

/**
 * Restore a session: valid tokens are reused; expired tokens are refreshed once.
 * Returns { session } | { session: null, reason? } (reason = 'refresh-failed').
 */
export async function restoreSession() {
  if (!CONFIG.configured) return { session: null };
  const session = readSession();
  if (!session) return { session: null };
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expires_at - EXPIRY_SLACK_SECONDS > nowSeconds) return { session };

  try {
    const refreshed = await refreshTokens(CONFIG, session.refresh_token);
    let user = session.user;
    if (refreshed.user?.id) user = { ...user, id: refreshed.user.id, email: refreshed.user.email ?? user.email };
    const next = {
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      expires_at: nowSeconds + refreshed.expiresIn,
      provider: session.provider,
      user,
    };
    saveSession(next);
    return { session: next };
  } catch {
    clearSession();
    return { session: null, reason: 'refresh-failed' };
  }
}

/** Sign out: best-effort server revoke, then always clear the local session. */
export async function signOut() {
  const session = readSession();
  if (CONFIG.configured && session?.access_token) {
    await revokeSession(CONFIG, session.access_token);
  }
  clearSession();
}

/** Label used for the member's own turns in the conversation history. */
export function memberLabel(session) {
  const name = session?.user?.fullName;
  if (typeof name === 'string' && name.trim()) return name.trim();
  const email = session?.user?.email;
  if (typeof email === 'string' && email.includes('@')) return email.split('@')[0];
  return 'Member';
}

export function userIdOf(session) {
  return session?.user?.id ?? 'anon';
}
