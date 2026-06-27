import Link from 'next/link'
import { Button } from '@ilaunchify/ui'
import { LandingHeader } from '@/components/LandingHeader'
import { LandingFooter } from '@/components/LandingFooter'
import { Reveal } from '@/components/Reveal'
import { NICHES } from '@/lib/niches'
import { getMarketingSession, headerPropsFromSession } from '@/lib/session'

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
// Hero spatial graphic (light surface) — a loose constellation of iLaunchify
// product tiles floating at varied depths with faint connectors. Brand-colored,
// playful "your products, launching" cluster; enlarges as a right-side bg.
function LaunchTile({ x, y, s, fill, glyph, dur, begin }: { x: number; y: number; s: number; fill: string; glyph: string; dur: string; begin: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -10;0 0" dur={dur} begin={begin} repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
        <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * 0.24} fill={fill} />
        <g transform={`scale(${s / 110})`} stroke={glyph} strokeWidth="6" fill="none" strokeLinejoin="round" strokeLinecap="round">
          <path d="M0 -16 L18 -6 L0 4 L-18 -6 Z" />
          <path d="M-18 2 L0 12 L18 2" />
          <path d="M-18 10 L0 20 L18 10" />
        </g>
      </g>
    </g>
  )
}

function LaunchField() {
  return (
    <svg viewBox="0 0 560 480" className="h-auto w-full" role="img" aria-label="iLaunchify product tiles launching">
      <g stroke="#18181A" strokeWidth="1.5" strokeDasharray="3 7" opacity="0.16" fill="none">
        <line x1="190" y1="160" x2="370" y2="120" />
        <line x1="370" y1="120" x2="440" y2="270" />
        <line x1="190" y1="160" x2="120" y2="340" />
        <line x1="120" y1="340" x2="300" y2="310" />
        <line x1="300" y1="310" x2="440" y2="270" />
      </g>
      <LaunchTile x={190} y={160} s={96} fill="#FF2E63" glyph="#FFFFFF" dur="5s" begin="0s" />
      <LaunchTile x={370} y={120} s={74} fill="#B5FF3D" glyph="#18181A" dur="6s" begin="-1.5s" />
      <LaunchTile x={440} y={270} s={62} fill="#C9B6FF" glyph="#18181A" dur="5.5s" begin="-3s" />
      <LaunchTile x={120} y={340} s={66} fill="#FFE74C" glyph="#18181A" dur="6.5s" begin="-2s" />
      <LaunchTile x={300} y={310} s={58} fill="#18181A" glyph="#B5FF3D" dur="5.2s" begin="-4s" />
    </svg>
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, never>>
}) {
  await searchParams
  const session = await getMarketingSession()
  const { user, brands, activeBrandId } = headerPropsFromSession(session)

  // Take the first 4 niches for the dark niche-card section.
  const featuredNiches = NICHES.slice(0, 4)

  return (
    <>
      <LandingHeader
        user={user}
        brands={brands}
        activeBrandId={activeBrandId}
        hasUnreadNotifications={false}
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

        {/* Spatial product-tile field — right-anchored, faded; enlarges as bg */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[52%] items-center justify-end lg:flex"
          style={{
            maskImage: 'linear-gradient(to right, transparent, #000 42%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, #000 42%)',
          }}
        >
          <LaunchField />
        </div>


        {/* Hero content */}
        <div className="relative z-10 max-w-[1400px] mx-auto w-full">
          <div className="pop-in inline-flex items-center gap-2 bg-white border border-ink-200 px-4 py-2 rounded-pill text-[13px] font-medium mb-8">
            <span className="relative w-2 h-2 rounded-full bg-pink-500 pulse-dot" />
            <span>Cohort 1 applications open · US-only</span>
          </div>

          <h1 className="font-display font-extrabold leading-[0.95] tracking-[-0.04em] max-w-[15ch] mb-7 text-[calc(clamp(40px,5.2vw,80px)*var(--landing-heading-scale))]">
            Launch{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
              your
            </span>{' '}
            CPG brand{' '}
            <span
              className="inline-block bg-neon-500 px-2 rounded-md text-ink-900"
              style={{ transform: 'rotate(-1.5deg)' }}
            >
              in days,
            </span>{' '}
            not years.
          </h1>

          <p className="pop-in text-[calc(clamp(17px,2vw,22px)*var(--landing-deck-scale))] max-w-[56ch] leading-[1.55] text-ink-900/[0.78] mb-10" style={{ animationDelay: '200ms' }}>
            Pick a starter template. Customize the label. We orchestrate every
            manufacturer, label printer, co-packer, and warehouse behind one
            timeline and one quote — so you launch a real CPG brand without
            becoming a CPG operator. Built for influencers and indie operators
            who already have an audience but not an ops team.
          </p>

          <div className="pop-in flex flex-wrap items-center gap-4" style={{ animationDelay: '400ms' }}>
            <Button asChild variant="primary" size="lg">
              <Link href="/marketplace">Browse the marketplace →</Link>
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
              <MarqueeItem>ELECTROLYTE MIXES</MarqueeItem>
              <MarqueeItem accent="lemon">PET WELLNESS</MarqueeItem>
              <MarqueeItem>SNACK BARS</MarqueeItem>
              <MarqueeItem accent="pink">RTD COCKTAILS</MarqueeItem>
            </div>
          ))}
        </div>
      </section>

      {/* ============ STATS ============ */}
      <Reveal>
      <section className="max-w-[1400px] mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-4">
          What&apos;s wired
        </div>
        <h2 className="font-display font-bold leading-[1.02] tracking-[-0.035em] mb-16 sm:mb-20 max-w-[18ch] text-[clamp(40px,5vw,72px)]">
          A platform built on{' '}
          <span className="font-serif italic font-medium">architecture, not adjectives.</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <StatCard variant="pink" number="4" label="Partner types orchestrated per order: manufacturer, label printer, co-packer, warehouse." />
          <StatCard variant="neon" number="8" label="Locked creator niches across functional food, beverage, supplement, and pet." />
          <StatCard variant="ink" number="13" label="Curated product categories. One taxonomy. Zero free-text fields." />
        </div>
      </section>
      </Reveal>

      {/* ============ NICHES (dark) ============ */}
      <Reveal>
      <section
        data-surface="dark"
        className="bg-[var(--landing-surface-dark)] text-white py-[var(--landing-section-py)] px-6 sm:px-8 rounded-t-[48px]"
      >
        <div className="max-w-[1400px] mx-auto">
          <h2 className="font-display font-bold leading-[0.95] tracking-[-0.04em] mb-16 max-w-[16ch] text-[clamp(40px,6vw,88px)]">
            Eight niches.{' '}
            <span className="font-serif italic font-medium text-neon-500">
              One marketplace.
            </span>{' '}
            Pick a starter and go.
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
      </Reveal>

      {/* ============ EDITORIAL QUOTE ============ */}
      <Reveal>
      <section className="bg-white py-24 sm:py-32 px-6 sm:px-8">
        <div className="max-w-[1100px] mx-auto">
          <p className="font-serif italic font-normal leading-[1.15] tracking-[-0.02em] mb-8 text-[clamp(36px,5vw,64px)]">
            Each order decomposes into a workflow graph across manufacturer,
            label printer, co-packer, and warehouse. The platform resolves the
            constraints; the creator sees{' '}
            <span
              className="inline-block bg-neon-500 px-3 rounded-lg not-italic font-display font-bold"
              style={{ transform: 'rotate(-1deg)' }}
            >
              one timeline.
            </span>
          </p>
          <div className="flex items-center gap-4 text-[15px]">
            <div>
              <span className="text-ink-700/65">
                — From the iLaunchify orchestration thesis (Pavel, 2026-05-26)
              </span>
            </div>
          </div>
        </div>
      </section>
      </Reveal>

      {/* ============ FINAL CTA ============ */}
      <Reveal>
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
            Maker is free forever. Your card isn&apos;t charged until every
            partner confirms they can deliver your run. Pick a starter template
            and start customizing.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-3 bg-pink-500 text-white px-10 py-6 rounded-pill font-semibold transition-all duration-base ease-out-quart hover:-translate-y-1 hover:scale-[1.03] text-[clamp(18px,2vw,24px)]"
            style={{ boxShadow: '0 20px 48px rgba(255, 46, 99, 0.4)' }}
          >
            Browse the marketplace →
          </Link>
        </div>
      </section>
      </Reveal>

      <LandingFooter />
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

