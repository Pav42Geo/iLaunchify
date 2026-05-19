import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'
import { ConnectButton } from './ConnectButton'

export default async function StripeStep() {
  const user = await requireUser()
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeAccountId: true, stripeAccountStatus: true, email: true },
  })

  const isConnected = dbUser?.stripeAccountStatus === 'ACTIVE'
  const isPending = dbUser?.stripeAccountStatus === 'PENDING'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stripe Connect for payouts</CardTitle>
        <CardDescription>
          We use Stripe Connect Express. Stripe owns KYB collection so your bank details never touch our servers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-900">
            ✓ Payouts enabled. Stripe will deposit transferred amounts to your linked bank account
            within 2 business days after each shipment confirmation.
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              Click below to complete Stripe&apos;s onboarding form. Takes ~10 minutes. You&apos;ll provide:
            </p>
            <ul className="ml-5 list-disc text-sm text-zinc-600 space-y-1">
              <li>Business legal entity + EIN</li>
              <li>Beneficial owner identity verification</li>
              <li>Bank account for payouts</li>
            </ul>
            <ConnectButton accountStatus={dbUser?.stripeAccountStatus ?? 'NONE'} />
            {isPending && (
              <p className="text-sm text-amber-700">
                Stripe is still verifying your account. Refresh in a few minutes.
              </p>
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button asChild variant="ghost">
            <Link href="/onboarding">Back</Link>
          </Button>
          <Button asChild>
            <Link href="/onboarding/review">{isConnected ? 'Continue to review' : 'Skip for now'}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
