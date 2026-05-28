import Link from 'next/link'
import { ProductCard, HeroBanner, Button, Chip } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { MarketplaceFilters } from '@/components/MarketplaceFilters'
import { CATEGORY_ROWS, templateToCardProps } from '@/lib/sample-templates'

/**
 * /marketplace — the creator marketplace.
 *
 * Built from real @ilaunchify/ui components. Composition follows the locked
 * MARKETPLACE_DESIGN.md layout: white header + niche subnav + filter sidebar +
 * dark HeroBanner island + active-filter chip row + category rows of
 * ProductCards.
 */
export default function MarketplacePage() {
  return (
    <>
      <MarketplaceHeader />

      <div className="max-w-[1400px] mx-auto px-6 py-6 grid gap-7 items-start grid-cols-1 md:grid-cols-[240px_1fr]">
        <div className="text-[13px] text-ink-500 md:col-span-2">
          <Link href="/" className="hover:text-ink-900">
            Home
          </Link>{' '}
          › <span>Marketplace</span>
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
            className="mb-9"
          >
            <Button variant="secondary" asChild>
              <Link href="/products/new">Start launching →</Link>
            </Button>
          </HeroBanner>

          <div className="flex items-center gap-2 flex-wrap mb-6">
            <Chip active removable>
              Vegan
            </Chip>
            <Chip active removable>
              Powder
            </Chip>
            <button className="text-[13px] text-ink-500 hover:text-ink-900">
              Clear all
            </button>
          </div>

          {CATEGORY_ROWS.map((row) => (
            <section key={row.slug} className="mb-11">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">
                  {row.title}
                </h2>
                <Link
                  href={`/marketplace/${row.slug}`}
                  className="text-[13px] font-semibold text-pink-700 hover:text-pink-600"
                >
                  See all →
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                {row.templates.map((t) => (
                  <ProductCard key={t.slug} {...templateToCardProps(t)} />
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </>
  )
}
