// @ilaunchify/marketplace — public types for the niche auto-assignment engine.
//
// Slice 3A — deterministic suggestNiches engine. Lives in its own package so
// every app (partner editor, admin review queue, future creator marketplace)
// can call it without duplicating evaluator logic.

import type { NicheAssignmentSource } from '@ilaunchify/db'

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
