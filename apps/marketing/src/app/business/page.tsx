import Link from 'next/link'
import { Button, HeroBanner, PartnerTypeCard } from '@ilaunchify/ui'
import { BusinessHeader } from '@/components/BusinessHeader'
import { partnerUrl } from '@/lib/app-urls'

/**
 * /business — iLaunchify Business partner landing.
 *
 * Locked rhythm (per Pavel 2026-05-27 and DESIGN_SYSTEM.md):
 *   DARK header → DARK hero → LIGHT stats → DARK partner-types island →
 *   LIGHT why-join → LIGHT how-it-works → LIGHT testimonial →
 *   DARK final CTA → DARK footer
 *
 * Color-by-surface rule: dark sections use neon emphasis, light sections use
 * pink emphasis. Same DNA, audience-context switched.
 */
export default function BusinessLandingPage() {
  return (
    <>
      <BusinessHeader />

      <HeroBanner
        eyebrow="● Applications open · 72-hour review"
        headline={
          <>
            Grow your manufacturing pipeline, <em>on autopilot.</em>
          </>
        }
        deck="Join 312 verified manufacturers, co-packers, label printers, and 3PL partners building with iLaunchify's network of creator brands. Steady orders, structured workflow, fast payment."
      >
        <Button variant="neon" size="lg" asChild>
          <a href={partnerUrl('/signup')}>Apply to join →</a>
        </Button>
        <Link
          href="#how"
          className="inline-flex items-center text-sm font-medium text-ink-300 hover:text-white border border-ink-700 hover:border-ink-500 rounded-pill px-[22px] py-2.5 transition-colors"
        >
          How it works
        </Link>
      </HeroBanner>

      {/* LIGHT — Stats */}
      <Stats />

      {/* DARK ISLAND — Partner types */}
      <PartnerTypes />

      {/* LIGHT — Why join */}
      <WhyJoin />

      {/* LIGHT — How it works */}
      <HowItWorks />

      {/* LIGHT — Testimonial */}
      <Testimonial />

      {/* DARK — Final CTA */}
      <FinalCta />

      {/* DARK — Footer */}
      <Footer />
    </>
  )
}

/* ---------- Light sections (data-surface flip) ---------- */

