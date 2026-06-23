// =============================================================================
// Die-line frame model — content-agnostic typed SLOTS + scoped resolution.
// docs/DIELINE_FRAME_EDITOR_SPEC.md.
// =============================================================================
//
// A die-line owns geometry + a layer of FRAMES. A frame is a placeholder with a
// `kind` ("a recycling mark goes here", "the Facts panel goes here") — it never
// bakes in WHICH symbol or WHICH certs. The content that fills a frame resolves
// at composition time from the frame's BINDING SCOPE:
//
//   RECIPE   → Nutrition Facts / ingredient list / allergen line (per recipe)
//   MATERIAL → recycling / resin / compostability marks (per substrate+material+market)
//   PRODUCT  → certificate badges, mandatory phrases, labeling symbols (per product)
//   IDENTITY → statement of identity, net quantity, manufacturer, barcode (per product)
//   CREATIVE → logo, imagery, custom (creator artwork)
//
// This is what lets ONE die-line template serve a glass bottle AND a plastic
// bottle: same geometry + frames, but the MATERIAL frame resolves to the resin
// code + How2Recycle for plastic and the glass mark for glass — driven by the
// product's material, not the die-line. Material-specific slots carry an
// `appliesTo` condition so a resin code simply doesn't render on glass.
//
// Pure + DB-free. The app supplies the symbol library (PackagingSymbol rows) and
// the recipe/cert/phrase content; this module decides WHICH frames apply and
// WHAT scope/families each resolves from.

export type FrameScope = 'RECIPE' | 'MATERIAL' | 'PRODUCT' | 'IDENTITY' | 'CREATIVE'

export type FrameKind =
  // RECIPE — platform-owned, auto-checked, recipe-derived
  | 'NUTRITION_FACTS'
  | 'INGREDIENTS'
  | 'ALLERGENS'
  // IDENTITY — per product, mostly static
  | 'STATEMENT_OF_IDENTITY'
  | 'NET_QUANTITY'
  | 'MANUFACTURER'
  | 'BARCODE'
  // MATERIAL — resolves from substrate/material via PackagingSymbol families
  | 'RECYCLING_MARK'
  | 'COMPOSTABILITY'
  | 'DISPOSAL'
  // PRODUCT — resolves from the product
  | 'CERTIFICATIONS'
  | 'PHRASES'
  | 'LABELING_SYMBOL'
  // CREATIVE — creator artwork
  | 'LOGO'
  | 'IMAGERY'
  | 'CUSTOM'

/** Normalized to the surface trim box — each component in 0..1. */
export interface NormBox {
  x: number
  y: number
  w: number
  h: number
}

export interface FrameConditions {
  /** Render only for these PackagingMaterial slugs. Empty/undefined = all. */
  materials?: string[]
  /** Render only for these Substrate slugs. */
  substrates?: string[]
  /** Render only in these market codes (e.g. "US", "CA"). */
  markets?: string[]
  /** Render only when the product carries ≥1 certificate. */
  requiresCerts?: boolean
  /** Render only when the product has a barcode (GTIN/SKU mode set). */
  requiresBarcode?: boolean
}

/**
 * Die-line-INTRINSIC content pinned onto a frame (content fidelity, Pavel
 * 2026-06-23). Most frames resolve their content per-product at composition, but
 * a partner may pin a SPECIFIC phrase or packaging symbol directly on the
 * die-line (e.g. "Keep Frozen", a recycling mark). Pinned content renders
 * immediately on every canvas — die-line editor, Studio, mockups — independent
 * of any product, so whatever the partner placed + saved actually shows up.
 */
export interface PinnedContent {
  /** A specific phrase / line of text drawn directly in the frame. */
  text?: string
  /** A specific packaging symbol slug (from the PackagingSymbol library). */
  symbolSlug?: string
}

export interface Frame {
  id: string
  kind: FrameKind
  /** PackagingDieline.surfaces[].name; undefined = primary display panel. */
  surfaceId?: string
  box: NormBox
  rotationDeg?: number
  /** Drives the submit gate. */
  required: boolean
  /** PLATFORM = seeded default; PARTNER = partner-placed; ADMIN = admin-adjusted. */
  source: 'PLATFORM' | 'PARTNER' | 'ADMIN'
  appliesTo?: FrameConditions
  /** Die-line-intrinsic content the partner pinned — renders directly. */
  pinnedContent?: PinnedContent
  notes?: string
}

export interface FrameLayout {
  version: 1
  frames: Frame[]
}

// ---------------------------------------------------------------------------
// Scope + family maps
// ---------------------------------------------------------------------------

