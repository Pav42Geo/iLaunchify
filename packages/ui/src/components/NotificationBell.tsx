'use client'

// NotificationBell — shared bell + dropdown for every dashboard topbar
// (in-app notifications P0, docs/IN_APP_NOTIFICATIONS_AUDIT.md §5).
//
// Replaces the three ~95%-identical per-app copies. Each app keeps a thin
// client wrapper at its old path that passes its own server actions
// (markRead / markAllRead) and accent.
//
// Polling: 30s base with ±5s jitter (no thundering herd on the feed
// endpoint), paused while the tab is hidden, immediate refresh when the tab
// becomes visible again.

import * as React from 'react'
import Link from 'next/link'
import { Bell, CheckCheck } from 'lucide-react'
import { cn } from '../lib/utils'
import { notificationCategoryMeta, toneClasses } from './notification-categories'

export interface NotificationBellItem {
  id: string
  event: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
  /** Category slug (feed API computes it) — drives the row glyph + tone. */
  category?: string
}

interface FeedResponse {
  notifications: NotificationBellItem[]
  unread: number
  /** Admin-managed ping (Notification Center → Branding). url null = the
      app's bundled default /sounds/notification.mp3. */
  sound?: { enabled: boolean; url: string | null }
}

const DEFAULT_SOUND_URL = '/sounds/notification.mp3'

export interface NotificationBellProps {
  /** Accent for unread dot / row tint / focus ring. pink = creator, info = partner + admin. */
  accent?: 'pink' | 'info'
  /** Unread-count badge color. Defaults to the accent; admin uses danger. */
  badgeTone?: 'accent' | 'danger'
  /** Feed endpoint returning { notifications, unread }. */
  feedUrl?: string
  /** SSE endpoint (in-app P2). When reachable, replaces polling — the bell
      refreshes on server push. Falls back to jittered polling on failure. */
  streamUrl?: string
  /** "View all" target. */
  viewAllHref?: string
  emptyText?: string
  /** Per-app server actions. */
  markRead: (input: { notificationId: string }) => Promise<unknown>
  markAllRead: () => Promise<unknown>
}

