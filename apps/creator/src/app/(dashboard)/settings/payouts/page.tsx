import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { ConnectButton } from './ConnectButton'

export default async function PayoutsSettingsPage() {
  const user = await requireUser()
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  })

  const isActive = dbUser?.stripeAccountStatus === 'ACTIVE'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
      <Card>
        <CardHeader>
          <CardTitle>Stripe Connect Express</CardTitle>
          <CardDescription>
            Your share of every consumer order is sent here after the order delivers + the returns window passes.
            Stripe handles KYC and bank verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isActive ? (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-900">
              ✓ Payouts enabled.
            </div>
          ) : (
            <p className="text-sm text-zinc-600">
              You&apos;ll be redirected to Stripe to provide your identity, address, and bank account.
              Takes about 5 minutes.
            </p>
          )}
          <ConnectButton currentStatus={dbUser?.stripeAccountStatus ?? 'NONE'} />
        </CardContent>
      </Card>
    </div>
  )
}
