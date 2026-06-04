// Track C / C4.a — label-format recommendation (pure ranking).
//
// Given a label surface (dieline width/height → trim surface area), the product's
// labeling type, and flavor count, rank the FDA-approved LabelFormatRules that
// FIT, so the studio can default to the best one and offer alternatives — every
// option already valid for the combination. Pure + dependency-free (testable;
// the prisma load + Decimal→number mapping lives in label-format-actions.ts).

/** Minimal shape the ranker needs — a superset is fine (generic passthrough). */
export interface FormatRuleLite {
  format: string
  minSurfaceAreaSqIn: number
  minLabelWidthMm: number
  minLabelHeightMm: number
  supportsMultiColumn: boolean
  supportsAggregate: boolean
  preferenceScore: number
}

export interface FormatContext {
  /** Trim surface area of the label, square inches. */
  trimSurfaceAreaSqIn: number
  widthMm: number
  heightMm: number
  /** 1 for a single flavor; >1 requires a multi-column / aggregate format. */
  flavorCount: number
}

/** Square inches of a width×height (mm) label surface. */
export function trimSurfaceAreaSqIn(widthMm: number, heightMm: number): number {
  const wIn = widthMm / 25.4
  const hIn = heightMm / 25.4
  return wIn * hIn
}

/**
 * Filter the rules to those that fit the surface + flavor count, then rank by
 * preferenceScore (desc), ties broken by format name for stable output.
 * Returns the full rule objects (generic passthrough) so callers keep display
 * fields (cfrCitation, notes, orientation, …).
 */
export function rankLabelFormats<T extends FormatRuleLite>(
  rules: T[],
  ctx: FormatContext,
): { recommended: T | null; alternatives: T[] } {
  const fits = rules.filter(
    (r) =>
      r.minSurfaceAreaSqIn <= ctx.trimSurfaceAreaSqIn &&
      r.minLabelWidthMm <= ctx.widthMm &&
      r.minLabelHeightMm <= ctx.heightMm &&
      (ctx.flavorCount <= 1 || r.supportsMultiColumn || r.supportsAggregate),
  )
  const ranked = [...fits].sort(
    (a, b) => b.preferenceScore - a.preferenceScore || a.format.localeCompare(b.format),
  )
  return { recommended: ranked[0] ?? null, alternatives: ranked.slice(1) }
}
