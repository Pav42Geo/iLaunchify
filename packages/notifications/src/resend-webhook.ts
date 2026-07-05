// Resend inbound webhook — signature verification + event parsing + recording
// (checklist E, docs/EMAIL_NOTIFICATION_CENTER.md "Deliverability").
//
// Resend signs webhooks with Svix: headers `svix-id`, `svix-timestamp`,
// `svix-signature`; signed content is `${id}.${timestamp}.${rawBody}`,
// HMAC-SHA256 with the base64 key from the `whsec_…` secret, compared
// constant-time. Verification + parsing are pure (secret passed in, never
// logged); `recordResendEvent` correlates back to the SENT row by
// provider message id so deliverability aggregates stay per-event.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { recordEmailDelivery, findDeliveryContext } from './center-db'

const TIMESTAMP_TOLERANCE_S = 5 * 60

// ---------------------------------------------------------------------------
// Signature verification (Svix scheme) — pure
// ---------------------------------------------------------------------------

export function verifyResendWebhook(params: {
  rawBody: string
  svixId: string | null
  svixTimestamp: string | null
  svixSignature: string | null
  /** The `whsec_…` signing secret from the Resend dashboard. */
  secret: string
  now?: Date
}): boolean {
  const { rawBody, svixId, svixTimestamp, svixSignature, secret } = params
  if (!svixId || !svixTimestamp || !svixSignature || !secret) return false

  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts)) return false
  const nowS = Math.floor((params.now ?? new Date()).getTime() / 1000)
  if (Math.abs(nowS - ts) > TIMESTAMP_TOLERANCE_S) return false

  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
  const expected = createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest('base64')

  // Header carries space-separated versioned signatures: "v1,<sig> v1,<sig>".
  for (const part of svixSignature.split(' ')) {
    const sig = part.startsWith('v1,') ? part.slice(3) : null
    if (!sig) continue
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(sig, 'utf8')
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Event parsing — pure
// ---------------------------------------------------------------------------

export type ResendDeliveryStatus = 'DELIVERED' | 'BOUNCED' | 'COMPLAINED' | 'OPENED'

const TYPE_TO_STATUS: Record<string, ResendDeliveryStatus> = {
  'email.delivered': 'DELIVERED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
  'email.opened': 'OPENED',
}

export interface ParsedResendEvent {
  status: ResendDeliveryStatus
  providerMessageId: string
  toEmail: string
  detail: string | null
  occurredAt: string | null
}

/** Null for event types we don't track (sent — recorded at send — clicked, delayed…). */
export function parseResendEvent(payload: unknown): ParsedResendEvent | null {
  const p = payload as {
    type?: unknown
    created_at?: unknown
    data?: { email_id?: unknown; to?: unknown; bounce?: { message?: unknown } }
  }
  if (typeof p?.type !== 'string') return null
  const status = TYPE_TO_STATUS[p.type]
  if (!status) return null
  const emailId = p.data?.email_id
  if (typeof emailId !== 'string' || emailId.length === 0) return null
  const to = Array.isArray(p.data?.to) ? p.data.to.find((t) => typeof t === 'string') : p.data?.to
  const detail =
    status === 'BOUNCED' && typeof p.data?.bounce?.message === 'string'
      ? p.data.bounce.message.slice(0, 500)
      : null
  return {
    status,
    providerMessageId: emailId,
    toEmail: typeof to === 'string' ? to : '',
    detail,
    occurredAt: typeof p.created_at === 'string' ? p.created_at : null,
  }
}

// ---------------------------------------------------------------------------
// Recording (IO — correlates back to the SENT row for event/category)
// ---------------------------------------------------------------------------

export async function recordResendEvent(parsed: ParsedResendEvent): Promise<void> {
  const context = await findDeliveryContext(parsed.providerMessageId)
  await recordEmailDelivery({
    notificationId: context?.notificationId ?? null,
    event: context?.event ?? null,
    category: context?.category ?? null,
    toEmail: parsed.toEmail || (context?.toEmail ?? ''),
    providerMessageId: parsed.providerMessageId,
    status: parsed.status,
    detail: parsed.detail,
  })
}
