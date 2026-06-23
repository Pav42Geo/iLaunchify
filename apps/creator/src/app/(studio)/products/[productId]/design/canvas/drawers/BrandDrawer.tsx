'use client'

// BrandDrawer — left-rail "Brand" tool (docs/BRAND_KIT_PROPOSAL.md). The whole
// brand kit is managed HERE, inside the Design Studio — the creator never leaves
// their order to edit branding. Two modes:
//   Apply — tap a logo/color/font/template to use it on the canvas.
//   Edit  — full inline editor (upload logos, edit colors/fonts/tagline) using the
//           same section components as the profile, loaded in-Studio.
// Ownership is enforced server-side. No "exit to profile" link.

import * as React from 'react'
import { Palette, Type as TypeIcon, LayoutTemplate, ImagePlus, ChevronDown, Plus, Wand2 } from 'lucide-react'
import { addImageFromUrl, loadBrandFont, type BrandCanvasAssets, type FabricCanvas } from '@ilaunchify/ui'
import type { BrandTemplateValues } from '@ilaunchify/db'
import {
  listStudioBrandKits,
  loadStudioBrandKit,
  getStudioBrandTemplateJson,
  type StudioBrandKitOption,
} from '../brand-actions'
import {
  loadStudioBrandKitEditor,
  quickCreateBrandKit,
  type LoadBrandKitEditorResult,
} from '../brand-edit-actions'
import { InfoTip } from '../InfoTip'
import { LogosCompact, ColorsCompact, FontsCompact, TaglineCompact, BuildFromWebsite } from '../BrandKitCompactEditor'
import { TextStylesSection } from '@/app/(dashboard)/brands/[brandId]/assets/TextStylesSection'
import { PalettesSection } from '@/app/(dashboard)/brands/[brandId]/assets/PalettesSection'

interface Props {
  canvas: FabricCanvas | null
  /** SSR-provided assets for the product's brand — the initial active kit. */
  brandAssets: BrandCanvasAssets
  activeBrandId: string
  onActiveBrandChange: (brandId: string) => void
}

type Mode = 'apply' | 'edit'

const labelClass = 'text-[12px] font-bold uppercase tracking-wider text-ink-700'

