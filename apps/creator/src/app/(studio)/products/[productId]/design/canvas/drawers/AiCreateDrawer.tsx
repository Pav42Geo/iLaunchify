'use client'

// =============================================================================
// AI Templator — in-canvas drawer (AI_PACKAGING_GENERATOR §8).
//
// The Canva-style, stay-in-the-canvas surface: opens as the left rail drawer (like
// Templates / Elements), generates concepts for the CURRENT product's die-line, shows
// them as a thumbnail grid, and "Use this" drops the chosen concept onto the Fabric
// stage as the CREATIVE background layer — UNDER the truth-layer frames (Nutrition
// Facts, ingredients, barcode stay crisp on top). You never leave the canvas.
//
// Single die-line only. Coordinated SETS (jar front + top) and FLAVOUR families need
// multiple surfaces, so those live in the full-screen generator, reached via "Batch".
// =============================================================================

import * as React from 'react'
import { Sparkles, Lock, CheckCircle2, AlertTriangle, Loader2, Wand2, ArrowUpRight } from 'lucide-react'
import { planGeneration, addImageFromUrl, type FabricCanvas, type FrameLayout, type GenerationPlan, type DieCutSpec } from '@ilaunchify/ui'
import { clampOutput, type OutputSettings } from '@ilaunchify/imagegen'
import type { LabelingType } from '@ilaunchify/db'
import { getAiCreateDrawerProps, generateAiConcepts } from '../../../../../studio/ai-create/actions'
import {
  BrandIdentitySection,
  OutputSection,
  UsageMeters,
  SavedTemplatesGrid,
  type AiCreatePanelProps,
  type DielineTarget,
  type ManualBrand,
} from '../../../../../studio/ai-create/AiCreatePanel'

