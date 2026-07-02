/**
 * Design Template Library — pure matching engine (docs/DESIGN_TEMPLATE_LIBRARY.md §6).
 *
 * Given a product's packaging components (each a die-line surface) and the candidate
 * templates for the product's domain, returns one section per component, with the
 * matched templates grouped by their primary style category. Matching is by die-line
 * GEOMETRY (shape-family) with EXACT packagingTypeId preferred. No React, no Fabric,
 * no Prisma — fully unit-testable.
 */

export type AspectBucket = 'WRAP' | 'PANEL_WIDE' | 'PANEL_SQUARE' | 'PANEL_TALL' | 'LONG_STRIP'
export type TemplateMatchMode = 'SHAPE_FAMILY' | 'EXACT'

/** A product's packaging component = one die-line surface to design. */
export interface ProductComponentDieline {
  componentId: string
  label: string // "Bottle label", "6-pack carton"
  packagingTypeId: string | null
  containerCategory: string | null // ContainerCategory enum value (CAN, CARTON, …)
  widthMm?: number | null
  heightMm?: number | null
}

/** A candidate template (already scoped to the product's domain by the caller, but we
 *  re-check `domain` defensively when provided). */
export interface MatchableTemplate {
  id: string
  name: string
  thumbnailUrl: string | null
  isPremium: boolean
  domain?: string | null
  matchMode: TemplateMatchMode
  packagingTypeId: string | null
  targetContainerCategory: string | null
  aspectBucket: AspectBucket | null
  primaryStyleId: string | null
  primaryStyleLabel: string | null
}

export interface MatchedTemplate extends MatchableTemplate {
  /** Matched the component's exact packagingTypeId (sorts first). */
  exact: boolean
}

export interface TemplateStyleGroup {
  styleId: string | null
  styleLabel: string
  templates: MatchedTemplate[]
}

export interface TemplateSection {
  componentId: string
  label: string
  aspectBucket: AspectBucket | null
  groups: TemplateStyleGroup[]
}

// --- Aspect-ratio buckets (thresholds are an open knob — docs §10.1) ---
const RATIO_WRAP = 2.5
const RATIO_PANEL_WIDE = 1.3
const RATIO_PANEL_SQUARE = 0.8
const RATIO_PANEL_TALL = 0.3

/** Width/height (mm) → aspect bucket. Returns null if dimensions are missing. */
export function aspectBucketFor(
  widthMm?: number | null,
  heightMm?: number | null,
): AspectBucket | null {
  if (!widthMm || !heightMm || widthMm <= 0 || heightMm <= 0) return null
  const ratio = widthMm / heightMm
  if (ratio >= RATIO_WRAP) return 'WRAP'
  if (ratio >= RATIO_PANEL_WIDE) return 'PANEL_WIDE'
  if (ratio >= RATIO_PANEL_SQUARE) return 'PANEL_SQUARE'
  if (ratio >= RATIO_PANEL_TALL) return 'PANEL_TALL'
  return 'LONG_STRIP'
}

// -----------------------------------------------------------------------------
// Template targeting derivation (docs/DESIGN_TEMPLATE_LIBRARY.md §8.2).
//
// When a template is SAVED (admin Studio authoring, or an AI-generated concept), it
// must be tagged with the die-line it belongs to so the matcher scopes it correctly.
// This derives { targetContainerCategory, aspectBucket } from whatever the caller
// knows: a real ContainerCategory (preferred — comes from the product's packaging
// type, full 30-value vocabulary) OR the coarse 6-value DieCutCategory (fallback),
// plus the surface's mm dimensions. Shared by every save path so scoping is uniform.
// -----------------------------------------------------------------------------

