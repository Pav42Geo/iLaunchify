// FDA Net Quantity of Contents formatting + validation (DS-57).
//
// Implements the format rules from 21 CFR 101.105 — the regulation that
// governs how the "X OZ" / "X FL OZ" / "X COUNT" declaration must appear
// on the principal display panel of every US consumer food / supplement.
//
// Two functions live here:
//
//   formatNetQuantity(opts)
//     Given grams / mL / count + category, returns the FDA-conformant
//     string the creator should print on the label. Used by both the
//     Label drawer (to pre-fill the dropped IText) and the compliance
//     scan (to suggest a fix).
//
//   validateNetQuantityFormat(text, kind)
//     Soft-checks an on-canvas net-quantity string. Returns the list of
//     problems found (missing prefix, missing metric, etc.). The scan
//     turns each problem into a WARNING finding.
//
// What the regulation requires (high level):
//
//   - Solids must use "NET WT" prefix; liquids use "NET" (or "NET WT" if
//     the package is sold by weight — we default to "NET" for liquids).
//   - Both US-customary AND metric must appear; US first, metric in
//     parentheses (Fair Packaging & Labeling Act §4).
//   - Solids: oz < 1 lb; lb + oz from 1 lb to <4 lb; decimal lb ≥ 4 lb.
//   - Liquids: fl oz < 32 fl oz; qt up to <1 gal; gal ≥ 1 gal.
//   - Count items skip metric (count is unitless).
//   - Rounding: 21 CFR 101.105(g) — oz to 1/4, 1/2, 1 or 2-decimal
//     fraction; grams to 1g; mL to 1mL.
//
// We don't model every rounding nuance (3 sig figs for SI, decimal-lb
// optional for under 4lb, etc.) — V1 picks one defensible representation
// per range. Creators retain full editorial control over the dropped text.

export type NetQuantityKind = 'solid' | 'liquid' | 'count'

export interface FormatNetQuantityOpts {
  kind: NetQuantityKind
  /** Total contents weight in grams. Required for solids. */
  grams?: number | null
  /** Total contents volume in milliliters. Required for liquids. */
  milliliters?: number | null
  /** Total count. Required for count items. */
  count?: number | null
  /** Unit word for count items — "CAPSULES" / "TABLETS" / "GUMMIES". Defaults to "COUNT". */
  countUnit?: string
}

/**
 * Build the FDA-conformant net-quantity string. Returns null when the
 * input is insufficient (e.g. kind=solid but grams missing) so the caller
 * can decide whether to fall back to a placeholder.
 */
export function formatNetQuantity(opts: FormatNetQuantityOpts): string | null {
  if (opts.kind === 'count' && opts.count != null && opts.count > 0) {
    const unit = (opts.countUnit ?? 'COUNT').toUpperCase()
    return `${opts.count} ${unit}`
  }

  if (opts.kind === 'solid' && opts.grams != null && opts.grams > 0) {
    return formatSolid(opts.grams)
  }

  if (opts.kind === 'liquid' && opts.milliliters != null && opts.milliliters > 0) {
    return formatLiquid(opts.milliliters)
  }

  return null
}

/**
 * Validate an on-canvas net-quantity text against the format rules.
 * Returns an empty problems[] when the text passes structural checks.
 *
 * Soft-check — we don't try to parse the numbers + compare against the
 * recipe (that's a separate INFO finding in the scan). We just look at
 * the SHAPE of the text.
 */
