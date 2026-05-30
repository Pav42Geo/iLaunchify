import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RetailIdentityCard } from './RetailIdentityCard'
import type { BarcodeMode } from './identity-actions'
import { marketingUrl } from '@/lib/marketing-url'

export const dynamic = 'force-dynamic'

export default async function ProductOverview({ params }: { params: Promise<{ productId: string }> }) {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: (await params).productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      brand: true,
      productTemplate: { include: { subcategory: { include: { category: true } } } },
      variant: true,
      // GTIN / internal SKU / barcode mode for the Retail Identity card (DS-52c)
      // are top-level fields on Product — pulled by default by findFirst.
      recipe: {
        include: {
          _count: { select: { ingredients: true } },
          complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  })
  if (!product) notFound()

  const lastCheck = product.recipe?.complianceChecks[0]
  const customizeComplete = !!lastCheck && lastCheck.outcome !== 'FAILED'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {product.brand.name}
          {product.productTemplate && (
            <>
              {' · '}
              {/* Category breadcrumb deep-links to the public marketplace detail page. */}
              <a
                href={marketingUrl(
                  `/marketplace/${product.productTemplate.subcategory.category.slug}/${product.productTemplate.subcategory.slug}/${product.productTemplate.slug}`,
                )}
                className="hover:underline"
              >
                {product.productTemplate.subcategory.category.icon}{' '}
                {product.productTemplate.subcategory.category.name}
                {' › '}
                {product.productTemplate.subcategory.name}
              </a>
            </>
          )}
          {' · '}
          {product.status}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StepCard
          n={1}
          title="Customize recipe"
          description={
            product.recipe
              ? `${product.recipe._count.ingredients} ingredients · ${product.recipe.status}`
              : 'Not started'
          }
          href={`/products/${product.id}/customize`}
          ctaLabel={customizeComplete ? 'Edit' : 'Customize'}
        />
        <StepCard
          n={2}
          title="Design label"
          description="Fabric.js canvas + die-cut frame"
          href={`/products/${product.id}/design/canvas`}
          ctaLabel="Open canvas"
        />
        <StepCard
          n={3}
          title="Compliance"
          description={
            lastCheck
              ? `${lastCheck.outcome} · ${new Date(lastCheck.createdAt).toLocaleDateString()}`
              : 'Pending'
          }
          href={`/products/${product.id}/compliance`}
          ctaLabel="View"
          disabled={!product.recipe}
        />
        <StepCard
          n={4}
          title="Order production"
          description="Pay iLaunchify · routes to manufacturing + print partners"
          // Phase G1 — points at the new 7-step wizard. The old /order form
          // stays live until G5 ships full payment in the wizard; both
          // share the same final Order row schema.
          href={`/products/${product.id}/checkout`}
          ctaLabel="Order"
          disabled={!customizeComplete}
        />
      </div>

      <RetailIdentityCard
        productId={product.id}
        initial={{
          gtin: product.gtin,
          internalSku: product.internalSku,
          barcodeMode: product.barcodeMode as BarcodeMode,
        }}
      />
    </div>
  )
}

function StepCard({
  n,
  title,
  description,
  href,
  ctaLabel,
  disabled,
  disabledNote,
}: {
  n: number
  title: string
  description: string
  href: string
  ctaLabel: string
  disabled?: boolean
  disabledNote?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <span className="text-brand-secondary">{n}.</span> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full" disabled={disabled}>
          <Link href={href}>{disabledNote ?? ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
