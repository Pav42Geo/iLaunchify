// Resend inbound webhook (checklist E, docs/EMAIL_NOTIFICATION_CENTER.md).
// Placement mirrors ./webhooks/stripe — public prefix in middleware, signature
// (not cookie) is the auth. Flow, idempotent + 200-fast:
//
//   raw body → Svix HMAC verify (RESEND_WEBHOOK_SECRET; 401 on bad/missing)
//   → parseResendEvent (delivered / bounced / complained / opened; other
//     types no-op 200) → EmailDelivery row, correlated to the SENT row by
//     provider message id (per-event deliverability + the bounce/complaint
//     suppression signal the dispatcher checks before sending).

import { NextRequest, NextResponse } from 'next/server'
import {
  verifyResendWebhook,
  parseResendEvent,
  recordResendEvent,
} from '@ilaunchify/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // node:crypto (HMAC), not Edge

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    // Unconfigured — acknowledge so Resend doesn't retry-storm, but log once.
    // eslint-disable-next-line no-console
    console.warn('[webhooks/resend] RESEND_WEBHOOK_SECRET not set; event dropped')
    return NextResponse.json({ ok: true })
  }

  const rawBody = await req.text()
  const verified = verifyResendWebhook({
    rawBody,
    svixId: req.headers.get('svix-id'),
    svixTimestamp: req.headers.get('svix-timestamp'),
    svixSignature: req.headers.get('svix-signature'),
    secret,
  })
  if (!verified) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = parseResendEvent(payload)
  if (!parsed) return NextResponse.json({ ok: true }) // untracked event type

  await recordResendEvent(parsed)
  return NextResponse.json({ ok: true })
}
