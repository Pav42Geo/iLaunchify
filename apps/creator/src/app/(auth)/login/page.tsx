import Link from 'next/link'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — iLaunchify' }

/**
 * /login — creator + partner sign-in (single form, role detected server-side).
 *
 * Rebuilt 2026-05-28 on the locked design system. Centered single-column
 * layout on cream surface with a top logo, large Bricolage headline + pink
 * Fraunces italic emphasis, and a white card holding the form.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}) {
  const { error, callbackUrl } = await searchParams

  const providers = {
    google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    resend: !!(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM),
    credentials:
      process.env.NODE_ENV !== 'production' &&
      !process.env.AUTH_GOOGLE_ID &&
      !process.env.AUTH_RESEND_KEY,
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="flex items-center gap-[7px] w-fit">
          <span className="w-[26px] h-[26px] rounded-md bg-pink-500" />
          <span className="font-display text-[20px] font-extrabold tracking-[-0.04em] text-ink-900">
            iLaunchify
          </span>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12 pt-2">
        <div className="w-full max-w-[440px]">
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-[0.95] tracking-[-0.03em] text-ink-900 mb-3">
            Welcome{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
              back.
            </span>
          </h1>
          <p className="text-[14px] text-ink-600 leading-[1.55] mb-7">
            {providers.credentials
              ? 'Local dev — enter a seeded user email to sign in.'
              : 'Use Google or your email to sign in.'}
          </p>

          {error === 'unauthorized' && (
            <div className="mb-5 rounded-lg border border-pink-200 bg-pink-50 px-4 py-3 text-[13px] text-pink-700">
              You don&apos;t have access to that area.
            </div>
          )}

          <div className="bg-white border border-ink-200 rounded-2xl p-7">
            <LoginForm callbackUrl={callbackUrl} providers={providers} />
          </div>

          <p className="mt-5 text-center text-[13px] text-ink-600">
            New to iLaunchify?{' '}
            <Link
              href="/signup"
              className="font-semibold text-pink-700 hover:text-pink-600"
            >
              Create an account →
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
