'use server'

// Admin partner status transitions.
// Per docs/PARTNER_ONBOARDING.md §3 + #160 (activation flow).
//
// The 10-state FSM is enforced by ALLOWED_TRANSITIONS in /lib/partner-fsm.ts.
// A single promotePartnerStatus action handles every transition uniformly so:
//   - Every status change writes an AuditLog row with from/to + actor.
//   - statusChangedAt / statusChangedById / statusChangeReason are stamped on
//     Partner for the timeline view.
//   - The ACTIVE transition flips DRAFT PartnerService rows → ACTIVE (just like
//     the legacy activatePartner did).
//   - Partner is notified on key transitions (VERIFIED + REQUEST_CHANGES + ACTIVATE).
//
// Legacy aliases (activatePartner / suspendPartner / requestChanges) are kept
// for back-compat with existing PartnerActions calls.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'
import type { PartnerStatus } from '@ilaunchify/db'
import {
  isAllowedTransition,
  auditActionForTransition,
  notificationEventForTransition,
} from '@/lib/partner-fsm'
import { computeOverallStatus } from '@/lib/verification'

type Result = { ok: true } | { ok: false; error: string }

interface PromoteInput {
  partnerId: string
  toStatus: PartnerStatus
  reason?: string
}

export async function promotePartnerStatus({
  partnerId,
  toStatus,
  reason,
}: PromoteInput): Promise<Result> {
  const admin = await requireCapability('partners:approve')

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      services: true,
      verificationSections: true,
    },
  })
  if (!partner) return { ok: false, error: 'Partner not found' }

  if (partner.status === toStatus) {
    return { ok: false, error: `Partner is already ${toStatus}` }
  }

  // Structural FSM check
  if (!isAllowedTransition(partner.status, toStatus)) {
    return {
      ok: false,
      error: `Cannot transition from ${partner.status} to ${toStatus}`,
    }
  }

  // Gates per-target — beyond the structural FSM check:
  //   ACTIVE requires all 5 sections VERIFIED (otherwise nothing was actually verified)
  if (toStatus === 'ACTIVE') {
    const overall = computeOverallStatus(partner.verificationSections)
    if (overall !== 'VERIFIED' && partner.status !== 'PAUSED' && partner.status !== 'SUSPENDED') {
      return {
        ok: false,
        error:
          'All 5 verification sections must be VERIFIED before activating. Open the verification queue and resolve any PENDING / NEEDS_CHANGES rows first.',
      }
    }
  }

  const fromStatus = partner.status

  await prisma.$transaction(async (tx) => {
    await tx.partner.update({
      where: { id: partnerId },
      data: {
        status: toStatus,
        statusChangedAt: new Date(),
        statusChangedById: admin.id,
        statusChangeReason: reason ?? null,
      },
    })

    // First-time-ACTIVE side effect: flip any DRAFT PartnerService rows to ACTIVE.
    // Re-activation from PAUSED/SUSPENDED keeps the service statuses as-is.
    if (toStatus === 'ACTIVE' && (fromStatus === 'OPERATIONALLY_CONFIGURED' || fromStatus === 'UNDER_REVIEW')) {
      await tx.partnerService.updateMany({
        where: { partnerId, status: 'DRAFT' },
        data: { status: 'ACTIVE' },
      })
    }

    // SUSPEND side effect: pause active services so they stop receiving dispatches.
    if (toStatus === 'SUSPENDED') {
      await tx.partnerService.updateMany({
        where: { partnerId, status: 'ACTIVE' },
        data: { status: 'PAUSED' },
      })
    }
  })

  await logAuditAs(admin, {
    entityType: 'Partner',
    entityId: partnerId,
    action: auditActionForTransition(fromStatus, toStatus),
    fromValue: fromStatus,
    toValue: toStatus,
    payload: {
      companyName: partner.companyName,
      servicesAffected: partner.services.length,
      reason: reason ?? null,
    },
  })

  // Notify the partner on the user-visible transitions.
  const notifEvent = notificationEventForTransition(fromStatus, toStatus)
  if (notifEvent) {
    await dispatchNotification({
      userId: partner.userId,
      event: notifEvent,
      data: { companyName: partner.companyName },
      audience: 'partner',
    })
  }

  revalidatePath('/partners')
  revalidatePath(`/partners/${partnerId}`)
  revalidatePath(`/partners/${partnerId}/verification`)
  return { ok: true }
}

