// =============================================================================
// Generation orchestrator (AI_PACKAGING_GENERATOR §5/§13).
//
// Ties the metering budget to the provider seam. Two stages:
//   • runDraftGeneration   — cheap ~1 MP concepts; debits ONE draft cycle.
//   • runFinalizeGeneration — upscales the chosen concept to print res; debits the
//     finalize megapixels + the stored bytes.
// Both are budget-checked FIRST and NEVER call the provider when over budget. They
// return the images plus a `debit` the caller applies to the usage ledgers — this
// package stays DB-free; the server action persists AiGenerationUsage /
// GenerationStorageUsage. Pure control flow → unit-testable with the stub provider.
// =============================================================================

import type { ImageGenProvider, ImageRef, PanelGenRequest } from './provider'
import {
  type TierGenerationLimits,
  panelMegapixels,
  canStartDraft,
  canFinalize,
  canStore,
  estimateStoredTemplateBytes,
} from './metering'

export interface DraftGenerationInput {
  provider: ImageGenProvider
  limits: TierGenerationLimits
  /** Draft cycles already used this period. */
  usedCycles: number
  /** Panel request; widthPx/heightPx should already be the DRAFT (~1 MP) size. */
  request: PanelGenRequest
}

export interface DraftGenerationResult {
  ok: boolean
  reason?: string
  images: ImageRef[]
  /** Apply to the usage ledger on success. */
  debit: { draftCycles: number }
}

export async function runDraftGeneration(input: DraftGenerationInput): Promise<DraftGenerationResult> {
  const budget = canStartDraft(input.usedCycles, input.limits)
  if (!budget.ok) {
    return { ok: false, reason: 'Draft budget exhausted for this period.', images: [], debit: { draftCycles: 0 } }
  }
  const images = await input.provider.generatePanels(input.request)
  if (images.length === 0) {
    return { ok: false, reason: 'Provider returned no images.', images: [], debit: { draftCycles: 0 } }
  }
  return { ok: true, images, debit: { draftCycles: 1 } }
}

export interface FinalizeGenerationInput {
  provider: ImageGenProvider
  limits: TierGenerationLimits
  /** Finalize megapixels + stored bytes already used this period. */
  usedMp: number
  usedBytes: number
  /** The chosen draft concept to upscale. */
  draft: ImageRef
  /** Print target — drives the megapixel budget + upscale. */
  widthMm: number
  heightMm: number
  dpi?: number
  /** Optional vector/thumbnail byte hints for the storage estimate. */
  svgBytes?: number
  thumbBytes?: number
}

export interface FinalizeGenerationResult {
  ok: boolean
  reason?: string
  image?: ImageRef
  /** Apply to the ledgers on success. */
  debit: { megapixels: number; bytes: number }
}

export async function runFinalizeGeneration(input: FinalizeGenerationInput): Promise<FinalizeGenerationResult> {
  const target = panelMegapixels(input.widthMm, input.heightMm, input.dpi ?? 300)
  // Clamp to the tier's max single-render resolution, then budget-check that billed amount.
  const mp = Math.min(target.billedMp, Math.max(1, input.limits.maxSingleRenderMp))

  const mpBudget = canFinalize(input.usedMp, mp, input.limits)
  if (!mpBudget.ok) return { ok: false, reason: `Finalize megapixel budget exceeded (${mpBudget.remaining} MP left).`, debit: { megapixels: 0, bytes: 0 } }

  const bytes = estimateStoredTemplateBytes(mp, { svgBytes: input.svgBytes, thumbBytes: input.thumbBytes })
  const storeBudget = canStore(input.usedBytes, bytes, input.limits)
  if (!storeBudget.ok) return { ok: false, reason: 'Storage limit reached for this plan.', debit: { megapixels: 0, bytes: 0 } }

  const image = input.provider.upscale
    ? await input.provider.upscale({ image: input.draft, targetMegapixels: mp })
    : input.draft
  return { ok: true, image, debit: { megapixels: mp, bytes } }
}
