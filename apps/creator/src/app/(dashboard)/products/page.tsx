import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const user = await requireUser()

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    include: {
      brands: {
        include: {
          products: {
            orderBy: { updatedAt: 'desc' },
            include: { recipe: { select: { status: true } } },
          },
        },
      },
    },
  })

  const products = profile?.brands.flatMap((b) => b.products.map((p) => ({ ...p, brand: b }))) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <Button asChild>
          <Link href="/products/new"><Plus className="mr-1 h-4 w-4" />New product</Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No products yet</CardTitle>
            <CardDescription>Start with a category, add ingredients, get a compliant label.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/products/new">Create your first product</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {products.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`}>
              <Card className="transition-colors hover:bg-zinc-50">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <CardDescription>
                      {p.brand.name} · {p.category} · {p.status}
                      {p.recipe ? ` · Recipe ${p.recipe.status}` : ''}
                    </CardDescription>
                  </div>
                  <div className="text-sm text-zinc-500">→</div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
