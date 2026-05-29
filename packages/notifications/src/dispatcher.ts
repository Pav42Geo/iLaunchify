// Main entry point — fan out a single business event to all enabled channels
// for one user. Never throws; failures are logged but don't propagate.

import { prisma } from '@ilaunchify/db'
import { Resend } from 'resend'
import type { NotificationEvent } from '@prisma/client'
import { renderTemplate, absoluteLink } from './templates'
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
              payload: input.data as never,
            },
          })

          if (inQuiet || !resend || !from) {
            // Skip the actual send; row remains with emailSentAt=null
            return
          }

          try {
            const linkAbsolute = template.link ? absoluteLink(template.link, audience) : null
            const html = `
              <div style="font-family:-apple-system,sans-serif;color:#18181b;max-width:560px;margin:0 auto;padding:24px">
                <h1 style="font-size:18px;font-weight:600;margin:0 0 12px">${escape(template.title)}</h1>
                ${template.body ? `<p style="font-size:14px;line-height:1.5;color:#52525b;margin:0 0 16px">${escape(template.body)}</p>` : ''}
                ${linkAbsolute ? `<a href="${linkAbsolute}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;font-weight:500">View in iLaunchify</a>` : ''}
                <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0" />
                <p style="font-size:12px;color:#a1a1aa;margin:0">
                  You received this because notifications are enabled for ${input.event}.
                  Manage preferences in settings.
                </p>
              </div>
            `
            await resend.emails.send({
              from,
              to: user.email,
              subject: template.title,
              html,
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

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
