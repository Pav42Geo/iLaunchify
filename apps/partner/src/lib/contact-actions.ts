'use server'

// Public "Contact us" footer form → forwards the message by email to the address
// the admin configures in SupportSettings.contactForwardingEmail (fallback:
// AUTH_EMAIL_FROM). Best-effort: sendTransactionalEmail never throws and no-ops
// when Resend isn't configured, so this is safe in beta. Callable from both the
// public Application page and the authenticated Onboarding surface.
//
// Spam defense (H5 A4): this is an unauthenticated endpoint, so it's gated behind
// Cloudflare Turnstile — verified before we forward anything. Feature-gated in
// verifyTurnstile (unset secret → skip/allow), so beta without keys still works.

import { getSupportSettings } from '@ilaunchify/db'
import { sendTransactionalEmail } from '@ilaunchify/notifications'
import { verifyTurnstile, requestIp } from '@ilaunchify/auth'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export async function submitContactMessage(input: {
  name: string
  email: string
  subject: string
  message: string
  turnstileToken?: string
}): Promise<{ ok: boolean }> {
  const name = (input.name ?? '').trim().slice(0, 120)
  const email = (input.email ?? '').trim().slice(0, 160)
  const subject = ((input.subject ?? '').trim() || 'Partner enquiry').slice(0, 200)
  const message = (input.message ?? '').trim().slice(0, 5000)
  if (!name || !email || !message) return { ok: false }

  // Bot defense before we forward anything (H5 A4). Skips (allows) when unconfigured.
  const turnstile = await verifyTurnstile({ token: input.turnstileToken, ip: await requestIp() })
  if (!turnstile.ok) return { ok: false }

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
