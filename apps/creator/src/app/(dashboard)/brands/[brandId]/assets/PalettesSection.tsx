'use client'

// Brand Color Palettes editor (Brand Kit V2 Slice 5).
//
// Multi-palette color V2: named palettes, each with solid or gradient swatches plus
// optional CMYK + Pantone print-reference metadata. Solid swatches also surface in the
// Design Studio's color/background pickers (folded into extraSwatches by the loader).
// Pantone is a free-text reference code only — no licensed color library ships.

import { useState, useTransition } from 'react'
import { Plus, Trash2, X, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createPalette,
  renamePalette,
  deletePalette,
  addSwatch,
  updateSwatch,
  removeSwatch,
} from './actions'
import { PaletteGenerator } from './PaletteGenerator'

interface GradientState {
  angle: number
  stops: { color: string; pos: number }[]
}
export interface SwatchState {
  id: string
  kind: 'SOLID' | 'GRADIENT'
  hex: string | null
  name: string | null
  cmykC: number | null
  cmykM: number | null
  cmykY: number | null
  cmykK: number | null
  pantone: string | null
  gradient: GradientState | null
}
export interface PaletteState {
  id: string
  name: string
  swatches: SwatchState[]
}

interface Props {
  brandId: string
  initial: PaletteState[]
  /** Builder+ may use color-harmony methods in the generator (Auto is free). */
  canHarmony?: boolean
  /** Agency may extract a palette from an image / logo. */
  canExtract?: boolean
  /** Resolved brand logo image URLs for "use my logo". */
  logoUrls?: string[]
}

