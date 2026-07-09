import Link from 'next/link'
import { Button, HeroBanner, PartnerTypeCard, LayersGlyph } from '@ilaunchify/ui'
import { BusinessHeader } from '@/components/BusinessHeader'
import { Reveal } from '@/components/Reveal'
import { Parallax } from '@/components/Parallax'
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
        eyebrow="● Cohort 1 applications open · US partners · 72-hour review"
        headline={
          <>
            Grow your manufacturing pipeline, <em>on autopilot.</em>
          </>
        }
        deck="Apply once. Run your floor against a queue of pre-qualified creator orders, routed by capability, region, and capacity. Structured workflow. Stripe Connect payouts on a published schedule. No brokers in the middle."
        graphic={
          <Parallax speed={0.1} className="w-full">
            <BusinessGraphic />
          </Parallax>
        }
      >
        <Button variant="neon" size="xl" asChild>
          <a href={partnerUrl('/partners/apply')}>Apply to join →</a>
        </Button>
        <Button
          variant="outline"
          size="xl"
          asChild
          className="border-ink-700 text-ink-200 hover:border-ink-500 hover:text-white hover:bg-ink-800"
        >
          <a href="#how">How it works</a>
        </Button>
      </HeroBanner>

      {/* LIGHT — Stats */}
      <Reveal><Stats /></Reveal>

      {/* DARK ISLAND — Partner types */}
      <Reveal><PartnerTypes /></Reveal>

      {/* LIGHT — Why join */}
      <Reveal><WhyJoin /></Reveal>

      {/* LIGHT — How it works */}
      <Reveal><HowItWorks /></Reveal>

      {/* LIGHT — Testimonial */}
      <Reveal><Testimonial /></Reveal>

      {/* DARK — Final CTA */}
      <Reveal><FinalCta /></Reveal>

      {/* DARK — Footer */}
      <Footer />
    </>
  )
}

