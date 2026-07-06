import { NextResponse } from 'next/server'
import { auth } from '@ilaunchify/auth'
import {
  listNotifications,
  countUnread,
  categoryForEvent,
  getNotificationSound,
} from '@ilaunchify/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ notifications: [], unread: 0 }, { status: 401 })
  }
  const [notifications, unread, sound] = await Promise.all([
    listNotifications(session.user.id, { limit: 20 }),
    countUnread(session.user.id),
    getNotificationSound(),
  ])
  return NextResponse.json({
    // category drives the bell row's glyph + tone (in-app P1 §4).
    notifications: notifications.map((n) => ({ ...n, category: categoryForEvent(n.event) })),
    unread,
    // Admin-managed ping (Notification Center → Branding). null url = bundled default.
    sound,
  })
}
