// Partner Role Accounts P0 — nightly ops sweep (docs/PARTNER_ROLE_ACCOUNTS.md
// §6.2 + §6.4). Server-only (prisma + notifications + audit). Invoked by the
// /api/cron/partner-ops route. Mirrors cert-expiry-worker's shape: every step
// is idempotent (dedupe stamps / threshold flags), safe to run repeatedly.
//
// Responsibilities:
//   1. Expiry Engine v1 — PartnerFile documents with an expiresAt (COI,
//      uploaded cert files): threshold reminders at 60/30/7 days (one notice
//      per threshold via notifiedAt60d/30d/7d), DOC_EXPIRED on lapse (once,
//      via expiredNotifiedAt) + PARTNER_DOC_EXPIRED audit row + admin alert.
//      NOTE: hard capability suspension lands with the onboarding doc tracks
//      (docType → capability map); until then expiry = notify + audit trail.
//      Certificate INSTANCES are already swept by cert-expiry-worker (C4) —
//      this worker only covers raw partner FILES, no overlap.
//   2. DISPATCH_SLA_AT_RISK — PENDING_ACCEPT dispatches that consumed ~50% of
//      their accept window (earlier, softer warning than the existing
//      DISPATCH_ACCEPT_REMINDER; dedupe via slaAtRiskNotifiedAt).
//   3. INBOUND_DELIVERED_UNCONFIRMED — carrier says DELIVERED on the latest
//      ShipmentLeg but the FC hasn't confirmed the receipt yet (dedupe via
//      inboundUnconfirmedNotifiedAt). Receiving-SLA nudge to the FC partner.

import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { dispatchNotification } from '@ilaunchify/notifications'
import { logSystemAudit } from '@ilaunchify/audit'

const MS_PER_DAY = 1000 * 60 * 60 * 24

// Ordered most-urgent first so we send the smallest applicable threshold.
const DOC_THRESHOLDS = [
  { days: 7, flag: 'notifiedAt7d' as const },
  { days: 30, flag: 'notifiedAt30d' as const },
  { days: 60, flag: 'notifiedAt60d' as const },
]

// Document kinds worth an expiry reminder (skip logos / photos / dielines
// even if someone sets an expiresAt on them).
const EXPIRING_DOC_KINDS = ['CERTIFICATE', 'BUSINESS_LICENSE', 'INSURANCE', 'KYB_ID', 'OTHER']

const DOC_KIND_LABEL: Record<string, string> = {
  CERTIFICATE: 'Certificate document',
  BUSINESS_LICENSE: 'Business license',
  INSURANCE: 'Certificate of Insurance',
  KYB_ID: 'Identity document',
  OTHER: 'Compliance document',
}

export interface PartnerOpsSweepResult {
  docThresholdNotices: number
  docExpiredNotices: number
  slaAtRiskNotices: number
  inboundUnconfirmedNotices: number
}

function daysUntil(expiry: Date, now: Date): number {
  return Math.ceil((expiry.getTime() - now.getTime()) / MS_PER_DAY)
}

