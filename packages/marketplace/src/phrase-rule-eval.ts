// @ilaunchify/marketplace — PURE label-phrase rule evaluator.
//
// Extracted from suggestPhrases.ts (mirrors niche-rule-eval.ts) so the
// deterministic matching/dedupe has ONE implementation the prisma-bound engine
// and the unit tests share. Zero runtime imports (only erased type imports), so
// it unit-tests without mocking Prisma.
//
// Semantics: a rule's `conditions` array ANDs across rows; within a row,
// `values` OR. One PhraseSuggestion per matching rule, deduped by phraseId
// (highest weight wins; locked-takes-precedence). Sort: locked first, then
// weight desc, then title asc.

import type {
  PhraseRuleCondition,
  PhraseSuggestion,
  SuggestPhrasesResult,
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

/** Product facts the phrase rule kinds evaluate against. */
export interface PhraseFacts {
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

/** A PhraseRule flattened for evaluation (its MandatoryPhrase folded in). */
export interface EvaluablePhraseRule {
  id: string
  slug: string
  description: string
  weight: number
  isLocked: boolean
  isActive: boolean
  conditions: unknown
  phrase: {
    id: string
    slug: string
    title: string
    body: string
    category: string
    requirement: string
    cfrCitation: string | null
    appliesWhen: string | null
  }
}

/** Coerce PhraseRule.conditions JSON into typed rows; null = malformed (skip rule). */
export function coerceConditions(raw: unknown): PhraseRuleCondition[] | null {
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
export function evaluateCondition(cond: PhraseRuleCondition, facts: PhraseFacts): boolean {
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
 * Evaluate every rule against product facts → deduped suggestions + raw hits.
 * Inactive rules are skipped entirely (no raw hit), matching the engine, which
 * only loads active rules with active phrases.
 */
export function evaluateRules(
  rules: EvaluablePhraseRule[],
  facts: PhraseFacts,
): SuggestPhrasesResult {
  const rawHits: SuggestPhrasesResult['rawHits'] = []
  const perPhraseBest = new Map<string, PhraseSuggestion>()

  for (const rule of rules) {
    if (!rule.isActive) continue
    const conditions = coerceConditions(rule.conditions)
    if (!conditions || conditions.length === 0) {
      rawHits.push({ ruleId: rule.id, phraseId: rule.phrase.id, matched: false })
      continue
    }
    const matched = conditions.every((c) => evaluateCondition(c, facts))
    rawHits.push({ ruleId: rule.id, phraseId: rule.phrase.id, matched })
    if (!matched) continue

    const p = rule.phrase
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
