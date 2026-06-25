// B4 — admin Routing preview tool. Pick a product + quantity (+ optional
// destination region + target market) and see the ranked manufacturer
// candidates with their capability/proximity/cert score breakdown. Makes the
// orchestration routing transparent for ops.

import { Workflow } from 'lucide-react'
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
      <header className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700"><Workflow className="h-3 w-3" /> Order settings</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">Routing preview</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          See which manufacturers the orchestration engine would rank for an order — with the
          capability, proximity, and certification scores behind each pick. Hard gates (category fit,
          MOQ range, payouts) filter first; survivors are scored.
        </p>
      </header>

      <RoutingPreviewForm products={uniqueProducts} markets={markets} regions={regions} />
    </div>
  )
}
