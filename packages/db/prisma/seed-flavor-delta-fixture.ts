// Non-pack flavor-delta fixture (2026-07-20).
//
// WHY THIS EXISTS. The non-pack flavor delta wire (launch -> Product
// .selectedFlavorPresetIds -> estimate + charge -> resolveGoods) needs a product
// whose template has a NON-PACK flavor carrying a real priceDeltaCents, so both a
// human click-through AND scripts/flavor-delta-report.mjs can eyeball
// PDP === estimate === charge before a real Stripe order.
//
// It is deliberately ISOLATED (its own slug, its own subcategory lookup, no
// dependence on the marketplace fixtures) so seeding it perturbs nothing else, and
// it is idempotent (upsert by slug + replace children) so it is safe to re-run.
//
// Run standalone:  pnpm --filter @ilaunchify/db seed:flavor-delta
//
// A non-pack product means: the creator picks ONE flavor for the whole run (not a
// variety pack). The premium flavor's priceDeltaCents is what the charge must add
// on top of the manufacturer's volume band, matching the PDP.

import { PrismaClient } from '@prisma/client'

export const FLAVOR_DELTA_SLUG = 'flavor-delta-demo'

// A simple descending volume curve (cents/unit). The report picks the band per
// quantity exactly like the PDP + charge do (pickPricingBand).
const TIERS = [
  { sortOrder: 0, minQty: 50, maxQty: 249, perUnitCostCents: 600, perUnitFloorCents: 540 },
  { sortOrder: 1, minQty: 250, maxQty: 999, perUnitCostCents: 520, perUnitFloorCents: 470 },
  { sortOrder: 2, minQty: 1000, maxQty: null, perUnitCostCents: 460, perUnitFloorCents: 410 },
]

// Two flavors: a base (no delta) and a premium (a real, non-zero delta). "Premium"
// is the flavor a non-pack order must be charged MORE for; "Classic" proves the
// zero-delta path is a no-op.
const PRESETS = [
  { name: 'Classic Vanilla', priceDeltaCents: 0, swatchHex: '#EFE7D6', sortOrder: 0 },
  { name: 'Premium Cacao', priceDeltaCents: 75, swatchHex: '#5C3317', sortOrder: 1 },
]

// Variants make the template LAUNCHABLE (launch requires a matching variant) and
// exercise the flavor→variant threading fix: variant.flavor MATCHES the preset name,
// so launching "Premium Cacao" now selects the Premium Cacao variant (not the first).
// Single containerFormat ⇒ this stays a SINGLE_UNIT (non-pack) product.
const VARIANTS = PRESETS.map((p) => ({
  flavor: p.name,
  containerFormat: '500g tub',
  servingsPerContainer: 30,
  servingSizeG: 16.7,
  servingSizeDesc: '1 scoop (16.7g)',
  moqMin: 50,
  moqMax: 5000,
  leadTimeDays: 28,
}))

export async function seedFlavorDeltaFixture(prisma: PrismaClient) {
  console.log('Seeding non-pack flavor-delta fixture (flavor-delta-demo)...')

  const sub =
    (await prisma.subcategory.findFirst({
      where: { slug: 'greens-superfoods' },
      select: { id: true },
    })) ?? (await prisma.subcategory.findFirst({ select: { id: true } }))

  if (!sub) {
    console.warn('  ⚠ No subcategories found — run the catalog seed first. Skipping fixture.')
    return
  }

  const tpl = await prisma.productTemplate.upsert({
    where: { slug: FLAVOR_DELTA_SLUG },
    update: {
      name: 'Flavor-Delta Demo (non-pack)',
      subcategoryId: sub.id,
      status: 'PUBLISHED',
      labelingType: 'DIETARY_SUPPLEMENT',
      priceFloorCents: 410,
      unitCostCents: 600,
    },
    create: {
      slug: FLAVOR_DELTA_SLUG,
      name: 'Flavor-Delta Demo (non-pack)',
      description:
        'Isolated non-pack template so PDP === estimate === charge can be verified for a premium-flavor price delta.',
      subcategoryId: sub.id,
      manufacturerServiceId: null,
      status: 'PUBLISHED',
      labelingType: 'DIETARY_SUPPLEMENT',
      priceFloorCents: 410,
      unitCostCents: 600,
    },
    select: { id: true },
  })

  // Idempotent replace — mirrors seed-pricing-bridge so re-runs never violate the
  // @@unique(productTemplateId, sortOrder) on tiers.
  await prisma.productTemplatePricingTier.deleteMany({ where: { productTemplateId: tpl.id } })
  await prisma.productTemplatePricingTier.createMany({
    data: TIERS.map((t) => ({ ...t, productTemplateId: tpl.id })),
  })

  // Presets. FlavorPreset has no natural unique key, so replace-by-template keeps
  // the fixture idempotent. Skip the delete for any preset already referenced by an
  // OrderItemFlavor (a placed test order) — the FK would block it; upsert those by
  // name instead so a real order never wedges a re-seed.
  const referenced = await (
    prisma as unknown as {
      orderItemFlavor: { findMany: (a: unknown) => Promise<Array<{ flavorPresetId: string }>> }
    }
  ).orderItemFlavor
    .findMany({ where: { flavorPreset: { productTemplateId: tpl.id } }, select: { flavorPresetId: true } })
    .catch(() => [] as Array<{ flavorPresetId: string }>)
  const referencedIds = new Set(referenced.map((r) => r.flavorPresetId))

  await prisma.flavorPreset.deleteMany({
    where: { productTemplateId: tpl.id, id: { notIn: [...referencedIds] } },
  })

  for (const p of PRESETS) {
    const existing = await prisma.flavorPreset.findFirst({
      where: { productTemplateId: tpl.id, name: p.name },
      select: { id: true },
    })
    const data = {
      name: p.name,
      priceDeltaCents: p.priceDeltaCents,
      swatchHex: p.swatchHex,
      sortOrder: p.sortOrder,
      status: 'ACTIVE' as const,
      // slotResolution is a required Json overlay; [] = "no slot overrides", the
      // single-flavor default. The delta, not the recipe, is what this fixture tests.
      slotResolution: [] as unknown as object,
    }
    if (existing) {
      await prisma.flavorPreset.update({ where: { id: existing.id }, data })
    } else {
      await prisma.flavorPreset.create({ data: { ...data, productTemplateId: tpl.id } })
    }
  }

  // Variants — idempotent replace (mirrors seed-pricing-bridge). Launch requires a
  // variant; matching variant.flavor to the preset name is what the threading fix
  // now resolves. packagingTypeId is left unset (the standalone fixture doesn't run
  // seedPackagingOfferingFixtures); launch tolerates that (#38, packaging optional).
  await prisma.productTemplateVariant.deleteMany({ where: { productTemplateId: tpl.id } })
  await prisma.productTemplateVariant.createMany({
    data: VARIANTS.map((v) => ({ ...v, productTemplateId: tpl.id })),
  })

  const premium = PRESETS.find((p) => p.priceDeltaCents > 0)!
  console.log(
    `  ✓ ${FLAVOR_DELTA_SLUG} published: ${TIERS.length} tiers, ${PRESETS.length} presets, ` +
      `${VARIANTS.length} variants (premium "${premium.name}" +${premium.priceDeltaCents}c/unit).`,
  )
}

// Allow standalone execution: `tsx prisma/seed-flavor-delta-fixture.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = new PrismaClient()
  seedFlavorDeltaFixture(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e)
      await prisma.$disconnect()
      process.exit(1)
    })
}
