// One-off transactional email to an ARBITRARY address (not tied to a User row).
// Use for messages to people who may not have an account yet — e.g. admin-team
// invites. For user-keyed business events use dispatchNotification() instead.
//
// Never throws. No-ops (returns { sent: false }) when Resend isn't configured,
// so callers can always fall back to a copy-paste link.

import { Resend } from 'resend'

let client: Resend | null = null
function getResend(): Resend | null {
  if (client) return client
  const key = process.env.AUTH_RESEND_KEY
  if (!key) return null
  client = new Resend(key)
  return client
}

export type SendEmailResult = { sent: true } | { sent: false; reason: 'not-configured' | 'send-failed' }

export async function sendTransactionalEmail(input: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<SendEmailResult> {
  const resend = getResend()
  const from = process.env.AUTH_EMAIL_FROM
  if (!resend || !from) return { sent: false, reason: 'not-configured' }
  try {
    await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    })
    return { sent: true }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notifications] transactional email send failed', {
      to: input.to,
      subject: input.subject,
      err: (err as Error).message,
    })
    return { sent: false, reason: 'send-failed' }
  }
}
