'use server'

// Public "Contact us" footer form → forwards the message by email to the address
// the admin configures in SupportSettings.contactForwardingEmail (fallback:
// AUTH_EMAIL_FROM). Best-effort: sendTransactionalEmail never throws and no-ops
// when Resend isn't configured, so this is safe in beta. Callable from both the
// public Application page and the authenticated Onboarding surface.
//
// NOTE (beta): this is an unauthenticated endpoint — add a honeypot / Turnstile
// before public launch to deter spam.

import { getSupportSettings } from '@ilaunchify/db'
import { sendTransactionalEmail } from '@ilaunchify/notifications'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export async function submitContactMessage(input: {
  name: string
  email: string
  subject: string
  message: string
}): Promise<{ ok: boolean }> {
  const name = (input.name ?? '').trim().slice(0, 120)
  const email = (input.email ?? '').trim().slice(0, 160)
  const subject = ((input.subject ?? '').trim() || 'Partner enquiry').slice(0, 200)
  const message = (input.message ?? '').trim().slice(0, 5000)
  if (!name || !email || !message) return { ok: false }

  // Destination: admin-set forwarding address → env → beta default.
  const settings = await getSupportSettings().catch(() => null)
  const to =
    settings?.contactForwardingEmail || process.env.AUTH_EMAIL_FROM || 'ilaunchify@gmail.com'

  await sendTransactionalEmail({
    to,
    subject: `[Contact] ${subject}`,
    html: `<p><strong>${esc(name)}</strong> &lt;${esc(email)}&gt;</p><p><strong>Subject:</strong> ${esc(subject)}</p><p>${esc(message).replace(/\n/g, '<br>')}</p>`,
    text: `From: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
  })
  return { ok: true }
}
