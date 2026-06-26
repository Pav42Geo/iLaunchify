import Link from 'next/link'
import { Brand } from '@ilaunchify/ui'
import { getPublicBrandLogos } from '@ilaunchify/db'
import { LoginForm } from './LoginForm'
import { marketingUrl } from '@/lib/marketing-url'

export const metadata = { title: 'Sign in — Partners' }

/**
 * Partner /login.
 *
 * Rebuilt 2026-05-28 on the locked design system. Centered single-column
 * cream surface; logo top-left lands the visitor on the public partner
 * landing (apps/marketing/business) — not /login or /dashboard.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  const logos = await getPublicBrandLogos()

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-hero)]">
      <header className="px-6 py-5">
        <a
          href={marketingUrl('/business')}
          className="flex items-center gap-[9px] w-fit"
        >
          <Brand imageSrc={logos.fullLight} sublabel="Business" sublabelClassName="text-pink-700" />
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12 pt-2">
        <div className="w-full max-w-[440px]">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold leading-[1.0] tracking-[-0.03em] text-ink-900 mb-3">
            Welcome{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
              back.
            </span>
          </h1>
          <p className="text-[14px] text-ink-600 leading-[1.55] mb-7">
            Use the email you applied with. We&apos;ll send you a magic link.
          </p>

          <div className="bg-white border border-ink-200 rounded-2xl p-7">
            <LoginForm prefillEmail={email} />
          </div>

          <p className="mt-5 text-center text-[13px] text-ink-600">
            New here?{' '}
            <Link
              href="/signup"
              className="font-semibold text-pink-700 hover:text-pink-600"
            >
              Apply to join →
            </Link>
          </p>
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-[12px] text-ink-500">
        © 2026 iLaunchify
      </footer>
    </div>
  )
}
