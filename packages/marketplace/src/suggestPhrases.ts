// @ilaunchify/marketplace — deterministic per-product label-phrase engine.
//
// One ProductTemplate (optionally augmented with the creator's live recipe
// context from the Studio) flows through every active PhraseRule. Each rule's
// `conditions` JSON is an array of {kind, values[]} rows — AND across rows,
// OR within values. The engine produces one PhraseSuggestion per matching rule,
// deduped by mandatoryPhraseId (highest weight wins; locked-takes-precedence).
//
// Signal sources (see PhraseRuleConditionKind):
//   • Structured attrs — labelingType, marketplace category, packingType,
//     nutrientSource (read off the template).
//   • Live recipe — allergens, bioengineered, ingredient names. From the
//     Studio's recipeContext when provided; otherwise derived from the
//     template's base ingredient slots.
//   • Product facts — manufacturer-answered yes/no flags on
//     ProductTemplate.phraseFacts (PRODUCT_FACT kind).
//
// Server-side only — relies on the @ilaunchify/db Prisma client.
// =============================================================================

import { prisma } from '@ilaunchify/db'
import type {
  SuggestPhrasesInput,
  SuggestPhrasesResult,
  PhraseRecipeContext,
} from './types'
import {
  evaluateRules,
  type PhraseFacts,
  type EvaluablePhraseRule,
} from './phrase-rule-eval'

/**
 * Load the ProductTemplate + the relations the rule kinds read against, then
 * fold in the optional live recipe context (which overrides the template's base
 * recipe for allergen / bioengineered / ingredient signals).
 */
async function loadPhraseFacts(
  productTemplateId: string,
  recipeContext: PhraseRecipeContext | undefined,
  labelingTypeOverride: string | undefined,
): Promise<PhraseFacts | null> {
  const template = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    include: {
      subcategory: { include: { category: true } },
      variants: { select: { packingType: true } },
      ingredientSlots: {
        include: {
          baseIngredient: {
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
  })
  if (!template) return null

  // Derive recipe signals from the template's base ingredient slots (the
  // baseline). The Studio's recipeContext overrides these per the creator's
  // actual recipe.
  const baseAllergens = new Set<string>()
  const baseIngredientNames: string[] = []
  let baseBioengineered = false
  for (const slot of template.ingredientSlots) {
    const ing = slot.baseIngredient
    if (!ing) continue
    const flags = ing.allergenFlags.length ? ing.allergenFlags : ing.allergens
    for (const a of flags) baseAllergens.add(a.toLowerCase())
    if (ing.bioengineeredStatus === 'BIOENGINEERED') baseBioengineered = true
    const label = (ing.labelDeclarationName ?? ing.name ?? '').toLowerCase()
    if (label) baseIngredientNames.push(label)
  }

  const allergens =
    recipeContext?.allergens != null
      ? new Set(recipeContext.allergens.map((a) => a.toLowerCase()))
      : baseAllergens
  const bioengineered =
    recipeContext?.bioengineered != null ? recipeContext.bioengineered : baseBioengineered
  const ingredientNames =
    recipeContext?.ingredientNames != null
      ? recipeContext.ingredientNames.map((n) => n.toLowerCase())
      : baseIngredientNames

  const rawFlags = (template.phraseFacts ?? {}) as Record<string, unknown>
  const flags: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(rawFlags)) flags[k] = v === true

  return {
    labelingType: labelingTypeOverride ?? template.labelingType,
    productCategory: recipeContext?.productCategory ?? null,
    marketplaceCategorySlug: template.subcategory?.category?.slug ?? null,
    packingTypes: new Set(template.variants.map((v) => v.packingType)),
    nutrientSource: template.nutrientSource,
    allergens,
    bioengineered,
    ingredientNames,
    flags,
  }
}

/**
 * Suggest label phrases for a product by evaluating every active PhraseRule.
 * Matching + dedupe live in ./phrase-rule-eval; this loads the data and hands it
 * to the evaluator. Returns empty `suggestions` if the product doesn't exist or
 * no rule matched.
 */
export async function suggestPhrases(
  input: SuggestPhrasesInput,
): Promise<SuggestPhrasesResult> {
  const facts = await loadPhraseFacts(
    input.productTemplateId,
    input.recipeContext,
    input.labelingTypeOverride,
  )
  if (!facts) return { suggestions: [], rawHits: [] }

  const rules = await prisma.phraseRule.findMany({
    where: { isActive: true, mandatoryPhrase: { isActive: true } },
    include: { mandatoryPhrase: true },
  })

  const evaluable: EvaluablePhraseRule[] = rules.map((rule) => ({
    id: rule.id,
    slug: rule.slug,
    description: rule.description,
    weight: rule.weight,
    isLocked: rule.isLocked,
    isActive: true, // query already filtered isActive (+ phrase active)
    conditions: rule.conditions,
    phrase: {
      id: rule.mandatoryPhrase.id,
      slug: rule.mandatoryPhrase.slug,
      title: rule.mandatoryPhrase.title,
      body: rule.mandatoryPhrase.body,
      category: rule.mandatoryPhrase.category,
      requirement: rule.mandatoryPhrase.requirement,
      cfrCitation: rule.mandatoryPhrase.cfrCitation,
      appliesWhen: rule.mandatoryPhrase.appliesWhen,
    },
  }))

  return evaluateRules(evaluable, facts)
}