export function BrandDrawer({ canvas, brandAssets, activeBrandId, onActiveBrandChange }: Props) {
  const [mode, setMode] = React.useState<Mode>('apply')
  const [options, setOptions] = React.useState<StudioBrandKitOption[]>([])
  const [assets, setAssets] = React.useState<BrandCanvasAssets>(brandAssets)
  const [templates, setTemplates] = React.useState<BrandTemplateValues[]>([])
  const [loading, setLoading] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busyLogoId, setBusyLogoId] = React.useState<string | null>(null)
  // Bumped when leaving Edit mode so Apply re-reads the (possibly edited) kit.
  const [applyReload, setApplyReload] = React.useState(0)
  // Inline "new brand kit" creation (no leaving the Studio).
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [createBusy, setCreateBusy] = React.useState(false)

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

  // Re-pin the active kit's assets + templates whenever it changes (or after edits).
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
  }, [activeBrandId, applyReload])

  function switchMode(next: Mode) {
    if (next === 'apply' && mode === 'edit') setApplyReload((n) => n + 1)
    setMode(next)
  }

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

  async function applyFont(family: string, webfontUrl?: string | null) {
    if (!canvas) return
    const obj = canvas.getActiveObject() as { set?: (p: Record<string, unknown>) => void; type?: string } | null
    const isText = obj?.type === 'textbox' || obj?.type === 'i-text' || obj?.type === 'text'
    if (!obj?.set || !isText) {
      flash('Select a text object, then tap a font.')
      return
    }
    await loadBrandFont(family, webfontUrl)
    obj.set({ fontFamily: family })
    canvas.requestRenderAll()
  }

  async function createKit() {
    const name = newName.trim()
    if (name.length < 2) {
      flash('Give your brand kit a name (2+ characters).')
      return
    }
    setCreateBusy(true)
    try {
      const res = await quickCreateBrandKit(name)
      if (!res.ok) {
        flash(res.error)
        return
      }
      // Refresh the switcher list, make the new kit active, and jump to Edit so the
      // creator can fill it in — all without leaving the Studio.
      const fresh = await listStudioBrandKits()
      setOptions(fresh)
      setCreating(false)
      setNewName('')
      onActiveBrandChange(res.brandId)
      setMode('edit')
    } finally {
      setCreateBusy(false)
    }
  }

  // One-click: swap fonts + recolor EDITABLE text to the active kit. Locked /
  // regulated objects (Nutrition Facts panel, barcodes — all images, not text) are
  // never touched. Fully undoable via the canvas history.
  async function applyBrand() {
    if (!canvas) return
    const headingFont = assets.fonts[0] ?? null
    const fontFamily = headingFont?.family ?? null
    const color = assets.colorPrimary ?? swatches[0] ?? null
    if (!fontFamily && !color) {
      flash('Add a brand font or color to this kit first.')
      return
    }
    const ok = window.confirm(
      `Apply ${assets.brandName} to this design? This swaps fonts and recolors your editable text. Regulated panels (Nutrition Facts, barcodes) stay unchanged — and you can undo.`,
    )
    if (!ok) return
    if (fontFamily) await loadBrandFont(fontFamily, headingFont?.webfontUrl)
    const c = canvas as unknown as {
      getObjects?: () => Array<Record<string, unknown>>
      requestRenderAll: () => void
    }
    const objs = c.getObjects?.() ?? []
    let touched = 0
    for (const o of objs) {
      const type = o.type as string | undefined
      const isText = type === 'textbox' || type === 'i-text' || type === 'text'
      const locked = o.selectable === false || o.evented === false
      const set = o.set as ((p: Record<string, unknown>) => void) | undefined
      if (!isText || locked || !set) continue
      if (fontFamily) set({ fontFamily })
      if (color) set({ fill: color })
      touched++
    }
    c.requestRenderAll()
    flash(
      touched > 0
        ? `Applied ${assets.brandName} to ${touched} text element${touched === 1 ? '' : 's'}.`
        : 'No editable text to brand on this design.',
    )
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
    <div className="space-y-5">
      {/* Active kit switcher + inline "new kit" */}
      <section>
        <div className={labelClass + ' mb-1.5 flex items-center justify-between'}>
          <span>Active brand kit</span>
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 normal-case tracking-normal text-[11px] font-semibold text-pink-700 hover:text-pink-600"
            >
              <Plus className="h-3 w-3" /> New kit
            </button>
          )}
        </div>
        {creating ? (
          <div className="space-y-2 rounded-md border border-pink-200 bg-pink-50/40 p-2.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createKit()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewName('')
                }
              }}
              placeholder="New brand kit name"
              maxLength={120}
              className="w-full rounded-md border border-ink-300 bg-white px-2.5 py-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={createKit}
                disabled={createBusy || newName.trim().length < 2}
                className="flex-1 rounded-md bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
              >
                {createBusy ? 'Creating…' : 'Create kit'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false)
                  setNewName('')
                }}
                className="rounded-md border border-ink-300 px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <select
            value={activeBrandId}
            onChange={(e) => onActiveBrandChange(e.target.value)}
            className="w-full rounded-md border border-ink-300 bg-white px-2.5 py-2 text-[13px] font-medium text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            {options.length === 0 && <option value={activeBrandId}>{assets.brandName}</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </section>

      {/* Mode toggle — Apply (use on canvas) / Edit (manage the kit), all in-Studio */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink-100 p-1">
        <button
          type="button"
          onClick={() => switchMode('apply')}
          className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            mode === 'apply' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => switchMode('edit')}
          className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            mode === 'edit' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          Edit kit
        </button>
      </div>

      {notice && (
        <div className="rounded-md bg-pink-50 border border-pink-200 px-3 py-2 text-[11.5px] font-medium text-pink-900">
          {notice}
        </div>
      )}

      {mode === 'apply' ? (
        <div className="space-y-6">
          {/* One-click apply brand to the whole design */}
          <button
            type="button"
            onClick={applyBrand}
            disabled={!canvas}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink-900 px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" /> Apply brand to design
          </button>

          {/* Logos */}
          <section>
            <div className={labelClass + ' mb-2 flex items-center gap-1.5'}>
              <ImagePlus className="h-3 w-3" /> Logos
            </div>
            {usableLogos.length === 0 ? (
              <p className="text-[11px] text-ink-500">
                No logos yet — add one in <button type="button" onClick={() => switchMode('edit')} className="font-semibold text-pink-700 underline">Edit kit</button>.
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
              <Palette className="h-3 w-3" /> Colors            </div>
            {swatches.length === 0 ? (
              <p className="text-[11px] text-ink-500">No colors yet — add them in Edit kit.</p>
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
              <TypeIcon className="h-3 w-3" /> Fonts            </div>
            {assets.fonts.length === 0 ? (
              <p className="text-[11px] text-ink-500">No fonts yet — add them in Edit kit.</p>
            ) : (
              <div className="space-y-1.5">
                {assets.fonts.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => applyFont(f.family, f.webfontUrl)}
                    disabled={!canvas}
                    className="flex w-full items-center justify-between rounded-md border border-ink-200 bg-white px-3 py-2 text-left transition-colors hover:border-pink-300 hover:bg-pink-50 disabled:opacity-50"
                  >
                    <span className="text-[13px] font-medium text-ink-900" style={{ fontFamily: f.family }}>
                      {f.family}
                    </span>
                    <span className="text-[12px] uppercase tracking-wide text-ink-700">
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
        </div>
      ) : (
        <BrandKitEditor key={activeBrandId} brandId={activeBrandId} />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Edit mode — the full kit editor, inline in the Studio. Reuses the same section
// components the profile uses (Logos/Colors/Fonts/Tagline), loaded in-Studio.
// -----------------------------------------------------------------------------
function BrandKitEditor({ brandId }: { brandId: string }) {
  const [data, setData] = React.useState<LoadBrandKitEditorResult | null>(null)

  const reload = React.useCallback(() => {
    loadStudioBrandKitEditor(brandId).then(setData)
  }, [brandId])

  React.useEffect(() => {
    let cancelled = false
    setData(null)
    loadStudioBrandKitEditor(brandId).then((res) => {
      if (!cancelled) setData(res)
    })
    return () => {
      cancelled = true
    }
  }, [brandId])

  if (!data) return <p className="text-[12px] text-ink-500">Loading your brand kit…</p>
  if (!data.ok) return <p className="text-[12px] text-red-600">{data.error}</p>

  const logoCount = [data.logos.primary, data.logos.icon, data.logos.horizontal].filter(Boolean).length
  const colorCount = [data.colors.colorPrimary, data.colors.colorSecondary, data.colors.colorAccent, ...data.colors.brandSwatches].filter(Boolean).length

  return (
    <div className="space-y-2.5">
      <BuildFromWebsite brandId={brandId} onDone={reload} />
      <KitGroup
        title="Logos"
        icon={<ImagePlus className="h-3.5 w-3.5" />}
        count={logoCount}
        info="Upload up to three logo variants. They appear under My Brand in the Images drawer."
        defaultOpen
      >
        <LogosCompact brandId={brandId} initial={data.logos} onChanged={reload} />
      </KitGroup>
      <KitGroup
        title="Colors"
        icon={<Palette className="h-3.5 w-3.5" />}
        count={colorCount}
        info="Your brand colors pin to the top of every color picker on the canvas. Tap + to add one."
        defaultOpen
      >
        <ColorsCompact brandId={brandId} initial={data.colors} />
      </KitGroup>
      <KitGroup
        title="Fonts"
        icon={<TypeIcon className="h-3.5 w-3.5" />}
        count={data.selectedFontIds.length}
        info="Pick up to 3 brand fonts. They pin to the top of the canvas text font list."
      >
        <FontsCompact
          brandId={brandId}
          selected={data.selectedFontIds}
          catalog={data.fontCatalog}
          customFonts={data.customFonts}
          canUploadCustomFonts={data.canUploadCustomFonts}
        />
      </KitGroup>
      <KitGroup
        title="Tagline"
        icon={<TypeIcon className="h-3.5 w-3.5" />}
        info="A short brand line you can drop onto the label as pre-filled text."
      >
        <TaglineCompact brandId={brandId} initial={data.tagline} />
      </KitGroup>

      {/* Slice 4 + 5 — text styles + color palettes, reusing the dashboard editors
          so branding stays fully inline in the Studio (Pavel 2026-06-23). */}
      <TextStylesSection
        brandId={brandId}
        fonts={data.fontOptions}
        colors={{
          primary: data.colors.colorPrimary,
          secondary: data.colors.colorSecondary,
          accent: data.colors.colorAccent,
        }}
        initial={data.textStyles}
      />
      <PalettesSection brandId={brandId} initial={data.palettes} canHarmony={data.canHarmony} />
    </div>
  )
}

// Canva-style collapsible section card for the in-Studio kit editor.
function KitGroup({
  title,
  icon,
  count,
  info,
  defaultOpen,
  children,
}: {
  title: string
  icon: React.ReactNode
  count?: number
  info?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-ink-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="text-ink-500">{icon}</span>
        <span className="text-[12px] font-bold uppercase tracking-wider text-ink-700">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-ink-100 px-1.5 py-px text-[10px] font-semibold text-ink-500">{count}</span>
        )}
        {info && <InfoTip text={info} />}
        <ChevronDown className="ml-auto h-4 w-4 text-ink-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-ink-100 px-3 py-3">{children}</div>
    </details>
  )
}
