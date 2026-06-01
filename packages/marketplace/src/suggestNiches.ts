// @ilaunchify/marketplace — deterministic niche auto-suggest engine.
// Slice 3A. Spec: docs/MARKETPLACE_DESIGN.md §2 + memory note
// ilaunchify-marketplace-decisions-2026-06-01.md.
//
// One ProductTemplate flows through every active NicheRule. Each rule's
// `conditions` JSON is an array of {kind, values[]} rows — AND across rows,
// OR within values. The engine produces one NicheSuggestion per matching
// rule, deduped by nicheId (highest weight wins; locked-takes-precedence).
//
// Server-side only — relies on the @ilaunchify/db Prisma client.
// =============================================================================

import { prisma } from '@ilaunchify/db'
import type {
  NicheRuleCondition,
  NicheSuggestion,
  SuggestNichesInput,
  SuggestNichesResult,
} from './types'

// ----- internal evaluator helpers ---------------------------------------------

interface ProductFacts {
  labelingType: string
  categorySlug: string | null
  subcategorySlug: string | null
  certSlugs: Set<string>
  lifestyleTagSlugs: Set<string>
}

/**
 * Pull the ProductTemplate + the four fact-shaped relations the rule kinds
 * read against. Returned shape is intentionally narrow so callers don't
 * accidentally couple to model details.
 */
async function loadProductFacts(productTemplateId: string): Promise<ProductFacts | null> {
  const product = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    include: {
      subcategory: { include: { category: true } },
      certificates: {
        include: { instance: { include: { certificateType: true } } },
      },
      lifestyleTags: { include: { lifestyleTag: true } },
    },
  })
  if (!product) return null

  return {
    labelingType: product.labelingType,
    categorySlug: product.subcategory?.category?.slug ?? null,
    subcategorySlug: product.subcategory?.slug ?? null,
    certSlugs: new Set(
      product.certificates
        .map((c) => c.instance?.certificateType?.slug)
        .filter((s): s is string => !!s),
    ),
    lifestyleTagSlugs: new Set(
      product.lifestyleTags
        .map((t) => t.lifestyleTag?.slug)
        .filter((s): s is string => !!s),
    ),
  }
}

/**
 * Coerce a JSON value (from NicheRule.conditions) into the typed shape we
 * evaluate. Returns null if the row is malformed — the evaluator skips
 * those rules rather than crashing the whole request.
 */
function coerceConditions(raw: unknown): NicheRuleCondition[] | null {
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
 * Single-condition evaluator. The condition row matches if ANY value in
 * `values[]` hits the corresponding accessor on the product facts.
 */
function evaluateCondition(cond: NicheRuleCondition, facts: ProductFacts): boolean {
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

// ----- public API -------------------------------------------------------------

/**
 * Suggest niches for a product template by evaluating every active NicheRule.
 *
 * Algorithm:
 *   1. Load product facts (labelingType, category/subcategory slugs, cert
 *      slugs, lifestyle-tag slugs).
 *   2. Load every active NicheRule (with its Niche).
 *   3. For each rule, AND the conditions across the array; within each
 *      condition, OR the values.
 *   4. Build a NicheSuggestion per matching rule.
 *   5. Dedupe by nicheId — highest weight wins; if ANY matching rule for
 *      that niche has `isLocked=true`, the deduped suggestion inherits
 *      locked=true (so the manufacturer can't deselect).
 *   6. Sort by weight desc, then nicheName asc.
 *
 * Returns an empty `suggestions` array if the product doesn't exist or no
 * rule matched. `rawHits` is always populated for debug + audit payloads.
 */
export async function suggestNiches(
  input: SuggestNichesInput,
): Promise<SuggestNichesResult> {
  const facts = await loadProductFacts(input.productTemplateId)
  if (!facts) return { suggestions: [], rawHits: [] }

  const rules = await prisma.nicheRule.findMany({
    where: { isActive: true },
    include: { niche: true },
  })

  const rawHits: SuggestNichesResult['rawHits'] = []
  const perNicheBest = new Map<string, NicheSuggestion>()

  for (const rule of rules) {
    const conditions = coerceConditions(rule.conditions)
    if (!conditions || conditions.length === 0) {
      rawHits.push({ ruleId: rule.id, nicheId: rule.nicheId, matched: false })
      continue
    }
    // AND across conditions.
    const matched = conditions.every((c) => evaluateCondition(c, facts))
    rawHits.push({ ruleId: rule.id, nicheId: rule.nicheId, matched })
    if (!matched) continue

    const candidate: NicheSuggestion = {
      nicheId: rule.nicheId,
      nicheSlug: rule.niche.slug,
      nicheName: rule.niche.name,
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

    // Dedupe — keep the highest-weight winner. Locked-takes-precedence
    // separately so a low-weight locked rule still surfaces the lock flag
    // on the winning higher-weight suggestion.
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
