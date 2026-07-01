'use client'

// =============================================================================
// AI Create panel (AI_PACKAGING_GENERATOR §8, P2).
//
// DIE-LINE-FIRST by design (Pavel 2026-06-23): the generator always targets an
// EXISTING die-line — or one die-line of a SET (primary + outer carton, a variety
// pack's per-flavor labels). "Design which die-line?" is the first control; we
// never invent a structure. Everything downstream (prompt, mask, compliance,
// preview) is computed by planGeneration() for the selected die-line.
//
// Prop-driven + presentational: no DB, no model. onGenerate is the P3 seam — until
// a provider is wired it returns nothing and we show the deterministic placeholder
// composite. Tier-gated: Builder/Agency creators + Admin; Maker is steered to the
// premium template library.
// =============================================================================

import { useMemo, useState } from 'react'
import { Sparkles, Lock, CheckCircle2, AlertTriangle, Box, Layers, Plus, Link2, Palette } from 'lucide-react'
import { planGeneration, planGenerationSet, type FrameLayout, type SurfaceDims, type GenerationPlan, type GenerationSetPlan, type SetBrief } from '@ilaunchify/ui'
import { planFlavorSeries, type LabelingDomain, type MarketCode, type FlavorSpec, type FlavorSeriesPlan } from '@ilaunchify/ai-design'

export interface DielineTarget {
  id: string
  /** "Primary box", "Outer carton", "Vanilla label". */
  label: string
  /** "flip-top mailer box". */
  shapeLabel?: string
  layout: FrameLayout
  surface: SurfaceDims
}

export type CreatorTier = 'maker' | 'builder' | 'agency' | 'admin'

export interface AiCreatePanelProps {
  productDescriptor: string
  brandName?: string
  brandPalette?: string[]
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
  /**
   * Optional flavour variants (e.g. 7 protein-bar flavours). When present with >1
   * entry, unlocks Flavour-family mode: generate ONE master, then derive each flavour
   * by recolouring its accent + swapping its element — identical brand, different accent.
   */
  flavors?: FlavorSpec[]
  /** P3 provider: given the plan + die-line, return N variation image refs. */
  onGenerate?: (plan: GenerationPlan, dielineId: string) => Promise<string[]>
}

