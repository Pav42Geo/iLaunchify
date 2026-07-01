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

import { useMemo, useRef, useState } from 'react'
import { Sparkles, Lock, CheckCircle2, AlertTriangle, Box, Layers, Plus, Link2, Palette, Upload, X, Sliders, Gauge } from 'lucide-react'
import { planGeneration, planGenerationSet, type FrameLayout, type SurfaceDims, type GenerationPlan, type GenerationSetPlan, type SetBrief } from '@ilaunchify/ui'
import { planFlavorSeries, type LabelingDomain, type MarketCode, type FlavorSpec, type FlavorSeriesPlan } from '@ilaunchify/ai-design'
import { clampOutput, formatBytes, type OutputPolicy, type OutputSettings, type OutputFormat } from '@ilaunchify/imagegen'

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

export type CreatorTier = 'maker' | 'builder' | 'agency' | 'admin'

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
  onEditInStudio?: (result: { svg: string; dielineId: string; label: string }) => void
  /** Export a generated concept (SVG/PDF). When absent the button is hidden. */
  onExport?: (result: { svg: string; dielineId: string; label: string }) => void
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

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${on ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
    >
      {label}
    </button>
  )
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

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const genCtx: GenerateContext = {
    brandRefUrl,
    palette: effPalette,
    output: output ?? undefined,
    brief: { descriptor, styleTags: styles, colorTags: colors, elementTags: elements },
  }

  async function generate() {
    if (setMode) {
      if (!setPlan) return
      setBusy(true)
      try {
        const out: { id: string; label: string; svg: string }[] = []
        for (const d of setPlan.perDieline) {
          const refs = props.onGenerate ? await props.onGenerate(d.plan, d.id, genCtx) : []
          out.push({ id: d.id, label: d.label, svg: refs[0] ?? d.plan.previewSvg })
        }
        setSetVariants(out)
      } finally {
        setBusy(false)
      }
      return
    }
    if (flavorMode) {
      if (!plan || !selected) return
      setBusy(true)
      try {
        if (props.onGenerate) await props.onGenerate(plan, selected.id, genCtx)
        setMasterGenerated(true)
      } finally {
        setBusy(false)
      }
      return
    }
    if (!plan || !selected) return
    setBusy(true)
    try {
      const refs = props.onGenerate ? await props.onGenerate(plan, selected.id, genCtx) : []
      setVariations(refs.length > 0 ? refs : [plan.previewSvg, plan.previewSvg, plan.previewSvg, plan.previewSvg])
    } finally {
      setBusy(false)
    }
  }

  function switchScope(next: 'single' | 'set' | 'flavors') {
    setScope(next)
    setVariations([])
    setSetVariants([])
    setMasterGenerated(false)
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
          <p className="mt-1 text-[11px] text-ink-400">Chips + prompt tone are domain-tuned for {domainLabel(domain)}.</p>
        </div>

        <ChipGroup title="Style" options={styleOptions} selected={styles} onToggle={(v) => toggle(styles, setStyles, v)} />
        <ChipGroup title="Colour mood" options={colorOptions} selected={colors} onToggle={(v) => toggle(colors, setColors, v)} />
        <ChipGroup title="Elements" options={elementOptions} selected={elements} onToggle={(v) => toggle(elements, setElements, v)} />

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
            <div className="mx-auto max-w-[420px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: plan?.previewSvg ?? '' }} />
            <p className="mt-2 text-[11px] text-ink-400">
              Reserved (truth-layer) zones: {plan?.reservedLabels.join(', ') || 'none'} — kept clear for your real label data.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {variations.map((v, i) => (
              <div key={i} className="rounded-xl border border-ink-200 bg-white p-2">
                <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: v }} />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] text-ink-400">Concept {i + 1}</span>
                  <ResultActions
                    result={{ svg: v, dielineId: selected?.id ?? '', label: selected?.label ?? '' }}
                    onEdit={props.onEditInStudio}
                    onExport={props.onExport}
                    editLabel={props.editActionLabel}
                  />
                </div>
              </div>
            ))}
            <button onClick={generate} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50">
              <Plus className="h-3.5 w-3.5" /> Re-roll
            </button>
          </div>
        )}

        {props.savedConcepts && (
          <SavedTemplatesGrid concepts={props.savedConcepts} storageUsed={props.usage?.storageBytesUsed} storageCap={props.usage?.storageBytesCap} />
        )}
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
  result: { svg: string; dielineId: string; label: string }
  onEdit?: (r: { svg: string; dielineId: string; label: string }) => void
  onExport?: (r: { svg: string; dielineId: string; label: string }) => void
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

function ChipGroup({ title, options, selected, onToggle }: { title: string; options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip key={o} label={o} on={selected.includes(o)} onClick={() => onToggle(o)} />
        ))}
      </div>
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
