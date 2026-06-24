// =============================================================================
// AI Packaging Generator — P3 metering engine (AI_PACKAGING_GENERATOR §13).
//
// PURE + deterministic. The economic core: it turns the two cost levers fal/Recraft
// actually bill on — DRAFT cycles and print-resolution MEGAPIXELS — into tier
// allotments + budgets, and answers "can this creator afford this?". No network,
// no DB, no provider. P3 wires the real provider against this verified engine.
//
// Two-stage model (the hinge): drafts are cheap (~1 MP each); we only pay print-res
// cost on FINALIZE (upscale of the chosen concept). So the resolution lever lives
// at finalize and is sold as a per-cycle MEGAPIXEL BUDGET — a creator trades
// quantity for size from the same budget (Pavel 2026-06-23).
//
// Numbers here are DEFAULTS Pavel tunes; the mechanism is the contract. The
// canonical per-tier numbers can be re-exported/overridden from @ilaunchify/plans.
// =============================================================================

/** Creator billing tiers (mirrors @ilaunchify/auth TierKey; local to stay dep-free). */
export type CreatorBillingTier = 'maker' | 'builder' | 'agency'

export interface TierGenerationLimits {
  /** Draft 4-concept cycles allowed per billing period. */
  draftCyclesPerPeriod: number
  /** Total print-resolution megapixels finalizable per billing period. */
  finalizeMpBudget: number
  /** Max megapixels for a single finalize (the resolution cap). */
  maxSingleRenderMp: number
  /** Stored-template storage cap, bytes. */
  storageBytes: number
  /** Images per draft cycle. */
  draftVariations: number
  /** Megapixels per draft image (preview res). */
  draftMpPerImage: number
}

const MB = 1024 * 1024
const GB = 1024 * MB

// fal/Recraft unit costs (USD) — see §13. Used for COGS estimates only.
export const COST = {
  FLUX_CONTROLNET_USD_PER_MP: 0.075,
  RECRAFT_VECTOR_USD: 0.08,
  UPSCALE_USD_PER_MP: 0.01,
} as const

/** Starting tier table — tune in @ilaunchify/plans. */
export const DEFAULT_TIER_LIMITS: Record<CreatorBillingTier, TierGenerationLimits> = {
  maker: { draftCyclesPerPeriod: 0, finalizeMpBudget: 0, maxSingleRenderMp: 0, storageBytes: 0, draftVariations: 4, draftMpPerImage: 1 },
  builder: { draftCyclesPerPeriod: 30, finalizeMpBudget: 36, maxSingleRenderMp: 6, storageBytes: 500 * MB, draftVariations: 4, draftMpPerImage: 1 },
  agency: { draftCyclesPerPeriod: 120, finalizeMpBudget: 240, maxSingleRenderMp: 16, storageBytes: 5 * GB, draftVariations: 4, draftMpPerImage: 1 },
}

/** Concrete limits for a tier (never returns undefined), with optional overrides. */
export function tierLimits(tier: CreatorBillingTier, overrides?: Partial<TierGenerationLimits>): TierGenerationLimits {
  const base = DEFAULT_TIER_LIMITS[tier]
  return overrides ? { ...base, ...overrides } : { ...base }
}

const MM_PER_INCH = 25.4

/** Pixels for a length in mm at a DPI (ceil). */
export function mmToPixels(mm: number, dpi: number): number {
  return Math.ceil((Math.max(0, mm) / MM_PER_INCH) * dpi)
}

export interface PanelMegapixels {
  rawMp: number
  /** Billed MP — rounded up to the nearest MP, min 1 (fal's rule). */
  billedMp: number
  pxW: number
  pxH: number
}

/** Megapixels for a panel at a print DPI (default 300). */
export function panelMegapixels(widthMm: number, heightMm: number, dpi = 300): PanelMegapixels {
  const pxW = mmToPixels(widthMm, dpi)
  const pxH = mmToPixels(heightMm, dpi)
  const rawMp = (pxW * pxH) / 1_000_000
  return { rawMp: Math.round(rawMp * 100) / 100, billedMp: Math.max(1, Math.ceil(rawMp)), pxW, pxH }
}

export interface DraftQuote {
  images: number
  megapixels: number
  usdCost: number
}

/** Cost/size of one draft cycle (cheap; generous allotment). */
export function quoteDraft(limits: TierGenerationLimits): DraftQuote {
  const images = limits.draftVariations
  const megapixels = images * Math.max(1, Math.ceil(limits.draftMpPerImage))
  return { images, megapixels, usdCost: round4(megapixels * COST.FLUX_CONTROLNET_USD_PER_MP) }
}

export interface FinalizeQuote {
  /** Billed MP after the tier res cap. */
  megapixels: number
  /** Billed MP before the cap (what the panel actually needs). */
  rawMp: number
  /** True when the panel exceeds the tier's max single-render res. */
  cappedToMax: boolean
  /** Estimated COGS (upscale + one Recraft vector type pass). */
  usdCost: number
}

/** Cost of finalizing (print-res render) one panel for a tier. */
export function quoteFinalize(
  widthMm: number,
  heightMm: number,
  limits: TierGenerationLimits,
  opts?: { dpi?: number; includeVectorType?: boolean },
): FinalizeQuote {
  const dpi = opts?.dpi ?? 300
  const includeVectorType = opts?.includeVectorType ?? true
  const { billedMp } = panelMegapixels(widthMm, heightMm, dpi)
  const cap = Math.max(1, limits.maxSingleRenderMp)
  const capped = Math.min(billedMp, cap)
  const usd = capped * COST.UPSCALE_USD_PER_MP + (includeVectorType ? COST.RECRAFT_VECTOR_USD : 0)
  return { megapixels: capped, rawMp: billedMp, cappedToMax: billedMp > cap, usdCost: round4(usd) }
}

export interface BudgetCheck {
  ok: boolean
  remaining: number
}

/** Can the creator start another draft cycle this period? */
export function canStartDraft(usedCycles: number, limits: TierGenerationLimits): BudgetCheck {
  const remaining = Math.max(0, limits.draftCyclesPerPeriod - usedCycles)
  return { ok: remaining > 0, remaining }
}

/** Can the creator finalize `addMp` more print megapixels this period? */
export function canFinalize(usedMp: number, addMp: number, limits: TierGenerationLimits): BudgetCheck {
  const remaining = Math.max(0, limits.finalizeMpBudget - usedMp)
  return { ok: addMp <= remaining, remaining }
}

/** Can the creator store `addBytes` more of saved templates? */
export function canStore(usedBytes: number, addBytes: number, limits: TierGenerationLimits): BudgetCheck {
  const remaining = Math.max(0, limits.storageBytes - usedBytes)
  return { ok: addBytes <= remaining, remaining }
}

/** Rough bytes a saved template occupies: print PNG(s) + composite SVG + thumbnail. */
export function estimateStoredTemplateBytes(megapixels: number, opts?: { svgBytes?: number; thumbBytes?: number; bytesPerMp?: number }): number {
  const bytesPerMp = opts?.bytesPerMp ?? 3_500_000 // ~3.5 MB / MP, compressed packaging art
  const svg = opts?.svgBytes ?? 60_000
  const thumb = opts?.thumbBytes ?? 80_000
  return Math.ceil(Math.max(1, megapixels) * bytesPerMp + svg + thumb)
}

export function formatBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(2)} GB`
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}
