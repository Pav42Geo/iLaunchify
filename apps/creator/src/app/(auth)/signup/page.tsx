import Link from 'next/link'
import { Sparkles, ShieldCheck, Truck } from 'lucide-react'
import { SignupForm } from './SignupForm'

export const metadata = { title: 'Start your creator account — iLaunchify' }

/**
 * /signup — creator account creation.
 *
 * Rebuilt 2026-05-28 on the locked design system (pink #FF2E63 + black pill
 * button + neon green on dark + Bricolage display + Fraunces italic
 * emphasis + cream surface). The previous version used legacy zinc-* tokens
 * that don't match the marketing app.
 *
 * Accepts query-param carryover from apps/marketing:
 *   ?template=<slug>&plan=maker|builder&billing=monthly|annual
 *   ?flavor=…&size=…&packaging=…&quantity=…
 *
 * The form ignores unknown params (no schema error), so even before the
 * carryover is wired into the launch checklist, deep links land on a real
 * page that converts.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string
    brandName?: string
    template?: string
    plan?: string
    billing?: string
  }>
}) {
  const { email, brandName, plan } = await searchParams

  return (
    <div className="min-h-screen bg-cream grid grid-cols-1 md:grid-cols-[1fr_1fr]">
      {/* Left — marketing panel (dark) */}
      <aside
        data-surface="dark"
        className="hidden md:flex flex-col justify-between bg-ink-900 text-white p-12 relative overflow-hidden"
      >
        {/* Pink radial glow */}
        <div
          aria-hidden="true"
          className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, var(--color-pink-500) 0%, transparent 60%)',
          }}
        />

        <div className="relative">
          <Link href="/" className="flex items-center gap-[7px] mb-12">
            <span className="w-[26px] h-[26px] rounded-md bg-pink-500" />
            <span className="font-display text-[20px] font-extrabold tracking-[-0.04em] text-white">
              iLaunchify
            </span>
          </Link>

          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500 mb-4">
            Creator account
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-extrabold leading-[0.95] tracking-[-0.035em] mb-5 max-w-[14ch]">
            Bring your idea to{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
              shelves.
            </span>
          </h1>
          <p className="text-ink-300 text-lg leading-[1.55] max-w-[36ch]">
            Pick a product. Customize the recipe. Brand it. We orchestrate
            manufacturing, printing, and fulfillment.
          </p>
        </div>

        <div className="relative grid grid-cols-3 gap-4 mt-12 pt-8 border-t border-white/10">
          <Feature icon={Sparkles} label="Design Studio" />
          <Feature icon={ShieldCheck} label="FDA-compliant" />
          <Feature icon={Truck} label="Vetted partners" />
        </div>
      </aside>

      {/* Right — signup form (light) */}
      <main className="flex items-start md:items-center justify-center p-6 md:p-12 pt-12">
        <div className="w-full max-w-[440px]">
          {/* Mobile-only logo */}
          <Link
            href="/"
            className="md:hidden flex items-center gap-[7px] mb-7"
          >
            <span className="w-[24px] h-[24px] rounded-md bg-pink-500" />
            <span className="font-display text-[18px] font-extrabold tracking-[-0.04em] text-ink-900">
              iLaunchify
            </span>
          </Link>

          <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-ink-900 mb-2">
            Create your account
          </h2>
          <p className="text-[14px] text-ink-600 leading-[1.55] mb-7">
            We&apos;ll send a magic link to verify your email. Already have an
            account?{' '}
            <a
              href="/login"
              className="font-semibold text-pink-700 hover:text-pink-600"
            >
              Sign in
            </a>
            .
          </p>

          {plan && (
            <div className="mb-5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] bg-pink-50 text-pink-700 px-2.5 py-1 rounded-pill">
              Plan selected · {plan}
            </div>
          )}

          <div className="bg-white border border-ink-200 rounded-2xl p-7">
            <SignupForm prefillEmail={email} prefillBrand={brandName} />
          </div>

          <p className="mt-5 text-[12px] text-ink-500 leading-[1.5]">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="text-ink-900 hover:underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-ink-900 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  )
}

function Feature({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ strokeWidth?: number; className?: string }>
  label: string
}) {
  return (
    <div>
      <span className="w-9 h-9 rounded-pill bg-white/10 border border-white/20 flex items-center justify-center mb-2.5">
        <Icon strokeWidth={2} className="w-4 h-4 text-neon-500" />
      </span>
      <p className="text-[13px] font-semibold text-white/90 leading-tight">
        {label}
      </p>
    </div>
  )
}
