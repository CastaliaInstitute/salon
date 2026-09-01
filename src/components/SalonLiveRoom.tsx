'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MatrixRoomClient, resolveRoomAlias, type MatrixMessage } from '../lib/matrix-room-client'
import {
  activeSalonAccess,
  getSalonAuthClient,
  sendSalonMagicLink,
  signInToSalonWithGoogle,
} from '../lib/salon-auth'

const THREE_DAYS_MS = 72 * 60 * 60 * 1000
const EVENT_HOUR_MOUNTAIN = 18
const DIODATI_2026_OPENINGS = [
  { date: [2026, 9, 18], accessTier: 'registered-preview' },
  { date: [2026, 9, 25], accessTier: 'registered-preview' },
  { date: [2026, 10, 2], accessTier: 'member' },
  { date: [2026, 10, 9], accessTier: 'member' },
  { date: [2026, 10, 16], accessTier: 'member' },
  { date: [2026, 10, 23], accessTier: 'member' },
  { date: [2026, 10, 30], accessTier: 'member' },
] as const
const TEST_OPENING_AT = import.meta.env.PUBLIC_DIODATI_TEST_OPENING_AT?.trim()
const TEST_OPENING_START = TEST_OPENING_AT ? Date.parse(TEST_OPENING_AT) : undefined
if (TEST_OPENING_AT && !Number.isFinite(TEST_OPENING_START)) {
  throw new Error('PUBLIC_DIODATI_TEST_OPENING_AT must be an ISO 8601 date and time')
}
const MEMBERSHIP_URL = 'https://castalia.institute/membership'
const FACULTY_PROFILE_ROOT = 'https://castalia.institute/faculty/profile/?h='
// USNO for Villa Diodati (46.22 N, 6.18 E) gives civil twilight ending
// 20:07 UTC on 15 June 1816. Apparent solar noon was 11:35 UTC, placing
// Geneva apparent solar time about 25 minutes ahead: darkness at ~20:32.
const SIMULATION_START_UTC = Date.UTC(1816, 5, 15, 20, 32, 0)

interface SpeakerIdentity {
  name: string
  facultyHandle?: string
  bustUrl?: string
}

const DIODATI_SPEAKERS: Record<string, SpeakerIdentity> = {
  'a.byron': { name: 'Lord Byron', facultyHandle: 'a.byron', bustUrl: 'https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/byron/bust_frontal.png' },
  'g.byron': { name: 'Lord Byron', facultyHandle: 'a.byron', bustUrl: 'https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/byron/bust_frontal.png' },
  'a.maryshelley': { name: 'Mary Godwin', facultyHandle: 'a.maryshelley', bustUrl: 'https://inquiry-institute-assets.s3.amazonaws.com/busts/maryshelley/bust_frontal.png' },
  'm.godwin': { name: 'Mary Godwin', facultyHandle: 'a.maryshelley', bustUrl: 'https://inquiry-institute-assets.s3.amazonaws.com/busts/maryshelley/bust_frontal.png' },
  'm.shelley': { name: 'Mary Godwin', facultyHandle: 'a.maryshelley', bustUrl: 'https://inquiry-institute-assets.s3.amazonaws.com/busts/maryshelley/bust_frontal.png' },
  'a.clairmont': { name: 'Claire Clairmont', facultyHandle: 'a.clairmont', bustUrl: 'https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/clairmont/bust_frontal.png' },
  'c.clairmont': { name: 'Claire Clairmont', facultyHandle: 'a.clairmont', bustUrl: 'https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/clairmont/bust_frontal.png' },
  'a.shelley': { name: 'Percy Bysshe Shelley', facultyHandle: 'a.shelley', bustUrl: 'https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/shelley/bust_frontal.png' },
  'a.shelley1': { name: 'Percy Bysshe Shelley', facultyHandle: 'a.shelley', bustUrl: 'https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/shelley/bust_frontal.png' },
  'p.shelley': { name: 'Percy Bysshe Shelley', facultyHandle: 'a.shelley', bustUrl: 'https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/shelley/bust_frontal.png' },
  'a.polidori': { name: 'John Polidori', facultyHandle: 'a.polidori', bustUrl: 'https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/polidori/bust_frontal.png' },
  'j.polidori': { name: 'John Polidori', facultyHandle: 'a.polidori', bustUrl: 'https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/polidori/bust_frontal.png' },
  'salon.web': { name: 'A visitor' },
}

