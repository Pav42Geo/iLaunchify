// Certificates C4 — nightly expiry sweep. Server-only (prisma + notifications +
// audit). Invoked by the /api/cron/cert-expiry route.
//
// Responsibilities (idempotent; safe to run repeatedly):
//   1. Auto-expire VERIFIED instances past their expiryDate → status EXPIRED.
//   2. Grace window — mark every attached ProductTemplate.certRefreshNeededAt
//      (we never auto-detach; the product keeps the cert but is flagged).
//   3. Notify the partner that the cert expired (with affected-product count).
//   4. Alert admins when an expired cert was attached to PUBLISHED products
//      (writes /admin/audit + dispatches to admin users).
//   5. Threshold reminders at 60 / 30 / 7 days out — one notice per threshold,
//      idempotent via notifiedAt60d/30d/7d flags, never sent backwards.
//   6. Escalation — a product still flagged "needs cert refresh" 30 days later
//      writes a CERT_REFRESH_ESCALATION audit row (visible in /admin/audit).

import { prisma } from '@ilaunchify/db'
import { dispatchNotification } from '@ilaunchify/notifications'
import { logSystemAudit } from '@ilaunchify/audit'

const MS_PER_DAY = 1000 * 60 * 60 * 24

// Ordered most-urgent first so we send the smallest applicable threshold.
const THRESHOLDS = [
  { days: 7, flag: 'notifiedAt7d' as const },
  { days: 30, flag: 'notifiedAt30d' as const },
  { days: 60, flag: 'notifiedAt60d' as const },
]

export interface CertExpirySweepResult {
  expiredCount: number
  productsFlagged: number
  partnerExpiredNotices: number
  adminAlerts: number
  thresholdNotices: number
  escalations: number
}

function daysUntil(expiry: Date, now: Date): number {
  return Math.ceil((expiry.getTime() - now.getTime()) / MS_PER_DAY)
}

