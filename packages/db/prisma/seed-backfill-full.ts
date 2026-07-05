// Full-data backfill for ALL seeded product templates + variants (2026-07-04).
//
// Audit finding: the main `seed-catalog.ts` templates (whey / multivitamin / energy / granola /
// greens …) carry containerFormat + servings + MOQ + die-cut on their variants, but are MISSING:
//   • packagingTypeId on every variant   → mockups + the Studio packaging drawer resolve to nothing
//   • ProductTemplatePricingTier rows     → the Product-drawer Cost summary is empty
//   • FlavorPreset rows on multi/variety templates → per-flavor scoping / labels have no flavors
// Only the demo seeds (seed-demo-*, seed-variety-demo, seed-product-full) set these. This backfill
// fills the gaps for EVERY template/variant currently in the DB, so the whole platform tests with
// full data — regardless of which seeds ran.
//
// IDEMPOTENT + non-destructive: only fills nulls / only adds tiers/flavors when there are none.
//
// Run on the Mac (needs DB + migrations applied):
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/seed-backfill-full.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SWATCHES = ['#E5567A', '#E8D9A0', '#5C3317', '#F2A93B', '#4B6CB7', '#7CB342', '#9C27B0', '#00897B']

function pickPackagingTypeId(
  containerFormat: string,
  types: { id: string; containerCategory: string | null }[],
): string | null {
  const s = (containerFormat ?? '').toLowerCase()
  const wants: string[] =
    /\bcan\b/.test(s) ? ['CAN'] :
    /bottle/.test(s) ? ['BOTTLE'] :
    /tub/.test(s) ? ['TUB', 'JAR'] :
    /sachet|stick/.test(s) ? ['SACHET', 'STICK_PACK'] :
    /pouch|bag/.test(s) ? ['POUCH', 'BAG'] :
    /jar/.test(s) ? ['JAR'] :
    /box|carton|bar/.test(s) ? ['BOX', 'CARTON'] : []
  for (const w of wants) {
    const hit = types.find((t) => (t.containerCategory ?? '').toUpperCase().includes(w))
    if (hit) return hit.id
  }
  return types[0]?.id ?? null
}

function guessNetContent(containerFormat: string, containerSizeG: number | null): { value: number; unit: string; display: string } | null {
  const s = (containerFormat ?? '').toLowerCase()
  const ml = s.match(/(\d+)\s*(ml|fl ?oz)/)
  if (ml) {
    const n = Number(ml[1])
    return { value: n, unit: /oz/.test(ml[2]!) ? 'fl oz' : 'mL', display: containerFormat }
  }
  const ct = s.match(/(\d+)\s*[- ]?(count|ct|capsule|cap)/)
  if (ct) return { value: Number(ct[1]), unit: 'ct', display: containerFormat }
  if (containerSizeG && containerSizeG > 0) return { value: containerSizeG, unit: 'g', display: `${containerSizeG}g` }
  const g = s.match(/(\d+)\s*g\b/)
  if (g) return { value: Number(g[1]), unit: 'g', display: containerFormat }
  return null
}

