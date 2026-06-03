// C8 (foundation) — pure mark-eligibility engine.
//
// Given a product's context (category, labeling type, target markets, selected
// packaging substrates/materials) + the marks the partner/library offers, rank
// which certification badges + packaging/labeling symbols apply, and flag the
// ones the product is REQUIRED to carry.
//
// Pure + dependency-free so it runs anywhere: the context-aware Design Studio
// drawer (ranked "recommended badges" tray) AND the submit-for-production
// compliance scanner ("missing required symbol for this product+market+
// substrate"). No prisma, no React, no canvas — data in, ranking out.
//
// IMPORTANT: eligibility here means "applies to / is placeable for this
// product." It deliberately does NOT decide whether a badge may be *rendered* —
// that is gated separately by per-cert consent (C6 LabelClaimConsent). Never
// auto-stamp; this engine only decides what to *offer*.

export type MarkKind = 'CERT' | 'PACKAGING' | 'LABELING'
export type MarkRequirement = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL'

export interface ProductMarkContext {
  categorySlug: string | null
  /** e.g. NUTRITION_FACTS / SUPPLEMENT_FACTS — matched against cert applicableLabelingTypes. */
  labelingType: string | null
  /** Brand target-market slugs. */
  marketSlugs: string[]
  /** Substrates of the currently-selected packaging. */
  substrates: string[]
  materials: string[]
  /** CertificateType ids the partner holds a VERIFIED instance for. */
  partnerVerifiedCertTypeIds: ReadonlySet<string>
}

export interface CertMarkInput {
  kind: 'CERT'
  id: string
  name: string
  /** UNIVERSAL applies everywhere; others gate on the applicable* arrays. */
  scope: string | null
  applicableLabelingTypes: string[]
  applicableCategorySlugs: string[]
  applicableMarketSlugs: string[]
}

export interface PackagingMarkInput {
  kind: 'PACKAGING'
  id: string
  name: string
  requirement: MarkRequirement
  applicableSubstrates: string[]
  applicableMaterials: string[]
  applicableMarkets: string[]
}

export interface LabelingMarkInput {
  kind: 'LABELING'
  id: string
  name: string
  requirement: MarkRequirement
  applicableCategorySlugs: string[]
  applicableMarkets: string[]
  requiredCoText: string | null
}

export type MarkInput = CertMarkInput | PackagingMarkInput | LabelingMarkInput

export interface RankedMark {
  id: string
  kind: MarkKind
  name: string
  /** Placeable for this product right now. Certs additionally require a VERIFIED partner instance. */
  eligible: boolean
  required: boolean
  score: number
  reasons: string[]
  /** Why it can't be placed yet (e.g. cert not verified), if not eligible. */
  blockedReason?: string
  requiredCoText?: string | null
}

// An empty applicability array is treated as a wildcard ("applies to any").
function matchesAxis(applicable: string[], values: string[]): { matched: boolean; wildcard: boolean } {
  if (applicable.length === 0) return { matched: true, wildcard: true }
  if (values.length === 0) return { matched: false, wildcard: false }
  const set = new Set(applicable)
  return { matched: values.some((v) => set.has(v)), wildcard: false }
}

function rankCert(m: CertMarkInput, ctx: ProductMarkContext): RankedMark | null {
  const reasons: string[] = []
  let score = 0
  const universal = (m.scope ?? '').toUpperCase() === 'UNIVERSAL'

  if (universal) {
    reasons.push('Universal — applies to any product')
    score += 1
  } else {
    const cat = matchesAxis(m.applicableCategorySlugs, ctx.categorySlug ? [ctx.categorySlug] : [])
    const lbl = matchesAxis(m.applicableLabelingTypes, ctx.labelingType ? [ctx.labelingType] : [])
    const mkt = matchesAxis(m.applicableMarketSlugs, ctx.marketSlugs)

    // If any explicitly-scoped axis fails to match, the cert doesn't apply here.
    if (!cat.matched || !lbl.matched || !mkt.matched) return null

    if (!cat.wildcard) {
      reasons.push('Category match')
      score += 2
    }
    if (!lbl.wildcard) {
      reasons.push('Labeling-type match')
      score += 2
    }
    if (!mkt.wildcard) {
      reasons.push('Target-market match')
      score += 2
    }
  }

  const verified = ctx.partnerVerifiedCertTypeIds.has(m.id)
  if (verified) {
    reasons.push('Verified by this partner')
    score += 3
  }

  return {
    id: m.id,
    kind: 'CERT',
    name: m.name,
    eligible: verified, // only a VERIFIED claim is placeable
    required: false, // certs are opt-in claims, never forced
    score,
    reasons,
    blockedReason: verified ? undefined : 'No verified certificate on file — claim it first',
  }
}

