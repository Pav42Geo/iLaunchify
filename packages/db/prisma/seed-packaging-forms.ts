// Seed — canonical package-FORM catalog (2026-06-30). Distinct from the
// size-specific PackagingType rows in seed-packaging-types.ts: these are the
// industry package forms a buyer filters by and a manufacturer picks from
// (Bag, Box, Bag In Box, Tray In Sleeve, …). Each carries:
//   - containerCategory  → the primary container (grouping parent for the filter)
//   - defaultTopology    → closest 3D topology (a default; most need no 3D)
//   - applicableLabelingTypes → product domains it applies to (empty = all)
//
// Idempotent (upsert by slug, prefixed `form-`). Admin can refine domains, image,
// die-line, and topology afterward in the packaging-containers catalog page.

import { PrismaClient } from '@prisma/client'

const ALL = ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'OTC', 'COSMETIC']
const FOOD_PET = ['FOOD', 'PET_PRODUCT']
const BULK = ['FOOD', 'PET_PRODUCT', 'COSMETIC']

// container/topology are plain strings (the new ContainerCategory enum values
// post-date the generated client until db:generate; Prisma accepts the strings
// for the enum columns at runtime). Values must match the schema enums.
interface FormSeed {
  name: string
  container: string
  topology: string
  domains?: string[] // defaults to ALL
}