export const FRAME_SCOPE: Record<FrameKind, FrameScope> = {
  NUTRITION_FACTS: 'RECIPE',
  INGREDIENTS: 'RECIPE',
  ALLERGENS: 'RECIPE',
  STATEMENT_OF_IDENTITY: 'IDENTITY',
  NET_QUANTITY: 'IDENTITY',
  MANUFACTURER: 'IDENTITY',
  BARCODE: 'IDENTITY',
  RECYCLING_MARK: 'MATERIAL',
  COMPOSTABILITY: 'MATERIAL',
  DISPOSAL: 'MATERIAL',
  CERTIFICATIONS: 'PRODUCT',
  PHRASES: 'PRODUCT',
  LABELING_SYMBOL: 'PRODUCT',
  LOGO: 'CREATIVE',
  IMAGERY: 'CREATIVE',
  CUSTOM: 'CREATIVE',
}

/** Recipe-derived kinds: platform-owned objects the submit gate auto-validates. */
export const RECIPE_DERIVED_KINDS: ReadonlyArray<FrameKind> = [
  'NUTRITION_FACTS',
  'INGREDIENTS',
  'ALLERGENS',
]

/** Which PackagingSymbolFamily values a MATERIAL frame pulls from the library. */
export const MATERIAL_FRAME_FAMILIES: Partial<Record<FrameKind, string[]>> = {
  RECYCLING_MARK: ['RESIN_CODE', 'RECYCLING_MARK'],
  COMPOSTABILITY: ['COMPOSTABILITY'],
  DISPOSAL: ['DISPOSAL'],
}

// ---------------------------------------------------------------------------
// Composition context + resolution
// ---------------------------------------------------------------------------

export interface FrameContext {
  materialSlug?: string | null
  substrateSlug?: string | null
  marketCode?: string | null
  hasCerts?: boolean
  hasBarcode?: boolean
}

/** Does a frame apply in this composition context? */
export function frameApplies(frame: Frame, ctx: FrameContext): boolean {
  const c = frame.appliesTo
  if (!c) return true
  if (c.materials?.length && !(ctx.materialSlug && c.materials.includes(ctx.materialSlug))) return false
  if (c.substrates?.length && !(ctx.substrateSlug && c.substrates.includes(ctx.substrateSlug))) return false
  if (c.markets?.length && !(ctx.marketCode && c.markets.includes(ctx.marketCode))) return false
  if (c.requiresCerts && !ctx.hasCerts) return false
  if (c.requiresBarcode && !ctx.hasBarcode) return false
  return true
}

export interface ResolvedFrame {
  frame: Frame
  scope: FrameScope
  recipeDerived: boolean
  /** PackagingSymbolFamily values to query for MATERIAL frames (else []). */
  symbolFamilies: string[]
}

/**
 * Resolve which frames apply + their scope/families. The app then fills each
 * from the right source (recipe engine, PackagingSymbol library, certs, phrases).
 */
export function resolveLayout(
  layout: FrameLayout | null | undefined,
  ctx: FrameContext,
): ResolvedFrame[] {
  const frames = layout?.frames ?? DEFAULT_FRAME_LAYOUT.frames
  return frames
    .filter((f) => frameApplies(f, ctx))
    .map((f) => ({
      frame: f,
      scope: FRAME_SCOPE[f.kind],
      recipeDerived: RECIPE_DERIVED_KINDS.includes(f.kind),
      symbolFamilies: MATERIAL_FRAME_FAMILIES[f.kind] ?? [],
    }))
}

/** Required frames (after applicability) — the submit gate's checklist. */
export function requiredFrames(layout: FrameLayout | null | undefined, ctx: FrameContext): ResolvedFrame[] {
  return resolveLayout(layout, ctx).filter((r) => r.frame.required)
}

// ---------------------------------------------------------------------------
// Material-mark resolution (pure over a supplied PackagingSymbol library)
// ---------------------------------------------------------------------------

export interface MaterialSymbol {
  id: string
  slug: string
  name: string
  family: string // PackagingSymbolFamily
  applicableSubstrates: string[]
  applicableMaterials: string[]
  applicableMarkets: string[]
  requirement: string // SymbolRequirement
}

/** Empty applicability list = "applies to all"; otherwise must include ctx value. */
function listMatches(list: string[] | undefined, val: string | null | undefined): boolean {
  if (!list || list.length === 0) return true
  return val != null && list.includes(val)
}

/**
 * Pick the symbols that fill a MATERIAL frame for this context. The app loads
 * the active PackagingSymbol rows (+ variants) and passes them in; this filters
 * by family + material/substrate/market applicability.
 */
