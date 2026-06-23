'use client'

// TemplatesDrawer — left-rail "Templates" tool (Brand Kit V2 Phase 3c). Two
// sections: the admin-curated Premium library (Agency tier) and the creator's own
// saved templates. Tapping a template loads its Fabric JSON onto the Studio stage
// (replacing the current design — confirmed first). "Save current as template"
// reuses the shell's save action.

import * as React from 'react'
import { LayoutTemplate, Crown, Plus } from 'lucide-react'
import type { FabricCanvas } from '@ilaunchify/ui'
import type { BrandTemplateValues, PremiumTemplateValues } from '@ilaunchify/db'
import {
  listStudioBrandTemplates,
  listStudioPremiumTemplates,
  getStudioBrandTemplateJson,
  getStudioPremiumTemplateJson,
} from '../brand-actions'

interface Props {
  canvas: FabricCanvas | null
  activeBrandId: string
  /** Agency tier — unlocks the premium library. */
  canPremium?: boolean
  /** Persist the current design as one of the creator's own templates. */
  onSaveAsTemplate?: () => void
}

const labelClass = 'text-[12px] font-bold uppercase tracking-wider text-ink-700'

export function TemplatesDrawer({ canvas, activeBrandId, canPremium = false, onSaveAsTemplate }: Props) {
  const [own, setOwn] = React.useState<BrandTemplateValues[]>([])
  const [premium, setPremium] = React.useState<PremiumTemplateValues[]>([])
  const [loading, setLoading] = React.useState(true)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      listStudioBrandTemplates(activeBrandId),
      canPremium ? listStudioPremiumTemplates() : Promise.resolve([]),
    ]).then(([o, p]) => {
      if (cancelled) return
      setOwn(o)
      setPremium(p)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [activeBrandId, canPremium])

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 2600)
  }

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

  async function applyPremium(id: string) {
    const ok = window.confirm('Start from this template? This replaces your current design.')
    if (!ok) return
    const res = await getStudioPremiumTemplateJson(id)
    if (res.ok) loadJson(res.canvasJson)
    else flash(res.error)
  }

  async function applyOwn(t: BrandTemplateValues) {
    const ok = window.confirm(`Start from “${t.name}”? This replaces your current design.`)
    if (!ok) return
    const res = await getStudioBrandTemplateJson(activeBrandId, t.id)
    if (res.ok) loadJson(res.canvasJson)
    else flash(res.error)
  }

  return (
    <div className="space-y-5">
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

      {/* Premium library (Agency) */}
      {canPremium && (
        <section>
          <div className={labelClass + ' mb-2 flex items-center gap-1.5'}>
            <Crown className="h-3 w-3 text-pink-600" /> Premium
          </div>
          {loading ? (
            <p className="text-[11px] text-ink-500">Loading…</p>
          ) : premium.length === 0 ? (
            <p className="text-[11px] text-ink-500">No premium templates yet — check back soon.</p>
          ) : (
            <TemplateGrid
              items={premium.map((p) => ({ id: p.id, name: p.name, thumbnailUrl: p.thumbnailUrl }))}
              onPick={(id) => applyPremium(id)}
              disabled={!canvas}
            />
          )}
        </section>
      )}

      {/* The creator's own saved templates */}
      <section>
        <div className={labelClass + ' mb-2'}>My templates</div>
        {loading ? (
          <p className="text-[11px] text-ink-500">Loading…</p>
        ) : own.length === 0 ? (
          <p className="text-[11px] text-ink-500">
            None yet. Use <span className="font-semibold text-ink-700">Save current as template</span> above.
          </p>
        ) : (
          <TemplateGrid
            items={own.map((t) => ({ id: t.id, name: t.name, thumbnailUrl: t.thumbnailUrl }))}
            onPick={(id) => {
              const t = own.find((x) => x.id === id)
              if (t) applyOwn(t)
            }}
            disabled={!canvas}
          />
        )}
      </section>
    </div>
  )
}

function TemplateGrid({
  items,
  onPick,
  disabled,
}: {
  items: Array<{ id: string; name: string; thumbnailUrl: string | null }>
  onPick: (id: string) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
          disabled={disabled}
          className="group overflow-hidden rounded-md border border-ink-200 bg-white text-left transition-all hover:border-pink-300 hover:shadow-sm disabled:opacity-50"
        >
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
  )
}
