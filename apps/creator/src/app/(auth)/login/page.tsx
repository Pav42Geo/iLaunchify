import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — iLaunchify' }

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; callbackUrl?: string }
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use Google or your email to sign in. New here?{' '}
          <a href="/signup" className="underline">
            Create an account
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        {searchParams.error === 'unauthorized' && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            You don&apos;t have access to that area.
          </div>
        )}
        <LoginForm callbackUrl={searchParams.callbackUrl} />
      </CardContent>
    </Card>
  )
}
