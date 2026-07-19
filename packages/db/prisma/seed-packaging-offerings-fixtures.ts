// Fixtures — C8 Phase 2. Two jobs so the marketplace decoration picker has data:
//   1. Backfill active ProductTemplateVariant.packagingTypeId by keyword-matching
//      the free-text containerFormat to a PackagingType (the canonical container
//      link the picker resolves offerings from).
//   2. Seed sample PartnerPackagingOfferings per mapped container type — one per
//      compatible PRIMARY decoration method — so each container surfaces real
//      "Direct print (bulk) / PSL (on-demand) / Shrink sleeve" choices with MOQ,
//      price tiers, lead time, and fulfillment mode.
//
// Idempotent. Demo/fixture data — safe to re-run. Skips gracefully if the
// catalog (templates / packaging types / a partner service) isn't seeded.

import { PrismaClient } from '@prisma/client'
import type { DecorationMethod, FulfillmentMode } from '@prisma/client'

// containerFormat keyword → PackagingType slug. Order matters (check the primary
// container before multipack words like "pack"/"box").
function mapContainerToTypeSlug(fmt: string): string {
  const f = fmt.toLowerCase()
  if (f.includes('can')) return 'aluminum-can-12oz-slim'
  if (f.includes('sachet')) return 'sachet-5g'
  if (f.includes('stick')) return 'stick-pack-3g'
  if (f.includes('tube')) return 'ldpe-tube-100ml'
  if (f.includes('pouch')) return 'standup-pouch-12oz'
  if (f.includes('tub')) return 'pet-jar-32oz-wide-mouth'
  if (f.includes('jar')) return 'glass-jar-16oz'
  if (f.includes('carton')) return 'folding-carton-small'
  if (f.includes('bar') || f.includes('box')) return 'folding-carton-small'
  if (f.includes('bottle')) {
    if (f.includes('capsule') || f.includes('count') || f.includes('-ct') || f.includes(' ct')) {
      return 'capsule-bottle-100ct'
    }
    return 'glass-bottle-12oz'
  }
  return 'folding-carton-small'
}

// Per primary decoration method: the commercial preset offered.
const OFFERING_PRESETS: Record<
  string,
  { moq: number; leadTimeDays: number; fulfillmentMode: FulfillmentMode; tiers: Array<{ minQty: number; pricePerUnitCents: number }> }
> = {
  DIRECT_PRINT: { moq: 5000, leadTimeDays: 28, fulfillmentMode: 'BULK_PRODUCTION', tiers: [{ minQty: 5000, pricePerUnitCents: 45 }, { minQty: 10000, pricePerUnitCents: 38 }] },
  PRESSURE_SENSITIVE_LABEL: { moq: 250, leadTimeDays: 7, fulfillmentMode: 'BOTH', tiers: [{ minQty: 250, pricePerUnitCents: 80 }, { minQty: 1000, pricePerUnitCents: 62 }, { minQty: 5000, pricePerUnitCents: 48 }] },
  SHRINK_SLEEVE: { moq: 1000, leadTimeDays: 14, fulfillmentMode: 'BULK_PRODUCTION', tiers: [{ minQty: 1000, pricePerUnitCents: 65 }, { minQty: 5000, pricePerUnitCents: 52 }] },
  IN_MOLD_LABEL: { moq: 10000, leadTimeDays: 35, fulfillmentMode: 'BULK_PRODUCTION', tiers: [{ minQty: 10000, pricePerUnitCents: 40 }] },
  HEAT_TRANSFER: { moq: 2000, leadTimeDays: 18, fulfillmentMode: 'BULK_PRODUCTION', tiers: [{ minQty: 2000, pricePerUnitCents: 58 }] },
}
const PRIMARY_METHODS = new Set(Object.keys(OFFERING_PRESETS))

