// Seed — PackagingDecorationCompatibility (C8). The admin-curated matrix of
// which DecorationMethods are physically valid on which container category.
// Partners pick a decoration when listing a PartnerPackagingOffering; the picker
// is filtered by these rows. Keyed by ContainerCategory (category-level, per the
// _V1_DECORATION_METHODS.md matrix). Idempotent (upsert by composite id).

import { PrismaClient } from '@prisma/client'
import type { ContainerCategory, DecorationMethod } from '@prisma/client'

type Combo = { method: DecorationMethod; notes?: string }

// Primary decoration methods valid per container category.
const PRIMARY: Record<string, Combo[]> = {
  CAN: [
    { method: 'DIRECT_PRINT', notes: 'High MOQ (5k+), bulk-only.' },
    { method: 'PRESSURE_SENSITIVE_LABEL', notes: 'Low MOQ (~250), on-demand friendly.' },
    { method: 'SHRINK_SLEEVE', notes: 'Mid MOQ; full-body wrap.' },
  ],
  BOTTLE: [
    { method: 'DIRECT_PRINT' },
    { method: 'PRESSURE_SENSITIVE_LABEL', notes: 'Most common at small volume.' },
    { method: 'SHRINK_SLEEVE' },
    { method: 'IN_MOLD_LABEL', notes: 'Plastic only; mid-large MOQ.' },
  ],
  JAR: [
    { method: 'DIRECT_PRINT' },
    { method: 'PRESSURE_SENSITIVE_LABEL', notes: 'Most common at small volume.' },
    { method: 'SHRINK_SLEEVE' },
  ],
  TUBE: [
    { method: 'DIRECT_PRINT' },
    { method: 'PRESSURE_SENSITIVE_LABEL' },
    { method: 'SHRINK_SLEEVE' },
  ],
  POUCH: [
    { method: 'DIRECT_PRINT', notes: 'Flexo or digital direct print.' },
    { method: 'HEAT_TRANSFER', notes: 'Mid-volume.' },
  ],
  SACHET: [{ method: 'DIRECT_PRINT' }],
  STICK_PACK: [{ method: 'DIRECT_PRINT' }],
  BOX: [{ method: 'DIRECT_PRINT', notes: 'Offset/flexo on board.' }],
  CARTON: [{ method: 'DIRECT_PRINT', notes: 'Offset on folding carton board.' }],
  CASE: [{ method: 'DIRECT_PRINT', notes: 'Flexo on corrugate.' }],
  OTHER: [{ method: 'DIRECT_PRINT' }, { method: 'PRESSURE_SENSITIVE_LABEL' }],
}

// Accent decorations valid on print-substrate categories (layered on a primary).
const ACCENT_METHODS: DecorationMethod[] = ['FOIL_STAMP', 'EMBOSS', 'DEBOSS', 'SPOT_UV']
const ACCENT_CATEGORIES: string[] = ['BOTTLE', 'JAR', 'CAN', 'TUBE', 'BOX', 'CARTON']

// NONE (undecorated — stock cap, blank seal) valid on every category.
const ALL_CATEGORIES = Object.keys(PRIMARY)

export async function seedDecorationCompatibility(prisma: PrismaClient): Promise<void> {
  const rows: Array<{
    containerCategory: ContainerCategory
    decorationMethod: DecorationMethod
    notes: string | null
  }> = []

  for (const [cat, combos] of Object.entries(PRIMARY)) {
    for (const c of combos) {
      rows.push({
        containerCategory: cat as ContainerCategory,
        decorationMethod: c.method,
        notes: c.notes ?? null,
      })
    }
  }
  for (const cat of ACCENT_CATEGORIES) {
    for (const m of ACCENT_METHODS) {
      rows.push({
        containerCategory: cat as ContainerCategory,
        decorationMethod: m,
        notes: 'Accent — layered on a primary decoration.',
      })
    }
  }
  for (const cat of ALL_CATEGORIES) {
    rows.push({
      containerCategory: cat as ContainerCategory,
      decorationMethod: 'NONE',
      notes: 'Undecorated (stock/blank).',
    })
  }

  for (const r of rows) {
    await prisma.packagingDecorationCompatibility.upsert({
      where: {
        containerCategory_decorationMethod: {
          containerCategory: r.containerCategory,
          decorationMethod: r.decorationMethod,
        },
      },
      create: { ...r, isActive: true },
      update: { notes: r.notes, isActive: true },
    })
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ Seeded ${rows.length} decoration-compatibility combos`)
}

// Standalone run: `tsx prisma/seed-decoration-compatibility.ts`
if (process.argv[1]?.endsWith('seed-decoration-compatibility.ts')) {
  const prisma = new PrismaClient()
  seedDecorationCompatibility(prisma)
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