function speakerIdentity(message: MatrixMessage): SpeakerIdentity {
  const localpart = message.sender.replace(/^@/, '').split(':', 1)[0].toLowerCase()
  if (!message.cycleId) {
    if (localpart === 'a.shelley') return DIODATI_SPEAKERS['a.maryshelley']
    if (localpart === 'a.shelley1') return DIODATI_SPEAKERS['a.shelley']
  }
  return DIODATI_SPEAKERS[localpart] ?? { name: 'A guest' }
}

function currentCycleStart(now: number): number {
  return Math.floor(now / THREE_DAYS_MS) * THREE_DAYS_MS
}

function mountainParts(at: Date) {
  const entries = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(at)
  return Object.fromEntries(entries.map((entry) => [entry.type, entry.value]))
}

function denverEpoch(year: number, month: number, day: number, hour: number): number {
  const approximate = Date.UTC(year, month - 1, day, hour)
  const parts = mountainParts(new Date(approximate))
  const represented = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  )
  return approximate - (represented - approximate)
}

interface SalonWindow {
  start: number
  open: boolean
  nextStart?: number
  seasonComplete: boolean
  testMode: boolean
  accessTier: 'registered-preview' | 'member'
}

function scheduledSalonWindow(now: number): SalonWindow {
  if (TEST_OPENING_START !== undefined) {
    if (now < TEST_OPENING_START) {
      return {
        start: TEST_OPENING_START,
        open: false,
        nextStart: TEST_OPENING_START,
        seasonComplete: false,
        testMode: true,
        accessTier: 'member',
      }
    }
    return {
      start: TEST_OPENING_START,
      open: now < TEST_OPENING_START + THREE_DAYS_MS,
      seasonComplete: now >= TEST_OPENING_START + THREE_DAYS_MS,
      testMode: true,
      accessTier: 'member',
    }
  }
  const openings = DIODATI_2026_OPENINGS.map(({ date: [year, month, day], accessTier }) => ({
    start: denverEpoch(year, month, day, EVENT_HOUR_MOUNTAIN),
    accessTier,
  }))
  for (const opening of openings) {
    if (now < opening.start) {
      return {
        start: opening.start,
        open: false,
        nextStart: opening.start,
        seasonComplete: false,
        testMode: false,
        accessTier: opening.accessTier,
      }
    }
    if (now < opening.start + THREE_DAYS_MS) {
      return {
        start: opening.start,
        open: true,
        seasonComplete: false,
        testMode: false,
        accessTier: opening.accessTier,
      }
    }
  }
  return {
    start: openings[openings.length - 1].start,
    open: false,
    seasonComplete: true,
    testMode: false,
    accessTier: 'member',
  }
}

function formatOpening(start?: number): string {
  if (!start) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(start))
}

function isLegacyTravellerExchange(message: MatrixMessage): boolean {
  if (message.cycleId) return false
  const localpart = message.sender.replace(/^@/, '').split(':', 1)[0].toLowerCase()
  if (localpart === 'salon.web') return true
  return /\b(?:travell?er|visitor|our guest|dear guest|welcome|draw up a chair|what brings you)\b/i.test(
    message.content,
  )
}

function simulatedDate(message: MatrixMessage): Date {
  if (message.simulatedAt) return new Date(message.simulatedAt)
  const cycleEpoch = message.cycleId?.match(/diodati-(\d+)/)?.[1]
  const realCycleStart = cycleEpoch
    ? Number(cycleEpoch) * 1000
    : currentCycleStart(message.timestamp)
  return new Date(SIMULATION_START_UTC + Math.max(0, message.timestamp - realCycleStart))
}

function formatSimulatedTime(message: MatrixMessage): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(simulatedDate(message))
}

function parseRoomRef(splat: string | undefined): string {
  if (!splat || !splat.trim()) return ''
  const decoded = decodeURIComponent(splat.replace(/\/+$/, ''))
  return decoded.trim()
}

interface SalonLiveRoomProps {
  roomRef?: string
  salonTitle?: string
  salonSubtitle?: string
}