/** DieCutCategory → ContainerCategory. Fallback used only when no real container is known. */
export const DIE_CUT_CATEGORY_TO_CONTAINER: Record<string, string> = {
  // original set
  BOTTLE_WRAP: 'BOTTLE',
  TUB_LID: 'JAR',
  POUCH_FRONT: 'POUCH',
  BOX_PANEL: 'BOX',
  STICKER: 'OTHER',
  CUSTOM: 'OTHER',
  // applied labels & sleeves
  CAN_WRAP: 'CAN',
  JAR_WRAP: 'JAR',
  WRAP_AROUND_LABEL: 'WRAP',
  FRONT_BACK_LABEL: 'BOTTLE',
  SHRINK_SLEEVE: 'BOTTLE',
  NECK_LABEL: 'BOTTLE',
  LID_LABEL: 'TUB',
  HANG_TAG: 'PEGGED',
  // folding cartons
  STRAIGHT_TUCK_CARTON: 'CARTON',
  REVERSE_TUCK_CARTON: 'CARTON',
  SEAL_END_CARTON: 'CARTON',
  AUTO_BOTTOM_CARTON: 'CARTON',
  SNAP_LOCK_CARTON: 'CARTON',
  GABLE_TOP_CARTON: 'CARTON',
  FOLDING_TRAY: 'TRAY',
  CARTON_SLEEVE: 'SLEEVE',
  RIGID_BOX: 'BOX',
  MAILER_BOX: 'BOX',
  SHIPPER_CASE: 'CASE',
  // flexible packaging
  STAND_UP_POUCH: 'POUCH',
  FLAT_POUCH: 'POUCH',
  GUSSETED_BAG: 'BAG',
  SACHET: 'SACHET',
  STICK_PACK: 'STICK_PACK',
  FLOW_WRAP: 'WRAP',
  ROLLSTOCK: 'ROLLSTOCK',
  // rigid / other
  BLISTER_CARD: 'PEGGED',
  CLAMSHELL: 'OTHER',
}

export interface TemplateTargetingInput {
  /** The product's real container (ContainerCategory enum value) — preferred, most precise. */
  containerCategory?: string | null
  /** Coarse die-cut category — used only when containerCategory is absent. */
  dieCutCategory?: string | null
  widthMm?: number | null
  heightMm?: number | null
}

export interface TemplateTargeting {
  targetContainerCategory: string | null
  aspectBucket: AspectBucket | null
}

/**
 * Resolve a template's die-line targeting. Prefers a real ContainerCategory; falls back
 * to mapping the coarse DieCutCategory; aspect bucket comes from the surface dimensions.
 * Pure — same input → same targeting.
 */
export function deriveTemplateTargeting(input: TemplateTargetingInput): TemplateTargeting {
  const fromContainer = input.containerCategory?.trim() || null
  const fromDieCut = input.dieCutCategory ? DIE_CUT_CATEGORY_TO_CONTAINER[input.dieCutCategory] ?? null : null
  return {
    targetContainerCategory: fromContainer ?? fromDieCut,
    aspectBucket: aspectBucketFor(input.widthMm, input.heightMm),
  }
}

const UNCATEGORIZED = '__uncategorized__'

function templateMatchesComponent(
  t: MatchableTemplate,
  component: ProductComponentDieline,
  componentBucket: AspectBucket | null,
): boolean {
  if (t.matchMode === 'EXACT') {
    return !!t.packagingTypeId && t.packagingTypeId === component.packagingTypeId
  }
  // SHAPE_FAMILY: same container category, and (if both buckets known) same bucket.
  if (!t.targetContainerCategory || !component.containerCategory) return false
  if (t.targetContainerCategory !== component.containerCategory) return false
  if (t.aspectBucket && componentBucket && t.aspectBucket !== componentBucket) return false
  return true
}

/**
 * Build the template library view for a product.
 *
 * @param components  the product's packaging components (die-line surfaces)
 * @param domain      the product's LabelingType (used to drop wrong-domain templates)
 * @param templates   candidate templates (ideally already domain-scoped)
 */
export function matchTemplatesToProduct(
  components: ProductComponentDieline[],
  domain: string,
  templates: MatchableTemplate[],
): TemplateSection[] {
  const inDomain = templates.filter((t) => !t.domain || t.domain === domain)

  return components.map((component) => {
    const componentBucket = aspectBucketFor(component.widthMm, component.heightMm)

    const matched: MatchedTemplate[] = inDomain
      .filter((t) => templateMatchesComponent(t, component, componentBucket))
      .map((t) => ({
        ...t,
        exact: !!t.packagingTypeId && t.packagingTypeId === component.packagingTypeId,
      }))

    // Group by primary style; exact-first within each group.
    const byStyle = new Map<string, TemplateStyleGroup>()
    for (const t of matched) {
      const key = t.primaryStyleId ?? UNCATEGORIZED
      let group = byStyle.get(key)
      if (!group) {
        group = {
          styleId: t.primaryStyleId,
          styleLabel: t.primaryStyleLabel ?? 'Other',
          templates: [],
        }
        byStyle.set(key, group)
      }
      group.templates.push(t)
    }
    for (const group of byStyle.values()) {
      group.templates.sort(sortTemplate)
    }

    const groups = [...byStyle.values()].sort(sortGroup)
    return { componentId: component.componentId, label: component.label, aspectBucket: componentBucket, groups }
  })
}

