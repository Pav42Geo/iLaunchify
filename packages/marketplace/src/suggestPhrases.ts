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
  PhraseRuleCondition,
  PhraseSuggestion,
  SuggestPhrasesInput,
  SuggestPhrasesResult,
  PhraseRecipeContext,
} from './types'

const CONDITION_KINDS = new Set([
  'LABELING_TYPE',
  'PRODUCT_CATEGORY',
  'MARKETPLACE_CATEGORY',
  'ALLERGEN_PRESENT',
  'BIOENGINEERED',
  'INGREDIENT_MATCH',
  'PACKING_TYPE',
  'NUTRIENT_SOURCE',
  'PRODUCT_FACT',
])

interface PhraseFacts {
  labelingType: string
  productCategory: string | null
  marketplaceCategorySlug: string | null
  packingTypes: Set<string>
  nutrientSource: string
  allergens: Set<string>
  bioengineered: boolean
  ingredientNames: string[]
  flags: Record<string, boolean>
}

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

/** Coerce PhraseRule.conditions JSON into typed rows; null = malformed (skip rule). */
function coerceConditions(raw: unknown): PhraseRuleCondition[] | null {
  if (!Array.isArray(raw)) return null
  const out: PhraseRuleCondition[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null
    const kind = (row as { kind?: unknown }).kind
    const values = (row as { values?: unknown }).values
    if (typeof kind !== 'string' || !CONDITION_KINDS.has(kind)) return null
    if (!Array.isArray(values)) return null
    const cleanValues = values.filter((v): v is string => typeof v === 'string')
    out.push({ kind: kind as PhraseRuleCondition['kind'], values: cleanValues })
  }
  return out
}

/** Single-condition evaluator — matches if ANY value hits the product facts. */
function evaluateCondition(cond: PhraseRuleCondition, facts: PhraseFacts): boolean {
  switch (cond.kind) {
    case 'BIOENGINEERED':
      // values ignored; presence of any bioengineered ingredient is the trigger.
      return facts.bioengineered
    case 'LABELING_TYPE':
      return cond.values.includes(facts.labelingType)
    case 'PRODUCT_CATEGORY':
      return facts.productCategory != null && cond.values.includes(facts.productCategory)
    case 'MARKETPLACE_CATEGORY':
      return (
        facts.marketplaceCategorySlug != null &&
        cond.values.includes(facts.marketplaceCategorySlug)
      )
    case 'ALLERGEN_PRESENT':
      return cond.values.some((v) => facts.allergens.has(v.toLowerCase()))
    case 'INGREDIENT_MATCH':
      return cond.values.some((v) => {
        const needle = v.toLowerCase()
        return facts.ingredientNames.some((n) => n.includes(needle))
      })
    case 'PACKING_TYPE':
      return cond.values.some((v) => facts.packingTypes.has(v))
    case 'NUTRIENT_SOURCE':
      return cond.values.includes(facts.nutrientSource)
    case 'PRODUCT_FACT':
      return cond.values.some((v) => facts.flags[v] === true)
  }
}

/**
 * Suggest label phrases for a product by evaluating every active PhraseRule.
 *
 * Algorithm mirrors suggestNiches:
 *   1. Load product facts (structured attrs + recipe signals + product flags).
 *   2. Load every active PhraseRule (with its MandatoryPhrase).
 *   3. AND conditions across the array; OR values within each.
 *   4. Build a PhraseSuggestion per matching rule.
 *   5. Dedupe by mandatoryPhraseId — highest weight wins; locked-takes-precedence.
 *   6. Sort: locked first, then weight desc, then title asc.
 *
 * Returns empty `suggestions` if the product doesn't exist or no rule matched.
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

  const rawHits: SuggestPhrasesResult['rawHits'] = []
  const perPhraseBest = new Map<string, PhraseSuggestion>()

  for (const rule of rules) {
    const conditions = coerceConditions(rule.conditions)
    if (!conditions || conditions.length === 0) {
      rawHits.push({ ruleId: rule.id, phraseId: rule.mandatoryPhraseId, matched: false })
      continue
    }
    const matched = conditions.every((c) => evaluateCondition(c, facts))
    rawHits.push({ ruleId: rule.id, phraseId: rule.mandatoryPhraseId, matched })
    if (!matched) continue

    const p = rule.mandatoryPhrase
    const candidate: PhraseSuggestion = {
      phraseId: p.id,
      phraseSlug: p.slug,
      title: p.title,
      body: p.body,
      category: p.category,
      requirement: p.requirement,
      cfrCitation: p.cfrCitation,
      appliesWhen: p.appliesWhen,
      weight: rule.weight,
      ruleId: rule.id,
      ruleSlug: rule.slug,
      ruleDescription: rule.description,
      isLocked: rule.isLocked,
    }

    const existing = perPhraseBest.get(p.id)
    if (!existing) {
      perPhraseBest.set(p.id, candidate)
      continue
    }
    const winningByWeight = candidate.weight > existing.weight ? candidate : existing
    perPhraseBest.set(p.id, {
      ...winningByWeight,
      isLocked: existing.isLocked || candidate.isLocked,
    })
  }

  const suggestions = Array.from(perPhraseBest.values()).sort((a, b) => {
    if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1
    if (b.weight !== a.weight) return b.weight - a.weight
    return a.title.localeCompare(b.title)
  })

  return { suggestions, rawHits }
}
