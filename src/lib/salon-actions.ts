import type { SalonRoomState } from './matrix-room-client'

export type SalonAction =
  | { type: 'move'; character: string; x?: number; z?: number; room?: string; floor?: 0 | 1 | 2 | 3; direction?: string }
  | { type: 'gesture'; character: string; gesture: 'idle' | 'gesture' | 'speak' }
  | { type: 'say'; character: string; text: string }
  | { type: 'sit'; character: string; seat: string }
  | { type: 'stand'; character: string }
  | { type: 'hold'; character: string; item?: 'book' | 'cup' | 'glass' | 'candelabra' }
  | { type: 'set_avatar'; character: string; avatar: NonNullable<SalonRoomState['avatars']>[string] }

export interface SalonMapContract {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  seats: Record<string, { x: number; z: number; direction?: string }>
  rooms?: Array<{ id: string; floor: 0 | 1 | 2 | 3; x: number; z: number }>
  floorTransitions?: Array<{ id: string; x: number; z: number; levels: Array<0 | 1 | 2 | 3> }>
}

export interface SalonActionResult {
  ok: boolean
  reason?: string
  state?: SalonRoomState
}

/**
 * Tool boundary for an LLM director. It validates intent without allowing the
 * model to write arbitrary Matrix state or place a figure outside the map.
 */
export function validateSalonAction(action: SalonAction, state: SalonRoomState, map: SalonMapContract): SalonActionResult {
  const position = state.positions[action.character]
  if (!position && !state.participants?.[action.character]) return { ok: false, reason: `Unknown character: ${action.character}` }

  if (action.type === 'move') {
    const room = action.room ? map.rooms?.find((candidate) => candidate.id === action.room) : undefined
    if (action.room && !room) return { ok: false, reason: `Unknown room: ${action.room}` }
    const hasCoordinates = Number.isFinite(action.x) && Number.isFinite(action.z)
    if (!room && !hasCoordinates) return { ok: false, reason: 'Move coordinates or a room are required' }
    if (action.floor != null && ![0, 1, 2, 3].includes(action.floor)) return { ok: false, reason: 'Move floor must be 0, 1, 2, or 3' }
    const { minX, maxX, minZ, maxZ } = map.bounds
    if (room ? (room.x < minX || room.x > maxX || room.z < minZ || room.z > maxZ) : (action.x! < minX || action.x! > maxX || action.z! < minZ || action.z! > maxZ)) return { ok: false, reason: 'Move target is outside the salon map' }
  }
  if (action.type === 'say' && (!action.text.trim() || action.text.length > 1200)) return { ok: false, reason: 'Speech must contain 1–1200 characters' }
  if (action.type === 'sit') {
    if (!map.seats[action.seat]) return { ok: false, reason: `Unknown seat: ${action.seat}` }
    const occupied = Object.values(state.participants ?? {}).some((participant) => participant.seat === action.seat)
      || Object.values(state.positions).some((candidate) => candidate.seat === action.seat)
    if (occupied) return { ok: false, reason: `Seat is occupied: ${action.seat}` }
  }
  return { ok: true }
}

/** Apply one already-validated action to a copy suitable for a Matrix state event. */
export function applySalonAction(action: SalonAction, input: SalonRoomState, map: SalonMapContract): SalonRoomState {
  const result = validateSalonAction(action, input, map)
  if (!result.ok) throw new Error(result.reason)
  const state: SalonRoomState = structuredClone(input)
  const current = state.positions[action.character] ?? (state.positions[action.character] = { x: 0, z: 0 })
  if (action.type === 'move') { const destination = action.room ? map.rooms?.find((candidate) => candidate.id === action.room) : undefined; Object.assign(current, { x: destination?.x ?? action.x!, z: destination?.z ?? action.z!, floor: destination?.floor ?? action.floor ?? current.floor ?? 1, direction: action.direction, animation_state: 'walk' }) }
  if (action.type === 'gesture') current.animation_state = action.gesture
  if (action.type === 'say') { state.activeSpeaker = action.character; current.animation_state = 'speak' }
  if (action.type === 'sit') { Object.assign(current, { x: map.seats[action.seat].x, z: map.seats[action.seat].z, direction: map.seats[action.seat].direction, seat: action.seat, animation_state: 'sit' }) }
  if (action.type === 'stand') { delete current.seat; current.animation_state = 'idle' }
  if (action.type === 'hold') current.held = action.item
  if (action.type === 'set_avatar') state.avatars = { ...(state.avatars ?? {}), [action.character]: action.avatar }
  state.updatedAt = new Date().toISOString()
  return state
}
