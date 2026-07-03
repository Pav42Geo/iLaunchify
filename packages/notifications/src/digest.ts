// Daily notification digest — Partner Role Accounts P0 §6.1 ("digest by
// default, realtime by exception"). Bundles EMAIL rows tagged digest:true by
// the dispatcher (emailSentAt still null) into ONE summary email per user,
// then stamps every included row — idempotent, safe to re-run.
//
// Never throws per-user; a failed send leaves that user's rows unstamped for
// the next run. Quiet hours don't apply (a daily digest at a fixed hour IS
// the quiet option).

import { prisma } from '@ilaunchify/db'
import { Resend } from 'resend'
import { renderEmailHtml, renderEmailText } from './email-html'
import { absoluteLink } from './templates'

const LOOKBACK_HOURS = 26 // daily cron + 2h slack; older unstamped rows age out

export interface DigestResult {
  usersEmailed: number
  itemsBundled: number
  skippedNoResend: boolean
}

export async function runNotificationDigest(now: Date = new Date()): Promise<DigestResult> {
  const result: DigestResult = { usersEmailed: 0, itemsBundled: 0, skippedNoResend: false }

  const key = process.env.AUTH_RESEND_KEY
  const from = process.env.AUTH_EMAIL_FROM
  if (!key || !from) {
    result.skippedNoResend = true
    return result
  }
  const resend = new Resend(key)

  const rows = await prisma.notification.findMany({
    where: {
      channel: 'EMAIL',
      emailSentAt: null,
      emailError: null,
      createdAt: { gte: new Date(now.getTime() - LOOKBACK_HOURS * 3600_000) },
      payload: { path: ['digest'], equals: true },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      userId: true,
      title: true,
      body: true,
      link: true,
      user: { select: { email: true, role: true } },
    },
  })
  if (rows.length === 0) return result

  const byUser = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? []
    list.push(r)
    byUser.set(r.userId, list)
  }

  for (const [, items] of byUser) {
    const user = items[0]?.user
    if (!user?.email) continue
    const audience = user.role === 'ADMIN' ? 'admin' : user.role === 'CREATOR' ? 'creator' : 'partner'

    const lines = items.map((i) => {
      const url = i.link ? absoluteLink(i.link, audience) : null
      return url ? `• ${i.title}\n  ${url}` : `• ${i.title}`
    })
    const content = {
      title: `Your iLaunchify daily digest — ${items.length} update${items.length === 1 ? '' : 's'}`,
      body: lines.join('\n\n'),
      preheader: items.map((i) => i.title).join(' · ').slice(0, 140),
      cta: undefined,
    }

    try {
      await resend.emails.send({
        from,
        to: user.email,
        subject: content.title,
        html: renderEmailHtml(content),
        text: renderEmailText(content),
      })
      await prisma.notification.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { emailSentAt: now },
      })
      result.usersEmailed++
      result.itemsBundled += items.length
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[notifications] digest send failed', (err as Error).message)
    }
  }

  return result
}
