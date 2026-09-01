'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MatrixRoomClient, resolveRoomAlias, type MatrixMessage } from '../lib/matrix-room-client'

const THREE_DAYS_MS = 72 * 60 * 60 * 1000
const MEMBERSHIP_URL = 'https://castalia.institute/membership'
const FACULTY_PROFILE_ROOT = 'https://castalia.institute/faculty/profile/?h='

interface SpeakerIdentity {
  name: string
  facultyHandle?: string
}

const DIODATI_SPEAKERS: Record<string, SpeakerIdentity> = {
  'a.byron': { name: 'Lord Byron', facultyHandle: 'a.byron' },
  'g.byron': { name: 'Lord Byron', facultyHandle: 'a.byron' },
  'a.maryshelley': { name: 'Mary Godwin', facultyHandle: 'a.maryshelley' },
  'm.godwin': { name: 'Mary Godwin', facultyHandle: 'a.maryshelley' },
  'm.shelley': { name: 'Mary Godwin', facultyHandle: 'a.maryshelley' },
  'a.clairmont': { name: 'Claire Clairmont', facultyHandle: 'a.clairmont' },
  'c.clairmont': { name: 'Claire Clairmont', facultyHandle: 'a.clairmont' },
  'a.shelley': { name: 'Percy Bysshe Shelley', facultyHandle: 'a.shelley' },
  'a.shelley1': { name: 'Percy Bysshe Shelley', facultyHandle: 'a.shelley' },
  'p.shelley': { name: 'Percy Bysshe Shelley', facultyHandle: 'a.shelley' },
  'a.polidori': { name: 'John Polidori', facultyHandle: 'a.polidori' },
  'j.polidori': { name: 'John Polidori', facultyHandle: 'a.polidori' },
  'salon.web': { name: 'A visitor' },
}

function speakerIdentity(message: MatrixMessage): SpeakerIdentity {
  const localpart = message.sender.replace(/^@/, '').split(':', 1)[0].toLowerCase()
  if (!message.cycleId) {
    if (localpart === 'a.shelley') return { name: 'Mary Godwin', facultyHandle: 'a.maryshelley' }
    if (localpart === 'a.shelley1') return { name: 'Percy Bysshe Shelley', facultyHandle: 'a.shelley' }
  }
  return DIODATI_SPEAKERS[localpart] ?? { name: 'A guest' }
}

function currentCycleStart(now: number): number {
  return Math.floor(now / THREE_DAYS_MS) * THREE_DAYS_MS
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
  const clientRef = useRef<MatrixRoomClient | null>(null)
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  const canSend =
    typeof import.meta.env.PUBLIC_SUPABASE_URL === 'string' &&
    !!import.meta.env.PUBLIC_SUPABASE_URL &&
    typeof import.meta.env.PUBLIC_SUPABASE_ANON_KEY === 'string' &&
    !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY

  // Authentication for the satellite is deliberately fail-closed. Until a
  // Castalia member session is handed to this origin, the public room remains
  // an experience rather than an anonymous Matrix posting surface.
  const memberLoggedIn = false
  const canParticipate = canSend && memberLoggedIn

  const visibleMessages = useMemo(() => {
    const latestCycleId = messages.findLast((message) => message.cycleId)?.cycleId
    const taggedCycleMessages = latestCycleId
      ? messages.filter((message) => message.cycleId === latestCycleId)
      : []
    const cycleStart = taggedCycleMessages.length
      ? Math.min(...taggedCycleMessages.map((message) => message.timestamp))
      : currentCycleStart(Date.now())
    return messages.filter((message) => message.timestamp >= cycleStart)
  }, [messages])

  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript) return
    transcript.scrollTo({ top: transcript.scrollHeight, behavior: messages.length ? 'smooth' : 'auto' })
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
        const initial = await client.getRecentMessages(80)
        if (!cancelled) {
          setMessages(initial)
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
      await clientRef.current.sendMessage(text)
      setInput('')
      setStatus('connected')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed')
      setStatus('connected')
    }
  }, [input])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
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
          <div
            ref={transcriptRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
            aria-live="polite"
            aria-relevant="additions"
          >
            {visibleMessages.map((m) => {
              const speaker = speakerIdentity(m)
              return (
                <div key={m.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="mb-1 text-sm font-medium tracking-wide text-slate-500">
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
                  </div>
                  <div className="whitespace-pre-wrap text-slate-900">{m.content}</div>
                </div>
              )
            })}
            {!visibleMessages.length && status === 'connected' && (
              <p className="py-12 text-center italic text-slate-500">Rain crosses the lake. The company is gathering.</p>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-[#111827]/95 p-2.5 backdrop-blur">
            {canParticipate ? (
              <div className="flex items-center gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void onSend()
                    }
                  }}
                  placeholder="Join the conversation…"
                  rows={1}
                  disabled={status !== 'connected'}
                  className="h-10 min-h-10 flex-1 resize-none rounded-md border border-slate-300 px-3 py-1.5 text-slate-900 shadow-sm"
                />
                <button
                  type="button"
                  className="h-10 rounded-md bg-blue-600 px-4 text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={status !== 'connected' || !input.trim()}
                  onClick={() => void onSend()}
                >
                  Send
                </button>
              </div>
            ) : (
              <a
                href={MEMBERSHIP_URL}
                className="flex h-10 w-full items-center justify-center rounded-md border border-slate-500/60 bg-slate-900/70 px-4 text-sm font-medium tracking-wide text-slate-100 hover:border-slate-300 hover:text-white"
              >
                Join to Join
              </a>
            )}
            {sendError && <p className="mt-2 text-sm text-red-300">Your words did not reach the room. Try again.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
