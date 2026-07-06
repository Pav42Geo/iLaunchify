// POST /api/cron/archive-notifications
//
// Cron-triggered: auto-archives READ in-app notification rows older than 30
// days (in-app P1, docs/IN_APP_NOTIFICATIONS_AUDIT.md — Pavel 2026-07-06).
// Archived rows disappear from the bell + feed but are never deleted.
// Mirrors the accept-reminders route's shared-secret auth.
//
// Schedule example (vercel.json): { "path": "/api/cron/archive-notifications", "schedule": "0 4 * * *" }

import { NextRequest, NextResponse } from 'next/server'
import { autoArchiveRead, getInAppSettings } from '@ilaunchify/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set on the server' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Window is admin-tunable: Notifications → In-app (default 30 days).
    const { autoArchiveDays } = await getInAppSettings()
    const { count } = await autoArchiveRead(autoArchiveDays)
    return NextResponse.json({ ok: true, archived: count, olderThanDays: autoArchiveDays })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
