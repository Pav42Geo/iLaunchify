import Link from 'next/link'
import { Button, HeroBanner } from '@ilaunchify/ui'
import { LandingHeader } from '@/components/LandingHeader'
import { LandingFooter } from '@/components/LandingFooter'

/**
 * /influencers — iLaunchify Influencer Program landing.
 *
 * Inspired by https://www.pacdora.com/influencer-program (Pavel 2026-06-03).
 *
 * Locked rhythm (per DESIGN_SYSTEM.md + memory ilaunchify-design-system-v1):
 *   DARK header → DARK hero → LIGHT stats → DARK how-it-works island →
 *   LIGHT why-join → LIGHT who-it's-for → LIGHT FAQ → LIGHT contact card →
 *   DARK final CTA → DARK shared LandingFooter
 *
 * Color rule: dark surfaces use neon emphasis, light surfaces use pink. Same
 * DNA as /business and /how-it-works.
 *
 * Honesty rule (memory: P2 stripped fabricated traction): no "Over N influencers"
 * claims, no invented average earnings, no fake testimonials. Forward-looking
 * "founding cohort" framing only.
 *
 * The Impact platform reference is the real affiliate network (industry-
 * standard for SaaS influencer programs). The Impact URL placeholder
 * (IMPACT_APPLY_URL) needs Pavel to swap for the real campaign URL once
 * Impact account is provisioned.
 */

const IMPACT_APPLY_URL = 'https://app.impact.com/' // TODO: swap for actual Pacdora.brand-equivalent URL once Impact campaign is live
const CONTACT_EMAIL = 'partnerships@ilaunchify.com'

export default function InfluencersPage() {
  return (
    <>
      <LandingHeader />

      <HeroBanner
        eyebrow="● Founding influencer cohort · Applications open · 14-day review"
        headline={
          <>
            Promote iLaunchify. <em>Earn as creators ship.</em>
          </>
        }
        deck="Your audience is exploring CPG, design, or starting a brand of their own. iLaunchify is the platform that turns their idea into a shipped product. Refer them and earn 30% on every subscription — tracked transparently on Impact."
        graphic={<InfluencerGraphic />}
      >
        <Button variant="neon" size="lg" asChild>
          <a href={IMPACT_APPLY_URL} target="_blank" rel="noopener noreferrer">
            Apply via Impact →
          </a>
        </Button>
        <Link
          href="#faq"
          className="inline-flex items-center text-sm font-medium text-ink-300 hover:text-white border border-ink-700 hover:border-ink-500 rounded-pill px-[22px] py-2.5 transition-colors"
        >
          Read the FAQ
        </Link>
      </HeroBanner>

      {/* LIGHT — Quick stats band */}
      <Stats />

      {/* DARK ISLAND — How it works */}
      <HowItWorks />

      {/* LIGHT — Why partner */}
      <WhyPartner />

      {/* LIGHT — Who this is for */}
      <WhoItsFor />

      {/* LIGHT — FAQ */}
      <Faq />

      {/* LIGHT cream — Contact card */}
      <ContactCard />

      {/* DARK — Final CTA */}
      <FinalCta />

      {/* DARK — Shared site footer */}
      <LandingFooter />
    </>
  )
}

