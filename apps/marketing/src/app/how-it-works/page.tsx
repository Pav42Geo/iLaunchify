import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { LandingHeader } from '@/components/LandingHeader'
import { LandingFooter } from '@/components/LandingFooter'
import { Reveal } from '@/components/Reveal'
import { ProcessSteps } from '@/components/ProcessSteps'
import { getMarketingSession, headerPropsFromSession } from '@/lib/session'

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
/** Light orchestration network — faded hero graphic (your order → partners). */
function HiwOrchestration() {
  const core = { x: 300, y: 240 }
  const nodes = [
    { x: 300, y: 70, c: '#FF2E63', label: 'Your channel' },
    { x: 110, y: 120, c: '#6E8BFF', label: 'Manufacturer' },
    { x: 470, y: 110, c: '#9A82E0', label: 'Printer' },
    { x: 120, y: 380, c: '#16A4AA', label: 'Co-packer' },
    { x: 460, y: 380, c: '#86C42B', label: 'Warehouse' },
  ]
  return (
    <svg viewBox="0 0 560 480" className="h-auto w-full max-w-[620px]" role="img" aria-label="orchestration network">
      <g fill="none" stroke="#9A82E0" strokeOpacity="0.28">
        <ellipse cx="300" cy="246" rx="232" ry="98" />
        <ellipse cx="300" cy="246" rx="160" ry="160" strokeOpacity="0.14" />
      </g>
      {nodes.map((n, i) => (
        <g key={`l${i}`}>
          <line x1={core.x} y1={core.y} x2={n.x} y2={n.y} stroke={n.c} strokeOpacity="0.4" strokeWidth="1.6" />
          <line className="hiw-flow" x1={core.x} y1={core.y} x2={n.x} y2={n.y} stroke={n.c} strokeWidth="1.6" />
        </g>
      ))}
      {nodes.map((n, i) => (
        <g key={`n${i}`} className="hiw-node" style={{ animationDelay: `${i * 0.5}s` }}>
          <circle cx={n.x} cy={n.y} r="16" fill={n.c} opacity="0.13" />
          <circle cx={n.x} cy={n.y} r="9" fill={n.c} />
          <text x={n.x} y={n.y < 100 ? n.y - 18 : n.y + 26} textAnchor="middle" fontSize="12" fontWeight="700" letterSpacing="0.4" fill="#18181A" fillOpacity="0.78">{n.label}</text>
        </g>
      ))}
      <circle cx={core.x} cy={core.y} r="54" fill="#FF2E63" opacity="0.1" />
      <g className="hiw-node">
        <circle cx={core.x} cy={core.y} r="36" fill="#FF2E63" />
        <g transform={`translate(${core.x},${core.y})`} stroke="#ffffff" strokeWidth="3.4" fill="none" strokeLinejoin="round" strokeLinecap="round">
          <path d="M0 -15 L17 -5 L0 5 L-17 -5 Z" /><path d="M-17 3 L0 13 L17 3" />
        </g>
      </g>
      <text x={core.x} y={core.y + 60} textAnchor="middle" fontSize="12" fontWeight="800" letterSpacing="1" fill="#18181A">YOUR ORDER</text>
    </svg>
  )
}

export default async function HowItWorksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, never>>
}) {
  await searchParams
  const session = await getMarketingSession()
  const { user, brands, activeBrandId } = headerPropsFromSession(session)

  return (
    <>
      <LandingHeader
        user={user}
        brands={brands}
        activeBrandId={activeBrandId}
        hasUnreadNotifications={false}
      />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <style>{`
          .hiw-float{animation:hiwFloat 9s ease-in-out infinite}
          @keyframes hiwFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
          .hiw-node{transform-box:fill-box;transform-origin:center;animation:hiwPulse 3.4s ease-in-out infinite}
          @keyframes hiwPulse{0%,100%{opacity:.82}50%{opacity:1}}
          .hiw-flow{stroke-dasharray:4 11;animation:hiwDash 1.5s linear infinite}
          @keyframes hiwDash{to{stroke-dashoffset:-30}}
          @media (prefers-reduced-motion:reduce){.hiw-float,.hiw-node,.hiw-flow{animation:none}}
        `}</style>
        <div className="relative mx-auto max-w-[1200px] px-6 pt-16 pb-12 sm:pt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[48%] items-center justify-end lg:flex"
            style={{ maskImage: 'linear-gradient(to right, transparent, #000 46%)', WebkitMaskImage: 'linear-gradient(to right, transparent, #000 46%)' }}
          >
            <div className="hiw-float w-full">
              <HiwOrchestration />
            </div>
          </div>
          <div className="relative z-10 max-w-2xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700">
              How it works
            </div>
            <h1 className="mb-5 font-display text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1] tracking-[-0.035em]">
              From idea to{' '}
              <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">shelf-ready,</span>{' '}
              without the supply-chain headache.
            </h1>
            <p className="max-w-[60ch] text-lg sm:text-xl leading-[1.55] text-ink-700">
              You pick a starter template. You customize the label in the Design Studio. You approve a sample. We orchestrate every manufacturer, label printer, co-packer, and warehouse in the production graph — so you launch a real CPG brand without becoming a CPG operator.
            </p>
          </div>
        </div>
      </section>

      {/* ===================== 8-STEP PROCESS ===================== */}
      <ProcessSteps />


      {/* FINAL DARK CTA */}
      <Reveal>
      <section data-surface="dark" className="bg-ink-900 text-white">
        <div className="max-w-[1200px] mx-auto px-6 py-24 text-center">
          <h2 className="font-display text-4xl sm:text-6xl font-extrabold leading-[0.95] tracking-[-0.035em] mb-5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500">
            Now you know.{' '}
            <em>Want to launch?</em>
          </h2>
          <p className="text-ink-300 text-lg max-w-[52ch] mx-auto mb-9">
            Browse the marketplace. Pick a starter. The Design Studio opens in
            your browser, your card stays uncharged until every partner approves
            your manifest, and your first sample is half-off.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="neon" size="xl">
              <Link href="/marketplace">
                Browse the marketplace
                <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="xl"
              className="border-ink-700 text-ink-200 hover:border-ink-500 hover:text-white hover:bg-ink-800"
            >
              <Link href="/pricing">See pricing →</Link>
            </Button>
          </div>
        </div>
      </section>
      </Reveal>

      <LandingFooter />
    </>
  )
}
