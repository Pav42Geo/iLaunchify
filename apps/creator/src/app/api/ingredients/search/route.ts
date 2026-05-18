import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { auth } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ingredients/search?q=oats&limit=10
 *
 * Searches the Ingredient table by name. Used by the RecipeBuilder's
 * IngredientSearch component (via TanStack Query).
 *
 * In V1, Ingredients are seeded from a mock USDA subset (~30 rows).
 * Week 4-5: replace with the full USDA pipeline (loaded from
 * services/compliance/app/usda/).
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 10), 50)

  if (q.length < 2) {
    return NextResponse.json({ ingredients: [] })
  }

  const ingredients = await prisma.ingredient.findMany({
    where: {
      name: { contains: q, mode: 'insensitive' },
    },
    orderBy: { name: 'asc' },
    take: limit,
    select: {
      id: true,
      name: true,
      category: true,
      isOrganic: true,
      allergens: true,
      nutritionPer100g: true,
    },
  })

  return NextResponse.json({ ingredients })
}
