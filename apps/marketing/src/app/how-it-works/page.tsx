import Link from 'next/link'
import {
  ArrowRight,
  ShoppingBag,
  Wand2,
  ShieldCheck,
  Truck,
  Factory,
  Printer,
  Boxes,
  Warehouse,
  Globe,
  Lock,
  Sparkles,
} from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'

/**
 * /how-it-works — the trust-building page between home and signup.
 *
 * Explains the iLaunchify model without revealing implementation depth:
 *   1. Hero: positioning + headline promise
 *   2. Creator journey (4 steps) — the visible flow
 *   3. "Behind the scenes" — gentle reveal of the orchestration graph that
 *      coordinates manufacturer + printer + co-packer + warehouse on the
 *      creator's behalf (per [[ilaunchify-orchestration-thesis]])
 *   4. Production network — the partner tier model (Verified → Trusted →
 *      Premier) framed as quality assurance, not bureaucracy
 *   5. Compliance built-in — FDA label rendering as platform feature
 *   6. Trust signals — payment held, money-back, vetted partners
 *   7. Final CTA
 *
 * Creator surface → white header + cream body. Standalone deep page; the
 * home page links here from the niche grid header.
 */
export default async function HowItWorksPage({
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

  return (
    <>
      <MarketplaceHeader user={demoUser} hasUnreadNotifications={false} />

      {/* HERO */}
      <section className="max-w-[1200px] mx-auto px-6 pt-16 pb-12 sm:pt-20">
        <div className="text-center max-w-[20ch] mx-auto">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-3">
            How it works
          </div>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-extrabold leading-[0.95] tracking-[-0.035em] mb-5">
            From idea to{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
              shelf-ready,
            </span>{' '}
            without the supply-chain headache.
          </h1>
        </div>
        <p className="text-lg sm:text-xl text-ink-700 max-w-[60ch] mx-auto leading-[1.55] text-center mt-6">
          You pick a template, customize the label, approve a sample. We
          orchestrate every manufacturer, printer, co-packer, and warehouse
          behind the scenes — so you ship a real product without becoming a
          procurement specialist.
        </p>
      </section>

      {/* 4-STEP JOURNEY */}
      <section className="bg-cream border-y border-ink-200">
        <div className="max-w-[1200px] mx-auto px-6 py-20">
          <div className="mb-12 max-w-[40ch]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-2">
              Your side
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.025em] leading-[1]">
              Four steps you{' '}
              <span className="font-serif italic font-medium text-pink-500 tracking-[-0.02em]">
                actually see.
              </span>
            </h2>
          </div>

          <ol className="grid grid-cols-1 lg:grid-cols-4 gap-3 lg:gap-4">
            {CREATOR_STEPS.map((s, i) => (
              <li
                key={s.title}
                className="bg-white border border-ink-200 rounded-2xl p-6 flex flex-col"
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="font-display text-3xl font-extrabold text-ink-300 tabular-nums tracking-[-0.02em] leading-none">
                    0{i + 1}
                  </span>
                  <span className="w-11 h-11 rounded-pill bg-ink-900 flex items-center justify-center">
                    <s.icon strokeWidth={2} className="w-5 h-5 text-neon-500" />
                  </span>
                </div>
                <h3 className="font-display text-[19px] font-bold leading-tight tracking-[-0.01em] text-ink-900 mb-2">
                  {s.title}
                </h3>
                <p className="text-[13.5px] text-ink-600 leading-[1.55] mb-4 flex-1">
                  {s.description}
                </p>
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-pink-700 pt-3 border-t border-ink-100">
                  {s.duration}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* HIDDEN ORCHESTRATION */}
      <section className="bg-ink-900 text-white" data-surface="dark">
        <div className="max-w-[1200px] mx-auto px-6 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500 mb-3">
                Our side
              </div>
              <h2 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1] tracking-[-0.03em] mb-5 max-w-[16ch]">
                What happens{' '}
                <span className="font-serif italic font-medium text-pink-500 tracking-[-0.02em]">
                  while you sleep.
                </span>
              </h2>
              <p className="text-ink-300 text-lg leading-[1.55] mb-6 max-w-[50ch]">
                Each launch is a graph: a manufacturer formulates the recipe, a
                printer produces the labels, a co-packer assembles the SKU, a
                warehouse fulfills the orders. We coordinate the handoffs.
              </p>
              <p className="text-ink-300 text-lg leading-[1.55] mb-8 max-w-[50ch]">
                You see one timeline. We run the orchestra.
              </p>
              <ul className="space-y-3 text-[14px]">
                {ORCH_BULLETS.map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <span className="text-neon-500 flex-shrink-0 mt-0.5">▸</span>
                    <span className="text-white/85">{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Stylized orchestration graphic */}
            <div className="relative">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Factory, label: 'Manufacturer', sub: 'Spray-dry · QC' },
                  { icon: Printer, label: 'Printer', sub: 'CMYK · Die-cut' },
                  { icon: Boxes, label: 'Co-packer', sub: 'Assembly · Pack-out' },
                  { icon: Warehouse, label: 'Warehouse', sub: 'Inventory · Ship' },
                ].map((node) => (
                  <div
                    key={node.label}
                    className="bg-white/5 border border-white/15 rounded-xl p-5 backdrop-blur-sm"
                  >
                    <div className="w-10 h-10 rounded-pill bg-pink-500/15 border border-pink-500/30 flex items-center justify-center mb-3">
                      <node.icon strokeWidth={2} className="w-4 h-4 text-pink-500" />
                    </div>
                    <div className="font-display text-[15px] font-bold tracking-[-0.005em]">
                      {node.label}
                    </div>
                    <div className="text-[12px] text-white/60 mt-0.5">{node.sub}</div>
                  </div>
                ))}
              </div>
              {/* Central orchestrator node */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="w-20 h-20 rounded-pill bg-pink-500 flex items-center justify-center shadow-2xl ring-8 ring-ink-900">
                  <span className="w-3 h-3 rounded-pill bg-white" />
                </div>
                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.1em] whitespace-nowrap text-white/70">
                  iLaunchify
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCTION NETWORK */}
      <section className="max-w-[1200px] mx-auto px-6 py-24">
        <div className="text-center max-w-[28ch] mx-auto mb-12">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-3">
            Vetted production network
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.025em] leading-[1]">
            Three tiers of{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.02em]">
              proven.
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PARTNER_TIERS.map((t) => (
            <div
              key={t.name}
              className="bg-white border border-ink-200 rounded-2xl p-6 flex flex-col relative overflow-hidden"
            >
              {t.highlight && (
                <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-[0.07em] bg-neon-500 text-ink-900 px-2 py-0.5 rounded-pill">
                  Top tier
                </span>
              )}
              <div className="font-display text-2xl font-bold tracking-[-0.015em] text-ink-900 mb-2">
                {t.name}
              </div>
              <div className="text-[13px] text-ink-500 mb-5 leading-snug">
                {t.gateline}
              </div>
              <ul className="space-y-2 text-[13.5px] text-ink-700 leading-[1.45]">
                {t.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="text-pink-500 flex-shrink-0 font-bold">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 max-w-[60ch] mx-auto text-center text-[14px] text-ink-600 leading-[1.6]">
          Every partner goes through a five-layer onboarding — identity,
          capability, operational standards, commercial terms, integration —
          before they touch a single creator order.
        </div>
      </section>

      {/* COMPLIANCE + TRUST GRID */}
      <section className="bg-cream border-y border-ink-200">
        <div className="max-w-[1200px] mx-auto px-6 py-20">
          <div className="text-center max-w-[32ch] mx-auto mb-12">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-3">
              Built-in protections
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.025em] leading-[1]">
              The fine print is{' '}
              <span className="font-serif italic font-medium text-pink-500 tracking-[-0.02em]">
                handled.
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {TRUST_CARDS.map((card) => (
              <div
                key={card.title}
                className="bg-white border border-ink-200 rounded-2xl p-6 flex flex-col"
              >
                <span className="w-10 h-10 rounded-pill bg-pink-50 flex items-center justify-center mb-4">
                  <card.icon strokeWidth={2} className="w-4 h-4 text-pink-700" />
                </span>
                <div className="font-display text-[17px] font-bold tracking-[-0.01em] text-ink-900 mb-1.5">
                  {card.title}
                </div>
                <div className="text-[13px] text-ink-600 leading-[1.55]">
                  {card.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL DARK CTA */}
      <section data-surface="dark" className="bg-ink-900 text-white">
        <div className="max-w-[1200px] mx-auto px-6 py-24 text-center">
          <h2 className="font-display text-4xl sm:text-6xl font-extrabold leading-[0.95] tracking-[-0.035em] mb-5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500">
            Now you know.{' '}
            <em>Want to launch?</em>
          </h2>
          <p className="text-ink-300 text-lg max-w-[52ch] mx-auto mb-9">
            Browse 200+ production-ready templates. Pick one. We'll do the
            heavy lifting from here.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="neon" size="md">
              <Link href="/marketplace">
                Browse the marketplace
                <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="md" className="text-white hover:bg-white/10">
              <Link href="/pricing">See pricing →</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="max-w-[1200px] mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4 text-[13px] text-ink-500">
        <Link href="/" className="flex items-center gap-[7px]">
          <span className="w-[22px] h-[22px] rounded-md bg-pink-500" />
          <span className="font-display text-[15px] font-extrabold tracking-[-0.04em] text-ink-900">
            iLaunchify
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/marketplace" className="hover:text-ink-900">Marketplace</Link>
          <Link href="/how-it-works" className="hover:text-ink-900">How it works</Link>
          <Link href="/pricing" className="hover:text-ink-900">Pricing</Link>
          <Link href="/business" className="hover:text-ink-900">For partners</Link>
          <span>© 2026 iLaunchify</span>
        </div>
      </footer>
    </>
  )
}

/* ============ data ============ */

const CREATOR_STEPS = [
  {
    title: 'Browse the marketplace',
    description:
      'Pick from 200+ production-ready templates across 8 niches. Every template is admin-curated with verified ingredients, certified packaging, and FDA-compliant label fields.',
    duration: '~10 minutes',
    icon: ShoppingBag,
  },
  {
    title: 'Customize in the Design Studio',
    description:
      'Drop your logo into the canvas. Brand colors apply automatically. We render the Nutrition Facts and Supplement Facts panels by FDA spec — no fine-print expertise required.',
    duration: '~30 minutes',
    icon: Wand2,
  },
  {
    title: 'Approve a sample',
    description:
      '$15 ships you a single production-quality unit. Hold it, smell it, taste it. Approve to release the main order — we hold your payment until you do.',
    duration: '4–6 days',
    icon: ShieldCheck,
  },
  {
    title: 'We ship for you',
    description:
      'Direct to buyers, your warehouse, or retail accounts. We coordinate every partner in the production graph and surface one timeline so you stay focused on your brand.',
    duration: '7–14 days',
    icon: Truck,
  },
]

const ORCH_BULLETS = [
  'Each order is decomposed into a workflow graph — one node per partner role.',
  'Routing engine picks proven partners by proximity, capability, capacity, and your tier.',
  'Handoffs are reconciled automatically — labels printed by Tuesday meet co-packer slot by Thursday.',
  'Your card stays uncharged until every partner confirms they can deliver.',
]

const PARTNER_TIERS = [
  {
    name: 'Verified',
    gateline: 'New to iLaunchify, passed onboarding.',
    bullets: [
      'Full background check + facility audit',
      'Operational standards contract signed',
      'Insurance + compliance docs verified',
      'Standard 15% marketplace commission',
    ],
  },
  {
    name: 'Trusted',
    gateline: '25+ orders shipped, 90%+ on-time rate.',
    bullets: [
      'Volume tier pricing unlocked',
      'Subscribe-and-save reorder discounts',
      '24-hour support SLA',
      'Custom die-cut templates per quarter',
    ],
  },
  {
    name: 'Premier',
    gateline: '100+ orders, 95%+ on-time, admin-reviewed.',
    bullets: [
      'First-look routing position',
      'Creator-specific rate cards',
      'Dedicated account manager (4hr SLA)',
      'Featured in marketplace + agency creator deals',
    ],
    highlight: true,
  },
]

const TRUST_CARDS = [
  {
    title: 'Payment held until approved',
    body: 'Your card is authorized but never captured until every partner confirms they can deliver your run.',
    icon: Lock,
  },
  {
    title: 'FDA labels rendered for you',
    body: 'Supplement Facts and Nutrition Facts panels per 21 CFR. You can\'t accidentally ship a non-compliant label.',
    icon: ShieldCheck,
  },
  {
    title: 'Global production network',
    body: 'US + Canada (V1.1) + EU (V2). Partners matched by proximity to your buyers to cut shipping time.',
    icon: Globe,
  },
  {
    title: 'Quality, guaranteed',
    body: 'Partner fails QC, partner eats the cost — and gets a strike. Three strikes per year and they\'re reviewed for suspension.',
    icon: Sparkles,
  },
]
