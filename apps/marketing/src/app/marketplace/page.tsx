import Link from 'next/link'
import { ProductCard, HeroBanner, Button } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { getMarketingSession, headerPropsFromSession } from '@/lib/session'
import { MarketplaceFilters } from '@/components/MarketplaceFilters'
import { MarketplaceControlsBar } from '@/components/MarketplaceControlsBar'
import { ActiveFilterChips } from '@/components/ActiveFilterChips'
import { FeaturedCollection } from '@/components/FeaturedCollection'
import { CATEGORY_ROWS, templateToCardProps, type SampleTemplate } from '@/lib/sample-templates'
import {
  getMarketplaceTemplates,
  getTrendingTemplates,
  getQuickLaunchTemplates,
  getCatalogCount,
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
 * /marketplace — the creator marketplace.
 *
 * Composition (top → bottom):
 *   1. Header + breadcrumb
 *   2. HeroBanner island ("Find your product. Make it yours. Launch it.")
 *   3. Controls bar — result count + sort dropdown
 *   4. Active filter chips
 *   5. Featured "Trending this week" row (richer cards)
 *   6. Category rows (Coffee & Tea, Functional Beverages, …) with metadata
 *   7. "Quick to launch" curated row (lowest lead-time templates)
 *   8. Newsletter signup CTA
 *
 * Filter sidebar locked to filters-only per MARKETPLACE_DESIGN.md.
 */
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{
    as?: string
    sort?: string
    diet?: string
    moq?: string
    q?: string
    /**
     * Niche slug from the /launch/[niche] landings (SEO funnel).
     * Recognised as an active filter chip; real niche → template
     * scoring lands when CreatorNiche schema arrives (M1 in
     * MARKETPLACE_DESIGN.md §13). Until then it's an
     * informational pill that preserves user context after the
     * landing-page jump.
     */
    niche?: string
  }>
}) {
  const sp = await searchParams
  const { sort: sortParam, diet, moq, q, niche } = sp
  const sort = parseSort(sortParam)
  const tags = diet
    ? diet
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined
  const moqMax = moq && Number.isFinite(Number(moq)) ? Number(moq) : undefined
  const hasActiveFilters = Boolean(tags?.length || moqMax !== undefined || q || niche)
  const session = await getMarketingSession()
  const { user, brands, activeBrandId } = headerPropsFromSession(session)

  // Pull data through the new Prisma-backed data layer. When the DB is
  // empty (fresh dev install), each call gracefully falls back to the
  // sample dataset so the page still renders.
  const [
    { templates, totalCount, fromSample },
    trending,
    quickLaunch,
    catalogTotal,
  ] = await Promise.all([
    getMarketplaceTemplates({ sort, tags, moqMax, q, take: 60 }),
    getTrendingTemplates(4),
    getQuickLaunchTemplates(4),
    getCatalogCount(),
  ])

  return (
    <>
      <MarketplaceHeader
        user={user}
        brands={brands}
        activeBrandId={activeBrandId}
        hasUnreadNotifications={false}
        activeNiche={niche}
      />

      <div className="max-w-[1400px] mx-auto px-6 py-6 grid gap-7 items-start grid-cols-1 md:grid-cols-[240px_1fr]">
        {/* Marketplace is its own root — no Home crumb so visitors stay in the shop. */}
        <div className="text-[13px] text-ink-500 md:col-span-2">
          <span className="font-medium text-ink-900">Marketplace</span>
        </div>

        <MarketplaceFilters />

        <main className="flex flex-col">
          <HeroBanner
            variant="island"
            eyebrow="The marketplace for makers"
            headline={
              <>
                Find your product. <em>Make it yours.</em> Launch it.
              </>
            }
            deck="Browse curated, production-ready templates across 8 niches. Customize the label — we handle manufacturing, printing, and fulfillment."
            className="mb-7"
          >
            <Button variant="secondary" asChild>
              <Link href="/how-it-works">See how it works →</Link>
            </Button>
          </HeroBanner>

          {/* Dev-only banner when no DB rows exist yet */}
          {fromSample && process.env.NODE_ENV !== 'production' && (
            <div className="mb-5 rounded-lg border border-pink-200 bg-pink-50 px-4 py-3 text-[12.5px] text-pink-900 flex items-start gap-2.5">
              <span className="text-pink-700 font-bold mt-0.5">·</span>
              <div>
                <strong className="font-bold">Showing sample templates</strong>
                <span className="text-pink-900/70">
                  {' '}
                  · the Prisma data layer is wired but the
                  ProductTemplate table is empty. Run{' '}
                  <code className="font-mono bg-white px-1 py-0.5 rounded text-pink-700">
                    pnpm --filter @ilaunchify/db seed
                  </code>{' '}
                  to load real rows.
                </span>
              </div>
            </div>
          )}

          {/* Controls + active filters */}
          <MarketplaceControlsBar
            resultCount={totalCount}
            totalCount={catalogTotal}
          />

          <ActiveFilterChips />

          {hasActiveFilters || sort !== 'popular' ? (
            <ResultsGrid templates={templates} resultCount={totalCount} />
          ) : (
            <>
              {/* Featured — Trending this week */}
              {trending.length > 0 && (
                <FeaturedCollection
                  variant="trending"
                  headline={
                    <>
                      What everyone&apos;s{' '}
                      <span className="font-serif italic font-medium text-pink-500">
                        launching
                      </span>{' '}
                      this week.
                    </>
                  }
                  templates={trending}
                />
              )}

              {/* Category rows */}
              {CATEGORY_ROWS.map((row) => (
                <CategorySection key={row.slug} row={row} />
              ))}

              {/* Quick to launch curated row */}
              <FeaturedCollection
                variant="quick-launch"
                headline={
                  <>
                    Ship a product in{' '}
                    <span className="font-serif italic font-medium text-pink-500">
                      under 10 days.
                    </span>
                  </>
                }
                templates={quickLaunch}
                seeAllHref="/marketplace?sort=lead-time"
                className="mt-2"
              />
            </>
          )}

          {/* Newsletter signup */}
          <NewsletterCta />
        </main>
      </div>
    </>
  )
}

