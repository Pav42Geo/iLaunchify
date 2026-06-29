import Link from 'next/link'
import { ArrowRight, ImagePlus } from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { LandingHeader } from '@/components/LandingHeader'
import { LandingFooter } from '@/components/LandingFooter'
import { Reveal } from '@/components/Reveal'
import { ProcessSteps } from '@/components/ProcessSteps'
import { ProductShot } from '@/components/ProductShot'
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
      <section className="relative overflow-hidden bg-white">
        <style>{`
          .hiw-grid{position:absolute;left:50%;bottom:-18%;width:170%;height:60%;
            transform:translateX(-50%) perspective(460px) rotateX(72deg);transform-origin:50% 100%;
            background-image:linear-gradient(to right,rgba(154,130,224,0.22) 1px,transparent 1px),
              linear-gradient(to top,rgba(255,46,99,0.16) 1px,transparent 1px);
            background-size:54px 54px;
            -webkit-mask-image:linear-gradient(to top,#000 0%,transparent 82%);
            mask-image:linear-gradient(to top,#000 0%,transparent 82%);
            animation:hiwGrid 6s linear infinite;}
          @keyframes hiwGrid{from{background-position:0 0}to{background-position:0 54px}}
          @media (prefers-reduced-motion:reduce){.hiw-grid{animation:none}}
        `}</style>
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(680px 420px at 10% -5%, rgba(255,46,99,0.08), transparent 60%), radial-gradient(640px 440px at 95% 6%, rgba(110,139,255,0.09), transparent 62%), radial-gradient(760px 540px at 60% 125%, rgba(154,130,224,0.12), transparent 60%)' }} />
          <div className="hiw-grid" />
        </div>
        <div className="relative z-10 mx-auto grid max-w-[1200px] items-center gap-10 px-6 pt-16 pb-14 sm:pt-20 lg:grid-cols-[1fr_0.92fr] lg:gap-14">
          <div className="max-w-2xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700">
              How it works
            </div>
            <h1 className="mb-5 font-display text-[calc(2.25rem*var(--landing-hero-scale))] sm:text-[calc(3rem*var(--landing-hero-scale))] md:text-[calc(3.75rem*var(--landing-hero-scale))] font-extrabold leading-[1] tracking-[-0.035em]">
              From idea to{' '}
              <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">shelf-ready,</span>{' '}
              without the supply-chain headache.
            </h1>
            <p className="max-w-[60ch] text-[calc(1.125rem*var(--landing-deck-scale))] sm:text-[calc(1.25rem*var(--landing-deck-scale))] leading-[1.55] text-ink-700">
              You pick a starter template. You customize the label in the Design Studio. You approve a sample. We orchestrate every manufacturer, label printer, co-packer, and warehouse in the production graph — so you launch a real CPG brand without becoming a CPG operator.
            </p>
          </div>
          <div className="hidden lg:block">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[28px] border border-ink-200 bg-ink-50 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.4)]">
              <ProductShot src="/how-it-works/hero.jpg" alt="How iLaunchify works" className="absolute inset-0 h-full w-full object-cover">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-400">
                  <ImagePlus strokeWidth={1.75} className="h-7 w-7" />
                  <span className="text-[13px] font-medium text-ink-500">Drop your hero image here</span>
                  <span className="rounded bg-ink-100 px-2 py-1 text-[11px] text-ink-400">public/how-it-works/hero.jpg</span>
                </div>
              </ProductShot>
            </div>
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
