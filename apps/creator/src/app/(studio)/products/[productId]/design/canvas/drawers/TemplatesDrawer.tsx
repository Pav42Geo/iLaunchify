'use client'

// TemplatesDrawer — die-line-aware template library (Design Template Library §6/§7).
// Loads the product's current surface as a matchable component + the candidate
// templates (premium Agency + the brand's own), runs the pure matchTemplatesToProduct
// engine to group by style category, and renders category chips + search + a grid.
// Tapping a template loads its Fabric JSON onto the canvas (confirmed first); recolor
// happens from the Brand tool afterwards.

import * as React from 'react'
import { LayoutTemplate, Crown, Plus, Search } from 'lucide-react'
import {
  matchTemplatesToProduct,
  type FabricCanvas,
  type DieCutSpec,
  type MatchedTemplate,
} from '@ilaunchify/ui'
import {
  loadStudioTemplateLibrary,
  getStudioBrandTemplateJson,
  getStudioPremiumTemplateJson,
  getStudioRegularLibraryTemplateJson,
  recordTemplateApplied,
} from '../brand-actions'

interface Props {
  canvas: FabricCanvas | null
  activeBrandId: string
  productId: string
  /** Product domain (LabelingType) — scopes which styles/templates apply. */
  domain: string
  /** The current die-line surface being designed. */
  dieCut: DieCutSpec
  /** Agency tier — unlocks the premium library. */
  canPremium?: boolean
  onSaveAsTemplate?: () => void
}

const labelClass = 'text-[12px] font-bold uppercase tracking-wider text-ink-700'
const ALL = '__all__'

export function TemplatesDrawer({
  canvas,
  activeBrandId,
  productId,
  domain,
  dieCut,
  canPremium = false,
  onSaveAsTemplate,
}: Props) {
  const [matched, setMatched] = React.useState<MatchedTemplate[]>([])
  // ids of admin REGULAR-library templates (system brand) — apply via their own loader.
  const [regularIds, setRegularIds] = React.useState<Set<string>>(new Set())
  const [surfaceLabel, setSurfaceLabel] = React.useState(dieCut.name)
  const [loading, setLoading] = React.useState(true)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [activeCat, setActiveCat] = React.useState<string>(ALL)
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadStudioTemplateLibrary({
      productId,
      brandId: activeBrandId,
      domain,
      surface: {
        componentId: dieCut.id,
        label: dieCut.name,
        packagingTypeId: null, // action falls back to the product's variant packaging type
        widthMm: dieCut.widthMm,
        heightMm: dieCut.heightMm,
      },
    }).then((lib) => {
      if (cancelled) return
      if (!lib) {
        setMatched([])
        setLoading(false)
        return
      }
      setRegularIds(new Set(lib.regular.map((t) => t.id)))
      const sections = matchTemplatesToProduct([lib.component], domain, [
        ...lib.premium,
        ...lib.regular,
        ...lib.own,
      ])
      const section = sections[0]
      setSurfaceLabel(section?.label ?? dieCut.name)
      setMatched(section ? section.groups.flatMap((g) => g.templates) : [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [productId, activeBrandId, domain, dieCut.id, dieCut.name, dieCut.widthMm, dieCut.heightMm])

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 2600)
  }

  // Distinct categories present in the matched set (for the chip row).
  const categories = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of matched) {
      const key = t.primaryStyleId ?? '__other__'
      if (!seen.has(key)) seen.set(key, t.primaryStyleLabel ?? 'Other')
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }))
  }, [matched])

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return matched.filter((t) => {
      const catKey = t.primaryStyleId ?? '__other__'
      if (activeCat !== ALL && catKey !== activeCat) return false
      if (q && !t.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [matched, activeCat, query])

  function loadJson(json: string) {
    if (!canvas) return
    try {
      const c = canvas as unknown as {
        loadFromJSON: (j: unknown, cb?: () => void) => void
        requestRenderAll: () => void
      }
      c.loadFromJSON(JSON.parse(json) as unknown, () => c.requestRenderAll())
      flash('Template applied — recolor it from the Brand tool.')
    } catch {
      flash('That template could not be loaded.')
    }
  }

  async function apply(t: MatchedTemplate) {
    const ok = window.confirm(`Start from “${t.name}”? This replaces your current design.`)
    if (!ok) return
    const res = t.isPremium
      ? await getStudioPremiumTemplateJson(t.id)
      : regularIds.has(t.id)
        ? await getStudioRegularLibraryTemplateJson(t.id)
        : await getStudioBrandTemplateJson(activeBrandId, t.id)
    if (res.ok) {
      loadJson(res.canvasJson)
      void recordTemplateApplied(t.id, { isPremium: t.isPremium, style: t.primaryStyleLabel, domain })
    } else flash(res.error)
  }

  return (
    <div className="space-y-4">
      <div className={labelClass + ' flex items-center gap-1.5'}>
        <LayoutTemplate className="h-3.5 w-3.5" /> Templates
      </div>

      <button
        type="button"
        onClick={() => onSaveAsTemplate?.()}
        disabled={!canvas}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-300 px-3 py-2 text-[12.5px] font-semibold text-ink-800 transition-colors hover:bg-ink-50 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> Save current as template
      </button>

      {notice && (
        <div className="rounded-md border border-pink-200 bg-pink-50 px-3 py-2 text-[11.5px] font-medium text-pink-900">
          {notice}
        </div>
      )}

      <p className="text-[11px] text-ink-500">
        Designs that fit <span className="font-semibold text-ink-700">{surfaceLabel}</span>
      </p>

      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          className="w-full rounded-lg border border-ink-200 py-2 pl-8 pr-3 text-[12.5px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        />
      </div>

      {/* category chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip label="All" active={activeCat === ALL} onClick={() => setActiveCat(ALL)} />
          {categories.map((c) => (
            <Chip key={c.id} label={c.label} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
          ))}
        </div>
      )}

      {/* grid */}
      {loading ? (
        <p className="text-[11px] text-ink-500">Loading templates…</p>
      ) : matched.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-200 px-3 py-6 text-center text-[11.5px] text-ink-500">
          No templates fit this die-line yet. Start from a blank canvas, or check back as the library grows.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-[11px] text-ink-500">Nothing matches that filter.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {visible.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => apply(t)}
              disabled={!canvas}
              className="group relative overflow-hidden rounded-md border border-ink-200 bg-white text-left transition-all hover:border-pink-300 hover:shadow-sm disabled:opacity-50"
            >
              {t.isPremium && (
                <span className="absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded bg-ink-900/80 px-1 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-white">
                  <Crown className="h-2.5 w-2.5" /> Pro
                </span>
              )}
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-ink-50">
                {t.thumbnailUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={t.thumbnailUrl} alt={t.name} className="h-full w-full object-contain" />
                ) : (
                  <LayoutTemplate className="h-5 w-5 text-ink-300" />
                )}
              </div>
              <div className="truncate px-2 py-1.5 text-[11.5px] font-medium text-ink-800">{t.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ' +
        (active
          ? 'border-pink-500 bg-pink-50 text-pink-700'
          : 'border-ink-200 text-ink-600 hover:border-ink-300')
      }
    >
      {label}
    </button>
  )
}
