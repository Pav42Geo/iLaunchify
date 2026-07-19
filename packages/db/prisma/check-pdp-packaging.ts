// #38 ground truth (read-only): what the scoped PDP packaging picker will show per
// product. Mirrors getTemplatePackagingOptions: the template's ACTIVE variants'
// packagingTypes -> ACTIVE PartnerPackagingOffering, grouped by container, each with
// its decoration methods. Confirms scoping (a sachet shows ONLY its sachet box, never
// glass bottles) and how many decoration methods a container has (>1 => PDP surfaces them).
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/check-pdp-packaging.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const templates = await prisma.productTemplate.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      slug: true,
      variants: { where: { isActive: true }, select: { packagingTypeId: true } },
    },
  })

  for (const t of templates) {
    const typeIds = [...new Set(t.variants.map((v) => v.packagingTypeId).filter((x): x is string => Boolean(x)))]
    const offerings = typeIds.length
      ? await prisma.partnerPackagingOffering.findMany({
          where: { packagingTypeId: { in: typeIds }, status: 'ACTIVE' },
          select: {
            packagingTypeId: true,
            decorationMethod: true,
            packagingType: { select: { displayName: true } },
          },
        })
      : []

    const byType = new Map<string, { name: string; methods: Set<string> }>()
    for (const o of offerings) {
      let e = byType.get(o.packagingTypeId)
      if (!e) { e = { name: o.packagingType?.displayName ?? '?', methods: new Set() }; byType.set(o.packagingTypeId, e) }
      e.methods.add(o.decorationMethod)
    }

    console.log(`\n${t.name}  [${t.slug}]`)
    if (byType.size === 0) {
      console.log('   (no scoped packaging options — PDP shows absence)')
      continue
    }
    for (const e of byType.values()) {
      const methods = [...e.methods]
      const rule = methods.length > 1 ? `${methods.length} methods → PDP shows decoration picker` : `1 method → auto-pin`
      console.log(`   • ${e.name}: ${methods.join(', ')}   (${rule})`)
    }
  }
  console.log('')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
