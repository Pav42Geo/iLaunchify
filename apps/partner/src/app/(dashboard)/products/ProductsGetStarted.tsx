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
import { marketingUrl } from '@/lib/marketing-url'
import { ProductImportButton } from './import/ProductImportButton'

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

export function ProductsGetStarted({
  companyName,
  subcategories = [],
}: {
  companyName: string
  subcategories?: { id: string; name: string; categoryName: string }[]
}) {
  return (
    <div className="pb-2">
      {/* ===== HERO — dark Business-landing outlook, full-bleed, flush to topbar ===== */}
      <Band flushTop surface="dark" className="border-b border-ink-800 bg-ink-900 text-white">
        {/* signature pink glow + neon counter-glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 h-[440px] w-[440px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,46,99,0.42), transparent 70%)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-28 h-[440px] w-[440px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(181,255,61,0.14), transparent 70%)' }}
        />
        {/* faint neon dot field */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(181,255,61,0.10) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(125% 105% at 50% 0%, #000 32%, transparent 82%)',
            WebkitMaskImage: 'radial-gradient(125% 105% at 50% 0%, #000 32%, transparent 82%)',
          }}
        />

        {/* spatial graphic — right-anchored faded background (lg+); enlarges to fill */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[56%] items-center justify-end lg:flex"
          style={{
            maskImage: 'linear-gradient(to right, transparent, #000 46%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, #000 46%)',
          }}
        >
          <ProductionLine />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="max-w-[620px]">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-400">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-500" aria-hidden="true" />
              {companyName} · Partner program
            </p>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.035em] text-white sm:text-5xl md:text-6xl [&_em]:font-serif [&_em]:font-medium [&_em]:italic [&_em]:text-neon-500 [&_em]:tracking-[-0.02em]">
              Turn your line into <em>recurring revenue.</em>
            </h1>
            <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-ink-300 sm:text-lg">
              Creators bring the brand and the buyers. You produce, pack, and fulfill — on your terms,
              with your MOQs and pricing. List your first product and start receiving orders.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/products/new"
                className="inline-flex h-[var(--button-h-xl)] items-center justify-center gap-2 rounded-full bg-neon-500 px-[var(--button-px-xl)] text-[length:var(--fs-lg)] font-semibold text-ink-900 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
              >
                Create your first product <ArrowRight strokeWidth={2.5} className="h-4 w-4" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex h-[var(--button-h-xl)] items-center justify-center rounded-full border border-ink-700 px-[var(--button-px-xl)] text-[length:var(--fs-lg)] font-medium text-ink-200 transition hover:border-ink-500 hover:text-white"
              >
                See how it works
              </Link>
            </div>
            <p className="mt-6 text-[12.5px] font-medium text-ink-400">
              No upfront cost · You set MOQ &amp; pricing · Stripe payouts · 3–5 day verification
            </p>
            <div className="mt-4 text-[13px] text-ink-400">
              Already sell elsewhere?{' '}
              <ProductImportButton
                subcategories={subcategories}
                triggerClassName="inline font-semibold text-neon-500 underline-offset-2 hover:underline"
                triggerLabel="Import your catalog from CSV →"
              />
            </div>
          </div>
        </div>
      </Band>

      {/* ===== VALUE STAT STRIP (full-bleed) ===== */}
      <Band className="border-b border-ink-200 bg-white">
        <div className="mx-auto grid max-w-5xl grid-cols-2 md:grid-cols-4">
          {VALUE_STATS.map((s, i) => (
            <div
              key={s.label}
              className={'px-5 py-9 text-center ' + (i < VALUE_STATS.length - 1 ? 'border-ink-200 md:border-r' : '')}
            >
              <div className="font-display text-4xl font-extrabold leading-none tracking-[-0.03em] text-pink-500 sm:text-5xl">{s.value}</div>
              <div className="mx-auto mt-2 max-w-[22ch] text-[12.5px] leading-snug text-ink-600">{s.label}</div>
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
        <div className="mt-8 text-center">
          <Link
            href="/products/new"
            className="inline-flex h-[var(--button-h-xl)] items-center justify-center gap-2 rounded-full bg-ink-900 px-[var(--button-px-xl)] text-[length:var(--fs-lg)] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Start building <ArrowRight strokeWidth={2.5} className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ===== PERKS — dark island (Business outlook) ===== */}
      <Band surface="dark" className="mt-16 bg-ink-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <header className="mb-10 max-w-[60ch]">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-400">Why partners build with us</p>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-[-0.03em] text-white sm:text-4xl [&_em]:font-serif [&_em]:font-medium [&_em]:italic [&_em]:text-neon-500">
              Your line, your rules — <em>our demand.</em>
            </h2>
          </header>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {PERKS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-ink-800 bg-white/[0.03] p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-neon-500 ring-1 ring-ink-700">
                  <p.icon strokeWidth={2} className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <h3 className="mt-3.5 font-display text-[16px] font-bold tracking-[-0.01em] text-white">{p.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* ===== ACADEMY ===== */}
      <section className="pt-16">
        <SectionHead eyebrow="Partner Academy" lead="New to this? We’ll" emphasis="show you." />
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
          {ACADEMY.map((c) => (
            <a
              key={c.title}
              href={marketingUrl('/business/academy')}
              target="_blank"
              rel="noopener noreferrer"
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
      </section>

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
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/products/new"
              className="inline-flex h-[var(--button-h-xl)] items-center justify-center gap-2 rounded-full bg-neon-500 px-[var(--button-px-xl)] text-[length:var(--fs-lg)] font-semibold text-ink-900 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
            >
              <Plus strokeWidth={2.5} className="h-4 w-4" /> Create your first product
            </Link>
            <Link
              href="/help/new"
              className="inline-flex h-[var(--button-h-xl)] items-center justify-center rounded-full border border-ink-700 px-[var(--button-px-xl)] text-[length:var(--fs-lg)] font-medium text-ink-200 transition-colors hover:border-ink-500 hover:text-white"
            >
              Talk to our team
            </Link>
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
  flushTop,
}: {
  children: React.ReactNode
  className?: string
  surface?: 'dark'
  /** Cancel the dashboard <main>'s pt-6 so the band sits flush under the topbar. */
  flushTop?: boolean
}) {
  return (
    <section
      data-surface={surface}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        width: '100vw',
        ...(flushTop ? { marginTop: '-1.5rem' } : {}),
      }}
    >
      {children}
    </section>
  )
}

// Hero graphic — a PERSPECTIVE PRODUCTION LINE. Product tiles spawn at the
// vanishing point and travel toward the viewer down three lanes of a neon belt,
// growing as they approach (depth) — "your line producing recurring orders."
// A distinct spatial effect from the orbital/orchestration graphics elsewhere.
function ProductionLine() {
  const tile = (lane: string, dur: string, begin: string, color: string) => (
    <g>
      <animateMotion path={lane} dur={dur} begin={begin} repeatCount="indefinite" calcMode="linear" />
      <g>
        <animateTransform attributeName="transform" type="scale" values="0.12;1.05" dur={dur} begin={begin} repeatCount="indefinite" calcMode="linear" />
        <rect x="-15" y="-15" width="30" height="30" rx="8" fill={color} />
        <g stroke="#0B0B0F" strokeWidth="2.4" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.85">
          <path d="M0 -7 L8 -2 L0 3 L-8 -2 Z" /><path d="M-8 0 L0 5 L8 0" />
        </g>
      </g>
      <animate attributeName="opacity" values="0.15;1;1;0" keyTimes="0;0.25;0.8;1" dur={dur} begin={begin} repeatCount="indefinite" />
    </g>
  )
  return (
    <svg viewBox="0 0 600 400" className="h-auto w-full" role="img" aria-label="Your production line: units flowing into recurring orders">
      <defs>
        <filter id="plNeon" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="plGlow" cx="50%" cy="34%" r="55%">
          <stop offset="0%" stopColor="#FF2E63" stopOpacity="0.3" /><stop offset="100%" stopColor="#FF2E63" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="plMaskGrad" cx="50%" cy="48%" r="62%">
          <stop offset="0%" stopColor="#fff" /><stop offset="56%" stopColor="#fff" /><stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id="plMask"><rect width="600" height="400" fill="url(#plMaskGrad)" /></mask>
      </defs>

      <rect x="80" y="40" width="440" height="320" fill="url(#plGlow)">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="5s" repeatCount="indefinite" />
      </rect>

      {/* perspective belt — converges to the vanishing point, dissolves at edges */}
      <g mask="url(#plMask)">
        <g stroke="#FF2E63" strokeWidth="1.2" fill="none" opacity="0.42" strokeLinecap="round">
          <path d="M300 120 L80 400" /><path d="M300 120 L230 400" /><path d="M300 120 L300 400" /><path d="M300 120 L370 400" /><path d="M300 120 L520 400" />
          <path d="M272 160 H328" /><path d="M240 200 H360" /><path d="M200 250 H400" /><path d="M152 312 H448" /><path d="M96 384 H504" />
        </g>
        {/* live scan rung */}
        <path d="M200 250 H400" stroke="#B5FF3D" strokeWidth="1.4" fill="none" opacity="0.5" filter="url(#plNeon)">
          <animate attributeName="opacity" values="0.1;0.6;0.1" dur="2.6s" repeatCount="indefinite" />
        </path>
      </g>

      {/* product tiles flowing toward the viewer (3 lanes, staggered) */}
      <g filter="url(#plNeon)">
        {tile('M300 123 L180 400', '3.2s', '0s', '#B5FF3D')}
        {tile('M300 123 L300 400', '3.6s', '0.6s', '#FF2E63')}
        {tile('M300 123 L420 400', '3.4s', '1.2s', '#2DE2E6')}
        {tile('M300 123 L180 400', '3.2s', '1.7s', '#2DE2E6')}
        {tile('M300 123 L300 400', '3.6s', '2.3s', '#B5FF3D')}
        {tile('M300 123 L420 400', '3.4s', '2.9s', '#FF2E63')}
      </g>

      {/* line source at the vanishing point */}
      <g filter="url(#plNeon)">
        <circle cx="300" cy="120" r="10" fill="#FF2E63" />
        <circle cx="300" cy="120" r="10" fill="none" stroke="#FF2E63" strokeWidth="2">
          <animate attributeName="r" values="10;26" dur="2.6s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.7;0" dur="2.6s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* HUD labels */}
      <text x="14" y="28" fontSize="11" fontWeight="700" letterSpacing="2" fill="#B5FF3D" opacity="0.8">YOUR_LINE</text>
      <text x="586" y="28" textAnchor="end" fontSize="11" fontWeight="700" letterSpacing="2" fill="#B5FF3D" opacity="0.8">RECURRING // LIVE</text>

      {/* scanline sweep */}
      <rect x="0" y="0" width="600" height="2" fill="#2DE2E6" opacity="0.18">
        <animateTransform attributeName="transform" type="translate" values="0 -6;0 406" dur="6s" repeatCount="indefinite" />
      </rect>
    </svg>
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
