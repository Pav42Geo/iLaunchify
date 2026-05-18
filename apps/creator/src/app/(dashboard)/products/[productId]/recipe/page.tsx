import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { RecipeBuilder } from '@/components/recipe-builder/RecipeBuilder'

export const dynamic = 'force-dynamic'

export default async function RecipePage({ params }: { params: { productId: string } }) {
  const user = await requireUser()

  const product = await prisma.product.findFirst({
    where: { id: params.productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      recipe: {
        include: {
          ingredients: {
            include: { ingredient: true },
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  })

  if (!product || !product.recipe) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">Step 2 of 3: ingredients and serving size.</p>
      </div>

      <RecipeBuilder
        productId={product.id}
        productCategory={product.category}
        initial={{
          recipeId: product.recipe.id,
          servingSizeG: Number(product.recipe.servingSizeG),
          servingsPerContainer: Number(product.recipe.servingsPerContainer),
          servingSizeDesc: product.recipe.servingSizeDesc ?? '',
          ingredients: product.recipe.ingredients.map((ri) => ({
            id: ri.id,
            ingredientId: ri.ingredientId,
            name: ri.ingredient.name,
            weightG: Number(ri.weightG),
            nutritionPer100g: ri.ingredient.nutritionPer100g as Record<string, number>,
            position: ri.position,
            isDirty: false,
          })),
        }}
      />
    </div>
  )
}