export async function runPartnerOpsSweep(now: Date = new Date()): Promise<PartnerOpsSweepResult> {
  const result: PartnerOpsSweepResult = {
    docThresholdNotices: 0,
    docExpiredNotices: 0,
    slaAtRiskNotices: 0,
    inboundUnconfirmedNotices: 0,
  }

  const adminUsers = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })

  // ---------------------------------------------------------------------------
  // 1a. Doc expiry — lapsed documents (once per file).
  // ---------------------------------------------------------------------------
  const lapsed = await prisma.partnerFile.findMany({
    where: {
      expiresAt: { lt: now },
      expiredNotifiedAt: null,
      kind: { in: EXPIRING_DOC_KINDS as never },
    },
    select: {
      id: true,
      kind: true,
      originalFilename: true,
      expiresAt: true,
      partner: { select: { id: true, userId: true, companyName: true } },
    },
  })

  for (const file of lapsed) {
    const docLabel = DOC_KIND_LABEL[file.kind as string] ?? 'Compliance document'
    await prisma.partnerFile.update({
      where: { id: file.id },
      data: { expiredNotifiedAt: now },
    })

    await logSystemAudit({
      entityType: 'Partner',
      entityId: file.partner.id,
      action: 'PARTNER_DOC_EXPIRED',
      payload: {
        partnerFileId: file.id,
        kind: file.kind,
        filename: file.originalFilename,
        expiresAt: file.expiresAt?.toISOString() ?? null,
      },
    })

    const sends: Promise<void>[] = []
    if (file.partner.userId) {
      sends.push(
        dispatchNotification({
          userId: file.partner.userId,
          // Cast until `pnpm db:generate` picks up the P0 enum additions.
          event: 'DOC_EXPIRED' as NotificationEvent,
          data: { docLabel, href: '/my-application' },
          audience: 'partner',
        }),
      )
    }
    for (const admin of adminUsers) {
      sends.push(
        dispatchNotification({
          userId: admin.id,
          event: 'DOC_EXPIRED' as NotificationEvent,
          data: {
            docLabel: `${file.partner.companyName} — ${docLabel}`,
            href: `/partners/${file.partner.id}`,
          },
          audience: 'admin',
        }),
      )
    }
    await Promise.allSettled(sends)
    result.docExpiredNotices++
  }

  // ---------------------------------------------------------------------------
  // 1b. Doc expiry — 60/30/7 threshold reminders (one per threshold).
  // ---------------------------------------------------------------------------
  const expiring = await prisma.partnerFile.findMany({
    where: {
      expiresAt: { gte: now, lte: new Date(now.getTime() + 60 * MS_PER_DAY) },
      kind: { in: EXPIRING_DOC_KINDS as never },
    },
    select: {
      id: true,
      kind: true,
      expiresAt: true,
      notifiedAt60d: true,
      notifiedAt30d: true,
      notifiedAt7d: true,
      partner: { select: { id: true, userId: true } },
    },
  })

  for (const file of expiring) {
    if (!file.expiresAt || !file.partner.userId) continue
    const left = daysUntil(file.expiresAt, now)
    const threshold = DOC_THRESHOLDS.find((t) => left <= t.days && !file[t.flag])
    if (!threshold) continue

    // Stamp EVERY threshold ≥ the one firing so we never send backwards
    // (a file first seen at 5 days out gets one notice, not three).
    const stamps: Record<string, Date> = {}
    for (const t of DOC_THRESHOLDS) {
      if (t.days >= threshold.days && !file[t.flag]) stamps[t.flag] = now
    }
    await prisma.partnerFile.update({ where: { id: file.id }, data: stamps })

    await dispatchNotification({
      userId: file.partner.userId,
      event: 'DOC_EXPIRING_SOON' as NotificationEvent,
      data: {
        docLabel: DOC_KIND_LABEL[file.kind as string] ?? 'Compliance document',
        daysLeft: left,
        href: '/my-application',
      },
      audience: 'partner',
    })
    result.docThresholdNotices++
  }

  // ---------------------------------------------------------------------------
  // 2. DISPATCH_SLA_AT_RISK — PENDING_ACCEPT past ~50% of the accept window.
  // ---------------------------------------------------------------------------
  const pending = await prisma.orderDispatch.findMany({
    where: {
      status: 'PENDING_ACCEPT',
      slaAtRiskNotifiedAt: null,
      acceptDeadlineAt: { gt: now }, // past-deadline is auto-cancel's job
    },
    select: {
      id: true,
      createdAt: true,
      acceptDeadlineAt: true,
      partnerService: { select: { partner: { select: { userId: true } } } },
    },
  })

  for (const d of pending) {
    const windowMs = d.acceptDeadlineAt.getTime() - d.createdAt.getTime()
    if (windowMs <= 0) continue
    const consumed = (now.getTime() - d.createdAt.getTime()) / windowMs
    if (consumed < 0.5) continue
    const userId = d.partnerService.partner.userId
    if (!userId) continue

    await prisma.orderDispatch.update({
      where: { id: d.id },
      data: { slaAtRiskNotifiedAt: now },
    })
    await dispatchNotification({
      userId,
      event: 'DISPATCH_SLA_AT_RISK' as NotificationEvent,
      data: {
        dispatchId: d.id,
        hoursWaiting: Math.round((now.getTime() - d.createdAt.getTime()) / 3600000),
        hoursRemaining: Math.max(1, Math.round((d.acceptDeadlineAt.getTime() - now.getTime()) / 3600000)),
      },
      audience: 'partner',
    })
    result.slaAtRiskNotices++
  }

  // ---------------------------------------------------------------------------
  // 3. INBOUND_DELIVERED_UNCONFIRMED — latest leg DELIVERED, receipt missing.
  // ---------------------------------------------------------------------------
  const unconfirmed = await prisma.orderDispatch.findMany({
    where: {
      status: { in: ['SHIPPED', 'IN_TRANSIT'] },
      inboundUnconfirmedNotifiedAt: null,
      inboundReceipt: null,
      order: { shipToType: 'WAREHOUSE_PARTNER' },
      shipmentLegs: { some: { status: 'DELIVERED' } },
    },
    select: {
      id: true,
      orderId: true,
      order: {
        select: {
          orderNumber: true,
          shipToPartnerService: { select: { partner: { select: { userId: true } } } },
        },
      },
    },
  })

  for (const d of unconfirmed) {
    const fcUserId = d.order.shipToPartnerService?.partner.userId
    if (!fcUserId) continue
    await prisma.orderDispatch.update({
      where: { id: d.id },
      data: { inboundUnconfirmedNotifiedAt: now },
    })
    await dispatchNotification({
      userId: fcUserId,
      event: 'INBOUND_DELIVERED_UNCONFIRMED' as NotificationEvent,
      data: {
        dispatchId: d.id,
        orderRef: d.order.orderNumber ?? `#${d.orderId.slice(-8)}`,
      },
      audience: 'partner',
    })
    result.inboundUnconfirmedNotices++
  }

  return result
}
