import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ProductOverview({ params }: { params: { productId: string } }) {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: params.productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      brand: true,
      recipe: { include: { _count: { select: { ingredients: true } } } },
    },
  })
  if (!product) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {product.brand.name} · {product.category} · {product.status}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Recipe</CardTitle>
            <CardDescription>
              {product.recipe ? `${product.recipe._count.ingredients} ingredients` : 'Not started'} ·{' '}
              {product.recipe?.status ?? '—'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/products/${product.id}/recipe`}>Edit recipe</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Label</CardTitle>
            <CardDescription>Design + compliance check</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full" disabled>
              <Link href={`/products/${product.id}/label`}>Coming in week 4-5</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Publish</CardTitle>
            <CardDescription>Manufacturer + print provider</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full" disabled>
              <Link href={`/products/${product.id}/publish`}>Coming in week 8</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
