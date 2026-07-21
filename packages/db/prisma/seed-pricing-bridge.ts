// Targeted bridge seed — one real ProductTemplate whose slug matches a
// marketplace FIXTURE (`daily-greens-powder`) + its ProductTemplatePricingTier
// rows + its ProductTemplateVariant rows, so the marketplace detail page renders
// REAL volume pricing AND a real flavor/packaging picker. The variants close the
// "0 variants → no packaging" gap: their containerFormat feeds the packagingType
// backfill + offering seeding in seedPackagingOfferingFixtures (runs after this).
//
// Why a "bridge": the marketplace detail page is still fixture-driven (slugs
// like `daily-greens-powder` have no DB ProductTemplate). getPricingTierRows()
// looks the template up by slug — so seeding a DB template with the SAME slug
// is what lets real pricing surface. The full fix is the fixtures→DB migration
// (audit §3.3); until then this is the one product that shows real prices.
//
// Idempotent — safe to re-run.

import { PrismaClient } from '@prisma/client'

const BRIDGE_SLUG = 'daily-greens-powder'
const SUBCATEGORY_SLUG = 'greens-superfoods'

// Descending per-unit cost by volume band (cents). Floors are the promo
// hard-floor (promos/discounts cannot dip below). Sits just under the fixture's
// $6.90 card price so the volume story reads true.
const TIERS = [
  { sortOrder: 0, minQty: 50, maxQty: 99, perUnitCostCents: 550, perUnitFloorCents: 500 },
  { sortOrder: 1, minQty: 100, maxQty: 249, perUnitCostCents: 495, perUnitFloorCents: 450 },
  { sortOrder: 2, minQty: 250, maxQty: 499, perUnitCostCents: 450, perUnitFloorCents: 410 },
  { sortOrder: 3, minQty: 500, maxQty: 999, perUnitCostCents: 410, perUnitFloorCents: 375 },
  { sortOrder: 4, minQty: 1000, maxQty: 2499, perUnitCostCents: 375, perUnitFloorCents: 340 },
  { sortOrder: 5, minQty: 2500, maxQty: null, perUnitCostCents: 340, perUnitFloorCents: 310 },
]

export async function seedPricingBridge(prisma: PrismaClient) {
  console.log('Seeding pricing bridge (daily-greens-powder)...')

  const sub =
    (await prisma.subcategory.findFirst({
      where: { slug: SUBCATEGORY_SLUG },
      select: { id: true },
    })) ?? (await prisma.subcategory.findFirst({ select: { id: true } }))

  if (!sub) {
    console.warn('  ⚠ No subcategories found — run the catalog seed first. Skipping bridge.')
    return
  }

  const tpl = await prisma.productTemplate.upsert({
    where: { slug: BRIDGE_SLUG },
    update: {
      name: 'Daily Greens Powder',
      subcategoryId: sub.id,
      status: 'PUBLISHED',
      labelingType: 'DIETARY_SUPPLEMENT',
      priceFloorCents: 310,
      unitCostCents: 550,
    },
    create: {
      slug: BRIDGE_SLUG,
      name: 'Daily Greens Powder',
      description: 'Daily greens blend — bridge template so the marketplace shows real volume pricing.',
      subcategoryId: sub.id,
      manufacturerServiceId: null,
      status: 'PUBLISHED',
      labelingType: 'DIETARY_SUPPLEMENT',
      priceFloorCents: 310,
      unitCostCents: 550,
    },
    select: { id: true },
  })

  // Idempotent: replace tiers so re-runs don't violate @@unique(productTemplateId, sortOrder).
  await prisma.productTemplatePricingTier.deleteMany({ where: { productTemplateId: tpl.id } })
  await prisma.productTemplatePricingTier.createMany({
    data: TIERS.map((t) => ({ ...t, productTemplateId: tpl.id })),
  })

  // Variants — the PDP flavor + packaging pickers read these. WITHOUT them
  // getTemplatePackagingOptions() returns [] and the page shows "no packaging" (the
  // reported gap: this bridge template had zero variants). Each variant's
  // `containerFormat` drives the backfill in seedPackagingOfferingFixtures (runs AFTER
  // this): it maps the text to a PackagingType, sets variant.packagingTypeId, and seeds
  // ACTIVE offerings for that type — which is exactly what the picker resolves. Two
  // containers (tub + sachet) + two flavors so the pickers have real choices. Idempotent
  // replace, mirroring the tiers.
  await prisma.productTemplateVariant.deleteMany({ where: { productTemplateId: tpl.id } })
  await prisma.productTemplateVariant.createMany({
    data: [
      { productTemplateId: tpl.id, flavor: 'Unflavored', containerFormat: '300g tub', servingsPerContainer: 30, servingSizeG: 10, servingSizeDesc: '1 scoop (10g)', moqMin: 500, moqMax: 5000, leadTimeDays: 28 },
      { productTemplateId: tpl.id, flavor: 'Berry', containerFormat: '300g tub', servingsPerContainer: 30, servingSizeG: 10, servingSizeDesc: '1 scoop (10g)', moqMin: 500, moqMax: 5000, leadTimeDays: 28 },
      { productTemplateId: tpl.id, flavor: 'Unflavored', containerFormat: '30 single-serve sachets', servingsPerContainer: 30, servingSizeG: 10, servingSizeDesc: '1 sachet (10g)', moqMin: 500, moqMax: 5000, leadTimeDays: 35 },
    ],
  })

  console.log(`  ✓ ${BRIDGE_SLUG} published with ${TIERS.length} pricing tiers + 3 variants (tub / sachet).`)
}
