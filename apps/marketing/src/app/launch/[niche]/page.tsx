import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductCard, productGradient, Button } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { NICHES, findNiche } from '@/lib/niches'
import { CATEGORY_ROWS, templateToCardProps } from '@/lib/sample-templates'

/**
 * /launch/[niche] — Niche landing page.
 *
 * Per OOUX_OBJECT_MAP.md §2.7 a Niche page = hero + curated ProductTemplate
 * feed scoped to this niche. For V1 demo we surface all sample templates as
 * "curated for this niche" (real filtering arrives when CreatorNiche schema
 * + many-to-many template tagging lands per MARKETPLACE_DESIGN.md §11).
 */
export default async function NicheLandingPage({
  params,
}: {
  params: Promise<{ niche: string }>
}) {
  const { niche: slug } = await params
  const niche = findNiche(slug)
  if (!niche) notFound()

  // For V1 demo: pull a handful of templates across categories.
  const curated = CATEGORY_ROWS.flatMap((r) => r.templates).slice(0, 10)

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

        {/* SUBCATEGORIES */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] mb-5">
            Subcategories
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {niche.subcategories.map((sub) => (
              <button
                key={sub}
                className="text-left p-4 rounded-lg border border-ink-200 bg-white hover:border-pink-500 transition-colors"
              >
                <div className="font-semibold text-[15px] text-ink-900">{sub}</div>
                <div className="text-[12px] text-ink-500 mt-1">Coming soon</div>
              </button>
            ))}
          </div>
        </section>

        {/* CURATED FEED */}
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
            {curated.map((t) => (
              <ProductCard key={t.slug} {...templateToCardProps(t)} />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

export async function generateStaticParams() {
  return NICHES.map((n) => ({ niche: n.slug }))
}
