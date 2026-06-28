'use server'

import { prisma, findBannedProductTerm } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
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
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }

  // Verify the brand belongs to this creator
  const brand = await prisma.brand.findFirst({
    where: { id: parsed.data.brandId, creatorProfile: { userId: user.id } },
  })
  if (!brand) return { ok: false, error: 'Brand not found' }

  const template = await prisma.productTemplate.findUnique({
    where: { id: parsed.data.templateId },
    include: {
      subcategory: { include: { category: true } },
      niches: { select: { niche: { select: { slug: true } } } },
      ingredientSlots: { orderBy: { displayOrder: 'asc' } },
      variants: { where: { id: parsed.data.variantId } },
    },
  })
  if (!template || template.status !== 'PUBLISHED') {
    return { ok: false, error: 'Product template not available' }
  }
  const variant = template.variants[0]
  if (!variant) return { ok: false, error: 'Variant not found' }

  // Banned-product-category gate (FDA_REGULATORY_POSTURE §5 item 14 / risk #9).
  // Hard-block federally-fuzzy product types (CBD, kratom, THC, infant formula)
  // at the creation gate + audit the attempt.
  const bannedCategory = findBannedProductTerm({
    name: template.name,
    subcategorySlug: template.subcategory.slug,
    nicheSlugs: template.niches.map((n) => n.niche.slug),
  })
  if (bannedCategory) {
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: template.id,
      action: 'PRODUCT_BANNED_CATEGORY_BLOCK',
      payload: {
        templateName: template.name,
        bannedTerm: bannedCategory.term,
        label: bannedCategory.label,
        reason: bannedCategory.reason,
        matchedIn: bannedCategory.matchedIn,
        brandId: brand.id,
      },
    })
    return {
      ok: false,
      error: `${bannedCategory.label} products can't be launched on iLaunchify — ${bannedCategory.reason}`,
    }
  }

  // Map category enum. Cosmetics + pet share mainCategory 'Other', so drive
  // those (and supplements) off labelingType; food vs beverage from mainCategory.
  const lt = template.labelingType
  const productCategory =
    lt === 'DIETARY_SUPPLEMENT'
      ? 'SUPPLEMENT'
      : lt === 'COSMETIC'
        ? 'COSMETIC'
        : lt === 'PET_PRODUCT'
          ? 'PET'
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
