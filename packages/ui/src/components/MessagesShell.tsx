'use client'

// Rooms & Messages hub — shared three-pane shell (creator + partner apps).
// Design contract: design/room-messages-prototype.html (Pavel 2026-07-13),
// with the LIGHT rail variant (bg-hero white + hairline; the prototype's dark
// rail was rejected — neon stays dark-surface-only elsewhere).
//
// Borrowed patterns, on purpose:
//  · GroupMe  — persistent thread rail + compact composer
//  · Twitch   — the author's SPECIALIST ROLE badge travels with every message
//  · Discord  — members panel grouped by side (your team / maker's team)
//  · Linear   — system-style object cards: a message can carry a build-object
//               anchor that deep-links into the room
//
// Presentational only: all mutations arrive as server-action props; thread
// selection is URL-driven (?room= / ?dm=) so the pages stay RSC-loaded.

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '../lib/utils'
import { productGradient, type ProductGradient } from '../tokens/colors'
import { eventText, type RoomShellEvent } from './CoCreationRoomShell'

// ── data contracts (mirror @ilaunchify/orders messaging views) ──────────────

export interface ShellRoomThread {
  id: string
  title: string
  icon: string
  gradientKey: ProductGradient
  counterpartName: string
  status: string
  lastMessage: { byName: string | null; body: string; createdAt: string } | null
  unreadCount: number
}

export interface ShellConversation {
  id: string
  otherName: string
  otherRoleLabel: string | null
  lastMessage: { mine: boolean; body: string; createdAt: string } | null
  unreadCount: number
}

export interface ShellChatMessage {
  id: string
  authorUserId: string | null
  authorName: string | null
  authorRoleLabel: string | null
  authorRole: string // 'CREATOR' | 'PARTNER'
  body: string
  objectRef: { kind: string; objectId: string; title: string; subtitle?: string } | null
  createdAt: string
}

export interface ShellMember {
  userId: string
  name: string
  roleLabel: string
  side: 'CREATOR' | 'PARTNER'
  isAdmin: boolean
}

export type ShellResult = { ok: boolean; error?: string }

export interface ShellObjectRef {
  kind: string
  objectId: string
  title: string
  subtitle?: string
}

export interface MessagesShellProps {
  mode: 'creator' | 'partner'
  meUserId: string
  mySide: 'CREATOR' | 'PARTNER'
  rooms: ShellRoomThread[]
  conversations: ShellConversation[]
  /** URL-selected thread (?room= / ?dm=) — null renders the empty pane. */
  selected: { kind: 'room' | 'dm'; id: string } | null
  messages: ShellChatMessage[]
  /** Room threads only — members grouped in the right panel. */
  members: ShellMember[]
  /** Selected-thread header context. */
  headerTitle: string
  headerSubtitle: string
  headerIcon?: string
  headerGradientKey?: ProductGradient
  /** Deep link to the full collaboration room (room threads). */
  roomHref?: string
  /** Room decision-log events, interleaved as system chips in the stream. */
  systemEvents?: RoomShellEvent[]
  /** Read-cursor at page load — anchors the pink "NEW" divider. */
  lastReadAt?: string | null
  /** Partner mode: where "Invite a teammate" points (existing team settings). */
  inviteHref?: string
  /** Room threads: build objects the composer's ⧉ button can anchor to. */
  attachableObjects?: ShellObjectRef[]
  onSendMessage: (body: string, objectRef?: ShellObjectRef) => Promise<ShellResult>
  /** Members panel "Message" → find-or-create the 1:1 thread, returns its id. */
  onStartDm?: (otherUserId: string) => Promise<{ ok: boolean; conversationId?: string; error?: string }>
  onMarkRead?: () => Promise<void>
  /** Poll interval for live updates (ms); 0 disables. */
  refreshMs?: number
  /**
   * Studio mode (Pavel 2026-07-13): the hub fills the viewport below the
   * topbar as a workspace — no rounded frame — matching the rooms pages.
   */
  fullScreen?: boolean
}

// ── small pieces ─────────────────────────────────────────────────────────────

const ROLE_BADGE_CLS: Record<string, string> = {
  CREATOR: 'bg-pink-50 text-pink-700',
  PARTNER: 'bg-info-50 text-info-700',
}

