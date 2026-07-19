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
