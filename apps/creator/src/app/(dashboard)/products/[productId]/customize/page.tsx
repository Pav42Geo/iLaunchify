import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { CustomizePanel } from './CustomizePanel'

export const dynamic = 'force-dynamic'

export default async function CustomizePage({ params }: { params: Promise<{ productId: string }> }) {
  const user = await requireUser()

  const product = await prisma.product.findFirst({
    where: { id: (await params).productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      productTemplate: {
        include: {
          ingredientSlots: {
            include: {
              baseIngredient: true,
              replacements: { include: { ingredient: true }, orderBy: { displayOrder: 'asc' } },
            },
            orderBy: { displayOrder: 'asc' },
          },
          optionalIngredients: {
            include: { ingredient: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
      },
      variant: true,
      recipe: {
        include: {
          ingredients: { include: { ingredient: true } },
        },
      },
    },
  })

  if (!product || !product.productTemplate || !product.variant || !product.recipe) {
    notFound()
  }

  // Build the current selection state from the existing recipe rows
  const currentSlotPicks: Record<string, string> = {}    // slotId → chosen ingredientId
  const currentOptionals: Set<string> = new Set()        // optional ingredient IDs that are toggled on

  for (const ri of product.recipe.ingredients) {
    if (ri.source === 'TEMPLATE_BASE' || ri.source === 'TEMPLATE_REPLACEMENT') {
      if (ri.filledSlotId) currentSlotPicks[ri.filledSlotId] = ri.ingredientId
    } else if (ri.source === 'TEMPLATE_OPTIONAL') {
      currentOptionals.add(ri.ingredientId)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {product.productTemplate.name} ·{' '}
          {product.variant.flavor && `${product.variant.flavor} · `}
          {product.variant.containerFormat}
        </p>
      </div>

      <CustomizePanel
        productId={product.id}
        recipeId={product.recipe.id}
        servingsPerContainer={Number(product.variant.servingsPerContainer)}
        servingSizeG={Number(product.variant.servingSizeG)}
        servingSizeDesc={product.variant.servingSizeDesc ?? `${Number(product.variant.servingSizeG)}g`}
        productCategory={product.category}
        slots={product.productTemplate.ingredientSlots.map((slot) => ({
          id: slot.id,
          label: slot.label ?? slot.baseIngredient.name,
          description: slot.description,
          allowReplacement: slot.allowReplacement,
          weightG: Number(slot.weightG),
          base: {
            ingredientId: slot.baseIngredient.id,
            name: slot.baseIngredient.name,
            allergens: slot.baseIngredient.allergens,
            nutritionPer100g: slot.baseIngredient.nutritionPer100g as Record<string, number>,
          },
          replacements: slot.replacements.map((r) => ({
            id: r.id,
            ingredientId: r.ingredient.id,
            name: r.ingredient.name,
            allergens: r.ingredient.allergens,
            nutritionPer100g: r.ingredient.nutritionPer100g as Record<string, number>,
            weightGOverride: r.weightGOverride !== null ? Number(r.weightGOverride) : null,
            calloutText: r.calloutText,
          })),
          currentPick: currentSlotPicks[slot.id] ?? slot.baseIngredientId,
        }))}
        optionals={product.productTemplate.optionalIngredients.map((opt) => ({
          id: opt.id,
          ingredientId: opt.ingredient.id,
          name: opt.ingredient.name,
          weightG: Number(opt.weightG),
          calloutText: opt.calloutText,
          allergens: opt.ingredient.allergens,
          nutritionPer100g: opt.ingredient.nutritionPer100g as Record<string, number>,
          isOn: currentOptionals.has(opt.ingredient.id),
        }))}
      />
    </div>
  )
}
