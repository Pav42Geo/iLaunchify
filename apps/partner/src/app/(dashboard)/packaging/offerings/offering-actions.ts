'use server'

// Slice C8 — partner packaging-offering CRUD server actions.
// Spec: docs/builds/_V1_DECORATION_METHODS.md + task #32 (C8 partner offering CRUD).
//
// A partner declares which (container type × decoration method) combos they can
// produce, at a given MOQ / pricing tiers / lead time / fulfillment mode. Each
// offering binds to one of the partner's PartnerService rows; the unique
// constraint (partnerServiceId, packagingTypeId, decorationMethod) prevents dupes.
//
// AUTH: actor resolved via the centralized requirePartnerActor() ownership guard
// (packages/auth — docs/SECURITY_ARCHITECTURE.md Tier 1.1, threat #1 tenant
// isolation). Every read/mutate is scoped to the partner's own service ids; we
// never trust a client-supplied partnerServiceId for ownership.

import { prisma } from '@ilaunchify/db'
import type {
  DecorationMethod,
  FulfillmentMode,
  OfferingStatus,
  Prisma,
} from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { validatePricingTiers, type PricingTier } from './constants'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

// -----------------------------------------------------------------------------
// Helper: resolve the authorized partner + their owned PartnerService ids.
// Reuses requirePartnerActor() (centralized guard) for the role/Partner check,
// then loads the partner's service ids so every query stays tenant-scoped.
// -----------------------------------------------------------------------------

const PARTNER_ACTOR_ERRORS: Record<string, string> = {
  NOT_A_PARTNER: 'Only partners can manage packaging offerings.',
  PARTNER_NOT_FOUND: 'Partner profile not found.',
}

async function requireServiceContext() {
  const actor = await requirePartnerActor()
  if (!actor.ok) {
    return { ok: false as const, error: PARTNER_ACTOR_ERRORS[actor.error] ?? actor.error }
  }
  const services = await prisma.partnerService.findMany({
    where: { partnerId: actor.partnerId },
    select: { id: true },
  })
  const serviceIds = services.map((s) => s.id)
  return {
    ok: true as const,
    user: actor.user,
    partnerId: actor.partnerId,
    serviceIds,
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  )
}

// -----------------------------------------------------------------------------
// CREATE
// -----------------------------------------------------------------------------

// PS-2 capability hardening (docs/PRINT_PROVIDER_SELECTION.md §7.2) — feeds
// eligiblePrintProviders. All optional/null = "not declared" (permissive),
// EXCEPT foodContactSafe which is a HARD filter when the packaging demands it.
export interface OfferingCapabilityInput {
  printProcess?: 'DIGITAL' | 'OFFSET' | 'FLEXO' | 'GRAVURE' | 'SCREEN' | null
  maxRunQty?: number | null
  foodContactSafe?: boolean
  minPrintWidthMm?: number | null
  maxPrintWidthMm?: number | null
  minPrintHeightMm?: number | null
  maxPrintHeightMm?: number | null
}

function validateCapability(
  cap: OfferingCapabilityInput | undefined,
  moq: number,
): { ok: true } | { ok: false; error: string } {
  if (!cap) return { ok: true }
  if (cap.maxRunQty != null) {
    if (!Number.isInteger(cap.maxRunQty) || cap.maxRunQty < 1) {
      return { ok: false, error: 'Max run must be a whole number ≥ 1.' }
    }
    if (cap.maxRunQty < moq) return { ok: false, error: 'Max run can’t be below your MOQ.' }
  }
  const dims = [cap.minPrintWidthMm, cap.maxPrintWidthMm, cap.minPrintHeightMm, cap.maxPrintHeightMm]
  if (dims.some((d) => d != null && (!Number.isFinite(d) || d <= 0 || d > 10_000))) {
    return { ok: false, error: 'Print dimensions must be between 0 and 10,000 mm.' }
  }
  if (cap.minPrintWidthMm != null && cap.maxPrintWidthMm != null && cap.minPrintWidthMm > cap.maxPrintWidthMm) {
    return { ok: false, error: 'Min print width can’t exceed max.' }
  }
  if (cap.minPrintHeightMm != null && cap.maxPrintHeightMm != null && cap.minPrintHeightMm > cap.maxPrintHeightMm) {
    return { ok: false, error: 'Min print height can’t exceed max.' }
  }
  return { ok: true }
}

