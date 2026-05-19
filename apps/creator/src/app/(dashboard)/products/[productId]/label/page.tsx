import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, NutritionFactsRenderer } from '@ilaunchify/ui'
import Link from 'next/link'
import type { PanelData } from '@ilaunchify/types'

export const dynamic = 'force-dynamic'

/**
 * Placeholder label page (W5-7).
 * For now, shows the latest ComplianceCheck's panel data.
 * Week 6-7 brings the Fabric.js canvas + die-cut frame + compliance overlay.
 */
export default async function LabelPage({ params }: { params: Promise<{ productId: string }> }) {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: (await params).productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      brand: true,
      recipe: {
        include: {
          complianceChecks: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  if (!product) notFound()

  const lastCheck = product.recipe?.complianceChecks[0]
  const panelData = lastCheck?.panelData as PanelData | null | undefined

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Label — {product.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Step 3 of 3: design + final compliance check. Visual editor lands in Week 6-7.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/products/${product.id}/recipe`}>← Back to recipe</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Compliance panel preview</CardTitle>
            <CardDescription>
              {lastCheck
                ? `Last checked ${new Date(lastCheck.createdAt).toLocaleString()}`
                : 'Save the recipe to generate the panel.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {panelData ? (
              <NutritionFactsRenderer data={panelData} widthPx={280} />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-md border-2 border-dashed border-zinc-300 text-sm text-zinc-500">
                No compliance check yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visual label editor</CardTitle>
            <CardDescription>Fabric.js canvas with die-cut frame + compliance overlay (Week 6-7).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border-2 border-dashed border-zinc-300 text-sm text-zinc-500">
              Coming in Week 6-7
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
