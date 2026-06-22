'use server'

// Track C / C7.k — admin verification actions on AccessoryOffering rows.
//
// Partners submit brand add-ons (engraved spoons, ribbons, recipe cards, …)
// which land PENDING_REVIEW. Admins approve (→ ACTIVE), archive (→ ARCHIVED),
// or reactivate (→ ACTIVE) from the verification queue at /admin/accessories.
//
// No destructive delete in V1 — archived rows stay for audit + any in-flight
// orders. Every transition writes an AuditLog row via logAuditAs.

import { prisma } from '@ilaunchify/db'
import type { OfferingStatus } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

async function transition(
  id: string,
  to: OfferingStatus,
  expectFrom: OfferingStatus[],
  action: string,
): Promise<Result> {
  // Accessory verification queue → reviews:write (Lead + Super). docs/ADMIN_RBAC.md.
  const admin = await requireCapability('reviews:write')

  const offering = await prisma.accessoryOffering.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, partnerServiceId: true },
  })
  if (!offering) return { ok: false, error: 'Accessory not found.' }
  if (!expectFrom.includes(offering.status)) {
    return {
      ok: false,
      error: `Can't ${action.replace('accessory_', '')} an accessory in ${offering.status} state.`,
    }
  }

  await prisma.accessoryOffering.update({ where: { id }, data: { status: to } })

  await logAuditAs(admin, {
    entityType: 'AccessoryOffering',
    entityId: id,
    action,
    fromValue: offering.status,
    toValue: to,
    payload: { name: offering.name, partnerServiceId: offering.partnerServiceId },
  })

  revalidatePath('/accessories')
  return { ok: true }
}

/** PENDING_REVIEW → ACTIVE. Publishes a partner-submitted accessory. */
export async function approveAccessory(id: string): Promise<Result> {
  return transition(id, 'ACTIVE', ['PENDING_REVIEW'], 'accessory_approve')
}

/** ACTIVE → ARCHIVED. Pulls an accessory from the catalog (non-destructive). */
export async function archiveAccessory(id: string): Promise<Result> {
  return transition(id, 'ARCHIVED', ['ACTIVE'], 'accessory_archive')
}

/** ARCHIVED → ACTIVE. Restores a previously archived accessory. */
export async function reactivateAccessory(id: string): Promise<Result> {
  return transition(id, 'ACTIVE', ['ARCHIVED'], 'accessory_reactivate')
}