function rankPackaging(m: PackagingMarkInput, ctx: ProductMarkContext): RankedMark | null {
  const sub = matchesAxis(m.applicableSubstrates, ctx.substrates)
  const mat = matchesAxis(m.applicableMaterials, ctx.materials)
  const mkt = matchesAxis(m.applicableMarkets, ctx.marketSlugs)
  if (!sub.matched || !mat.matched || !mkt.matched) return null

  const reasons: string[] = []
  let score = 0
  if (!sub.wildcard) {
    reasons.push('Substrate match')
    score += 2
  }
  if (!mat.wildcard) {
    reasons.push('Material match')
    score += 1
  }
  if (!mkt.wildcard) {
    reasons.push('Target-market match')
    score += 2
  }
  const required = m.requirement === 'REQUIRED'
  if (required) {
    reasons.unshift('Required for this packaging/market')
    score += 5
  } else if (m.requirement === 'RECOMMENDED') {
    score += 1
  }

  return { id: m.id, kind: 'PACKAGING', name: m.name, eligible: true, required, score, reasons }
}

function rankLabeling(m: LabelingMarkInput, ctx: ProductMarkContext): RankedMark | null {
  const cat = matchesAxis(m.applicableCategorySlugs, ctx.categorySlug ? [ctx.categorySlug] : [])
  const mkt = matchesAxis(m.applicableMarkets, ctx.marketSlugs)
  if (!cat.matched || !mkt.matched) return null

  const reasons: string[] = []
  let score = 0
  if (!cat.wildcard) {
    reasons.push('Category match')
    score += 2
  }
  if (!mkt.wildcard) {
    reasons.push('Target-market match')
    score += 2
  }
  const required = m.requirement === 'REQUIRED'
  if (required) {
    reasons.unshift('Required for this product/market')
    score += 5
  } else if (m.requirement === 'RECOMMENDED') {
    score += 1
  }

  return {
    id: m.id,
    kind: 'LABELING',
    name: m.name,
    eligible: true,
    required,
    score,
    reasons,
    requiredCoText: m.requiredCoText,
  }
}

/**
 * Rank every applicable mark for a product, highest-priority first. Marks that
 * don't apply at all (failed an explicitly-scoped axis) are dropped.
 * Ordering: required first, then by score, then name.
 */
export function rankEligibleMarks(marks: MarkInput[], ctx: ProductMarkContext): RankedMark[] {
  const ranked: RankedMark[] = []
  for (const m of marks) {
    const r =
      m.kind === 'CERT' ? rankCert(m, ctx) : m.kind === 'PACKAGING' ? rankPackaging(m, ctx) : rankLabeling(m, ctx)
    if (r) ranked.push(r)
  }
  return ranked.sort(
    (a, b) =>
      Number(b.required) - Number(a.required) || b.score - a.score || a.name.localeCompare(b.name),
  )
}

/** The top-N "recommended badges" tray — eligible marks only, ranked. */
export function recommendedMarks(marks: MarkInput[], ctx: ProductMarkContext, limit = 6): RankedMark[] {
  return rankEligibleMarks(marks, ctx)
    .filter((m) => m.eligible)
    .slice(0, limit)
}

/**
 * Compliance-scanner helper: REQUIRED marks (packaging/labeling) that apply to
 * this product but are NOT in the set of marks already placed on the canvas.
 */
export function missingRequiredMarks(
  marks: MarkInput[],
  ctx: ProductMarkContext,
  placedMarkIds: ReadonlySet<string>,
): RankedMark[] {
  return rankEligibleMarks(marks, ctx).filter((m) => m.required && !placedMarkIds.has(m.id))
}
