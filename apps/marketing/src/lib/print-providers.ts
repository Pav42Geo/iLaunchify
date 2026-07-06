// Print-provider cards data (docs/PRINT_PROVIDER_SELECTION.md §3, PS-2).
//
// READ-ONLY surface: gated by effectivePrintSourcing (the §2 signal — cards
// NEVER render for IN_HOUSE manufacturers), ops-filtered candidates, real
// numbers only (Bayesian-backed rating aggregates, measured production times).
// Full 8-filter eligibility runs at binding time (PS-3) where the job facts
// (decoration, quantity, design demands) actually exist; here we filter on
// what the TEMPLATE knows: its packaging types.
// Everything fails soft — fixture-only templates render no section.

import { prisma } from '@ilaunchify/db'
import { effectivePrintSourcing, showsPrintProviderCards } from '@ilaunchify/orders'

export interface ProviderCardData {
  serviceId: string
  companyName: string
  rating: { mean: number | null; count: number; isNew: boolean; dims: Array<{ label: string; mean: number; n: number }> }
  priceFromCents: number | null
  moqFrom: number | null
  leadDaysFrom: number | null
  avgProductionDays: number | null // measured: productionStartedAt→readyAt, 90d
  processes: string[]
  decorationMethods: string[]
  foodContactSafe: boolean
  offeringCount: number
  // Details modal
  outputSpec: {
    fileFormat: string
    colorSpace: string
    minDpi: number
    bleedMm: string
    spotColors: boolean
    tacLimitPct: number
  } | null
  dielineCount: number
  substrateCount: number
}

export interface PrintProvidersView {
  mode: 'EXTERNAL_ALLOWED' | 'EXTERNAL_REQUIRED'
  providers: ProviderCardData[]
  /** Printers excluded because none of their offerings match this format. */
  filteredOutCount: number
}