type Props = {
  canvas: FabricCanvas | null
  productId: string
  /** The canvas's active die-cut — the fallback surface when the product has no
   *  confirmed PackagingDieline yet (the generator always has a die-line to target). */
  dieCut: DieCutSpec
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

const chipCls = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition ${on ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`

/** SVG markup → data URL; URLs/data-URLs pass through. */
function conceptToSource(concept: string): string {
  const c = concept.trim()
  if (c.startsWith('http') || c.startsWith('data:')) return c
  if (c.startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c)}`
  return c
}

export function AiCreateDrawer({ canvas, productId, dieCut, onClose }: Props) {
  void onClose
  const [loading, setLoading] = React.useState(true)
  const [props, setProps] = React.useState<AiCreatePanelProps | null>(null)
  const [descriptor, setDescriptor] = React.useState('')
  const [styles, setStyles] = React.useState<string[]>([])
  const [colors, setColors] = React.useState<string[]>([])
  const [elements, setElements] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const [concepts, setConcepts] = React.useState<string[]>([])
  const [applied, setApplied] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Brand identity + output — same controls as the full page, compact in the drawer.
  const [brandMode, setBrandMode] = React.useState<'kit' | 'manual'>('kit')
  const [follow, setFollow] = React.useState(true)
  const [manual, setManual] = React.useState<ManualBrand>({ brandName: '', market: '', audience: '', colours: [] })
  const [output, setOutput] = React.useState<OutputSettings | null>(null)
  const [presetId, setPresetId] = React.useState('default')

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAiCreateDrawerProps(productId)
      .then((data) => {
        if (cancelled) return
        if (data) {
          setProps(data.props)
          setDescriptor(data.props.productDescriptor)
          setManual((m) => ({ ...m, brandName: data.props.brandName ?? '' }))
          const kit = (data.props.brandPalette?.length ?? 0) > 0 || Boolean(data.props.brandLogoUrl)
          setBrandMode(kit ? 'kit' : 'manual')
          if (data.props.outputPolicy) setOutput(clampOutput(data.props.outputPolicy.defaults, data.props.outputPolicy).settings)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [productId])

  const gated = props?.tier === 'maker'
  const manualMode = brandMode === 'manual'
  const kitPalette = props?.brandPalette ?? []
  const effBrandName = manualMode ? manual.brandName || undefined : props?.brandName
  const effPalette = manualMode ? (manual.colours.length ? manual.colours : undefined) : kitPalette.length ? kitPalette : undefined
  const brandRefUrl = manualMode ? manual.logoDataUrl : follow ? props?.brandLogoUrl : undefined
  const referencePhrases = React.useMemo(
    () => (manualMode ? ([manual.market && `for ${manual.market}`, manual.audience && `audience: ${manual.audience}`].filter(Boolean) as string[]) : []),
    [manualMode, manual.market, manual.audience],
  )
  // Prefer a confirmed product die-line; otherwise fall back to the canvas die-cut so the
  // generator always has a surface to design (mirrors what the canvas itself renders).
  const target = props ? props.dielines[0] ?? targetFromDieCut(dieCut) : null
  const styleOptions = props?.styleOptions ?? []
  const colorOptions = props?.colorOptions ?? []
  const elementOptions = props?.elementOptions ?? []

  const plan = React.useMemo<GenerationPlan | null>(() => {
    if (!props || !target) return null
    return planGeneration({
      productDescriptor: descriptor,
      brandName: effBrandName,
      brandPalette: effPalette,
      styleTags: styles,
      colorTags: colors,
      elementTags: elements,
      referencePhrases,
      layout: target.layout,
      surface: target.surface,
      domain: props.domain,
      market: props.market ?? 'US',
    })
  }, [props, target, descriptor, effBrandName, effPalette, referencePhrases, styles, colors, elements])

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function generate() {
    if (!plan || !target || !props || gated) return
    setBusy(true)
    setError(null)
    setApplied(null)
    try {
      const ratio = target.surface.widthMm / Math.max(1, target.surface.heightMm)
      const h = Math.round(Math.sqrt(1_000_000 / Math.max(0.1, ratio)))
      const w = Math.round(h * ratio)
      const res = await generateAiConcepts({
        prompt: plan.prompt,
        negativePrompt: plan.negativePrompt,
        mask: plan.maskSvg,
        widthPx: w,
        heightPx: h,
        dielineId: target.id,
        brandPalette: effPalette,
        brandRefUrl,
        domain: props.domain,
        market: props.market ?? 'US',
        complianceJson: plan.compliance as unknown as Record<string, unknown>,
      })
      if (!res.ok) setError(res.error)
      else setConcepts(res.images.length ? res.images : [plan.previewSvg, plan.previewSvg, plan.previewSvg, plan.previewSvg])
    } catch {
      setError('Generation failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function applyToCanvas(concept: string, idx: number) {
    if (!canvas) return
    const img = await addImageFromUrl(canvas, conceptToSource(concept), { maxFraction: 0.98 })
    if (img) {
      // Send under the truth-layer frames so Facts / barcode stay on top + readable.
      ;(canvas as unknown as { sendObjectToBack?: (o: unknown) => void }).sendObjectToBack?.(img)
      canvas.requestRenderAll()
      setApplied(idx)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-[12.5px] text-ink-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading AI Templator…
      </div>
    )
  }

  if (!props || !target) {
    return (
      <div className="p-4 text-[12.5px] text-ink-600">
        Couldn’t load this product. Try reopening the Studio.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-1.5">
        <Wand2 className="h-4 w-4 text-pink-600" />
        <h3 className="text-[13px] font-bold text-ink-900">AI Templator</h3>
        {typeof props.creditsRemaining === 'number' && !gated && (
          <span className="ml-auto rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-ink-600">
            {props.creditsRemaining} left
          </span>
        )}
      </div>
      <p className="text-[11px] text-ink-400">
        Generating for <strong className="text-ink-600">{target.label}</strong>. Concepts drop onto your die-line under the compliance layer.
      </p>

      {gated && (
        <div className="flex items-start gap-2 rounded-lg border border-pink-200 bg-pink-50 p-2.5 text-[11.5px] text-pink-800">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>AI Templator is a Builder &amp; Agency feature. Explore below — upgrade to generate onto your die-line.</span>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-ink-500">Describe the design</span>
        <textarea
          value={descriptor}
          onChange={(e) => setDescriptor(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-lg border border-ink-200 px-2.5 py-2 text-[12.5px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
        />
      </label>

      <BrandIdentitySection
        mode={brandMode}
        onMode={setBrandMode}
        hasKit={kitPalette.length > 0 || Boolean(props.brandLogoUrl)}
        kitPalette={kitPalette}
        kitLogoUrl={props.brandLogoUrl}
        kitBrandName={props.brandName}
        follow={follow}
        onFollow={setFollow}
        manual={manual}
        onManual={setManual}
      />

      <ChipRow title="Style" options={styleOptions} selected={styles} onToggle={(v) => toggle(styles, setStyles, v)} />
      <ChipRow title="Colour mood" options={colorOptions} selected={colors} onToggle={(v) => toggle(colors, setColors, v)} />
      <ChipRow title="Elements" options={elementOptions} selected={elements} onToggle={(v) => toggle(elements, setElements, v)} />

      {props.outputPolicy && output && (
        <OutputSection policy={props.outputPolicy} tier={props.tier} value={output} onChange={setOutput} presetId={presetId} onPreset={setPresetId} />
      )}
      {props.usage && <UsageMeters usage={props.usage} />}

      {plan && (
        <div className={`flex items-start gap-1.5 rounded-lg border p-2 text-[11px] ${plan.compliance.complete ? 'border-success-200 bg-success-50 text-success-800' : 'border-warning-200 bg-warning-50 text-warning-800'}`}>
          {plan.compliance.complete ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{plan.compliance.complete ? `Compliance-ready — ${plan.compliance.summary}` : `${plan.compliance.summary} — add before export`}</span>
        </div>
      )}

      {gated ? (
        <a href="/subscriptions" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-[12.5px] font-semibold text-white hover:bg-ink-800">
          <Lock className="h-4 w-4" /> Upgrade to generate
        </a>
      ) : (
        <button
          onClick={generate}
          disabled={busy || !plan}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-[12.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? 'Generating…' : concepts.length ? 'Regenerate' : 'Generate concepts'}
        </button>
      )}
      {error && <p className="text-[11px] font-medium text-danger-600">{error}</p>}

      {concepts.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-500">Concepts — click “Use this” to drop onto the canvas</p>
          <div className="grid grid-cols-2 gap-2">
            {concepts.map((c, i) => (
              <div key={i} className={`rounded-lg border p-1.5 ${applied === i ? 'border-pink-500' : 'border-ink-200'}`}>
                <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: c.trim().startsWith('<svg') ? c : `<img src="${c}" alt="concept ${i + 1}" style="width:100%;height:auto"/>` }} />
                <button
                  onClick={() => applyToCanvas(c, i)}
                  className="mt-1.5 w-full rounded-full border border-ink-200 py-1 text-[10.5px] font-semibold text-ink-700 hover:bg-ink-50"
                >
                  {applied === i ? 'On canvas ✓' : 'Use this'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {props.savedConcepts && props.savedConcepts.length > 0 && (
        <SavedTemplatesGrid concepts={props.savedConcepts} storageUsed={props.usage?.storageBytesUsed} storageCap={props.usage?.storageBytesCap} />
      )}

      <a
        href={`/studio/ai-create?productId=${productId}`}
        className="mt-auto inline-flex items-center gap-1 pt-2 text-[11px] font-semibold text-ink-500 hover:text-ink-900"
      >
        Batch: coordinated sets &amp; flavour families <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

function ChipRow({ title, options, selected, onToggle }: { title: string; options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  if (options.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-500">{title}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onToggle(o)} className={chipCls(selected.includes(o))}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

// Keep LabelingType referenced for the domain type surface (no runtime use).
export type _AiDrawerDomain = LabelingType
