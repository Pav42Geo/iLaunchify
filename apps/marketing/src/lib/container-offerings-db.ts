import 'server-only'
import { prisma } from '@ilaunchify/db'
import type { DecorationMethod } from '@ilaunchify/db'

/**
 * #22 Slice 1a — the REAL container options for the detail-page picker.
 *
 * This is the data the PDP container picker must read INSTEAD of the fixture
 * `detail.packaging` list (which is `template-detail.ts` / seeded `marketingDetail`
 * JSON, not the real model). A live checkout exposed the gap: the creator picks a
 * fixture "container" on the PDP, `ProductDetailConfigurator` passes
 * `partnerOfferingId={null}`, and no PRIMARY `PackagingComponent` is ever
 * materialised — so checkout's `ComponentsPanel` becomes the only place a real
 * container gets chosen, backwards from Pavel's flow.
 *
 * Resolution (mirrors getDecorationOfferings' query):
 *   1. the template's ACTIVE variants' `packagingTypeId`s = the container types.
 *   2. every ACTIVE `PartnerPackagingOffering` for those types.
 *   3. ONE card per container type: the lowest-MOQ offering (most accessible),
 *      tie-broken by lowest lead time. That offering's id is what launch captures
 *      and materialises into the PRIMARY `PackagingComponent`.
 *
 * NO INVENTION (the running rule): only real ACTIVE offerings appear. A template
 * with none returns [], and the PDP must render that as absence (no orderable
 * container) rather than fabricate one - same shape as the no-price publish gate.
 *
 * Throws are swallowed to [] so the page never breaks. NOT price-bearing: the band
 * still sets the price; this is the production SPEC (which physical container).
 */
export interface ContainerOfferingCard {
  /** PartnerPackagingOffering.id — what LaunchCtaCluster passes as partnerOfferingId. */
  offeringId: string
  packagingTypeId: string
  /** PackagingType.displayName, e.g. "HDPE jar 16oz wide-mouth". */
  containerName: string
  decorationMethod: DecorationMethod
  moq: number
  leadTimeDays: number
  /** The offering's dieline, if any — the Studio designs against it. */
  dielineId: string | null
}

// ============================================================================
// #38 (2026-07-19): the PDP packaging picker. Packaging is a PDP choice, scoped
// to the product's REAL offerings (never the flat PackagingMaterial catalog).
// One entry per container the manufacturer actually offers for this template,
// each carrying its decoration methods. The creator picks the container; if it
// has >1 decoration method the PDP surfaces them (else the sole method auto-pins).
// The chosen offering's id flows to launch as partnerOfferingId. See memory
// ilaunchify-packaging-picked-on-pdp.
// ============================================================================

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

export interface PdpDecorationChoice {
  /** PartnerPackagingOffering.id for this (container × method) — the launch payload. */
  offeringId: string
  decorationMethod: DecorationMethod
  methodLabel: string
  moq: number
  leadTimeDays: number
  /** The offering's dieline (the Studio designs against it), if any. */
  dielineId: string | null
  /** Lowest tier price (cents), the "starting at" anchor. Null when unpriced. */
  startingPricePerUnitCents: number | null
}

export interface PdpPackagingOption {
  packagingTypeId: string
  /** PackagingType.displayName, e.g. "Aluminum can, 12 oz slim". */
  containerName: string
  /** The decoration methods this container offers (>=1). */
  decorations: PdpDecorationChoice[]
}

function lowestTierCents(tiers: unknown): number | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null
  const nums = (tiers as Array<{ pricePerUnitCents?: unknown }>)
    .map((t) => (typeof t?.pricePerUnitCents === 'number' ? t.pricePerUnitCents : null))
    .filter((n): n is number => n != null)
  return nums.length ? Math.min(...nums) : null
}

/**
 * The product's scoped packaging options for the PDP: one entry per container type
 * the template's ACTIVE variants use, each with the ACTIVE decoration offerings for
 * that container. Empty when nothing is published (the PDP renders absence, never a
 * fabricated option). Throws swallowed to [].
 */
export async function getTemplatePackagingOptions(
  templateSlug: string,
): Promise<PdpPackagingOption[]> {
  try {
    const template = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: { variants: { where: { isActive: true }, select: { packagingTypeId: true } } },
    })
    if (!template) return []

    const typeIds = Array.from(
      new Set(template.variants.map((v) => v.packagingTypeId).filter((id): id is string => Boolean(id))),
    )
    if (typeIds.length === 0) return []

    const offerings = await prisma.partnerPackagingOffering.findMany({
      where: { packagingTypeId: { in: typeIds }, status: 'ACTIVE' },
      select: {
        id: true,
        packagingTypeId: true,
        decorationMethod: true,
        moq: true,
        leadTimeDays: true,
        dielineId: true,
        pricingTiers: true,
        packagingType: { select: { displayName: true } },
      },
    })

    // Group by container type; within a container, one entry per decoration method
    // (lowest MOQ wins if a method somehow repeats).
    const byType = new Map<string, PdpPackagingOption>()
    for (const o of offerings) {
      let opt = byType.get(o.packagingTypeId)
      if (!opt) {
        opt = {
          packagingTypeId: o.packagingTypeId,
          containerName: o.packagingType?.displayName ?? 'Container',
          decorations: [],
        }
        byType.set(o.packagingTypeId, opt)
      }
      const existing = opt.decorations.find((d) => d.decorationMethod === o.decorationMethod)
      const choice: PdpDecorationChoice = {
        offeringId: o.id,
        decorationMethod: o.decorationMethod,
        methodLabel: DECORATION_LABELS[o.decorationMethod] ?? o.decorationMethod,
        moq: o.moq,
        leadTimeDays: o.leadTimeDays,
        dielineId: o.dielineId,
        startingPricePerUnitCents: lowestTierCents(o.pricingTiers),
      }
      if (!existing) opt.decorations.push(choice)
      else if (choice.moq < existing.moq) {
        opt.decorations = opt.decorations.map((d) => (d.decorationMethod === o.decorationMethod ? choice : d))
      }
    }

    // Stable order: containers by name, decorations by starting price then label.
    return [...byType.values()]
      .map((opt) => ({
        ...opt,
        decorations: opt.decorations.sort(
          (a, b) =>
            (a.startingPricePerUnitCents ?? Number.MAX_SAFE_INTEGER) -
              (b.startingPricePerUnitCents ?? Number.MAX_SAFE_INTEGER) ||
            a.methodLabel.localeCompare(b.methodLabel),
        ),
      }))
      .sort((a, b) => a.containerName.localeCompare(b.containerName))
  } catch (err) {
    console.error('[getTemplatePackagingOptions] failed:', err)
    return []
  }
}