/* ---------- Hero graphic — production orchestration (animated SVG) ---------- */
// The iLaunchify orchestrator hub routes creator orders out to the partner
// network (manufacturer / printer / co-packer / warehouse), then to shipped.
// Pure inline SVG (SMIL); rendered in the HeroBanner background-graphic slot.
function BusinessGraphic() {
  return (
    <svg viewBox="0 0 600 380" className="h-auto w-full" role="img" aria-label="Creator orders routed across your partner network">
      <defs>
        <filter id="bizNeon" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="bizGlow" cx="52%" cy="48%" r="50%">
          <stop offset="0%" stopColor="#FF2E63" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#FF2E63" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bizMaskGrad" cx="52%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#fff" /><stop offset="55%" stopColor="#fff" /><stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id="bizMask"><rect width="600" height="380" fill="url(#bizMaskGrad)" /></mask>
      </defs>

      <rect x="60" y="30" width="500" height="320" fill="url(#bizGlow)">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="5s" repeatCount="indefinite" />
      </rect>

      {/* perspective grid floor — masked so it dissolves into the banner */}
      <g mask="url(#bizMask)">
        <g stroke="#FF2E63" strokeWidth="1.1" fill="none" opacity="0.38">
          <path d="M320 150 L40 360" /><path d="M320 150 L130 360" /><path d="M320 150 L220 360" /><path d="M320 150 L320 360" /><path d="M320 150 L420 360" /><path d="M320 150 L510 360" /><path d="M320 150 L600 360" />
          <path d="M250 200 H390" /><path d="M212 240 H428" /><path d="M162 290 H478" /><path d="M110 340 H530" />
        </g>
      </g>

      {/* orchestration links — hub ↔ partner nodes + hub → shipped */}
      <g stroke="#2DE2E6" strokeWidth="2" strokeDasharray="4 9" fill="none" opacity="0.6" filter="url(#bizNeon)">
        <path d="M320 195 L230 125"><animate attributeName="stroke-dashoffset" values="0;-26" dur="1.8s" repeatCount="indefinite" /></path>
        <path d="M320 195 L410 125"><animate attributeName="stroke-dashoffset" values="0;-26" dur="2.1s" repeatCount="indefinite" /></path>
        <path d="M320 195 L418 265"><animate attributeName="stroke-dashoffset" values="0;-26" dur="1.9s" repeatCount="indefinite" /></path>
        <path d="M320 195 L222 265"><animate attributeName="stroke-dashoffset" values="0;-26" dur="2.3s" repeatCount="indefinite" /></path>
        <path d="M362 195 L502 195"><animate attributeName="stroke-dashoffset" values="0;-26" dur="1.6s" repeatCount="indefinite" /></path>
      </g>

      {/* order packets routed outward */}
      <g filter="url(#bizNeon)">
        <rect x="-3.5" y="-3.5" width="7" height="7" fill="#B5FF3D"><animateMotion path="M320 195 L230 125" dur="2.4s" repeatCount="indefinite" calcMode="linear" /></rect>
        <rect x="-3.5" y="-3.5" width="7" height="7" fill="#2DE2E6"><animateMotion path="M320 195 L410 125" dur="2.8s" repeatCount="indefinite" calcMode="linear" /></rect>
        <rect x="-3.5" y="-3.5" width="7" height="7" fill="#FF2E63"><animateMotion path="M320 195 L418 265" dur="2.6s" repeatCount="indefinite" calcMode="linear" /></rect>
        <rect x="-3.5" y="-3.5" width="7" height="7" fill="#B5FF3D"><animateMotion path="M320 195 L222 265" dur="3s" repeatCount="indefinite" calcMode="linear" /></rect>
        <rect x="-4" y="-4" width="8" height="8" fill="#B5FF3D"><animateMotion path="M362 195 L502 195" dur="1.8s" repeatCount="indefinite" calcMode="linear" /></rect>
      </g>

      {/* partner nodes */}
      {/* Manufacturer (flask) */}
      <g transform="translate(230,125)" filter="url(#bizNeon)">
        <g><animateTransform attributeName="transform" type="scale" values="1;1.1;1" dur="2.3s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
          <path d="M-22 0 L-11 -19 L11 -19 L22 0 L11 19 L-11 19 Z" fill="#101013" stroke="#B5FF3D" strokeWidth="2" />
          <g fill="none" stroke="#B5FF3D" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><path d="M-4 -9 V-3 L-9 7 a3 3 0 0 0 3 4 H6 a3 3 0 0 0 3 -4 L4 -3 V-9" /><path d="M-7 -9 H7" /></g></g>
      </g>
      {/* Printer */}
      <g transform="translate(410,125)" filter="url(#bizNeon)">
        <g><animateTransform attributeName="transform" type="scale" values="1;1.1;1" dur="2.7s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
          <path d="M-22 0 L-11 -19 L11 -19 L22 0 L11 19 L-11 19 Z" fill="#101013" stroke="#2DE2E6" strokeWidth="2" />
          <g fill="none" stroke="#2DE2E6" strokeWidth="2" strokeLinejoin="round"><rect x="-10" y="-3" width="20" height="9" rx="1.5" /><path d="M-6 -3 V-9 H6 V-3" /><rect x="-6" y="6" width="12" height="6" /></g></g>
      </g>
      {/* Co-packer (box) */}
      <g transform="translate(418,265)" filter="url(#bizNeon)">
        <g><animateTransform attributeName="transform" type="scale" values="1;1.12;0.98;1.06;1" keyTimes="0;0.14;0.28;0.42;1" dur="1.7s" repeatCount="indefinite" />
          <path d="M-22 0 L-11 -19 L11 -19 L22 0 L11 19 L-11 19 Z" fill="#101013" stroke="#FF2E63" strokeWidth="2" />
          <g fill="none" stroke="#FF2E63" strokeWidth="2" strokeLinejoin="round"><path d="M-10 -5 L0 -10 L10 -5 L10 6 L0 11 L-10 6 Z" /><path d="M-10 -5 L0 0 L10 -5 M0 0 V11" /></g></g>
      </g>
      {/* Warehouse */}
      <g transform="translate(222,265)" filter="url(#bizNeon)">
        <g><animateTransform attributeName="transform" type="translate" values="0 0;0 5;0 0" dur="3.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
          <path d="M-22 0 L-11 -19 L11 -19 L22 0 L11 19 L-11 19 Z" fill="#101013" stroke="#B5FF3D" strokeWidth="2" />
          <g fill="none" stroke="#B5FF3D" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><path d="M-11 -2 L0 -10 L11 -2 V10 H-11 Z" /><rect x="-3.5" y="3" width="7" height="7" /></g></g>
      </g>

      {/* orchestrator hub — the iLaunchify layers mark */}
      <g transform="translate(320,195)" filter="url(#bizNeon)">
        <g>
          <animateTransform attributeName="transform" type="scale" values="1;1.06;1" dur="2.8s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
          <circle r="40" fill="#FF2E63" />
          <g stroke="#fff" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round">
            <path d="M0 -17 L19 -7 L0 3 L-19 -7 Z" />
            <path d="M-19 1 L0 11 L19 1" />
            <path d="M-19 9 L0 19 L19 9" />
          </g>
        </g>
      </g>

      {/* shipped node */}
      <g transform="translate(525,195)" filter="url(#bizNeon)">
        <circle r="24" fill="#0E0E12" stroke="#B5FF3D" strokeWidth="2.5" />
        <path d="M-9 0 L-3 7 L10 -8" fill="none" stroke="#B5FF3D" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle r="24" fill="none" stroke="#B5FF3D" strokeWidth="2"><animate attributeName="r" values="24;36" dur="2.4s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.6;0" dur="2.4s" repeatCount="indefinite" /></circle>
      </g>

      {/* HUD labels */}
      <text x="14" y="28" fontSize="11" fontWeight="700" letterSpacing="2" fill="#B5FF3D" opacity="0.8">PARTNER_NET</text>
      <text x="586" y="28" textAnchor="end" fontSize="11" fontWeight="700" letterSpacing="2" fill="#B5FF3D" opacity="0.8">ROUTED // LIVE</text>
      <text x="525" y="236" textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing="0.6" fill="#B5FF3D" opacity="0.85">SHIPPED</text>

      {/* scanline sweep */}
      <rect x="0" y="0" width="600" height="2" fill="#2DE2E6" opacity="0.18">
        <animateTransform attributeName="transform" type="translate" values="0 -6;0 386" dur="6s" repeatCount="indefinite" />
      </rect>
    </svg>
  )
}

