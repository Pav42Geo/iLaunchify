import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — Partners' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use the email you applied with. We&apos;ll send you a magic link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm prefillEmail={email} />
        <p className="mt-4 text-sm text-zinc-500">
          New here?{' '}
          <a href="/" className="underline">
            See how partnering works
          </a>
          .
        </p>
      </CardContent>
    </Card>
  )
}
