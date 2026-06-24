// =============================================================================
// AI Packaging Generator — P2 orchestration (AI_PACKAGING_GENERATOR §4).
//
// planGeneration() is the single brain the UI calls. It is DIE-LINE-FIRST: the
// generation always targets an EXISTING die-line (or one die-line of a set — a
// variety pack, a primary + carton, per-flavor labels). The die-line's frames +
// dims are the input; we never invent a structure. It ties together:
//   • assemblePrompt (P0)        — positive + negative prompt
//   • reservedZoneLabels (P1)    — names the keep-clear zones into the neg prompt
//   • buildPanelMaskSvg (P1)     — the structure-lock mask for the image model
//   • compositeDesignSvg (P1)    — the preview (placeholder art until P3)
//   • evaluateCompliance (P0)    — the export gate, from the frames present
//
// PURE — no model, no DB, no DOM. Same input → same plan.
// =============================================================================

import { type FrameKind, type FrameLayout } from './frames'
import {
  buildPanelMaskSvg,
  compositeDesignSvg,
  presentFrameKinds,
  reservedZoneLabels,
  type SurfaceDims,
} from './aiComposite'
import {
  assemblePrompt,
  evaluateCompliance,
  satisfiedElementsFromFrames,
  type ComplianceReport,
  type LabelingDomain,
  type MarketCode,
} from '@ilaunchify/ai-design'

export interface PlanGenerationInput {
  /** Plain-language subject — pre-filled from the product. */
  productDescriptor: string
  brandName?: string
  styleTags?: string[]
  elementTags?: string[]
  colorTags?: string[]
  brandPalette?: string[]
  substrateLabel?: string
  packagingTypeLabel?: string
  referencePhrases?: string[]

  /** The EXISTING die-line being designed (one of the product's set). */
  layout: FrameLayout
  surface: SurfaceDims
  surfaceId?: string

  /** Regulatory context — drives the mandatory-element pack + facts slot. */
  domain: LabelingDomain
  market?: MarketCode

  /** Already-generated art per CREATIVE frame (P3+). Missing → placeholders. */
  artByFrameId?: Record<string, string>
}

export interface GenerationPlan {
  /** Positive prompt for the image model. */
  prompt: string
  /** Negative prompt — suppresses the truth layer + names reserved zones. */
  negativePrompt: string
  /** White=paintable / black=keep-clear mask, mm-sized to the surface. */
  maskSvg: string
  /** Composite preview (placeholder art + truth placeholders until wired). */
  previewSvg: string
  /** Human labels of the reserved zones. */
  reservedLabels: string[]
  /** Frame kinds present on the surface. */
  presentKinds: FrameKind[]
  /** Coverage report against the domain×market mandatory pack — gates export. */
  compliance: ComplianceReport
}

export function planGeneration(input: PlanGenerationInput): GenerationPlan {
  const { layout, surface, surfaceId, domain, market = 'US' } = input

  const reservedLabels = reservedZoneLabels(layout, surfaceId)
  const { prompt, negativePrompt } = assemblePrompt(
    {
      productDescriptor: input.productDescriptor,
      brandName: input.brandName,
      styleTags: input.styleTags,
      elementTags: input.elementTags,
      colorTags: input.colorTags,
      brandPalette: input.brandPalette,
      substrateLabel: input.substrateLabel,
      packagingTypeLabel: input.packagingTypeLabel,
      referencePhrases: input.referencePhrases,
    },
    reservedLabels,
  )

  const maskSvg = buildPanelMaskSvg(layout, surface, surfaceId)
  const previewSvg = compositeDesignSvg({ layout, surface, surfaceId, artByFrameId: input.artByFrameId })

  const present = presentFrameKinds(layout, surfaceId)
  const satisfied = satisfiedElementsFromFrames(present, domain)
  const compliance = evaluateCompliance(domain, satisfied, market)

  return { prompt, negativePrompt, maskSvg, previewSvg, reservedLabels, presentKinds: present, compliance }
}
