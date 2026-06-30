import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { MarketplaceFilters } from '@/components/MarketplaceFilters'
import { MarketplaceControlsBar } from '@/components/MarketplaceControlsBar'
import { ActiveFilterChips } from '@/components/ActiveFilterChips'
import { CATEGORY_ROWS, templateToCardProps } from '@/lib/sample-templates'
import { InfiniteProductGrid } from '@/components/InfiniteProductGrid'
import {
  getMarketplaceTemplates,
  getMarketplaceCategory,
  getCategoryTemplateCount,
  type MarketplaceSortKey,
} from '@/lib/templates'
import { loadLifestyleTagGroups } from '@/lib/lifestyle-tags-db'
import {
  getCertificationOptions,
  getPackagingFilterGroups,
  getMarketOptions,
} from '@/lib/filter-options'

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

function csv(v: string | undefined): string[] | undefined {
  if (!v) return undefined
  const list = v.split(',').map((s) => s.trim()).filter(Boolean)
  return list.length ? list : undefined
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
    q?: string
    format?: string
    diet?: string
    audience?: string
    trend?: string
    moq?: string
    lead?: string
    market?: string
    cert?: string
    free?: string
    process?: string
    pkg?: string
    pkgc?: string
  }>
}) {
  const { category } = await params
  const sp = await searchParams
  // DB-driven category header (fixture fallback inside the resolver). notFound
  // only when neither the DB nor the fixture knows the slug.
  const categoryInfo = await getMarketplaceCategory(category)
  if (!categoryInfo) notFound()

  const sort = parseSort(sp.sort)
  const moqMax =
    sp.moq && Number.isFinite(Number(sp.moq)) ? Number(sp.moq) : undefined
  const marketCode = sp.market || undefined
  const packagingChildren = csv(sp.pkgc)
  const packagingParents = csv(sp.pkg)

  const [
    { templates, totalCount },
    categoryCatalogCount,
    lifestyleTagGroups,
    certOptions,
    packagingGroups,
    marketOptions,
  ] = await Promise.all([
    getMarketplaceTemplates({
      sort,
      moqMax,
      q: sp.q,
      categorySlugs: [category],
      format: sp.format || undefined,
      dietSlugs: csv(sp.diet),
      audienceSlugs: csv(sp.audience),
      trendSlugs: csv(sp.trend),
      leadBucket: sp.lead || undefined,
      marketCode,
      certSlugs: csv(sp.cert),
      allergenFreeSlugs: csv(sp.free),
      processSlugs: csv(sp.process),
      ...(packagingChildren ? { packagingChildren } : { packagingParents }),
      take: 60,
    }),
    getCategoryTemplateCount(category),
    loadLifestyleTagGroups(),
    getCertificationOptions(marketCode),
    getPackagingFilterGroups(),
    getMarketOptions(),
  ])

  return (
    <>
      <MarketplaceHeader />

      <div className="max-w-[1400px] mx-auto px-6 py-6 grid gap-7 items-start grid-cols-1 md:grid-cols-[240px_1fr]">
        {/* No Home crumb — Marketplace is the root for this funnel. */}
        <div className="text-[13px] text-ink-500 md:col-span-2">
          <Link href="/marketplace" className="hover:text-ink-900">
            Marketplace
          </Link>{' '}
          › <span>{categoryInfo.title}</span>
        </div>

        <MarketplaceFilters
          lifestyleGroups={lifestyleTagGroups}
          certOptions={certOptions}
          packagingGroups={packagingGroups}
          marketOptions={marketOptions}
          domain={categoryInfo.domain}
        />

        <main className="flex flex-col">
          <header className="mb-7">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-pink-700 mb-2">
              Category
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] mb-3 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-pink-500">
              {categoryInfo.title}.
            </h1>
            <p className="text-ink-600 text-[15px] max-w-[52ch] leading-[1.55]">
              {categoryCatalogCount} curated templates in {categoryInfo.title.toLowerCase()}.
              Filter by diet, MOQ, or search across the row — the URL keeps
              your view shareable.
            </p>
          </header>

          <MarketplaceControlsBar
            resultCount={totalCount}
            totalCount={categoryCatalogCount}
          />

          <ActiveFilterChips />

          {totalCount === 0 ? (
            <section className="mb-12 border border-dashed border-ink-200 rounded-2xl p-10 text-center">
              <div className="font-display text-ui-title mb-2">
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
            <InfiniteProductGrid items={templates.map(templateToCardProps)} />
          )}
        </main>
      </div>
    </>
  )
}

export async function generateStaticParams() {
  return CATEGORY_ROWS.map((row) => ({ category: row.slug }))
}
