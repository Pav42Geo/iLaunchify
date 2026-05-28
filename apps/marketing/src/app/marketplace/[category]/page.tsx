import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductCard, Chip } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { MarketplaceFilters } from '@/components/MarketplaceFilters'
import { CATEGORY_ROWS, templateToCardProps } from '@/lib/sample-templates'

/**
 * /marketplace/[category] — the "See all →" destination from each category row.
 *
 * Renders the same shell as /marketplace but with a single category-scoped
 * grid of all templates in that category. Per MARKETPLACE_DESIGN.md §6 the
 * page also surfaces subcategory cards above the grid; for V1 demo we skip
 * subcategory routing and show all templates flat.
 */
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  const row = CATEGORY_ROWS.find((r) => r.slug === category)
  if (!row) notFound()

  return (
    <>
      <MarketplaceHeader />

      <div className="max-w-[1400px] mx-auto px-6 py-6 grid gap-7 items-start grid-cols-1 md:grid-cols-[240px_1fr]">
        <div className="text-[13px] text-ink-500 md:col-span-2">
          <Link href="/" className="hover:text-ink-900">
            Home
          </Link>{' '}
          ›{' '}
          <Link href="/marketplace" className="hover:text-ink-900">
            Marketplace
          </Link>{' '}
          › <span>{row.title}</span>
        </div>

        <MarketplaceFilters />

        <main className="flex flex-col">
          <header className="mb-8">
            <h1 className="font-display text-4xl font-bold tracking-[-0.025em] mb-2">
              {row.title}
            </h1>
            <p className="text-ink-600 text-[15px]">
              {row.templates.length} templates · curated for the US market
            </p>
          </header>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
            {row.templates.map((t) => (
              <ProductCard key={t.slug} {...templateToCardProps(t)} />
            ))}
          </div>
        </main>
      </div>
    </>
  )
}

export async function generateStaticParams() {
  return CATEGORY_ROWS.map((row) => ({ category: row.slug }))
}
