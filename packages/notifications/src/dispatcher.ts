// Main entry point — fan out a single business event to all enabled channels
// for one user. Never throws; failures are logged but don't propagate.
//
// WIRED TO THE NOTIFICATION CENTER (2026-07-05, docs/EMAIL_NOTIFICATION_CENTER.md):
//   1. Resolve the event's CATEGORY → check the recipient's group-level
//      preference per channel (mandatory categories always deliver).
//   2. Compose content via resolveNotificationContent — PUBLISHED DB override
//      or code-template fallback, inside the branded header/footer shell.
//   3. Opt-outable categories get a signed one-click unsubscribe link +
//      List-Unsubscribe headers (Gmail/Yahoo one-click requirement).
//   4. Every send mirrors into EmailDelivery (deliverability surface).
// Absent control-plane rows (pre-migration or unconfigured) degrade to the
// exact pre-Center behavior: code template + locked-brand shell, default-on.

import { prisma } from '@ilaunchify/db'
import { Resend } from 'resend'
import type { NotificationEvent } from '@ilaunchify/db'
import { resolveNotificationContent } from './resolve-content'
import { categoryForEvent, isCategoryOptOutable, shouldDeliver } from './categories'
import { missingPayloadKeys } from './payload-required'
import {
  getCategoryPreferenceRows,
  getNotificationBranding,
  getTemplateOverride,
  isEmailSuppressed,
  recordEmailDelivery,
} from './center-db'
import {
  buildUnsubscribeToken,
  buildUnsubscribeUrl,
  buildOneClickUnsubscribeUrl,
  buildListUnsubscribeHeader,
  LIST_UNSUBSCRIBE_POST,
} from './unsubscribe'
import { isInQuietHours } from './preferences'
import { buildFeedbackLinkPair } from './feedback-token'
import { FEEDBACK_PROMPTS, isFeedbackPromptKey } from './feedback-prompts'
import { shouldRenderFeedbackBlock } from './feedback-eligibility'
import { getFeedbackSignals, getPromptSetting, subjectIdFromPayload } from './feedback-db'

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

// Public host serving the one-click unsubscribe route (marketing app —
// unauthenticated surface). Matches apps' marketingUrl() helper default.
function unsubscribeBaseUrl(): string {
  return process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3010'
}

