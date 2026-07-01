'use client'

// =============================================================================
// AI Create — full-page client wrapper (AI_PACKAGING_GENERATOR §8, P3 wiring).
//
// The full-page route is a server component; the panel needs a client-side
// onGenerate that calls the generateAiConcepts server action with real draft
// dimensions. This thin wrapper owns that adapter: it maps the die-line the panel
// selected → its surface → ~1 MP draft pixels, then calls the action and returns
// the concept image refs (SVG markup or URLs) the panel renders. Brand reference,
// effective palette, and output ride in the panel's GenerateContext.
//
// Mirrors what the in-canvas drawer already does; keeps the panel itself pure +
// presentational (onGenerate stays a provider seam).
// =============================================================================

import { AiCreatePanel, type AiCreatePanelProps, type GenerateContext } from './AiCreatePanel'
import { generateAiConcepts } from './actions'
import type { GenerationPlan } from '@ilaunchify/ui'

type Props = Omit<AiCreatePanelProps, 'onGenerate'>

/** Pick draft pixels for a surface aspect at ~1 MP (cheap draft; finalize upscales). */
function draftPixels(widthMm: number, heightMm: number): { widthPx: number; heightPx: number } {
  const ratio = widthMm / Math.max(1, heightMm)
  const h = Math.round(Math.sqrt(1_000_000 / Math.max(0.1, ratio)))
  return { widthPx: Math.round(h * ratio), heightPx: h }
}

export function AiCreatePanelClient(props: Props) {
  async function onGenerate(plan: GenerationPlan, dielineId: string, ctx?: GenerateContext): Promise<string[]> {
    const target = props.dielines.find((d) => d.id === dielineId) ?? props.dielines[0]
    const surface = target?.surface ?? { widthMm: 100, heightMm: 150 }
    const { widthPx, heightPx } = draftPixels(surface.widthMm, surface.heightMm)
    try {
      const res = await generateAiConcepts({
        prompt: plan.prompt,
        negativePrompt: plan.negativePrompt,
        mask: plan.maskSvg,
        widthPx,
        heightPx,
        dielineId,
        brandPalette: ctx?.palette ?? props.brandPalette,
        brandRefUrl: ctx?.brandRefUrl,
        domain: props.domain,
        market: props.market ?? 'US',
        complianceJson: plan.compliance as unknown as Record<string, unknown>,
      })
      return res.ok ? res.images : []
    } catch {
      return []
    }
  }

  return <AiCreatePanel {...props} onGenerate={onGenerate} />
}
