import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import Link from 'next/link'

export default async function DashboardHome() {
  const user = await requireUser()

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    include: { brands: { include: { _count: { select: { products: true } } } } },
  })

  const brand = profile?.brands[0]
  const productCount = brand?._count.products ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back{user.name ? `, ${user.name}` : ''}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {brand ? `Managing ${brand.name}` : 'No brand yet — set one up to get started.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Products</CardDescription>
            <CardTitle className="text-3xl">{productCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/products" className="text-sm text-brand-primary underline">
              View all
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Orders this week</CardDescription>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/orders" className="text-sm text-brand-primary underline">
              View all
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Get started</CardDescription>
            <CardTitle className="text-base">Create your first product</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/products/new" className="text-sm text-brand-primary underline">
              Start product →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
