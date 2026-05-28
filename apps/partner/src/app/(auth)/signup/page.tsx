import Link from 'next/link'
import { Factory, ShieldCheck, Wallet } from 'lucide-react'
import { SignupForm } from './SignupForm'
import { marketingUrl } from '@/lib/marketing-url'

export const metadata = {
  title: 'Apply to join the iLaunchify partner network',
}

/**
 * Partner /signup — production-partner application form.
 *
 * Rebuilt 2026-05-28 on the locked design system (matches creator /signup
 * structure: 2-column split with dark marketing panel on the left, light
 * form on the right). Partner-side accent: neon green on the dark panel.
 *
 * Logo top-left lands the visitor on apps/marketing's /business landing
 * (the public partner-side page), not /login or /dashboard.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; companyName?: string }>
}) {
  const { email, companyName } = await searchParams

  return (
    <div className="min-h-screen bg-cream grid grid-cols-1 md:grid-cols-[1fr_1fr]">
      {/* Left — dark marketing panel */}
      <aside
        data-surface="dark"
        className="hidden md:flex flex-col justify-between bg-ink-900 text-white p-12 relative overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full opacity-25 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, var(--color-neon-500) 0%, transparent 60%)',
          }}
        />

        <div className="relative">
          <a
            href={marketingUrl('/business')}
            className="flex items-center gap-[7px] mb-12"
          >
            <span className="w-[26px] h-[26px] rounded-md bg-pink-500" />
            <span className="font-display text-[20px] font-extrabold tracking-[-0.04em] text-white">
              iLaunchify
            </span>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-[0.12em] text-neon-500 border border-neon-500/40 rounded-pill px-2 py-0.5">
              Partners
            </span>
          </a>

          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500 mb-4">
            Partner application
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-extrabold leading-[0.95] tracking-[-0.035em] mb-5 max-w-[16ch]">
            Manufacture for the{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
              next generation
            </span>{' '}
            of brands.
          </h1>
          <p className="text-ink-300 text-lg leading-[1.55] max-w-[38ch]">
            Bring your facility online and get matched with brand-ready orders.
            No cold outreach, no contracts to chase — just routed work.
          </p>
        </div>

        <div className="relative grid grid-cols-3 gap-4 mt-12 pt-8 border-t border-white/10">
          <Feature icon={Factory} label="Routed orders" />
          <Feature icon={ShieldCheck} label="Vetted creators" />
          <Feature icon={Wallet} label="Stripe payouts" />
        </div>
      </aside>

      {/* Right — application form */}
      <main className="flex items-start md:items-center justify-center p-6 md:p-12 pt-12">
        <div className="w-full max-w-[440px]">
          {/* Mobile-only logo */}
          <a
            href={marketingUrl('/business')}
            className="md:hidden flex items-center gap-[7px] mb-7"
          >
            <span className="w-[24px] h-[24px] rounded-md bg-pink-500" />
            <span className="font-display text-[18px] font-extrabold tracking-[-0.04em] text-ink-900">
              iLaunchify
            </span>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-[0.1em] text-pink-700 border border-pink-200 rounded-pill px-2 py-0.5">
              Partners
            </span>
          </a>

          <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-ink-900 mb-2">
            Apply to join
          </h2>
          <p className="text-[14px] text-ink-600 leading-[1.55] mb-7">
            We&apos;ll send a magic link to verify your email, then walk you
            through partner verification. Already approved?{' '}
            <Link
              href="/login"
              className="font-semibold text-pink-700 hover:text-pink-600"
            >
              Sign in
            </Link>
            .
          </p>

          <div className="bg-white border border-ink-200 rounded-2xl p-7">
            <SignupForm prefillEmail={email} prefillCompany={companyName} />
          </div>

          <p className="mt-5 text-[12px] text-ink-500 leading-[1.5]">
            By applying you agree to our{' '}
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