/* ---------- Hero graphic — broadcast → audience → recurring earnings ---------- */
// Animated SVG hero illustration tied to the influencer topic: a megaphone hub
// broadcasts ripples to audience channels (video / engagement / podcast), whose
// signal flows into a pulsing recurring-earnings ($) node. Pure inline SVG (SMIL),
// rendered in the HeroBanner's `graphic` slot. The reusable pattern for landing
// heroes (see the partner products first-run cycle graphic).
function InfluencerGraphic() {
  return (
    <svg viewBox="0 0 600 380" className="h-auto w-full" role="img" aria-label="A creator broadcasting through a wide signal-space to their audience">
      <defs>
        <filter id="infNeon" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="infGlow" cx="50%" cy="46%" r="50%">
          <stop offset="0%" stopColor="#FF2E63" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#FF2E63" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="infFloorFade" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#FF2E63" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#FF2E63" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect x="40" y="20" width="520" height="340" fill="url(#infGlow)">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="5s" repeatCount="indefinite" />
      </rect>

      {/* === wide perspective tunnel — ceiling + floor converge to the VP behind the head === */}
      {/* ceiling plane (fainter) */}
      <g stroke="#FF2E63" strokeWidth="1" opacity="0.16" fill="none">
        <path d="M300 160 L-60 -20" /><path d="M300 160 L12 -20" /><path d="M300 160 L84 -20" /><path d="M300 160 L156 -20" /><path d="M300 160 L228 -20" /><path d="M300 160 L300 -20" /><path d="M300 160 L372 -20" /><path d="M300 160 L444 -20" /><path d="M300 160 L516 -20" /><path d="M300 160 L588 -20" /><path d="M300 160 L660 -20" />
        <path d="M256.8 138.4 H343.2" /><path d="M206.4 113.2 H393.6" /><path d="M148.8 84.4 H451.2" /><path d="M76.8 48.4 H523.2" /><path d="M-6 7 H606" />
      </g>
      {/* floor plane (the dominant ground) */}
      <g stroke="#FF2E63" strokeWidth="1.1" fill="none" opacity="0.5">
        <path d="M300 160 L-60 380" /><path d="M300 160 L12 380" /><path d="M300 160 L84 380" /><path d="M300 160 L156 380" /><path d="M300 160 L228 380" /><path d="M300 160 L300 380" /><path d="M300 160 L372 380" /><path d="M300 160 L444 380" /><path d="M300 160 L516 380" /><path d="M300 160 L588 380" /><path d="M300 160 L660 380" />
        <path d="M271.2 177.6 H328.8" /><path d="M235.2 199.6 H364.8" /><path d="M192 226 H408" /><path d="M138 259 H462" /><path d="M73.2 298.6 H526.8" /><path d="M4.8 340.4 H595.2" /><path d="M-60 380 H660" />
      </g>
      <rect x="0" y="160" width="600" height="220" fill="url(#infFloorFade)" opacity="0.45" />
      {/* live scan row sweeping on the floor */}
      <path d="M138 259 H462" stroke="#B5FF3D" strokeWidth="1.4" fill="none" opacity="0.5" filter="url(#infNeon)">
        <animate attributeName="opacity" values="0.1;0.6;0.1" dur="2.6s" repeatCount="indefinite" />
      </path>

      {/* broadcast rings filling the space (from behind the head) */}
      <g fill="none" stroke="#B5FF3D" strokeWidth="2" filter="url(#infNeon)">
        <circle cx="300" cy="200" r="50"><animate attributeName="r" values="50;230" dur="4.5s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.55;0" dur="4.5s" repeatCount="indefinite" /></circle>
        <circle cx="300" cy="200" r="50"><animate attributeName="r" values="50;230" dur="4.5s" begin="1.5s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.55;0" dur="4.5s" begin="1.5s" repeatCount="indefinite" /></circle>
        <circle cx="300" cy="200" r="50"><animate attributeName="r" values="50;230" dur="4.5s" begin="3s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.55;0" dur="4.5s" begin="3s" repeatCount="indefinite" /></circle>
      </g>

      {/* signal flowing from the audience back toward the earnings node */}
      <g stroke="#2DE2E6" strokeWidth="2" strokeDasharray="4 10" strokeLinecap="round" fill="none" opacity="0.6" filter="url(#infNeon)">
        <path d="M120 300 L505 214"><animate attributeName="stroke-dashoffset" values="0;-28" dur="2s" repeatCount="indefinite" /></path>
        <path d="M196 252 L505 210"><animate attributeName="stroke-dashoffset" values="0;-28" dur="1.7s" repeatCount="indefinite" /></path>
        <path d="M408 252 L505 212"><animate attributeName="stroke-dashoffset" values="0;-28" dur="2.3s" repeatCount="indefinite" /></path>
        <path d="M482 300 L505 232"><animate attributeName="stroke-dashoffset" values="0;-28" dur="1.9s" repeatCount="indefinite" /></path>
      </g>

      {/* audience nodes — spread WIDE across the floor */}
      <g transform="translate(120,300)" filter="url(#infNeon)">
        <g><animateTransform attributeName="transform" type="scale" values="1;1.1;1" dur="2.3s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
          <path d="M-21 0 L-10.5 -18 L10.5 -18 L21 0 L10.5 18 L-10.5 18 Z" fill="#101013" stroke="#B5FF3D" strokeWidth="2" />
          <path d="M-5 -7 L7 0 L-5 7 Z" fill="#B5FF3D" /></g>
      </g>
      <g transform="translate(196,252)" filter="url(#infNeon)">
        <g><animateTransform attributeName="transform" type="translate" values="0 0;0 5;0 0" dur="3.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
          <path d="M-19 0 L-9.5 -16 L9.5 -16 L19 0 L9.5 16 L-9.5 16 Z" fill="#101013" stroke="#2DE2E6" strokeWidth="2" />
          <rect x="-3.5" y="-11" width="7" height="13" rx="3.5" fill="#2DE2E6" /><path d="M-8 -1 a8 8 0 0 0 16 0" fill="none" stroke="#2DE2E6" strokeWidth="2.2" strokeLinecap="round" /><line x1="0" y1="7" x2="0" y2="11" stroke="#2DE2E6" strokeWidth="2.2" strokeLinecap="round" /></g>
      </g>
      <g transform="translate(408,252)" filter="url(#infNeon)">
        <g><animateTransform attributeName="transform" type="scale" values="1;1.18;0.97;1.1;1" keyTimes="0;0.14;0.28;0.42;1" dur="1.7s" repeatCount="indefinite" />
          <path d="M-19 0 L-9.5 -16 L9.5 -16 L19 0 L9.5 16 L-9.5 16 Z" fill="#101013" stroke="#FF2E63" strokeWidth="2" />
          <path d="M0 7 C -8 1, -9 -5, -4.5 -7 C -2 -8, 0 -5, 0 -3.5 C 0 -5, 2 -8, 4.5 -7 C 9 -5, 8 1, 0 7 Z" fill="#FF2E63" /></g>
      </g>
      <g transform="translate(482,300)" filter="url(#infNeon)">
        <g><animateTransform attributeName="transform" type="scale" values="1;1.1;1" dur="2.7s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
          <path d="M-21 0 L-10.5 -18 L10.5 -18 L21 0 L10.5 18 L-10.5 18 Z" fill="#101013" stroke="#B5FF3D" strokeWidth="2" />
          <g fill="none" stroke="#B5FF3D" strokeWidth="2" strokeLinejoin="round"><rect x="-9" y="-7" width="18" height="13" rx="2" /><path d="M-9 -6 L0 1 L9 -6" /></g></g>
      </g>

      {/* recurring earnings node (right) */}
      <g filter="url(#infNeon)">
        <circle cx="525" cy="206" r="26" fill="#0E0E12" stroke="#B5FF3D" strokeWidth="2.5" />
        <text x="525" y="216" textAnchor="middle" fontSize="27" fontWeight="800" fill="#B5FF3D">$</text>
        <circle cx="525" cy="206" r="26" fill="none" stroke="#B5FF3D" strokeWidth="2">
          <animate attributeName="r" values="26;40" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <text x="525" y="250" textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing="0.6" fill="#B5FF3D" opacity="0.85">+30%/MO</text>
      </g>

      {/* === the talking cyber head (creator) — foreground, occludes the tunnel mouth === */}
      <g filter="url(#infNeon)">
        <path d="M222 162 Q300 100 378 162" fill="none" stroke="#FF2E63" strokeWidth="5" strokeLinecap="round" />
        <rect x="212" y="172" width="22" height="48" rx="9" fill="#15151A" stroke="#FF2E63" strokeWidth="2.5" />
        <rect x="366" y="172" width="22" height="48" rx="9" fill="#15151A" stroke="#FF2E63" strokeWidth="2.5" />
        <line x1="300" y1="118" x2="300" y2="94" stroke="#B5FF3D" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="300" cy="89" r="4" fill="#B5FF3D"><animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" /></circle>
        <path d="M236 150 Q236 121 265 118 L335 118 Q364 121 364 150 L364 224 Q364 252 340 264 L330 276 Q300 290 270 276 L260 264 Q236 252 236 224 Z" fill="#0E0E12" stroke="#2DE2E6" strokeWidth="2.5" />
        <rect x="256" y="158" width="88" height="20" rx="10" fill="#0A1518" stroke="#2DE2E6" strokeWidth="1.5" />
        <rect x="260" y="161" width="16" height="14" rx="4" fill="#2DE2E6"><animate attributeName="x" values="260;324;260" dur="2.4s" repeatCount="indefinite" /></rect>
        <path d="M260 266 H340" stroke="#2DE2E6" strokeWidth="1.4" opacity="0.5" />
        <circle cx="262" cy="208" r="3" fill="#2DE2E6" /><circle cx="338" cy="208" r="3" fill="#2DE2E6" />
        <g stroke="#B5FF3D" strokeWidth="4" strokeLinecap="round">
          <line x1="276" y1="252" x2="276" y2="240"><animate attributeName="y2" values="240;230;242;240" dur="0.5s" repeatCount="indefinite" /></line>
          <line x1="288" y1="252" x2="288" y2="234"><animate attributeName="y2" values="234;222;236;234" dur="0.66s" repeatCount="indefinite" /></line>
          <line x1="300" y1="252" x2="300" y2="228"><animate attributeName="y2" values="228;214;230;228" dur="0.8s" repeatCount="indefinite" /></line>
          <line x1="312" y1="252" x2="312" y2="234"><animate attributeName="y2" values="234;223;236;234" dur="0.6s" repeatCount="indefinite" /></line>
          <line x1="324" y1="252" x2="324" y2="240"><animate attributeName="y2" values="240;231;242;240" dur="0.72s" repeatCount="indefinite" /></line>
        </g>
      </g>

      {/* integrated tech labels (no frame) */}
      <text x="14" y="28" fontSize="11" fontWeight="700" letterSpacing="2" fill="#B5FF3D" opacity="0.8">CREATOR_NET</text>
      <text x="586" y="28" textAnchor="end" fontSize="11" fontWeight="700" letterSpacing="2" fill="#B5FF3D" opacity="0.8">SIGNAL // 30</text>

      {/* scanline sweep */}
      <rect x="0" y="0" width="600" height="2" fill="#2DE2E6" opacity="0.18">
        <animateTransform attributeName="transform" type="translate" values="0 -6;0 386" dur="6s" repeatCount="indefinite" />
      </rect>
    </svg>
  )
}