/** From-header with the branded display name when configured. */
function fromHeader(configuredFrom: string, brandFromName: string | null | undefined): string {
  if (!brandFromName) return configuredFrom
  // AUTH_EMAIL_FROM may be "Name <addr>" or a bare address — extract the addr.
  const m = configuredFrom.match(/<([^>]+)>/)
  const addr = m?.[1] ?? configuredFrom
  return `${brandFromName} <${addr}>`
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

    const audience =
      input.audience ??
      (user.role === 'ADMIN'
        ? 'admin'
        : user.role === 'CREATOR'
          ? 'creator'
          : 'partner')

    // Payload guard (in-app P1) — warn loudly on missing required keys so a
    // bad dispatch call can't silently render "undefined" into user-facing
    // copy. Never blocks delivery (notifications must not break business ops).
    const missing = missingPayloadKeys(input.event, input.data)
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[notifications] ${input.event} payload is missing required key(s): ${missing.join(', ')} — template will render incomplete copy`,
      )
    }

    const category = categoryForEvent(input.event)
    const optOutable = isCategoryOptOutable(category)

    // Control-plane rows — all optional, all graceful-degrade (center-db).
    const [branding, override, prefRows] = await Promise.all([
      getNotificationBranding(),
      getTemplateOverride(input.event),
      getCategoryPreferenceRows(user.id),
    ])

    // Signed one-click unsubscribe link — only for opt-outable categories and
    // only when the secret is configured. Secret is passed into the pure
    // builder; never logged.
    const unsubscribeSecret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET
    const unsubscribeToken =
      optOutable && unsubscribeSecret
        ? buildUnsubscribeToken({ userId: user.id, category, secret: unsubscribeSecret })
        : null
    // Footer link = human landing page; header URL = RFC 8058 POST endpoint.
    const unsubscribeUrl = unsubscribeToken
      ? buildUnsubscribeUrl(unsubscribeBaseUrl(), unsubscribeToken)
      : undefined
    const oneClickUrl = unsubscribeToken
      ? buildOneClickUnsubscribeUrl(unsubscribeBaseUrl(), unsubscribeToken)
      : undefined

    // One-click feedback block (docs/FEEDBACK_MODULE.md §3.3): template opts
    // in via feedbackPrompt; eligibility (fatigue/mandatory/subject rules)
    // decides per-send; the vote rides in the links. Any failure → no block.
    let feedbackOpt: { question: string; upUrl: string; downUrl: string } | undefined
    const feedbackSecret = process.env.FEEDBACK_TOKEN_SECRET
    const promptKey = override?.feedbackPrompt
    if (promptKey && feedbackSecret && isFeedbackPromptKey(promptKey)) {
      try {
        const subject = subjectIdFromPayload(promptKey, input.data)
        if (subject) {
          const [setting, signals] = await Promise.all([
            getPromptSetting(promptKey),
            getFeedbackSignals({ userId: user.id, promptKey, ...subject }),
          ])
          const eligibility = shouldRenderFeedbackBlock({
            promptKey,
            event: input.event,
            promptEnabled: setting?.enabled,
            subjectId: subject.subjectId,
            ...signals,
          })
          if (eligibility.render) {
            const pair = buildFeedbackLinkPair({
              userId: user.id,
              promptKey,
              ...subject,
              secret: feedbackSecret,
              baseUrl: unsubscribeBaseUrl(),
            })
            feedbackOpt = { question: FEEDBACK_PROMPTS[promptKey].question, ...pair }
          }
        }
      } catch {
        // feedback is garnish — never block the send
      }
    }

    const content = resolveNotificationContent(input.event, input.data, {
      templateOverride: override,
      branding,
      audience,
      unsubscribeUrl,
      feedback: feedbackOpt,
    })

    const tasks: Promise<unknown>[] = []

    // IN_APP — write the row, regardless of quiet hours (notification center
    // is the place users go *to* see what's pending). Group-preference gated;
    // mandatory categories always pass.
    //
    // Coalescing (in-app P2, docs/IN_APP_NOTIFICATIONS_AUDIT.md §5 item 8):
    // when the event's Center template sets coalesceWindowMinutes and an
    // UNREAD, unarchived row with the same groupKey exists inside the window,
    // merge into it (fresh copy + "(N updates)" + bumped to the top) instead
    // of stacking a new row. Per-event tuning lives on the admin Notification
    // Center template row (Pavel 2026-07-06).
    if (shouldDeliver(input.event, 'IN_APP', prefRows)) {
      const windowMinutes = override?.coalesceWindowMinutes ?? 0
      const groupKey = coalesceGroupKey(input.event, input.data)
      tasks.push(
        writeInAppRow({
          userId: user.id,
          event: input.event,
          title: content.inApp.title,
          body: content.inApp.body,
          link: content.inApp.link,
          payload: input.data,
          groupKey,
          windowMinutes,
        }),
      )
    }

    // EMAIL — gated by the category preference AND quiet hours AND the
    // template's per-event email kill-switch. We always write the Notification
    // row when the preference allows (history), but skip the actual send when
    // in quiet hours; emailSentAt stays null.
    const emailKilled = override?.enabled === false
    if (!emailKilled && shouldDeliver(input.event, 'EMAIL', prefRows)) {
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
              title: content.inApp.title,
              body: content.inApp.body,
              link: content.inApp.link,
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
            // Bounce/complaint suppression (checklist E): skip the send, keep
            // the history row, stamp why.
            if (await isEmailSuppressed(user.email)) {
              await prisma.notification
                .update({
                  where: { id: row.id },
                  data: { emailError: 'suppressed: recent bounce/complaint' },
                })
                .catch(() => {})
              return
            }

            const headers: Record<string, string> = {}
            if (oneClickUrl) {
              headers['List-Unsubscribe'] = buildListUnsubscribeHeader({
                unsubscribeUrl: oneClickUrl,
              })
              headers['List-Unsubscribe-Post'] = LIST_UNSUBSCRIBE_POST
            }
            const result = await resend.emails.send({
              from: fromHeader(from, branding?.fromName),
              to: user.email,
              ...(branding?.replyToEmail ? { replyTo: branding.replyToEmail } : {}),
              subject: content.subject,
              html: content.html,
              text: content.text,
              ...(Object.keys(headers).length ? { headers } : {}),
            })
            await prisma.notification.update({
              where: { id: row.id },
              data: { emailSentAt: new Date() },
            })
            await recordEmailDelivery({
              notificationId: row.id,
              event: input.event,
              category,
              toEmail: user.email,
              providerMessageId: result.data?.id ?? null,
              status: 'SENT',
              // Response-rate denominator: which sends carried a feedback ask.
              detail: feedbackOpt && promptKey ? `feedback-prompt:${promptKey}` : null,
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

// =============================================================================
// IN_APP coalescing (in-app P2)
// =============================================================================

// Subject-id payload keys, in specificity order — the first present wins.
const SUBJECT_KEYS = ['dispatchId', 'orderId', 'ticketId', 'instanceId', 'orderRef'] as const

/** "{event}:{subjectId}", or null when the payload has no recognizable subject
 *  (no subject → no safe merge → always a fresh row). */
function coalesceGroupKey(
  event: NotificationEvent,
  data: Record<string, unknown>,
): string | null {
  for (const key of SUBJECT_KEYS) {
    const v = data[key]
    if (typeof v === 'string' && v) return `${event}:${v}`
  }
  return null
}

/** Create the IN_APP row, or merge into an existing unread row in-window.
 *  Merged rows get fresh copy, an "(N updates)" suffix, and a bumped
 *  createdAt so they surface at the top of the bell/feed. groupKey writes are
 *  cast-guarded until db:push + db:generate land the column. */
async function writeInAppRow(params: {
  userId: string
  event: NotificationEvent
  title: string
  body: string | null | undefined
  link: string | null | undefined
  payload: Record<string, unknown>
  groupKey: string | null
  windowMinutes: number
}): Promise<void> {
  // De-cast 2026-07-06 after push — groupKey is in the client.

  if (params.groupKey && params.windowMinutes > 0) {
    const windowStart = new Date(Date.now() - params.windowMinutes * 60_000)
    const existing = await prisma.notification.findFirst({
      where: {
        userId: params.userId,
        channel: 'IN_APP',
        readAt: null,
        archivedAt: null,
        createdAt: { gte: windowStart },
        groupKey: params.groupKey,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, payload: true },
    })

    if (existing) {
      const prev = (existing.payload ?? {}) as Record<string, unknown>
      const count = (typeof prev.coalescedCount === 'number' ? prev.coalescedCount : 1) + 1
      await prisma.notification.update({
        where: { id: existing.id },
        data: {
          title: `${params.title} (${count} updates)`,
          body: params.body ?? null,
          link: params.link ?? null,
          payload: { ...params.payload, coalescedCount: count } as never,
          createdAt: new Date(), // bump to the top of the feed
        },
      })
      return
    }
  }

  await prisma.notification.create({
    data: {
      userId: params.userId,
      event: params.event,
      channel: 'IN_APP',
      title: params.title,
      body: params.body ?? null,
      link: params.link ?? null,
      payload: params.payload as never,
      groupKey: params.groupKey,
    },
  })
}
