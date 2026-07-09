import Link from 'next/link'
import { Factory, ShieldCheck, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Brand } from '@ilaunchify/ui'
import { getPublicBrandLogos } from '@ilaunchify/db'
import { LoginForm } from './LoginForm'
import { marketingUrl } from '@/lib/marketing-url'

export const metadata = { title: 'Sign in — iLaunchify Partners' }

/**
 * Partner /login — same 2-column split skin as the application (/partners/apply):
 * dark neon-accent marketing panel on the left, light form on the right.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  const logos = await getPublicBrandLogos()

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[var(--bg-hero)] md:h-screen md:grid-cols-[1fr_1fr]">
      {/* Left — dark marketing panel (fills the viewport height) */}
      <aside
        data-surface="dark"
        className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white md:flex"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, var(--color-neon-500) 0%, transparent 60%)' }}
        />

        <div className="relative">
          <a href={marketingUrl('/business')} className="mb-12 flex items-center">
            <Brand
              imageSrc={logos.fullDark}
              label="iLaunchify"
              sublabel="Business"
              wordmarkClassName="text-white"
              sublabelClassName="text-neon-500"
            />
          </a>

          <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500">
            Partner sign-in
          </div>
          <h1 className="mb-5 max-w-[16ch] font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.035em] md:text-6xl">
            Welcome{' '}
            <span className="font-serif font-medium italic tracking-[-0.025em] text-pink-500">
              back.
            </span>
          </h1>
          <p className="max-w-[38ch] text-lg leading-[1.55] text-ink-300">
            Sign in to pick up your orders, dispatches, and setup — right where you left off.
          </p>
        </div>

        <div className="relative mt-12 grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
          <Feature icon={Factory} label="Routed orders" />
          <Feature icon={ShieldCheck} label="Vetted creators" />
          <Feature icon={Wallet} label="Stripe payouts" />
        </div>
      </aside>

      {/* Right — sign-in form */}
      <main className="flex items-start justify-center p-6 pt-10 md:items-center md:p-12">
        <div className="w-full max-w-[440px]">
          {/* Mobile-only logo */}
          <a href={marketingUrl('/business')} className="mb-7 flex items-center md:hidden">
            <Brand imageSrc={logos.fullLight} sublabel="Business" sublabelClassName="text-pink-700" />
          </a>

          <h2 className="text-ui-display mb-1.5 text-ink-900">Welcome back</h2>
          <p className="mb-6 text-[14px] leading-[1.5] text-ink-600">
            Use the email you applied with — we&apos;ll send you a magic link.
          </p>

          <div className="rounded-2xl border border-ink-200 bg-white p-7">
            <LoginForm prefillEmail={email} />
          </div>

          <p className="mt-5 text-center text-[13px] text-ink-600">
            New here?{' '}
            <Link
              href="/partners/apply"
              className="font-semibold text-pink-700 hover:text-pink-600"
            >
              Apply to join →
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}

function Feature({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div>
      <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-pill border border-white/20 bg-white/10">
        <Icon strokeWidth={2} className="h-4 w-4 text-neon-500" />
      </span>
      <p className="text-[13px] font-semibold leading-tight text-white/90">{label}</p>
    </div>
  )
}