export async function runCertExpirySweep(now: Date = new Date()): Promise<CertExpirySweepResult> {
  const result: CertExpirySweepResult = {
    expiredCount: 0,
    productsFlagged: 0,
    partnerExpiredNotices: 0,
    adminAlerts: 0,
    thresholdNotices: 0,
    escalations: 0,
  }

  const adminUsers = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })

  // ---------------------------------------------------------------------------
  // 1–4. Auto-expire VERIFIED instances whose expiryDate has passed.
  // ---------------------------------------------------------------------------
  const newlyExpired = await prisma.partnerCertificateInstance.findMany({
    where: { status: 'VERIFIED', expiryDate: { lt: now } },
    include: {
      certificateType: { select: { name: true } },
      partner: { select: { id: true, userId: true, companyName: true } },
      productAssignments: {
        include: {
          productTemplate: {
            select: {
              id: true,
              name: true,
              status: true,
              certRefreshNeededAt: true,
              products: { select: { brand: { select: { name: true } } } },
            },
          },
        },
      },
    },
  })

  for (const inst of newlyExpired) {
    await prisma.partnerCertificateInstance.update({
      where: { id: inst.id },
      data: { status: 'EXPIRED' },
    })
    result.expiredCount++

    await logSystemAudit({
      entityType: 'PartnerCertificateInstance',
      entityId: inst.id,
      action: 'CERT_INSTANCE_EXPIRE',
      fromValue: 'VERIFIED',
      toValue: 'EXPIRED',
      payload: {
        partnerId: inst.partner.id,
        certificateType: inst.certificateType.name,
        expiryDate: inst.expiryDate.toISOString(),
        attachedProductCount: inst.productAssignments.length,
      },
    })

    // Grace window — flag every attached template (no auto-detach).
    const publishedTemplates: { id: string; name: string; creatorNames: string[] }[] = []
    for (const assignment of inst.productAssignments) {
      const tpl = assignment.productTemplate
      if (!tpl.certRefreshNeededAt) {
        await prisma.productTemplate.update({
          where: { id: tpl.id },
          data: { certRefreshNeededAt: now },
        })
        result.productsFlagged++
      }
      if (tpl.status === 'PUBLISHED') {
        const creatorNames = Array.from(
          new Set(tpl.products.map((p) => p.brand.name).filter(Boolean)),
        )
        publishedTemplates.push({ id: tpl.id, name: tpl.name, creatorNames })
      }
    }

    // Notify the partner.
    if (inst.partner.userId) {
      await dispatchNotification({
        userId: inst.partner.userId,
        event: 'CERT_EXPIRED',
        audience: 'partner',
        data: {
          instanceId: inst.id,
          certName: inst.certificateType.name,
          expiryDate: inst.expiryDate.toISOString(),
          affectedProductCount: inst.productAssignments.length,
        },
      })
      result.partnerExpiredNotices++
    }

    // Admin alert + audit when PUBLISHED products are affected.
    if (publishedTemplates.length > 0) {
      const creatorNames = Array.from(
        new Set(publishedTemplates.flatMap((t) => t.creatorNames)),
      )
      await logSystemAudit({
        entityType: 'PartnerCertificateInstance',
        entityId: inst.id,
        action: 'CERT_EXPIRED_ON_PUBLISHED',
        payload: {
          partnerId: inst.partner.id,
          companyName: inst.partner.companyName,
          certificateType: inst.certificateType.name,
          affectedProductCount: publishedTemplates.length,
          affectedTemplateIds: publishedTemplates.map((t) => t.id),
          creatorNames,
        },
      })
      for (const admin of adminUsers) {
        await dispatchNotification({
          userId: admin.id,
          event: 'ADMIN_CERT_EXPIRED_ON_PUBLISHED',
          audience: 'admin',
          data: {
            instanceId: inst.id,
            certName: inst.certificateType.name,
            companyName: inst.partner.companyName,
            affectedProductCount: publishedTemplates.length,
            creatorNames,
          },
        })
      }
      result.adminAlerts++
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Threshold reminders for still-VERIFIED instances expiring within 60d.
  // ---------------------------------------------------------------------------
  const horizon = new Date(now.getTime() + 60 * MS_PER_DAY)
  const upcoming = await prisma.partnerCertificateInstance.findMany({
    where: { status: 'VERIFIED', expiryDate: { gte: now, lte: horizon } },
    include: {
      certificateType: { select: { name: true } },
      partner: { select: { userId: true } },
    },
  })

  for (const inst of upcoming) {
    if (!inst.partner.userId) continue
    const remaining = daysUntil(inst.expiryDate, now)

    // Smallest threshold not yet sent that the cert is now within.
    const chosen = THRESHOLDS.find(
      (t) => remaining <= t.days && inst[t.flag] == null,
    )
    if (!chosen) continue

    await dispatchNotification({
      userId: inst.partner.userId,
      event: 'CERT_EXPIRING_SOON',
      audience: 'partner',
      data: {
        instanceId: inst.id,
        certName: inst.certificateType.name,
        daysRemaining: Math.max(remaining, 0),
        expiryDate: inst.expiryDate.toISOString(),
      },
    })
    result.thresholdNotices++

    // Mark the chosen threshold AND every coarser one as sent — a more-urgent
    // notice supersedes the less-urgent ones (never send a 30d notice after 7d).
    const flagUpdate: { notifiedAt7d?: Date; notifiedAt30d?: Date; notifiedAt60d?: Date } = {}
    for (const t of THRESHOLDS) {
      if (t.days >= chosen.days) flagUpdate[t.flag] = now
    }
    await prisma.partnerCertificateInstance.update({
      where: { id: inst.id },
      data: flagUpdate,
    })
  }

  // ---------------------------------------------------------------------------
  // 6. Escalation — products flagged "needs cert refresh" ~30 days ago and still
  //    unresolved. The [30d, 31d) window catches each template once on a daily
  //    cron, so this stays idempotent without an extra flag.
  // ---------------------------------------------------------------------------
  const escalateTo = new Date(now.getTime() - 30 * MS_PER_DAY)
  const escalateFrom = new Date(now.getTime() - 31 * MS_PER_DAY)
  const stale = await prisma.productTemplate.findMany({
    where: {
      status: 'PUBLISHED',
      certRefreshNeededAt: { gte: escalateFrom, lt: escalateTo },
    },
    select: { id: true, name: true, certRefreshNeededAt: true },
  })
  for (const tpl of stale) {
    await logSystemAudit({
      entityType: 'ProductTemplate',
      entityId: tpl.id,
      action: 'CERT_REFRESH_ESCALATION',
      payload: {
        productName: tpl.name,
        flaggedAt: tpl.certRefreshNeededAt?.toISOString() ?? null,
        unresolvedDays: 30,
      },
    })
    result.escalations++
  }

  return result
}
