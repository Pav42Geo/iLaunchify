import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

// Admin accounts are invite-only per docs/PARTNER_ONBOARDING.md §1.1 + task #103.
// This page exists so users who navigate to /signup on the admin app see a
// helpful message instead of a bare 404.

export const metadata = { title: 'Admin accounts are invite-only' }

export default function AdminSignupBlockedPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin accounts are invite-only</CardTitle>
        <CardDescription>
          New admin users are added by an existing admin via the team invite flow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-zinc-600">
        <p>
          If you&apos;ve been invited, check your email for the invite link. If you already
          have an admin account, sign in below.
        </p>
        <a
          href="/login"
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Sign in to admin
        </a>
        <p className="text-xs text-zinc-500">
          Not an admin? Looking for the{' '}
          <a href="http://localhost:3000/signup" className="underline">
            creator signup
          </a>{' '}
          or{' '}
          <a href="http://localhost:3002/signup" className="underline">
            partner signup
          </a>{' '}
          instead?
        </p>
      </CardContent>
    </Card>
  )
}