const POLL_BASE_MS = 30_000
const POLL_JITTER_MS = 5_000

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function NotificationBell({
  accent = 'pink',
  badgeTone = 'accent',
  feedUrl = '/api/notifications/feed',
  streamUrl = '/api/notifications/stream',
  viewAllHref = '/notifications',
  emptyText = 'No notifications yet.',
  markRead,
  markAllRead,
}: NotificationBellProps) {
  const [open, setOpen] = React.useState(false)
  const [data, setData] = React.useState<FeedResponse>({ notifications: [], unread: 0 })
  const [isPending, startTransition] = React.useTransition()
  // Previous unread count — null until the first fetch so the initial load
  // never pings (only a RISING count does).
  const prevUnread = React.useRef<number | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch(feedUrl, { cache: 'no-store' })
      if (!res.ok) return
      const next = (await res.json()) as FeedResponse
      // Sound ping (admin-managed): play when the unread count rises after
      // the initial load. Autoplay may be blocked pre-interaction — swallow.
      if (
        prevUnread.current !== null &&
        next.unread > prevUnread.current &&
        (next.sound?.enabled ?? false)
      ) {
        try {
          const audio = new Audio(next.sound?.url ?? DEFAULT_SOUND_URL)
          audio.volume = 0.6
          void audio.play().catch(() => {})
        } catch {
          // Audio unavailable (SSR guard / odd browser) — stay silent.
        }
      }
      prevUnread.current = next.unread
      setData(next)
    } catch {
      // Silent — the bell must never break the page.
    }
  }, [feedUrl])

  // Live updates (in-app P2): SSE first — the stream endpoint pushes whenever
  // the unread signature changes and EventSource auto-reconnects when the
  // serverless stream rotates. If SSE is unavailable/permanently closed, fall
  // back to the jittered poll (paused while the tab is hidden).
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let es: EventSource | null = null
    let cancelled = false
    let polling = false

    function schedulePoll() {
      if (cancelled) return
      polling = true
      const delay = POLL_BASE_MS + (Math.random() * 2 - 1) * POLL_JITTER_MS
      timer = setTimeout(async () => {
        if (cancelled) return
        if (!document.hidden) await refresh()
        schedulePoll()
      }, delay)
    }

    void refresh()

    if (streamUrl && typeof window !== 'undefined' && 'EventSource' in window) {
      es = new EventSource(streamUrl)
      es.onmessage = () => {
        if (!cancelled) void refresh()
      }
      es.onerror = () => {
        // Transient errors auto-reconnect; only a CLOSED source means the
        // endpoint is unavailable (404/401/proxy) → fall back to polling.
        if (es && es.readyState === EventSource.CLOSED && !polling) {
          es.close()
          es = null
          schedulePoll()
        }
      }
    } else {
      schedulePoll()
    }

    function onVisible() {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (es) es.close()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, streamUrl])

  React.useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-notification-bell]')) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function handleClickNotification(n: NotificationBellItem) {
    if (!n.readAt) {
      startTransition(async () => {
        await markRead({ notificationId: n.id })
        await refresh()
      })
    }
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllRead()
      await refresh()
    })
  }

  const accentDot = accent === 'pink' ? 'bg-pink-600' : 'bg-info-600'
  const accentTint = accent === 'pink' ? 'bg-pink-50/50' : 'bg-info-50/50'
  const accentRing = accent === 'pink' ? 'focus-visible:ring-pink-500' : 'focus-visible:ring-info-500'
  const badgeBg =
    badgeTone === 'danger' ? 'bg-danger-600' : accent === 'pink' ? 'bg-pink-600' : 'bg-info-600'

  return (
    <div className="relative" data-notification-bell>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2',
          accentRing,
        )}
        aria-label="Notifications"
      >
        <Bell strokeWidth={2} className="h-5 w-5" />
        {data.unread > 0 && (
          <span
            className={cn(
              'absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white',
              badgeBg,
            )}
          >
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-900">Notifications</h3>
            {data.unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={isPending}
                className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {data.notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-500">{emptyText}</div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.notifications.slice(0, 8).map((n) => {
                  const isUnread = !n.readAt
                  const meta = notificationCategoryMeta(n.category)
                  const tone = toneClasses(meta.tone)
                  const content = (
                    <div
                      className={cn(
                        'group flex gap-3 px-4 py-3 hover:bg-ink-50',
                        isUnread && accentTint,
                      )}
                    >
                      {/* Category glyph (in-app P1 §4) + unread dot overlay. */}
                      <div className="relative mt-0.5 shrink-0">
                        <span
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-lg',
                            isUnread ? tone.chip : 'bg-ink-50',
                          )}
                        >
                          <meta.icon
                            strokeWidth={1.75}
                            className={cn('h-4 w-4', isUnread ? tone.icon : 'text-ink-300')}
                          />
                        </span>
                        {isUnread && (
                          <span
                            className={cn(
                              'absolute -right-0.5 -top-0.5 block h-2 w-2 rounded-full ring-2 ring-white',
                              accentDot,
                            )}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            'text-sm',
                            isUnread ? 'font-semibold text-ink-900' : 'text-ink-700',
                          )}
                        >
                          {n.title}
                        </div>
                        {n.body && (
                          <div className="mt-0.5 line-clamp-2 text-xs text-ink-500">{n.body}</div>
                        )}
                        <div className="mt-1 text-[11px] text-ink-400">{timeAgo(n.createdAt)}</div>
                      </div>
                    </div>
                  )
                  return (
                    <li key={n.id} onClick={() => handleClickNotification(n)}>
                      {n.link ? (
                        <Link href={n.link} onClick={() => setOpen(false)}>
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-ink-200 bg-ink-50 px-4 py-2 text-center">
            <Link
              href={viewAllHref}
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-ink-700 hover:text-ink-900"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