// Exact templates first, then premium, then name.
function sortTemplate(a: MatchedTemplate, b: MatchedTemplate): number {
  if (a.exact !== b.exact) return a.exact ? -1 : 1
  if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1
  return a.name.localeCompare(b.name)
}

// Named groups alphabetically; "Other" (uncategorized) last.
function sortGroup(a: TemplateStyleGroup, b: TemplateStyleGroup): number {
  const au = a.styleId === null
  const bu = b.styleId === null
  if (au !== bu) return au ? 1 : -1
  return a.styleLabel.localeCompare(b.styleLabel)
}

// -----------------------------------------------------------------------------
// Design Reshape — severity routing (docs/DESIGN_RESHAPE_CROSS_DIELINE.md).
//
// Pure classifier: given a SOURCE design's shape family and a TARGET die-line's,
// decide how to carry the design idea across — direct apply, deterministic
// focal crop, provider outpaint, or reference-conditioned regeneration.
// -----------------------------------------------------------------------------

export type ReshapeMethod = 'DIRECT' | 'CROP' | 'OUTPAINT' | 'REF_REGEN'
export type ReshapeSeverity = 'S0' | 'S1' | 'S2' | 'S3'

export interface ReshapeShape {
  /** ContainerCategory value (CAN, BOX, POUCH, …) — null when unknown. */
  containerCategory?: string | null
  /** Aspect bucket (aspectBucketFor) — null when dimensions were unknown. */
  aspectBucket?: AspectBucket | string | null
}

export interface ReshapeSource extends ReshapeShape {
  /** Whether the source generation stored a reusable brief (drives the S3 gate). */
  hasBrief?: boolean
}

export interface ReshapeTarget extends ReshapeShape {
  /** Target renders as a multi-panel box (per-face frames) — always S3. */
  multiPanel?: boolean
}

export interface ReshapeRoute {
  severity: ReshapeSeverity
  method: ReshapeMethod
  /** Distance on the ordered aspect-bucket scale (0 when either side is unknown). */
  bucketDelta: number
}

const BUCKET_ORDER: readonly string[] = ['WRAP', 'PANEL_WIDE', 'PANEL_SQUARE', 'PANEL_TALL', 'LONG_STRIP']

/** ContainerCategory → coarse 3D shape kind. Cylindrical bodies and flat surfaces
 *  are "unroll-compatible": at equal aspect the print rectangle is identical. */
export function containerShapeKind(category?: string | null): 'BOX' | 'CYLINDER' | 'FLAT' {
  switch ((category ?? '').toUpperCase()) {
    case 'BOX':
    case 'CARTON':
    case 'RIGID_BOX':
    case 'MAILER':
    case 'CASE':
      return 'BOX'
    case 'CAN':
    case 'BOTTLE':
    case 'JAR':
    case 'TUBE':
    case 'TUB':
      return 'CYLINDER'
    default:
      return 'FLAT'
  }
}

/**
 * Route a cross-die-line reshape (spec §Severity routing rules):
 *   S0 direct   — same bucket AND unroll-compatible shape kinds (FLAT↔CYLINDER at
 *                 equal aspect is pure unrolling — never spend AI on it).
 *   S1 crop     — Δbucket ≤ 1 (deterministic focal cover-crop).
 *   S2 outpaint — Δbucket ≥ 2, target not multi-panel.
 *   S3 regen    — multi-panel BOX target, or Δbucket ≥ 2 with no stored brief.
 * Unknown buckets classify conservatively as S1 (cheap + reviewable in the try-on loop).
 */
