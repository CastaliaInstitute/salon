import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

let salonAuthClient: SupabaseClient | null = null

export function getSalonAuthClient(): SupabaseClient | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || typeof window === 'undefined') return null
  if (!salonAuthClient) {
    salonAuthClient = createClient(url, anonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return salonAuthClient
}

export interface SalonAccess {
  session: Session | null
  isMember: boolean
}

export async function activeSalonAccess(): Promise<SalonAccess> {
  const client = getSalonAuthClient()
  if (!client) return { session: null, isMember: false }
  const {
    data: { session },
  } = await client.auth.getSession()
  if (!session?.user) return { session: null, isMember: false }

  const { data: membership, error } = await client
    .from('memberships')
    .select('status,current_period_end')
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !membership) return { session, isMember: false }
  if (membership.current_period_end && new Date(membership.current_period_end) < new Date()) {
    return { session, isMember: false }
  }
  return { session, isMember: true }
}

export async function sendSalonMagicLink(email: string): Promise<void> {
  const client = getSalonAuthClient()
  if (!client) throw new Error('Salon sign-in is unavailable.')
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/diodati/` },
  })
  if (error) throw error
}

export async function signInToSalonWithGoogle(): Promise<void> {
  const client = getSalonAuthClient()
  if (!client) throw new Error('Salon sign-in is unavailable.')
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/diodati/` },
  })
  if (error) throw error
}