// name · primary container · topology · (optional narrowed domains)
const FORMS: FormSeed[] = [
  { name: 'Bag', container: 'BAG', topology: 'POUCH_STAND_UP' },
  { name: 'Box', container: 'BOX', topology: 'SINGLE_CONTAINER' },
  { name: 'Wrap', container: 'WRAP', topology: 'SINGLE_CONTAINER' },
  { name: 'Tray', container: 'TRAY', topology: 'SINGLE_CONTAINER', domains: FOOD_PET },
  { name: 'Bottle', container: 'BOTTLE', topology: 'SINGLE_CONTAINER' },
  { name: 'Jar', container: 'JAR', topology: 'SINGLE_CONTAINER' },
  { name: 'Tub', container: 'TUB', topology: 'SINGLE_CONTAINER' },
  { name: 'Tube', container: 'TUBE', topology: 'TUBE' },
  { name: 'Cup', container: 'CUP', topology: 'SINGLE_CONTAINER', domains: FOOD_PET },
  { name: 'Sachet In Box', container: 'SACHET', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Pouch Bag', container: 'POUCH', topology: 'POUCH_STAND_UP' },
  { name: 'Tray In Box', container: 'TRAY', topology: 'MULTI_CONTAINER_BOX', domains: FOOD_PET },
  { name: 'Sachet', container: 'SACHET', topology: 'SACHET' },
  { name: 'Bag In Box', container: 'BAG', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Can', container: 'CAN', topology: 'SINGLE_CONTAINER', domains: FOOD_PET },
  { name: 'Tray In Sleeve', container: 'TRAY', topology: 'MULTI_CONTAINER_BOX', domains: FOOD_PET },
  { name: 'Basket', container: 'BASKET', topology: 'OTHER', domains: ['FOOD', 'COSMETIC'] },
  { name: 'Wrap In Box', container: 'WRAP', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Packet', container: 'PACKET', topology: 'SACHET' },
  { name: 'Bottle In Wrap', container: 'BOTTLE', topology: 'SINGLE_CONTAINER' },
  { name: 'Tube/Stick', container: 'TUBE', topology: 'TUBE', domains: ['COSMETIC', 'OTC', 'FOOD'] },
  { name: 'Bottle In Box', container: 'BOTTLE', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Envelope', container: 'ENVELOPE', topology: 'OTHER' },
  { name: 'Wrap In Bag', container: 'WRAP', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Stick In Box', container: 'STICK', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Tin', container: 'TIN', topology: 'SINGLE_CONTAINER' },
  { name: 'Jar In Wrap', container: 'JAR', topology: 'SINGLE_CONTAINER' },
  { name: 'Stick In Canister', container: 'STICK', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Rollstock', container: 'ROLLSTOCK', topology: 'OTHER', domains: FOOD_PET },
  { name: 'Bowl', container: 'BOWL', topology: 'SINGLE_CONTAINER', domains: FOOD_PET },
  { name: 'Tray In Wrap', container: 'TRAY', topology: 'MULTI_CONTAINER_BOX', domains: FOOD_PET },
  { name: 'Pod', container: 'POD', topology: 'SINGLE_CONTAINER', domains: ['FOOD', 'COSMETIC'] },
  { name: 'Bowl In Box', container: 'BOWL', topology: 'MULTI_CONTAINER_BOX', domains: FOOD_PET },
  { name: 'Bottle In Basket', container: 'BOTTLE', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Box In Sleeve', container: 'BOX', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Pegged', container: 'PEGGED', topology: 'OTHER' },
  { name: 'Tube In Box', container: 'TUBE', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Big Mouth Short Neck Bottle', container: 'BOTTLE', topology: 'SINGLE_CONTAINER' },
  { name: 'Stick Pack In Box', container: 'STICK_PACK', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Tub In Sleeve', container: 'TUB', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Box In Wrap', container: 'BOX', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Envelope In Tray', container: 'ENVELOPE', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Tank', container: 'TANK', topology: 'SINGLE_CONTAINER', domains: BULK },
  { name: 'Bottle In Canister', container: 'BOTTLE', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Wrap In Sleeve', container: 'WRAP', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Jug', container: 'JUG', topology: 'SINGLE_CONTAINER', domains: BULK },
  { name: 'Microwaveable', container: 'TRAY', topology: 'OTHER', domains: FOOD_PET },
  { name: 'Tube Envelope In Box', container: 'TUBE', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Banded', container: 'OTHER', topology: 'OTHER' },
  { name: 'Stick', container: 'STICK', topology: 'STICK_PACK' },
  { name: 'Envelope In Bag', container: 'ENVELOPE', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Drum', container: 'DRUM', topology: 'SINGLE_CONTAINER', domains: BULK },
  { name: 'Pail', container: 'PAIL', topology: 'SINGLE_CONTAINER', domains: BULK },
  { name: 'Wide Mouth Can', container: 'CAN', topology: 'SINGLE_CONTAINER', domains: FOOD_PET },
  { name: 'Bottle In Bag', container: 'BOTTLE', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Canister In Wrap', container: 'CANISTER', topology: 'SINGLE_CONTAINER' },
  { name: 'Bowl In Sleeve', container: 'BOWL', topology: 'MULTI_CONTAINER_BOX', domains: FOOD_PET },
  { name: 'Wrap In Tray', container: 'WRAP', topology: 'MULTI_CONTAINER_BOX' },
  { name: 'Envelope In Box', container: 'ENVELOPE', topology: 'MULTI_CONTAINER_BOX' },
]

const slugify = (s: string) => 'form-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export async function seedPackagingForms(prisma: PrismaClient): Promise<void> {
  for (const f of FORMS) {
    const slug = slugify(f.name)
    const data = {
      displayName: f.name,
      defaultTopology: f.topology,
      containerCategory: f.container,
      applicableLabelingTypes: f.domains ?? ALL,
      defaultSurfaces: [{ name: 'Front', defaultBleedMm: 3 }],
      status: 'ACTIVE' as const,
    }
    await (prisma as unknown as {
      packagingType: { upsert: (a: unknown) => Promise<unknown> }
    }).packagingType.upsert({
      where: { slug },
      create: { slug, ...data },
      update: data,
    })
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ Seeded ${FORMS.length} packaging forms`)
}

// Standalone run (guarded so importing from seed.ts doesn't self-execute).
if (process.argv[1]?.endsWith('seed-packaging-forms.ts')) {
  const prisma = new PrismaClient()
  seedPackagingForms(prisma)
    .catch((e) => { console.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