export function validateNetQuantityFormat(
  text: string,
  kind: NetQuantityKind = 'solid',
): { ok: boolean; problems: NetQuantityProblem[] } {
  const problems: NetQuantityProblem[] = []
  const t = text.trim()

  if (!t) {
    problems.push({
      code: 'empty',
      message: 'Net quantity text is empty.',
    })
    return { ok: false, problems }
  }

  if (kind === 'count') {
    // Just need a number + a unit word. No metric required.
    if (!/\d/.test(t)) {
      problems.push({ code: 'no-number', message: 'No quantity number found.' })
    }
    if (!/\b(CAPSULES?|TABLETS?|GUMMIES|GUMMY|SOFTGELS?|SERVINGS?|COUNT|PIECES?|SACHETS?)\b/i.test(t)) {
      problems.push({
        code: 'no-count-unit',
        message: 'No count unit word (capsules, tablets, gummies, etc.) found.',
      })
    }
    return { ok: problems.length === 0, problems }
  }

  // ---- Weight / volume rules ----
  const isSolid = kind === 'solid'
  const expectedPrefixRe = isSolid ? /\bNET\s*WT\b/i : /\bNET\b/i
  const prefixLabel = isSolid ? '"NET WT"' : '"NET"'

  if (!expectedPrefixRe.test(t)) {
    problems.push({
      code: 'missing-prefix',
      message: `Net quantity should start with ${prefixLabel}.`,
    })
  }

  // US-customary unit?
  const usUnitRe = isSolid
    ? /\b(OZ|LB|LBS|POUND|POUNDS|OUNCE|OUNCES)\b/i
    : /\b(FL\s*OZ|PT|PINT|QT|QUART|GAL|GALLON)\b/i
  if (!usUnitRe.test(t)) {
    problems.push({
      code: 'missing-us-unit',
      message: isSolid
        ? 'Missing US weight unit (OZ or LB).'
        : 'Missing US fluid unit (FL OZ, QT, or GAL).',
    })
  }

  // Metric unit in parentheses?
  const metricInParensRe = isSolid
    ? /\([^)]*\b(\d[\d.,]*)\s*(g|kg|gram|grams|kilogram|kilograms)\b/i
    : /\([^)]*\b(\d[\d.,]*)\s*(ml|l|millilit|liter|litre)\w*/i
  if (!metricInParensRe.test(t)) {
    problems.push({
      code: 'missing-metric',
      message: isSolid
        ? 'Metric weight (g or kg) must appear in parentheses after the US declaration.'
        : 'Metric volume (mL or L) must appear in parentheses after the US declaration.',
    })
  }

  return { ok: problems.length === 0, problems }
}

export interface NetQuantityProblem {
  code:
    | 'empty'
    | 'no-number'
    | 'no-count-unit'
    | 'missing-prefix'
    | 'missing-us-unit'
    | 'missing-metric'
  message: string
}

/**
 * Detect whether a free-text container string suggests count, liquid, or
 * solid. Best-effort — when ambiguous returns "solid" because food is
 * the most common category in our catalog. Used by deriveProductCtx so
 * the page server-side picks the right format kind without a separate
 * schema column.
 */
export function inferNetQuantityKind(
  containerFormat: string | null | undefined,
  productCategory:
    | 'FOOD'
    | 'BEVERAGE_FUNCTIONAL'
    | 'SUPPLEMENT'
    | string,
): NetQuantityKind {
  const cf = (containerFormat ?? '').toLowerCase()
  if (
    /\b(capsule|capsules|tablet|tablets|gummies|gummy|softgel|softgels|count|ct|piece|sachet)\b/.test(
      cf,
    )
  ) {
    return 'count'
  }
  if (/\b(fl\s*oz|ml|millilit|liter|litre|\bl\b)\b/.test(cf)) {
    return 'liquid'
  }
  if (productCategory === 'SUPPLEMENT') return 'count'
  if (productCategory === 'BEVERAGE_FUNCTIONAL') return 'liquid'
  return 'solid'
}

/**
 * Try to extract the count from a free-text container format like
 * "60-count capsule bottle" → 60. Returns null when no count is found.
 */
export function extractCount(containerFormat: string | null | undefined): number | null {
  if (!containerFormat) return null
  const m =
    /(\d+)\s*(?:-|\s)?(?:count|ct|capsule|capsules|tablet|tablets|gummies|gummy|softgel|softgels|piece|pieces|sachet|sachets)/i.exec(
      containerFormat,
    )
  return m ? Number(m[1]) : null
}