function Stats() {
  return (
    <section data-surface="light" className="bg-cream text-ink-900 border-b border-ink-200">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={
                'py-10 px-7 ' +
                (i !== STATS.length - 1
                  ? 'md:border-r border-b md:border-b-0 border-ink-200'
                  : '')
              }
            >
              <div className="font-display text-5xl font-extrabold leading-none tracking-[-0.03em] text-pink-500 mb-1.5">
                {s.value}
              </div>
              <div className="text-sm text-ink-600">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PartnerTypes() {
  return (
    <section data-surface="dark" className="bg-ink-900 text-white">
      <div className="max-w-[1400px] mx-auto px-8 py-24">
        <header className="mb-12 max-w-[60ch]">
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-none tracking-[-0.03em] text-white mb-3.5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500">
            Built for the people who <em>make</em> things.
          </h2>
          <p className="text-ink-400 text-[17px]">
            Four partner types, one platform. Apply with the role that fits — multi-service
            partners get one account with multiple memberships.
          </p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {PARTNER_TYPES.map((p) => (
            <PartnerTypeCard
              key={p.name}
              icon={p.icon}
              name={p.name}
              description={p.desc}
              activeCount={p.active}
              href={partnerUrl('/signup')}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function WhyJoin() {
  return (
    <section data-surface="cream" id="why" className="bg-cream text-ink-900 py-24 px-8">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-14 max-w-[60ch]">
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-none tracking-[-0.03em] text-ink-900 mb-3.5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-pink-500">
            What makes iLaunchify <em>different.</em>
          </h2>
          <p className="text-ink-600 text-[17px]">
            The same operational headaches you've solved manually for years — handled
            by the platform, so you can focus on the work.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {WHY.map((w) => (
            <div key={w.title} className="bg-white border border-ink-200 rounded-lg p-8">
              <div className="font-display text-[42px] font-extrabold text-pink-500 leading-none tracking-[-0.03em] mb-4">
                {w.num}
              </div>
              <div className="text-xl font-bold text-ink-900 mb-3">{w.title}</div>
              <div className="text-sm text-ink-600 leading-[1.6]">{w.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section
      data-surface="light"
      id="how"
      className="bg-white text-ink-900 py-24 px-8 border-t border-ink-200"
    >
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-14 max-w-[60ch]">
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-none tracking-[-0.03em] text-ink-900 mb-3.5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-pink-500">
            From application to active <em>in 72 hours.</em>
          </h2>
          <p className="text-ink-600 text-[17px]">
            A three-step onboarding designed to verify capability without bogging you down
            in paperwork.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.title}>
              <div className="font-display text-[84px] font-extrabold text-ink-200 leading-[0.85] tracking-[-0.04em] mb-4">
                {s.num}
              </div>
              <div className="text-xl font-bold text-ink-900 mb-2.5">{s.title}</div>
              <div className="text-sm text-ink-600 leading-[1.6] max-w-[38ch]">
                {s.text}
              </div>
              <span className="inline-block mt-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 bg-pink-50 border border-pink-100 px-2.5 py-1 rounded-pill">
                {s.meta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Testimonial() {
  return (
    <section
      data-surface="cream"
      className="bg-cream text-ink-900 py-24 px-8 border-t border-b border-ink-200"
    >
      <div className="max-w-[1100px] mx-auto">
        <p className="font-serif italic text-3xl sm:text-4xl font-normal leading-[1.25] tracking-[-0.015em] text-ink-900 mb-8">
          "Twenty years ago, taking on a small creator launch meant six emails, three sample
          reviews, and a calendar of phone tag. iLaunchify replaces all of that with{' '}
          <span className="not-italic font-medium text-pink-500">
            a queue I can run my floor against.
          </span>
          "
        </p>
        <div className="flex items-center gap-3.5 text-sm text-ink-600">
          <span className="w-12 h-12 rounded-pill bg-gradient-to-br from-pink-400 to-neon-500" />
          <span>
            <strong className="text-ink-900 font-semibold">Marcus Vellan</strong> ·
            Director of Operations, Vellan Labels · Long Island City
          </span>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section
      data-surface="dark"
      className="relative bg-ink-900 text-white py-32 px-8 text-center overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="absolute pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: '760px',
          height: '760px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(181,255,61,0.13), transparent 60%)',
        }}
      />
      <div className="relative z-[1] max-w-[900px] mx-auto">
        <h2 className="font-display text-5xl sm:text-7xl font-extrabold leading-[0.94] tracking-[-0.04em] text-white mb-6 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500">
          Ready to <em>grow?</em>
        </h2>
        <p className="text-ink-400 text-lg mb-10 max-w-[54ch] mx-auto">
          Applications are open and free. The first order can flow within days of
          activation.
        </p>
        <Button variant="neon" size="lg" asChild>
          <a href={partnerUrl('/signup')}>Apply to join →</a>
        </Button>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer
      data-surface="dark"
      className="bg-ink-900 border-t border-ink-700 py-12 px-8 text-white"
    >
      <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4">
        <Link href="/business" className="flex items-center gap-[9px]">
          <span className="w-[26px] h-[26px] rounded-md bg-pink-500" />
          <span className="font-display text-lg font-extrabold tracking-[-0.04em] text-white">
            iLaunchify<span className="text-neon-500 font-bold ml-0.5"> Business</span>
          </span>
        </Link>
        <div className="text-[13px] text-ink-500">
          © 2026 iLaunchify · Built on the iLaunchify design system
        </div>
      </div>
    </footer>
  )
}

/* ---------- data ---------- */

const STATS = [
  { value: '312', label: 'verified partners across 4 service types' },
  { value: '1,247', label: 'creator launches shipped in the last 12 months' },
  { value: '$4.2M', label: 'paid out to partners in the same period' },
]

const PARTNER_TYPES = [
  {
    icon: '🏭',
    name: 'Manufacturer',
    desc: 'Production & formulation. Powders, beverages, supplements, cosmetics.',
    active: 128,
  },
  {
    icon: '📦',
    name: 'Co-packer',
    desc: 'Filling, sealing, labeling. Bridge between bulk product and shipped SKU.',
    active: 94,
  },
  {
    icon: '🖨️',
    name: 'Label printer',
    desc: 'Custom label and packaging. Digital, flexo, offset — all certified workflows.',
    active: 52,
  },
  {
    icon: '🚚',
    name: 'Logistics',
    desc: '3PL, fulfillment, shipping. Regional and national reach.',
    active: 38,
  },
]

const WHY = [
  {
    num: '01',
    title: 'Steady demand pipeline',
    text:
      'A continuous queue of pre-qualified creator orders, routed to your floor based on capability, region, and capacity. No more chasing leads.',
  },
  {
    num: '02',
    title: 'Disputes handled upstream',
    text:
      'Structured revision requests, approval gates, and platform-mediated change orders. Free-form email arguments are a thing of the past.',
  },
  {
    num: '03',
    title: 'Fast, predictable payment',
    text:
      'Payment held until all approval gates clear, then released to your Stripe Connect account on a published schedule. No 90-day net terms.',
  },
]

const STEPS = [
  {
    num: '01',
    title: 'Apply',
    text:
      'Tell us what you do — service type, capacity, region, certifications. Upload supporting documents. Takes about 25 minutes.',
    meta: '~25 min · self-serve',
  },
  {
    num: '02',
    title: 'Verify',
    text:
      "Our partner ops team reviews your application across five layers — identity, capability, standards, commercial terms, integration. Most reviews complete in under 72 hours.",
    meta: '~72 hr · platform-side',
  },
  {
    num: '03',
    title: 'Activate',
    text:
      "Once verified, your services go live in the routing engine and creator orders start flowing. Accept what fits, decline what doesn't — your floor, your pace.",
    meta: 'live · paid per order',
  },
]
