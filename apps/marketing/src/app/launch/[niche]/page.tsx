import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductCard, productGradient, Button } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { loadActiveNiches, loadNicheBySlug } from '@/lib/niches-db'
import { getNicheProductCards, getNicheSubcategoryCards } from '@/lib/niche-content-db'

/**
 * /launch/[niche] — Niche landing page.
 *
 * Slice 2B (2026-06-02): switched from hardcoded `findNiche()` to the
 * DB-driven `loadNicheBySlug()` loader. The page now also surfaces:
 *  - the niche's NicheSubcategory junction rows as a chip grid (linking
 *    into the marketplace category/subcategory routes).
 *  - sample ProductTemplate rows tagged with this niche.
 *
 * The MarketplaceNiche shape returned by the loader preserves every prop
 * this page previously read off the hardcoded entry (name, tagline,
 * description, icon, gradient, shortName) so the hero markup is untouched.
 */
export default async function NicheLandingPage({
  params,
}: {
  params: Promise<{ niche: string }>
}) {
  const { niche: slug } = await params
  const niche = await loadNicheBySlug(slug)
  if (!niche) notFound()

  const [subcategories, sampleProducts] = await Promise.all([
    getNicheSubcategoryCards(niche.subcategorySlugs),
    getNicheProductCards(slug, 12),
  ])

  return (
    <>
      <MarketplaceHeader activeNiche={niche.slug} />

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* No Home crumb — Marketplace is the root for this funnel. */}
        <div className="text-[13px] text-ink-500 mb-4">
          <Link href="/marketplace" className="hover:text-ink-900">
            Marketplace
          </Link>{' '}
          › <span>{niche.name}</span>
        </div>

        {/* HERO */}
        <section className="relative overflow-hidden rounded-2xl mb-12">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: productGradient[niche.gradient] }}
          />
          <div className="relative z-[1] px-8 py-14 sm:py-20 flex flex-col items-start max-w-3xl">
            <span
              className="text-7xl leading-none mb-6"
              style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.12))' }}
              aria-hidden="true"
            >
              {niche.icon}
            </span>
            <h1 className="font-display text-5xl sm:text-6xl font-extrabold leading-[0.95] tracking-[-0.035em] text-ink-900 mb-4">
              {niche.name}
            </h1>
            <p className="font-serif italic text-2xl sm:text-3xl text-ink-700 mb-6 leading-tight">
              {niche.tagline}
            </p>
            <p className="text-[15px] text-ink-700 leading-relaxed max-w-[56ch] mb-8">
              {niche.description}
            </p>
            {/* Carry niche through so the marketplace context is preserved. */}
            <Button variant="primary" size="lg" asChild>
              <Link href={`/marketplace?niche=${niche.slug}`}>
                Browse {niche.shortName.toLowerCase()} on the marketplace →
              </Link>
            </Button>
          </div>
        </section>

        {/* SUBCATEGORIES — DB-driven (NicheSubcategory junction). When the
            niche has no surfaced subcategories yet, hide the section
            entirely (cleaner than a bunch of "Coming soon" placeholders). */}
        {subcategories.length > 0 && (
          <section className="mb-12">
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em] mb-5">
              Subcategories
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {subcategories.map((sub) => (
                <Link
                  key={sub.slug}
                  href={`/marketplace/${sub.categorySlug}/${sub.slug}`}
                  className="text-left p-4 rounded-lg border border-ink-200 bg-white hover:border-pink-500 transition-colors"
                >
                  <div className="font-semibold text-[15px] text-ink-900">{sub.name}</div>
                  <div className="text-[12px] text-ink-500 mt-1">
                    in {sub.categoryName}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* CURATED FEED — DB-driven via ProductTemplateNiche junction. */}
        {sampleProducts.length > 0 && (
          <section className="mb-16">
            <header className="flex items-baseline justify-between mb-5">
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">
                Curated for {niche.shortName.toLowerCase()}
              </h2>
              <Link
                href={`/marketplace?niche=${niche.slug}`}
                className="text-[13px] font-semibold text-pink-700 hover:text-pink-600"
              >
                See all →
              </Link>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {sampleProducts.map((t) => (
                <ProductCard key={t.href} {...t} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

/**
 * Pre-generate routes for the LOCKED 8 niches. We read the hardcoded list
 * here (not the DB loader) because generateStaticParams runs at build time
 * and shouldn't hit the database. The DB loader runs at request time and
 * picks up any custom niches Pavel adds via admin CRUD.
 */
export async function generateStaticParams() {
  const niches = await loadActiveNiches()
  return niches.map((n) => ({ niche: n.slug }))
}
