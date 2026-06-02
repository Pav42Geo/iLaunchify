import 'server-only'
import { prisma } from '@ilaunchify/db'

/**
 * The nutrient source for a ProductTemplate by slug (Slice 4). DECLARED means
 * the manufacturer entered the panel directly — the public detail page must
 * show the "entered by the manufacturer" disclosure (FDA_REGULATORY_POSTURE §5).
 *
 * Returns null when the template isn't in the DB (fixture-only) or on error —
 * callers treat null as COMPUTED (no disclosure).
 */
export async function getProductNutrientSource(
  slug: string,
): Promise<'COMPUTED' | 'DECLARED' | null> {
  try {
    const row = await prisma.productTemplate.findUnique({
      where: { slug },
      select: { nutrientSource: true },
    })
    return row?.nutrientSource ?? null
  } catch (err) {
    console.warn('[product-nutrient-source] failed:', (err as Error).message)
    return null
  }
}