/**
 * The finish that decorates a MADE-TO-ORDER unit, for the PDP's on-demand
 * display line (ON_DEMAND_FULL_SERVICE_GATE §4b.2). Resolution:
 *   1. the manufacturer's pin (`ProductTemplate.onDemandDecorationOfferingId`,
 *      new column, cast-guarded until db:push), else
 *   2. the manufacturer's SOLE own ACTIVE offering on the product's containers
 *      (applies implicitly), else
 *   3. null — the display falls back to the generic in-house line.
 * Candidates are the MANUFACTURER'S OWN offerings only (full-service rule).
 */
export async function getOnDemandFinishLabel(templateSlug: string): Promise<string | null> {
  try {
    const template = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: {
        id: true,
        manufacturerServiceId: true,
        variants: { where: { isActive: true }, select: { packagingTypeId: true } },
      },
    })
    if (!template?.manufacturerServiceId) return null
    const mfr = await prisma.partnerService.findUnique({
      where: { id: template.manufacturerServiceId },
      select: { partnerId: true },
    })
    if (!mfr) return null

    const typeIds = Array.from(
      new Set(template.variants.map((v) => v.packagingTypeId).filter((id): id is string => Boolean(id))),
    )
    if (typeIds.length === 0) return null

    const candidates = await prisma.partnerPackagingOffering.findMany({
      where: { packagingTypeId: { in: typeIds }, status: 'ACTIVE', partnerService: { partnerId: mfr.partnerId } },
      select: { id: true, decorationMethod: true },
    })
    if (candidates.length === 0) return null

    // Pin (cast-guarded: column may predate the generated client / db:push).
    const pinned = await (
      prisma.productTemplate as unknown as {
        findUnique: (a: unknown) => Promise<{ onDemandDecorationOfferingId?: string | null } | null>
      }
    )
      .findUnique({ where: { id: template.id }, select: { onDemandDecorationOfferingId: true } })
      .catch(() => null)

    const chosen =
      candidates.find((c) => c.id === pinned?.onDemandDecorationOfferingId) ??
      (candidates.length === 1 ? candidates[0] : null)
    if (!chosen) return null
    return DECORATION_LABELS[chosen.decorationMethod] ?? chosen.decorationMethod
  } catch {
    return null
  }
}

export async function getTemplateContainerOfferings(
  templateSlug: string,
): Promise<ContainerOfferingCard[]> {
  try {
    const template = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: { variants: { where: { isActive: true }, select: { packagingTypeId: true } } },
    })
    if (!template) return []

    const typeIds = Array.from(
      new Set(template.variants.map((v) => v.packagingTypeId).filter((id): id is string => Boolean(id))),
    )
    if (typeIds.length === 0) return []

    const offerings = await prisma.partnerPackagingOffering.findMany({
      where: { packagingTypeId: { in: typeIds }, status: 'ACTIVE' },
      select: {
        id: true,
        packagingTypeId: true,
        decorationMethod: true,
        moq: true,
        leadTimeDays: true,
        dielineId: true,
        packagingType: { select: { displayName: true } },
      },
    })

    // ONE card per container type: the most accessible offering (lowest MOQ, then
    // lowest lead time). Deterministic, so the same template always resolves the
    // same default container.
    const byType = new Map<string, ContainerOfferingCard>()
    for (const o of offerings) {
      const card: ContainerOfferingCard = {
        offeringId: o.id,
        packagingTypeId: o.packagingTypeId,
        containerName: o.packagingType?.displayName ?? 'Container',
        decorationMethod: o.decorationMethod,
        moq: o.moq,
        leadTimeDays: o.leadTimeDays,
        dielineId: o.dielineId,
      }
      const existing = byType.get(o.packagingTypeId)
      if (
        !existing ||
        o.moq < existing.moq ||
        (o.moq === existing.moq && o.leadTimeDays < existing.leadTimeDays)
      ) {
        byType.set(o.packagingTypeId, card)
      }
    }

    // Stable order for the picker: by container name.
    return [...byType.values()].sort((a, b) => a.containerName.localeCompare(b.containerName))
  } catch (err) {
    console.error('[getTemplateContainerOfferings] failed:', err)
    return []
  }
}
