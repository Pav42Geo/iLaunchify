'use server'

// Track C — per-product label-phrase resolution for the Studio Phrases drawer.
//
// Replaces the old "all phrases for this labeling type" filter with the
// deterministic phrase engine (@ilaunchify/marketplace suggestPhrases): the
// product's structured attributes + the creator's ACTUAL recipe (allergens,
// bioengineered, ingredient names) + the manufacturer's product-fact flags
// resolve to exactly the mandatory + recommended phrases relevant to THIS
// product. Manufacturer-curated extras (ProductTemplatePhrase) are merged in.
//
// Falls back to the labeling-type filter for products not yet bound to a
// ProductTemplate (the engine needs a template to evaluate).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { suggestPhrases } from '@ilaunchify/marketplace'

export interface StudioPhrase {
  id: string
  slug: string
  title: string
  body: string
  category: string
  requirement: string
  cfrCitation: string | null
  appliesWhen: string | null
  /** True = mandatory + manufacturer cannot remove. Pinned/locked at the top. */
  locked: boolean
}

function uniqLower(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.toLowerCase()).filter(Boolean)))
}

/**
 * Resolve the product-specific phrase set for the Studio drawer.
 * Auth-scoped to the signed-in creator's brand.
 */
export async function resolveProductPhrases(
  productId: string,
  // The category-robust labeling regime (resolveLabelingRegime upstream): a
  // SUPPLEMENT product passes DIETARY_SUPPLEMENT here even when its template
  // carries a stale FOOD labelingType — so supplements get supplement phrases.
  labelingType = 'FOOD',
): Promise<StudioPhrase[]> {
  const user = await requireUser()

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      productTemplateId: true,
      category: true,
      productTemplate: { select: { labelingType: true } },
      recipe: {
        select: {
          ingredients: {
            select: {
              ingredient: {
                select: {
                  name: true,
                  labelDeclarationName: true,
                  allergenFlags: true,
                  allergens: true,
                  bioengineeredStatus: true,
                },
              },
            },
          },
        },
      },
    },
  })

  // Fallback: no product / no template → labeling-type filter (legacy behavior).
  if (!product || !product.productTemplateId) {
    return listByLabelingType(labelingType)
  }

  // Derive live recipe context from the creator's ACTUAL recipe.
  const allergens: string[] = []
  const ingredientNames: string[] = []
  let bioengineered = false
  for (const ri of product.recipe?.ingredients ?? []) {
    const ing = ri.ingredient
    const flags = ing.allergenFlags.length ? ing.allergenFlags : ing.allergens
    for (const a of flags) allergens.push(a)
    if (ing.bioengineeredStatus === 'BIOENGINEERED') bioengineered = true
    const label = ing.labelDeclarationName ?? ing.name ?? ''
    if (label) ingredientNames.push(label)
  }

  const { suggestions } = await suggestPhrases({
    productTemplateId: product.productTemplateId,
    // Category-robust regime override — supplements get supplement phrases even
    // when the manufacturer template's labelingType is a stale FOOD.
    labelingTypeOverride: labelingType,
    recipeContext: {
      allergens: uniqLower(allergens),
      bioengineered,
      ingredientNames: uniqLower(ingredientNames),
      productCategory: product.category,
    },
  })

  const out: StudioPhrase[] = suggestions.map((s) => ({
    id: s.phraseId,
    slug: s.phraseSlug,
    title: s.title,
    body: s.body,
    category: s.category,
    requirement: s.requirement,
    cfrCitation: s.cfrCitation,
    appliesWhen: s.appliesWhen,
    locked: s.isLocked,
  }))

  // Merge manufacturer-curated extras (ProductTemplatePhrase) not already
  // surfaced by the engine — e.g. a recommended claim the manufacturer added.
  const engineIds = new Set(out.map((p) => p.id))
  const curated = await prisma.productTemplatePhrase.findMany({
    where: {
      productTemplateId: product.productTemplateId,
      mandatoryPhrase: { isActive: true },
    },
    select: {
      requirement: true,
      mandatoryPhrase: {
        select: {
          id: true,
          slug: true,
          title: true,
          body: true,
          category: true,
          requirement: true,
          cfrCitation: true,
          appliesWhen: true,
        },
      },
    },
  })
  for (const row of curated) {
    const p = row.mandatoryPhrase
    if (engineIds.has(p.id)) continue
    out.push({
      id: p.id,
      slug: p.slug,
      title: p.title,
      body: p.body,
      category: p.category,
      requirement: p.requirement,
      cfrCitation: p.cfrCitation,
      appliesWhen: p.appliesWhen,
      locked: false, // manufacturer-added extra — optional, not auto-locked
    })
  }

  return out
}

/** Legacy fallback — every active phrase for a labeling type. */
async function listByLabelingType(labelingType: string): Promise<StudioPhrase[]> {
  const rows = await prisma.mandatoryPhrase.findMany({
    where: { isActive: true, labelingTypes: { has: labelingType } },
    orderBy: [{ requirement: 'asc' }, { category: 'asc' }, { displayOrder: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      body: true,
      category: true,
      requirement: true,
      cfrCitation: true,
      appliesWhen: true,
    },
  })
  return rows.map((p) => ({ ...p, locked: p.requirement === 'MANDATORY' }))
}