export function classifyReshape(source: ReshapeSource, target: ReshapeTarget): ReshapeRoute {
  const si = BUCKET_ORDER.indexOf(String(source.aspectBucket ?? ''))
  const ti = BUCKET_ORDER.indexOf(String(target.aspectBucket ?? ''))
  const known = si >= 0 && ti >= 0
  const bucketDelta = known ? Math.abs(si - ti) : 0

  const sKind = containerShapeKind(source.containerCategory)
  const tKind = containerShapeKind(target.containerCategory)
  const unrollCompatible = sKind === tKind || (sKind !== 'BOX' && tKind !== 'BOX')

  if (target.multiPanel) return { severity: 'S3', method: 'REF_REGEN', bucketDelta }
  if (!known) return { severity: 'S1', method: 'CROP', bucketDelta }
  if (bucketDelta === 0 && unrollCompatible) return { severity: 'S0', method: 'DIRECT', bucketDelta }
  if (bucketDelta <= 1) return { severity: 'S1', method: 'CROP', bucketDelta }
  if (source.hasBrief === false) return { severity: 'S3', method: 'REF_REGEN', bucketDelta }
  return { severity: 'S2', method: 'OUTPAINT', bucketDelta }
}

/** XML-escape a URL for an SVG attribute. */
function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

/**
 * Deterministic focal cover-crop (reshape rung R2): wrap the source art in an SVG
 * sized to the TARGET surface. Default is a center cover-crop via native
 * `preserveAspectRatio="xMidYMid slice"`. When the caller knows the source aspect
 * AND a focal point (saliency detection — see the Studio drawer's detectFocalPoint),
 * the crop window is computed explicitly so the focal point stays in frame:
 * `focal` is the normalized (0..1) point to keep centered where possible.
 * Pure string → string; render-identical everywhere SVG renders.
 */
export function reshapeCropSvg(
  source: string,
  targetWidthMm: number,
  targetHeightMm: number,
  opts?: { sourceAspect?: number; focal?: { x: number; y: number } },
): string {
  const s = source.trim()
  const href = s.startsWith('<svg') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}` : s
  const w = Math.max(1, Math.round(targetWidthMm * 10) / 10)
  const h = Math.max(1, Math.round(targetHeightMm * 10) / 10)

  const srcAspect = opts?.sourceAspect
  const focal = opts?.focal
  if (srcAspect && srcAspect > 0 && focal) {
    // Explicit cover window: render the source at cover scale (no distortion —
    // the rect matches the source aspect exactly), offset so the focal point sits
    // as close to the target center as the overflow allows.
    const targetAspect = w / h
    const rw = srcAspect >= targetAspect ? h * srcAspect : w
    const rh = srcAspect >= targetAspect ? h : w / srcAspect
    const fx = Math.min(1, Math.max(0, focal.x))
    const fy = Math.min(1, Math.max(0, focal.y))
    const ox = Math.min(Math.max(fx * rw - w / 2, 0), Math.max(0, rw - w))
    const oy = Math.min(Math.max(fy * rh - h / 2, 0), Math.max(0, rh - h))
    const r = (v: number) => Math.round(v * 100) / 100
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm"><image href="${escapeAttr(href)}" x="${r(-ox)}" y="${r(-oy)}" width="${r(rw)}" height="${r(rh)}" preserveAspectRatio="none"/></svg>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm"><image href="${escapeAttr(href)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/></svg>`
}

/**
 * Reshape fidelity (P3 quality scoring) — an HONEST, deterministic indicator of
 * how much of the original design survives the routed method:
 *   DIRECT    → 100, 'exact'          (same print rectangle)
 *   CROP      → retained area share,  'cropped'       (cover-crop loses overflow)
 *   OUTPAINT  → original-pixel share, 'extended'      (original intact, borders new)
 *   REF_REGEN → 0,   'reinterpreted'  (new art in the same style — no pixel fidelity)
 * Aspects default to 1 when unknown (score degrades to a method-only signal).
 */
export function reshapeFidelity(
  method: ReshapeMethod,
  sourceAspect?: number | null,
  targetAspect?: number | null,
): { score: number; label: 'exact' | 'cropped' | 'extended' | 'reinterpreted' } {
  const a = sourceAspect && sourceAspect > 0 ? sourceAspect : 1
  const b = targetAspect && targetAspect > 0 ? targetAspect : 1
  const ratio = Math.min(a, b) / Math.max(a, b) // shared-area share for cover/extend
  switch (method) {
    case 'DIRECT':
      return { score: 100, label: 'exact' }
    case 'CROP':
      return { score: Math.round(ratio * 100), label: 'cropped' }
    case 'OUTPAINT':
      return { score: Math.round(ratio * 100), label: 'extended' }
    case 'REF_REGEN':
      return { score: 0, label: 'reinterpreted' }
  }
}
