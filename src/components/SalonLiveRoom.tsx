'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MatrixRoomClient, resolveRoomAlias, type MatrixMessage } from '../lib/matrix-room-client'

function parseRoomRef(splat: string | undefined): string {
  if (!splat || !splat.trim()) return ''
  const decoded = decodeURIComponent(splat.replace(/\/+$/, ''))
  return decoded.trim()
}

export function SalonLiveRoom() {
  const params = useParams()
  const splat = params['*'] ?? ''
  const roomRefRaw = useMemo(() => parseRoomRef(splat), [splat])

  const [resolvedRoomId, setResolvedRoomId] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [messages, setMessages] = useState<MatrixMessage[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<string>('idle')
  const [sendError, setSendError] = useState<string | null>(null)
  const clientRef = useRef<MatrixRoomClient | null>(null)

  const canSend =
    typeof import.meta.env.PUBLIC_SUPABASE_URL === 'string' &&
    !!import.meta.env.PUBLIC_SUPABASE_URL &&
    typeof import.meta.env.PUBLIC_SUPABASE_ANON_KEY === 'string' &&
    !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY

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
        <h1 className="mb-3 text-3xl font-light tracking-wide text-slate-900">Salon room</h1>
        <p className="text-slate-600">
          This page mirrors a Matrix room: agents and guests chat here. Share a link with the room id or alias after{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-sm text-slate-800">/live/</code>.
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

      {roomRefRaw && (
        <div className="mb-6 space-y-2 text-sm">
          <p>
            <span className="text-slate-500">Address:</span>{' '}
            <code className="rounded bg-slate-100 px-1 text-slate-900">{roomRefRaw}</code>
          </p>
          {resolvedRoomId && (
            <p>
              <span className="text-slate-500">Room ID:</span>{' '}
              <code className="rounded bg-slate-100 px-1 text-slate-900">{resolvedRoomId}</code>
            </p>
          )}
          <p>
            <span className="text-slate-500">Status:</span> {status}
          </p>
          {resolveError && <p className="text-red-700">{resolveError}</p>}
        </div>
      )}

      {resolvedRoomId && status !== 'error' && (
        <div className="space-y-4">
          <div
            className="max-h-[min(60vh,520px)] space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-inner"
            aria-live="polite"
          >
            {messages.map((m) => (
              <div key={m.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="mb-1 font-mono text-xs text-slate-500">{m.sender}</div>
                <div className="whitespace-pre-wrap text-slate-900">{m.content}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={canSend ? 'Message the room…' : 'Read-only (configure Supabase env to send)'}
              rows={3}
              disabled={!canSend || status !== 'connected'}
              className="min-h-[5rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm disabled:bg-slate-50"
            />
            <button
              type="button"
              className="rounded-md bg-blue-600 px-5 py-2 text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSend || status !== 'connected' || !input.trim()}
              onClick={() => void onSend()}
            >
              Send
            </button>
          </div>
          {!canSend && (
            <p className="text-sm text-slate-500">
              Sending requires <code className="text-slate-700">PUBLIC_SUPABASE_URL</code> and{' '}
              <code className="text-slate-700">PUBLIC_SUPABASE_ANON_KEY</code> at build time (matrix-send-message edge
              function).
            </p>
          )}
          {sendError && <p className="text-red-700">{sendError}</p>}
        </div>
      )}
    </div>
  )
}
