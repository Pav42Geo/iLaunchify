'use client'

// Messages dock (Pavel 2026-07-13) — Facebook-style stacked mini-chat windows,
// pinned bottom-right ACROSS the Co-Creation Studio. A thread minimized from
// the full /messages hub (or opened here) keeps the conversation going —
// presence, typing, role badges, attachments — while you work on briefs and
// rooms. The expand icon returns to the full hub exactly where you left off.
//
// Deliberately a LEAN sibling of MessagesShell, not a refactor of it: the dock
// shares the same server actions + message shape (ShellChatMessage), so the
// two views can never disagree about data; heavier affordances (object-attach
// picker, load-earlier, @mentions) live behind the expand icon. State is
// localStorage + a custom event, so the dock survives navigation and the hub
// can talk to it without a provider.

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '../lib/utils'
import type { ShellAttachmentMeta, ShellChatMessage, ShellResult, ShellThreadPresence } from './MessagesShell'

// ── dock store (localStorage + custom event) ────────────────────────────────

export interface DockThreadRef {
  kind: 'room' | 'dm'
  id: string
  title: string
  icon?: string
}

interface DockItem extends DockThreadRef {
  min: boolean
}

const STORE_KEY = 'ilf-messages-dock'
const DOCK_EVENT = 'ilf-messages-dock-changed'
const MAX_OPEN = 3
const MAX_ITEMS = 6

function readDock(): DockItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is DockItem =>
        !!x && typeof x === 'object' && ((x as DockItem).kind === 'room' || (x as DockItem).kind === 'dm') &&
        typeof (x as DockItem).id === 'string' && typeof (x as DockItem).title === 'string',
    ).slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

function writeDock(items: DockItem[]) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
    window.dispatchEvent(new Event(DOCK_EVENT))
  } catch {
    /* storage unavailable — dock is a convenience, never an error */
  }
}

/** Add (or surface) a thread in the dock. Called by the hub's minimize icon. */
export function dockThread(ref: DockThreadRef) {
  const items = readDock().filter((i) => !(i.kind === ref.kind && i.id === ref.id))
  const openCount = items.filter((i) => !i.min).length
  // Newest arrives OPEN; overflow beyond MAX_OPEN panels minimizes the oldest open.
  if (openCount >= MAX_OPEN) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]
      if (item && !item.min) {
        item.min = true
        break
      }
    }
  }
  writeDock([{ ...ref, min: false }, ...items])
}

// ── callbacks contract (wired per app to the SAME messages server actions) ──

export interface DockSnapshot {
  ok: boolean
  title?: string
  subtitle?: string
  messages?: ShellChatMessage[]
  /** userId → display name (typing line). */
  memberNames?: Record<string, string>
  error?: string
}

export interface MessagesDockCallbacks {
  loadThread: (thread: { kind: 'room' | 'dm'; id: string }) => Promise<DockSnapshot>
  sendMessage: (
    thread: { kind: 'room' | 'dm'; id: string },
    body: string,
    attachment?: ShellAttachmentMeta,
  ) => Promise<ShellResult>
  uploadAttachment: (
    thread: { kind: 'room' | 'dm'; id: string },
    formData: FormData,
  ) => Promise<{ ok: boolean; attachment?: ShellAttachmentMeta; error?: string }>
  heartbeat: (
    thread: { kind: 'room' | 'dm'; id: string },
    typing: boolean,
  ) => Promise<ShellThreadPresence[]>
}

export interface MessagesDockProps {
  meUserId: string
  mySide: 'CREATOR' | 'PARTNER'
  /** Full hub base path — expand goes to `{hubHref}?room=…` / `?dm=…`. */
  hubHref: string
  callbacks: MessagesDockCallbacks
}

// ── panel ────────────────────────────────────────────────────────────────────

const ROLE_BADGE_CLS: Record<string, string> = {
  CREATOR: 'bg-pink-50 text-pink-700',
  PARTNER: 'bg-info-50 text-info-700',
}

