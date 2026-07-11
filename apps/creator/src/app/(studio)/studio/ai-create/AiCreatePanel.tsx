'use client'

// =============================================================================
// AI Create panel (AI_PACKAGING_GENERATOR §8, P2 + §16 output).
//
// DIE-LINE-FIRST by design (Pavel 2026-06-23): the generator always targets an
// EXISTING die-line — or one die-line of a SET (primary + outer carton, a variety
// pack's per-flavor labels). "Design which die-line?" is the first control; we
// never invent a structure. Everything downstream (prompt, mask, compliance,
// preview) is computed by planGeneration() for the selected die-line.
//
// Full-page surface — carries the rich intake the in-canvas drawer keeps compact:
//   • Brand identity — Follow-my-Brand-Kit (lock palette + logo as the AI reference)
//     vs Packaging-idea (manual: brand name, market, audience, custom colours, logo).
//   • Output settings — tier-clamped preset + fine-tune (format/DPI/CMYK/marks…),
//     from the pure @ilaunchify/imagegen output policy; every downgrade is shown.
//   • Usage meters — draft cycles / finalize budget / storage against the tier caps.
//
// Prop-driven + presentational: no DB, no model. onGenerate is the P3 seam; brand
// reference + output ride along in its ctx. Tier-gated: Builder/Agency + Admin;
// Maker explores everything and is steered to the premium template library.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Lock, CheckCircle2, AlertTriangle, Box, Layers, Plus, Link2, Palette, Upload, X, Sliders, Gauge, Pin, Maximize2, ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react'
import { planGeneration, planGenerationSet, Dieline3DViewer, shapeKindForCategory, assignSurfaceFaces, type FrameLayout, type SurfaceDims, type GenerationPlan, type GenerationSetPlan, type SetBrief, type BoxFace, type FaceTexture } from '@ilaunchify/ui'
import { planFlavorSeries, type LabelingDomain, type MarketCode, type FlavorSpec, type FlavorSeriesPlan } from '@ilaunchify/ai-design'
import { clampOutput, formatBytes, type OutputPolicy, type OutputSettings, type OutputFormat } from '@ilaunchify/imagegen'
import type { TierKey } from '@ilaunchify/auth'

export interface DielineTarget {
  id: string
  /** "Primary box", "Outer carton", "Vanilla label". */
  label: string
  /** "flip-top mailer box". */
  shapeLabel?: string
  /** Container category (BOX/JAR/POUCH…) for the library shape-match gate. */
  containerCategory?: string | null
  layout: FrameLayout
  surface: SurfaceDims
}

// maker/builder/agency come from the canonical @ilaunchify/auth TierKey (M2 — was a
// hand-rolled shadow). 'admin' is an explicit SENTINEL for the System-Templates admin
// preview (no billing tier: ungated, no usage meters) — see loader.ts, NOT a real tier.
export type CreatorTier = TierKey | 'admin'

/** Per-creator usage this period, for the meters. */
export interface AiUsageSnapshot {
  draftCyclesUsed: number
  draftCyclesCap: number
  finalizeMpUsed: number
  finalizeMpBudget: number
  storageBytesUsed: number
  storageBytesCap: number
}

/** Extra provider context threaded through onGenerate (brand reference + palette + output + brief). */
export interface GenerateContext {
  brandRefUrl?: string
  /** Effective palette after brand-kit/manual resolution (prompt already encodes it; this is for the provider). */
  palette?: string[]
  output?: OutputSettings
  /** Raw brief so a saved generation can be RE-RUN ("use as inspiration") on another die-line. */
  brief?: { descriptor?: string; styleTags?: string[]; colorTags?: string[]; elementTags?: string[] }
  /** Provider seed hint — "More like this" derives it from the chosen concept so the
   *  riff stays in that concept's neighbourhood (providers that ignore seeds still work). */
  seed?: number
}

/** A previously saved / finalized concept, for the "My templates" grid. */
export interface SavedConcept {
  id: string
  title: string
  dielineLabel?: string
  provider?: string
  createdAtIso: string
  megapixels?: number
  /** Resolved variation image URL when available (R2). Placeholder tile otherwise. */
  thumbnailUrl?: string
  variationCount: number
}

export interface AiCreatePanelProps {
  productDescriptor: string
  brandName?: string
  brandPalette?: string[]
  /** Primary brand logo (public URL) — shown + used as the AI reference when Follow is on. */
  brandLogoUrl?: string
  substrateLabel?: string
  domain: LabelingDomain
  market?: MarketCode
  /** The EXISTING die-line set — the generation input. */
  dielines: DielineTarget[]
  styleOptions?: string[]
  colorOptions?: string[]
  elementOptions?: string[]
  tier: CreatorTier
  creditsRemaining?: number
  /** Tier-resolved output policy (allowed formats/DPI/caps + defaults). When absent the output section is hidden. */
  outputPolicy?: OutputPolicy
  /** Usage snapshot for the meters. When absent the meters are hidden. */
  usage?: AiUsageSnapshot
  /** Previously saved / finalized concepts for the "My templates" grid. When absent the grid is hidden. */
  savedConcepts?: SavedConcept[]
  /**
   * Optional flavour variants (e.g. 7 protein-bar flavours). When present with >1
   * entry, unlocks Flavour-family mode: generate ONE master, then derive each flavour
   * by recolouring its accent + swapping its element — identical brand, different accent.
   */
  flavors?: FlavorSpec[]
  /** P3 provider: given the plan + die-line (+ brand ref / output ctx), return N variation image refs. */
  onGenerate?: (plan: GenerationPlan, dielineId: string, ctx?: GenerateContext) => Promise<string[]>
  /**
   * Load a generated concept into the Design Studio canvas for editing (and, in admin
   * mode, saving as a library template via the existing template-author flow). The
   * Studio shell wires this; when absent the button is hidden.
   */
  onEditInStudio?: (result: { svg: string; dielineId: string; label: string; index?: number }) => void
  /** Export a generated concept (SVG/PDF). When absent the button is hidden. */
  onExport?: (result: { svg: string; dielineId: string; label: string; index?: number }) => void
  /** Fires whenever the single-die-line variations batch changes (generate / re-roll /
   *  scope switch). Lets the host (the in-canvas drawer) drive its concept switcher. */
  onVariationsChange?: (svgs: string[]) => void
  /** P3 hover try-on: mouseenter a result card → (svg, index); mouseleave → (null, null).
   *  The in-canvas drawer previews the hovered concept on the applied object via setSrc. */
  onPreviewVariation?: (svg: string | null, index: number | null) => void
  /** P3 A/B pin — controlled by the host. When provided, each result card shows a pin. */
  pinnedIndex?: number | null
  onTogglePin?: (index: number) => void
  /** Force a single-column stack (for the narrow in-canvas drawer). Full page stays 2-col. */
  stacked?: boolean
  /** Label for the primary result action (default "Edit in Studio"; the drawer uses "Use on canvas"). */
  editActionLabel?: string
  /** Seed the intake from a saved generation ("use as inspiration") — descriptor + chips. */
  initialBrief?: { descriptor?: string; styleTags?: string[]; colorTags?: string[]; elementTags?: string[] }
}

