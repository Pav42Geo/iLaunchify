// Seed — canonical admin-curated PackagingType catalog.
//
// Until now the PackagingType library shipped empty (partners created every
// PackagingSystem from scratch). This seeds a starter set so:
//   1. the partner packaging-new picker can offer canonical types (#135),
//   2. multi-component slot derivation has real containerCategory data
//      (C7.c → impliedComponentSlots), and
//   3. CLOSURE / SEAL component slots have cap/seal PackagingTypes to reference.
//
// Idempotent (upsert by slug). Containers carry a containerCategory; closures
// and seals are role-parts (containerCategory OTHER, topology OTHER) referenced
// by a product's CLOSURE/SEAL component slots.

import { PrismaClient } from '@prisma/client'
import type { ContainerCategory, PackagingTopology } from '@prisma/client'

interface PackagingTypeSeed {
  slug: string
  displayName: string
  defaultTopology: PackagingTopology
  containerCategory: ContainerCategory
  defaultDimensions?: { lengthMm: number; widthMm: number; heightMm: number }
  surfaces?: string[]
}

const PACKAGING_TYPES: PackagingTypeSeed[] = [
  // ---- Primary containers ----
  { slug: 'glass-jar-8oz', displayName: 'Glass jar — 8 oz', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'JAR', defaultDimensions: { lengthMm: 64, widthMm: 64, heightMm: 90 }, surfaces: ['Front', 'Back'] },
  { slug: 'glass-jar-16oz', displayName: 'Glass jar — 16 oz', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'JAR', defaultDimensions: { lengthMm: 76, widthMm: 76, heightMm: 110 }, surfaces: ['Front', 'Back'] },
  { slug: 'pet-jar-32oz-wide-mouth', displayName: 'PET jar — 32 oz wide-mouth', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'JAR', surfaces: ['Front', 'Back'] },
  { slug: 'glass-bottle-12oz', displayName: 'Glass bottle — 12 oz', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'BOTTLE', defaultDimensions: { lengthMm: 60, widthMm: 60, heightMm: 200 }, surfaces: ['Front', 'Back'] },
  // Added 2026-07-18 (#22) — real demo-product sizes so the container label AND the
  // Studio dieline dimensions match the product, not a nearest-guess 12 oz bottle.
  { slug: 'glass-bottle-5oz-woozy', displayName: 'Glass woozy bottle, 5 oz', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'BOTTLE', defaultDimensions: { lengthMm: 45, widthMm: 45, heightMm: 165 }, surfaces: ['Front', 'Back'] },
  { slug: 'glass-dropper-30ml', displayName: 'Glass dropper bottle, 30 ml', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'BOTTLE', defaultDimensions: { lengthMm: 30, widthMm: 30, heightMm: 75 }, surfaces: ['Front', 'Back'] },
  { slug: 'hdpe-bottle-16oz', displayName: 'HDPE bottle — 16 oz', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'BOTTLE', surfaces: ['Front', 'Back'] },
  { slug: 'pet-bottle-500ml', displayName: 'PET bottle — 500 ml', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'BOTTLE', surfaces: ['Front', 'Back'] },
  { slug: 'capsule-bottle-100ct', displayName: 'Capsule bottle — 100 ct', defaultTopology: 'CAPSULE_JAR', containerCategory: 'BOTTLE', surfaces: ['Front', 'Back'] },
  { slug: 'aluminum-can-330ml', displayName: 'Aluminum can — 330 ml', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'CAN', defaultDimensions: { lengthMm: 66, widthMm: 66, heightMm: 115 }, surfaces: ['Wrap'] },
  { slug: 'aluminum-can-12oz-slim', displayName: 'Aluminum can — 12 oz slim', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'CAN', defaultDimensions: { lengthMm: 58, widthMm: 58, heightMm: 157 }, surfaces: ['Wrap'] },
  { slug: 'ldpe-tube-100ml', displayName: 'LDPE squeeze tube — 100 ml', defaultTopology: 'TUBE', containerCategory: 'TUBE', surfaces: ['Front', 'Back'] },
  { slug: 'standup-pouch-12oz', displayName: 'Stand-up pouch — 12 oz', defaultTopology: 'POUCH_STAND_UP', containerCategory: 'POUCH', defaultDimensions: { lengthMm: 150, widthMm: 50, heightMm: 230 }, surfaces: ['Front', 'Back'] },
  { slug: 'standup-pouch-200g', displayName: 'Stand-up pouch, 200 g', defaultTopology: 'POUCH_STAND_UP', containerCategory: 'POUCH', defaultDimensions: { lengthMm: 130, widthMm: 40, heightMm: 200 }, surfaces: ['Front', 'Back'] },
  { slug: 'flat-pouch-1oz', displayName: 'Flat pouch — 1 oz', defaultTopology: 'POUCH_FLAT', containerCategory: 'POUCH', surfaces: ['Front', 'Back'] },
  { slug: 'sachet-5g', displayName: 'Sachet — 5 g', defaultTopology: 'SACHET', containerCategory: 'SACHET', surfaces: ['Front'] },
  { slug: 'stick-pack-3g', displayName: 'Stick pack — 3 g', defaultTopology: 'STICK_PACK', containerCategory: 'STICK_PACK', surfaces: ['Front'] },
  { slug: 'folding-carton-small', displayName: 'Folding carton — small', defaultTopology: 'SINGLE_CONTAINER', containerCategory: 'BOX', surfaces: ['Front', 'Back', 'Top'] },
  // ---- Secondary / tertiary ----
  { slug: 'variety-carton-12pack', displayName: 'Variety carton — 12-pack', defaultTopology: 'MULTI_CONTAINER_BOX', containerCategory: 'CARTON', surfaces: ['Front', 'Back', 'Top'] },
  { slug: 'master-case-24', displayName: 'Master shipping case — 24 ct', defaultTopology: 'CASE', containerCategory: 'CASE', surfaces: ['Side'] },
  // ---- Closures (CLOSURE-role parts) ----
  { slug: 'metal-twist-cap-63mm', displayName: 'Metal twist cap — 63 mm', defaultTopology: 'OTHER', containerCategory: 'OTHER', surfaces: ['Top'] },
  { slug: 'flip-top-cap', displayName: 'Flip-top cap', defaultTopology: 'OTHER', containerCategory: 'OTHER', surfaces: ['Top'] },
  { slug: 'cr-cap-supplement', displayName: 'Child-resistant cap', defaultTopology: 'OTHER', containerCategory: 'OTHER', surfaces: ['Top'] },
  // ---- Seals (SEAL-role parts) ----
  { slug: 'induction-foil-seal', displayName: 'Induction foil seal', defaultTopology: 'OTHER', containerCategory: 'OTHER', surfaces: ['Face'] },
  { slug: 'shrink-band-seal', displayName: 'Shrink band — tamper-evident', defaultTopology: 'OTHER', containerCategory: 'OTHER', surfaces: ['Wrap'] },
]

export async function seedPackagingTypes(prisma: PrismaClient): Promise<void> {
  for (const t of PACKAGING_TYPES) {
    const defaultSurfaces = (t.surfaces ?? ['Front']).map((name) => ({ name, defaultBleedMm: 3 }))
    await prisma.packagingType.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        displayName: t.displayName,
        defaultTopology: t.defaultTopology,
        containerCategory: t.containerCategory,
        defaultDimensions: t.defaultDimensions ?? undefined,
        defaultSurfaces,
        status: 'ACTIVE',
      },
      update: {
        displayName: t.displayName,
        defaultTopology: t.defaultTopology,
        containerCategory: t.containerCategory,
        defaultDimensions: t.defaultDimensions ?? undefined,
        defaultSurfaces,
      },
    })
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ Seeded ${PACKAGING_TYPES.length} packaging types`)
}

// Standalone run: `tsx prisma/seed-packaging-types.ts` (guarded so importing
// from seed.ts doesn't self-execute).
if (process.argv[1]?.endsWith('seed-packaging-types.ts')) {
  const prisma = new PrismaClient()
  seedPackagingTypes(prisma)
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
