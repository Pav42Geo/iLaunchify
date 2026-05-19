import { requireUser } from '@ilaunchify/auth'
import { listNotifications, markAllRead } from '@ilaunchify/notifications'
import { Card, CardHeader, CardTitle, CardDescription, Button } from '@ilaunchify/ui'
import Link from 'next/link'
import { CheckCheck, Mail, Inbox } from 'lucide-react'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notifications — Admin' }

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {unread} unread of last {notifications.length}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/settings/notifications">Preferences</Link>
          </Button>
          {unread > 0 && (
            <form action={handleMarkAllRead}>
              <Button type="submit">
                <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
              </Button>
            </form>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inbox zero</CardTitle>
            <CardDescription>Nothing requires attention.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const isUnread = !n.readAt
            const inner = (
              <Card
                className={`transition-colors ${isUnread ? 'border-blue-200 bg-blue-50/30' : ''} ${n.link ? 'hover:bg-zinc-50' : ''}`}
              >
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-1 shrink-0">
                      {isUnread ? (
                        <Mail className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Inbox className="h-4 w-4 text-zinc-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className={`text-base ${isUnread ? 'font-semibold' : ''}`}>
                        {n.title}
                      </CardTitle>
                      {n.body && (
                        <CardDescription className="mt-1">{n.body}</CardDescription>
                      )}
                      <div className="mt-2 text-xs text-zinc-400">
                        {new Date(n.createdAt).toLocaleString()} · {n.event.replace(/_/g, ' ').toLowerCase()}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )
            return (
              <li key={n.id}>
                {n.link ? <Link href={n.link}>{inner}</Link> : inner}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
