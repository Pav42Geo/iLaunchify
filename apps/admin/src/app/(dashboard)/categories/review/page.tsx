// Admin → Categories → Category review.
//
// Queue of product drafts a manufacturer imported whose spreadsheet category had no
// iLaunchify match. Each is parked under the partner's default subcategory with
// `needsCategoryReview = true` + their `suggestedCategoryName`. The admin re-files
// each to a real subcategory here (or creates a new category in /categories first,
// then assigns it). Mirrors the packaging-review queue. Gated on catalog:write.

import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { CategoryReviewRow } from './CategoryReviewRow'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Category review — Admin' }

type PendingRow = {
  id: string
  name: string
  suggestedCategoryName: string | null
  subcategory: { name: string; category: { name: string } } | null
  manufacturerService: { partner: { companyName: string | null } | null } | null
}

export default async function CategoryReviewPage() {
  await requireCapability('catalog:write')

  // Cast-guarded: needsCategoryReview / suggestedCategoryName post-date the generated
  // client until the Mac db push. Empty list until then (safe).
  const pending = await (
    prisma as unknown as {
      productTemplate: { findMany: (a: unknown) => Promise<PendingRow[]> }
    }
  ).productTemplate
    .findMany({
      where: { needsCategoryReview: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        name: true,
        suggestedCategoryName: true,
        subcategory: { select: { name: true, category: { select: { name: true } } } },
        manufacturerService: { select: { partner: { select: { companyName: true } } } },
      },
    })
    .catch(() => [] as PendingRow[])

  const subcategories = await prisma.subcategory.findMany({
    where: { isActive: true },
    select: { id: true, name: true, category: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  const subcatOptions = subcategories.map((s) => ({ id: s.id, label: `${s.category?.name ?? '—'} → ${s.name}` }))

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Categories"
        title="Category review"
        description="Products a manufacturer imported under a category iLaunchify doesn't have yet. Re-file each to the right category — or create a new one in Categories first, then assign it here."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Awaiting review" value={String(pending.length)} tone={pending.length > 0 ? 'amber' : 'ink'} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
          <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
            Needs a category
          </h2>
        </header>
        {pending.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-ink-500">
            Nothing waiting. Imported products with an unmatched category land here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">Manufacturer</th>
                  <th className="px-4 py-2.5 font-semibold">Suggested</th>
                  <th className="px-4 py-2.5 font-semibold">Assign category</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {pending.map((p) => (
                  <CategoryReviewRow
                    key={p.id}
                    id={p.id}
                    productName={p.name}
                    partnerName={p.manufacturerService?.partner?.companyName ?? '—'}
                    suggested={p.suggestedCategoryName}
                    currentLabel={p.subcategory ? `${p.subcategory.category?.name ?? ''} → ${p.subcategory.name}` : '—'}
                    subcategories={subcatOptions}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Kpi({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'amber' }) {
  const toneCls = { ink: 'text-ink-900', amber: 'text-warning-700' }[tone]
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
      <div className="text-[12px] font-bold uppercase tracking-wider text-ink-700">{label}</div>
      <div className={`mt-1 font-display text-[20px] font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}