function capabilityData(cap: OfferingCapabilityInput | undefined) {
  if (!cap) return {}
  return {
    printProcess: cap.printProcess ?? null,
    maxRunQty: cap.maxRunQty ?? null,
    foodContactSafe: cap.foodContactSafe ?? false,
    minPrintWidthMm: cap.minPrintWidthMm ?? null,
    maxPrintWidthMm: cap.maxPrintWidthMm ?? null,
    minPrintHeightMm: cap.minPrintHeightMm ?? null,
    maxPrintHeightMm: cap.maxPrintHeightMm ?? null,
  }
}

export interface CreateOfferingInput {
  partnerServiceId: string
  packagingTypeId: string
  decorationMethod: DecorationMethod
  moq: number
  leadTimeDays: number
  fulfillmentMode: FulfillmentMode
  pricingTiers: PricingTier[]
  status: OfferingStatus
  dielineId?: string | null
  capability?: OfferingCapabilityInput
}

export async function createPackagingOffering(
  input: CreateOfferingInput,
): Promise<Result<{ id: string }>> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Ownership: the chosen service must belong to this partner.
  if (!ctx.serviceIds.includes(input.partnerServiceId)) {
    return { ok: false, error: 'That service is not yours.' }
  }

  // The container type must be a real, active platform catalog row.
  const type = await prisma.packagingType.findFirst({
    where: { id: input.packagingTypeId, status: 'ACTIVE' },
    select: { id: true, containerCategory: true, displayName: true },
  })
  if (!type) return { ok: false, error: 'Pick an active container type.' }

  // Decoration must be compatible with the container category.
  const compatError = await assertDecorationCompatible(
    type.containerCategory,
    input.decorationMethod,
  )
  if (compatError) return { ok: false, error: compatError }

  const moq = Math.trunc(input.moq)
  const leadTimeDays = Math.trunc(input.leadTimeDays)
  if (!Number.isInteger(moq) || moq < 1) return { ok: false, error: 'MOQ must be at least 1.' }
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0) {
    return { ok: false, error: 'Lead time must be 0 or more days.' }
  }

  const validated = validatePricingTiers(input.pricingTiers)
  if (!validated.ok) return { ok: false, error: validated.error }

  // If a dieline was chosen, it must be the partner's own + match this exact
  // (container type, decoration) + be offering-eligible.
  const dielineCheck = await assertDielineBindable(
    ctx.serviceIds,
    input.dielineId,
    input.packagingTypeId,
    input.decorationMethod,
  )
  if (!dielineCheck.ok) return { ok: false, error: dielineCheck.error }

  const capCheck = validateCapability(input.capability, moq)
  if (!capCheck.ok) return { ok: false, error: capCheck.error }

  let offering
  try {
    offering = await prisma.partnerPackagingOffering.create({
      data: {
        partnerServiceId: input.partnerServiceId,
        packagingTypeId: input.packagingTypeId,
        decorationMethod: input.decorationMethod,
        dielineId: input.dielineId?.trim() || null,
        ...capabilityData(input.capability),
        moq,
        leadTimeDays,
        fulfillmentMode: input.fulfillmentMode,
        pricingTiers: validated.tiers as unknown as Prisma.InputJsonValue,
        status: input.status,
      },
      select: { id: true },
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        error: `You already offer ${type.displayName} with this decoration. Edit that offering instead.`,
      }
    }
    throw err
  }

  await logAuditAs(ctx.user, {
    entityType: 'PartnerPackagingOffering',
    entityId: offering.id,
    action: 'PARTNER_PACKAGING_OFFERING_CREATED',
    toValue: input.status,
    payload: {
      partnerId: ctx.partnerId,
      partnerServiceId: input.partnerServiceId,
      packagingTypeId: input.packagingTypeId,
      decorationMethod: input.decorationMethod,
    },
  })

  revalidatePath('/packaging/offerings')
  return { ok: true, data: { id: offering.id } }
}

