import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — iLaunchify' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}) {
  const { error, callbackUrl } = await searchParams

  // Detect which providers are configured server-side. Pass to the client form
  // so it renders the right UI (dev-only fallback vs. real Google + Resend).
  const providers = {
    google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    resend: !!(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM),
    credentials:
      process.env.NODE_ENV !== 'production' &&
      !process.env.AUTH_GOOGLE_ID &&
      !process.env.AUTH_RESEND_KEY,
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {providers.credentials
            ? 'Local dev — type a seeded user email to sign in.'
            : 'Use Google or your email to sign in.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error === 'unauthorized' && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            You don&apos;t have access to that area.
          </div>
        )}
        <LoginForm callbackUrl={callbackUrl} providers={providers} />
      </CardContent>
    </Card>
  )
}
