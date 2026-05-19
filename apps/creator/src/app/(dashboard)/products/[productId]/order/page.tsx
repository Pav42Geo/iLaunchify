// /products/[productId]/order — creator places a production order.
// Gates: product must exist + be owned by this creator + recipe must have a
// passing compliance check. Pulls warehouse partner candidates + the creator's
// default ship-to address (from their CreatorProfile, if set).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { OrderForm } from './OrderForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Order production — iLaunchify' }

// Must match server action — keep in sync (couldn't easily import from action file)
const PLATFORM_FEE_BPS = 500

export default async function OrderPage({ params }: { params: Promise<{ productId: string }> }) {
  const user = await requireUser()
  const { productId } = await params

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      brand: { include: { creatorProfile: { include: { user: true } } } },
      variant: true,
      recipe: {
        include: { complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
    },
  })
  if (!product) notFound()

  // Gate: compliance pass
  const lastCheck = product.recipe?.complianceChecks[0]
  if (!lastCheck || lastCheck.outcome === 'FAILED') {
    return (
      <div className="space-y-4">
        <Link
          href={`/products/${productId}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to product
        </Link>
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle>Resolve compliance first</CardTitle>
            <CardDescription className="text-amber-800">
              Your recipe must pass compliance review before you can order production. Head to
              the Customize step and fix any violations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/products/${product.id}/customize`}>Go to customize</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Find active WAREHOUSE partner services (if any are onboarded)
  const warehouses = await prisma.partnerService.findMany({
    where: {
      type: 'WAREHOUSE',
      status: 'ACTIVE',
      partner: { status: 'ACTIVE' },
    },
    include: { partner: true },
    orderBy: { createdAt: 'asc' },
  })

  // MOQ from the chosen variant (fallback if no variant linked)
  const moqMin = product.variant?.moqMin ?? 500
  const moqMax = product.variant?.moqMax ?? 5000
  const unitCostCents = product.priceCents > 0 ? product.priceCents : 1000 // $10 fallback

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/products/${productId}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to product
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Order production</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {product.name} · {product.brand.name}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How this works</CardTitle>
          <CardDescription>
            You're placing a B2B production order with iLaunchify. We route the order to a
            manufacturer + label print partner, they produce, and the finished goods ship to
            you (or to a warehouse partner you select). After delivery, you sell to end buyers
            on your own external channels — iLaunchify isn't involved in consumer purchases.
          </CardDescription>
        </CardHeader>
      </Card>

      <OrderForm
        productId={product.id}
        productName={product.name}
        variantMoqMin={moqMin}
        variantMoqMax={moqMax}
        unitCostCents={unitCostCents}
        platformFeeBps={PLATFORM_FEE_BPS}
        warehouses={warehouses.map((w) => ({
          id: w.id,
          partnerName: w.partner.companyName,
          city: w.partner.city,
          state: w.partner.state,
        }))}
        defaultShipTo={{
          contactName: user.name ?? user.email,
          contactPhone: null,
          line1: null,
          line2: null,
          city: null,
          state: null,
          postalCode: null,
          country: 'US',
        }}
      />
    </div>
  )
}
