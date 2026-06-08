// @ilaunchify/marketplace — public types for the niche auto-assignment engine.
//
// Slice 3A — deterministic suggestNiches engine. Lives in its own package so
// every app (partner editor, admin review queue, future creator marketplace)
// can call it without duplicating evaluator logic.

import type { NicheAssignmentSource, PhraseAssignmentSource } from '@ilaunchify/db'

/**
 * Single rule-driven suggestion for a niche on a product template.
 *
 * The engine evaluates every active NicheRule; each rule that matches
 * produces one of these. Multiple rules can point at the same niche —
 * `suggestNiches` dedupes by `nicheId` and keeps the highest weight (and
 * locked-takes-precedence if any matching rule on that niche is locked).
 */
export interface NicheSuggestion {
  nicheId: string
  nicheSlug: string
  nicheName: string
  /** 0..100 — higher means a stronger / more confident suggestion. */
  weight: number
  /** The rule that produced this suggestion (post-dedup: the winning rule). */
  ruleId: string
  ruleSlug: string
  ruleDescription: string
  /**
   * When true the manufacturer cannot deselect this niche. Locked rules are
   * baked into the schema (e.g. PET_PRODUCT labeling always surfaces in
   * the Pet Wellness niche).
   */
  isLocked: boolean
}

/**
 * Input to `suggestNiches`. The engine loads everything it needs from the
 * ProductTemplate row directly — pass an id and we'll fetch + evaluate.
 */
export interface SuggestNichesInput {
  productTemplateId: string
}

/**
 * Result of a `suggestNiches` evaluation.
 *
 * - `suggestions` — one row per matched niche, deduped, sorted by weight desc
 *   then nicheName asc. This is what the UI binds to.
 * - `rawHits` — every (rule, niche, matched) tuple the evaluator considered.
 *   Useful for debug panels + audit payloads + admin tooling.
 */
export interface SuggestNichesResult {
  suggestions: NicheSuggestion[]
  rawHits: Array<{ ruleId: string; nicheId: string; matched: boolean }>
}

/**
 * Condition kinds — these mirror Prisma's `NicheRuleConditionKind` enum but
 * we keep a string-union here so callers can read JSON straight off the wire.
 */
export type NicheRuleConditionKind =
  | 'LABELING_TYPE'
  | 'CATEGORY'
  | 'SUBCATEGORY'
  | 'CERT_ATTACHED'
  | 'LIFESTYLE_TAG'

/**
 * Per-row condition shape inside `NicheRule.conditions` JSON.
 *
 * Semantics:
 *   - The `conditions` array AND's across rows.
 *   - Within a single row, the `values` array OR's (any hit = condition matches).
 */
export interface NicheRuleCondition {
  kind: NicheRuleConditionKind
  values: string[]
}

/**
 * Audit helper input — every niche assignment (auto, manual, admin) writes
 * one of these rows. See `recordNicheAssignment`.
 */
export interface RecordNicheAssignmentInput {
  productTemplateId: string
  nicheId: string
  source: NicheAssignmentSource
  ruleId?: string | null
  actorUserId?: string | null
  /** true = niche was assigned; false = niche was removed. */
  applied: boolean
}

// =============================================================================
// PHRASE auto-suggestion engine (per-product label phrases). Mirrors the niche
// engine: deterministic PhraseRule.conditions evaluated against product facts
// (structured attrs + live recipe + manufacturer product-fact flags).
// =============================================================================

/**
 * Condition kinds — mirror Prisma's `PhraseRuleConditionKind`. Kept as a string
 * union so callers can read JSON straight off `PhraseRule.conditions`.
 */
export type PhraseRuleConditionKind =
  | 'LABELING_TYPE'
  | 'PRODUCT_CATEGORY'
  | 'MARKETPLACE_CATEGORY'
  | 'ALLERGEN_PRESENT'
  | 'BIOENGINEERED'
  | 'INGREDIENT_MATCH'
  | 'PACKING_TYPE'
  | 'NUTRIENT_SOURCE'
  | 'PRODUCT_FACT'

export interface PhraseRuleCondition {
  kind: PhraseRuleConditionKind
  values: string[]
}

/**
 * Optional live-recipe + product context the Studio supplies so allergen /
 * bioengineered / ingredient rules react to the creator's ACTUAL recipe rather
 * than the template's base recipe. The partner editor omits this (the engine
 * falls back to the template's base ingredient slots).
 */
export interface PhraseRecipeContext {
  /** Lowercased allergen flags present in the recipe. */
  allergens?: string[]
  bioengineered?: boolean
  /** Lowercased ingredient names / label-declaration names for INGREDIENT_MATCH. */
  ingredientNames?: string[]
  /** Product.category enum (FOOD | BEVERAGE_FUNCTIONAL | SUPPLEMENT) — Studio only. */
  productCategory?: string
}

export interface SuggestPhrasesInput {
  productTemplateId: string
  /** Live context from the creator's product/recipe (Studio). Omit for the template baseline. */
  recipeContext?: PhraseRecipeContext
  /**
   * Override the labeling regime the LABELING_TYPE rules evaluate against. The
   * creator's resolver passes a category-robust value here (a SUPPLEMENT-category
   * product → DIETARY_SUPPLEMENT) so phrase suggestions stay correct even when a
   * manufacturer template carries a stale/wrong labelingType (e.g. FOOD on a
   * supplement). When omitted, the template's own labelingType is used.
   */
  labelingTypeOverride?: string
}

/**
 * One rule-driven suggestion for a phrase on a product. The engine dedupes by
 * `mandatoryPhraseId` (highest weight wins; locked-takes-precedence). Carries
 * the full phrase fields so callers render without a second fetch.
 */
export interface PhraseSuggestion {
  phraseId: string
  phraseSlug: string
  title: string
  body: string
  category: string
  /** Catalog requirement (MANDATORY | RECOMMENDED) — drives grouping. */
  requirement: string
  cfrCitation: string | null
  appliesWhen: string | null
  /** 0..100 — stronger = more confident. */
  weight: number
  ruleId: string
  ruleSlug: string
  ruleDescription: string
  /** True = mandatory + manufacturer cannot remove. Pinned/locked in the drawer. */
  isLocked: boolean
}

export interface SuggestPhrasesResult {
  suggestions: PhraseSuggestion[]
  rawHits: Array<{ ruleId: string; phraseId: string; matched: boolean }>
}

export interface RecordPhraseAssignmentInput {
  productTemplateId: string
  mandatoryPhraseId: string
  source: PhraseAssignmentSource
  ruleId?: string | null
  actorUserId?: string | null
  /** true = phrase assigned; false = removed. */
  applied: boolean
}
