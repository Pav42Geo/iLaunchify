import Link from 'next/link'
import { Button } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { NICHES } from '@/lib/niches'

/**
 * Home — the iLaunchify front door.
 *
 * Ported 2026-05-28 from design/mood-board-landing.html ("Studio Pop") with
 * the locked WHITE MarketplaceHeader instead of the mood-board's cream/pink
 * nav. Sections (top → bottom):
 *
 *   1. Hero — mesh-gradient blobs + floating stickers + Bricolage/Fraunces
 *      headline + neon-highlighted "in days"
 *   2. Marquee — ink-900 ticker of niches/categories
 *   3. Stats — "By the numbers" with pink/neon/ink stat cards
 *   4. Niches dark section — 4 niche cards with radial-glow hover
 *   5. Editorial pull-quote — Fraunces italic at scale
 *   6. Final CTA — mesh blobs + "Ready when you are" Fraunces italic on
 *      "you" + giant pink pill
 *   7. Ink-900 footer
 *
 * The marketplace browse experience (product cards, categories) lives on
 * /marketplace. This page is pure brand identity.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>
}) {
  const { as } = await searchParams
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

  // Take the first 4 niches for the dark niche-card section.
  const featuredNiches = NICHES.slice(0, 4)

  return (
    <>
      <MarketplaceHeader
        user={demoUser}
        hasUnreadNotifications
        brands={demoBrands}
        activeBrandId="kindred"
      />

      {/* ============ HERO ============ */}
      <section className="relative min-h-[90vh] flex flex-col justify-center overflow-hidden px-6 sm:px-8 pt-16 pb-12 sm:pt-24 sm:pb-16">
        {/* Mesh gradient blobs */}
        <div
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden pointer-events-none"
        >
          <div
            className="mesh-blob"
            style={{ width: 540, height: 540, background: '#FF2E63', top: -120, left: -120 }}
          />
          <div
            className="mesh-blob"
            style={{ width: 480, height: 480, background: '#B5FF3D', top: 280, right: -160, animationDelay: '-6s' }}
          />
          <div
            className="mesh-blob"
            style={{ width: 420, height: 420, background: '#C9B6FF', bottom: -160, left: '30%', animationDelay: '-12s' }}
          />
          <div
            className="mesh-blob"
            style={{ width: 320, height: 320, background: '#FFE74C', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', animationDelay: '-3s' }}
          />
        </div>

        {/* Floating stickers */}
        <Sticker className="top-[120px] right-[6%] bg-neon-500 text-ink-900" rotation="5deg">
          +1,247 launches
        </Sticker>
        <Sticker className="top-[280px] right-[18%] bg-pink-500 text-white" rotation="-8deg" delay="-2s">
          USDA Organic ✓
        </Sticker>
        <Sticker className="bottom-[120px] right-[8%] bg-white border-[1.5px] border-ink-900 text-ink-900" rotation="6deg" delay="-4s">
          8-day avg lead time
        </Sticker>
        <Sticker
          className="top-[200px] left-[50%] text-ink-900"
          rotation="-4deg"
          delay="-1s"
          style={{ background: '#FFE74C' }}
        >
          ★ 4.9 partner trust
        </Sticker>

        {/* Hero content */}
        <div className="relative z-10 max-w-[1400px] mx-auto w-full">
          <div className="pop-in inline-flex items-center gap-2 bg-white border border-ink-200 px-4 py-2 rounded-pill text-[13px] font-medium mb-8">
            <span className="relative w-2 h-2 rounded-full bg-pink-500 pulse-dot" />
            <span>Now open to creators in the US</span>
          </div>

          <h1 className="font-display font-extrabold leading-[0.92] tracking-[-0.045em] max-w-[18ch] mb-8 text-[clamp(56px,9vw,144px)]">
            Launch{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
              your
            </span>{' '}
            brand{' '}
            <span
              className="inline-block bg-neon-500 px-2 rounded-md text-ink-900"
              style={{ transform: 'rotate(-1.5deg)' }}
            >
              in days,
            </span>{' '}
            not years.
          </h1>

          <p className="pop-in text-[clamp(17px,2vw,22px)] max-w-[56ch] leading-[1.55] text-ink-900/[0.78] mb-10" style={{ animationDelay: '200ms' }}>
            From recipe to packaging to shipped product — iLaunchify handles
            the entire production graph behind one quote, one timeline, one
            approval. Built for influencers, culinary creators, and brand
            launchers who refuse to wait.
          </p>

          <div className="pop-in flex flex-wrap items-center gap-4" style={{ animationDelay: '400ms' }}>
            <Button asChild variant="primary" size="lg">
              <Link href="/marketplace">Start your launch →</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ============ MARQUEE ============ */}
      <section
        data-surface="dark"
        className="relative bg-ink-900 text-white py-6 overflow-hidden border-t border-white/[0.06] border-b border-white/[0.06]"
      >
        <div className="marquee-track flex gap-12 whitespace-nowrap font-display font-bold tracking-[-0.025em] text-[clamp(28px,3.5vw,56px)]">
          {/* Two copies for seamless loop */}
          {[...Array(2)].map((_, copy) => (
            <div key={copy} className="flex gap-12 flex-shrink-0">
              <MarqueeItem>PROTEIN POWDERS</MarqueeItem>
              <MarqueeItem accent="pink">FUNCTIONAL DRINKS</MarqueeItem>
              <MarqueeItem>ADAPTOGEN BLENDS</MarqueeItem>
              <MarqueeItem accent="neon">COLD-PRESSED COFFEE</MarqueeItem>
              <MarqueeItem>SKINCARE LAUNCHES</MarqueeItem>
              <MarqueeItem accent="lemon">PET WELLNESS</MarqueeItem>
              <MarqueeItem>SNACK BARS</MarqueeItem>
              <MarqueeItem accent="pink">RTD COCKTAILS</MarqueeItem>
            </div>
          ))}
        </div>
      </section>

      {/* ============ STATS ============ */}
      <section className="max-w-[1400px] mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-4">
          By the numbers
        </div>
        <h2 className="font-display font-bold leading-[1.02] tracking-[-0.035em] mb-16 sm:mb-20 max-w-[18ch] text-[clamp(40px,5vw,72px)]">
          A platform built on{' '}
          <span className="font-serif italic font-medium">momentum.</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <StatCard variant="pink" number="1,247" label="Creator launches shipped in the last 12 months — and counting." />
          <StatCard variant="neon" number="312" label="Verified partners across manufacturing, label printing, co-packing, and logistics." />
          <StatCard variant="ink" number="8" unit="days" label='Average lead time from "Start Launching" to ready-to-ship.' />
        </div>
      </section>

      {/* ============ NICHES (dark) ============ */}
      <section
        data-surface="dark"
        className="bg-ink-900 text-white py-24 px-6 sm:px-8 rounded-t-[48px]"
      >
        <div className="max-w-[1400px] mx-auto">
          <h2 className="font-display font-bold leading-[0.95] tracking-[-0.04em] mb-16 max-w-[16ch] text-[clamp(40px,6vw,88px)]">
            Eight niches.{' '}
            <span className="font-serif italic font-medium text-neon-500">
              One marketplace.
            </span>{' '}
            Endless launches.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {featuredNiches.map((n, i) => (
              <NicheCard
                key={n.slug}
                slug={n.slug}
                icon={n.icon}
                name={n.shortName}
                tagline={n.tagline}
                glowColor={NICHE_GLOW_COLORS[i] ?? '#FF2E63'}
              />
            ))}
          </div>

          {/* See all niches link */}
          <div className="mt-10">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 text-[14px] font-semibold text-neon-500 hover:text-neon-400 transition-colors"
            >
              See all eight niches →
            </Link>
          </div>
        </div>
      </section>

      {/* ============ EDITORIAL QUOTE ============ */}
      <section className="bg-cream py-24 sm:py-32 px-6 sm:px-8">
        <div className="max-w-[1100px] mx-auto">
          <p className="font-serif italic font-normal leading-[1.15] tracking-[-0.02em] mb-8 text-[clamp(36px,5vw,64px)]">
            I launched{' '}
            <span
              className="inline-block bg-neon-500 px-3 rounded-lg not-italic font-display font-bold"
              style={{ transform: 'rotate(-1deg)' }}
            >
              three SKUs
            </span>{' '}
            in the time it used to take to get a single MOQ quote. iLaunchify
            replaced an entire ops team for me.
          </p>
          <div className="flex items-center gap-4 text-[15px]">
            <div
              className="w-14 h-14 rounded-full"
              style={{ background: 'linear-gradient(135deg, #FF2E63, #FFE74C)' }}
              aria-hidden="true"
            />
            <div>
              <strong className="font-semibold">Maya Reyes</strong>{' '}
              <span className="text-ink-700/65">
                · Culinary creator · 480k followers · Cold-pressed sauce brand
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="relative overflow-hidden text-center px-6 sm:px-8 py-32 sm:py-40">
        <div
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden pointer-events-none"
        >
          <div
            className="mesh-blob"
            style={{ width: 600, height: 600, background: '#FF2E63', top: '20%', left: '-100px' }}
          />
          <div
            className="mesh-blob"
            style={{ width: 500, height: 500, background: '#B5FF3D', top: '10%', right: '-80px', animationDelay: '-6s' }}
          />
          <div
            className="mesh-blob"
            style={{ width: 400, height: 400, background: '#C9B6FF', bottom: '-100px', left: '40%', animationDelay: '-12s' }}
          />
        </div>

        <div className="relative z-10 max-w-[900px] mx-auto">
          <h2 className="font-display font-extrabold leading-[0.92] tracking-[-0.045em] mb-8 text-[clamp(56px,9vw,144px)]">
            Ready when{' '}
            <span className="font-serif italic font-medium text-pink-500">
              you
            </span>{' '}
            are.
          </h2>
          <p className="text-[clamp(17px,2vw,22px)] text-ink-900/[0.78] mb-12 max-w-[54ch] mx-auto">
            Free to start. No setup fees. No commitment. Pick your first
            product, customize it in minutes, and we'll handle the rest.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-3 bg-pink-500 text-white px-10 py-6 rounded-pill font-semibold transition-all duration-base ease-out-quart hover:-translate-y-1 hover:scale-[1.03] text-[clamp(18px,2vw,24px)]"
            style={{ boxShadow: '0 20px 48px rgba(255, 46, 99, 0.4)' }}
          >
            Start launching →
          </Link>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer
        data-surface="dark"
        className="bg-ink-900 text-white px-6 sm:px-8 py-16 sm:py-20"
      >
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-wrap items-center gap-3 mb-12">
            <span className="w-7 h-7 rounded-md bg-pink-500" />
            <span className="font-display text-2xl font-extrabold tracking-[-0.04em]">
              iLaunchify
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
            <FooterCol title="Platform">
              <FooterLink href="/marketplace">Marketplace</FooterLink>
              <FooterLink href="/how-it-works">How it works</FooterLink>
              <FooterLink href="/pricing">Pricing</FooterLink>
            </FooterCol>
            <FooterCol title="Partners">
              <FooterLink href="/business">For partners</FooterLink>
              <FooterLink href="/contact-sales">Talk to sales</FooterLink>
            </FooterCol>
            <FooterCol title="Niches">
              {NICHES.slice(0, 4).map((n) => (
                <FooterLink key={n.slug} href={`/launch/${n.slug}`}>
                  {n.shortName}
                </FooterLink>
              ))}
            </FooterCol>
            <FooterCol title="Company">
              <FooterLink href="/terms">Terms</FooterLink>
              <FooterLink href="/privacy">Privacy</FooterLink>
            </FooterCol>
          </div>

          <div className="pt-8 border-t border-white/[0.08] text-[13px] text-white/50">
            © 2026 iLaunchify · Built on the locked design system
          </div>
        </div>
      </footer>
    </>
  )
}

