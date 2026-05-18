import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

export const metadata = { title: 'Check your email — iLaunchify' }

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent you a sign-in link. It expires in 24 hours.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-zinc-500">
          If you don&apos;t see it, check your spam folder. Still missing?{' '}
          <a href="/login" className="underline">
            Try again
          </a>
          .
        </p>
      </CardContent>
    </Card>
  )
}
