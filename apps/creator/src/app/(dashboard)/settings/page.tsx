import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await requireUser()
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payouts (Stripe Connect)</CardTitle>
          <CardDescription>
            {dbUser?.stripeAccountStatus === 'ACTIVE'
              ? 'Payouts enabled — Stripe will deposit your share after each consumer order ships and the returns window passes.'
              : 'Set up payouts before publishing your first product.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Status: <span className="font-medium">{dbUser?.stripeAccountStatus ?? 'NONE'}</span>
          </p>
          <Link href="/settings/payouts" className="mt-3 inline-block text-sm text-brand-primary underline">
            {dbUser?.stripeAccountStatus === 'ACTIVE' ? 'Open Stripe dashboard' : 'Connect payouts →'}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
