// Creator notifications — full list, newest first, with mark-all-read.

import { requireUser } from '@ilaunchify/auth'
import { listNotifications, markAllRead } from '@ilaunchify/notifications'
import Link from 'next/link'
import { CheckCheck, Mail, Inbox } from 'lucide-react'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notifications' }

async function handleMarkAllRead() {
  'use server'
  const user = await requireUser()
  await markAllRead(user.id)
  revalidatePath('/notifications')
}

export default async function NotificationsPage() {
  const user = await requireUser()
  const notifications = await listNotifications(user.id, { limit: 200 })
  const unread = notifications.filter((n) => !n.readAt).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Notifications</h1>
          <p className="mt-1 text-sm text-ink-500">
            {unread} unread of last {notifications.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/notifications"
            className="rounded-full border border-ink-200 px-4 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            Preferences
          </Link>
          {unread > 0 && (
            <form action={handleMarkAllRead}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-800"
              >
                <CheckCheck className="h-4 w-4" /> Mark all read
              </button>
            </form>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 px-6 py-14 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700">
            <Inbox className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-lg font-semibold text-ink-900">You&apos;re all caught up</h2>
          <p className="mx-auto mt-1 max-w-[420px] text-[13px] text-ink-600">
            Order updates, partner activity, and replies from support will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const isUnread = !n.readAt
            const inner = (
              <div
                className={`flex gap-3 rounded-2xl border px-4 py-3.5 transition-colors ${
                  isUnread ? 'border-pink-200 bg-pink-50/30' : 'border-ink-200 bg-white'
                } ${n.link ? 'hover:bg-ink-50' : ''}`}
              >
                <div className="mt-0.5 shrink-0">
                  {isUnread ? (
                    <Mail className="h-4 w-4 text-pink-600" />
                  ) : (
                    <Inbox className="h-4 w-4 text-ink-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] text-ink-900 ${isUnread ? 'font-semibold' : ''}`}>
                    {n.title}
                  </p>
                  {n.body && <p className="mt-0.5 text-[12.5px] text-ink-600">{n.body}</p>}
                  <p className="mt-1.5 text-[11px] text-ink-400">
                    {new Date(n.createdAt).toLocaleString()} ·{' '}
                    {n.event.replace(/_/g, ' ').toLowerCase()}
                  </p>
                </div>
              </div>
            )
            return <li key={n.id}>{n.link ? <Link href={n.link}>{inner}</Link> : inner}</li>
          })}
        </ul>
      )}
    </div>
  )
}
