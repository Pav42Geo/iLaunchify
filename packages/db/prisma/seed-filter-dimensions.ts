import type { PrismaClient } from '@prisma/client'

/**
 * Seed marketplace filter dimensions (docs/MARKETPLACE_DESIGN.md §7) onto
 * existing templates so the Format / Manufacturing-process filters return real
 * results in dev. Demo-grade defaults derived from each template's domain —
 * partners set the authoritative values in the builder.
 *
 * NOT seeded here (deliberately):
 *  - marketCodes — backfilled to ["US"] by the column default on db push.
 *  - allergenFreeClaims — a regulatory CLAIM; left empty so we never assert a
 *    free-from claim without basis. Set per-product when real.
 *
 * Cast-guarded: the new columns ship with a pending migration, so the generated
 * client may not type them yet.
 */

// Domain → a representative single Format (single-select). Demo default only.
const FORMAT_BY_DOMAIN: Record<string, string> = {
  DIETARY_SUPPLEMENT: 'CAPSULE',
  COSMETIC: 'CREAM',
  PET_PRODUCT: 'SOFT_CHEW',
  OTC: 'TABLET',
  FOOD: 'POWDER',
}

// A representative process per domain (single demo tag).
const PROCESS_BY_DOMAIN: Record<string, string[]> = {
  DIETARY_SUPPLEMENT: ['encapsulated'],
  COSMETIC: ['cold-pressed'],
  FOOD: ['small-batch'],
  PET_PRODUCT: ['freeze-dried'],
  OTC: [],
}

export async function seedFilterDimensions(prisma: PrismaClient): Promise<void> {
  const p = prisma as unknown as {
    productTemplate: {
      findMany: (a: unknown) => Promise<{ id: string; labelingType: string | null }[]>
      update: (a: unknown) => Promise<unknown>
    }
  }

  const templates = await p.productTemplate.findMany({
    select: { id: true, labelingType: true },
  })

  let updated = 0
  for (const t of templates) {
    const domain = t.labelingType ?? 'FOOD'
    const format = FORMAT_BY_DOMAIN[domain] ?? 'POWDER'
    const processes = PROCESS_BY_DOMAIN[domain] ?? []
    await p.productTemplate.update({
      where: { id: t.id },
      data: {
        manufacturingFormat: format,
        manufacturingProcesses: processes,
        // marketCodes left to the column default (["US"]).
      },
    })
    updated++
  }
  console.log(`  ✓ filter dimensions set on ${updated} templates`)
}
