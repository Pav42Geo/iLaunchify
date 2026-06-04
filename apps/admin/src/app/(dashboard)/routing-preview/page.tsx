// B4 — admin Routing preview tool. Pick a product + quantity (+ optional
// destination region + target market) and see the ranked manufacturer
// candidates with their capability/proximity/cert score breakdown. Makes the
// orchestration routing transparent for ops.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { RoutingPreviewForm } from './RoutingPreviewForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Routing preview — iLaunchify Admin' }

export default async function RoutingPreviewPage() {
  await requireRole('ADMIN')

  const [products, markets, regions] = await Promise.all([
    prisma.product.findMany({
      where: { category: { in: ['FOOD', 'SUPPLEMENT'] } },
      select: { id: true, name: true, category: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
    prisma.market.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
    prisma.region.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
      take: 100,
    }),
  ])

  // De-dupe products by name (the seed has many near-identical Whey rows).
  const seen = new Set<string>()
  const uniqueProducts = products.filter((p) => {
    if (seen.has(p.name)) return false
    seen.add(p.name)
    return true
  })

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-[#F3EFE8] px-6 py-7">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Routing preview</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          See which manufacturers the orchestration engine would rank for an order — with the
          capability, proximity, and certification scores behind each pick. Hard gates (category fit,
          MOQ range, payouts) filter first; survivors are scored.
        </p>
      </div>

      <RoutingPreviewForm products={uniqueProducts} markets={markets} regions={regions} />
    </div>
  )
}