/* ---------- LIGHT — Stats ---------- */

function Stats() {
  return (
    <section data-surface="light" className="bg-white text-ink-900 border-b border-ink-200">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="grid grid-cols-2 md:grid-cols-4">
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
              <div className="text-sm text-ink-600 leading-[1.5]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- DARK ISLAND — How it works ---------- */

function HowItWorks() {
  return (
    <section data-surface="dark" className="bg-ink-900 text-white">
      <div className="max-w-[1400px] mx-auto px-8 py-24">
        <header className="mb-14 max-w-[60ch]">
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-none tracking-[-0.03em] text-white mb-3.5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500">
            From application to first <em>payout.</em>
          </h2>
          <p className="text-ink-400 text-[17px]">
            Three steps. Run on Impact's network so tracking, payouts, and tax handling
            are professional from day one.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map((s) => (
            <div
              key={s.title}
              className="rounded-lg border border-ink-700 bg-ink-800 p-8"
            >
              <div className="font-display text-[72px] font-extrabold text-neon-500 leading-[0.85] tracking-[-0.04em] mb-4">
                {s.num}
              </div>
              <div className="text-xl font-bold text-white mb-2.5">{s.title}</div>
              <div className="text-sm text-ink-400 leading-[1.6] max-w-[38ch]">
                {s.text}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12">
          <Button variant="neon" size="lg" asChild>
            <a href={IMPACT_APPLY_URL} target="_blank" rel="noopener noreferrer">
              Apply via Impact →
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}

/* ---------- LIGHT — Why partner ---------- */

function WhyPartner() {
  return (
    <section data-surface="light" className="bg-white text-ink-900 py-24 px-8">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-14 max-w-[60ch]">
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-none tracking-[-0.03em] text-ink-900 mb-3.5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-pink-500">
            Why partner with <em>iLaunchify.</em>
          </h2>
          <p className="text-ink-600 text-[17px]">
            We pay generously, give you free access to the product you're recommending,
            and invite our top performers into paid brand campaigns.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {BENEFITS.map((b) => (
            <div key={b.title} className="bg-white border border-ink-200 rounded-lg p-8">
              <div className="font-display text-[42px] font-extrabold text-pink-500 leading-none tracking-[-0.03em] mb-4">
                {b.value}
              </div>
              <div className="text-xl font-bold text-ink-900 mb-3">{b.title}</div>
              <div className="text-sm text-ink-600 leading-[1.6]">{b.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- LIGHT — Who this is for ---------- */

function WhoItsFor() {
  return (
    <section
      data-surface="light"
      className="bg-white text-ink-900 py-24 px-8 border-t border-ink-200"
    >
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-12 max-w-[60ch]">
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-none tracking-[-0.03em] text-ink-900 mb-3.5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-pink-500">
            Who we're <em>looking for.</em>
          </h2>
          <p className="text-ink-600 text-[17px]">
            You don't need a million followers. You need an audience who's curious
            about building things — and trusts your recommendations.
          </p>
        </header>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
          {AUDIENCES.map((a) => (
            <div
              key={a.title}
              className="rounded-lg border border-ink-200 bg-white/50 p-5"
            >
              <div className="text-2xl mb-2.5">{a.icon}</div>
              <div className="text-sm font-bold text-ink-900 mb-1.5">{a.title}</div>
              <div className="text-xs text-ink-600 leading-[1.55]">{a.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- LIGHT — FAQ ---------- */

function Faq() {
  return (
    <section
      id="faq"
      data-surface="light"
      className="bg-white text-ink-900 py-24 px-8 border-t border-ink-200"
    >
      <div className="max-w-[900px] mx-auto">
        <header className="mb-12">
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-none tracking-[-0.03em] text-ink-900 mb-3.5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-pink-500">
            Frequently asked <em>questions.</em>
          </h2>
        </header>
        <div className="divide-y divide-ink-200 border-y border-ink-200">
          {FAQS.map((q) => (
            <details key={q.q} className="group py-6">
              <summary className="flex cursor-pointer items-start justify-between gap-6 list-none">
                <span className="text-lg font-bold text-ink-900 leading-snug">
                  {q.q}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-1 text-2xl text-pink-500 font-light leading-none transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="mt-3.5 text-[15px] text-ink-700 leading-[1.65] max-w-[64ch]">
                {q.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- LIGHT cream — Contact card ---------- */

function ContactCard() {
  return (
    <section
      data-surface="light"
      className="bg-white text-ink-900 py-20 px-8 border-t border-ink-200"
    >
      <div className="max-w-[900px] mx-auto rounded-2xl border border-ink-200 bg-white/60 px-8 py-10 sm:px-12 sm:py-14 flex flex-col sm:flex-row items-start sm:items-center gap-7 sm:gap-12">
        <div
          aria-hidden="true"
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-pink-500 text-3xl"
        >
          ✋
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.1em] text-pink-700 mb-2">
            Partnerships team
          </div>
          <p className="font-serif italic text-2xl sm:text-3xl font-normal leading-[1.25] tracking-[-0.015em] text-ink-900 mb-5">
            "Any questions about the program? Send us a note — we read every email."
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-pink-700 hover:text-pink-500 transition-colors"
          >
            <span aria-hidden="true">✉</span>
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </section>
  )
}

/* ---------- DARK — Final CTA ---------- */

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
          Grow with <em>iLaunchify.</em>
        </h2>
        <p className="text-ink-400 text-lg mb-10 max-w-[54ch] mx-auto">
          Founding cohort is open. Application takes about ten minutes. We respond
          within fourteen days with a personalized welcome and your tracking links.
        </p>
        <Button variant="neon" size="lg" asChild>
          <a href={IMPACT_APPLY_URL} target="_blank" rel="noopener noreferrer">
            Apply via Impact →
          </a>
        </Button>
      </div>
    </section>
  )
}

/* ---------- data ---------- */

const STATS = [
  {
    value: '30%',
    label: 'commission on every subscription you refer — paid recurring for 12 months',
  },
  {
    value: '12mo',
    label: 'recurring payout window on Builder + Agency subscriptions',
  },
  {
    value: '$0',
    label: 'cap on earnings — top performers are routed into paid collab campaigns',
  },
  {
    value: 'Free',
    label: 'Builder tier access while you’re an active partner — use the product you recommend',
  },
]

const STEPS = [
  {
    num: '01',
    title: 'Sign up via Impact',
    text: 'Apply to our official program on Impact. Fast, secure, professional — same network used by Shopify, Canva, Notion. We review within fourteen days.',
  },
  {
    num: '02',
    title: 'Get your creator kit',
    text: 'On approval, your Impact dashboard unlocks tracking links, promo codes, screenshot packs, and short-form video assets for TikTok / Reels / Shorts.',
  },
  {
    num: '03',
    title: 'Track and earn',
    text: 'Real-time conversion tracking. Payouts cycle ~60 days after the month a referral converts (Impact-standard) to allow for refund-period verification.',
  },
]

const BENEFITS = [
  {
    value: '30%',
    title: 'Generous commission',
    text: 'Earn 30% commission on every Builder ($49/mo) and Agency ($199/mo) subscription you refer — recurring for the first 12 months. Tracked transparently on Impact, no manual reporting on your side.',
  },
  {
    value: 'Free',
    title: 'Free Builder access',
    text: 'Active partners get complimentary Builder-tier access to the platform so you can use what you recommend. Pin brand fonts, save palettes, run the canvas studio yourself.',
  },
  {
    value: 'Plus',
    title: 'Exclusive collaboration fees',
    text: 'Top-performing partners are selectively invited into paid brand campaigns — sponsored launches, video collabs, and niche-specific takeovers with additional flat fees beyond standard commissions.',
  },
]

const AUDIENCES = [
  {
    icon: '🎥',
    title: 'YouTubers',
    text: 'CPG, packaging design, brand-building, side-hustle, or founder-journey channels.',
  },
  {
    icon: '📱',
    title: 'TikTok / Instagram',
    text: 'Short-form creators covering small-batch food, beauty, supplements, or pet products.',
  },
  {
    icon: '📰',
    title: 'Newsletter writers',
    text: 'Indie operators publishing to CPG founders, DTC builders, or design audiences.',
  },
  {
    icon: '🎙',
    title: 'Podcast hosts',
    text: 'CPG, founder, design, or operations podcasts with engaged listener bases.',
  },
  {
    icon: '🎓',
    title: 'Design educators',
    text: 'Instructors teaching packaging, label design, brand identity, or CPG fundamentals.',
  },
  {
    icon: '✍️',
    title: 'CPG analysts',
    text: 'Industry writers covering the small-batch CPG, on-demand, or DTC packaging spaces.',
  },
  {
    icon: '🏢',
    title: 'Agencies',
    text: 'Branding, creative, or DTC consultancies whose clients are launching CPG products.',
  },
  {
    icon: '🛠️',
    title: 'Builders',
    text: 'Anyone with an audience of people actively building or shipping their own product.',
  },
]

const FAQS = [
  {
    q: 'What is the iLaunchify Influencer Program?',
    a: 'A creator partnership where you earn recurring commission for every subscription you refer to iLaunchify. We run it on Impact (the same affiliate network used by Shopify, Canva, and Notion) so tracking, payouts, and 1099 tax handling are professional from day one. You promote authentically; we handle the back office.',
  },
  {
    q: 'How do I qualify?',
    a: 'We welcome creators, writers, podcasters, educators, and agencies whose audience overlaps with the CPG creator persona — small-batch founders, packaging-curious, DTC builders, design students. We review applications based on content quality, audience engagement, and topical fit. Following sizes are less important than relevance.',
  },
  {
    q: 'How much does it pay?',
    a: 'Thirty percent commission on every Builder ($49/mo) and Agency ($199/mo) subscription you refer — paid recurring for the first 12 months of each referred customer’s lifetime. So one Agency referral that stays a year nets you about $716 over twelve months. Top performers are additionally invited into paid brand campaigns with flat-fee structures.',
  },
  {
    q: 'When and how do I get paid?',
    a: 'Payments process through Impact. Payouts cycle approximately 60 days after the end of the month in which the qualified conversion occurred — Impact-standard, to allow for subscription refund verification. Impact handles payment delivery to your preferred method (ACH, PayPal, or wire) and issues year-end 1099s where required.',
  },
  {
    q: 'Can I use my own promo codes and assets?',
    a: 'Yes. On approval, your Impact dashboard unlocks personalized tracking links, dedicated promo codes (e.g., YOURNAME10), and a creative kit with logos, screenshots, short-form video clips, and product-shot photography you can use in your content. Custom asset requests are welcome — email partnerships@ilaunchify.com.',
  },
]
