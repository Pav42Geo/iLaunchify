'use client'

// =============================================================================
// AI Create — full-page client wrapper (AI_PACKAGING_GENERATOR §8, P3 wiring).
//
// The full-page route is a server component; the panel needs client-side handlers.
// This thin wrapper owns three adapters, keeping the panel pure + presentational:
//   • onGenerate    — draft cycle: map die-line → ~1 MP px → generateAiConcepts.
//   • onExport      — finalize (upscale + debit MP/storage) then download the file.
//   • onEditInStudio — stash the concept in the same-origin handoff + navigate to the
//     product canvas, where the AI Templator drawer offers "Apply to canvas".
//
// Mirrors what the in-canvas drawer already does; brand ref, effective palette, and
// output ride in the panel's GenerateContext.
// =============================================================================

import { useRouter } from 'next/navigation'
import { AiCreatePanel, type AiCreatePanelProps, type GenerateContext } from './AiCreatePanel'
import { generateAiConcepts, finalizeAiConcept } from './actions'
import { writeAiConceptHandoff } from './handoff'
import type { GenerationPlan } from '@ilaunchify/ui'

type Props = Omit<AiCreatePanelProps, 'onGenerate' | 'onEditInStudio' | 'onExport'> & {
  /** When set (real product mode), Edit-in-Studio hands the concept to that product's canvas. */
  productId?: string
  /** ProductTemplate id — tags generations for the "This product" library tab. */
  productTemplateId?: string | null
}

/** Pick draft pixels for a surface aspect at ~1 MP (cheap draft; finalize upscales). */
function draftPixels(widthMm: number, heightMm: number): { widthPx: number; heightPx: number } {
  const ratio = widthMm / Math.max(1, heightMm)
  const h = Math.round(Math.sqrt(1_000_000 / Math.max(0.1, ratio)))
  return { widthPx: Math.round(h * ratio), heightPx: h }
}

/** Trigger a browser download of an SVG string or an image URL. */
function downloadConcept(svgOrUrl: string, label: string): void {
  if (typeof window === 'undefined') return
  const safe = (label || 'concept').replace(/[^a-z0-9\-_]+/gi, '-').toLowerCase()
  const s = svgOrUrl.trim()
  const isSvg = s.startsWith('<svg')
  const href = isSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}` : s
  const a = document.createElement('a')
  a.href = href
  a.download = `${safe}.${isSvg ? 'svg' : href.startsWith('data:image/png') ? 'png' : 'img'}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function AiCreatePanelClient(props: Props) {
  const { productId, productTemplateId, ...panelProps } = props
  const router = useRouter()

  function surfaceFor(dielineId: string) {
    const target = panelProps.dielines.find((d) => d.id === dielineId) ?? panelProps.dielines[0]
    return target?.surface ?? { widthMm: 100, heightMm: 150 }
  }

  async function onGenerate(plan: GenerationPlan, dielineId: string, ctx?: GenerateContext): Promise<string[]> {
    const surface = surfaceFor(dielineId)
    const { widthPx, heightPx } = draftPixels(surface.widthMm, surface.heightMm)
    try {
      const res = await generateAiConcepts({
        prompt: plan.prompt,
        negativePrompt: plan.negativePrompt,
        mask: plan.maskSvg,
        widthPx,
        heightPx,
        dielineId,
        productTemplateId: productTemplateId ?? undefined,
        brandPalette: ctx?.palette ?? panelProps.brandPalette,
        brandRefUrl: ctx?.brandRefUrl,
        domain: panelProps.domain,
        market: panelProps.market ?? 'US',
        complianceJson: plan.compliance as unknown as Record<string, unknown>,
        brief: ctx?.brief,
      })
      return res.ok ? res.images : []
    } catch {
      return []
    }
  }

  async function onExport(result: { svg: string; dielineId: string; label: string }): Promise<void> {
    const surface = surfaceFor(result.dielineId)
    const { widthPx, heightPx } = draftPixels(surface.widthMm, surface.heightMm)
    const dpi = panelProps.outputPolicy?.defaults.dpi ?? 300
    try {
      const res = await finalizeAiConcept({
        concept: { svg: result.svg, width: widthPx, height: heightPx },
        widthMm: surface.widthMm,
        heightMm: surface.heightMm,
        dpi,
        svgBytes: result.svg.length,
      })
      // On success download the finalized (print-res) asset; otherwise fall back to the draft SVG.
      const out = res.ok ? res.image.svg ?? res.image.url ?? result.svg : result.svg
      downloadConcept(out, result.label)
    } catch {
      downloadConcept(result.svg, result.label)
    }
  }

  function onEditInStudio(result: { svg: string; dielineId: string; label: string }): void {
    if (!productId) return
    writeAiConceptHandoff({ productId, dielineId: result.dielineId, label: result.label, svg: result.svg })
    router.push(`/products/${productId}/design/canvas`)
  }

  return (
    <AiCreatePanel
      {...panelProps}
      onGenerate={onGenerate}
      onExport={onExport}
      onEditInStudio={productId ? onEditInStudio : undefined}
    />
  )
}
