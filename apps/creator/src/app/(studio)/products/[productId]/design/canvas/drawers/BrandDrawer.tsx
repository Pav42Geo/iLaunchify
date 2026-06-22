'use client'

// BrandDrawer — left-rail "Brand" tool (docs/BRAND_KIT_PROPOSAL.md, DECIDED
// 2026-06-22). One place to pull from the active brand kit while designing:
//   - switch the active kit (creators are multi-brand)
//   - drop a logo onto the canvas (reuses the Images-drawer drop path)
//   - apply a brand color to the selected object's fill
//   - apply a brand font to the selected text object
//   - start from a saved brand template (replaces the current design)
// Ownership is enforced server-side in brand-actions.ts — this only ever shows
// kits the creator owns.

import * as React from 'react'
import { Palette, Type as TypeIcon, LayoutTemplate, ImagePlus, ExternalLink } from 'lucide-react'
import { addImageFromUrl, loadFont, type BrandCanvasAssets, type FabricCanvas } from '@ilaunchify/ui'
import type { BrandTemplateValues } from '@ilaunchify/db'
import {
  listStudioBrandKits,
  loadStudioBrandKit,
  getStudioBrandTemplateJson,
  type StudioBrandKitOption,
} from '../brand-actions'

interface Props {
  canvas: FabricCanvas | null
  /** SSR-provided assets for the product's brand — the initial active kit. */
  brandAssets: BrandCanvasAssets
  activeBrandId: string
  onActiveBrandChange: (brandId: string) => void
}

const labelClass = 'text-[10px] font-semibold uppercase tracking-wider text-ink-500'

