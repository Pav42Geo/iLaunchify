'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ComplianceClient } from '@ilaunchify/compliance-client'
import type { ComplianceResult } from '@ilaunchify/types'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const SaveSchema = z.object({
  recipeId: z.string(),
  servingSizeG: z.number().positive(),
  servingsPerContainer: z.number().int().positive(),
  servingSizeDesc: z.string().max(80),
  ingredients: z
    .array(
      z.object({
        ingredientId: z.string(),
        weightG: z.number().nonnegative(),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1),
})

export type SaveRecipeResult =
  | { ok: true; compliance: ComplianceResult | null; complianceError?: string }
  | { ok: false; error: string }

export async function saveRecipe(input: z.infer<typeof SaveSchema>): Promise<SaveRecipeResult> {
  const user = await requireUser()
  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message }

  // Verify ownership and load product to determine which rule pack applies
  const recipe = await prisma.recipe.findFirst({
    where: {
      id: parsed.data.recipeId,
      product: { brand: { creatorProfile: { userId: user.id } } },
    },
    include: { product: true },
  })
  if (!recipe) return { ok: false, error: 'Recipe not found' }

  // Replace ingredients atomically
  await prisma.$transaction(async (tx) => {
    await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } })
    await tx.recipeIngredient.createMany({
      data: parsed.data.ingredients.map((ing) => ({
        recipeId: recipe.id,
        ingredientId: ing.ingredientId,
        weightG: ing.weightG,
        position: ing.position,
      })),
    })
    await tx.recipe.update({
      where: { id: recipe.id },
      data: {
        servingSizeG: parsed.data.servingSizeG,
        servingsPerContainer: parsed.data.servingsPerContainer,
        servingSizeDesc: parsed.data.servingSizeDesc || null,
        status: 'CALCULATED',
      },
    })
  })

  revalidatePath(`/products/${recipe.productId}/recipe`)

  // Resolve the active rule pack for this product's category.
  // FOOD and BEVERAGE_FUNCTIONAL share the food rule pack; SUPPLEMENT uses its own.
  const rulePackExternalId =
    recipe.product.category === 'SUPPLEMENT' ? 'us-fda-supplements-2026' : 'us-fda-food-2026'

  // Call the compliance service. Failures are non-fatal — the recipe is saved
  // either way, but we surface the error in the UI so the creator knows.
  const client = new ComplianceClient()
  try {
    const compliance = await client.checkRecipe({
      recipeId: recipe.id,
      rulePackId: rulePackExternalId,
      triggeredByUserId: user.id,
    })
    return { ok: true, compliance }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: true,
      compliance: null,
      complianceError: `Compliance service unreachable: ${message}`,
    }
  }
}
