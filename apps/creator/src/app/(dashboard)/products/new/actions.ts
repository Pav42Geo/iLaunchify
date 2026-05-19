'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { z } from 'zod'

const DraftSchema = z.object({
  templateId: z.string(),
  variantId: z.string(),
  brandId: z.string(),
  marketId: z.string(),
})

export type CreateDraftResult =
  | { ok: true; productId: string }
  | { ok: false; error: string }

/**
 * Create a draft Product + Recipe from a ProductTemplate + Variant.
 * Seeds RecipeIngredient rows with the template's BASE slot ingredients
 * (creator can later swap them in /customize).
 */
export async function createDraftFromTemplate(
  input: z.infer<typeof DraftSchema>,
): Promise<CreateDraftResult> {
  const user = await requireUser()
  const parsed = DraftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message }

  // Verify the brand belongs to this creator
  const brand = await prisma.brand.findFirst({
    where: { id: parsed.data.brandId, creatorProfile: { userId: user.id } },
  })
  if (!brand) return { ok: false, error: 'Brand not found' }

  const template = await prisma.productTemplate.findUnique({
    where: { id: parsed.data.templateId },
    include: {
      subcategory: { include: { category: true } },
      ingredientSlots: { orderBy: { displayOrder: 'asc' } },
      variants: { where: { id: parsed.data.variantId } },
    },
  })
  if (!template || template.status !== 'PUBLISHED') {
    return { ok: false, error: 'Product template not available' }
  }
  const variant = template.variants[0]
  if (!variant) return { ok: false, error: 'Variant not found' }

  // Map category enum
  const productCategory =
    template.subcategory.category.mainCategory === 'Supplements'
      ? 'SUPPLEMENT'
      : template.subcategory.category.mainCategory === 'Beverages'
        ? 'BEVERAGE_FUNCTIONAL'
        : 'FOOD'

  // Slug: make it unique-per-brand by appending the variant flavor if needed
  let slug = template.slug + (variant.flavor ? `-${slugify(variant.flavor)}` : '')
  const existing = await prisma.product.findFirst({
    where: { brandId: brand.id, slug },
  })
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`
  }

  // Create Product + Recipe + RecipeIngredients (seeded with BASE slot ingredients).
  // Run in a transaction so we never leave half-created products.
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        brandId: brand.id,
        marketId: parsed.data.marketId,
        slug,
        name: `${template.name}${variant.flavor ? ` — ${variant.flavor}` : ''}`,
        description: template.description,
        category: productCategory,
        status: 'DRAFT',
        productTemplateId: template.id,
        variantId: variant.id,
        recipe: {
          create: {
            status: 'DRAFT',
            servingsPerContainer: variant.servingsPerContainer,
            servingSizeG: variant.servingSizeG,
            servingSizeDesc: variant.servingSizeDesc,
          },
        },
      },
      include: { recipe: true },
    })

    // Seed each BASE slot ingredient into the Recipe
    if (created.recipe) {
      await tx.recipeIngredient.createMany({
        data: template.ingredientSlots.map((slot, idx) => ({
          recipeId: created.recipe!.id,
          ingredientId: slot.baseIngredientId,
          weightG: slot.weightG,
          position: idx,
          source: 'TEMPLATE_BASE' as const,
          filledSlotId: slot.id,
        })),
      })
    }

    return created
  })

  return { ok: true, productId: product.id }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}
