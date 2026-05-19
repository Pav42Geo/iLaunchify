import { NextResponse } from 'next/server'
import { auth } from '@ilaunchify/auth'
import { listNotifications, countUnread } from '@ilaunchify/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ notifications: [], unread: 0 }, { status: 401 })
  }
  const [notifications, unread] = await Promise.all([
    listNotifications(session.user.id, { limit: 20 }),
    countUnread(session.user.id),
  ])
  return NextResponse.json({ notifications, unread })
}