// -----------------------------------------------------------------------------
// UPDATE — type + decoration are immutable on the unique key; partners change
// MOQ / lead time / fulfillment / pricing / dieline / status here.
// -----------------------------------------------------------------------------

export interface UpdateOfferingInput {
  moq?: number
  leadTimeDays?: number
  fulfillmentMode?: FulfillmentMode
  pricingTiers?: PricingTier[]
  status?: OfferingStatus
  dielineId?: string | null
  capability?: OfferingCapabilityInput
}

export async function updatePackagingOffering(
  id: string,
  patch: UpdateOfferingInput,
): Promise<Result> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Ownership: row must belong to one of this partner's services.
  const existing = await prisma.partnerPackagingOffering.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    select: { id: true, status: true, packagingTypeId: true, decorationMethod: true },
  })
  if (!existing) return { ok: false, error: 'Offering not found.' }

  // A re-pointed dieline must still be the partner's own + match the offering's
  // (immutable) type + decoration.
  if (patch.dielineId !== undefined) {
    const dielineCheck = await assertDielineBindable(
      ctx.serviceIds,
      patch.dielineId,
      existing.packagingTypeId,
      existing.decorationMethod,
    )
    if (!dielineCheck.ok) return { ok: false, error: dielineCheck.error }
  }

  const data: Prisma.PartnerPackagingOfferingUpdateInput = {}

  if (patch.moq !== undefined) {
    const moq = Math.trunc(patch.moq)
    if (!Number.isInteger(moq) || moq < 1) return { ok: false, error: 'MOQ must be at least 1.' }
    data.moq = moq
  }
  if (patch.leadTimeDays !== undefined) {
    const lead = Math.trunc(patch.leadTimeDays)
    if (!Number.isInteger(lead) || lead < 0) {
      return { ok: false, error: 'Lead time must be 0 or more days.' }
    }
    data.leadTimeDays = lead
  }
  if (patch.fulfillmentMode !== undefined) data.fulfillmentMode = patch.fulfillmentMode
  if (patch.status !== undefined) data.status = patch.status
  if (patch.dielineId !== undefined) {
    const next = patch.dielineId?.trim() || null
    data.dieline = next ? { connect: { id: next } } : { disconnect: true }
  }
  if (patch.pricingTiers !== undefined) {
    const validated = validatePricingTiers(patch.pricingTiers)
    if (!validated.ok) return { ok: false, error: validated.error }
    data.pricingTiers = validated.tiers as unknown as Prisma.InputJsonValue
  }
  if (patch.capability !== undefined) {
    const capCheck = validateCapability(
      patch.capability,
      (data.moq as number | undefined) ?? (await prisma.partnerPackagingOffering.findUniqueOrThrow({ where: { id }, select: { moq: true } })).moq,
    )
    if (!capCheck.ok) return { ok: false, error: capCheck.error }
    Object.assign(data, capabilityData(patch.capability))
  }

  await prisma.partnerPackagingOffering.update({ where: { id }, data })

  await logAuditAs(ctx.user, {
    entityType: 'PartnerPackagingOffering',
    entityId: id,
    action: 'PARTNER_PACKAGING_OFFERING_UPDATED',
    fromValue: existing.status,
    toValue: (patch.status ?? existing.status) as string,
    payload: { partnerId: ctx.partnerId, fields: Object.keys(data) },
  })

  revalidatePath('/packaging/offerings')
  revalidatePath(`/packaging/offerings/${id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// STATUS — lightweight transition used by the row menu (no full form).
// -----------------------------------------------------------------------------

export async function setOfferingStatus(id: string, to: OfferingStatus): Promise<Result> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const existing = await prisma.partnerPackagingOffering.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    select: { id: true, status: true },
  })
  if (!existing) return { ok: false, error: 'Offering not found.' }
  if (existing.status === to) return { ok: true }

  await prisma.partnerPackagingOffering.update({ where: { id }, data: { status: to } })

  await logAuditAs(ctx.user, {
    entityType: 'PartnerPackagingOffering',
    entityId: id,
    action: 'PARTNER_PACKAGING_OFFERING_STATUS_CHANGED',
    fromValue: existing.status,
    toValue: to,
    payload: { partnerId: ctx.partnerId },
  })

  revalidatePath('/packaging/offerings')
  revalidatePath(`/packaging/offerings/${id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// DELETE — hard delete (offerings are supply declarations; a partner withdrawing
// one is a clean remove). Blocked if any product component already selected it.
// -----------------------------------------------------------------------------

export async function deletePackagingOffering(id: string): Promise<Result> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const existing = await prisma.partnerPackagingOffering.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    select: {
      id: true,
      status: true,
      packagingTypeId: true,
      decorationMethod: true,
      _count: { select: { components: true } },
    },
  })
  if (!existing) return { ok: false, error: 'Offering not found.' }
  if (existing._count.components > 0) {
    return {
      ok: false,
      error: 'In use by a product — archive it instead so existing links stay intact.',
    }
  }

  await prisma.partnerPackagingOffering.delete({ where: { id } })

  await logAuditAs(ctx.user, {
    entityType: 'PartnerPackagingOffering',
    entityId: id,
    action: 'PARTNER_PACKAGING_OFFERING_DELETED',
    fromValue: existing.status,
    payload: {
      partnerId: ctx.partnerId,
      packagingTypeId: existing.packagingTypeId,
      decorationMethod: existing.decorationMethod,
    },
  })

  revalidatePath('/packaging/offerings')
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Compatibility check — a decoration is offerable on a container type only if an
// active PackagingDecorationCompatibility row exists for the type's category.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Dieline binding guard (C9 Phase 1) — a chosen dieline must (a) belong to one of
// the partner's own services, (b) match the offering's exact container type +
// decoration, and (c) be offering-eligible (ACTIVE or PARTNER_CONFIRMED). Empty /
// null means "no dieline" and always passes.
// -----------------------------------------------------------------------------

