import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound, redirect } from 'next/navigation'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ilaunchify/ui'
import { PublishForm } from './PublishForm'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function PublishPage({ params }: { params: Promise<{ productId: string }> }) {
  const user = await requireUser()

  const product = await prisma.product.findFirst({
    where: { id: (await params).productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      brand: true,
      recipe: {
        include: { complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
      template: { include: { dieCutTemplate: true } },
    },
  })
  if (!product) notFound()

  // Gate: must be compliant
  const lastCheck = product.recipe?.complianceChecks[0]
  if (!lastCheck || lastCheck.outcome === 'FAILED') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not ready to publish</CardTitle>
          <CardDescription>
            Resolve compliance violations on the recipe step before publishing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/products/${product.id}/recipe`}>Back to recipe</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Gate: Stripe Connect must be ACTIVE for the creator
  const creator = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeAccountStatus: true },
  })
  if (creator?.stripeAccountStatus !== 'ACTIVE') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect payouts first</CardTitle>
          <CardDescription>
            We need a place to send your share of each order. Stripe Connect takes about 5 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/settings/payouts">Set up payouts →</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Already published?
  if (product.status === 'PUBLISHED') {
    redirect(`/products/${product.id}`)
  }

  // Find candidate manufacturing services
  const manufacturers = await prisma.partnerService.findMany({
    where: {
      type: 'MANUFACTURING',
      status: 'ACTIVE',
      partner: { status: 'ACTIVE' },
    },
    include: { partner: { include: { user: true } } },
  })
  const manufCandidates = manufacturers.filter((s) => {
    const caps = s.capabilities as Record<string, unknown>
    const cats = (caps.categories as string[] | undefined) ?? []
    return cats.includes(product.category) && s.partner.user.stripeAccountStatus === 'ACTIVE'
  })

  // Find candidate print providers (filter by template's die-cut if assigned)
  const printProviders = await prisma.partnerService.findMany({
    where: {
      type: 'LABEL_PRINTING',
      status: 'ACTIVE',
      partner: { status: 'ACTIVE' },
      ...(product.template?.dieCutTemplateId && {
        dieCutSupport: { some: { dieCutTemplateId: product.template.dieCutTemplateId } },
      }),
    },
    include: { partner: { include: { user: true } } },
  })
  const printCandidates = printProviders.filter(
    (s) => s.partner.user.stripeAccountStatus === 'ACTIVE',
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Publish {product.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Set your price + confirm fulfillment partners. After publish, the product goes live on{' '}
          <code>shop.ilaunchify.com/{product.brand.handle}</code>.
        </p>
      </div>

      {manufCandidates.length === 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base">No manufacturer available</CardTitle>
            <CardDescription>
              No active manufacturer covers {product.category}. Contact support to onboard one.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {printCandidates.length === 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base">No print provider available</CardTitle>
            <CardDescription>
              {product.template?.dieCutTemplate
                ? `No active print provider supports the ${product.template.dieCutTemplate.name} die-cut.`
                : 'No active print provider available. Choose a template on the label step first.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {manufCandidates.length > 0 && printCandidates.length > 0 && (
        <PublishForm
          productId={product.id}
          currentPriceCents={product.priceCents}
          manufacturers={manufCandidates.map((s) => ({
            id: s.id,
            name: s.partner.companyName,
            city: s.partner.city,
            state: s.partner.state,
            capabilities: s.capabilities as Record<string, unknown>,
          }))}
          printProviders={printCandidates.map((s) => ({
            id: s.id,
            name: s.partner.companyName,
            city: s.partner.city,
            state: s.partner.state,
            capabilities: s.capabilities as Record<string, unknown>,
          }))}
        />
      )}
    </div>
  )
}
