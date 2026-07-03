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

import { prisma, docTrackFor } from '@ilaunchify/db'
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

// Release-ship SLA (P1 §6): warn the storing partner after N days unshipped,
// escalate to admins at 2×. Calendar days in V1 (business-day math follows
// with the SlaRule table).
const RELEASE_SLA_WARN_DAYS = 2
const RELEASE_SLA_ESCALATE_DAYS = 4
// Receiving second stage: escalate to admins when a delivered shipment is
// still unconfirmed N days after the FC was nudged.
const RECEIVING_ESCALATE_DAYS = 3

export interface PartnerOpsSweepResult {
  docThresholdNotices: number
  docExpiredNotices: number
  docCapabilitySuspensions: number
  slaAtRiskNotices: number
  inboundUnconfirmedNotices: number
  inboundEscalations: number
  releaseSlaNotices: number
  releaseSlaEscalations: number
}

function daysUntil(expiry: Date, now: Date): number {
  return Math.ceil((expiry.getTime() - now.getTime()) / MS_PER_DAY)
}

export async function runPartnerOpsSweep(now: Date = new Date()): Promise<PartnerOpsSweepResult> {
  const result: PartnerOpsSweepResult = {
    docThresholdNotices: 0,
    docExpiredNotices: 0,
    docCapabilitySuspensions: 0,
    slaAtRiskNotices: 0,
    inboundUnconfirmedNotices: 0,
    inboundEscalations: 0,
    releaseSlaNotices: 0,
    releaseSlaEscalations: 0,
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
      sectionType: true,
      originalFilename: true,
      expiresAt: true,
      partner: {
        select: {
          id: true,
          userId: true,
          companyName: true,
          services: { select: { id: true, type: true, status: true } },
        },
      },
    },
  })

  for (const file of lapsed) {
    const docLabel = DOC_KIND_LABEL[file.kind as string] ?? 'Compliance document'
    await prisma.partnerFile.update({
      where: { id: file.id },
      data: { expiredNotifiedAt: now },
    })

    // ---- Capability suspension (§6.4, LOCKED): a lapsed REQUIRED track doc
    // with NO surviving valid file in the same (sectionType, kind) pool pauses
    // the services it backs. Reinstatement stays a manual admin action on the
    // partner detail page after a renewed doc is verified — conservative on
    // both edges (60/30/7 reminders precede this; nothing un-pauses silently).
    const serviceTypes = file.partner.services.map((s) => s.type as string)
    const requirement = docTrackFor(serviceTypes).find(
      (d) =>
        d.kind === (file.kind as string) &&
        d.sectionType === (file.sectionType as string) &&
        d.requirement === 'REQUIRED' &&
        d.expiring,
    )
    let suspendedLabel: string | undefined
    if (requirement) {
      const survivor = await prisma.partnerFile.count({
        where: {
          partnerId: file.partner.id,
          sectionType: file.sectionType,
          kind: file.kind,
          id: { not: file.id },
          OR: [{ expiresAt: { gt: now } }, { expiresAt: null }],
        },
      })
      if (survivor === 0) {
        const affected = file.partner.services.filter(
          (s) =>
            s.status === 'ACTIVE' &&
            (requirement.appliesTo.length === 0 || requirement.appliesTo.includes(s.type as string)),
        )
        for (const svc of affected) {
          await prisma.partnerService.update({
            where: { id: svc.id },
            data: { status: 'PAUSED' },
          })
          await logSystemAudit({
            entityType: 'PartnerService',
            entityId: svc.id,
            action: 'SERVICE_PAUSED_DOC_LAPSE',
            fromValue: 'ACTIVE',
            toValue: 'PAUSED',
            payload: { partnerFileId: file.id, docKey: requirement.key, docLabel },
          })
          result.docCapabilitySuspensions++
        }
        if (affected.length > 0) {
          suspendedLabel =
            requirement.appliesTo.length === 0
              ? 'partner service'
              : affected.map((s) => (s.type as string).toLowerCase().replace('_', ' ')).join(', ')
        }
      }
    }

    await logSystemAudit({
      entityType: 'Partner',
      entityId: file.partner.id,
      action: 'PARTNER_DOC_EXPIRED',
      payload: {
        partnerFileId: file.id,
        kind: file.kind,
        filename: file.originalFilename,
        expiresAt: file.expiresAt?.toISOString() ?? null,
        capabilitySuspended: Boolean(suspendedLabel),
      },
    })

    const sends: Promise<void>[] = []
    if (file.partner.userId) {
      sends.push(
        dispatchNotification({
          userId: file.partner.userId,
          // Cast until `pnpm db:generate` picks up the P0 enum additions.
          event: 'DOC_EXPIRED' as NotificationEvent,
          data: { docLabel, suspendedCapability: suspendedLabel, href: '/my-application' },
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
            docLabel: `${file.partner.companyName} — ${docLabel}${suspendedLabel ? ' (services paused)' : ''}`,
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
      // §6.1 severity: 60/30-day reminders are P2 → daily digest; the 7-day
      // reminder is P1 → realtime email.
      digest: left > 7,
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

  // ---------------------------------------------------------------------------
  // 3b. Receiving second stage — FC was nudged, receipt STILL missing → admins.
  // ---------------------------------------------------------------------------
  const stale = await prisma.orderDispatch.findMany({
    where: {
      status: { in: ['SHIPPED', 'IN_TRANSIT'] },
      inboundReceipt: null,
      inboundUnconfirmedEscalatedAt: null,
      inboundUnconfirmedNotifiedAt: {
        lt: new Date(now.getTime() - RECEIVING_ESCALATE_DAYS * MS_PER_DAY),
      },
    },
    select: { id: true, orderId: true },
  })
  for (const d of stale) {
    await prisma.orderDispatch.update({
      where: { id: d.id },
      data: { inboundUnconfirmedEscalatedAt: now },
    })
    await Promise.allSettled(
      adminUsers.map((a) =>
        dispatchNotification({
          userId: a.id,
          event: 'ORDER_NEEDS_ATTENTION',
          data: { orderId: d.orderId, status: 'INBOUND_RECEIPT_OVERDUE' },
          audience: 'admin',
        }),
      ),
    )
    result.inboundEscalations++
  }

  // ---------------------------------------------------------------------------
  // 4. Release-ship SLA — REQUESTED/PICKING releases sitting too long:
  //    warn the storing partner at RELEASE_SLA_WARN_DAYS (once), escalate to
  //    admins at RELEASE_SLA_ESCALATE_DAYS (once).
  // ---------------------------------------------------------------------------
  const openReleases = await prisma.storageReleaseOrder.findMany({
    where: {
      status: { in: ['REQUESTED', 'PICKING'] },
      createdAt: { lt: new Date(now.getTime() - RELEASE_SLA_WARN_DAYS * MS_PER_DAY) },
      OR: [{ slaNotifiedAt: null }, { slaEscalatedAt: null }],
    },
    select: {
      id: true,
      createdAt: true,
      slaNotifiedAt: true,
      slaEscalatedAt: true,
      storageAgreement: {
        select: {
          orderId: true,
          order: { select: { orderNumber: true } },
          partnerService: { select: { partner: { select: { userId: true } } } },
        },
      },
    },
  })
  for (const r of openReleases) {
    const daysWaiting = Math.floor((now.getTime() - r.createdAt.getTime()) / MS_PER_DAY)
    const orderRef =
      r.storageAgreement.order.orderNumber ?? `#${r.storageAgreement.orderId.slice(-8)}`

    if (!r.slaNotifiedAt) {
      const partnerUserId = r.storageAgreement.partnerService.partner.userId
      await prisma.storageReleaseOrder.update({
        where: { id: r.id },
        data: { slaNotifiedAt: now },
      })
      if (partnerUserId) {
        await dispatchNotification({
          userId: partnerUserId,
          event: 'RELEASE_SHIP_SLA_AT_RISK' as NotificationEvent,
          data: { orderRef, daysWaiting },
          audience: 'partner',
        })
      }
      result.releaseSlaNotices++
    }

    if (!r.slaEscalatedAt && daysWaiting >= RELEASE_SLA_ESCALATE_DAYS) {
      await prisma.storageReleaseOrder.update({
        where: { id: r.id },
        data: { slaEscalatedAt: now },
      })
      await Promise.allSettled(
        adminUsers.map((a) =>
          dispatchNotification({
            userId: a.id,
            event: 'ORDER_NEEDS_ATTENTION',
            data: { orderId: r.storageAgreement.orderId, status: 'RELEASE_SHIP_OVERDUE' },
            audience: 'admin',
          }),
        ),
      )
      result.releaseSlaEscalations++
    }
  }

  return result
}
