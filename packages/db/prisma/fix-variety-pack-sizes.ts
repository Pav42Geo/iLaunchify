// Corrective (2026-07-19) to author-variety-pack-sizes.ts. The first pass parsed
// the LEADING number of every containerFormat, which mis-read a SIZE ("5 oz bottle"
// -> 5) as a pack COUNT. Only COUNT-based formats (sachet / pack / count / ct /
// piece / capsule) are real pack sizes; a size-based single container ("5 oz
// bottle", "250 g pouch") is NOT a variety pack.
//
// This reverts the size-based mis-authors EXACTLY (my transform was
// moqPacks = ceil(oldMoqUnits / unitsPerPack), so oldMoqUnits = moqMin *
// unitsPerPack), and leaves count-based authors (Daily Greens' 20-sachet box) alone.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/fix-variety-pack-sizes.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// A containerFormat names a real pack COUNT (not a size) when it mentions one of
// these. Everything else (oz / g / ml / fl / lb single containers) is not a pack.
const COUNT_FORMAT = /sachet|pack|count|-ct\b|\bct\b|piece|capsule|stick/i

async function main() {
  const templates = await prisma.productTemplate.findMany({
    where: { maxFlavorsPerPack: { not: null } },
    select: {
      name: true,
      variants: {
        where: { isActive: true, flavor: null, unitsPerPack: { not: null } },
        select: { id: true, containerFormat: true, unitsPerPack: true, moqMin: true },
      },
    },
  })

  let reverted = 0
  let kept = 0
  for (const t of templates) {
    for (const v of t.variants) {
      if (COUNT_FORMAT.test(v.containerFormat)) {
        console.log(`  ✓ keep  ${t.name} · "${v.containerFormat}" (unitsPerPack ${v.unitsPerPack}, real pack count)`)
        kept++
        continue
      }
      // Size-based → not a pack. Reverse the transform exactly.
      const restoredMoqUnits = Math.max(1, (v.moqMin || 1) * (v.unitsPerPack || 1))
      await prisma.productTemplateVariant.update({
        where: { id: v.id },
        data: { unitsPerPack: null, moqMin: restoredMoqUnits },
      })
      console.log(`  ↩ revert ${t.name} · "${v.containerFormat}" (cleared pack size, moq restored to ${restoredMoqUnits} units)`)
      reverted++
    }
  }
  console.log(`\nReverted ${reverted} size-based mis-author(s); kept ${kept} real pack size(s).`)
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