export async function seedPackagingOfferingFixtures(prisma: PrismaClient): Promise<void> {
  // DETERMINISTIC service (2026-07-18). Was `findFirst()` with no order, so
  // successive seed runs picked DIFFERENT "first" services and each created its own
  // offering for the same (type, method) — the unique key includes partnerServiceId,
  // so they didn't collide, they DUPLICATED. A live check found every decoration
  // method listed twice per container. Ordering by id makes the fixture pick the
  // SAME service every run → the upsert is truly idempotent.
  const service = await prisma.partnerService.findFirst({
    where: { type: 'LABEL_PRINTING' },
    orderBy: { id: 'asc' },
    select: { id: true },
  }).then((s) => s ?? prisma.partnerService.findFirst({ orderBy: { id: 'asc' }, select: { id: true } }))
  if (!service) {
    // eslint-disable-next-line no-console
    console.log('  ⓘ packaging-offering fixtures skipped (no PartnerService)')
    return
  }

  // Clear the duplicates left by past non-deterministic runs: any fixture offering
  // NOT owned by the deterministic service is a stale dupe. Safe because this
  // fixture is the ONLY seeder of PartnerPackagingOffering (verified 2026-07-18).
  const dupes = await prisma.partnerPackagingOffering.deleteMany({
    where: { partnerServiceId: { not: service.id } },
  })
  if (dupes.count > 0) {
    // eslint-disable-next-line no-console
    console.log(`  ⓘ cleared ${dupes.count} duplicate packaging offerings from prior runs`)
  }
  const types = await prisma.packagingType.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true, containerCategory: true },
  })
  const typeBySlug = new Map(types.map((t) => [t.slug, t]))

  // ---- 1. Backfill variant → packagingType ----
  const variants = await prisma.productTemplateVariant.findMany({
    where: { isActive: true },
    select: { id: true, containerFormat: true, packagingTypeId: true },
  })
  let backfilled = 0
  const usedTypeIds = new Set<string>()
  for (const v of variants) {
    const slug = mapContainerToTypeSlug(v.containerFormat)
    const t = typeBySlug.get(slug)
    if (!t) continue
    usedTypeIds.add(t.id)
    if (v.packagingTypeId !== t.id) {
      await prisma.productTemplateVariant.update({ where: { id: v.id }, data: { packagingTypeId: t.id } })
      backfilled++
    }
  }

  // ---- 2. Offerings per mapped container type (compatible primary methods) ----
  let offerings = 0
  for (const typeId of usedTypeIds) {
    const t = types.find((x) => x.id === typeId)!
    if (!t.containerCategory) continue
    const compat = await prisma.packagingDecorationCompatibility.findMany({
      where: { containerCategory: t.containerCategory, isActive: true },
      select: { decorationMethod: true },
    })
    const methods = compat
      .map((c) => c.decorationMethod)
      .filter((m) => PRIMARY_METHODS.has(m))
    for (const method of methods) {
      const preset = OFFERING_PRESETS[method]!
      await prisma.partnerPackagingOffering.upsert({
        where: {
          partnerServiceId_packagingTypeId_decorationMethod: {
            partnerServiceId: service.id,
            packagingTypeId: typeId,
            decorationMethod: method as DecorationMethod,
          },
        },
        create: {
          partnerServiceId: service.id,
          packagingTypeId: typeId,
          decorationMethod: method as DecorationMethod,
          moq: preset.moq,
          leadTimeDays: preset.leadTimeDays,
          pricingTiers: preset.tiers,
          fulfillmentMode: preset.fulfillmentMode,
          status: 'ACTIVE',
        },
        update: {
          moq: preset.moq,
          leadTimeDays: preset.leadTimeDays,
          pricingTiers: preset.tiers,
          fulfillmentMode: preset.fulfillmentMode,
          status: 'ACTIVE',
        },
      })
      offerings++
    }
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ Packaging fixtures: ${backfilled} variants linked, ${offerings} offerings across ${usedTypeIds.size} container types`)
}

// Standalone run: `tsx prisma/seed-packaging-offerings-fixtures.ts`
if (process.argv[1]?.endsWith('seed-packaging-offerings-fixtures.ts')) {
  const prisma = new PrismaClient()
  seedPackagingOfferingFixtures(prisma)
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
