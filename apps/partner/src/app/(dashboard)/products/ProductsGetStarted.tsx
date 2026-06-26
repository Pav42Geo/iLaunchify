// Partner Products — first-run "get started" landing.
//
// Shown in place of the management chrome when a partner has ZERO product
// templates (apps/partner/.../products/page.tsx early-returns this). It's the
// manufacturer-side analogue of the creator first-run hub: a conversion-focused,
// full-bleed editorial landing that motivates + guides a new partner to list
// their first product and start earning.
//
// Design language = the marketing /pricing editorial look (pink eyebrow →
// Bricolage display headline with a Fraunces-italic-pink emphasis span, full-
// bleed bands, dark CTA). Full-bleed works because the (dashboard) <main> has
// overflow-x-clip; each Band breaks out with margin-left: calc(50% - 50vw).
//
// Content is platform-true (no fabricated metrics). NOTE: the testimonials are
// ILLUSTRATIVE placeholders — swap for real partner quotes before launch.

import Link from 'next/link'
import {
  Plus,
  ArrowRight,
  ShieldCheck,
  Inbox,
  Wallet,
  Boxes,
  Layers,
  Repeat,
  BadgeCheck,
  SlidersHorizontal,
  PlayCircle,
  Quote,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { marketingUrl } from '@/lib/marketing-url'

// -----------------------------------------------------------------------------
// Content
// -----------------------------------------------------------------------------

const VALUE_STATS: { value: string; label: string }[] = [
  { value: '8', label: 'creator niches sending you demand' },
  { value: 'You', label: 'set every MOQ, lead time & price floor' },
  { value: '3–5 days', label: 'to get verified & listed' },
  { value: '$0', label: 'upfront — you earn per production order' },
]

const STEPS: { n: string; title: string; body: string; icon: LucideIcon }[] = [
  {
    n: '01',
    title: 'Build your product',
    body: 'A 4-step guided builder walks you through the basics, recipe or formulation, packaging, and pricing. Save drafts and refine — nothing is submitted until you’re ready.',
    icon: Boxes,
  },
  {
    n: '02',
    title: 'Get verified & listed',
    body: 'Submit for review. Our team verifies within 3–5 business days, then your product goes live in the creator marketplace where brands can customize and order it.',
    icon: ShieldCheck,
  },
  {
    n: '03',
    title: 'Receive & accept orders',
    body: 'Creators order; you get a dispatch to accept, produce, and ship — every job tracked in your Orders inbox with deadlines and manifests.',
    icon: Inbox,
  },
  {
    n: '04',
    title: 'Get paid',
    body: 'Payouts land in your connected Stripe account per fulfilled dispatch. Track earnings and pending payouts in Payments.',
    icon: Wallet,
  },
]

const PERKS: { title: string; body: string; icon: LucideIcon }[] = [
  { title: 'You set the terms', body: 'Price floors, MOQs, and lead times are yours — per product. We never shop your manufacturing out from under you.', icon: SlidersHorizontal },
  { title: 'Demand comes to you', body: 'Creators across 8 niches bring the brand and the buyers. You focus on what you do best: making great product.', icon: Layers },
  { title: 'Compliance built in', body: 'FDA Nutrition, Supplement & Drug Facts label tooling, allergen handling, and certificate management come standard.', icon: BadgeCheck },
  { title: 'Your standards travel', body: 'Your operational standards attach to every order, so production runs the way you run it.', icon: ShieldCheck },
  { title: 'One profile, many services', body: 'Manufacturing, printing, co-packing, warehousing — list whatever you offer under a single partner account.', icon: Boxes },
  { title: 'Built for repeat', body: 'Templates turn one-off launches into repeat production. Pooling and buffer inventory are on the roadmap.', icon: Repeat },
]

const ACADEMY: { title: string; blurb: string }[] = [
  { title: 'Getting started as a partner', blurb: 'A 6-minute tour of the dashboard, orders, and payouts.' },
  { title: 'Building a compliant product', blurb: 'Recipes, label formats, and what reviewers look for.' },
  { title: 'Winning repeat orders', blurb: 'Pricing, lead times, and certifications that convert.' },
]

// ILLUSTRATIVE placeholders — replace with real partner quotes before launch.
const TESTIMONIALS: { quote: string; name: string; role: string }[] = [
  { quote: 'We listed three SKUs and had our first creator order inside two weeks — no sales team, no upfront spend.', name: 'Sample partner', role: 'Co-packer · Austin, TX' },
  { quote: 'The label tooling alone saved us a compliance headache on every run. Setup was genuinely fast.', name: 'Sample partner', role: 'Beverage manufacturer · Denver, CO' },
  { quote: 'We keep our MOQs and pricing exactly where we want them. The demand just shows up.', name: 'Sample partner', role: 'Supplement manufacturer · Salt Lake City, UT' },
]

const FAQ: { q: string; a: string }[] = [
  { q: 'What does it cost to join?', a: 'Nothing upfront. Applying, getting verified, and listing products are free — iLaunchify earns a platform fee on each production order you fulfill, so we only make money when you do.' },
  { q: 'How long until I’m live?', a: 'After you submit a product for review, verification typically takes 3–5 business days. You’ll get an email the moment a product is approved or needs changes.' },
  { q: 'Who sets pricing and MOQ?', a: 'You do. You control price floors, minimum order quantities, and lead times on every product — first-run and repeat economics included.' },
  { q: 'How do payouts work?', a: 'Payouts run through Stripe Connect and land in your account per fulfilled dispatch. You can track earnings and pending payouts in Payments.' },
  { q: 'What can I make?', a: 'Food, supplements, beverages, cosmetics, pet products and more across the supported domains. The builder enforces the correct label format (Nutrition / Supplement / Drug Facts) for what you select.' },
  { q: 'Do I need certifications to start?', a: 'No. You can list and earn without them, then add certifications (NSF, USDA Organic, cGMP, Kosher…) to earn verified badges that unlock more creator demand.' },
  { q: 'Can I pause a product?', a: 'Anytime. Toggle any live product off to hide it from the marketplace, and back on when you’re ready — no re-review needed.' },
]

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ProductsGetStarted({ companyName }: { companyName: string }) {
  return (
    <div className="pb-2">
      {/* ===== HERO (full-bleed) ===== */}
      <Band className="border-b border-ink-100 bg-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(#FFD0E0 1px, transparent 1px), linear-gradient(90deg, #FFD0E0 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            opacity: 0.55,
            maskImage: 'radial-gradient(115% 90% at 50% -8%, #000 24%, transparent 74%)',
            WebkitMaskImage: 'radial-gradient(115% 90% at 50% -8%, #000 24%, transparent 74%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-6 pb-12 pt-14 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700">
            {companyName} · Become an earning partner
          </p>
          <h1 className="mx-auto mt-3 font-display text-4xl font-extrabold leading-[1.03] tracking-[-0.03em] text-ink-900 sm:text-5xl md:text-6xl">
            Turn your line into{' '}
            <span className="font-serif text-pink-500 italic font-medium tracking-[-0.02em]">recurring revenue.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[60ch] text-[15px] leading-relaxed text-ink-700 sm:text-lg">
            Creators bring the brand and the buyers. You produce, pack, and fulfill — on your terms,
            with your MOQs and pricing. List your first product and start receiving orders.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/products/new">
                Create your first product <ArrowRight strokeWidth={2.5} className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
          <p className="mt-5 text-[12.5px] font-medium text-ink-500">
            No upfront cost · You set MOQ &amp; pricing · Stripe payouts · 3–5 day verification
          </p>
        </div>
      </Band>

      {/* ===== VALUE STAT STRIP (full-bleed cream) ===== */}
      <Band className="border-b border-ink-100 bg-cream">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden py-2 md:grid-cols-4">
          {VALUE_STATS.map((s) => (
            <div key={s.label} className="px-4 py-7 text-center">
              <div className="font-display text-3xl font-extrabold tracking-[-0.02em] text-ink-900 sm:text-4xl">{s.value}</div>
              <div className="mx-auto mt-1.5 max-w-[22ch] text-[12.5px] leading-snug text-ink-600">{s.label}</div>
            </div>
          ))}
        </div>
      </Band>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="scroll-mt-6 pt-14">
        <SectionHead eyebrow="How you start earning" lead="Four steps to your" emphasis="first order." />
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 px-1 sm:grid-cols-2">
          {STEPS.map((s) => (
            <div key={s.n} className="relative flex gap-4 rounded-2xl border border-ink-200 bg-white p-5">
              <div className="flex-shrink-0">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pink-50 text-pink-700">
                  <s.icon strokeWidth={2} className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-[13px] font-bold tabular-nums text-pink-500">{s.n}</span>
                  <h3 className="font-display text-[17px] font-bold tracking-[-0.01em] text-ink-900">{s.title}</h3>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-7 text-center">
          <Button asChild variant="primary" size="lg">
            <Link href="/products/new">
              Start building <ArrowRight strokeWidth={2.5} className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ===== PERKS ===== */}
      <section className="pt-16">
        <SectionHead eyebrow="Why partners build with us" lead="Your line, your rules —" emphasis="our demand." />
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERKS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-ink-200 bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-neon-500">
                <p.icon strokeWidth={2} className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <h3 className="mt-3.5 font-display text-[16px] font-bold tracking-[-0.01em] text-ink-900">{p.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== ACADEMY (full-bleed cream) ===== */}
      <Band className="mt-16 border-y border-ink-100 bg-cream">
        <div className="mx-auto max-w-5xl py-14">
          <SectionHead eyebrow="Partner Academy" lead="New to this? We’ll" emphasis="show you." noMargin />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {ACADEMY.map((c) => (
              <a
                key={c.title}
                href={marketingUrl('/business/academy')}
                className="group flex flex-col rounded-2xl border border-ink-200 bg-white p-5 transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-50 text-pink-700">
                  <PlayCircle strokeWidth={2} className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3.5 font-display text-[15.5px] font-bold tracking-[-0.01em] text-ink-900">{c.title}</h3>
                <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-ink-600">{c.blurb}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-pink-700 group-hover:gap-1.5">
                  Watch <ArrowRight strokeWidth={2.5} className="h-3.5 w-3.5" />
                </span>
              </a>
            ))}
          </div>
        </div>
      </Band>

      {/* ===== TESTIMONIALS ===== */}
      <section className="pt-16">
        <SectionHead eyebrow="From the floor" lead="Partners who put their line" emphasis="to work." />
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <figure key={i} className="flex flex-col rounded-2xl border border-ink-200 bg-white p-5">
              <Quote strokeWidth={2} className="h-5 w-5 text-pink-300" aria-hidden="true" />
              <blockquote className="mt-3 flex-1 text-[14px] leading-relaxed text-ink-800">“{t.quote}”</blockquote>
              <figcaption className="mt-4 border-t border-ink-100 pt-3">
                <div className="text-[13px] font-semibold text-ink-900">{t.name}</div>
                <div className="text-[12px] text-ink-500">{t.role}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="mx-auto max-w-[760px] pt-16">
        <SectionHead eyebrow="Questions" lead="Good to" emphasis="know." />
        <div className="flex flex-col gap-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-xl border border-ink-200 bg-white transition-colors open:border-pink-300">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <span className="font-display text-[15px] font-bold tracking-[-0.005em] text-ink-900">{f.q}</span>
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-ink-300 text-[15px] font-light leading-none text-ink-500 transition-colors group-open:border-pink-500 group-open:bg-pink-500 group-open:text-white"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <div className="px-5 pb-5 text-[13.5px] leading-[1.6] text-ink-700">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ===== DARK CTA (full-bleed) ===== */}
      <Band className="mt-16 bg-ink-900" surface="dark">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500">Ready when you are</p>
          <h2 className="mx-auto mt-3 max-w-[20ch] font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-4xl [&_em]:font-serif [&_em]:font-medium [&_em]:italic [&_em]:text-neon-500">
            Put your line <em>to work.</em>
          </h2>
          <p className="mx-auto mt-4 max-w-[46ch] text-[15px] text-ink-300">
            Build your first product in minutes, get verified, and let creator demand find you.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="neon" size="lg">
              <Link href="/products/new">
                <Plus strokeWidth={2.5} className="h-4 w-4" /> Create your first product
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="text-white hover:bg-white/10">
              <Link href="/help/new">Talk to our team</Link>
            </Button>
          </div>
        </div>
      </Band>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Full-bleed band: breaks out of the (dashboard) max-w-6xl wrapper to span the
// whole content area (clipped by <main>'s overflow-x-clip). `relative` lets the
// hero's absolute grid layer position against it.
function Band({
  children,
  className,
  surface,
}: {
  children: React.ReactNode
  className?: string
  surface?: 'dark'
}) {
  return (
    <section
      data-surface={surface}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{ marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)', width: '100vw' }}
    >
      {children}
    </section>
  )
}

function SectionHead({
  eyebrow,
  lead,
  emphasis,
  noMargin,
}: {
  eyebrow: string
  lead: string
  emphasis: string
  noMargin?: boolean
}) {
  return (
    <div className={noMargin ? 'text-center' : 'mb-8 text-center'}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700">{eyebrow}</div>
      <h2 className="font-display text-2xl font-bold tracking-[-0.025em] text-ink-900 sm:text-3xl">
        {lead}{' '}
        <span className="font-serif text-pink-500 italic font-medium tracking-[-0.02em]">{emphasis}</span>
      </h2>
    </div>
  )
}