function gradientCss(g: GradientState | null): string {
  if (!g || g.stops.length < 2) return 'transparent'
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${s.pos}%`).join(', ')
  return `linear-gradient(${g.angle}deg, ${stops})`
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function PalettesSection({
  brandId,
  initial,
  canHarmony = false,
  canExtract = false,
  logoUrls = [],
}: Props) {
  const [palettes, setPalettes] = useState<PaletteState[]>(initial)
  const [selected, setSelected] = useState<string | null>(null)
  const [showGen, setShowGen] = useState(false)
  const [, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await fn()
      if (!r.ok && r.error) toast.error(r.error)
    })
  }

  async function handleNewPalette() {
    const r = await createPalette({ brandId, name: `Palette ${palettes.length + 1}` })
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    setPalettes((p) => [...p, { id: r.paletteId, name: `Palette ${p.length + 1}`, swatches: [] }])
  }

  function patchPaletteName(id: string, name: string) {
    setPalettes((p) => p.map((pl) => (pl.id === id ? { ...pl, name } : pl)))
  }

  function removePalette(id: string) {
    setPalettes((p) => p.filter((pl) => pl.id !== id))
    run(() => deletePalette({ brandId, paletteId: id }))
  }

  async function handleAddSwatch(paletteId: string) {
    const swatch = { kind: 'SOLID' as const, hex: '#FF2E63' }
    const r = await addSwatch({ brandId, paletteId, swatch })
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    const newSwatch: SwatchState = {
      id: r.swatchId,
      kind: 'SOLID',
      hex: '#FF2E63',
      name: null,
      cmykC: null,
      cmykM: null,
      cmykY: null,
      cmykK: null,
      pantone: null,
      gradient: null,
    }
    setPalettes((p) =>
      p.map((pl) => (pl.id === paletteId ? { ...pl, swatches: [...pl.swatches, newSwatch] } : pl)),
    )
    setSelected(r.swatchId)
  }

  function patchSwatch(swatchId: string, patch: Partial<SwatchState>, persist = true) {
    setPalettes((p) =>
      p.map((pl) => ({
        ...pl,
        swatches: pl.swatches.map((s) => (s.id === swatchId ? { ...s, ...patch } : s)),
      })),
    )
    if (persist) {
      run(() =>
        updateSwatch({
          brandId,
          swatchId,
          swatch: {
            ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
            ...(patch.hex !== undefined ? { hex: patch.hex } : {}),
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.cmykC !== undefined ? { cmykC: patch.cmykC } : {}),
            ...(patch.cmykM !== undefined ? { cmykM: patch.cmykM } : {}),
            ...(patch.cmykY !== undefined ? { cmykY: patch.cmykY } : {}),
            ...(patch.cmykK !== undefined ? { cmykK: patch.cmykK } : {}),
            ...(patch.pantone !== undefined ? { pantone: patch.pantone } : {}),
            ...(patch.gradient !== undefined ? { gradient: patch.gradient } : {}),
          },
        }),
      )
    }
  }

  function deleteSwatch(swatchId: string) {
    setPalettes((p) => p.map((pl) => ({ ...pl, swatches: pl.swatches.filter((s) => s.id !== swatchId) })))
    if (selected === swatchId) setSelected(null)
    run(() => removeSwatch({ brandId, swatchId }))
  }

  const selectedSwatch = palettes.flatMap((p) => p.swatches).find((s) => s.id === selected) ?? null

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink-900">Color palettes</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowGen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-800 hover:border-pink-400 hover:text-pink-700"
          >
            <Wand2 className="h-3.5 w-3.5" /> Generate
          </button>
          <button
            type="button"
            onClick={handleNewPalette}
            className="inline-flex items-center gap-1 rounded-md bg-ink-900 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-black"
          >
            <Plus className="h-3.5 w-3.5" /> New palette
          </button>
        </div>
      </div>
      <p className="mb-4 text-[12.5px] text-ink-500">
        Organize extra brand colors into palettes — solids and gradients, with optional CMYK and
        Pantone reference codes for print. Solid colors also appear in the Design Studio pickers.
      </p>

      {showGen && (
        <div className="mb-4">
          <PaletteGenerator
            brandId={brandId}
            canHarmony={canHarmony}
            canExtract={canExtract}
            logoUrls={logoUrls}
            onSaved={(p) => setPalettes((prev) => [...prev, p])}
            onClose={() => setShowGen(false)}
          />
        </div>
      )}

      {palettes.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-6 text-center text-[12.5px] text-ink-500">
          No palettes yet. Create one to group seasonal or secondary colors.
        </div>
      ) : (
        <div className="space-y-4">
          {palettes.map((pl) => (
            <div key={pl.id} className="rounded-md border border-ink-200 p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <input
                  value={pl.name}
                  onChange={(e) => patchPaletteName(pl.id, e.target.value)}
                  onBlur={(e) => run(() => renamePalette({ brandId, paletteId: pl.id, name: e.target.value }))}
                  className="flex-1 rounded-md border border-transparent px-1.5 py-1 text-[13px] font-semibold text-ink-900 hover:border-ink-200 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
                />
                <button
                  type="button"
                  onClick={() => removePalette(pl.id)}
                  aria-label="Delete palette"
                  className="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {pl.swatches.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s.id === selected ? null : s.id)}
                    title={s.name ?? s.hex ?? 'Swatch'}
                    className={
                      'h-9 w-9 rounded-md border transition-all ' +
                      (selected === s.id
                        ? 'border-pink-500 ring-2 ring-pink-500/25'
                        : 'border-ink-300 hover:border-ink-500')
                    }
                    style={{
                      background: s.kind === 'GRADIENT' ? gradientCss(s.gradient) : s.hex ?? '#fff',
                    }}
                  >
                    <span className="sr-only">{s.name ?? s.hex ?? 'Swatch'}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleAddSwatch(pl.id)}
                  aria-label="Add color"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-ink-300 text-ink-400 hover:border-pink-400 hover:text-pink-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {selectedSwatch && pl.swatches.some((s) => s.id === selectedSwatch.id) && (
                <SwatchEditor
                  swatch={selectedSwatch}
                  onPatch={(patch) => patchSwatch(selectedSwatch.id, patch)}
                  onPatchLocal={(patch) => patchSwatch(selectedSwatch.id, patch, false)}
                  onClose={() => setSelected(null)}
                  onDelete={() => deleteSwatch(selectedSwatch.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function SwatchEditor({
  swatch,
  onPatch,
  onPatchLocal,
  onClose,
  onDelete,
}: {
  swatch: SwatchState
  onPatch: (patch: Partial<SwatchState>) => void
  onPatchLocal: (patch: Partial<SwatchState>) => void
  onClose: () => void
  onDelete: () => void
}) {
  const isGradient = swatch.kind === 'GRADIENT'

  function setType(kind: 'SOLID' | 'GRADIENT') {
    if (kind === swatch.kind) return
    if (kind === 'GRADIENT') {
      const base = swatch.hex && HEX.test(swatch.hex) ? swatch.hex : '#FF2E63'
      onPatch({
        kind: 'GRADIENT',
        gradient: { angle: 90, stops: [{ color: base, pos: 0 }, { color: '#B5FF3D', pos: 100 }] },
      })
    } else {
      onPatch({ kind: 'SOLID' })
    }
  }

  function setStop(idx: number, color: string) {
    const g = swatch.gradient ?? { angle: 90, stops: [{ color: '#FF2E63', pos: 0 }, { color: '#B5FF3D', pos: 100 }] }
    const stops = g.stops.map((s, i) => (i === idx ? { ...s, color } : s))
    onPatch({ gradient: { ...g, stops } })
  }
  function setAngle(angle: number, persist = false) {
    const g = swatch.gradient ?? { angle: 90, stops: [{ color: '#FF2E63', pos: 0 }, { color: '#B5FF3D', pos: 100 }] }
    const next = { ...g, angle }
    ;(persist ? onPatch : onPatchLocal)({ gradient: next })
  }

  return (
    <div className="mt-3 rounded-md border border-ink-200 bg-ink-50/60 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="inline-flex rounded-md border border-ink-300 bg-white p-0.5">
          {(['SOLID', 'GRADIENT'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className={
                'rounded px-2.5 py-1 text-[11.5px] font-semibold transition-colors ' +
                (swatch.kind === k ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900')
              }
            >
              {k === 'SOLID' ? 'Solid' : 'Gradient'}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-400 hover:text-ink-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Color controls */}
      {!isGradient ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={swatch.hex && HEX.test(swatch.hex) ? swatch.hex : '#FF2E63'}
            onChange={(e) => onPatch({ hex: e.target.value })}
            className="h-9 w-10 cursor-pointer rounded border border-ink-300 bg-white"
            aria-label="Pick color"
          />
          <input
            type="text"
            value={swatch.hex ?? ''}
            onChange={(e) => onPatchLocal({ hex: e.target.value })}
            onBlur={(e) => HEX.test(e.target.value) && onPatch({ hex: e.target.value })}
            placeholder="#FF2E63"
            spellCheck={false}
            className="h-9 w-28 rounded-md border border-ink-300 px-2 font-mono text-[12.5px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {(swatch.gradient?.stops ?? []).slice(0, 2).map((s, i) => (
              <input
                key={i}
                type="color"
                value={HEX.test(s.color) ? s.color : '#FF2E63'}
                onChange={(e) => setStop(i, e.target.value)}
                className="h-9 w-10 cursor-pointer rounded border border-ink-300 bg-white"
                aria-label={`Gradient stop ${i + 1}`}
              />
            ))}
            <div className="flex items-center gap-1.5">
              <label className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Angle</label>
              <input
                type="range"
                min={0}
                max={360}
                value={swatch.gradient?.angle ?? 90}
                onChange={(e) => setAngle(Number(e.target.value))}
                onPointerUp={(e) => setAngle(Number((e.target as HTMLInputElement).value), true)}
                onBlur={(e) => setAngle(Number(e.target.value), true)}
                className="w-24"
              />
              <span className="w-9 text-[11px] tabular-nums text-ink-600">{swatch.gradient?.angle ?? 90}°</span>
            </div>
          </div>
          <div className="h-7 rounded-md border border-ink-200" style={{ background: gradientCss(swatch.gradient) }} />
        </div>
      )}

      {/* Name */}
      <div className="mt-3">
        <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Name</span>
        <input
          type="text"
          value={swatch.name ?? ''}
          onChange={(e) => onPatchLocal({ name: e.target.value || null })}
          onBlur={(e) => onPatch({ name: e.target.value || null })}
          placeholder="e.g. Sunrise"
          className="h-9 w-full rounded-md border border-ink-300 px-2 text-[13px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
        />
      </div>

      {/* Print reference: CMYK + Pantone */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
            CMYK <span className="font-normal normal-case text-ink-400">· print ref</span>
          </span>
          <div className="grid grid-cols-4 gap-1">
            {(['cmykC', 'cmykM', 'cmykY', 'cmykK'] as const).map((k) => (
              <input
                key={k}
                type="number"
                min={0}
                max={100}
                value={swatch[k] ?? ''}
                onChange={(e) => onPatchLocal({ [k]: e.target.value === '' ? null : Number(e.target.value) } as Partial<SwatchState>)}
                onBlur={(e) => onPatch({ [k]: e.target.value === '' ? null : Number(e.target.value) } as Partial<SwatchState>)}
                placeholder={k.slice(-1)}
                className="h-9 w-full rounded-md border border-ink-300 px-1 text-center text-[12px] tabular-nums focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
              />
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Pantone ref</span>
          <input
            type="text"
            value={swatch.pantone ?? ''}
            onChange={(e) => onPatchLocal({ pantone: e.target.value || null })}
            onBlur={(e) => onPatch({ pantone: e.target.value || null })}
            placeholder="PANTONE 200 C"
            className="h-9 w-full rounded-md border border-ink-300 px-2 text-[12.5px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
          />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-danger-600 hover:text-danger-700"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove color
        </button>
      </div>
    </div>
  )
}