const EMOJI = ['👍', '🙏', '🎉', '🔥', '✅', '👀', '💡', '🚀', '😀', '😂', '🤔', '❤️']

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function DockPanel(props: {
  item: DockItem
  meUserId: string
  mySide: 'CREATOR' | 'PARTNER'
  hubHref: string
  callbacks: MessagesDockCallbacks
  onMinimize: () => void
  onClose: () => void
}) {
  const thread = { kind: props.item.kind, id: props.item.id }
  const [snap, setSnap] = React.useState<DockSnapshot | null>(null)
  const [presence, setPresence] = React.useState<ShellThreadPresence[]>([])
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = React.useState(false)
  const [pendingFile, setPendingFile] = React.useState<ShellAttachmentMeta | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const lastKeyRef = React.useRef(0)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Snapshot poll (5s) + heartbeat — the same short-poll realtime seam as the hub.
  const { loadThread, heartbeat } = props.callbacks
  React.useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const [s, p] = await Promise.all([
          loadThread(thread),
          heartbeat(thread, Date.now() - lastKeyRef.current < 4000),
        ])
        if (!cancelled) {
          setSnap(s)
          setPresence(p)
        }
      } catch {
        /* dock polling is best-effort */
      }
    }
    void tick()
    const t = setInterval(() => void tick(), 5000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.item.kind, props.item.id])

  // Pin to the newest message.
  const messages = snap?.messages ?? []
  const newestId = messages[messages.length - 1]?.id ?? null
  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [newestId])

  const anyoneOnline = presence.some((p) => p.userId !== props.meUserId && p.online)
  const typingNames = presence
    .filter((p) => p.typing && p.userId !== props.meUserId)
    .map((p) => snap?.memberNames?.[p.userId] ?? snap?.title ?? 'Someone')

  async function send() {
    const body = draft.trim()
    if ((!body && !pendingFile) || busy) return
    setBusy(true)
    setError(null)
    const res = await props.callbacks.sendMessage(thread, body, pendingFile ?? undefined)
    if (res.ok) {
      setDraft('')
      setPendingFile(null)
      const s = await props.callbacks.loadThread(thread).catch(() => null)
      if (s) setSnap(s)
    } else {
      setError(res.error ?? 'Message failed to send')
    }
    setBusy(false)
  }

  async function pickFile(file: File) {
    if (uploading) return
    setUploading(true)
    setError(null)
    const fd = new FormData()
    fd.set('file', file)
    const res = await props.callbacks.uploadAttachment(thread, fd)
    if (res.ok && res.attachment) setPendingFile(res.attachment)
    else setError(res.error ?? 'Upload failed')
    setUploading(false)
  }

  const expandHref = `${props.hubHref}?${props.item.kind === 'room' ? 'room' : 'dm'}=${props.item.id}`

  return (
    <div className="flex h-[420px] w-[320px] flex-col overflow-hidden rounded-t-xl border border-b-0 border-ink-200 bg-white shadow-lg">
      {/* header — title + presence + expand / minimize / close */}
      <div className="flex items-center gap-s-2 border-b border-ink-200 bg-[var(--bg-hero)] px-s-3 py-s-2">
        {props.item.icon ? <span aria-hidden>{props.item.icon}</span> : null}
        <span className="min-w-0 flex-1 truncate text-ui-caption font-bold text-ink-900">
          {snap?.title ?? props.item.title}
        </span>
        {anyoneOnline ? (
          <span aria-label="Active now" className="h-2 w-2 flex-none rounded-pill bg-success-500" />
        ) : null}
        <Link
          href={expandHref}
          aria-label="Expand to full Messages"
          title="Expand"
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          ⤢
        </Link>
        <button
          type="button"
          aria-label="Minimize"
          title="Minimize"
          onClick={props.onMinimize}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          —
        </button>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={props.onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          ×
        </button>
      </div>

      {/* stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-s-3 py-s-2">
        {snap === null ? (
          <p className="py-s-4 text-center text-ui-label normal-case tracking-normal text-ink-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-s-4 text-center text-ui-label normal-case tracking-normal text-ink-400">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.authorUserId ? m.authorUserId === props.meUserId : m.authorRole === props.mySide
            return (
              <div key={m.id} className={cn('flex py-s-1', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%]', mine ? 'text-right' : 'text-left')}>
                  <div className={cn('flex items-baseline gap-s-1', mine ? 'justify-end' : '')}>
                    <span className="truncate text-ui-label font-bold normal-case tracking-normal text-ink-900">
                      {mine ? 'You' : (m.authorName ?? 'Member')}
                    </span>
                    {!mine && m.authorRoleLabel ? (
                      <span
                        className={cn(
                          'rounded-pill px-s-1 text-[9px] font-bold',
                          ROLE_BADGE_CLS[m.authorRole] ?? 'bg-ink-100 text-ink-600',
                        )}
                      >
                        {m.authorRoleLabel}
                      </span>
                    ) : null}
                    <span className="text-[9px] text-ink-400">{timeLabel(m.createdAt)}</span>
                  </div>
                  {m.body ? (
                    <p
                      className={cn(
                        'mt-0.5 whitespace-pre-wrap break-words rounded-lg px-s-2 py-s-1 text-ui-label normal-case tracking-normal',
                        mine ? 'bg-pink-50 text-ink-900' : 'bg-ink-50 text-ink-900',
                      )}
                    >
                      {m.body}
                    </p>
                  ) : null}
                  {m.attachment ? (
                    <a
                      href={m.attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block truncate rounded-lg border border-ink-200 bg-white px-s-2 py-s-1 text-ui-label normal-case tracking-normal text-info-700 hover:bg-ink-50"
                    >
                      📎 {m.attachment.name}
                    </a>
                  ) : null}
                  {m.objectRef && props.item.kind === 'room' ? (
                    <Link
                      href={`/rooms/${props.item.id}?object=${m.objectRef.objectId}`}
                      className="mt-0.5 inline-block truncate rounded-lg border border-pink-200 bg-pink-50 px-s-2 py-s-1 text-ui-label font-semibold normal-case tracking-normal text-pink-700 hover:bg-pink-100"
                    >
                      ⧉ {m.objectRef.title}
                    </Link>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* composer */}
      <div className="border-t border-ink-200 px-s-2 py-s-2">
        {typingNames.length > 0 ? (
          <p className="px-s-1 pb-s-1 text-[9px] italic text-ink-400">{typingNames.join(', ')} typing…</p>
        ) : null}
        {error ? <p className="px-s-1 pb-s-1 text-[9px] text-danger-600">{error}</p> : null}
        {pendingFile ? (
          <p className="flex items-center gap-s-1 px-s-1 pb-s-1 text-[9px] text-ink-500">
            📎 <span className="truncate">{pendingFile.name}</span>
            <button type="button" className="text-ink-400 hover:text-ink-700" onClick={() => setPendingFile(null)}>
              ×
            </button>
          </p>
        ) : null}
        <div className="relative flex items-center gap-s-1">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pickFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            aria-label="Attach file"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 disabled:opacity-50"
          >
            {uploading ? '…' : '📎'}
          </button>
          <button
            type="button"
            aria-label="Emoji"
            onClick={() => setEmojiOpen((v) => !v)}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100"
          >
            🙂
          </button>
          {emojiOpen ? (
            <div className="absolute bottom-full left-0 z-10 mb-s-1 grid w-48 grid-cols-6 gap-1 rounded-lg border border-ink-200 bg-white p-s-2 shadow-lg">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded-md p-0.5 hover:bg-ink-100"
                  onClick={() => {
                    setDraft((d) => d + e)
                    setEmojiOpen(false)
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}
          <input
            value={draft}
            placeholder="Message…"
            onChange={(e) => {
              setDraft(e.target.value)
              lastKeyRef.current = Date.now()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-pill border border-ink-200 bg-ink-50 px-s-3 text-ui-label normal-case tracking-normal text-ink-900 outline-none focus:border-pink-500"
          />
          <button
            type="button"
            aria-label="Send"
            disabled={busy || (!draft.trim() && !pendingFile)}
            onClick={() => void send()}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-pill bg-ink-900 text-white transition-colors hover:bg-ink-800 disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

// ── host ─────────────────────────────────────────────────────────────────────

/**
 * Renders the stacked dock. Mount ONCE per app inside the dashboard layout;
 * the per-app wrapper decides page visibility (co-creation routes only) and
 * wires callbacks to that app's messages server actions. Panels self-suppress
 * on the page that already shows their thread (the room page's Discussion
 * rail / the full hub) — the state survives, the pixels don't duplicate.
 */
export function MessagesDock(props: MessagesDockProps) {
  const pathname = usePathname()
  const [items, setItems] = React.useState<DockItem[]>([])

  React.useEffect(() => {
    const sync = () => setItems(readDock())
    sync()
    window.addEventListener(DOCK_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(DOCK_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const update = (next: DockItem[]) => {
    setItems(next)
    writeDock(next)
  }

  if (items.length === 0) return null
  // The full hub IS the messenger — the dock never doubles it.
  if (pathname?.startsWith(props.hubHref)) return null

  const visible = items.filter(
    // A room panel hides on its own room page (the Discussion rail is there).
    (i) => !(i.kind === 'room' && pathname?.startsWith(`/rooms/${i.id}`)),
  )
  if (visible.length === 0) return null
  const open = visible.filter((i) => !i.min).slice(0, MAX_OPEN)
  const minimized = visible.filter((i) => i.min || !open.includes(i))

  return (
    <div className="fixed bottom-0 right-4 z-40 hidden items-end gap-s-3 md:flex">
      {minimized.length > 0 ? (
        <div className="mb-s-2 flex flex-col items-end gap-s-1">
          {minimized.map((i) => (
            <button
              key={`${i.kind}:${i.id}`}
              type="button"
              onClick={() =>
                update(items.map((x) => (x.kind === i.kind && x.id === i.id ? { ...x, min: false } : x)))
              }
              className="flex max-w-[200px] items-center gap-s-1 rounded-pill border border-ink-200 bg-white px-s-3 py-s-1 text-ui-label font-semibold normal-case tracking-normal text-ink-700 shadow-md transition-colors hover:bg-ink-50"
            >
              {i.icon ? <span aria-hidden>{i.icon}</span> : '💬'}
              <span className="truncate">{i.title}</span>
            </button>
          ))}
        </div>
      ) : null}
      {open.map((i) => (
        <DockPanel
          key={`${i.kind}:${i.id}`}
          item={i}
          meUserId={props.meUserId}
          mySide={props.mySide}
          hubHref={props.hubHref}
          callbacks={props.callbacks}
          onMinimize={() =>
            update(items.map((x) => (x.kind === i.kind && x.id === i.id ? { ...x, min: true } : x)))
          }
          onClose={() => update(items.filter((x) => !(x.kind === i.kind && x.id === i.id)))}
        />
      ))}
    </div>
  )
}