/* ============ subcomponents ============ */

function Sticker({
  children,
  className,
  rotation,
  delay,
  style,
}: {
  children: React.ReactNode
  className?: string
  rotation: string
  delay?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={
        'sticker hidden md:block absolute rounded-2xl px-4 py-3 font-semibold text-[14px] z-20 ' +
        (className ?? '')
      }
      style={
        {
          '--rot': rotation,
          animationDelay: delay,
          boxShadow: '0 12px 30px rgba(13, 7, 23, 0.12)',
          ...style,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}

function MarqueeItem({
  children,
  accent,
}: {
  children: React.ReactNode
  accent?: 'pink' | 'neon' | 'lemon'
}) {
  const inlineColor =
    accent === 'lemon' ? '#FFE74C' : undefined
  const colorClass =
    accent === 'pink'
      ? 'text-pink-500'
      : accent === 'neon'
        ? 'text-neon-500'
        : ''
  const dotBg =
    accent === 'pink'
      ? '#B5FF3D'
      : accent === 'neon'
        ? '#FFE74C'
        : accent === 'lemon'
          ? '#FF2E63'
          : '#FF2E63'
  return (
    <span
      className={'inline-flex items-center gap-8 ' + colorClass}
      style={inlineColor ? { color: inlineColor } : undefined}
    >
      {children}
      <span
        aria-hidden="true"
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ background: dotBg }}
      />
    </span>
  )
}

function StatCard({
  variant,
  number,
  unit,
  label,
}: {
  variant: 'pink' | 'neon' | 'ink'
  number: string
  unit?: string
  label: string
}) {
  const cls =
    variant === 'pink'
      ? 'bg-pink-500 text-white'
      : variant === 'neon'
        ? 'bg-neon-500 text-ink-900'
        : 'bg-ink-900 text-white'
  return (
    <div className={'p-10 rounded-3xl transition-transform duration-base ease-out-quart hover:-translate-y-1.5 ' + cls}>
      <div className="font-display font-extrabold leading-none tracking-[-0.045em] mb-4 text-[clamp(56px,7vw,96px)]">
        {number}
        {unit && (
          <span className="text-[0.55em] font-semibold opacity-70 ml-2">
            {unit}
          </span>
        )}
      </div>
      <div className="text-[16px] font-medium leading-[1.4] opacity-90">
        {label}
      </div>
    </div>
  )
}

const NICHE_GLOW_COLORS = ['#FF2E63', '#B5FF3D', '#C9B6FF', '#FFE74C']

function NicheCard({
  slug,
  icon,
  name,
  tagline,
  glowColor,
}: {
  slug: string
  icon: string
  name: string
  tagline: string
  glowColor: string
}) {
  return (
    <Link
      href={`/launch/${slug}`}
      className="group relative bg-ink-800 border border-white/[0.08] rounded-3xl p-6 overflow-hidden aspect-[3/4] flex flex-col justify-between transition-all duration-base ease-out-quart hover:-translate-y-1 hover:border-pink-500"
    >
      {/* Radial glow blob */}
      <span
        aria-hidden="true"
        className="absolute rounded-full opacity-70 transition-transform duration-[600ms] ease-out-quart group-hover:scale-[1.4]"
        style={{
          width: 200,
          height: 200,
          background: glowColor,
          filter: 'blur(40px)',
          top: -40,
          right: -40,
        }}
      />
      <span
        className="relative w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="relative">
        <div className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.025em] mb-2 whitespace-pre-line">
          {name}
        </div>
        <div className="text-[13px] text-white/70">{tagline}</div>
      </div>
    </Link>
  )
}

function FooterCol({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500 mb-4">
        {title}
      </div>
      <ul className="space-y-2.5 text-[14px] text-white/80">{children}</ul>
    </div>
  )
}

function FooterLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <li>
      <Link href={href} className="hover:text-white transition-colors">
        {children}
      </Link>
    </li>
  )
}
