import 'server-only'
import { prisma } from '@ilaunchify/db'
import type { DecorationMethod, FulfillmentMode } from '@ilaunchify/db'

/**
 * Slice C8.2 — marketplace decoration-picker resolver.
 *
 * For a given ProductTemplate slug, surface the partner decoration offerings
 * a creator can pick on the detail page. Resolution:
 *   1. collect the template's ACTIVE variants' `packagingTypeId`s
 *   2. load every ACTIVE PartnerPackagingOffering for those container types
 *   3. group by `decorationMethod` — if a method appears for >1 container
 *      type, keep the offering with the lowest MOQ (most accessible).
 *
 * Each surviving method becomes one picker card. When nothing resolves
 * (template not in DB, no container link, no ACTIVE offerings) we return an
 * empty array and the page hides the picker entirely.
 *
 * Throws are swallowed — empty array returns so the page never breaks.
 */

// Human labels mirror apps/partner .../offerings/constants.ts DECORATION_LABELS.
const DECORATION_LABELS: Record<DecorationMethod, string> = {
  DIRECT_PRINT: 'Direct print',
  PRESSURE_SENSITIVE_LABEL: 'Pressure-sensitive label',
  SHRINK_SLEEVE: 'Shrink sleeve',
  IN_MOLD_LABEL: 'In-mold label',
  HEAT_TRANSFER: 'Heat transfer',
  FOIL_STAMP: 'Foil stamp',
  EMBOSS: 'Emboss',
  DEBOSS: 'Deboss',
  SPOT_UV: 'Spot UV',
  NONE: 'No decoration',
}

export interface DecorationOfferingCard {
  /** PartnerPackagingOffering.id — carried into product creation. */
  offeringId: string
  decorationMethod: DecorationMethod
  /** Human label, e.g. "Pressure-sensitive label". */
  methodLabel: string
  moq: number
  leadTimeDays: number
  /** Lowest-tier price (cents) — the "starting at" anchor on the card. */
  startingPricePerUnitCents: number
  fulfillmentMode: FulfillmentMode
}

interface PricingTier {
  minQty: number
  pricePerUnitCents: number
}

function lowestTierCents(tiers: unknown): number | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null
  const sorted = [...(tiers as PricingTier[])]
    .filter((t) => typeof t?.pricePerUnitCents === 'number')
    .sort((a, b) => a.pricePerUnitCents - b.pricePerUnitCents)
  return sorted[0]?.pricePerUnitCents ?? null
}

export async function getDecorationOfferings(
  templateSlug: string,
): Promise<DecorationOfferingCard[]> {
  try {
    const template = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: {
        variants: {
          where: { isActive: true },
          select: { packagingTypeId: true },
        },
      },
    })
    if (!template) return []

    const typeIds = Array.from(
      new Set(
        template.variants
          .map((v) => v.packagingTypeId)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    if (typeIds.length === 0) return []

    const offerings = await prisma.partnerPackagingOffering.findMany({
      where: { packagingTypeId: { in: typeIds }, status: 'ACTIVE' },
      select: {
        id: true,
        decorationMethod: true,
        moq: true,
        leadTimeDays: true,
        pricingTiers: true,
        fulfillmentMode: true,
      },
    })

    // Group by decoration method; when a method spans multiple container
    // types, keep the offering with the lowest MOQ (most accessible to small
    // creators). Tie-break on lowest starting price.
    const byMethod = new Map<DecorationMethod, DecorationOfferingCard>()
    for (const o of offerings) {
      const startingCents = lowestTierCents(o.pricingTiers)
      if (startingCents == null) continue // no usable price → skip
      const card: DecorationOfferingCard = {
        offeringId: o.id,
        decorationMethod: o.decorationMethod,
        methodLabel: DECORATION_LABELS[o.decorationMethod] ?? o.decorationMethod,
        moq: o.moq,
        leadTimeDays: o.leadTimeDays,
        startingPricePerUnitCents: startingCents,
        fulfillmentMode: o.fulfillmentMode,
      }
      const existing = byMethod.get(o.decorationMethod)
      if (
        !existing ||
        card.moq < existing.moq ||
        (card.moq === existing.moq &&
          card.startingPricePerUnitCents < existing.startingPricePerUnitCents)
      ) {
        byMethod.set(o.decorationMethod, card)
      }
    }

    return Array.from(byMethod.values()).sort(
      (a, b) => a.startingPricePerUnitCents - b.startingPricePerUnitCents,
    )
  } catch (err) {
    console.warn(
      '[decoration-offerings-db] getDecorationOfferings failed:',
      (err as Error).message,
    )
    return []
  }
}
