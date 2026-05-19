'use client'

// Notification bell for the admin topbar. Same shape as the partner bell;
// kept separate to avoid cross-app component imports.

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { markNotificationRead, markAllNotificationsRead } from './actions'

interface Notification {
  id: string
  event: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

interface FeedResponse {
  notifications: Notification[]
  unread: number
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<FeedResponse>({ notifications: [], unread: 0 })
  const [isPending, startTransition] = useTransition()

  async function refresh() {
    try {
      const res = await fetch('/api/notifications/feed', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch {
      // Silent
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-notification-bell]')) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function handleClickNotification(n: Notification) {
    if (!n.readAt) {
      startTransition(async () => {
        await markNotificationRead({ notificationId: n.id })
        await refresh()
      })
    }
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllNotificationsRead()
      await refresh()
    })
  }

  return (
    <div className="relative" data-notification-bell>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {data.unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {data.unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={isPending}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {data.notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">
                No notifications yet.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {data.notifications.slice(0, 8).map((n) => {
                  const isUnread = !n.readAt
                  const content = (
                    <div className={`group flex gap-3 px-4 py-3 hover:bg-zinc-50 ${isUnread ? 'bg-blue-50/50' : ''}`}>
                      <div className="mt-1 shrink-0">
                        {isUnread ? (
                          <span className="block h-2 w-2 rounded-full bg-blue-600" />
                        ) : (
                          <Check className="h-3 w-3 text-zinc-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${isUnread ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>
                          {n.title}
                        </div>
                        {n.body && (
                          <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                            {n.body}
                          </div>
                        )}
                        <div className="mt-1 text-[11px] text-zinc-400">
                          {timeAgo(n.createdAt)}
                        </div>
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

          <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-zinc-700 hover:text-zinc-900"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
