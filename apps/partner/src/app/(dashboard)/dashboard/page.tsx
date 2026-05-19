import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — Partners' }

export default async function ProviderDashboardHome() {
  const user = await requireUser()

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: {
        include: {
          dispatches: {
            where: { status: { in: ['PENDING_ACCEPT', 'ACCEPTED', 'PRODUCING', 'READY', 'SHIPPED'] } },
            include: { order: true },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      },
    },
  })

  if (!partner) return null

  const pendingDispatches = partner.services.flatMap((s) => s.dispatches)
  const pendingAccept = pendingDispatches.filter((d) => d.status === 'PENDING_ACCEPT')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-zinc-500">{partner.companyName}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Awaiting your acceptance</CardDescription>
            <CardTitle className="text-3xl">{pendingAccept.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/orders" className="text-sm text-brand-primary underline">
              Open inbox
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>In production</CardDescription>
            <CardTitle className="text-3xl">
              {pendingDispatches.filter((d) => d.status === 'PRODUCING').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active services</CardDescription>
            <CardTitle className="text-3xl">
              {partner.services.filter((s) => s.status === 'ACTIVE').length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/services" className="text-sm text-brand-primary underline">
              Manage
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order routing</CardTitle>
          <CardDescription>
            Real orders begin routing in Week 8 (Stripe + order flow). Today this shows any test
            dispatches you create in the seed.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