export function BrandDrawer({ canvas, brandAssets, activeBrandId, onActiveBrandChange }: Props) {
  const [options, setOptions] = React.useState<StudioBrandKitOption[]>([])
  const [assets, setAssets] = React.useState<BrandCanvasAssets>(brandAssets)
  const [templates, setTemplates] = React.useState<BrandTemplateValues[]>([])
  const [loading, setLoading] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busyLogoId, setBusyLogoId] = React.useState<string | null>(null)

  // The creator's kits, for the switcher dropdown.
  React.useEffect(() => {
    let cancelled = false
    listStudioBrandKits().then((o) => {
      if (!cancelled) setOptions(o)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Re-pin the active kit's assets + templates whenever it changes.
  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadStudioBrandKit(activeBrandId).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setAssets(res.assets)
        setTemplates(res.templates)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [activeBrandId])

  const swatches = React.useMemo(() => {
    const list = [assets.colorPrimary, assets.colorSecondary, assets.colorAccent, ...assets.extraSwatches]
    return Array.from(new Set(list.filter((c): c is string => !!c)))
  }, [assets])

  const usableLogos = assets.logos.filter((l) => l.publicUrl)

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 2400)
  }

  async function dropLogo(id: string, url: string) {
    if (!canvas) return
    setBusyLogoId(id)
    try {
      await addImageFromUrl(canvas, url, { maxFraction: 0.4 })
    } finally {
      setBusyLogoId(null)
    }
  }

  function applyColor(color: string) {
    if (!canvas) return
    const obj = canvas.getActiveObject() as { set?: (p: Record<string, unknown>) => void } | null
    if (!obj?.set) {
      flash('Select an object first, then tap a color.')
      return
    }
    obj.set({ fill: color })
    canvas.requestRenderAll()
  }

  async function applyFont(family: string) {
    if (!canvas) return
    const obj = canvas.getActiveObject() as { set?: (p: Record<string, unknown>) => void; type?: string } | null
    const isText = obj?.type === 'textbox' || obj?.type === 'i-text' || obj?.type === 'text'
    if (!obj?.set || !isText) {
      flash('Select a text object, then tap a font.')
      return
    }
    await loadFont(family)
    obj.set({ fontFamily: family })
    canvas.requestRenderAll()
  }

  async function loadTemplate(t: BrandTemplateValues) {
    if (!canvas) return
    const ok = window.confirm(
      `Start from “${t.name}”? This replaces your current design — unsaved changes will be lost.`,
    )
    if (!ok) return
    const res = await getStudioBrandTemplateJson(activeBrandId, t.id)
    if (!res.ok) {
      flash(res.error)
      return
    }
    try {
      const json = JSON.parse(res.canvasJson) as unknown
      const c = canvas as unknown as {
        loadFromJSON: (j: unknown, cb?: () => void) => void
        requestRenderAll: () => void
      }
      c.loadFromJSON(json, () => c.requestRenderAll())
    } catch {
      flash('That template could not be loaded.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Active kit switcher */}
      <section>
        <div className={labelClass + ' mb-1.5'}>Active brand kit</div>
        <select
          value={activeBrandId}
          onChange={(e) => onActiveBrandChange(e.target.value)}
          className="w-full rounded-md border border-ink-300 bg-white px-2.5 py-2 text-[13px] font-medium text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          {/* Always include the current kit even before the list resolves. */}
          {options.length === 0 && <option value={activeBrandId}>{assets.brandName}</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </section>

      {notice && (
        <div className="rounded-md bg-pink-50 border border-pink-200 px-3 py-2 text-[11.5px] font-medium text-pink-900">
          {notice}
        </div>
      )}

      {/* Logos */}
      <section>
        <div className={labelClass + ' mb-2 flex items-center gap-1.5'}>
          <ImagePlus className="h-3 w-3" /> Logos
        </div>
        {usableLogos.length === 0 ? (
          <p className="text-[11px] text-ink-500">
            No logo variants in this kit yet.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {usableLogos.map((logo) => (
              <button
                key={logo.id}
                type="button"
                onClick={() => logo.publicUrl && dropLogo(logo.id, logo.publicUrl)}
                disabled={!canvas || busyLogoId === logo.id}
                className="group relative aspect-square rounded-md border border-ink-200 bg-white hover:border-pink-300 hover:shadow-sm transition-all overflow-hidden disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.publicUrl ?? ''}
                  alt={`${logo.variant} logo`}
                  className="absolute inset-1 w-[calc(100%-0.5rem)] h-[calc(100%-0.5rem)] object-contain"
                />
                <span className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wider text-ink-700 text-center py-0.5">
                  {logo.variant.toLowerCase()}
                </span>
                {busyLogoId === logo.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[11px] font-semibold text-ink-700">
                    Adding…
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Colors */}
      <section>
        <div className={labelClass + ' mb-2 flex items-center gap-1.5'}>
          <Palette className="h-3 w-3" /> Colors
          <span className="ml-0.5 normal-case font-normal tracking-normal text-ink-400">
            tap to apply to selection
          </span>
        </div>
        {swatches.length === 0 ? (
          <p className="text-[11px] text-ink-500">No brand colors in this kit yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => applyColor(c)}
                disabled={!canvas}
                title={c}
                className="h-8 w-8 rounded-md border border-ink-200 shadow-sm transition-transform hover:scale-105 disabled:opacity-50"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Fonts */}
      <section>
        <div className={labelClass + ' mb-2 flex items-center gap-1.5'}>
          <TypeIcon className="h-3 w-3" /> Fonts
          <span className="ml-0.5 normal-case font-normal tracking-normal text-ink-400">
            tap to apply to text
          </span>
        </div>
        {assets.fonts.length === 0 ? (
          <p className="text-[11px] text-ink-500">No brand fonts in this kit yet.</p>
        ) : (
          <div className="space-y-1.5">
            {assets.fonts.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => applyFont(f.family)}
                disabled={!canvas}
                className="flex w-full items-center justify-between rounded-md border border-ink-200 bg-white px-3 py-2 text-left transition-colors hover:border-pink-300 hover:bg-pink-50 disabled:opacity-50"
              >
                <span className="text-[13px] font-medium text-ink-900" style={{ fontFamily: f.family }}>
                  {f.family}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-ink-400">
                  {f.weight} {f.style !== 'Normal' ? f.style : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Templates */}
      <section>
        <div className={labelClass + ' mb-2 flex items-center gap-1.5'}>
          <LayoutTemplate className="h-3 w-3" /> Templates
        </div>
        {loading ? (
          <p className="text-[11px] text-ink-500">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-[11px] text-ink-500">
            No saved templates yet. Use <span className="font-semibold text-ink-700">Save as template</span> in the
            ☰ menu to add one.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => loadTemplate(t)}
                disabled={!canvas}
                className="group rounded-md border border-ink-200 bg-white overflow-hidden text-left transition-all hover:border-pink-300 hover:shadow-sm disabled:opacity-50"
              >
                <div className="aspect-[4/3] bg-ink-50 flex items-center justify-center overflow-hidden">
                  {t.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.thumbnailUrl} alt={t.name} className="h-full w-full object-contain" />
                  ) : (
                    <LayoutTemplate className="h-5 w-5 text-ink-300" />
                  )}
                </div>
                <div className="px-2 py-1.5 text-[11.5px] font-medium text-ink-800 truncate">{t.name}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Footer — manage the kit in the dashboard */}
      <div className="border-t border-ink-100 pt-3">
        <a
          href={`/brands/${activeBrandId}/assets`}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-pink-700 hover:text-pink-600"
        >
          Edit brand kit <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
