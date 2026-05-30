import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductCard } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { MarketplaceFilters } from '@/components/MarketplaceFilters'
import { MarketplaceControlsBar } from '@/components/MarketplaceControlsBar'
import { ActiveFilterChips } from '@/components/ActiveFilterChips'
import { CATEGORY_ROWS, templateToCardProps } from '@/lib/sample-templates'
import {
  getMarketplaceTemplates,
  type MarketplaceSortKey,
} from '@/lib/templates'

const VALID_SORTS: MarketplaceSortKey[] = [
  'popular',
  'lead-time',
  'moq-low',
  'price-low',
  'newest',
]

function parseSort(v: string | undefined): MarketplaceSortKey {
  return v && (VALID_SORTS as string[]).includes(v)
    ? (v as MarketplaceSortKey)
    : 'popular'
}

/**
 * /marketplace/[category] — the "See all →" destination from each category row.
 *
 * Shares the same shell as /marketplace (header + sidebar + controls bar +
 * filter chips), scoped to a single category. The URL-driven sort + filter
 * sidebar works here without modification — the page just adds a fixed
 * categorySlug to every getMarketplaceTemplates call.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>
  searchParams: Promise<{
    sort?: string
    diet?: string
    moq?: string
    q?: string
  }>
}) {
  const { category } = await params
  const sp = await searchParams
  const row = CATEGORY_ROWS.find((r) => r.slug === category)
  if (!row) notFound()

  const sort = parseSort(sp.sort)
  const tags = sp.diet
    ? sp.diet
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined
  const moqMax =
    sp.moq && Number.isFinite(Number(sp.moq)) ? Number(sp.moq) : undefined

  const { templates, totalCount } = await getMarketplaceTemplates({
    sort,
    tags,
    moqMax,
    q: sp.q,
    categorySlugs: [category],
    take: 60,
  })

  return (
    <>
      <MarketplaceHeader />

      <div className="max-w-[1400px] mx-auto px-6 py-6 grid gap-7 items-start grid-cols-1 md:grid-cols-[240px_1fr]">
        {/* No Home crumb — Marketplace is the root for this funnel. */}
        <div className="text-[13px] text-ink-500 md:col-span-2">
          <Link href="/marketplace" className="hover:text-ink-900">
            Marketplace
          </Link>{' '}
          › <span>{row.title}</span>
        </div>

        <MarketplaceFilters />

        <main className="flex flex-col">
          <header className="mb-7">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-pink-700 mb-2">
              Category
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] mb-3 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-pink-500">
              {row.title}.
            </h1>
            <p className="text-ink-600 text-[15px] max-w-[52ch] leading-[1.55]">
              {row.templates.length} curated templates in {row.title.toLowerCase()}.
              Filter by diet, MOQ, or search across the row — the URL keeps
              your view shareable.
            </p>
          </header>

          <MarketplaceControlsBar
            resultCount={totalCount}
            totalCount={row.templates.length}
          />

          <ActiveFilterChips />

          {totalCount === 0 ? (
            <section className="mb-12 border border-dashed border-ink-200 rounded-2xl p-10 text-center">
              <div className="font-display text-2xl font-bold tracking-[-0.02em] mb-2">
                No templates match these filters.
              </div>
              <p className="text-[14px] text-ink-500 max-w-[42ch] mx-auto">
                Try removing a filter from the sidebar, or browse{' '}
                <Link
                  href="/marketplace"
                  className="text-pink-700 font-semibold hover:text-pink-600"
                >
                  the full catalog
                </Link>
                .
              </p>
            </section>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {templates.map((t) => (
                <ProductCard key={t.slug} {...templateToCardProps(t)} />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  )
}

export async function generateStaticParams() {
  return CATEGORY_ROWS.map((row) => ({ category: row.slug }))
}
