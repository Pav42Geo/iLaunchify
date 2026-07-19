// #22 / #32 (2026-07-19): author a real PACK SIZE (unitsPerPack) on multi-flavor
// product variants, so getVarietyPackMatrix.enabled flips TRUE and BOTH the PDP and
// checkout use the NEW pack model (state.pack) instead of diverging (checkout fell
// to the legacy split; the PDP synthesized a fabricated fallback pack). Pavel chose
// "new pack model everywhere + author the size" (2026-07-19).
//
// Seeding a realistic unitsPerPack is US authoring the demo's real pack size
// (authored data), NOT the runtime `?? 6` invention we're retiring. Idempotent:
// only fills variants that lack a pack size.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/author-variety-pack-sizes.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Leading integer of a containerFormat ("20-sachet box" -> 20, "12oz can" -> 12,
// "60-count capsule bottle" -> 60). Null when the format carries no count.
function unitsFromFormat(fmt: string): number | null {
  const m = fmt.match(/\d+/)
  if (!m) return null
  const n = parseInt(m[0]!, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function main() {
  // Multi-flavor templates = those with a flavor cap authored (maxFlavorsPerPack).
  const templates = await prisma.productTemplate.findMany({
    where: { maxFlavorsPerPack: { not: null } },
    select: {
      id: true,
      name: true,
      slug: true,
      maxFlavorsPerPack: true,
      // Only the flavor-NULL container variants are pack sizes; per-flavor variants
      // (flavor != null) are individual flavors, never a "pack size".
      variants: {
        where: { isActive: true, flavor: null },
        select: { id: true, containerFormat: true, unitsPerPack: true, moqMin: true },
      },
    },
  })

  let changed = 0
  for (const t of templates) {
    for (const v of t.variants) {
      if (v.unitsPerPack && v.unitsPerPack > 0) continue // already authored
      const units = unitsFromFormat(v.containerFormat) ?? Math.max(2, t.maxFlavorsPerPack ?? 12)
      // moqMin means PACKS in the pack model, but the current value is the old
      // UNITS-scaled default. Convert so the manufacturer's intended MINIMUM UNITS
      // is preserved: moqPacks = ceil(oldMoqUnits / unitsPerPack). Not a new number.
      const moqPacks = Math.max(1, Math.ceil((v.moqMin || 500) / units))
      await prisma.productTemplateVariant.update({
        where: { id: v.id },
        data: { unitsPerPack: units, moqMin: moqPacks },
      })
      console.log(`  ✓ ${t.name} · "${v.containerFormat}" -> unitsPerPack ${units}, moq ${moqPacks} packs (was ${v.moqMin} units)`)
      changed++
    }
  }
  console.log(`\nAuthored pack sizes on ${changed} variant(s) across ${templates.length} multi-flavor template(s).`)
  if (changed === 0) console.log('(nothing to do, all multi-flavor container variants already carry a pack size)')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
