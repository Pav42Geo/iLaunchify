'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ComplianceClient } from '@ilaunchify/compliance-client'
import type { ComplianceResult } from '@ilaunchify/types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const Schema = z.object({
  productId: z.string(),
  recipeId: z.string(),
  ingredients: z
    .array(
      z.object({
        ingredientId: z.string(),
        weightG: z.number().nonnegative(),
        position: z.number().int().nonnegative(),
        source: z.enum(['TEMPLATE_BASE', 'TEMPLATE_REPLACEMENT', 'TEMPLATE_OPTIONAL']),
        filledSlotId: z.string().nullable(),
      }),
    )
    .min(1),
})

export type SaveResult =
  | { ok: true; compliance: ComplianceResult | null; complianceError?: string }
  | { ok: false; error: string }

export async function saveCustomization(input: z.infer<typeof Schema>): Promise<SaveResult> {
  const user = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, brand: { creatorProfile: { userId: user.id } } },
    include: { recipe: true },
  })
  if (!product || !product.recipe) return { ok: false, error: 'Product not found' }

  // Replace recipe ingredients atomically — resolved list comes from the customize UI
  await prisma.$transaction(async (tx) => {
    await tx.recipeIngredient.deleteMany({ where: { recipeId: parsed.data.recipeId } })
    await tx.recipeIngredient.createMany({
      data: parsed.data.ingredients.map((ing) => ({
        recipeId: parsed.data.recipeId,
        ingredientId: ing.ingredientId,
        weightG: ing.weightG,
        position: ing.position,
        source: ing.source,
        filledSlotId: ing.filledSlotId,
      })),
    })
    await tx.recipe.update({
      where: { id: parsed.data.recipeId },
      data: { status: 'CALCULATED' },
    })
  })

  revalidatePath(`/products/${product.id}/customize`)
  revalidatePath(`/products/${product.id}`)

  // Run compliance check against the Python service
  const rulePackExternalId =
    product.category === 'SUPPLEMENT' ? 'us-fda-supplements-2026' : 'us-fda-food-2026'
  const client = new ComplianceClient()
  try {
    const compliance = await client.checkRecipe({
      recipeId: product.recipe.id,
      rulePackId: rulePackExternalId,
      triggeredByUserId: user.id,
    })
    return { ok: true, compliance }
  } catch (err) {
    return {
      ok: true,
      compliance: null,
      complianceError: err instanceof Error ? err.message : String(err),
    }
  }
}
