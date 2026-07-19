// #22 Slice 1 ground-truth: do templates have REAL container offerings to pick?
// Read-only. Delete after it answers the question.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/check-container-offerings.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const templates = await prisma.productTemplate.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      slug: true,
      name: true,
      variants: { where: { isActive: true }, select: { containerFormat: true, packagingTypeId: true } },
    },
    orderBy: { slug: 'asc' },
  })

  for (const t of templates) {
    const typeIds = [...new Set(t.variants.map((v) => v.packagingTypeId).filter((x): x is string => Boolean(x)))]
    const offs = typeIds.length
      ? await prisma.partnerPackagingOffering.findMany({
          where: { packagingTypeId: { in: typeIds }, status: 'ACTIVE' },
          select: {
            id: true,
            decorationMethod: true,
            moq: true,
            leadTimeDays: true,
            packagingType: { select: { displayName: true } },
          },
        })
      : []
    const linked = t.variants.filter((v) => v.packagingTypeId).length
    console.log(`\n${t.slug}  (${t.name})`)
    console.log(`   variants: ${t.variants.length}, with packagingType linked: ${linked}`)
    console.log(`   containerFormats: ${t.variants.map((v) => v.containerFormat).join(' | ')}`)
    if (offs.length === 0) {
      console.log(`   ACTIVE offerings: NONE  <-- no real container to pick (gap)`)
    } else {
      for (const o of offs) {
        console.log(`     - ${o.packagingType?.displayName ?? '?'}  ${o.decorationMethod}  MOQ ${o.moq}  ${o.leadTimeDays}d  [${o.id}]`)
      }
    }
  }
  console.log('')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