async function assertDielineBindable(
  serviceIds: string[],
  dielineId: string | null | undefined,
  packagingTypeId: string,
  decorationMethod: DecorationMethod,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = dielineId?.trim()
  if (!trimmed) return { ok: true }

  const dieline = await prisma.packagingDieline.findFirst({
    where: { id: trimmed, partnerServiceId: { in: serviceIds } },
    select: { packagingTypeId: true, decorationMethod: true, status: true },
  })
  if (!dieline) return { ok: false, error: 'That dieline is not yours.' }
  if (dieline.packagingTypeId !== packagingTypeId || dieline.decorationMethod !== decorationMethod) {
    return { ok: false, error: "That dieline doesn't match this container and decoration." }
  }
  if (dieline.status !== 'ACTIVE' && dieline.status !== 'PARTNER_CONFIRMED') {
    return { ok: false, error: 'Confirm or activate the dieline before binding it to an offering.' }
  }
  return { ok: true }
}

async function assertDecorationCompatible(
  containerCategory: import('@ilaunchify/db').ContainerCategory | null,
  decorationMethod: DecorationMethod,
): Promise<string | null> {
  // NONE is always allowed (stock / blank); no compatibility row needed.
  if (decorationMethod === 'NONE') return null
  if (!containerCategory) {
    return 'This container type has no category set yet — pick another or ask an admin to curate it.'
  }
  const compat = await prisma.packagingDecorationCompatibility.findFirst({
    where: { containerCategory, decorationMethod, isActive: true },
    select: { containerCategory: true },
  })
  if (!compat) {
    return 'That decoration method is not available for this container type.'
  }
  return null
}