function RoleBadge({ side, label }: { side: string; label: string }) {
  return (
    <span
      className={cn(
        'rounded-pill px-s-2 py-0.5 text-ui-label tracking-normal',
        ROLE_BADGE_CLS[side] ?? 'bg-ink-100 text-ink-600',
      )}
    >
      {label}
    </span>
  )
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yd = new Date(today)
  yd.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(d, today)) return 'Today'
  if (same(d, yd)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── rail item ────────────────────────────────────────────────────────────────

function RailItem({
  href,
  active,
  tile,
  name,
  snippet,
  unread,
}: {
  href: string
  active: boolean
  tile: React.ReactNode
  name: string
  snippet: string | null
  unread: number
}) {
  return (
    <Link
      href={href}
      className={cn(
        'mx-s-2 flex items-center gap-s-2 rounded-lg px-s-2 py-s-2 transition-colors',
        active ? 'border border-pink-200 bg-pink-50' : 'border border-transparent hover:bg-ink-50',
      )}
    >
      {tile}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-ui-caption font-semibold', active ? 'text-pink-800' : 'text-ink-900')}>
          {name}
        </span>
        {snippet ? (
          <span className="block truncate text-ui-label normal-case tracking-normal text-ink-500">{snippet}</span>
        ) : null}
      </span>
      {unread > 0 ? (
        <span className="rounded-pill bg-pink-500 px-s-2 py-0.5 text-ui-label tracking-normal text-white">
          {unread}
        </span>
      ) : null}
    </Link>
  )
}

// ── main shell ───────────────────────────────────────────────────────────────

export function MessagesShell(props: MessagesShellProps) {
  const router = useRouter()
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null)
  const [pendingAttach, setPendingAttach] = React.useState<ShellObjectRef | null>(null)
  const [attachOpen, setAttachOpen] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const markedRef = React.useRef<string | null>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)

  // Studio mode: pin the workspace to the viewport bottom (same mechanic as
  // CoCreationRoomShell fullScreen — measure the top edge, fill the rest).
  const fullScreen = props.fullScreen ?? false
  React.useEffect(() => {
    if (!fullScreen) return
    const el = rootRef.current
    if (!el) return
    const update = () => {
      el.style.height = `${window.innerHeight - el.getBoundingClientRect().top}px`
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [fullScreen])

  const selectedKey = props.selected ? `${props.selected.kind}:${props.selected.id}` : null

  // Mark the open thread read once per selection, then refresh the badges.
  React.useEffect(() => {
    if (!selectedKey || !props.onMarkRead || markedRef.current === selectedKey) return
    markedRef.current = selectedKey
    void props.onMarkRead().then(() => router.refresh())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])

  // Live updates — same polling pattern as PoolLiveBar.
  const refreshMs = props.refreshMs ?? 15000
  React.useEffect(() => {
    if (!refreshMs) return
    const t = setInterval(() => router.refresh(), refreshMs)
    return () => clearInterval(t)
  }, [refreshMs, router])

  // Pin the scroll to the newest message.
  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [props.messages.length, selectedKey])

  // Switching threads drops any half-composed attachment.
  React.useEffect(() => {
    setPendingAttach(null)
    setAttachOpen(false)
  }, [selectedKey])

  async function send() {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    const res = await props.onSendMessage(body, pendingAttach ?? undefined)
    if (res.ok) {
      setDraft('')
      setPendingAttach(null)
      setAttachOpen(false)
      router.refresh()
    } else {
      setError(res.error ?? 'Message failed to send')
    }
    setBusy(false)
  }

  async function startDm(otherUserId: string) {
    if (!props.onStartDm || busy) return
    setBusy(true)
    const res = await props.onStartDm(otherUserId)
    setBusy(false)
    if (res.ok && res.conversationId) router.push(`/messages?dm=${res.conversationId}`)
    else if (res.error) setError(res.error)
  }

  // @mention candidates (room threads): everyone in the thread but me.
  const mentionables = props.members.filter((m) => m.userId !== props.meUserId)
  const mentionHits =
    mentionQuery === null
      ? []
      : mentionables.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)

  function onDraftChange(v: string) {
    setDraft(v)
    const m = /@([\w .]*)$/.exec(v)
    setMentionQuery(m && props.selected?.kind === 'room' ? (m[1] ?? '') : null)
  }

  function insertMention(name: string) {
    setDraft((d) => d.replace(/@[\w .]*$/, `@${name} `))
    setMentionQuery(null)
  }

  const creatorMembers = props.members.filter((m) => m.side === 'CREATOR')
  const partnerMembers = props.members.filter((m) => m.side === 'PARTNER')

  // Merge chat messages + decision-log events into ONE timeline (prototype:
  // "funded Milestone 1" sits between messages), sorted by time.
  type TimelineItem =
    | { t: 'msg'; at: string; msg: ShellChatMessage }
    | { t: 'sys'; at: string; ev: RoomShellEvent }
  const timeline: TimelineItem[] = [
    ...props.messages.map((m): TimelineItem => ({ t: 'msg', at: m.createdAt, msg: m })),
    ...(props.systemEvents ?? []).map((e): TimelineItem => ({ t: 'sys', at: e.createdAt, ev: e })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  // Pink "NEW" divider — anchored to the read cursor AS OF FIRST RENDER of
  // this selection, so marking-read + refresh doesn't erase it mid-session.
  const newAnchorRef = React.useRef<{ key: string; cutoff: number } | null>(null)
  if (selectedKey && newAnchorRef.current?.key !== selectedKey) {
    newAnchorRef.current = {
      key: selectedKey,
      cutoff: props.lastReadAt ? new Date(props.lastReadAt).getTime() : Number.POSITIVE_INFINITY,
    }
  }
  const newCutoff = newAnchorRef.current?.cutoff ?? Number.POSITIVE_INFINITY
  const firstUnreadId =
    props.messages.find((m) => {
      const mine = m.authorUserId ? m.authorUserId === props.meUserId : m.authorRole === props.mySide
      return !mine && new Date(m.createdAt).getTime() > newCutoff
    })?.id ?? null

  // Group the merged timeline under day dividers.
  const grouped: { day: string; items: TimelineItem[] }[] = []
  for (const item of timeline) {
    const day = dayLabel(item.at)
    const last = grouped[grouped.length - 1]
    if (last && last.day === day) last.items.push(item)
    else grouped.push({ day, items: [item] })
  }

  const isRoom = props.selected?.kind === 'room'

  return (
    <div
      ref={rootRef}
      className={cn(
        'flex overflow-hidden bg-white',
        fullScreen
          ? 'border-t border-ink-200'
          : 'rounded-xl border border-ink-200 shadow-sm',
      )}
      style={fullScreen ? { minHeight: 480 } : { height: 'calc(100vh - 180px)', minHeight: 480 }}
    >
      {/* ── rail (LIGHT variant — bg-hero white, hairline dividers) ── */}
      <div className="flex w-72 flex-none flex-col overflow-y-auto border-r border-ink-200 bg-[var(--bg-hero)]">
        <div className="flex items-center px-s-4 pb-s-1 pt-s-4 text-ui-label text-ink-500">
          Product rooms
        </div>
        {props.rooms.length === 0 ? (
          <p className="px-s-4 py-s-2 text-ui-label normal-case tracking-normal text-ink-400">
            Rooms appear when a maker is selected.
          </p>
        ) : (
          props.rooms.map((r) => (
            <RailItem
              key={r.id}
              href={`/messages?room=${r.id}`}
              active={props.selected?.kind === 'room' && props.selected.id === r.id}
              tile={
                <span
                  aria-hidden
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-md text-ui-subhead"
                  style={{ background: productGradient[r.gradientKey] }}
                >
                  {r.icon}
                </span>
              }
              name={r.title}
              snippet={
                r.lastMessage
                  ? `${r.lastMessage.byName ? `${r.lastMessage.byName}: ` : ''}${r.lastMessage.body}`
                  : `with ${r.counterpartName}`
              }
              unread={r.unreadCount}
            />
          ))
        )}

        <div className="flex items-center px-s-4 pb-s-1 pt-s-4 text-ui-label text-ink-500">
          Direct messages
        </div>
        {props.conversations.length === 0 ? (
          <p className="px-s-4 py-s-2 text-ui-label normal-case tracking-normal text-ink-400">
            Start one from a room&apos;s member panel.
          </p>
        ) : (
          props.conversations.map((c) => (
            <RailItem
              key={c.id}
              href={`/messages?dm=${c.id}`}
              active={props.selected?.kind === 'dm' && props.selected.id === c.id}
              tile={
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-pill bg-pink-100 text-ui-caption font-bold text-pink-800">
                  {c.otherName.slice(0, 2).toUpperCase()}
                </span>
              }
              name={c.otherName}
              snippet={
                c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.body}` : c.otherRoleLabel
              }
              unread={c.unreadCount}
            />
          ))
        )}

        <p className="mt-auto border-t border-ink-100 px-s-4 py-s-3 text-ui-label normal-case tracking-normal text-ink-400">
          Chat lives with the work — decisions belong in the room, where the log is the record.
        </p>
      </div>

      {/* ── center: thread ── */}
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        {props.selected ? (
          <>
            <div className="flex flex-wrap items-center gap-s-3 border-b border-ink-200 px-s-4 py-s-3">
              {props.headerIcon ? (
                <span
                  aria-hidden
                  className="flex h-9 w-9 items-center justify-center rounded-md text-ui-subhead"
                  style={{ background: productGradient[props.headerGradientKey ?? 'pink'] }}
                >
                  {props.headerIcon}
                </span>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-pink-100 text-ui-caption font-bold text-pink-800">
                  {props.headerTitle.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <h2 className="truncate font-display text-ui-subhead text-ink-900">{props.headerTitle}</h2>
                <p className="truncate text-ui-label normal-case tracking-normal text-ink-500">
                  {props.headerSubtitle}
                </p>
              </div>
              <span className="flex-1" />
              {props.roomHref && isRoom ? (
                <Link
                  href={props.roomHref}
                  className="rounded-pill border border-ink-300 bg-white px-s-4 py-s-2 text-ui-caption font-semibold text-ink-700 transition-colors hover:bg-ink-50"
                >
                  Build objects
                </Link>
              ) : null}
              {props.roomHref ? (
                <Link
                  href={props.roomHref}
                  className="rounded-pill bg-ink-900 px-s-4 py-s-2 text-ui-caption font-semibold text-white transition-colors hover:bg-ink-800"
                >
                  Open room →
                </Link>
              ) : null}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-s-5 py-s-4">
              {grouped.length === 0 ? (
                <p className="py-s-6 text-center text-ui-caption text-ink-400">
                  No messages yet — say hello. {isRoom ? 'The whole room sees this thread.' : ''}
                </p>
              ) : null}
              {grouped.map((g) => (
                <React.Fragment key={g.day}>
                  <div className="my-s-3 flex justify-center">
                    <span className="rounded-pill bg-ink-100 px-s-3 py-0.5 text-ui-label tracking-normal text-ink-500">
                      {g.day}
                    </span>
                  </div>
                  {g.items.map((item) => {
                    if (item.t === 'sys') {
                      return (
                        <div key={`sys-${item.ev.id}`} className="my-s-2 flex justify-center">
                          <span className="max-w-[85%] rounded-pill border border-ink-100 bg-ink-50 px-s-3 py-s-1 text-center text-ui-label normal-case tracking-normal text-ink-500">
                            {eventText(item.ev)}
                          </span>
                        </div>
                      )
                    }
                    const m = item.msg
                    const mine = m.authorUserId
                      ? m.authorUserId === props.meUserId
                      : m.authorRole === props.mySide
                    return (
                      <React.Fragment key={m.id}>
                      {m.id === firstUnreadId ? (
                        <div className="my-s-2 flex items-center gap-s-2" aria-label="New messages">
                          <span aria-hidden className="h-px flex-1 bg-pink-300" />
                          <span className="text-ui-label font-bold tracking-wide text-pink-600">NEW</span>
                          <span aria-hidden className="h-px flex-1 bg-pink-300" />
                        </div>
                      ) : null}
                      <div className={cn('flex py-s-1', mine ? 'justify-end' : 'justify-start')}>
                        <div className={cn('max-w-[78%]', mine ? 'text-right' : 'text-left')}>
                          <div className={cn('flex items-baseline gap-s-2', mine ? 'justify-end' : '')}>
                            <span className="text-ui-caption font-bold text-ink-900">
                              {mine ? 'You' : (m.authorName ?? (m.authorRole === 'CREATOR' ? 'Creator' : 'Maker'))}
                            </span>
                            {m.authorRoleLabel ? (
                              <RoleBadge side={m.authorRole} label={m.authorRoleLabel} />
                            ) : null}
                            <span className="text-ui-label normal-case tracking-normal text-ink-400">
                              {timeLabel(m.createdAt)}
                            </span>
                          </div>
                          <div
                            className={cn(
                              'mt-1 inline-block whitespace-pre-wrap rounded-xl border px-s-3 py-s-2 text-left text-ui-caption leading-relaxed',
                              mine
                                ? 'rounded-tr-sm border-pink-100 bg-pink-50 text-ink-800'
                                : 'rounded-tl-sm border-ink-100 bg-ink-50 text-ink-800',
                            )}
                          >
                            {m.body}
                          </div>
                          {m.objectRef && props.roomHref ? (
                            <Link
                              href={props.roomHref}
                              className="mt-s-1 flex items-center gap-s-2 rounded-lg border border-ink-200 bg-white px-s-3 py-s-2 text-left shadow-sm transition-colors hover:border-pink-300"
                            >
                              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-ink-900 text-ui-caption text-white">
                                ⧉
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-ui-caption font-bold text-ink-900">
                                  {m.objectRef.title}
                                </span>
                                {m.objectRef.subtitle ? (
                                  <span className="block truncate text-ui-label normal-case tracking-normal text-ink-500">
                                    {m.objectRef.subtitle}
                                  </span>
                                ) : null}
                              </span>
                              <span className="ml-auto whitespace-nowrap text-ui-label tracking-normal text-pink-600">
                                Open →
                              </span>
                            </Link>
                          ) : null}
                        </div>
                      </div>
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              ))}
            </div>

            {error ? (
              <p className="border-t border-danger-100 bg-danger-50 px-s-4 py-s-1 text-ui-label normal-case tracking-normal text-danger-700" role="alert">
                {error}
              </p>
            ) : null}

            <div className="relative border-t border-ink-200 px-s-4 py-s-3">
              {mentionHits.length > 0 ? (
                <div className="absolute bottom-full left-s-5 z-10 mb-s-1 w-72 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lg">
                  {mentionHits.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => insertMention(m.name)}
                      className="flex w-full items-center gap-s-2 px-s-3 py-s-2 text-left hover:bg-pink-50"
                    >
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-pill bg-ink-100 text-ui-label tracking-normal text-ink-700">
                        {m.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-ui-caption font-semibold text-ink-900">{m.name}</span>
                        <span className="block truncate text-ui-label normal-case tracking-normal text-ink-500">
                          {m.roleLabel}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {/* ⧉ object picker popover */}
              {attachOpen && (props.attachableObjects?.length ?? 0) > 0 ? (
                <div className="absolute bottom-full right-s-5 z-10 mb-s-1 w-80 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lg">
                  <p className="border-b border-ink-100 px-s-3 py-s-2 text-ui-label text-ink-500">
                    Anchor this message to a build object
                  </p>
                  {props.attachableObjects!.map((o) => (
                    <button
                      key={o.objectId}
                      type="button"
                      onClick={() => {
                        setPendingAttach(o)
                        setAttachOpen(false)
                      }}
                      className="flex w-full items-center gap-s-2 px-s-3 py-s-2 text-left hover:bg-pink-50"
                    >
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-ink-900 text-ui-label tracking-normal text-white">
                        ⧉
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-ui-caption font-semibold text-ink-900">{o.title}</span>
                        {o.subtitle ? (
                          <span className="block truncate text-ui-label normal-case tracking-normal text-ink-500">
                            {o.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {/* pending attachment chip */}
              {pendingAttach ? (
                <div className="mb-s-1 inline-flex items-center gap-s-2 rounded-pill border border-pink-100 bg-pink-50 px-s-3 py-s-1 text-ui-label tracking-normal text-pink-700">
                  ⧉ {pendingAttach.title}
                  <button
                    type="button"
                    onClick={() => setPendingAttach(null)}
                    aria-label="Remove attached object"
                    className="text-pink-700 hover:text-pink-800"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <div className="flex items-end gap-s-2 rounded-xl border border-ink-200 bg-ink-50 px-s-3 py-s-2 transition-colors focus-within:border-pink-500 focus-within:bg-white">
                {isRoom && (props.attachableObjects?.length ?? 0) > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAttachOpen((v) => !v)}
                    title="Reference a build object"
                    aria-label="Reference a build object"
                    className={cn(
                      'flex h-8 w-8 flex-none items-center justify-center rounded-pill transition-colors',
                      attachOpen || pendingAttach
                        ? 'bg-ink-900 text-white'
                        : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
                    )}
                  >
                    ⧉
                  </button>
                ) : null}
                <textarea
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  rows={1}
                  placeholder={isRoom ? 'Message the room… type @ to mention' : 'Send a message…'}
                  className="max-h-32 min-h-[2rem] flex-1 resize-none bg-transparent py-s-1 text-ui-caption text-ink-900 outline-none placeholder:text-ink-400"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy || !draft.trim()}
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-pill bg-pink-500 text-white transition-colors hover:bg-pink-600 disabled:opacity-40"
                  aria-label="Send message"
                >
                  ➤
                </button>
              </div>
              {isRoom ? (
                <p className="mt-s-1 text-ui-label normal-case tracking-normal text-ink-400">
                  Every message is part of the room record.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-s-2 text-center">
            <span aria-hidden className="text-3xl">💬</span>
            <p className="font-display text-ui-subhead text-ink-900">Your messages</p>
            <p className="max-w-sm text-ui-caption text-ink-500">
              Pick a product room or a direct message from the left — or start one from a room&apos;s
              member panel.
            </p>
          </div>
        )}
      </div>

      {/* ── right: members (room threads) ── */}
      {props.selected && isRoom ? (
        <div className="hidden w-72 flex-none flex-col overflow-y-auto border-l border-ink-200 bg-white lg:flex">
          <div className="px-s-4 pb-s-1 pt-s-4">
            <p className="font-display text-ui-caption font-bold text-ink-900">Members</p>
            <p className="text-ui-label normal-case tracking-normal text-ink-500">
              {props.members.length} in this room
            </p>
          </div>

          <div className="px-s-3 py-s-2">
            <p className="px-s-1 pb-s-1 text-ui-label text-ink-500">
              {props.mode === 'creator' ? 'Your team' : 'Creator side'} · {creatorMembers.length}
            </p>
            {creatorMembers.map((m) => (
              <MemberRow key={m.userId} member={m} meUserId={props.meUserId} busy={busy} onStartDm={props.onStartDm ? startDm : undefined} />
            ))}
            {props.mode === 'creator' ? (
              <p className="mx-s-1 mt-s-1 rounded-lg border border-dashed border-ink-300 px-s-2 py-s-2 text-center text-ui-label normal-case tracking-normal text-ink-400">
                Creator teammates arrive with team accounts
              </p>
            ) : null}
          </div>

          <div className="px-s-3 py-s-2">
            <p className="px-s-1 pb-s-1 text-ui-label text-ink-500">
              {props.mode === 'partner' ? 'Your team' : 'Maker team'} · {partnerMembers.length}
            </p>
            {partnerMembers.map((m) => (
              <MemberRow key={m.userId} member={m} meUserId={props.meUserId} busy={busy} onStartDm={props.onStartDm ? startDm : undefined} />
            ))}
            {props.mode === 'partner' && props.inviteHref ? (
              <Link
                href={props.inviteHref}
                className="mx-s-1 mt-s-1 block rounded-lg border border-dashed border-ink-300 px-s-2 py-s-2 text-center text-ui-label tracking-normal text-ink-500 transition-colors hover:border-pink-500 hover:bg-pink-50 hover:text-pink-700"
              >
                ＋ Invite a teammate
              </Link>
            ) : null}
          </div>

          <p className="mt-auto border-t border-ink-100 px-s-4 py-s-3 text-ui-label normal-case tracking-normal text-ink-400">
            Roles come from each team&apos;s own setup — the specialist label travels with every
            message, so you always know who you&apos;re talking to.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function MemberRow({
  member,
  meUserId,
  busy,
  onStartDm,
}: {
  member: ShellMember
  meUserId: string
  busy: boolean
  onStartDm?: (otherUserId: string) => void | Promise<void>
}) {
  const isMe = member.userId === meUserId
  return (
    <div className="group flex items-center gap-s-2 rounded-lg px-s-1 py-s-1 hover:bg-ink-50">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-pill bg-ink-100 text-ui-label tracking-normal text-ink-700">
        {member.name.slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui-caption font-semibold text-ink-900">
          {member.name}
          {isMe ? <span className="text-ink-400"> (you)</span> : null}
        </span>
        <span className="block truncate text-ui-label normal-case tracking-normal text-ink-500">
          {member.roleLabel}
        </span>
      </span>
      {!isMe && onStartDm ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onStartDm(member.userId)}
          className="rounded-pill border border-pink-100 bg-pink-50 px-s-2 py-0.5 text-ui-label tracking-normal text-pink-700 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          Message
        </button>
      ) : null}
    </div>
  )
}
