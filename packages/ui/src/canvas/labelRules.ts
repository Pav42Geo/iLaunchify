// FDA label-design rule constants (DS-58).
//
// Single source of truth for the type-size minimums and other "shape"
// rules we enforce at edit time on the canvas. Each constant is cited
// to the underlying CFR section so the audit trail is self-documenting.
//
// What this file owns:
//   - LABEL_SECTION_MIN_FONT_SIZE — per required section role
//   - NFR title + body minimums (food + supplement)
//   - Required label sections (also drives duplicate prevention)
//   - "FDA-conservative" assumption notes for V1
//
// What this file does NOT own:
//   - Recipe-side rules (nutrient rounding, claim regex, allergen detection
//     from ingredients) — those live in the Python compliance service
//     under services/compliance/app/rule_packs/. The canvas-side scan in
//     packages/ui only enforces design-side shape rules; the Python
//     service is the source of truth for content validity.

import type { LabelSectionRole } from './objects'

/**
 * FDA minimum font sizes per required label section, in pt.
 *
 * These are CONSERVATIVE V1 floors that work for any standard package
 * (PDP > 5 sq in). The actual minimums in 21 CFR scale with PDP area
 * (1/16" — 1/2"); we ship the safe floor and let the print-time WeasyPrint
 * renderer apply the real graduated table when the package geometry is
 * known.
 *
 *   statement-of-identity → 12 pt
 *     21 CFR 101.3(d): "in a size reasonably related to the most
 *     prominent printed matter on such panel, … bold type". V1 floor
 *     of 12 pt; the recommended size is ≥ ½ the largest PDP text — we
 *     can't know the largest text statically, so we enforce 12 pt as a
 *     defensible minimum and surface a WARNING when the user sets it
 *     visibly smaller than other PDP text (future check).
 *
 *   net-weight → 9 pt
 *     21 CFR 101.105(i): 1/16" (~ 4.5 pt) for PDP ≤ 5 sq in scaling up
 *     to 1/2" (~ 36 pt) for PDP > 400 sq in. 9 pt covers ≤ 25 sq in
 *     panels — the typical bottle / pouch / small can. Larger packages
 *     get a print-time check.
 *
 *   ingredients → 6 pt
 *     21 CFR 101.2(c): "no smaller than 1/16 inch in height as measured
 *     by the lower-case letter o or its equivalent". 1/16" ≈ 4.5 pt in
 *     print, but body text sized at 4.5 pt is unreadable in practice;
 *     6 pt is the conventional industry floor.
 *
 *   allergens → 6 pt
 *     21 CFR 101.91: must be in a type size at least equal to the
 *     ingredient list. Same floor as ingredients.
 *
 *   manufacturer-info → 6 pt
 *     21 CFR 101.5: information-panel text, same 1/16" minimum as
 *     ingredients.
 */
export const LABEL_SECTION_MIN_FONT_SIZE: Record<LabelSectionRole, number> = {
  'statement-of-identity': 12,
  'net-weight': 9,
  ingredients: 6,
  allergens: 6,
  'manufacturer-info': 6,
}

/**
 * Per-role citations — used by the compliance scan + UI tooltips so the
 * creator can see which rule is being enforced.
 */
export const LABEL_SECTION_CITATIONS: Record<LabelSectionRole, string> = {
  'statement-of-identity': '21 CFR 101.3(d)',
  'net-weight': '21 CFR 101.105(i)',
  ingredients: '21 CFR 101.2(c)',
  allergens: '21 CFR 101.91',
  'manufacturer-info': '21 CFR 101.5',
}

/**
 * Required sections — the canonical list the canvas-side scan must find
 * exactly one of. Same data the LabelDrawer "Required sections" mini
 * checklist iterates over.
 */
export const REQUIRED_LABEL_SECTIONS: LabelSectionRole[] = [
  'statement-of-identity',
  'net-weight',
  'ingredients',
  'allergens',
  'manufacturer-info',
]

/**
 * Nutrition Facts panel type-size minimums (post-2016 redesign).
 *
 *   title  →  13 pt bold (21 CFR 101.9(d)(1)(i)(B))
 *             16 pt+ for panels covering ≥ 40 sq in
 *   calories →  16 pt bold (21 CFR 101.9(d)(1)(ii))
 *               22 pt for panels covering ≥ 40 sq in
 *   body   →  8 pt  (21 CFR 101.9(d)(1)(i)(C))
 *
 * Supplement Facts uses the same minimums (21 CFR 101.36(e)).
 *
 * Used by the NFR scale clamp + the live width slider to keep the panel
 * from being shrunk below legal type size.
 */
export const NUTRITION_FACTS_MIN_TYPE_SIZE = {
  /** "Nutrition Facts" / "Supplement Facts" title, in pt. */
  title: 13,
  /** Body / nutrient lines, in pt. */
  body: 8,
  /** Calories bold callout, in pt. */
  calories: 16,
} as const

/**
 * Default NFR title size as built by addNutritionFactsPanel. Used with
 * NUTRITION_FACTS_MIN_TYPE_SIZE.title to compute the minimum scale that
 * keeps the panel above the FDA floor.
 *
 * Stay in sync with nutritionPanel.ts (the title is built at fontSize: 22).
 * If that changes, this changes.
 */
export const NUTRITION_FACTS_BASE_TITLE_SIZE = 22

/**
 * Minimum uniform scale factor for the NFR group such that the title's
 * effective size stays ≥ 13 pt. = 13 / 22 ≈ 0.59.
 *
 *   effectiveTitleSize = NUTRITION_FACTS_BASE_TITLE_SIZE * scaleX
 *   constraint:        effectiveTitleSize ≥ title min (13 pt)
 *   ∴ scaleMin = 13 / 22
 */
export const NUTRITION_FACTS_MIN_SCALE =
  NUTRITION_FACTS_MIN_TYPE_SIZE.title / NUTRITION_FACTS_BASE_TITLE_SIZE

/**
 * Clamp a candidate font size to its role's FDA minimum. Returns the
 * passed value when it's already ≥ min. Use at edit time so the
 * TextFormatToolbar can snap users back when they try to set it too low.
 */
export function clampFontSize(
  fontSize: number,
  role: LabelSectionRole | null,
): number {
  if (role == null) return fontSize
  const min = LABEL_SECTION_MIN_FONT_SIZE[role]
  return Math.max(fontSize, min)
}

/**
 * Clamp a candidate uniform scale for the NFR group so the title stays
 * above its FDA minimum. Returns scale floored at NUTRITION_FACTS_MIN_SCALE.
 */
export function clampNutritionFactsScale(scale: number): number {
  return Math.max(scale, NUTRITION_FACTS_MIN_SCALE)
}
