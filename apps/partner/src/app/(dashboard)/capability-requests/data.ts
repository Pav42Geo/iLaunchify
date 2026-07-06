// Partner capability inbox — claimable RFQs (docs/PRINT_PROVIDER_SELECTION.md
// §10.2, PS-8c). A LABEL_PRINTING service sees the OPEN capability requests it
// was shortlisted for (its id is in the request's notifiedServiceIds broadcast
// ledger) and hasn't already claimed. Partial disclosure by construction: we
// expose the spec + run band + region only — never designs, brand, or the
// manufacturer's identity (the request row itself is denormalized to exactly this).

import { prisma } from '@ilaunchify/db'
import type { DecorationMethod } from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'

export interface ClaimableRequest {
  requestId: string
  packagingTypeId: string
  packagingLabel: string
  containerCategory: string
  /** Decoration methods physically valid on this container (the printer picks one). */
  compatibleDecorations: DecorationMethod[]
  runBand: string
  region: string | null
  expiresAt: string | null
}

export interface CapabilityInbox {
  /** The partner's LABEL_PRINTING service id, or null if they don't run one. */
  labelServiceId: string | null
  requests: ClaimableRequest[]
}

/** Load the claimable-request inbox for the acting partner. Fails soft to empty. */
export async function getCapabilityInbox(): Promise<CapabilityInbox> {
  const EMPTY: CapabilityInbox = { labelServiceId: null, requests: [] }
  try {
    const actor = await requirePartnerActor()
    if (!actor.ok) return EMPTY

    const labelService = await prisma.partnerService.findFirst({
      where: { partnerId: actor.partnerId, type: 'LABEL_PRINTING' },
      select: { id: true },
    })
    if (!labelService) return EMPTY

    // OPEN requests this service was shortlisted for, not yet claimed by it.
    const claimed = await prisma.printCapabilityClaim.findMany({
      where: { partnerServiceId: labelService.id },
      select: { requestId: true },
    })
    const claimedIds = new Set(claimed.map((c) => c.requestId))

    const requests = await prisma.printCapabilityRequest.findMany({
      where: { status: 'OPEN', notifiedServiceIds: { has: labelService.id } },
      select: {
        id: true,
        packagingTypeId: true,
        runBandMin: true,
        runBandMax: true,
        manufacturerRegion: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    const open = requests.filter((r) => !claimedIds.has(r.id))
    if (open.length === 0) return { labelServiceId: labelService.id, requests: [] }

    // Packaging labels + container categories for the open set.
    const typeIds = [...new Set(open.map((r) => r.packagingTypeId))]
    const types = await prisma.packagingType.findMany({
      where: { id: { in: typeIds } },
      select: { id: true, displayName: true, containerCategory: true },
    })
    const typeById = new Map(types.map((t) => [t.id, t]))

    // Compatible decoration methods per container category (physics matrix).
    const categories = [
      ...new Set(
        types
          .map((t) => t.containerCategory)
          .filter((c): c is NonNullable<typeof c> => c != null),
      ),
    ]
    const compat = await prisma.packagingDecorationCompatibility.findMany({
      where: { containerCategory: { in: categories } },
      select: { containerCategory: true, decorationMethod: true },
    })
    const decorationsByCategory = new Map<string, DecorationMethod[]>()
    for (const c of compat) {
      const arr = decorationsByCategory.get(c.containerCategory) ?? []
      arr.push(c.decorationMethod)
      decorationsByCategory.set(c.containerCategory, arr)
    }

    const rows: ClaimableRequest[] = open.map((r) => {
      const t = typeById.get(r.packagingTypeId)
      const category = t?.containerCategory ?? 'UNKNOWN'
      return {
        requestId: r.id,
        packagingTypeId: r.packagingTypeId,
        packagingLabel: t?.displayName ?? 'Packaging format',
        containerCategory: category,
        compatibleDecorations: decorationsByCategory.get(category) ?? [],
        runBand: r.runBandMax ? `${r.runBandMin}–${r.runBandMax}` : `${r.runBandMin}+`,
        region: r.manufacturerRegion,
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      }
    })

    return { labelServiceId: labelService.id, requests: rows }
  } catch {
    return EMPTY
  }
}
