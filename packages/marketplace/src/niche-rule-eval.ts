// @ilaunchify/marketplace — PURE niche rule evaluator.
//
// Extracted from suggestNiches.ts so the deterministic matching/dedupe logic has
// ONE implementation that both the prisma-bound engine and the unit tests run
// against (they used to carry byte-for-byte copies — drift risk). Zero runtime
// imports (only erased type imports), so it unit-tests without mocking Prisma.
//
// Semantics (docs/MARKETPLACE_DESIGN.md §2):
//   - A rule's `conditions` array ANDs across rows; within a row, `values` OR.
//   - One NicheSuggestion per matching rule, deduped by nicheId: highest weight
//     wins; locked-takes-precedence (any matching rule locked ⇒ winner locked).
//   - Sort by weight desc, then nicheName asc.

import type { NicheRuleCondition, NicheSuggestion, SuggestNichesResult } from './types'

/** Product facts the rule kinds evaluate against (sets for O(1) membership). */
export interface NicheFacts {
  labelingType: string
  categorySlug: string | null
  subcategorySlug: string | null
  certSlugs: Set<string>
  lifestyleTagSlugs: Set<string>
}

/** A rule flattened for evaluation. `conditions` is raw (JSON or typed) — coerced here. */
export interface EvaluableRule {
  id: string
  slug: string
  nicheId: string
  nicheSlug: string
  nicheName: string
  description: string
  weight: number
  isLocked: boolean
  isActive: boolean
  conditions: unknown
}

/**
 * Coerce a JSON value (from NicheRule.conditions) into the typed shape. Returns
 * null if any row is malformed — the evaluator skips that rule rather than
 * crashing the whole request.
 */
export function coerceConditions(raw: unknown): NicheRuleCondition[] | null {
  if (!Array.isArray(raw)) return null
  const out: NicheRuleCondition[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null
    const kind = (row as { kind?: unknown }).kind
    const values = (row as { values?: unknown }).values
    if (typeof kind !== 'string') return null
    if (!Array.isArray(values)) return null
    if (
      kind !== 'LABELING_TYPE' &&
      kind !== 'CATEGORY' &&
      kind !== 'SUBCATEGORY' &&
      kind !== 'CERT_ATTACHED' &&
      kind !== 'LIFESTYLE_TAG'
    ) {
      return null
    }
    const cleanValues = values.filter((v): v is string => typeof v === 'string')
    out.push({ kind, values: cleanValues })
  }
  return out
}

/**
 * Single-condition evaluator. The row matches if ANY value hits the
 * corresponding accessor on the product facts.
 */
export function evaluateCondition(cond: NicheRuleCondition, facts: NicheFacts): boolean {
  if (cond.values.length === 0) return false
  switch (cond.kind) {
    case 'LABELING_TYPE':
      return cond.values.includes(facts.labelingType)
    case 'CATEGORY':
      return facts.categorySlug != null && cond.values.includes(facts.categorySlug)
    case 'SUBCATEGORY':
      return facts.subcategorySlug != null && cond.values.includes(facts.subcategorySlug)
    case 'CERT_ATTACHED':
      return cond.values.some((v) => facts.certSlugs.has(v))
    case 'LIFESTYLE_TAG':
      return cond.values.some((v) => facts.lifestyleTagSlugs.has(v))
  }
}

/**
 * Evaluate every rule against product facts → deduped suggestions + raw hits.
 * Inactive rules are skipped entirely (no raw hit), matching the engine, which
 * only loads `isActive: true` rules.
 */
export function evaluateRules(rules: EvaluableRule[], facts: NicheFacts): SuggestNichesResult {
  const rawHits: SuggestNichesResult['rawHits'] = []
  const perNicheBest = new Map<string, NicheSuggestion>()

  for (const rule of rules) {
    if (!rule.isActive) continue
    const conditions = coerceConditions(rule.conditions)
    if (!conditions || conditions.length === 0) {
      rawHits.push({ ruleId: rule.id, nicheId: rule.nicheId, matched: false })
      continue
    }
    const matched = conditions.every((c) => evaluateCondition(c, facts))
    rawHits.push({ ruleId: rule.id, nicheId: rule.nicheId, matched })
    if (!matched) continue

    const candidate: NicheSuggestion = {
      nicheId: rule.nicheId,
      nicheSlug: rule.nicheSlug,
      nicheName: rule.nicheName,
      weight: rule.weight,
      ruleId: rule.id,
      ruleSlug: rule.slug,
      ruleDescription: rule.description,
      isLocked: rule.isLocked,
    }

    const existing = perNicheBest.get(rule.nicheId)
    if (!existing) {
      perNicheBest.set(rule.nicheId, candidate)
      continue
    }
    // Highest-weight winner; locked-takes-precedence carried onto the winner.
    const winningByWeight = candidate.weight > existing.weight ? candidate : existing
    const locked = existing.isLocked || candidate.isLocked
    perNicheBest.set(rule.nicheId, { ...winningByWeight, isLocked: locked })
  }

  const suggestions = Array.from(perNicheBest.values()).sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight
    return a.nicheName.localeCompare(b.nicheName)
  })

  return { suggestions, rawHits }
}