// (auditActionForTransition + notificationEventForTransition moved to
// @/lib/partner-fsm so they can be unit-tested alongside the rest of the FSM.)

// -----------------------------------------------------------------------------
// Legacy aliases — kept so any caller still using the old API doesn't break.
// All three route through promotePartnerStatus so audit/notifications stay
// consistent.
// -----------------------------------------------------------------------------

export async function activatePartner({ partnerId }: { partnerId: string }): Promise<Result> {
  return promotePartnerStatus({ partnerId, toStatus: 'ACTIVE' })
}

export async function suspendPartner({ partnerId }: { partnerId: string }): Promise<Result> {
  return promotePartnerStatus({ partnerId, toStatus: 'SUSPENDED' })
}

export async function requestChanges({ partnerId }: { partnerId: string }): Promise<Result> {
  // Generic "send back to partner" — picks the right downstream state per current.
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { status: true },
  })
  if (!partner) return { ok: false, error: 'Partner not found' }

  const targetByCurrent: Partial<Record<PartnerStatus, PartnerStatus>> = {
    IDENTITY_PENDING_REVIEW: 'LEAD',
    IDENTITY_VERIFIED: 'IDENTITY_PENDING_REVIEW',
    OPS_PENDING_REVIEW: 'IDENTITY_VERIFIED',
    OPERATIONALLY_CONFIGURED: 'OPS_PENDING_REVIEW',
    UNDER_REVIEW: 'IDENTITY_PENDING_REVIEW',
  }
  const toStatus = targetByCurrent[partner.status]
  if (!toStatus) {
    return { ok: false, error: `No request-changes target defined for ${partner.status}` }
  }
  return promotePartnerStatus({ partnerId, toStatus })
}

// =============================================================================
// Task #576 — Partner detail v2 actions
//   - setPartnerTier      : admin-only tier change (audit-logged)
//   - togglePartnerService: flip a PartnerService.status (ACTIVE / PAUSED)
//     to suspend a single service without putting the whole partner on hold
// Both write an AuditLog row.
// =============================================================================

export async function setPartnerTier(input: {
  partnerId: string
  toTier: 'VERIFIED' | 'TRUSTED' | 'PREMIER'
  reason?: string
}): Promise<Result> {
  const admin = await requireCapability('partners:approve')

  const partner = await prisma.partner.findUnique({
    where: { id: input.partnerId },
    select: { id: true, tier: true, companyName: true },
  })
  if (!partner) return { ok: false, error: 'Partner not found' }
  if (partner.tier === input.toTier) {
    return { ok: false, error: `Partner is already ${input.toTier}` }
  }

  const fromTier = partner.tier
  await prisma.partner.update({
    where: { id: input.partnerId },
    data: {
      tier: input.toTier,
      tierChangedAt: new Date(),
      tierChangedById: admin.id,
    },
  })

  await logAuditAs(admin, {
    entityType: 'Partner',
    entityId: input.partnerId,
    action: 'PARTNER_TIER_CHANGE',
    fromValue: fromTier,
    toValue: input.toTier,
    payload: {
      companyName: partner.companyName,
      reason: input.reason?.trim() || null,
    },
  })

  revalidatePath(`/partners/${input.partnerId}`)
  revalidatePath('/partners')
  return { ok: true }
}

export async function togglePartnerService(input: {
  serviceId: string
  toActive: boolean
}): Promise<Result> {
  const admin = await requireCapability('partners:approve')

  const service = await prisma.partnerService.findUnique({
    where: { id: input.serviceId },
    select: { id: true, partnerId: true, status: true, type: true },
  })
  if (!service) return { ok: false, error: 'Service not found' }

  const nextStatus = input.toActive ? 'ACTIVE' : 'PAUSED'
  if (service.status === nextStatus) {
    return { ok: false, error: `Service is already ${nextStatus}` }
  }

  await prisma.partnerService.update({
    where: { id: input.serviceId },
    data: { status: nextStatus },
  })

  await logAuditAs(admin, {
    entityType: 'PartnerService',
    entityId: input.serviceId,
    action: 'SERVICE_UPDATE',
    fromValue: service.status,
    toValue: nextStatus,
    payload: {
      partnerId: service.partnerId,
      serviceType: service.type,
      toggledBy: 'admin',
    },
  })

  revalidatePath(`/partners/${service.partnerId}`)
  return { ok: true }
}
