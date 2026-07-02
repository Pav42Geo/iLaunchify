'use client'

// =============================================================================
// AI Templator — in-canvas drawer (AI_PACKAGING_GENERATOR §8).
//
// Two tabs, both in the canvas: Create (the SAME AiCreatePanel the full page uses —
// brand identity, output, meters, saved templates, coordinated sets + flavour
// families) and Library (This product / My library / Starter gallery).
//
// Because we're ALREADY in the canvas:
//   • "Use on canvas" drops the concept onto the Fabric stage UNDER the truth-layer
//     frames (Facts / ingredients / barcode stay crisp on top).
//   • Library → "Use" places a matching-shape template onto the canvas; "Inspire"
//     reloads a saved design's brief into Create for THIS die-line and re-creates it.
//
// Admin (template-author) mode: the SAME drawer + panel, loaded product-less via
// getAiCreateDrawerPropsAdmin against the chosen die-cut + domain (unmetered tier).
// =============================================================================

import * as React from 'react'
import { Loader2, Wand2, ArrowUpRight, Sparkles, LibraryBig, ChevronLeft, ChevronRight } from 'lucide-react'
import { applyAiConcept, findAiConcept, deriveTemplateTargeting, type FabricCanvas, type FrameLayout, type GenerationPlan, type DieCutSpec } from '@ilaunchify/ui'
import type { LabelingType } from '@ilaunchify/db'
import { getAiCreateDrawerProps, getAiCreateDrawerPropsAdmin, generateAiConcepts, finalizeAiConcept, getGenerationBrief } from '../../../../../studio/ai-create/actions'
import { AiCreatePanel, type AiCreatePanelProps, type DielineTarget, type GenerateContext } from '../../../../../studio/ai-create/AiCreatePanel'
import { TemplateLibrary } from '../../../../../studio/ai-create/TemplateLibrary'
import { readAiConceptHandoff, clearAiConceptHandoff } from '../../../../../studio/ai-create/handoff'
import type { LibraryItem, ShapeKey } from '../../../../../studio/ai-create/library-types'

type Props = {
  canvas: FabricCanvas | null
  productId: string
  /** The canvas's active die-cut — the fallback surface when the product has no
   *  confirmed PackagingDieline yet (the generator always has a die-line to target). */
  dieCut: DieCutSpec
  /** Admin (template-author) mode — product-less: load props against the chosen
   *  die-cut + domain instead of a product. Same enhanced panel, unmetered tier. */
  admin?: { domain: string; dieCutId?: string | null } | null
  onClose: () => void
}

/** Synthesise a single full-bleed target from the canvas die-cut. */
function targetFromDieCut(dieCut: DieCutSpec): DielineTarget {
  const layout: FrameLayout = {
    version: 1,
    frames: [{ id: 'creative', kind: 'IMAGERY', box: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 }, required: false, source: 'PLATFORM' }],
  }
  return {
    id: `diecut:${dieCut.name}`,
    label: dieCut.name || 'This die-line',
    layout,
    surface: { widthMm: dieCut.widthMm || 100, heightMm: dieCut.heightMm || 150 },
  }
}