async function main() {
  // ---- reference data ------------------------------------------------------
  const packagingTypes = (await (
    prisma as unknown as { packagingType: { findMany: (a: unknown) => Promise<{ id: string; containerCategory: string | null }[]> } }
  ).packagingType
    .findMany({ where: { status: 'ACTIVE' }, select: { id: true, containerCategory: true } })
    .catch(() => [])) as { id: string; containerCategory: string | null }[]

  const dieCuts = await prisma.dieCutTemplate.findMany({ where: { isActive: true }, select: { id: true, category: true } })
  const anyDieCut = dieCuts[0]?.id ?? null
  const ingredients = await prisma.ingredient.findMany({ take: 8, orderBy: { name: 'asc' }, select: { id: true } })
  const multiProfile =
    (await prisma.packingProfile.findFirst({ where: { slug: 'multi-flavor-mixed' }, select: { id: true } })) ??
    (await prisma.packingProfile.findFirst({ where: { flavorMode: 'MULTI', isActive: true }, select: { id: true } }))

  if (packagingTypes.length === 0) console.warn('⚠ No ACTIVE PackagingType rows — variants will keep null packagingTypeId. Seed packaging types first.')

  const templates = await prisma.productTemplate.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      packingProfileId: true,
      maxFlavorsPerPack: true,
      _count: { select: { pricingTiers: true, flavorPresets: true } },
      variants: {
        select: {
          id: true, flavor: true, containerFormat: true, containerSizeG: true,
          netContentValue: true, sku: true, packagingTypeId: true, dieCutTemplateId: true,
          assortmentFlavors: true, customerPicksCount: true,
        },
      },
    },
  })

  let variantsPatched = 0
  let tiersAdded = 0
  let flavorsAdded = 0

  for (const t of templates) {
    // 1) Pricing tiers — add a standard ladder when the template has none.
    if ((t._count?.pricingTiers ?? 0) === 0) {
      await prisma.productTemplatePricingTier.createMany({
        data: [
          { productTemplateId: t.id, sortOrder: 0, minQty: 500, maxQty: 999, perUnitCostCents: 535, perUnitFloorCents: 470 },
          { productTemplateId: t.id, sortOrder: 1, minQty: 1000, maxQty: 4999, perUnitCostCents: 460, perUnitFloorCents: 405 },
          { productTemplateId: t.id, sortOrder: 2, minQty: 5000, maxQty: null, perUnitCostCents: 395, perUnitFloorCents: 345 },
        ],
      }).catch(() => {})
      tiersAdded += 3
    }

    // 2) FlavorPresets — for multi/variety templates with none, derive from the variants' flavors.
    const distinctFlavors = [...new Set(t.variants.map((v) => v.flavor).filter((f): f is string => !!f && f.trim().length > 0))]
    const looksMulti =
      distinctFlavors.length >= 2 ||
      t.variants.some((v) => v.customerPicksCount != null || (Array.isArray(v.assortmentFlavors) && (v.assortmentFlavors as unknown[]).length > 0) || /variety|pick any/i.test(v.containerFormat ?? ''))
    if ((t._count?.flavorPresets ?? 0) === 0 && looksMulti) {
      const names = distinctFlavors.length >= 2 ? distinctFlavors : ['Original', 'Berry', 'Citrus', 'Vanilla']
      await prisma.flavorPreset.createMany({
        data: names.map((name, i) => ({
          productTemplateId: t.id,
          name,
          statementOfIdentity: `${name} ${t.name}`,
          swatchHex: SWATCHES[i % SWATCHES.length]!,
          slotResolution: [],
          extras: ingredients.length
            ? [
                { ingredientId: ingredients[(i + 1) % ingredients.length]!.id, name: `${name} base note`, qty: 4 + i * 3, unit: 'g' },
                { ingredientId: ingredients[(i + 3) % ingredients.length]!.id, name: `${name} accent`, qty: 1 + i, unit: 'g' },
              ]
            : [],
          status: 'ACTIVE',
          sortOrder: i,
        })),
      }).catch(() => {})
      flavorsAdded += names.length
      // Enable the pack flow on the template.
      await prisma.productTemplate.update({
        where: { id: t.id },
        data: {
          ...(t.packingProfileId ? {} : multiProfile ? { packingProfileId: multiProfile.id } : {}),
          ...(t.maxFlavorsPerPack ? {} : { maxFlavorsPerPack: Math.min(Math.max(names.length, 2), 6) }),
          ...(t.status !== 'PUBLISHED' ? { status: 'PUBLISHED' } : {}),
        },
      }).catch(() => {})
    }

    // 3) Variant backfill — packagingTypeId, die-cut, size/netContent/sku (only nulls).
    for (const v of t.variants) {
      const patch: Record<string, unknown> = {}
      if (!v.packagingTypeId && packagingTypes.length) patch.packagingTypeId = pickPackagingTypeId(v.containerFormat, packagingTypes)
      if (!v.dieCutTemplateId && anyDieCut) patch.dieCutTemplateId = anyDieCut
      const sizeNum = v.containerSizeG != null ? Number(String(v.containerSizeG)) : null
      if (v.netContentValue == null) {
        const nc = guessNetContent(v.containerFormat, sizeNum)
        if (nc) { patch.netContentValue = nc.value; patch.netContentUnit = nc.unit; patch.netContentDisplay = nc.display }
      }
      if (!v.sku) patch.sku = `BF-${v.id.slice(0, 8).toUpperCase()}`
      if (Object.keys(patch).length) {
        await prisma.productTemplateVariant.update({ where: { id: v.id }, data: patch }).catch(() => {})
        variantsPatched++
      }
    }
  }

  console.log('\n✅ Full-data backfill complete.')
  console.log(`   Templates scanned : ${templates.length}`)
  console.log(`   Variants patched  : ${variantsPatched} (packagingType / die-cut / netContent / sku)`)
  console.log(`   Pricing tiers added: ${tiersAdded}`)
  console.log(`   FlavorPresets added: ${flavorsAdded}`)
  console.log('   Re-run any owned-product seed (seed-product-full / seed-variety-demo) for recipes.\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
