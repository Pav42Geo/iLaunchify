import 'server-only'
import { prisma } from '@ilaunchify/db'
import { evaluateProductRestrictions } from '@ilaunchify/marketplace'

/**
 * Restricted-category labels for a ProductTemplate by slug (labeling ≠
 * licensing). Non-empty → the public marketplace detail shows a "not available
 * for production yet" notice so a creator never starts designing a product they
 * can't order (alcohol / hemp-CBD / tobacco / OTC / kratom). Same evaluator the
 * checkout gate uses.
 *
 * Returns [] when the template isn't in the DB (fixture-only) or on error —
 * callers treat empty as eligible.
 */
export async function getProductRestrictions(slug: string): Promise<string[]> {
  try {
    const row = await prisma.productTemplate.findUnique({
      where: { slug },
      select: {
        labelingType: true,
        phraseFacts: true,
        ingredientSlots: {
          select: {
            baseIngredient: { select: { name: true, labelDeclarationName: true } },
          },
        },
      },
    })
    if (!row) return []

    return evaluateProductRestrictions({
      labelingType: row.labelingType,
      phraseFacts: (row.phraseFacts ?? null) as Record<string, unknown> | null,
      ingredientNames: row.ingredientSlots
        .map((s) => s.baseIngredient?.labelDeclarationName ?? s.baseIngredient?.name ?? '')
        .filter(Boolean),
    }).map((h) => h.label)
  } catch (err) {
    console.warn('[product-restrictions] failed:', (err as Error).message)
    return []
  }
}
