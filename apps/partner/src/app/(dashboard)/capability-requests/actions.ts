'use server'

// Partner capability claim (docs/PRINT_PROVIDER_SELECTION.md §10.2, PS-8c).
// "I can produce this" → PrintCapabilityClaim + a pre-filled DRAFT
// PartnerPackagingOffering from the request tuple (zero re-typing). The printer
// then completes pricing/MOQ/envelope in the EXISTING §7.2 offering editor and
// activates it; that ACTIVE transition (offering-actions) runs the resolver that
// verifies the claim, restores coverage, and unparks the template. No new review
// machinery — the offering IS the deliverable.
//
// AUTH: requirePartnerActor() (centralized tenant guard). We validate the request
// is OPEN, the acting partner runs a LABEL_PRINTING service that was SHORTLISTED
// (its id is in notifiedServiceIds), and the chosen decoration is physically valid.

import { prisma } from '@ilaunchify/db'
import type { DecorationMethod } from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

export async function claimCapabilityRequest(
  requestId: string,
  decorationMethod: DecorationMethod,
): Promise<Result<{ offeringId: string }>> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return { ok: false, error: 'Only partners can claim capability requests.' }

  const labelService = await prisma.partnerService.findFirst({
    where: { partnerId: actor.partnerId, type: 'LABEL_PRINTING' },
    select: { id: true },
  })
  if (!labelService) {
    return { ok: false, error: 'Your account has no printing service to claim this with.' }
  }

  const request = await prisma.printCapabilityRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      packagingTypeId: true,
      notifiedServiceIds: true,
    },
  })
  if (!request) return { ok: false, error: 'That request no longer exists.' }
  if (request.status !== 'OPEN' && request.status !== 'CLAIMED') {
    return { ok: false, error: 'That request is closed.' }
  }
  if (!request.notifiedServiceIds.includes(labelService.id)) {
    return { ok: false, error: 'This request was not offered to your service.' }
  }

  // The container type must be real + active; the decoration physically valid.
  const type = await prisma.packagingType.findFirst({
    where: { id: request.packagingTypeId, status: 'ACTIVE' },
    select: { id: true, containerCategory: true, displayName: true },
  })
  if (!type) return { ok: false, error: 'This packaging type is no longer available.' }
  if (!type.containerCategory) {
    return { ok: false, error: 'This packaging type has no container category set.' }
  }

  const compatible = await prisma.packagingDecorationCompatibility.findUnique({
    where: {
      containerCategory_decorationMethod: {
        containerCategory: type.containerCategory,
        decorationMethod,
      },
    },
    select: { decorationMethod: true },
  })
  if (!compatible) {
    return { ok: false, error: `${decorationMethod} isn't valid on ${type.displayName}.` }
  }

  // Find-or-create a DRAFT offering for (service × type × decoration). A prior
  // offering for the same combo is reused (the unique key), so re-claiming with a
  // decoration they already list just links the existing row.
  const existing = await prisma.partnerPackagingOffering.findUnique({
    where: {
      partnerServiceId_packagingTypeId_decorationMethod: {
        partnerServiceId: labelService.id,
        packagingTypeId: request.packagingTypeId,
        decorationMethod,
      },
    },
    select: { id: true },
  })
  const offeringId =
    existing?.id ??
    (
      await prisma.partnerPackagingOffering.create({
        data: {
          partnerServiceId: labelService.id,
          packagingTypeId: request.packagingTypeId,
          decorationMethod,
          status: 'DRAFT',
        },
        select: { id: true },
      })
    ).id

  // Upsert the claim (unique requestId+partnerServiceId) → OFFERING_DRAFTED,
  // link the offering; move the request to CLAIMED (stays claimable by others
  // until a claim verifies — capacity/redundancy is good).
  await prisma.printCapabilityClaim.upsert({
    where: {
      requestId_partnerServiceId: { requestId, partnerServiceId: labelService.id },
    },
    create: {
      requestId,
      partnerServiceId: labelService.id,
      status: 'OFFERING_DRAFTED',
      offeringId,
    },
    update: { status: 'OFFERING_DRAFTED', offeringId },
  })
  if (request.status === 'OPEN') {
    await prisma.printCapabilityRequest.update({
      where: { id: requestId },
      data: { status: 'CLAIMED' },
    })
  }

  await logAuditAs(actor.user, {
    entityType: 'PrintCapabilityClaim',
    entityId: requestId,
    action: 'CAPABILITY_CLAIM_SUBMITTED',
    payload: {
      partnerServiceId: labelService.id,
      packagingTypeId: request.packagingTypeId,
      decorationMethod,
      offeringId,
    },
  })

  revalidatePath('/capability-requests')
  revalidatePath('/packaging/offerings')
  return { ok: true, data: { offeringId } }
}
