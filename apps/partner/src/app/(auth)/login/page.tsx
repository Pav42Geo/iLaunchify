import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — Partners' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">iLaunchify Partners</h1>
        </div>
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
              <a href="/signup" className="underline">
                Apply to join
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