/* ---------- Light sections (data-surface flip) ---------- */

function Stats() {
  return (
    <section data-surface="light" className="bg-white text-ink-900 border-b border-ink-200">
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
            Four service types, one account. Apply with the role that fits. Multi-service
            operations (manufacturing + co-packing under one roof) get one membership with
            multiple service rows — no double-signing.
          </p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {PARTNER_TYPES.map((p) => (
            <PartnerTypeCard
              key={p.name}
              icon={p.icon}
              name={p.name}
              description={p.desc}
              href={partnerUrl('/partners/apply')}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function WhyJoin() {
  return (
    <section data-surface="light" id="why" className="bg-white text-ink-900 py-24 px-8">
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
      data-surface="light"
      className="bg-white text-ink-900 py-24 px-8 border-t border-b border-ink-200"
    >
      <div className="max-w-[1100px] mx-auto">
        <p className="font-serif italic text-3xl sm:text-4xl font-normal leading-[1.25] tracking-[-0.015em] text-ink-900 mb-8">
          Mid-order spec changes are the single biggest source of margin loss in
          small-batch manufacturing. The{' '}
          <span className="not-italic font-medium text-pink-500">
            manifest-versioned change request
          </span>{' '}
          is the right answer to that problem.
        </p>
        <div className="flex items-center gap-3.5 text-sm text-ink-600">
          <span>
            — From the iLaunchify operational philosophy (Pavel, internal memo 2026-05-19)
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
          Applications are free. Cohort 1 is small by design — we onboard partners
          white-glove, so the first dispatches land cleanly. Apply when you have ~25
          minutes and your cert PDFs handy.
        </p>
        <Button variant="neon" size="lg" asChild>
          <a href={partnerUrl('/partners/apply')}>Apply to join →</a>
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
          <LayersGlyph className="h-[26px] w-[26px]" />
          <span className="font-display text-lg font-extrabold tracking-[-0.04em] text-white">
            iLaunchify<span className="text-neon-500 font-bold ml-0.5"> Business</span>
          </span>
        </Link>
        <div className="text-[13px] text-ink-500">
          © 2026 iLaunchify · Built in 2025–2026 · US-only V1
        </div>
      </div>
    </footer>
  )
}

/* ---------- data ---------- */

const STATS = [
  { value: '4', label: 'service types orchestrated per order: manufacturing, label printing, co-packing, warehouse' },
  { value: '5', label: 'onboarding layers verified before any order routes — identity, capability, standards, commercial, integration' },
  { value: '24h', label: 'target dispatch acceptance window before auto-cancel' },
]

const PARTNER_TYPES = [
  {
    icon: '🏭',
    name: 'Manufacturer',
    desc: 'Production & formulation. Powders, beverages, supplements, cosmetics.',
  },
  {
    icon: '📦',
    name: 'Co-packer',
    desc: 'Filling, sealing, labeling. Bridge between bulk product and shipped SKU.',
  },
  {
    icon: '🖨️',
    name: 'Label printer',
    desc: 'Custom label and packaging. Digital, flexo, offset — all certified workflows.',
  },
  {
    icon: '🚚',
    name: 'Logistics',
    desc: '3PL, fulfillment, shipping. Regional and national reach.',
  },
]

const WHY = [
  {
    num: '01',
    title: 'Demand without the sales pipeline',
    text:
      "A continuous queue of pre-qualified creator orders routes to your dashboard. Accept what fits. Decline what doesn't. We never share a creator's contact info with you, and we never share yours with them until you ship.",
  },
  {
    num: '02',
    title: 'Change requests, structured',
    text:
      'Mid-order changes arrive as manifest-versioned change requests, not Slack threads. Quantity bumps, substrate swaps, and packaging tweaks come with a structured impact payload. You see what changed and what’s affected. Free-form email arguments are gone.',
  },
  {
    num: '03',
    title: 'Stripe Connect payouts',
    text:
      'Each dispatch hits SHIPPED. Transfer queues to your Stripe Connect Express account on a published schedule. No invoicing. No chasing. No Net-60.',
  },
]

const STEPS = [
  {
    num: '01',
    title: 'Apply',
    text:
      'Tell us what you do across the five layers: identity (legal entity + docs), capability (substrates, machines, formats), operational standards (insurance + cert PDFs), commercial terms (rate cards + lead times), integration (Stripe Connect KYB). Self-serve. ~25 min if you have docs ready.',
    meta: '~25 min · self-serve',
  },
  {
    num: '02',
    title: 'Verify',
    text:
      'Our partner ops team reviews your application section-by-section against the same five layers. Cert PDFs are spot-checked against issuing-body records. Most decisions land in 72 hours. Some take longer; we’d rather be slow than wrong.',
    meta: '~72 hr · platform-side',
  },
  {
    num: '03',
    title: 'Activate',
    text:
      'Activation flips your services live in the routing engine. Creator dispatches start flowing to your dashboard. Accept or decline within the SLA window. Auto-cancel kicks in if you don’t respond — same rule for everyone.',
    meta: 'live · paid per dispatch',
  },
]
