// Welcome screen — first thing a new partner sees after signup/login.
// Per docs/PARTNER_ONBOARDING.md §7.2.
//
// Shown ONCE: this route is the first stop for a partner with no onboarding
// progress yet. After they click "Continue setup", subsequent visits to
// /dashboard land on Application Status (read-only summary) instead of here.
//
// Content contract (2026-07-12): this page mirrors what the 5-step
// OnboardingWizard ACTUALLY collects — keep the two in sync. EIN / bank
// details are entered on Stripe's hosted Connect form (step 5), never
// uploaded to us; W-9/W-8 is not collected at all. Style mirrors the wizard +
// status page (editorial hero, pink eyebrow, Fraunces italic emphasis).
//
// Auth + role check happens in the parent (onboarding) layout.

import { Button } from '@ilaunchify/ui'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { CalendarClock, FileText, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { ContinueSetupButton } from './ContinueButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Welcome — iLaunchify Partners' }

// The five wizard steps, described exactly as the wizard collects them.
const STEPS: { title: string; desc: React.ReactNode }[] = [
  {
    title: 'Your business',
    desc: 'Which markets you sell into, where you operate from, and what you do — manufacturing, co-packing, packaging printing, or fulfillment.',
  },
  {
    title: 'Your company',
    desc: (
      <>
        Legal entity (DBA + legal name), contact and facility address, plus three documents:{' '}
        <b>certificate of incorporation</b>, <b>business license</b>, and{' '}
        <b>general liability insurance</b> with its coverage amount.
      </>
    ),
  },
  {
    title: 'What you can do',
    desc: 'Structured capability picks per service — this is the data our matching engine routes creator orders on, not free text.',
  },
  {
    title: 'Certifications',
    desc: 'Declare the certifications you carry (NSF, USDA Organic, cGMP, Kosher, …). You attach the PDFs + expiry dates after approval.',
  },
  {
    title: 'Payment & contract',
    desc: (
      <>
        Connect payouts via Stripe and accept the partner agreement. Stripe&apos;s hosted form
        (~10&nbsp;min) collects your <b>EIN / tax ID</b>, owner verification, and{' '}
        <b>bank account</b> — that part never touches our servers.
      </>
    ),
  },
]

export default async function WelcomePage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { companyName: true },
  })

  const companyName = partner?.companyName ?? 'partner'

  return (
    <main className="mx-auto max-w-[640px] px-5 pb-24 pt-10">
      {/* Editorial hero — same contained grid-pattern banner as /onboarding/status */}
      <section className="relative overflow-hidden rounded-3xl border border-ink-100 bg-white px-6 py-12 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(#FFD0E0 1px, transparent 1px), linear-gradient(90deg, #FFD0E0 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            opacity: 0.55,
            maskImage: 'radial-gradient(110% 95% at 50% -8%, #000 26%, transparent 76%)',
            WebkitMaskImage: 'radial-gradient(110% 95% at 50% -8%, #000 26%, transparent 76%)',
          }}
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700">
            Partner onboarding
          </p>
          <h1 className="mx-auto mt-2 font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-4xl">
            Welcome,{' '}
            <span className="font-serif font-medium italic tracking-[-0.02em] text-pink-500">
              {companyName}.
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ink-700">
            Five short steps and your application is in review. Everything saves as you go — leave
            and come back any time.
          </p>
        </div>
      </section>

      {/* What to expect */}
      <section className="mt-6 rounded-[20px] border border-ink-200 bg-white p-7 shadow-[0_18px_50px_-28px_rgba(20,20,25,0.35)]">
        <div className="flex items-start gap-4">
          <CalendarClock className="mt-1 h-6 w-6 flex-shrink-0 text-pink-700" />
          <div>
            <h2 className="font-semibold text-ink-900">Here&apos;s what to expect</h2>
            <p className="mt-2 text-ui-body text-ink-600">
              The form takes about <strong>10–15 minutes</strong> if you have your documents ready.
              Our verification team typically reviews within <strong>3–5 business days</strong> —
              you&apos;ll see live status the whole way.
            </p>
          </div>
        </div>
      </section>

      {/* The five steps — mirrors OnboardingWizard exactly */}
      <section className="mt-6 rounded-[20px] border border-ink-200 bg-white p-7 shadow-[0_18px_50px_-28px_rgba(20,20,25,0.35)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-pink-700">
          The five steps
        </div>
        <h2 className="mb-4 mt-2 font-display text-[22px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-900">
          What we&apos;ll <span className="font-serif font-medium italic text-pink-500">ask.</span>
        </h2>
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink-900 text-[11px] font-bold text-white"
              >
                {i + 1}
              </span>
              <div>
                <div className="text-[13.5px] font-bold text-ink-900">{s.title}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-600">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded-xl bg-ink-50 px-4 py-3">
          <div className="flex items-start gap-2 text-[12.5px] text-ink-700">
            <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
            <span>
              <strong>Have ready:</strong> certificate of incorporation, business license, and
              liability insurance certificate as PDFs, your facility address, and — for the Stripe
              step — your EIN and bank details.
            </span>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-2 rounded-xl bg-success-50 px-4 py-3 text-[12.5px] text-success-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            We review your documents <strong>privately</strong>. Only iLaunchify admins see the
            PDFs — creators only ever see a verified badge on your products.
          </span>
        </p>
      </section>

      <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <ContinueSetupButton />
        <Button asChild variant="outline" size="lg">
          <Link href="/api/auth/signout">I&apos;ll come back later</Link>
        </Button>
      </div>

      <p className="mt-6 text-center text-ui-caption text-ink-500">
        <Link href="/help/verification" className="underline">
          How does verification work?
        </Link>{' '}
        ·{' '}
        <a href="mailto:partners@ilaunchify.com" className="underline">
          Talk to our team
        </a>
      </p>
    </main>
  )
}
