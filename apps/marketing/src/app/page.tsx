import Link from 'next/link'
import { Button, productGradient, ProductCard } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { NICHES } from '@/lib/niches'
import { CATEGORY_ROWS, templateToCardProps } from '@/lib/sample-templates'

/**
 * Marketing home — the creator-facing front door.
 *
 * Light surface (inherits from root layout). Aspirational hero with mixed
 * Bricolage + Fraunces italic emphasis, niche cards grid that links into
 * /launch/[niche], and a featured-templates preview that links into
 * /marketplace.
 *
 * Distinct from /business which lives on the dark surface — the home page
 * speaks to creators (the demand side of the marketplace).
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>
}) {
  const { as } = await searchParams
  // V1 demo: `?as=user` previews the logged-in experience (avatar + bell +
  // heart instead of Sign-in/Start-launching). Real session lands later.
  const isAuthenticated = as === 'user'
  const demoUser = isAuthenticated
    ? {
        name: 'Alex Chen',
        email: 'alex@kindredwellness.co',
        tier: 'maker' as const,
        activeBrandName: 'Kindred Wellness',
      }
    : null
  const demoBrands = isAuthenticated
    ? [
        { id: 'kindred', name: 'Kindred Wellness', colorHex: '#FF2E63' },
        { id: 'lumen', name: 'Lumen Daily', colorHex: '#7BA05B' },
        { id: 'after-hours', name: 'After Hours Coffee', colorHex: '#5A3825' },
      ]
    : []
  const featured = CATEGORY_ROWS.flatMap((r) => r.templates).slice(0, 5)

  return (
    <>
      <MarketplaceHeader
        user={demoUser}
        hasUnreadNotifications
        brands={demoBrands}
        activeBrandId="kindred"
      />

      {/* HERO */}
      <section className="max-w-[1400px] mx-auto px-6 pt-16 pb-20 sm:pt-20 sm:pb-24">
        <div className="inline-block text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-6">
          Now open · Free to start
        </div>
        <h1 className="font-display text-5xl sm:text-7xl md:text-[88px] font-extrabold leading-[0.95] tracking-[-0.04em] max-w-[18ch] mb-8">
          Launch your brand,{' '}
          <span className="font-serif italic font-medium text-pink-500 tracking-[-0.03em]">
            in days,
          </span>{' '}
          not years.
        </h1>
        <p className="text-lg sm:text-xl text-ink-700 max-w-[60ch] leading-[1.55] mb-10">
          A platform for influencers, culinary creators, and brand launchers. Browse
          curated, production-ready templates. Customize the label. We handle
          manufacturing, printing, and fulfillment.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" asChild>
            <Link href="/marketplace">Browse the marketplace →</Link>
          </Button>
          <Button variant="ghost" size="lg" asChild>
            <Link href="/business">For partners →</Link>
          </Button>
        </div>
      </section>

      {/* NICHE GRID */}
      <section className="max-w-[1400px] mx-auto px-6 py-16">
        <header className="flex items-baseline justify-between mb-7">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-2">
              Eight niches
            </div>
            <h2 className="font-display text-4xl font-bold tracking-[-0.025em]">
              Find the lane{' '}
              <span className="font-serif italic font-medium text-pink-500 tracking-[-0.02em]">
                you're already in.
              </span>
            </h2>
          </div>
          <Link
            href="/marketplace"
            className="text-sm font-semibold text-pink-700 hover:text-pink-600 hidden sm:inline"
          >
            See all categories →
          </Link>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {NICHES.map((n) => (
            <Link
              key={n.slug}
              href={`/launch/${n.slug}`}
              className="group relative overflow-hidden rounded-xl border border-ink-200 aspect-[5/6] flex flex-col justify-between p-5 transition-[transform,border-color,box-shadow] duration-base ease-out-quart hover:-translate-y-1 hover:border-ink-300 hover:shadow-lg"
              style={{ background: productGradient[n.gradient] }}
            >
              <span
                className="text-5xl leading-none"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.10))' }}
                aria-hidden="true"
              >
                {n.icon}
              </span>
              <div>
                <div className="font-display text-2xl font-bold leading-[1.05] tracking-[-0.02em] text-ink-900 mb-1">
                  {n.shortName}
                </div>
                <div className="text-[13px] text-ink-700 leading-[1.4]">{n.tagline}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURED TEMPLATES */}
      <section className="max-w-[1400px] mx-auto px-6 py-16">
        <header className="flex items-baseline justify-between mb-7">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-2">
              Featured this month
            </div>
            <h2 className="font-display text-4xl font-bold tracking-[-0.025em]">
              Production-ready{' '}
              <span className="font-serif italic font-medium text-pink-500 tracking-[-0.02em]">
                from day one.
              </span>
            </h2>
          </div>
          <Link
            href="/marketplace"
            className="text-sm font-semibold text-pink-700 hover:text-pink-600"
          >
            See all →
          </Link>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
          {featured.map((t) => (
            <ProductCard key={t.slug} {...templateToCardProps(t)} />
          ))}
        </div>
      </section>

      {/* DARK CTA ISLAND — single dark accent on the otherwise light home */}
      <section data-surface="dark" className="bg-ink-900 text-white">
        <div className="max-w-[1400px] mx-auto px-6 py-24 text-center">
          <h2 className="font-display text-4xl sm:text-6xl font-extrabold leading-[0.95] tracking-[-0.035em] mb-5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500">
            Ready when <em>you</em> are.
          </h2>
          <p className="text-ink-300 text-lg max-w-[50ch] mx-auto mb-9">
            Free to start. No commitment. Pick your first product, customize the label,
            and launch.
          </p>
          <Button variant="neon" size="lg" asChild>
            <Link href="/marketplace">Browse the marketplace →</Link>
          </Button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="max-w-[1400px] mx-auto px-6 py-12 flex flex-wrap items-center justify-between gap-4 border-t border-ink-200 mt-0">
        <Link href="/" className="flex items-center gap-[7px]">
          <span className="w-[26px] h-[26px] rounded-md bg-pink-500" />
          <span className="font-display text-lg font-extrabold tracking-[-0.04em] text-ink-900">
            iLaunchify
          </span>
        </Link>
        <div className="flex items-center gap-6 text-[13px] text-ink-500">
          <Link href="/marketplace" className="hover:text-ink-900">
            Marketplace
          </Link>
          <Link href="/pricing" className="hover:text-ink-900">
            Pricing
          </Link>
          <Link href="/business" className="hover:text-ink-900">
            For partners
          </Link>
          <span>© 2026 iLaunchify</span>
        </div>
      </footer>
    </>
  )
}
