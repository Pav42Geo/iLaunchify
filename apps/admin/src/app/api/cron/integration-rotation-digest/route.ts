// POST /api/cron/integration-rotation-digest
//
// Cron-triggered: scans every live integration with a secret, computes rotation
// status (lastRotatedAt + cadence), and emails a digest of OVERDUE + DUE-SOON keys
// to OPS_ALERT_EMAIL (when set + Resend configured). Returns the summary regardless,
// so the cron log shows it even without email. NO secret values are read or sent.
//
// Auth: shared CRON_SECRET in the Authorization header (cron has no session).
//
// Schedule (vercel.json) — weekly Monday 9am:
//   { "crons": [{ "path": "/api/cron/integration-rotation-digest", "schedule": "0 9 * * 1" }] }
//
// Manual test:
//   curl -X POST localhost:3003/api/cron/integration-rotation-digest -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { getIntegrationMetaMap } from '@ilaunchify/db'
import { sendTransactionalEmail } from '@ilaunchify/notifications'
import {
  INTEGRATIONS,
  computeRotationStatus,
} from '../../../(dashboard)/developer/integration-registry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface DueItem {
  key: string
  name: string
  days: number // overdue: positive days past due; dueSoon: days remaining
  dueAt: string | null
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const metaMap = await getIntegrationMetaMap()

  const overdue: DueItem[] = []
  const dueSoon: DueItem[] = []
  let checked = 0

  for (const def of INTEGRATIONS) {
    if (def.lifecycle !== 'live') continue
    if (!def.envVars.some((v) => v.kind === 'secret')) continue
    checked++
    const r = computeRotationStatus(def, metaMap[def.key], now)
    const dueAt = r.dueAt ? r.dueAt.toISOString() : null
    if (r.state === 'overdue') overdue.push({ key: def.key, name: def.name, days: Math.abs(r.daysUntilDue ?? 0), dueAt })
    else if (r.state === 'due-soon') dueSoon.push({ key: def.key, name: def.name, days: r.daysUntilDue ?? 0, dueAt })
  }

  overdue.sort((a, b) => b.days - a.days)
  dueSoon.sort((a, b) => a.days - b.days)

  let emailed = false
  const to = process.env.OPS_ALERT_EMAIL
  if (to && (overdue.length > 0 || dueSoon.length > 0)) {
    const row = (i: DueItem, kind: 'overdue' | 'soon') =>
      `<li><strong>${i.name}</strong> — ${kind === 'overdue' ? `overdue by ${i.days} day(s)` : `due in ${i.days} day(s)`}</li>`
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;color:#1a1a1a">
        <h2 style="font-size:18px;margin:0 0 8px">API key rotation digest</h2>
        ${overdue.length ? `<p style="color:#b91c1c;font-weight:600">Overdue (${overdue.length})</p><ul>${overdue.map((i) => row(i, 'overdue')).join('')}</ul>` : ''}
        ${dueSoon.length ? `<p style="color:#b45309;font-weight:600">Due soon (${dueSoon.length})</p><ul>${dueSoon.map((i) => row(i, 'soon')).join('')}</ul>` : ''}
        <p style="font-size:12px;color:#888">Rotate in the vendor dashboard, then mark it rotated in Admin → Developer &amp; API.</p>
      </div>`
    const text =
      `API key rotation digest\n` +
      (overdue.length ? `Overdue: ${overdue.map((i) => `${i.name} (${i.days}d)`).join(', ')}\n` : '') +
      (dueSoon.length ? `Due soon: ${dueSoon.map((i) => `${i.name} (${i.days}d)`).join(', ')}\n` : '')
    const res = await sendTransactionalEmail({ to, subject: `API key rotation: ${overdue.length} overdue, ${dueSoon.length} due soon`, html, text })
    emailed = res.sent
  }

  return NextResponse.json({ ok: true, checked, overdue, dueSoon, emailed, ranAt: now.toISOString() })
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'GET disabled in production; use POST' }, { status: 405 })
  }
  return POST(req)
}
