// #22 keystone check (2026-07-19): does a fresh launch materialise the PRIMARY
// container UPSTREAM, so checkout never has to pick it? Read-only.
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/verify-launch-container.ts
//
// Launch any product from a marketplace PDP, then run this. The newest DRAFT
// products should each show a PRIMARY / CONTAINER PackagingComponent whose
// container matches the product's variant, with decorationMethod NONE (the
// Studio decoration pick fills in the offering + method + dieline afterwards).

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const products = await prisma.product.findMany({
    where: { status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: {
      id: true,
      name: true,
      createdAt: true,
      variant: { select: { containerFormat: true, packagingType: { select: { displayName: true } } } },
      packagingComponents: {
        where: { tier: 'PRIMARY' },
        select: {
          role: true,
          decorationMethod: true,
          partnerOfferingId: true,
          dielineId: true,
          packagingType: { select: { displayName: true } },
        },
      },
    },
  })

  if (products.length === 0) {
    console.log('\nNo DRAFT products yet. Launch one from a PDP, then re-run.\n')
    return
  }

  for (const p of products) {
    const when = p.createdAt.toISOString().slice(0, 16).replace('T', ' ')
    console.log(`\n${p.name}  [${when}]  (${p.id})`)
    console.log(`   variant container: ${p.variant?.packagingType?.displayName ?? '(no packagingType on variant)'}  ·  format "${p.variant?.containerFormat ?? '?'}"`)
    const primary = p.packagingComponents[0]
    if (!primary) {
      console.log(`   PRIMARY component: NONE  <-- keystone gap (container would be picked at checkout)`)
    } else {
      const off = primary.partnerOfferingId ? `offering ${primary.partnerOfferingId.slice(0, 8)}…` : 'no offering yet (Studio picks it)'
      const die = primary.dielineId ? `dieline ${primary.dielineId.slice(0, 8)}…` : 'no dieline yet'
      console.log(`   PRIMARY ${primary.role}: ${primary.packagingType?.displayName ?? '?'}  ·  decoration ${primary.decorationMethod}  ·  ${off}  ·  ${die}`)
    }
  }
  console.log('')
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
