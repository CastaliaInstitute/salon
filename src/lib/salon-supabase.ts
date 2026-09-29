/**
 * Minimal, dependency-free Supabase Auth helper for the member salon entry (R1).
 * Talks to the same Supabase project as the main Castalia site using only the
 * publishable anon key: OAuth redirect (implicit flow — tokens arrive in the
 * URL fragment), token refresh, user fetch, and logout.
 *
 * TODO(supabase-js): if @supabase/supabase-js is ever added to package.json,
 * replace this module with createClient(url, anonKey).auth.* and keep only the
 * `salon-auth-session` localStorage key (see src/scripts/salon-member/salon-auth.mjs).
 * Until then, a PKCE (?code=...) return cannot be exchanged client-side — the
 * entry view shows the TODO(supabase-js) error card instead of a dead end.
 */

export interface SalonSupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SalonUser {
  id: string;
  email?: string;
  fullName?: string;
  provider?: string;
}

export interface SalonSessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds */
  expiresAt: number;
  provider?: string;
}

export interface SalonAuthSession extends SalonSessionTokens {
  user: SalonUser;
}

export type SalonAuthFragment =
  | { kind: 'session'; tokens: SalonSessionTokens }
  | { kind: 'error'; error: string; description?: string }
  | { kind: 'pkce-code'; code: string }
  | { kind: 'none' };

export type SalonSupabaseConfigResult =
  | ({ configured: true } & SalonSupabaseConfig)
  | { configured: false };

/** Read PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY at build time. */
export function salonSupabaseConfig(): SalonSupabaseConfigResult {
  const url = typeof import.meta.env.PUBLIC_SUPABASE_URL === 'string'
    ? import.meta.env.PUBLIC_SUPABASE_URL.replace(/\/$/, '')
    : undefined;
  const anonKey = typeof import.meta.env.PUBLIC_SUPABASE_ANON_KEY === 'string'
    ? import.meta.env.PUBLIC_SUPABASE_ANON_KEY
    : undefined;
  if (!url || !anonKey) return { configured: false };
  return { configured: true, url, anonKey };
}

/** OAuth authorize entry point. No code_challenge → implicit flow: the session
 *  returns in the URL fragment of `redirectTo` (never a server roundtrip). */
export function authorizeUrl(config: SalonSupabaseConfig, provider: 'google' | 'github', redirectTo: string): string {
  const params = new URLSearchParams({ provider, redirect_to: redirectTo });
  return `${config.url}/auth/v1/authorize?${params.toString()}`;
}

/** Parse the Supabase implicit-flow fragment: #access_token=…&refresh_token=…&expires_in=… */
export function parseAuthFragment(fragment: string): SalonAuthFragment {
  if (!fragment) return { kind: 'none' };
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!raw) return { kind: 'none' };
  const params = new URLSearchParams(raw);

  const code = params.get('code');
  if (code && !params.get('access_token')) return { kind: 'pkce-code', code };

  const error = params.get('error');
  if (error) {
    return { kind: 'error', error, description: params.get('error_description') ?? undefined };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = Number(params.get('expires_in'));
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) return { kind: 'none' };

  const provider = params.get('provider') ?? undefined;
  return {
    kind: 'session',
    tokens: {
      accessToken,
      refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      provider,
    },
  };
}

function authHeaders(config: SalonSupabaseConfig, accessToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: config.anonKey,
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

interface SupabaseAuthUserResponse {
  id?: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
  identities?: { provider?: string }[];
}

function mapUser(raw: SupabaseAuthUserResponse, fallbackProvider?: string): SalonUser {
  return {
    id: raw.id ?? '',
    email: raw.email ?? undefined,
    fullName: raw.user_metadata?.full_name ?? raw.user_metadata?.name ?? undefined,
    provider: raw.identities?.[0]?.provider ?? fallbackProvider,
  };
}

/** GET /auth/v1/user with the member's JWT. Throws on non-2xx. */
export async function fetchUser(config: SalonSupabaseConfig, accessToken: string): Promise<SalonUser> {
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: authHeaders(config, accessToken),
  });
  if (!response.ok) throw new Error(`Supabase /auth/v1/user failed: ${response.status}`);
  const raw = (await response.json()) as SupabaseAuthUserResponse;
  return mapUser(raw);
}

/** POST /auth/v1/token?grant_type=refresh_token — rotates tokens for the session. */
export async function refreshTokens(
  config: SalonSupabaseConfig,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; user?: SupabaseAuthUserResponse }> {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: authHeaders(config),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) throw new Error(`Supabase refresh failed: ${response.status}`);
  const raw = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: SupabaseAuthUserResponse;
  };
  if (!raw.access_token || !raw.refresh_token) throw new Error('Supabase refresh response missing tokens');
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresIn: raw.expires_in ?? 3600,
    user: raw.user,
  };
}

/** Best-effort global logout; local cleanup is the caller's responsibility. */
export async function revokeSession(config: SalonSupabaseConfig, accessToken: string): Promise<void> {
  try {
    await fetch(`${config.url}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: authHeaders(config, accessToken),
    });
  } catch {
    // Best-effort: network failures must not block local sign-out.
  }
}