/** SVG markup → data URL; URLs/data-URLs pass through. */
function conceptToSource(concept: string): string {
  const c = concept.trim()
  if (c.startsWith('http') || c.startsWith('data:')) return c
  if (c.startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c)}`
  return c
}

/** Draft pixels for a surface aspect at ~1 MP (cheap draft; finalize upscales). */
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
  a.download = `${safe}.${isSvg ? 'svg' : 'img'}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function AiCreateDrawer({ canvas, productId, dieCut, admin = null, onClose }: Props) {
  void onClose
  const [loading, setLoading] = React.useState(true)
  const [props, setProps] = React.useState<AiCreatePanelProps | null>(null)
  const [productTemplateId, setProductTemplateId] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<'create' | 'library'>('create')
  const [initialBrief, setInitialBrief] = React.useState<AiCreatePanelProps['initialBrief']>(undefined)
  const [briefKey, setBriefKey] = React.useState(0)
  // A concept handed over from the full-page generator's "Edit in Studio" (same-origin).
  const [pending, setPending] = React.useState<{ svg: string; label: string } | null>(null)

  // Depend on the admin PRIMITIVES (domain / dieCutId), not the object identity —
  // the parent may re-create the object per render and this must not refetch.
  const adminDomain = admin?.domain ?? null
  const adminDieCutId = admin?.dieCutId ?? null
  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    const load = adminDomain
      ? getAiCreateDrawerPropsAdmin({ dieCutId: adminDieCutId, domain: adminDomain })
      : getAiCreateDrawerProps(productId)
    load
      .then((data) => {
        if (cancelled || !data) return
        setProps(data.props)
        setProductTemplateId(data.productTemplateId)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [productId, adminDomain, adminDieCutId])

  // Pick up a concept handed over from the full-page generator (survives the navigation).
  // Admin mode is product-less — no handoff to read.
  React.useEffect(() => {
    if (adminDomain) return
    const h = readAiConceptHandoff(productId)
    if (h) setPending({ svg: h.svg, label: h.label })
  }, [productId, adminDomain])

  // Swap-in-place (AI_PREVIEW_TRYON_LOOP F1): the current generation batch + which
  // concept is applied, driving the "On canvas: Concept 2/4 ‹ ›" switcher below.
  const [batch, setBatch] = React.useState<string[]>([])
  const [appliedIndex, setAppliedIndex] = React.useState<number | null>(null)
  // P3 A/B pin: the pinned reference concept + the "other side" of the last A/B flip.
  const [pinnedIndex, setPinnedIndex] = React.useState<number | null>(null)
  const abOtherRef = React.useRef<number | null>(null)
  // P3 hover try-on: the committed src to restore on mouseleave (null = no hover active).
  const hoverRestoreRef = React.useRef<string | null>(null)

  /** Apply a concept / template as the design's background art — REPLACES any
   *  previously applied AI concept (never stacks); truth-layer frames stay on top. */
  const applyToCanvas = React.useCallback(
    async (concept: string, meta?: { variationIndex?: number | null; dielineId?: string | null }) => {
      if (!canvas) return
      // A real apply supersedes any in-flight hover preview.
      hoverRestoreRef.current = null
      await applyAiConcept(canvas, conceptToSource(concept), {
        variationIndex: meta?.variationIndex ?? null,
        dielineId: meta?.dielineId ?? null,
      })
    },
    [canvas],
  )

  /** P3 hover try-on — temporarily swap the APPLIED concept's image source.
   *  fabric's setSrc fires no object:added/modified/removed, so the canvas history
   *  and autosave never see the preview; only a click commits (via applyToCanvas).
   *  No-op until a first concept is applied. Concepts are same-batch data URLs, so
   *  loads are effectively instant (out-of-order resolution is not a practical risk). */
  const previewConcept = React.useCallback(
    async (svg: string | null) => {
      if (!canvas) return
      const obj = findAiConcept(canvas) as unknown as {
        setSrc?: (src: string, opts?: { crossOrigin?: string }) => Promise<unknown>
        getSrc?: () => string
      } | null
      if (!obj || typeof obj.setSrc !== 'function') return
      if (svg) {
        if (hoverRestoreRef.current === null) hoverRestoreRef.current = obj.getSrc?.() ?? null
        if (hoverRestoreRef.current === null) return
        await obj.setSrc(conceptToSource(svg), { crossOrigin: 'anonymous' })
        canvas.requestRenderAll()
      } else {
        const restore = hoverRestoreRef.current
        if (restore === null) return
        hoverRestoreRef.current = null
        await obj.setSrc(restore, { crossOrigin: 'anonymous' })
        canvas.requestRenderAll()
      }
    },
    [canvas],
  )

  // Drawer closed mid-hover → put the committed concept back.
  React.useEffect(() => {
    return () => {
      void previewConcept(null)
    }
  }, [previewConcept])

  /** ‹ › — cycle the applied concept through the current batch, in place. */
  const switchConcept = React.useCallback(
    async (delta: number) => {
      if (appliedIndex === null || batch.length < 2) return
      const next = (appliedIndex + delta + batch.length) % batch.length
      const svg = batch[next]
      if (!svg) return
      await applyToCanvas(svg, { variationIndex: next })
      setAppliedIndex(next)
    },
    [appliedIndex, batch, applyToCanvas],
  )

  /** P3 A/B — flip the canvas between the pinned concept and the other side of the
   *  last flip. First click: current applied becomes the "other"; pinned goes on. */
  const toggleAB = React.useCallback(async () => {
    if (pinnedIndex === null || appliedIndex === null) return
    const target = appliedIndex !== pinnedIndex ? pinnedIndex : abOtherRef.current
    if (target === null) return
    const svg = batch[target]
    if (!svg) return
    if (appliedIndex !== pinnedIndex) abOtherRef.current = appliedIndex
    await applyToCanvas(svg, { variationIndex: target })
    setAppliedIndex(target)
  }, [pinnedIndex, appliedIndex, batch, applyToCanvas])

  // The die-line SET the panel designs — real confirmed die-lines, else the canvas die-cut.
  const dielines = React.useMemo<DielineTarget[]>(
    () => (props && props.dielines.length ? props.dielines : [targetFromDieCut(dieCut)]),
    [props, dieCut],
  )

  const productShapes = React.useMemo<ShapeKey[]>(
    () =>
      dielines.map((d) => ({
        containerCategory: d.containerCategory ?? null,
        aspectBucket: deriveTemplateTargeting({ containerCategory: d.containerCategory ?? undefined, widthMm: d.surface.widthMm, heightMm: d.surface.heightMm }).aspectBucket,
      })),
    [dielines],
  )

  function surfaceFor(dielineId: string) {
    return dielines.find((d) => d.id === dielineId)?.surface ?? { widthMm: 100, heightMm: 150 }
  }

  async function onGenerate(plan: GenerationPlan, dielineId: string, ctx?: GenerateContext): Promise<string[]> {
    if (!props) return []
    const s = surfaceFor(dielineId)
    const { widthPx, heightPx } = draftPixels(s.widthMm, s.heightMm)
    try {
      const res = await generateAiConcepts({
        prompt: plan.prompt,
        negativePrompt: plan.negativePrompt,
        mask: plan.maskSvg,
        widthPx,
        heightPx,
        dielineId,
        productTemplateId: productTemplateId ?? undefined,
        brandPalette: ctx?.palette ?? props.brandPalette,
        brandRefUrl: ctx?.brandRefUrl,
        domain: props.domain,
        market: props.market ?? 'US',
        complianceJson: plan.compliance as unknown as Record<string, unknown>,
        brief: ctx?.brief,
        seed: ctx?.seed,
      })
      return res.ok ? res.images : []
    } catch {
      return []
    }
  }

  async function onExport(result: { svg: string; dielineId: string; label: string }): Promise<void> {
    const surface = surfaceFor(result.dielineId)
    const { widthPx, heightPx } = draftPixels(surface.widthMm, surface.heightMm)
    const dpi = props?.outputPolicy?.defaults.dpi ?? 300
    try {
      const res = await finalizeAiConcept({
        concept: { svg: result.svg, width: widthPx, height: heightPx },
        widthMm: surface.widthMm,
        heightMm: surface.heightMm,
        dpi,
        svgBytes: result.svg.length,
      })
      downloadConcept(res.ok ? res.image.svg ?? res.image.url ?? result.svg : result.svg, result.label)
    } catch {
      downloadConcept(result.svg, result.label)
    }
  }

  // Library → "Inspire": reload a saved design's brief into Create for this die-line.
  async function handleInspire(item: LibraryItem) {
    const brief = await getGenerationBrief(item.id).catch(() => null)
    if (brief) {
      setInitialBrief({ descriptor: brief.descriptor, styleTags: brief.styleTags, colorTags: brief.colorTags, elementTags: brief.elementTags })
      setBriefKey((k) => k + 1)
    }
    setTab('create')
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-[12.5px] text-ink-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading AI Templator…
      </div>
    )
  }

  if (!props) {
    return (
      <div className="p-4 text-[12.5px] text-ink-600">
        {adminDomain
          ? 'No die-cuts are available yet. Seed the die-cut library, then generate a template.'
          : 'Couldn’t load this product. Try reopening the Studio.'}
      </div>
    )
  }

  const fullViewHref = adminDomain
    ? `/studio/ai-create?admin=1&domain=${encodeURIComponent(adminDomain)}${adminDieCutId ? `&dieCut=${encodeURIComponent(adminDieCutId)}` : ''}`
    : `/studio/ai-create?productId=${productId}`

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-1.5">
        <Wand2 className="h-4 w-4 text-pink-600" />
        <h3 className="text-[13px] font-bold text-ink-900">AI Templator</h3>
        <a
          href={fullViewHref}
          className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-ink-400 hover:text-ink-900"
          title="Open the full-screen generator"
        >
          Full view <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      {/* Create / Library tabs */}
      <div className="flex gap-1">
        <DrawerTab active={tab === 'create'} onClick={() => setTab('create')} icon={<Sparkles className="h-3.5 w-3.5" />}>
          Create
        </DrawerTab>
        <DrawerTab active={tab === 'library'} onClick={() => setTab('library')} icon={<LibraryBig className="h-3.5 w-3.5" />}>
          Library
        </DrawerTab>
      </div>

      {pending && tab === 'create' && (
        <div className="rounded-lg border border-pink-300 bg-pink-50 p-2.5">
          <p className="text-[11.5px] font-semibold text-pink-800">Concept from the generator</p>
          <p className="mb-2 text-[11px] text-pink-700">“{pending.label}” is ready to drop onto this canvas.</p>
          <div
            className="[&_svg]:h-auto [&_svg]:w-full mb-2 overflow-hidden rounded border border-pink-200 bg-white"
            dangerouslySetInnerHTML={{ __html: pending.svg.trim().startsWith('<svg') ? pending.svg : `<img src="${pending.svg}" alt="${pending.label}" style="width:100%;height:auto"/>` }}
          />
          <div className="flex gap-1.5">
            <button
              onClick={async () => {
                await applyToCanvas(pending.svg)
                clearAiConceptHandoff()
                setPending(null)
              }}
              className="flex-1 rounded-full bg-ink-900 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-ink-800"
            >
              Apply to canvas
            </button>
            <button
              onClick={() => {
                clearAiConceptHandoff()
                setPending(null)
              }}
              className="rounded-full border border-pink-300 px-3 py-1.5 text-[11.5px] font-semibold text-pink-700 hover:bg-pink-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* On-canvas concept switcher — flip the applied concept through the batch
          in place, truth layer on top. Real in-context comparison. */}
      {tab === 'create' && appliedIndex !== null && batch.length > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1.5">
          <span className="text-[11.5px] font-semibold text-ink-700">
            On canvas: Concept {appliedIndex + 1}/{batch.length}
          </span>
          <div className="flex gap-1">
            {pinnedIndex !== null && (appliedIndex !== pinnedIndex || abOtherRef.current !== null) && (
              <button
                type="button"
                onClick={() => void toggleAB()}
                title={`Flip between pinned Concept ${pinnedIndex + 1} and the other side`}
                className="rounded-full border border-pink-300 bg-pink-50 px-2 py-0.5 text-[10.5px] font-bold text-pink-700 hover:bg-pink-100"
              >
                A/B
              </button>
            )}
            <button
              type="button"
              onClick={() => switchConcept(-1)}
              aria-label="Previous concept"
              className="rounded-full border border-ink-200 bg-white p-1 text-ink-600 hover:border-ink-400 hover:text-ink-900"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => switchConcept(1)}
              aria-label="Next concept"
              className="rounded-full border border-ink-200 bg-white p-1 text-ink-600 hover:border-ink-400 hover:text-ink-900"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {tab === 'create' ? (
        // The full generator, in the drawer. "Use on canvas" applies to THIS canvas.
        <AiCreatePanel
          key={briefKey}
          {...props}
          // No "My templates" grid in the drawer — saved designs live in the
          // Library tab (This product / My library) right next to it.
          savedConcepts={undefined}
          stacked
          editActionLabel="Use on canvas"
          initialBrief={initialBrief}
          dielines={dielines}
          onGenerate={onGenerate}
          onExport={onExport}
          onVariationsChange={(svgs) => {
            setBatch(svgs)
            setAppliedIndex(null)
            setPinnedIndex(null)
            abOtherRef.current = null
          }}
          onEditInStudio={async (r) => {
            await applyToCanvas(r.svg, { variationIndex: r.index ?? null, dielineId: r.dielineId })
            setAppliedIndex(typeof r.index === 'number' ? r.index : null)
          }}
          onPreviewVariation={(svg) => void previewConcept(svg)}
          pinnedIndex={pinnedIndex}
          onTogglePin={(i) => setPinnedIndex((p) => (p === i ? null : i))}
        />
      ) : (
        <TemplateLibrary
          productTemplateId={productTemplateId ?? undefined}
          domain={props.domain}
          productShapes={productShapes}
          onUseAsInspiration={handleInspire}
          onUseOnCanvas={(item) => {
            if (!item.thumbnailUrl) return
            void applyToCanvas(item.thumbnailUrl)
            setAppliedIndex(null) // library apply isn't part of the current batch
          }}
        />
      )}
    </div>
  )
}

function DrawerTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition ${active ? 'bg-ink-900 text-white' : 'border border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
    >
      {icon}
      {children}
    </button>
  )
}

// Keep LabelingType referenced for the domain type surface (no runtime use).
export type _AiDrawerDomain = LabelingType