export function resolveMaterialMarks(
  library: MaterialSymbol[],
  families: string[],
  ctx: FrameContext,
): MaterialSymbol[] {
  return library.filter(
    (s) =>
      families.includes(s.family) &&
      listMatches(s.applicableMaterials, ctx.materialSlug) &&
      listMatches(s.applicableSubstrates, ctx.substrateSlug) &&
      listMatches(s.applicableMarkets, ctx.marketCode),
  )
}

// ---------------------------------------------------------------------------
// Layout validity — partner-side preflight before confirming a die-line.
// Distinct from the creator submit gate (which checks FILLED objects): this
// checks the TEMPLATE itself — are the required mandatory slots present, and do
// the frames sit inside the safe area? A creator can't place a Facts panel if
// the die-line has no Facts slot, so confirming an incomplete template is
// blocked.
// ---------------------------------------------------------------------------

/** Mandatory slots every food die-line must offer (FDA baseline). */
export const MANDATORY_KINDS: ReadonlyArray<FrameKind> = [
  'STATEMENT_OF_IDENTITY',
  'NUTRITION_FACTS',
  'INGREDIENTS',
  'ALLERGENS',
  'NET_QUANTITY',
  'MANUFACTURER',
]

export type LayoutIssueCode = 'MISSING_MANDATORY' | 'OUT_OF_SAFE_AREA'

export interface LayoutIssue {
  code: LayoutIssueCode
  kind?: FrameKind
  message: string
}

function boxInside(outer: NormBox, inner: NormBox, eps = 0.01): boolean {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.w <= outer.x + outer.w + eps &&
    inner.y + inner.h <= outer.y + outer.h + eps
  )
}

function humanFrameKind(k: FrameKind): string {
  return k
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Validate a die-line template before the partner confirms it. */
export function validateFrameLayout(
  layout: FrameLayout,
  opts: { safeArea?: NormBox } = {},
): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const presentKinds = new Set(layout.frames.map((f) => f.kind))

  for (const k of MANDATORY_KINDS) {
    if (!presentKinds.has(k)) {
      issues.push({ code: 'MISSING_MANDATORY', kind: k, message: `${humanFrameKind(k)} slot is missing — add it before confirming.` })
    }
  }

  if (opts.safeArea) {
    for (const f of layout.frames) {
      if (!boxInside(opts.safeArea, f.box)) {
        issues.push({ code: 'OUT_OF_SAFE_AREA', kind: f.kind, message: `${humanFrameKind(f.kind)} extends outside the safe area.` })
      }
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Default layout — a sensible starting arrangement the partner adjusts.
// Single primary display panel; boxes stacked top→bottom in 0..1 space.
// ---------------------------------------------------------------------------

let _uid = 0
const fid = (k: string) => `f_${k}_${_uid++}`

export const DEFAULT_FRAME_LAYOUT: FrameLayout = {
  version: 1,
  frames: [
    { id: fid('soi'), kind: 'STATEMENT_OF_IDENTITY', box: { x: 0.08, y: 0.06, w: 0.84, h: 0.1 }, required: true, source: 'PLATFORM' },
    { id: fid('netqty'), kind: 'NET_QUANTITY', box: { x: 0.08, y: 0.17, w: 0.4, h: 0.06 }, required: true, source: 'PLATFORM' },
    { id: fid('facts'), kind: 'NUTRITION_FACTS', box: { x: 0.55, y: 0.28, w: 0.37, h: 0.5 }, required: true, source: 'PLATFORM' },
    { id: fid('ingredients'), kind: 'INGREDIENTS', box: { x: 0.08, y: 0.28, w: 0.42, h: 0.3 }, required: true, source: 'PLATFORM' },
    { id: fid('allergens'), kind: 'ALLERGENS', box: { x: 0.08, y: 0.6, w: 0.42, h: 0.08 }, required: true, source: 'PLATFORM' },
    { id: fid('mfr'), kind: 'MANUFACTURER', box: { x: 0.08, y: 0.7, w: 0.42, h: 0.1 }, required: true, source: 'PLATFORM' },
    // Conditional slots — only render when their context condition holds.
    { id: fid('recycle'), kind: 'RECYCLING_MARK', box: { x: 0.78, y: 0.82, w: 0.14, h: 0.12 }, required: false, source: 'PLATFORM', appliesTo: {} },
    { id: fid('certs'), kind: 'CERTIFICATIONS', box: { x: 0.08, y: 0.82, w: 0.4, h: 0.12 }, required: false, source: 'PLATFORM', appliesTo: { requiresCerts: true } },
    { id: fid('barcode'), kind: 'BARCODE', box: { x: 0.55, y: 0.82, w: 0.2, h: 0.12 }, required: false, source: 'PLATFORM', appliesTo: { requiresBarcode: true } },
  ],
}