/* ============ subcomponents ============ */

function ResultsGrid({
  templates,
  resultCount,
}: {
  templates: SampleTemplate[]
  resultCount: number
}) {
  if (resultCount === 0) {
    return (
      <section className="mb-12 border border-dashed border-ink-200 rounded-2xl p-10 text-center">
        <div className="font-display text-2xl font-bold tracking-[-0.02em] mb-2">
          No templates match these filters.
        </div>
        <p className="text-[14px] text-ink-500 mb-4 max-w-[42ch] mx-auto">
          Try removing a filter from the sidebar, or clear all to browse the
          full catalog.
        </p>
      </section>
    )
  }

  return (
    <section className="mb-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
        {templates.map((t) => (
          <ProductCard key={t.slug} {...templateToCardProps(t)} />
        ))}
      </div>
    </section>
  )
}

function CategorySection({
  row,
}: {
  row: (typeof CATEGORY_ROWS)[number]
}) {
  const avgLead = Math.round(
    row.templates.reduce((sum, t) => sum + t.leadTimeDays, 0) / row.templates.length,
  )

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] mb-1">
            {row.title}
          </h2>
          <div className="text-[12px] text-ink-500 tabular-nums">
            {row.templates.length} templates · avg lead {avgLead}d
          </div>
        </div>
        <Link
          href={`/marketplace/${row.slug}`}
          className="text-[13px] font-semibold text-pink-700 hover:text-pink-600 whitespace-nowrap"
        >
          See all →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
        {row.templates.map((t: SampleTemplate) => (
          <ProductCard key={t.slug} {...templateToCardProps(t)} />
        ))}
      </div>
    </section>
  )
}

function NewsletterCta() {
  return (
    <section
      data-surface="dark"
      className="bg-ink-900 text-white rounded-2xl px-7 py-10 sm:px-10 sm:py-12 my-6 relative overflow-hidden"
    >
      <div
        className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-30 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, var(--color-pink-500) 0%, transparent 60%)',
        }}
      />
      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-center">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500 mb-2">
            Drop · weekly
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold leading-[1.1] tracking-[-0.025em] mb-2 max-w-[26ch] [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-pink-500">
            New templates, every <em>Tuesday</em>.
          </h2>
          <p className="text-ink-300 text-[14px] max-w-[44ch] leading-[1.55]">
            A short email when fresh templates land — bestsellers, new niches,
            limited-edition packaging drops.
          </p>
        </div>
        <form className="flex items-center gap-2" action="/api/newsletter">
          <input
            type="email"
            required
            placeholder="you@yourbrand.co"
            className="h-11 px-4 w-full sm:w-72 rounded-pill bg-white/10 border border-white/20 text-white text-[14px] placeholder:text-white/40 focus:outline-none focus:border-neon-500 focus:bg-white/15 transition-colors"
            aria-label="Email address"
          />
          <button
            type="submit"
            className="h-11 px-5 rounded-pill bg-neon-500 text-ink-900 text-[14px] font-bold hover:bg-neon-400 transition-colors whitespace-nowrap"
          >
            Subscribe
          </button>
        </form>
      </div>
    </section>
  )
}
