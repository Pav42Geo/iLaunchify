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