export function SalonLiveRoom({
  roomRef,
  salonTitle = 'Salon room',
  salonSubtitle = 'This page mirrors a Matrix room: agents and guests chat here.',
}: SalonLiveRoomProps) {
  const params = useParams()
  const splat = params['*'] ?? ''
  const roomRefRaw = useMemo(() => roomRef?.trim() || parseRoomRef(splat), [roomRef, splat])

  const [resolvedRoomId, setResolvedRoomId] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [messages, setMessages] = useState<MatrixMessage[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<string>('idle')
  const [sendError, setSendError] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isMember, setIsMember] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authStatus, setAuthStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [authError, setAuthError] = useState<string | null>(null)
  const [selectedDraft, setSelectedDraft] = useState<MatrixMessage | null>(null)
  const [wallClock, setWallClock] = useState(() => Date.now())
  const clientRef = useRef<MatrixRoomClient | null>(null)
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const transcriptHydratedRef = useRef(false)

  const salonWindow = useMemo(() => scheduledSalonWindow(wallClock), [wallClock])
  const isSignedIn = !!accessToken
  const canParticipate = isSignedIn && (
    salonWindow.accessTier === 'registered-preview' || isMember
  )
  const needsMembership = isSignedIn && salonWindow.accessTier === 'member' && !isMember

  useEffect(() => {
    const timer = window.setInterval(() => setWallClock(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!salonWindow.open) setSelectedDraft(null)
  }, [salonWindow.open])

  useEffect(() => {
    if (!selectedDraft) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedDraft(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedDraft])

  useEffect(() => {
    let cancelled = false
    const refreshAccess = async () => {
      const access = await activeSalonAccess()
      if (!cancelled) {
        setAccessToken(access.session?.access_token ?? null)
        setIsMember(access.isMember)
        if (access.session && (salonWindow.accessTier === 'registered-preview' || access.isMember)) {
          setAuthOpen(false)
        }
      }
    }
    void refreshAccess()
    const client = getSalonAuthClient()
    const subscription = client?.auth.onAuthStateChange(() => {
      void refreshAccess()
    }).data.subscription
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [salonWindow.accessTier])

  const visibleMessages = useMemo(() => {
    if (!salonWindow.open) return []
    const latestCycleId = messages.findLast((message) => message.cycleId)?.cycleId
    const taggedCycleMessages = latestCycleId
      ? messages.filter((message) => message.cycleId === latestCycleId)
      : []
    const cycleStart = taggedCycleMessages.length
      ? Math.max(salonWindow.start, Math.min(...taggedCycleMessages.map((message) => message.timestamp)))
      : salonWindow.start
    return messages.filter(
      (message) => message.timestamp >= cycleStart
        && message.timestamp < salonWindow.start + THREE_DAYS_MS
        && !isLegacyTravellerExchange(message),
    )
  }, [messages, salonWindow])

  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript || !visibleMessages.length) return
    if (!transcriptHydratedRef.current) {
      transcript.scrollTop = transcript.scrollHeight
      transcriptHydratedRef.current = true
      return
    }
    transcript.scrollTo({ top: transcript.scrollHeight, behavior: 'smooth' })
  }, [visibleMessages.length])

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      setResolveError(null)
      setResolvedRoomId(null)
      if (!roomRefRaw) {
        setStatus('no-room')
        return
      }

      setStatus('resolving')
      if (roomRefRaw.startsWith('!')) {
        setResolvedRoomId(roomRefRaw)
        setStatus('ready')
        return
      }

      const alias = roomRefRaw.startsWith('#') ? roomRefRaw : `#${roomRefRaw}`
      const id = await resolveRoomAlias(alias)
      if (cancelled) return
      if (!id) {
        setResolveError('Could not resolve room alias. Check the Matrix server and alias.')
        setStatus('error')
        return
      }
      setResolvedRoomId(id)
      setStatus('ready')
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [roomRefRaw])

  useEffect(() => {
    if (!resolvedRoomId) {
      transcriptHydratedRef.current = false
      clientRef.current?.disconnect()
      clientRef.current = null
      setMessages([])
      return
    }

    const client = new MatrixRoomClient(resolvedRoomId)
    clientRef.current = client

    let cancelled = false

    void (async () => {
      try {
        setStatus('connecting')
        await client.connect()
        const initial = await client.getRecentMessages(500)
        if (!cancelled) {
          // Joining a live salon begins at its present turn. History remains in
          // Matrix for audit. Weekend manuscript artifacts remain available,
          // while ordinary conversation is never machine-replayed.
          const safe = initial.filter((message) => !isLegacyTravellerExchange(message))
          const latestCycleId = safe.findLast((message) => message.cycleId)?.cycleId
          const currentCycle = latestCycleId
            ? safe.filter((message) => message.cycleId === latestCycleId)
            : safe
          const drafts = currentCycle.filter((message) => message.draft)
          const presentTurn = currentCycle.filter((message) => !message.draft).slice(-1)
          setMessages([...drafts, ...presentTurn].sort((left, right) => left.timestamp - right.timestamp))
          setStatus('connected')
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setResolveError(e instanceof Error ? e.message : 'Connection failed')
        }
      }
    })()

    const unsub = client.onMessage((msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    })

    return () => {
      cancelled = true
      unsub()
      client.disconnect()
      clientRef.current = null
    }
  }, [resolvedRoomId])

  const onSend = useCallback(async () => {
    const text = input.trim()
    if (!text || !clientRef.current) return
    setSendError(null)
    try {
      setStatus('sending')
      if (!accessToken) {
        setAuthOpen(true)
        return
      }
      await clientRef.current.sendMessage(text, accessToken)
      setInput('')
      setStatus('connected')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed')
      setStatus('connected')
    }
  }, [input, accessToken])

  const onMagicLink = useCallback(async (event: React.FormEvent) => {
    event.preventDefault()
    if (!authEmail.trim()) return
    setAuthError(null)
    setAuthStatus('sending')
    try {
      await sendSalonMagicLink(authEmail.trim())
      setAuthStatus('sent')
    } catch (error) {
      setAuthStatus('idle')
      setAuthError(error instanceof Error ? error.message : 'The magic link could not be sent.')
    }
  }, [authEmail])

  const onGoogle = useCallback(async () => {
    setAuthError(null)
    try {
      await signInToSalonWithGoogle()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Google sign-in could not begin.')
    }
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <header className="mb-8">
        <h1 className="mb-3 text-3xl font-light tracking-wide text-slate-900">{salonTitle}</h1>
        <p className="text-slate-600">
          {salonSubtitle}{' '}
          {!roomRef && (
            <>
              Share a link with the room id or alias after{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-sm text-slate-800">/live/</code>.
            </>
          )}
        </p>
      </header>

      {!roomRefRaw && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-700 shadow-sm">
          <p className="mb-3 font-medium text-slate-900">No room in the URL.</p>
          <p className="mb-2 text-sm text-slate-600">Example:</p>
          <pre className="overflow-x-auto rounded bg-slate-900 p-4 text-sm text-slate-100">
            {`${typeof window !== 'undefined' ? window.location.origin : 'https://salon.castalia.institute'}/live/${encodeURIComponent('!xxxxxxxx:matrix.example.org')}`}
          </pre>
          <p className="mt-3 text-sm text-slate-500">
            Use a room id (<code className="text-slate-800">!id:server</code>) or alias (
            <code className="text-slate-800">#name:server</code>) in the path (URL-encoded).
          </p>
        </div>
      )}

      {roomRefRaw && resolveError && <p className="mb-4 text-red-300">The salon cannot be heard just now.</p>}

      {resolvedRoomId && status !== 'error' && (
        <div className="flex h-[calc(100dvh-17rem)] min-h-[16rem] max-h-[660px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-inner">
          <div className="shrink-0 border-b border-slate-200 px-4 py-2 text-xs tracking-widest text-slate-500">
            {salonWindow.open
              ? salonWindow.accessTier === 'registered-preview'
                ? 'FREE SNEAK PREVIEW · REGISTRATION REQUIRED · 15 JUNE 1816'
                : 'MEMBERS’ SALON · 15 JUNE 1816 · 20:32 GENEVA SOLAR TIME'
              : salonWindow.seasonComplete
                ? salonWindow.testMode
                  ? 'THE TEST SALON HAS CLOSED'
                  : 'THE OCTOBER 2026 SEASON HAS CLOSED'
                : `${salonWindow.accessTier === 'registered-preview' ? 'NEXT FREE PREVIEW' : 'NEXT MEMBERS’ SALON'} · ${formatOpening(salonWindow.nextStart).toUpperCase()} MOUNTAIN TIME`}
          </div>
          <div
            ref={transcriptRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
            aria-live="polite"
            aria-relevant="additions"
          >
            {visibleMessages.map((m) => {
              const speaker = speakerIdentity(m)
              return (
                <div key={m.id} className="flex gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  {speaker.facultyHandle && speaker.bustUrl && (
                    <a
                      href={`${FACULTY_PROFILE_ROOT}${encodeURIComponent(speaker.facultyHandle)}`}
                      className="mt-0.5 shrink-0"
                      aria-label={`${speaker.name} FacultAI profile`}
                    >
                      <img
                        src={speaker.bustUrl}
                        alt=""
                        width={48}
                        height={48}
                        loading="lazy"
                        className="h-12 w-12 rounded-full border border-slate-500/40 bg-slate-900/90 object-contain p-0.5 shadow-sm"
                      />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium tracking-wide text-slate-500">
                    {speaker.facultyHandle ? (
                      <a
                        href={`${FACULTY_PROFILE_ROOT}${encodeURIComponent(speaker.facultyHandle)}`}
                        className="text-inherit underline decoration-slate-500/40 underline-offset-4 hover:decoration-current"
                      >
                        {speaker.name}
                      </a>
                    ) : (
                      speaker.name
                    )}
                      <time dateTime={simulatedDate(m).toISOString()} className="text-xs font-normal tracking-wider opacity-75">
                        {formatSimulatedTime(m)} · Geneva solar time
                      </time>
                    </div>
                    {m.draft ? (
                      <button
                        type="button"
                        onClick={() => setSelectedDraft(m)}
                        className="group w-full rounded-lg border border-amber-700/30 bg-amber-50/70 p-3 text-left shadow-sm transition hover:border-amber-600/60 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        aria-label={`Open ${m.draft.title}`}
                      >
                        <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-amber-800">
                          {m.draft.label} · Draft {m.draft.revision}
                        </span>
                        <span className="block font-serif text-lg text-slate-900">{m.draft.title}</span>
                        <span className="mt-1 block text-sm text-slate-600 group-hover:text-slate-900">
                          Open the manuscript →
                        </span>
                      </button>
                    ) : (
                      <div className="whitespace-pre-wrap text-slate-900">{m.content}</div>
                    )}
                  </div>
                </div>
              )
            })}
            {!visibleMessages.length && status === 'connected' && (
              <p className="py-12 text-center italic text-slate-500">
                {salonWindow.open
                  ? 'Rain crosses the lake. The company is gathering.'
                  : salonWindow.seasonComplete
                    ? salonWindow.testMode
                      ? 'The test candles have gone out. The October season remains undisturbed.'
                      : 'The candles have gone out. Villa Diodati will return in another season.'
                    : `Rain crosses the lake. On ${formatOpening(salonWindow.nextStart)}, Byron will open Fantasmagoriana. ${salonWindow.accessTier === 'registered-preview' ? 'Register free to enter.' : 'Castalia members may enter.'}`}
              </p>
            )}
          </div>

        </div>
      )}

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-600/50 bg-[#0b1020]/95 px-3 py-3 shadow-[0_-14px_35px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <label htmlFor="salon-entry" className="sr-only">Enter the salon</label>
          <textarea
            id="salon-entry"
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              if (event.target.value && !canParticipate) setAuthOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (canParticipate) {
                  if (salonWindow.open) void onSend()
                } else {
                  setAuthOpen(true)
                }
              }
            }}
            placeholder="Enter the salon…"
            rows={1}
            className="h-11 min-h-11 flex-1 resize-none rounded-md border border-slate-500/70 bg-slate-950/80 px-3 py-2 text-slate-100 shadow-inner placeholder:text-slate-400 focus:border-amber-400 focus:outline-none"
          />
          <button
            type="button"
            className="h-11 rounded-md bg-amber-500 px-4 font-medium text-slate-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={status !== 'connected' || !input.trim() || (canParticipate && !salonWindow.open)}
            onClick={() => {
              if (canParticipate && salonWindow.open) void onSend()
              else setAuthOpen(true)
            }}
          >
            {canParticipate
              ? (salonWindow.open ? 'Send' : salonWindow.testMode ? 'Test closed' : 'Next salon')
              : needsMembership ? 'Join' : 'Register'}
          </button>
        </div>
        {sendError && <p className="mx-auto mt-1 max-w-3xl text-xs text-red-300">Your words did not reach the room. Try again.</p>}
      </footer>

      {selectedDraft?.draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedDraft(null)
          }}
        >
          <article
            role="dialog"
            aria-modal="true"
            aria-labelledby="diodati-draft-title"
            className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-amber-800/40 bg-[#fffaf0] p-6 text-slate-900 shadow-2xl sm:p-8"
          >
            <div className="mb-6 flex items-start justify-between gap-4 border-b border-amber-900/15 pb-4">
              <div>
                <p className="mb-1 text-xs uppercase tracking-[0.2em] text-amber-800">
                  {selectedDraft.draft.label} · Draft {selectedDraft.draft.revision}
                </p>
                <h2 id="diodati-draft-title" className="font-serif text-2xl">
                  {selectedDraft.draft.title}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {speakerIdentity(selectedDraft).name} · {formatSimulatedTime(selectedDraft)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDraft(null)}
                className="text-2xl leading-none text-slate-500 hover:text-slate-950"
                aria-label="Close manuscript"
              >
                ×
              </button>
            </div>
            <div className="whitespace-pre-wrap font-serif text-[1.05rem] leading-8 text-slate-800">
              {selectedDraft.content}
            </div>
            <p className="mt-8 border-t border-amber-900/15 pt-3 text-xs uppercase tracking-widest text-slate-500">
              Written in character through Castalia ask-faculty
            </p>
          </article>
        </div>
      )}

      {authOpen && !canParticipate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="salon-auth-title"
            className="w-full max-w-md rounded-xl border border-slate-600 bg-[#111827] p-6 text-slate-100 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="salon-auth-title" className="mb-1 text-2xl font-medium">
                  {needsMembership ? 'Membership required' : 'Register for the preview'}
                </h2>
                <p className="text-sm text-slate-300">
                  {needsMembership
                    ? 'The September previews are free. October salons are reserved for Castalia members.'
                    : 'Your draft is waiting. Register or sign in before the company can hear or acknowledge you.'}
                </p>
              </div>
              <button type="button" onClick={() => setAuthOpen(false)} className="text-2xl leading-none text-slate-400 hover:text-white" aria-label="Close entry dialog">×</button>
            </div>

            {needsMembership ? (
              <a
                href={MEMBERSHIP_URL}
                className="block w-full rounded-md bg-amber-500 px-4 py-3 text-center font-medium text-slate-950 hover:bg-amber-400"
              >
                Join Castalia
              </a>
            ) : (
                <button
                  type="button"
                  onClick={() => void onGoogle()}
                  className="mb-4 flex w-full items-center justify-center rounded-md border border-slate-500 bg-white px-4 py-2.5 font-medium text-slate-900 hover:bg-slate-100"
                >
                  Continue with Google
                </button>
            )}
            {!needsMembership && (
              <>
                <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
                  <span className="h-px flex-1 bg-slate-700" />or email magic link<span className="h-px flex-1 bg-slate-700" />
                </div>

                {authStatus === 'sent' ? (
                  <p className="rounded-md border border-emerald-700/60 bg-emerald-950/40 p-3 text-sm text-emerald-200">
                    Check your email. The link will return you to this salon.
                  </p>
                ) : (
                  <form onSubmit={(event) => void onMagicLink(event)} className="flex gap-2">
                    <label htmlFor="salon-email" className="sr-only">Email address</label>
                    <input
                      id="salon-email"
                      type="email"
                      required
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={authStatus === 'sending' || !authEmail.trim()}
                      className="rounded-md bg-amber-500 px-3 py-2 font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                    >
                      {authStatus === 'sending' ? 'Sending…' : 'Send link'}
                    </button>
                  </form>
                )}
                <p className="mt-4 text-center text-xs text-slate-400">
                  Free preview registration does not require a paid membership.
                </p>
              </>
            )}
            {authError && <p className="mt-3 text-sm text-red-300">{authError}</p>}
          </section>
        </div>
      )}
    </div>
  )
}
