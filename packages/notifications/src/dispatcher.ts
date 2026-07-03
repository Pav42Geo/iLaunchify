// Main entry point — fan out a single business event to all enabled channels
// for one user. Never throws; failures are logged but don't propagate.

import { prisma } from '@ilaunchify/db'
import { Resend } from 'resend'
import type { NotificationEvent } from '@ilaunchify/db'
import { renderTemplate, absoluteLink } from './templates'
import { renderEmailHtml, renderEmailText, ctaLabelForEvent } from './email-html'
import { isEnabled, isInQuietHours } from './preferences'

export interface DispatchInput {
  userId: string
  event: NotificationEvent
  // Free-form data passed to the template; shape depends on event.
  data: Record<string, unknown>
  // Optional override — by default we infer this from the user's role.
  // Affects which app-host the email links point to. Phase H4 added
  // 'creator' so workflow events route to the creator app (3000).
  audience?: 'admin' | 'partner' | 'creator'
  // P2-severity batching (docs/PARTNER_ROLE_ACCOUNTS.md §6.1): when true, the
  // EMAIL row is written but NOT sent — the daily digest cron
  // (runNotificationDigest) bundles all tagged rows into one summary email.
  // IN_APP delivery is unaffected. Callers decide per-send (e.g. a 60-day doc
  // reminder digests; the 7-day one goes realtime).
  digest?: boolean
}

let resendClient: Resend | null = null
function getResend(): Resend | null {
  if (resendClient) return resendClient
  const key = process.env.AUTH_RESEND_KEY
  if (!key) return null
  resendClient = new Resend(key)
  return resendClient
}

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        quietHoursStartUtc: true,
        quietHoursEndUtc: true,
      },
    })
    if (!user) {
      // eslint-disable-next-line no-console
      console.warn(`[notifications] no user ${input.userId} for event ${input.event}`)
      return
    }

    const template = renderTemplate(input.event, input.data as never)
    const audience =
      input.audience ??
      (user.role === 'ADMIN'
        ? 'admin'
        : user.role === 'CREATOR'
          ? 'creator'
          : 'partner')

    const tasks: Promise<unknown>[] = []

    // IN_APP — write the row, regardless of quiet hours (notification center
    // is the place users go *to* see what's pending)
    if (await isEnabled(user.id, input.event, 'IN_APP')) {
      tasks.push(
        prisma.notification.create({
          data: {
            userId: user.id,
            event: input.event,
            channel: 'IN_APP',
            title: template.title,
            body: template.body,
            link: template.link,
            payload: input.data as never,
          },
        }),
      )
    }

    // EMAIL — guarded by enabled-preference AND quiet hours. We always write
    // the Notification row (so it appears in their history) but skip the
    // actual send when in quiet hours; emailSentAt stays null.
    if (await isEnabled(user.id, input.event, 'EMAIL')) {
      const inQuiet = isInQuietHours(user.quietHoursStartUtc, user.quietHoursEndUtc)
      const resend = getResend()
      const from = process.env.AUTH_EMAIL_FROM

      tasks.push(
        (async () => {
          const row = await prisma.notification.create({
            data: {
              userId: user.id,
              event: input.event,
              channel: 'EMAIL',
              title: template.title,
              body: template.body,
              link: template.link,
              // digest:true tags the row for the daily digest cron — it stays
              // emailSentAt=null until the digest bundles + stamps it.
              payload: (input.digest ? { ...input.data, digest: true } : input.data) as never,
            },
          })

          if (input.digest) return // digest cron owns the send

          if (inQuiet || !resend || !from) {
            // Skip the actual send; row remains with emailSentAt=null
            return
          }

          try {
            const linkAbsolute = template.link ? absoluteLink(template.link, audience) : null
            const content = {
              title: template.title,
              body: template.body || undefined,
              preheader: template.body || template.title,
              cta: linkAbsolute
                ? { label: ctaLabelForEvent(input.event), url: linkAbsolute }
                : undefined,
            }
            await resend.emails.send({
              from,
              to: user.email,
              subject: template.title,
              html: renderEmailHtml(content),
              text: renderEmailText(content),
            })
            await prisma.notification.update({
              where: { id: row.id },
              data: { emailSentAt: new Date() },
            })
          } catch (err) {
            await prisma.notification
              .update({
                where: { id: row.id },
                data: { emailError: ((err as Error).message ?? 'unknown').slice(0, 300) },
              })
              .catch(() => {})
            // eslint-disable-next-line no-console
            console.error(`[notifications] email send failed for ${user.email}`, err)
          }
        })(),
      )
    }

    await Promise.allSettled(tasks)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notifications] dispatcher failed', err)
  }
}