const DEFAULT_STYLES = ['Minimal', 'Vintage', 'Luxury', 'Playful', 'Modern', 'Hand-drawn', 'Bold', 'Natural', 'Warm', 'Geometric']
const DEFAULT_COLORS = ['Vibrant', 'Muted', 'Warm Tones', 'Cool Tones', 'Pastel', 'Earthy', 'Monochrome', 'Jewel Tones']
const DEFAULT_ELEMENTS = ['Botanicals', 'Fruits', 'Liquid Swirls', 'Patterns', 'Abstract Shapes', 'Doodles', 'Waves', 'Celestial']

export interface ManualBrand {
  brandName: string
  market: string
  audience: string
  colours: string[]
  logoDataUrl?: string
}

export function AiCreatePanel(props: AiCreatePanelProps) {
  const { dielines, tier, domain, market = 'US' } = props
  const styleOptions = props.styleOptions ?? DEFAULT_STYLES
  const colorOptions = props.colorOptions ?? DEFAULT_COLORS
  const elementOptions = props.elementOptions ?? DEFAULT_ELEMENTS

  const gated = tier === 'maker'
  const multi = dielines.length > 1
  const flavors = props.flavors ?? []
  const hasFlavors = flavors.length > 1
  const kitPalette = props.brandPalette ?? []
  const hasKit = kitPalette.length > 0 || Boolean(props.brandLogoUrl)

  const [scope, setScope] = useState<'single' | 'set' | 'flavors'>('single')
  const [selectedId, setSelectedId] = useState(dielines[0]?.id ?? '')
  const [descriptor, setDescriptor] = useState(props.initialBrief?.descriptor ?? props.productDescriptor)
  const [styles, setStyles] = useState<string[]>(props.initialBrief?.styleTags ?? [])
  const [colors, setColors] = useState<string[]>(props.initialBrief?.colorTags ?? [])
  const [elements, setElements] = useState<string[]>(props.initialBrief?.elementTags ?? [])
  const [variations, setVariations] = useState<string[]>([])
  // Per-card view override (F2). Shaped die-lines (BOX/CYLINDER) default to the 3D
  // wrap — see the AI design ON the pack; FLAT surfaces default to the flat tile.
  // An entry flips card i to the non-default view.
  const [viewOverrides, setViewOverrides] = useState<Record<number, boolean>>({})
  // "More like this" (F3): one level of riff history — the batch we riffed FROM and
  // which concept seeded the riff, for the breadcrumb + "back to first batch".
  const [prevBatch, setPrevBatch] = useState<string[] | null>(null)
  const [riffSource, setRiffSource] = useState<number | null>(null)
  // P3 lightbox — which concept is open large (null = closed).
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  // Live-provider failures surface here instead of silently showing placeholder tiles.
  const [genError, setGenError] = useState<string | null>(null)
  const [setVariants, setSetVariants] = useState<{ id: string; label: string; svg: string }[]>([])
  const [masterGenerated, setMasterGenerated] = useState(false)
  const [busy, setBusy] = useState(false)

  // --- Brand identity ---
  const [brandMode, setBrandMode] = useState<'kit' | 'manual'>(hasKit ? 'kit' : 'manual')
  const [follow, setFollow] = useState(true)
  const [manual, setManual] = useState<ManualBrand>({ brandName: props.brandName ?? '', market: '', audience: '', colours: [] })

  // --- Output settings ---
  const policy = props.outputPolicy
  const [output, setOutput] = useState<OutputSettings | null>(policy ? clampOutput(policy.defaults, policy).settings : null)
  const [presetId, setPresetId] = useState<string>('default')

  const setMode = multi && scope === 'set'
  const flavorMode = hasFlavors && scope === 'flavors'
  const selected = dielines.find((d) => d.id === selectedId) ?? dielines[0]

  // Aspect-aware result layout (AI_PREVIEW_TRYON_LOOP F2): wide wraps (can labels) and
  // tall labels are unreadable as 2-up tiles in the 400px drawer — go single column.
  const surfaceAspect = selected ? selected.surface.widthMm / Math.max(1, selected.surface.heightMm) : 1
  const wideSurface = surfaceAspect > 1.6
  const singleColResults = wideSurface || surfaceAspect < 0.625

  // F2 — 3D-first results: shaped die-lines default each result card to the 3D wrap.
  const selectedShape = shapeKindForCategory(selected?.containerCategory)
  const default3D = selectedShape !== 'FLAT'
  const show3D = (i: number) => (viewOverrides[i] ? !default3D : default3D)

  const manualMode = brandMode === 'manual'
  // Effective brand inputs the brief + provider use.
  const effBrandName = manualMode ? manual.brandName || undefined : props.brandName
  const effPalette = manualMode ? (manual.colours.length ? manual.colours : undefined) : kitPalette.length ? kitPalette : undefined
  const brandRefUrl = manualMode ? manual.logoDataUrl : follow ? props.brandLogoUrl : undefined
  const referencePhrases = useMemo(
    () => (manualMode ? [manual.market && `for ${manual.market}`, manual.audience && `audience: ${manual.audience}`].filter(Boolean) as string[] : []),
    [manualMode, manual.market, manual.audience],
  )

  // Shared creative brief — identical for single or set; only the die-line differs.
  const brief = useMemo<SetBrief>(
    () => ({
      productDescriptor: descriptor,
      brandName: effBrandName,
      brandPalette: effPalette,
      substrateLabel: props.substrateLabel,
      styleTags: styles,
      colorTags: colors,
      elementTags: elements,
      referencePhrases,
      domain,
      market,
    }),
    [descriptor, effBrandName, effPalette, styles, colors, elements, referencePhrases, props.substrateLabel, domain, market],
  )

  const plan = useMemo<GenerationPlan | null>(() => {
    if (!selected) return null
    return planGeneration({ ...brief, layout: selected.layout, surface: selected.surface })
  }, [selected, brief])

  const setPlan = useMemo<GenerationSetPlan | null>(() => {
    if (!setMode) return null
    return planGenerationSet(
      brief,
      dielines.map((d) => ({ id: d.id, label: d.label, layout: d.layout, surface: d.surface })),
    )
  }, [setMode, brief, dielines])

  const flavorPlan = useMemo<FlavorSeriesPlan | null>(() => {
    if (!flavorMode || !plan) return null
    return planFlavorSeries(`${descriptor}|${selected?.id ?? ''}`, flavors)
  }, [flavorMode, plan, descriptor, selected, flavors])

  // Phase 3 — a coordinated SET rendered as ONE multi-panel box: each surface maps to a face
  // (front/back/top/left/right/bottom, in order). Memoized so the 3D scene isn't re-init'd.
  const setFaces = useMemo<Partial<Record<BoxFace, FaceTexture>> | null>(() => {
    const surfaces = setVariants.length > 0 ? setVariants : (setPlan?.perDieline ?? []).map((d) => ({ id: d.id, label: d.label, svg: d.plan.previewSvg }))
    if (surfaces.length === 0) return null
    // Deterministic per-surface → face binding by die-line NAME (Front→front, Lid→top, …),
    // collision-free, with a stable fill for unmatched surfaces. Replaces index-order.
    const assigned = assignSurfaceFaces(surfaces.map((s) => ({ label: s.label })))
    const f: Partial<Record<BoxFace, FaceTexture>> = {}
    surfaces.forEach((s, i) => {
      const face = assigned[i]
      if (face) f[face] = { svg: s.svg }
    })
    return f
  }, [setVariants, setPlan])


  const genCtx: GenerateContext = {
    brandRefUrl,
    palette: effPalette,
    output: output ?? undefined,
    brief: { descriptor, styleTags: styles, colorTags: colors, elementTags: elements },
  }

  /** onGenerate throws with the server's real error text — normalize for display. */
  function genErrorMessage(err: unknown): string {
    const m = err instanceof Error ? err.message : ''
    return m ? `Generation failed: ${m}` : 'Generation failed — the image provider returned nothing. Try again.'
  }

  async function generate() {
    if (setMode) {
      if (!setPlan) return
      setBusy(true)
      setGenError(null)
      try {
        const out: { id: string; label: string; svg: string }[] = []
        for (const d of setPlan.perDieline) {
          const refs = props.onGenerate ? await props.onGenerate(d.plan, d.id, genCtx) : []
          out.push({ id: d.id, label: d.label, svg: refs[0] ?? d.plan.previewSvg })
        }
        setSetVariants(out)
      } catch (err) {
        setGenError(genErrorMessage(err))
      } finally {
        setBusy(false)
      }
      return
    }
    if (flavorMode) {
      if (!plan || !selected) return
      setBusy(true)
      setGenError(null)
      try {
        if (props.onGenerate) await props.onGenerate(plan, selected.id, genCtx)
        setMasterGenerated(true)
      } catch (err) {
        setGenError(genErrorMessage(err))
      } finally {
        setBusy(false)
      }
      return
    }
    if (!plan || !selected) return
    setBusy(true)
    setGenError(null)
    try {
      const refs = props.onGenerate ? await props.onGenerate(plan, selected.id, genCtx) : []
      // Live provider wired but nothing came back → surface the failure; don't
      // masquerade placeholder composites as results. (No provider = demo mode,
      // where the deterministic previews ARE the point.)
      if (props.onGenerate && refs.length === 0) {
        setGenError(genErrorMessage(null))
        return
      }
      const next = refs.length > 0 ? refs : [plan.previewSvg, plan.previewSvg, plan.previewSvg, plan.previewSvg]
      setVariations(next)
      setViewOverrides({})
      setLightboxIdx(null)
      // A fresh generate starts a new lineage — drop any riff history.
      setPrevBatch(null)
      setRiffSource(null)
      props.onVariationsChange?.(next)
    } catch (err) {
      setGenError(genErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** F3 — riff on ONE concept: re-run the draft cycle seeded from it, keeping the
   *  outgoing batch one level deep so the creator can step back. Costs one cycle. */
  async function moreLikeThis(i: number) {
    if (!plan || !selected || busy) return
    setBusy(true)
    setGenError(null)
    try {
      const refs = props.onGenerate ? await props.onGenerate(plan, selected.id, { ...genCtx, seed: i + 1 }) : []
      if (props.onGenerate && refs.length === 0) {
        setGenError(genErrorMessage(null))
        return
      }
      const next = refs.length > 0 ? refs : [plan.previewSvg, plan.previewSvg, plan.previewSvg, plan.previewSvg]
      setPrevBatch(variations)
      setRiffSource(i)
      setVariations(next)
      setViewOverrides({})
      setLightboxIdx(null)
      props.onVariationsChange?.(next)
    } catch (err) {
      setGenError(genErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function backToPreviousBatch() {
    if (!prevBatch) return
    setVariations(prevBatch)
    props.onVariationsChange?.(prevBatch)
    setPrevBatch(null)
    setRiffSource(null)
    setViewOverrides({})
    setLightboxIdx(null)
  }

  function switchScope(next: 'single' | 'set' | 'flavors') {
    setScope(next)
    setVariations([])
    props.onVariationsChange?.([])
    setSetVariants([])
    setMasterGenerated(false)
    setViewOverrides({})
    setPrevBatch(null)
    setRiffSource(null)
    setLightboxIdx(null)
    setGenError(null)
  }

  return (
    <div className={`grid gap-4 ${props.stacked ? '' : 'lg:grid-cols-[360px_1fr]'}`}>
      {/* ---- Intake column ---- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-900">
            <Sparkles className="h-4 w-4 text-pink-600" /> AI Create
          </h2>
          {typeof props.creditsRemaining === 'number' && (
            <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-700">
              {props.creditsRemaining} credits
            </span>
          )}
        </div>

        {/* Gated (Maker) — the whole generator stays explorable; only Generate is locked. */}
        {gated && (
          <div className="flex items-start gap-2 rounded-xl border border-pink-200 bg-pink-50 p-3 text-[12.5px] text-pink-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">AI Create is a Builder &amp; Agency feature</p>
              <p className="mt-0.5 text-[11.5px]">
                Explore the whole flow below. Upgrade to generate original designs into your die-line — on Maker you can still recolour our compliance-checked premium templates.
              </p>
            </div>
          </div>
        )}

        {/* Scope toggle — appears when there's more than one die-line and/or flavours. */}
        {(multi || hasFlavors) && (
          <div className="flex rounded-lg border border-ink-200 bg-ink-50 p-0.5 text-[12px] font-semibold">
            <button
              onClick={() => switchScope('single')}
              className={`flex-1 rounded-md px-2 py-1.5 transition ${scope === 'single' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
            >
              One die-line
            </button>
            {multi && (
              <button
                onClick={() => switchScope('set')}
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 transition ${scope === 'set' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              >
                <Link2 className="h-3.5 w-3.5" /> Coordinate set
              </button>
            )}
            {hasFlavors && (
              <button
                onClick={() => switchScope('flavors')}
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 transition ${scope === 'flavors' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              >
                <Palette className="h-3.5 w-3.5" /> Flavour family
              </button>
            )}
          </div>
        )}

        {/* Die-line set — THE INPUT */}
        <div>
          <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">
            <Layers className="h-3.5 w-3.5" />{' '}
            {setMode ? `All ${dielines.length} die-lines — one brand look` : flavorMode ? 'Master die-line for the family' : 'Design which die-line?'}
          </p>
          <div className="space-y-1.5">
            {dielines.map((d) => {
              const on = setMode || d.id === selectedId
              return (
                <button
                  key={d.id}
                  onClick={() => !setMode && setSelectedId(d.id)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 bg-white hover:border-ink-300'} ${setMode ? 'cursor-default' : ''}`}
                >
                  {setMode ? (
                    <Link2 className="h-4 w-4 text-pink-600" />
                  ) : (
                    <Box className={`h-4 w-4 ${on ? 'text-pink-600' : 'text-ink-400'}`} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink-900">{d.label}</span>
                    {d.shapeLabel && <span className="block truncate text-[11px] text-ink-500">{d.shapeLabel}</span>}
                  </span>
                  <span className="shrink-0 text-[10.5px] tabular-nums text-ink-400">{d.layout.frames.length} frames</span>
                </button>
              )
            })}
          </div>
          {setMode && (
            <p className="mt-1.5 text-[11px] text-ink-400">
              One shared brief + seed generates all die-lines as a matching family. Compliance is checked across the whole
              package — a required mark only needs to appear on one surface.
            </p>
          )}
          {flavorMode && (
            <p className="mt-1.5 text-[11px] text-ink-400">
              Generate ONE master on this die-line, then {flavors.length} flavours derive from it — same layout, brand &amp;
              motif, only the accent colour + flavour element change. Each flavour keeps its own Facts panel.
            </p>
          )}
        </div>

        {/* Brand identity — Follow a kit, or enter it by hand. */}
        <BrandIdentitySection
          mode={brandMode}
          onMode={setBrandMode}
          hasKit={hasKit}
          kitPalette={kitPalette}
          kitLogoUrl={props.brandLogoUrl}
          kitBrandName={props.brandName}
          follow={follow}
          onFollow={setFollow}
          manual={manual}
          onManual={setManual}
        />

        {/* Describe */}
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-500">Describe the design</label>
          <textarea
            value={descriptor}
            onChange={(e) => setDescriptor(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          />
          <p className="mt-1 text-[11px] text-ink-400">Options + prompt tone are domain-tuned for {domainLabel(domain)}. Type to add your own.</p>
        </div>

        <VocabSelect title="Style" options={styleOptions} selected={styles} onChange={setStyles} placeholder="Choose styles…" />
        <VocabSelect title="Colour mood" options={colorOptions} selected={colors} onChange={setColors} placeholder="Choose colours…" />
        <VocabSelect title="Elements" options={elementOptions} selected={elements} onChange={setElements} placeholder="Choose elements…" />

        {/* Output settings — tier-clamped preset + fine-tune. */}
        {policy && output && (
          <OutputSection
            policy={policy}
            tier={tier}
            value={output}
            onChange={setOutput}
            presetId={presetId}
            onPreset={setPresetId}
          />
        )}

        {/* Usage meters. */}
        {props.usage && <UsageMeters usage={props.usage} />}

        {gated ? (
          <a
            href="/subscriptions"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-ink-800"
          >
            <Lock className="h-4 w-4" /> Upgrade to generate
          </a>
        ) : (
          <button
            onClick={generate}
            disabled={busy || (setMode ? !setPlan : !plan)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />{' '}
            {busy
              ? 'Generating…'
              : setMode
                ? `Generate matching set (${dielines.length})`
                : flavorMode
                  ? masterGenerated
                    ? 'Regenerate master'
                    : 'Generate master'
                  : 'Generate 4 concepts'}
          </button>
        )}
        {!gated && !props.onGenerate && (
          <p className="text-[11px] text-ink-400">Preview shows the deterministic composite. Connect an image provider to generate real art (P3).</p>
        )}
        {genError && (
          <div className="flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[11.5px] text-warning-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{genError}</span>
          </div>
        )}
      </div>

      {/* ---- Preview column ---- */}
      <div className="space-y-3">
        {setMode
          ? setPlan && (
              <ComplianceChip
                complete={setPlan.compliance.complete}
                summary={`package · ${setPlan.compliance.summary}`}
                missing={setPlan.compliance.missingRequired.map((m) => m.label)}
              />
            )
          : plan && (
              <ComplianceChip complete={plan.compliance.complete} summary={plan.compliance.summary} missing={plan.compliance.missingRequired.map((m) => m.label)} />
            )}

        {setMode ? (
          <div className="space-y-3">
            {setFaces && selected && (
              <div className="rounded-2xl border border-ink-200 bg-white p-2">
                <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-500">Coordinated set · 3D</p>
                <div className="h-[240px] overflow-hidden rounded-lg bg-[radial-gradient(120%_120%_at_50%_0%,#fff,#f1f0ec)]">
                  <Dieline3DViewer
                    shape="BOX"
                    widthMm={selected.surface.widthMm}
                    heightMm={selected.surface.heightMm}
                    depthMm={selected.surface.widthMm * 0.6}
                    faces={setFaces}
                    baseColor="#f4f2ee"
                    className="flex h-full w-full flex-col p-1.5"
                  />
                </div>
                <p className="mt-1 text-[10px] text-ink-400">Each surface mapped to a box face · drag to rotate · preview only, not the print file.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {(setVariants.length > 0 ? setVariants : (setPlan?.perDieline ?? []).map((d) => ({ id: d.id, label: d.label, svg: d.plan.previewSvg }))).map((v) => (
              <div key={v.id} className="rounded-xl border border-ink-200 bg-white p-2">
                <p className="mb-1 truncate text-[10.5px] font-semibold text-ink-500">{v.label}</p>
                <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: v.svg }} />
                {setVariants.length > 0 && (
                  <div className="mt-1.5 flex items-center justify-end">
                    <ResultActions result={{ svg: v.svg, dielineId: v.id, label: v.label }} onEdit={props.onEditInStudio} onExport={props.onExport} editLabel={props.editActionLabel} />
                  </div>
                )}
              </div>
            ))}
            {setVariants.length > 0 && (
              <button onClick={generate} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50">
                <Plus className="h-3.5 w-3.5" /> Re-roll set
              </button>
            )}
            </div>
          </div>
        ) : flavorMode ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-ink-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Master · {selected?.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${masterGenerated ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-500'}`}>
                  {masterGenerated ? 'Approved master' : 'Generate master first'}
                </span>
              </div>
              <div className="mx-auto max-w-[360px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: plan?.previewSvg ?? '' }} />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                {flavorPlan?.count ?? 0} flavours derive from the master
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(flavorPlan?.derivatives ?? []).map((d) => (
                  <div key={d.flavorId} className={`flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-2 ${masterGenerated ? '' : 'opacity-60'}`}>
                    <span className="h-6 w-6 shrink-0 rounded-full border border-ink-200" style={{ backgroundColor: d.recolor.hex }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-ink-900">{d.name}</span>
                      <span className="block truncate text-[10.5px] text-ink-500">{d.elementCue ?? d.recolor.hex}</span>
                    </span>
                  </div>
                ))}
              </div>
              {flavorPlan && flavorPlan.rejected.length > 0 && (
                <p className="mt-1.5 text-[11px] text-warning-700">
                  Skipped: {flavorPlan.rejected.map((r) => `${r.id} (${r.reason})`).join(', ')}
                </p>
              )}
            </div>

            {flavorPlan && (
              <div className="rounded-xl border border-ink-200 bg-ink-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Held constant across the family</p>
                <p className="mt-1 text-[11.5px] text-ink-600">{flavorPlan.lockedInvariants.join(' · ')}</p>
              </div>
            )}
          </div>
        ) : variations.length === 0 ? (
          <div className="rounded-2xl border border-ink-200 bg-white p-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">Live preview · {selected?.label}</p>
            <div className={`mx-auto [&_svg]:h-auto [&_svg]:w-full ${wideSurface ? '' : 'max-w-[420px]'}`} dangerouslySetInnerHTML={{ __html: plan?.previewSvg ?? '' }} />
            <p className="mt-2 text-[11px] text-ink-400">
              Reserved (truth-layer) zones: {plan?.reservedLabels.join(', ') || 'none'} — kept clear for your real label data.
            </p>
          </div>
        ) : (
          <div className={`grid gap-3 ${singleColResults ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {riffSource !== null && (
              <div className="col-span-full flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                <span className="font-semibold text-ink-600">Riffing on Concept {riffSource + 1}</span>
                <button type="button" onClick={backToPreviousBatch} className="font-semibold text-pink-700 hover:underline">
                  Back to first batch
                </button>
              </div>
            )}
            {variations.map((v, i) => (
              <div
                key={i}
                className={`rounded-xl border bg-white p-2 ${props.pinnedIndex === i ? 'border-pink-400 ring-1 ring-pink-200' : 'border-ink-200'}`}
                onMouseEnter={props.onPreviewVariation ? () => props.onPreviewVariation?.(v, i) : undefined}
                onMouseLeave={props.onPreviewVariation ? () => props.onPreviewVariation?.(null, null) : undefined}
              >
                {show3D(i) && selected ? (
                  <div className="h-[220px] overflow-hidden rounded-lg bg-[radial-gradient(120%_120%_at_50%_0%,#fff,#f1f0ec)]">
                    <Dieline3DViewer
                      shape={selectedShape}
                      widthMm={selected.surface.widthMm}
                      heightMm={selected.surface.heightMm}
                      textureSvg={v}
                      baseColor="#f4f2ee"
                      className="flex h-full w-full flex-col p-1.5"
                    />
                  </div>
                ) : (
                  <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: v }} />
                )}
                <div className="mt-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewOverrides((o) => ({ ...o, [i]: !o[i] }))}
                      aria-pressed={show3D(i)}
                      title={show3D(i) ? 'Show the flat print surface' : 'Preview this concept in 3D'}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${show3D(i) ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 text-ink-500 hover:border-ink-400'}`}
                    >
                      <Box className="h-3 w-3" /> {show3D(i) ? 'Flat' : '3D'}
                    </button>
                    {props.onGenerate && !gated && (
                      <button
                        type="button"
                        onClick={() => moreLikeThis(i)}
                        disabled={busy}
                        title="Generate 4 more in this direction (costs 1 cycle)"
                        className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2 py-0.5 text-[10px] font-semibold text-ink-500 transition hover:border-ink-400 disabled:opacity-50"
                      >
                        <Sparkles className="h-3 w-3" /> More like this
                      </button>
                    )}
                    {props.onTogglePin && (
                      <button
                        type="button"
                        onClick={() => props.onTogglePin?.(i)}
                        aria-pressed={props.pinnedIndex === i}
                        title={props.pinnedIndex === i ? 'Unpin' : 'Pin for A/B compare'}
                        className={`inline-flex items-center rounded-full border p-1 transition ${props.pinnedIndex === i ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 text-ink-400 hover:border-ink-400 hover:text-ink-600'}`}
                      >
                        <Pin className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setLightboxIdx(i)}
                      title="View large"
                      className="inline-flex items-center rounded-full border border-ink-200 p-1 text-ink-400 transition hover:border-ink-400 hover:text-ink-600"
                    >
                      <Maximize2 className="h-3 w-3" />
                    </button>
                  </div>
                  <ResultActions
                    result={{ svg: v, dielineId: selected?.id ?? '', label: selected?.label ?? '', index: i }}
                    onEdit={props.onEditInStudio}
                    onExport={props.onExport}
                    editLabel={props.editActionLabel}
                  />
                </div>
              </div>
            ))}
            <button onClick={generate} className="col-span-full inline-flex items-center justify-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50">
              <Plus className="h-3.5 w-3.5" /> Re-roll
            </button>
          </div>
        )}

        {props.savedConcepts && (
          <SavedTemplatesGrid concepts={props.savedConcepts} storageUsed={props.usage?.storageBytesUsed} storageCap={props.usage?.storageBytesCap} />
        )}
      </div>

      {/* P3 lightbox — one concept large, ‹ › to flip, act without leaving it. */}
      {lightboxIdx !== null && variations[lightboxIdx] && (
        <ConceptLightbox
          svg={variations[lightboxIdx]!}
          index={lightboxIdx}
          count={variations.length}
          dielineId={selected?.id ?? ''}
          label={selected?.label ?? ''}
          onNav={(d) => setLightboxIdx((cur) => (cur === null ? null : (cur + d + variations.length) % variations.length))}
          onClose={() => setLightboxIdx(null)}
          onEdit={props.onEditInStudio}
          onExport={props.onExport}
          editLabel={props.editActionLabel}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Concept lightbox (P3) — full-viewport overlay; Esc closes, arrows navigate.
// ---------------------------------------------------------------------------

function ConceptLightbox({
  svg,
  index,
  count,
  dielineId,
  label,
  onNav,
  onClose,
  onEdit,
  onExport,
  editLabel,
}: {
  svg: string
  index: number
  count: number
  dielineId: string
  label: string
  onNav: (delta: number) => void
  onClose: () => void
  onEdit?: (r: { svg: string; dielineId: string; label: string; index?: number }) => void
  onExport?: (r: { svg: string; dielineId: string; label: string; index?: number }) => void
  editLabel?: string
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onNav(-1)
      else if (e.key === 'ArrowRight') onNav(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNav])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Concept ${index + 1} of ${count}`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/70 p-6"
      onClick={onClose}
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-white">
          <p className="text-[13px] font-semibold">
            Concept {index + 1}/{count} · {label}
          </p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative overflow-auto rounded-2xl bg-white p-3">
          <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onNav(-1)}
              aria-label="Previous concept"
              className="rounded-full border border-white/30 p-1.5 text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNav(1)}
              aria-label="Next concept"
              className="rounded-full border border-white/30 p-1.5 text-white hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-1.5">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onEdit({ svg, dielineId, label, index })
                  onClose()
                }}
                className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-100"
              >
                {editLabel ?? 'Edit in Studio'}
              </button>
            )}
            {onExport && (
              <button
                type="button"
                onClick={() => onExport({ svg, dielineId, label, index })}
                className="rounded-full border border-white/30 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-white/10"
              >
                Export
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Saved templates ("My templates")
// -----------------------------------------------------------------------------

export function SavedTemplatesGrid({ concepts, storageUsed, storageCap }: { concepts: SavedConcept[]; storageUsed?: number; storageCap?: number }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">My templates</p>
        {typeof storageUsed === 'number' && typeof storageCap === 'number' && (
          <span className="text-[10.5px] tabular-nums text-ink-400">
            {formatBytes(storageUsed)} / {formatBytes(storageCap)}
          </span>
        )}
      </div>
      {typeof storageUsed === 'number' && typeof storageCap === 'number' && storageCap > 0 && (
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-pink-500" style={{ width: `${Math.min(100, Math.round((storageUsed / storageCap) * 100))}%` }} />
        </div>
      )}

      {concepts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-200 bg-ink-50 px-3 py-4 text-center text-[11.5px] text-ink-500">
          Saved concepts appear here once you finalize a design — they count against your storage.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {concepts.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-lg border border-ink-200 bg-white">
              <div className="flex aspect-square items-center justify-center bg-ink-50">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnailUrl} alt={c.title} className="h-full w-full object-cover" />
                ) : (
                  <Sparkles className="h-5 w-5 text-ink-300" />
                )}
              </div>
              <div className="p-1.5">
                <p className="truncate text-[11px] font-semibold text-ink-800">{c.title}</p>
                <p className="truncate text-[10px] text-ink-400">
                  {new Date(c.createdAtIso).toLocaleDateString()}
                  {c.megapixels ? ` · ${c.megapixels} MP` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Brand identity
// -----------------------------------------------------------------------------

export function BrandIdentitySection({
  mode,
  onMode,
  hasKit,
  kitPalette,
  kitLogoUrl,
  kitBrandName,
  follow,
  onFollow,
  manual,
  onManual,
}: {
  mode: 'kit' | 'manual'
  onMode: (m: 'kit' | 'manual') => void
  hasKit: boolean
  kitPalette: string[]
  kitLogoUrl?: string
  kitBrandName?: string
  follow: boolean
  onFollow: (v: boolean) => void
  manual: ManualBrand
  onManual: (m: ManualBrand) => void
}) {
  const colorInputRef = useRef<HTMLInputElement>(null)

  function onLogoFile(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onManual({ ...manual, logoDataUrl: typeof reader.result === 'string' ? reader.result : undefined })
    reader.readAsDataURL(file)
  }
  function addColour(hex: string) {
    const v = hex.trim()
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) || manual.colours.includes(v)) return
    onManual({ ...manual, colours: [...manual.colours, v].slice(0, 6) })
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
        Brand identity <span className="font-medium normal-case tracking-normal text-ink-400">— follow a kit, or enter it manually</span>
      </p>
      <div className="mb-2 flex rounded-lg border border-ink-200 bg-ink-50 p-0.5 text-[12px] font-semibold">
        <button
          onClick={() => onMode('kit')}
          disabled={!hasKit}
          className={`flex-1 rounded-md px-2 py-1.5 transition disabled:opacity-40 ${mode === 'kit' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
        >
          Brand Kit
        </button>
        <button
          onClick={() => onMode('manual')}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${mode === 'manual' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
        >
          Packaging idea (manual)
        </button>
      </div>

      {mode === 'kit' ? (
        <div className="rounded-lg border border-ink-200 bg-white p-3">
          {!hasKit ? (
            <p className="text-[11.5px] text-ink-500">No Brand Kit set up yet — switch to “Packaging idea (manual)” to describe it by hand.</p>
          ) : (
            <>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={follow} onChange={(e) => onFollow(e.target.checked)} className="mt-0.5 h-4 w-4 accent-pink-600" />
                <span className="text-[12px] text-ink-700">
                  <span className="font-semibold text-ink-900">Follow my Brand Kit</span> — lock the palette{kitLogoUrl ? ' + use the logo as the AI reference' : ''}.
                </span>
              </label>
              <div className="mt-2 flex items-center gap-2">
                {kitLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={kitLogoUrl} alt="Brand logo" className="h-9 w-9 rounded border border-ink-200 object-contain" />
                )}
                <div className="flex flex-wrap gap-1">
                  {kitPalette.map((c) => (
                    <span key={c} className="h-6 w-6 rounded-full border border-ink-200" style={{ backgroundColor: c }} title={c} />
                  ))}
                  {kitPalette.length === 0 && <span className="text-[11px] text-ink-400">No palette colours saved.</span>}
                </div>
              </div>
              {kitBrandName && <p className="mt-2 text-[11px] text-ink-500">Brand: {kitBrandName}</p>}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-ink-200 bg-white p-3">
          <Field label="Brand name" value={manual.brandName} placeholder="Your brand" onChange={(v) => onManual({ ...manual, brandName: v })} />
          <Field label="Target market" value={manual.market} placeholder="e.g. US specialty grocery" onChange={(v) => onManual({ ...manual, market: v })} />
          <Field label="Target audience" value={manual.audience} placeholder="e.g. premium gift shoppers" onChange={(v) => onManual({ ...manual, audience: v })} />

          <div>
            <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-500">Custom colours</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {manual.colours.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 py-0.5 pl-1 pr-1.5 text-[11px]">
                  <span className="h-3.5 w-3.5 rounded-full border border-ink-200" style={{ backgroundColor: c }} />
                  {c}
                  <button onClick={() => onManual({ ...manual, colours: manual.colours.filter((x) => x !== c) })} className="text-ink-400 hover:text-ink-700">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => colorInputRef.current?.click()}
                title="Add a colour"
                aria-label="Add a colour"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-ink-300 text-ink-400 transition hover:border-pink-400 hover:text-pink-500"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <input ref={colorInputRef} type="color" onChange={(e) => addColour(e.target.value)} className="sr-only" tabIndex={-1} aria-hidden="true" />
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50">
            <Upload className="h-3.5 w-3.5" /> {manual.logoDataUrl ? 'Replace logo' : 'Upload logo'}
            <input type="file" accept="image/*" hidden onChange={(e) => onLogoFile(e.target.files?.[0])} />
          </label>
          {manual.logoDataUrl && (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={manual.logoDataUrl} alt="Uploaded logo" className="h-9 w-9 rounded border border-ink-200 object-contain" />
              <button onClick={() => onManual({ ...manual, logoDataUrl: undefined })} className="text-[11px] text-ink-400 hover:text-ink-700">
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-0.5 block text-[10.5px] font-bold uppercase tracking-wider text-ink-500">{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12.5px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
      />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Output settings
// -----------------------------------------------------------------------------

export function OutputSection({
  policy,
  tier,
  value,
  onChange,
  presetId,
  onPreset,
}: {
  policy: OutputPolicy
  tier: CreatorTier
  value: OutputSettings
  onChange: (s: OutputSettings) => void
  presetId: string
  onPreset: (id: string) => void
}) {
  const presets = useMemo(() => buildPresets(policy), [policy])
  const clamp = clampOutput(value, policy)

  function applyPreset(id: string) {
    onPreset(id)
    if (id === 'default') return onChange(clampOutput(policy.defaults, policy).settings)
    const p = presets.find((x) => x.id === id)
    if (p) onChange(clampOutput(p.settings, policy).settings)
  }

  function set<K extends keyof OutputSettings>(k: K, v: OutputSettings[K]) {
    onPreset('custom')
    onChange(clampOutput({ ...value, [k]: v }, policy).settings)
  }

  return (
    <div>
      <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">
        <Sliders className="h-3.5 w-3.5" /> Output <span className="font-medium normal-case tracking-normal text-ink-400">— preset or fine-tune (tier-clamped)</span>
      </p>

      <select
        value={presetId}
        onChange={(e) => applyPreset(e.target.value)}
        className="mb-2 w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-900"
      >
        <option value="default">Recommended for your plan</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>

      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Format"
          value={value.format}
          options={policy.allowedFormats.map((f) => ({ value: f, label: f }))}
          onChange={(v) => set('format', v as OutputFormat)}
        />
        <Select
          label="Resolution"
          value={String(value.dpi)}
          options={dpiChoices(policy.maxDpi).map((d) => ({ value: String(d), label: `${d} DPI` }))}
          onChange={(v) => set('dpi', Number(v))}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Toggle label="CMYK" on={value.colorProfile === 'CMYK'} disabled={!policy.allowCmyk} onClick={() => set('colorProfile', value.colorProfile === 'CMYK' ? 'RGB' : 'CMYK')} />
        <Toggle label="Crop marks" on={value.marks} onClick={() => set('marks', !value.marks)} />
        <Toggle label="Layered" on={value.layered} disabled={!policy.allowLayered} onClick={() => set('layered', !value.layered)} />
        {policy.allowBatch && <Toggle label="Batch set" on={value.batch} onClick={() => set('batch', !value.batch)} />}
        {policy.allowWhiteLabel && <Toggle label="White-label" on={value.whiteLabel} onClick={() => set('whiteLabel', !value.whiteLabel)} />}
        {policy.forceWatermark && <span className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] text-ink-500">Watermarked</span>}
      </div>

      {clamp.adjustments.length > 0 && (
        <p className="mt-1.5 text-[11px] text-warning-700">
          Your {tier} plan adjusts: {clamp.adjustments.join('; ')}.
        </p>
      )}
    </div>
  )
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10.5px] font-bold uppercase tracking-wider text-ink-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-[12.5px] text-ink-900">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Toggle({ label, on, disabled, onClick }: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
    >
      {label}
    </button>
  )
}

// -----------------------------------------------------------------------------
// Usage meters
// -----------------------------------------------------------------------------

export function UsageMeters({ usage }: { usage: AiUsageSnapshot }) {
  return (
    <div className="space-y-2 rounded-lg border border-ink-200 bg-white p-3">
      <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">
        <Gauge className="h-3.5 w-3.5" /> This month
      </p>
      <Meter label="Draft cycles" used={usage.draftCyclesUsed} cap={usage.draftCyclesCap} render={(u, c) => `${u} / ${c}`} />
      <Meter label="Finalize budget (MP)" used={usage.finalizeMpUsed} cap={usage.finalizeMpBudget} render={(u, c) => `${u} / ${c} MP`} />
      <Meter label="Storage" used={usage.storageBytesUsed} cap={usage.storageBytesCap} render={(u, c) => `${formatBytes(u)} / ${formatBytes(c)}`} />
    </div>
  )
}

function Meter({ label, used, cap, render }: { label: string; used: number; cap: number; render: (u: number, c: number) => string }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
  const hot = pct >= 90
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink-600">{label}</span>
        <span className={`tabular-nums ${hot ? 'font-semibold text-warning-700' : 'text-ink-500'}`}>{render(used, cap)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${hot ? 'bg-warning-500' : 'bg-pink-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------

function ResultActions({
  result,
  onEdit,
  onExport,
  editLabel = 'Edit in Studio',
}: {
  result: { svg: string; dielineId: string; label: string; index?: number }
  onEdit?: (r: { svg: string; dielineId: string; label: string; index?: number }) => void
  onExport?: (r: { svg: string; dielineId: string; label: string; index?: number }) => void
  editLabel?: string
}) {
  if (!onEdit && !onExport) return null
  return (
    <div className="flex gap-1 text-[11px]">
      {onEdit && (
        <button onClick={() => onEdit(result)} className="rounded-full border border-ink-200 px-2 py-0.5 font-semibold text-ink-600 hover:bg-ink-50">
          {editLabel}
        </button>
      )}
      {onExport && (
        <button onClick={() => onExport(result)} className="rounded-full border border-ink-200 px-2 py-0.5 font-semibold text-ink-600 hover:bg-ink-50">
          Export
        </button>
      )}
    </div>
  )
}

/**
 * VocabSelect — compact collapsible multi-select for a creative-vocabulary
 * dimension (Style / Colour / Elements). Replaces the always-open chip rails:
 * the trigger summarises the current picks as removable tokens (or a
 * placeholder) and collapses everything to one row; the popover lists the
 * admin-curated options as checkable rows, with type-to-filter and an
 * "add your own" affordance so a creator can enter a custom term. Custom terms
 * flow straight through to the prompt engine as ordinary tags.
 */
function VocabSelect({
  title,
  options,
  selected,
  onChange,
  placeholder,
}: {
  title: string
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  const remove = (v: string) => onChange(selected.filter((x) => x !== v))
  const norm = query.trim()
  // Curated options ∪ any already-selected custom terms, so a typed term still
  // shows as a checked row.
  const allOptions = [...options, ...selected.filter((s) => !options.includes(s))]
  const filtered = norm ? allOptions.filter((o) => o.toLowerCase().includes(norm.toLowerCase())) : allOptions
  const canAdd = norm.length > 0 && !allOptions.some((o) => o.toLowerCase() === norm.toLowerCase())
  const addCustom = () => {
    if (!norm) return
    if (!selected.includes(norm)) onChange([...selected, norm])
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">{title}</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 && <span className="px-0.5 text-[12.5px] text-ink-400">{placeholder}</span>}
          {selected.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-[12px] font-medium text-pink-700">
              {s}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${s}`}
                onClick={(e) => { e.stopPropagation(); remove(s) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); remove(s) } }}
                className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-pink-100"
              >
                <X className="h-3 w-3" />
              </span>
            </span>
          ))}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lg">
          <div className="border-b border-ink-100 p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); addCustom() } }}
              placeholder="Search or add your own…"
              className="w-full rounded-md border border-ink-200 px-2 py-1 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1" role="listbox" aria-multiselectable>
            {filtered.map((o) => {
              const on = selected.includes(o)
              return (
                <button
                  key={o}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-ink-700 hover:bg-ink-50"
                >
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-300'}`}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  {o}
                </button>
              )
            })}
            {filtered.length === 0 && !canAdd && <p className="px-2.5 py-2 text-[12px] text-ink-400">No matches.</p>}
          </div>
          {canAdd && (
            <button
              type="button"
              onClick={addCustom}
              className="flex w-full items-center gap-1.5 border-t border-ink-100 px-2.5 py-2 text-left text-[12.5px] font-medium text-pink-700 hover:bg-pink-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add “{norm}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ComplianceChip({ complete, summary, missing }: { complete: boolean; summary: string; missing: string[] }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-[12.5px] ${complete ? 'border-success-200 bg-success-50 text-success-800' : 'border-warning-200 bg-warning-50 text-warning-800'}`}>
      {complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div>
        <p className="font-semibold">{complete ? `Compliance-ready — ${summary}` : `${summary} — add before export`}</p>
        {!complete && missing.length > 0 && <p className="mt-0.5 text-[11.5px]">Missing: {missing.join(', ')}</p>}
      </div>
    </div>
  )
}

// ---- pure helpers ----

function domainLabel(d: LabelingDomain): string {
  return d === 'DIETARY_SUPPLEMENT' ? 'Supplement' : d === 'PET_PRODUCT' ? 'Pet' : d === 'OTC' ? 'OTC drug' : d === 'COSMETIC' ? 'Cosmetic' : 'Food'
}

/** DPI choices offered, capped by the tier policy (96 web / 150 / 300 print / 600 hi-res). */
function dpiChoices(maxDpi: number): number[] {
  return [96, 150, 300, 600].filter((d) => d <= maxDpi)
}

/** Web / Print / Source starting bundles, each clamped to the tier at render time. */
function buildPresets(policy: OutputPolicy): { id: string; label: string; settings: OutputSettings }[] {
  const base = policy.defaults
  const web: OutputSettings = { ...base, format: 'PNG', dpi: 96, colorProfile: 'RGB', marks: false, layered: false }
  const print: OutputSettings = { ...base, format: policy.allowedFormats.includes('PDF') ? 'PDF' : base.format, dpi: 300, colorProfile: 'CMYK', marks: true }
  const source: OutputSettings = {
    ...base,
    format: policy.allowedFormats.includes('AI') ? 'AI' : policy.allowedFormats.includes('SVG') ? 'SVG' : base.format,
    dpi: policy.maxDpi,
    layered: true,
    marks: true,
  }
  const out = [
    { id: 'web', label: 'Web / share (PNG, 96dpi)', settings: web },
    { id: 'print', label: 'Print-ready (PDF, 300dpi CMYK)', settings: print },
  ]
  if (policy.allowLayered) out.push({ id: 'source', label: 'Source / editable (layered, hi-res)', settings: source })
  return out
}