const DEFAULT_STYLES = ['Minimal', 'Vintage', 'Luxury', 'Playful', 'Modern', 'Hand-drawn', 'Bold', 'Natural', 'Warm', 'Geometric']
const DEFAULT_COLORS = ['Vibrant', 'Muted', 'Warm Tones', 'Cool Tones', 'Pastel', 'Earthy', 'Monochrome', 'Jewel Tones']
const DEFAULT_ELEMENTS = ['Botanicals', 'Fruits', 'Liquid Swirls', 'Patterns', 'Abstract Shapes', 'Doodles', 'Waves', 'Celestial']

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

  const [scope, setScope] = useState<'single' | 'set' | 'flavors'>('single')
  const [selectedId, setSelectedId] = useState(dielines[0]?.id ?? '')
  const [descriptor, setDescriptor] = useState(props.productDescriptor)
  const [styles, setStyles] = useState<string[]>([])
  const [colors, setColors] = useState<string[]>([])
  const [elements, setElements] = useState<string[]>([])
  const [variations, setVariations] = useState<string[]>([])
  // In set-mode we keep one preview per die-line instead of 4 concepts.
  const [setVariants, setSetVariants] = useState<{ id: string; label: string; svg: string }[]>([])
  // In flavour-mode the master must be generated first, then flavours derive from it.
  const [masterGenerated, setMasterGenerated] = useState(false)
  const [busy, setBusy] = useState(false)

  const setMode = multi && scope === 'set'
  const flavorMode = hasFlavors && scope === 'flavors'
  const selected = dielines.find((d) => d.id === selectedId) ?? dielines[0]

  // Shared creative brief — identical for single or set; only the die-line differs.
  const brief = useMemo<SetBrief>(
    () => ({
      productDescriptor: descriptor,
      brandName: props.brandName,
      brandPalette: props.brandPalette,
      substrateLabel: props.substrateLabel,
      styleTags: styles,
      colorTags: colors,
      elementTags: elements,
      domain,
      market,
    }),
    [descriptor, styles, colors, elements, props.brandName, props.brandPalette, props.substrateLabel, domain, market],
  )

  const plan = useMemo<GenerationPlan | null>(() => {
    if (!selected) return null
    return planGeneration({ ...brief, layout: selected.layout, surface: selected.surface })
  }, [selected, brief])

  // Coordinated set: one shared seed across every die-line + package-level compliance.
  const setPlan = useMemo<GenerationSetPlan | null>(() => {
    if (!setMode) return null
    return planGenerationSet(
      brief,
      dielines.map((d) => ({ id: d.id, label: d.label, layout: d.layout, surface: d.surface })),
    )
  }, [setMode, brief, dielines])

  // Flavour family: derive N flavours from ONE approved master on the selected die-line.
  const flavorPlan = useMemo<FlavorSeriesPlan | null>(() => {
    if (!flavorMode || !plan) return null
    return planFlavorSeries(`${descriptor}|${selected?.id ?? ''}`, flavors)
  }, [flavorMode, plan, descriptor, selected, flavors])

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function generate() {
    if (setMode) {
      if (!setPlan) return
      setBusy(true)
      try {
        // P3 provider fills each surface; P2 shows the per-die-line composite.
        const out: { id: string; label: string; svg: string }[] = []
        for (const d of setPlan.perDieline) {
          const refs = props.onGenerate ? await props.onGenerate(d.plan, d.id) : []
          out.push({ id: d.id, label: d.label, svg: refs[0] ?? d.plan.previewSvg })
        }
        setSetVariants(out)
      } finally {
        setBusy(false)
      }
      return
    }
    if (flavorMode) {
      // Only the MASTER is generated; flavours derive from it (recolour + element swap).
      if (!plan || !selected) return
      setBusy(true)
      try {
        if (props.onGenerate) await props.onGenerate(plan, selected.id)
        setMasterGenerated(true)
      } finally {
        setBusy(false)
      }
      return
    }
    if (!plan || !selected) return
    setBusy(true)
    try {
      const refs = props.onGenerate ? await props.onGenerate(plan, selected.id) : []
      // P2 with no provider → show the deterministic placeholder composite ×4.
      setVariations(refs.length > 0 ? refs : [plan.previewSvg, plan.previewSvg, plan.previewSvg, plan.previewSvg])
    } finally {
      setBusy(false)
    }
  }

  // Switching scope clears stale results so the preview column stays truthful.
  function switchScope(next: 'single' | 'set' | 'flavors') {
    setScope(next)
    setVariations([])
    setSetVariants([])
    setMasterGenerated(false)
  }

  if (gated) {
    return (
      <div className="rounded-2xl border border-ink-200 bg-white p-6 text-center">
        <Lock className="mx-auto h-5 w-5 text-ink-400" />
        <p className="mt-2 text-[14px] font-semibold text-ink-900">AI Create is a Builder &amp; Agency feature</p>
        <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-ink-500">
          On Maker you can start from our compliance-checked premium templates and recolour them to your brand. Upgrade to generate original designs into your die-line.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
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

        {/* Intake scaffold */}
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-500">Describe the design</label>
          <textarea
            value={descriptor}
            onChange={(e) => setDescriptor(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          />
        </div>

        <ChipGroup title="Style" options={styleOptions} selected={styles} onToggle={(v) => toggle(styles, setStyles, v)} />
        <ChipGroup title="Colour mood" options={colorOptions} selected={colors} onToggle={(v) => toggle(colors, setColors, v)} />
        <ChipGroup title="Elements" options={elementOptions} selected={elements} onToggle={(v) => toggle(elements, setElements, v)} />

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
        {!props.onGenerate && (
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
          // Coordinated set: one card per die-line, all sharing the family look.
          <div className="grid grid-cols-2 gap-3">
            {(setVariants.length > 0 ? setVariants : (setPlan?.perDieline ?? []).map((d) => ({ id: d.id, label: d.label, svg: d.plan.previewSvg }))).map((v) => (
              <div key={v.id} className="rounded-xl border border-ink-200 bg-white p-2">
                <p className="mb-1 truncate text-[10.5px] font-semibold text-ink-500">{v.label}</p>
                <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: v.svg }} />
                {setVariants.length > 0 && (
                  <div className="mt-1.5 flex items-center justify-end gap-1 text-[11px]">
                    <button className="rounded-full border border-ink-200 px-2 py-0.5 font-semibold text-ink-600 hover:bg-ink-50">Edit in Studio</button>
                    <button className="rounded-full border border-ink-200 px-2 py-0.5 font-semibold text-ink-600 hover:bg-ink-50">Export</button>
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
          // Flavour family: locked master + N derived flavours (recolour + element swap).
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
                  <div className="flex gap-1 text-[11px]">
                    <button className="rounded-full border border-ink-200 px-2 py-0.5 font-semibold text-ink-600 hover:bg-ink-50">Edit in Studio</button>
                    <button className="rounded-full border border-ink-200 px-2 py-0.5 font-semibold text-ink-600 hover:bg-ink-50">Export</button>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={generate} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50">
              <Plus className="h-3.5 w-3.5" /> Re-roll
            </button>
          </div>
        )}
      </div>
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
