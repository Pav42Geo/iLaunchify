'use server'

// Restricted-category eligibility gate (labeling ≠ licensing).
//
// Loads a product's regulatory signals (template labelingType + manufacturer
// self-declared phraseFacts + the creator's recipe ingredient names) and runs
// the shared @ilaunchify/marketplace evaluator. Returns the matched restriction
// hits — empty array = eligible to order.
//
// Used by:
//   • the checkout page (RSC) to render the RestrictedProductNotice + disable Pay,
//   • placeOrderFromCheckoutDraft as the HARD server-side gate (a creator who
//     bypasses the disabled button still cannot place the order).
//
// Auth-scoped to the signed-in creator's own product.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { evaluateProductRestrictions } from '@ilaunchify/marketplace'
import type { RestrictionHit } from '@ilaunchify/marketplace'

export async function checkProductRestrictions(productId: string): Promise<RestrictionHit[]> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return []

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      productTemplate: { select: { labelingType: true, phraseFacts: true } },
      recipe: {
        select: {
          ingredients: {
            select: {
              ingredient: { select: { name: true, labelDeclarationName: true } },
            },
          },
        },
      },
    },
  })
  if (!product) return []

  const ingredientNames: string[] = []
  for (const ri of product.recipe?.ingredients ?? []) {
    const n = ri.ingredient.labelDeclarationName ?? ri.ingredient.name ?? ''
    if (n) ingredientNames.push(n)
  }

  return evaluateProductRestrictions({
    labelingType: product.productTemplate?.labelingType ?? null,
    phraseFacts: (product.productTemplate?.phraseFacts ?? null) as Record<string, unknown> | null,
    ingredientNames,
  })
}
