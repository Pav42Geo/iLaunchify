// Creator notifications — filterable, cursor-paginated feed (in-app P0,
// docs/IN_APP_NOTIFICATIONS_AUDIT.md §5). URL-driven filters:
// ?filter=unread & ?category=<slug> & ?cursor=<id>.

import { requireUser } from '@ilaunchify/auth'
import {
  listNotificationsPage,
  countUnread,
  markAllRead,
  markUnread,
  archiveNotification,
  setCategoryPreferenceChecked,
  allCategories,
  eventsInCategory,
  isValidCategorySlug,
  categoryForEvent,
  categoryConfig,
} from '@ilaunchify/notifications'
import Link from 'next/link'
import { CheckCheck } from 'lucide-react'
import { NotificationFeed } from '@ilaunchify/ui'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notifications' }

const PAGE_SIZE = 50

async function handleMarkAllRead() {
  'use server'
  const user = await requireUser()
  await markAllRead(user.id)
  revalidatePath('/notifications')
}

async function handleArchive(notificationId: string) {
  'use server'
  const user = await requireUser()
  if (notificationId) await archiveNotification({ userId: user.id, notificationId })
  revalidatePath('/notifications')
}

async function handleMarkUnread(notificationId: string) {
  'use server'
  const user = await requireUser()
  if (notificationId) await markUnread({ userId: user.id, notificationId })
  revalidatePath('/notifications')
}

async function handleMuteCategory(categorySlug: string) {
  'use server'
  const user = await requireUser()
  // Opt-outability is enforced inside (mandatory categories are rejected).
  await setCategoryPreferenceChecked({
    userId: user.id,
    category: categorySlug,
    channel: 'IN_APP',
    enabled: false,
  })
  revalidatePath('/notifications')
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; category?: string; cursor?: string }>
}) {
  const user = await requireUser()
  const params = await searchParams
  const filter = params.filter === 'unread' ? ('unread' as const) : ('all' as const)
  const category =
    params.category && isValidCategorySlug(params.category) ? params.category : null

  const [{ notifications, nextCursor }, unread] = await Promise.all([
    listNotificationsPage(user.id, {
      limit: PAGE_SIZE,
      unreadOnly: filter === 'unread',
      ...(category ? { events: eventsInCategory(category) } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
    }),
    countUnread(user.id),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-ui-title text-ink-900">Notifications</h1>
          <p className="mt-1 text-ui-body text-ink-500">
            {unread} unread
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

      <NotificationFeed
        accent="pink"
        rowActions={{
          archive: handleArchive,
          markUnread: handleMarkUnread,
          muteCategory: handleMuteCategory,
        }}
        basePath="/notifications"
        filter={filter}
        category={category}
        categories={allCategories().map((c) => ({ slug: c.slug, label: c.label }))}
        nextCursor={nextCursor}
        items={notifications.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          link: n.link,
          readAt: n.readAt ? n.readAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
          categoryLabel: categoryConfig(categoryForEvent(n.event)).label,
          categorySlug: categoryForEvent(n.event),
          optOutable: categoryConfig(categoryForEvent(n.event)).optOutable,
        }))}
      />
    </div>
  )
}