/**
 * Try to extract the count unit word from a free-text container format.
 * Returns null when ambiguous — caller defaults to "COUNT".
 */
export function extractCountUnit(
  containerFormat: string | null | undefined,
): string | null {
  if (!containerFormat) return null
  const m =
    /\d+\s*(?:-|\s)?(capsules?|tablets?|gummies|gummy|softgels?|pieces?|sachets?)\b/i.exec(
      containerFormat,
    )
  if (!m || !m[1]) return null
  // Normalize "Capsule" → "CAPSULES" (FDA prefers plural unless count = 1).
  return m[1]
    .toUpperCase()
    .replace(/CAPSULE$/, 'CAPSULES')
    .replace(/TABLET$/, 'TABLETS')
    .replace(/SOFTGEL$/, 'SOFTGELS')
    .replace(/GUMMY$/, 'GUMMIES')
    .replace(/PIECE$/, 'PIECES')
    .replace(/SACHET$/, 'SACHETS')
}

// ============================================================================
// Internal — solids
// ============================================================================

function formatSolid(grams: number): string {
  const totalOz = grams / OZ_TO_G
  const totalLb = grams / LB_TO_G

  if (totalLb >= 4) {
    // "NET WT 4.5 LB (2.04 kg)"
    return `NET WT ${roundDecimal(totalLb, 1)} LB (${roundDecimal(grams / 1000, 2)} kg)`
  }

  if (totalLb >= 1) {
    // "NET WT 1 LB 8 OZ (680g)" — split lb + remaining oz, prefer whole oz.
    const wholeLb = Math.floor(totalLb)
    const remainingOz = roundHalf(totalOz - wholeLb * 16)
    const ozPart = remainingOz > 0 ? ` ${stripTrailingZero(remainingOz)} OZ` : ''
    return `NET WT ${wholeLb} LB${ozPart} (${Math.round(grams)}g)`
  }

  // < 1 lb — straight oz.
  // FDA permits 0.5 / 0.25 increments; we round to nearest 0.5 oz with one
  // decimal kept off for tidy display.
  const oz = roundHalf(totalOz)
  return `NET WT ${stripTrailingZero(oz)} OZ (${Math.round(grams)}g)`
}

// ============================================================================
// Internal — liquids
// ============================================================================

function formatLiquid(ml: number): string {
  const flOz = ml / ML_PER_FL_OZ
  const gal = ml / ML_PER_GAL
  const qt = ml / ML_PER_QT

  if (gal >= 1) {
    // "NET 1.5 GAL (5.68 L)"
    return `NET ${roundDecimal(gal, 1)} GAL (${roundDecimal(ml / 1000, 2)} L)`
  }
  if (qt >= 1) {
    // "NET 1.5 QT (1.42 L)"
    return `NET ${roundDecimal(qt, 1)} QT (${roundDecimal(ml / 1000, 2)} L)`
  }
  // Below 1 quart — declare in fl oz + mL.
  return `NET ${stripTrailingZero(roundHalf(flOz))} FL OZ (${Math.round(ml)} mL)`
}

// ============================================================================
// Conversion constants — kept here so the math is auditable in one place.
// ============================================================================

const OZ_TO_G = 28.349523125 // avoirdupois ounce (NIST handbook 44)
const LB_TO_G = 453.59237
const ML_PER_FL_OZ = 29.5735295625 // US fluid ounce
const ML_PER_QT = 946.352946
const ML_PER_GAL = 3785.411784

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}

function roundDecimal(n: number, places: number): string {
  return n.toFixed(places).replace(/\.?0+$/, '') || '0'
}

function stripTrailingZero(n: number): string {
  // "1.5" → "1.5"; "1.0" → "1"; "0.5" → "0.5"
  return String(n).replace(/\.0+$/, '')
}
