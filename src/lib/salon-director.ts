import type { SalonRoomState } from './matrix-room-client'
import type { SalonAction, SalonMapContract } from './salon-actions'
import { validateSalonAction } from './salon-actions'

export interface SalonDirectorResponse {
  actions: SalonAction[]
  reply?: string
}

function directorUrl(): string {
  const configured = import.meta.env.PUBLIC_SALON_DIRECTOR_URL
  if (!configured) throw new Error('Configure PUBLIC_SALON_DIRECTOR_URL for the salon director')
  return configured.replace(/\/$/, '')
}

function extractJson(value: unknown): SalonDirectorResponse {
  const raw = typeof value === 'string'
    ? value
    : (value as { reply?: string; response?: string; output?: string } | null)?.reply
      ?? (value as { response?: string } | null)?.response
      ?? (value as { output?: string } | null)?.output
  if (!raw) throw new Error('Salon director returned no structured response')
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? raw
  const parsed = JSON.parse(fenced) as Partial<SalonDirectorResponse>
  if (!Array.isArray(parsed.actions)) throw new Error('Salon director response is missing actions')
  return { actions: parsed.actions, reply: parsed.reply }
}

/**
 * Ask the server-side AI Studio adapter for intent. The browser never receives
 * the Gemini key and never writes Matrix state directly.
 */
export async function requestSalonDirector(
  prompt: string,
  state: SalonRoomState,
  map: SalonMapContract,
  accessToken?: string,
): Promise<SalonDirectorResponse> {
  const response = await fetch(directorUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      prompt,
      state,
      map,
      response_format: 'salon_actions_v1',
    }),
  })
  if (!response.ok) throw new Error(`Salon director failed: ${response.status}`)
  const result = extractJson(await response.json())
  for (const action of result.actions) {
    const validation = validateSalonAction(action, state, map)
    if (!validation.ok) throw new Error(`Rejected salon action: ${validation.reason}`)
  }
  return result
}