function humanizeDim(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export async function getPrintProviderCards(templateSlug: string): Promise<PrintProvidersView | null> {
  try {
    const template = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: {
        id: true,
        manufacturerServiceId: true,
        packagingSystems: {
          select: { packagingSystem: { select: { packagingTypeId: true } } },
        },
      },
    })
    if (!template?.manufacturerServiceId) return null

    const manufacturer = await prisma.partnerService.findUnique({
      where: { id: template.manufacturerServiceId },
      select: { labelingMode: true },
    })
    if (!manufacturer) return null

    // §2 — the ONE signal. IN_HOUSE = no section, full stop.
    const mode = effectivePrintSourcing(null, manufacturer)
    if (!showsPrintProviderCards(mode) || mode === 'IN_HOUSE') return null

    const templateTypeIds = [
      ...new Set(
        template.packagingSystems
          .map((p) => p.packagingSystem.packagingTypeId)
          .filter((x): x is string => !!x),
      ),
    ]

    const now = new Date()
    const services = await prisma.partnerService.findMany({
      where: {
        type: 'LABEL_PRINTING',
        status: 'ACTIVE',
        partner: { status: 'ACTIVE', user: { stripeAccountStatus: 'ACTIVE' } },
        packagingOfferings: { some: { status: 'ACTIVE' } },
      },
      select: {
        id: true,
        ratingMean: true,
        ratingCount: true,
        ratingDims: true,
        partner: { select: { companyName: true } },
        blackoutDates: { where: { startsOn: { lte: now }, endsOn: { gte: now } }, take: 1 },
        packagingOfferings: {
          where: { status: 'ACTIVE' },
          select: {
            packagingTypeId: true,
            decorationMethod: true,
            moq: true,
            leadTimeDays: true,
            pricingTiers: true,
            printProcess: true,
            foodContactSafe: true,
          },
        },
        printOutputSpec: {
          select: {
            preferredFileFormat: true,
            colorSpace: true,
            minDpi: true,
            bleedMm: true,
            spotColorsAccepted: true,
            tacLimitPct: true,
          },
        },
        dielines: { where: { status: 'ACTIVE' }, select: { id: true } },
        partnerServiceSubstrates: { select: { id: true } },
      },
    })

    let filteredOutCount = 0
    const matching = services.filter((s) => {
      if (s.blackoutDates.length > 0) {
        filteredOutCount++
        return false
      }
      if (templateTypeIds.length === 0) return true // template types unknown → permissive
      const matches = s.packagingOfferings.some((o) => templateTypeIds.includes(o.packagingTypeId))
      if (!matches) filteredOutCount++
      return matches
    })

    // Measured production time per service (LABEL dispatches, last 90d).
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const dispatches = matching.length
      ? await prisma.orderDispatch.findMany({
          where: {
            partnerServiceId: { in: matching.map((s) => s.id) },
            type: 'LABEL',
            productionStartedAt: { not: null, gte: since90 },
            readyAt: { not: null },
          },
          select: { partnerServiceId: true, productionStartedAt: true, readyAt: true },
        })
      : []
    const prodDays = new Map<string, number[]>()
    for (const d of dispatches) {
      if (!d.productionStartedAt || !d.readyAt) continue
      const days = (d.readyAt.getTime() - d.productionStartedAt.getTime()) / (24 * 60 * 60 * 1000)
      const arr = prodDays.get(d.partnerServiceId) ?? []
      arr.push(days)
      prodDays.set(d.partnerServiceId, arr)
    }

    const providers: ProviderCardData[] = matching.map((s) => {
      const offerings =
        templateTypeIds.length === 0
          ? s.packagingOfferings
          : s.packagingOfferings.filter((o) => templateTypeIds.includes(o.packagingTypeId))
      const tierPrices = offerings.flatMap((o) => {
        const tiers = o.pricingTiers as Array<{ pricePerUnitCents?: number }> | null
        return (tiers ?? []).map((t) => t.pricePerUnitCents).filter((p): p is number => typeof p === 'number' && p > 0)
      })
      const days = prodDays.get(s.id)
      const dimsJson = (s.ratingDims ?? {}) as Record<string, { mean: number; n: number }>
      return {
        serviceId: s.id,
        companyName: s.partner.companyName,
        rating: {
          mean: s.ratingMean != null ? Number(s.ratingMean) : null,
          count: s.ratingCount,
          isNew: s.ratingCount < 3,
          dims: Object.entries(dimsJson).map(([slug, v]) => ({ label: humanizeDim(slug), mean: v.mean, n: v.n })),
        },
        priceFromCents: tierPrices.length ? Math.min(...tierPrices) : null,
        moqFrom: offerings.length ? Math.min(...offerings.map((o) => o.moq)) : null,
        leadDaysFrom: offerings.length ? Math.min(...offerings.map((o) => o.leadTimeDays)) : null,
        avgProductionDays:
          days && days.length > 0
            ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
            : null,
        processes: [...new Set(offerings.map((o) => o.printProcess).filter((p): p is NonNullable<typeof p> => !!p))],
        decorationMethods: [...new Set(offerings.map((o) => o.decorationMethod as string))],
        foodContactSafe: offerings.some((o) => o.foodContactSafe),
        offeringCount: offerings.length,
        outputSpec: s.printOutputSpec
          ? {
              fileFormat: s.printOutputSpec.preferredFileFormat,
              colorSpace: s.printOutputSpec.colorSpace,
              minDpi: s.printOutputSpec.minDpi,
              bleedMm: String(s.printOutputSpec.bleedMm),
              spotColors: s.printOutputSpec.spotColorsAccepted,
              tacLimitPct: s.printOutputSpec.tacLimitPct,
            }
          : null,
        dielineCount: s.dielines.length,
        substrateCount: s.partnerServiceSubstrates.length,
      }
    })

    // Rank for DISPLAY ORDER only (PS-4 owns real auto-routing): Bayesian-backed
    // aggregate first (ratingBayesian is on the row but display sorts by the
    // same order ranking will use), "New" providers after rated ones.
    providers.sort((a, b) => (b.rating.mean ?? 0) * (b.rating.isNew ? 0 : 1) - (a.rating.mean ?? 0) * (a.rating.isNew ? 0 : 1))

    return { mode, providers, filteredOutCount }
  } catch {
    return null
  }
}
