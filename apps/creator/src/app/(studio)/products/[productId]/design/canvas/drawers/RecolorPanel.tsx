'use client'

// RecolorPanel — Brand Kit V2 Phase 3b (docs/BRAND_TEMPLATE_THEMING.md). Agency-tier
// creators re-theme the whole live design with a saved brand palette in one move:
// scan the canvas for its vector colors, auto-map them onto the palette (override any
// row), and apply. Images and locked/regulated panels (Nutrition Facts, barcodes) are
// left untouched by the recolor engine (skipLocked). The applied result autosaves, so
// it's reversible via Version History; "Save as template" keeps the new combination.

import * as React from 'react'
import { Wand2, ArrowRight, Shuffle, Lock, Unlock } from 'lucide-react'
import {
  collectCanvasColors,
  recolorCanvasJson,
  autoMapColors,
  shuffleColorMap,
  normalizeHex,
  CANVAS_PROPERTIES_TO_INCLUDE,
  type FabricCanvas,
  type BrandCanvasPalette,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  palettes: BrandCanvasPalette[]
  onSaveAsTemplate: () => void
}

const labelClass = 'text-[12px] font-bold uppercase tracking-wider text-ink-700'

export function RecolorPanel({ canvas, palettes, onSaveAsTemplate }: Props) {
  const [colors, setColors] = React.useState<{ hex: string; count: number }[] | null>(null)
  const [paletteId, setPaletteId] = React.useState<string>('')
  const [map, setMap] = React.useState<Record<string, string>>({})
  const [locked, setLocked] = React.useState<Set<string>>(new Set())
  const [applied, setApplied] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  // Palettes reduced to their SOLID hex stops (gradients can't drive a remap).
  const usable = React.useMemo(
    () =>
      palettes
        .map((p) => ({
          id: p.id,
          name: p.name,
          hexes: Array.from(
            new Set(
              p.swatches
                .filter((s) => s.kind === 'SOLID' && s.hex)
                .map((s) => normalizeHex(s.hex as string) ?? (s.hex as string)),
            ),
          ),
        }))
        .filter((p) => p.hexes.length > 0),
    [palettes],
  )

  const activePalette = usable.find((p) => p.id === paletteId) ?? null

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3200)
  }

  function serialize(): string | null {
    if (!canvas) return null
    const toObj = canvas.toObject as (p?: string[]) => object
    return JSON.stringify(toObj.call(canvas, Array.from(CANVAS_PROPERTIES_TO_INCLUDE)))
  }

  function pickPalette(id: string, cols = colors) {
    setPaletteId(id)
    const pal = usable.find((p) => p.id === id)
    if (pal && cols) {
      const auto = autoMapColors(cols.map((c) => c.hex), pal.hexes)
      // Keep locked color groups on their current target.
      setMap((prev) => {
        const next = { ...auto }
        for (const key of locked) if (prev[key]) next[key] = prev[key]
        return next
      })
    }
  }

  function shuffle() {
    if (!colors || !activePalette) return
    const lockedMap: Record<string, string> = {}
    for (const key of locked) if (map[key]) lockedMap[key] = map[key] as string
    setMap(shuffleColorMap(colors.map((c) => c.hex), activePalette.hexes, { locked: lockedMap }))
  }

  function toggleLock(key: string) {
    setLocked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function scan() {
    const json = serialize()
    if (!json) return
    const found = collectCanvasColors(json, { skipLocked: true })
    setColors(found)
    setLocked(new Set())
    setApplied(false)
    if (found.length === 0) {
      flash('No recolorable colors found on this design.')
      return
    }
    pickPalette(paletteId || usable[0]?.id || '', found)
  }

  function apply() {
    const json = serialize()
    if (!json || !canvas) return
    const out = recolorCanvasJson(json, map, { skipLocked: true })
    const c = canvas as unknown as {
      loadFromJSON: (j: unknown, cb?: () => void) => void
      requestRenderAll: () => void
    }
    try {
      c.loadFromJSON(JSON.parse(out), () => c.requestRenderAll())
      setApplied(true)
      flash('Recolored. Saved to version history — undo from there if needed.')
    } catch {
      flash('That recolor could not be applied.')
    }
  }

  if (usable.length === 0) {
    return (
      <section>
        <div className={labelClass + ' mb-2 flex items-center gap-1.5'}>
          <Wand2 className="h-3 w-3" /> Recolor with palette
        </div>
        <p className="text-[11px] text-ink-500">
          Save a color palette in <span className="font-semibold text-ink-700">Edit kit → Palettes</span> to recolor
          this design with one tap.
        </p>
      </section>
    )
  }

  return (
    <section>
      <div className={labelClass + ' mb-2 flex items-center gap-1.5'}>
        <Wand2 className="h-3 w-3" /> Recolor with palette
        <span className="rounded bg-ink-900 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
          Agency
        </span>
      </div>

      {notice && (
        <div className="mb-2 rounded-md border border-pink-200 bg-pink-50 px-2.5 py-1.5 text-[11px] font-medium text-pink-900">
          {notice}
        </div>
      )}

      {colors === null ? (
        <button
          type="button"
          onClick={scan}
          disabled={!canvas}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-300 px-3 py-2 text-[12.5px] font-semibold text-ink-800 transition-colors hover:bg-ink-50 disabled:opacity-50"
        >
          <Wand2 className="h-3.5 w-3.5" /> Scan design colors
        </button>
      ) : (
        <div className="space-y-2.5">
          {/* Palette selector + Shuffle */}
          <div className="flex gap-2">
            <select
              value={paletteId}
              onChange={(e) => pickPalette(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.hexes.length})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={shuffle}
              title="Shuffle — re-mix the palette across the design (locked colors stay)"
              className="flex flex-shrink-0 items-center gap-1 rounded-md border border-ink-300 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 transition-colors hover:bg-ink-50"
            >
              <Shuffle className="h-3.5 w-3.5" /> Shuffle
            </button>
          </div>

          {/* Color mapping rows */}
          <div className="space-y-2 rounded-lg border border-ink-200 p-2">
            {colors.map((c) => {
              const key = normalizeHex(c.hex) ?? c.hex
              const target = map[key] ?? key
              const isLocked = locked.has(key)
              return (
                <div key={key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleLock(key)}
                    title={isLocked ? 'Unlock this color' : 'Lock this color (kept on apply + shuffle)'}
                    className={
                      'flex-shrink-0 rounded p-0.5 ' +
                      (isLocked ? 'text-pink-600' : 'text-ink-300 hover:text-ink-500')
                    }
                  >
                    {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                  <span
                    title={c.hex}
                    className="h-5 w-5 flex-shrink-0 rounded border border-ink-200"
                    style={{ backgroundColor: c.hex }}
                  />
                  <ArrowRight className="h-3 w-3 flex-shrink-0 text-ink-400" />
                  <div className={'flex flex-wrap gap-1' + (isLocked ? ' pointer-events-none opacity-40' : '')}>
                    <button
                      type="button"
                      onClick={() => setMap((m) => ({ ...m, [key]: key }))}
                      title="Keep original"
                      className={
                        'h-5 w-5 rounded border text-[9px] font-bold text-ink-500 ' +
                        (target === key ? 'border-pink-500 ring-2 ring-pink-500/25' : 'border-ink-300 hover:border-ink-400')
                      }
                    >
                      ✕
                    </button>
                    {(activePalette?.hexes ?? []).map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setMap((m) => ({ ...m, [key]: h }))}
                        title={h}
                        className={
                          'h-5 w-5 rounded border ' +
                          (target === h ? 'border-pink-500 ring-2 ring-pink-500/25' : 'border-ink-200 hover:border-ink-400')
                        }
                        style={{ backgroundColor: h }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-ink-400">
            Images and regulated panels (Nutrition Facts, barcodes) stay unchanged.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={apply}
              disabled={!canvas}
              className="flex-1 rounded-md bg-ink-900 px-3 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:opacity-50"
            >
              Apply recolor
            </button>
            <button
              type="button"
              onClick={() => {
                setColors(null)
                setApplied(false)
              }}
              className="rounded-md border border-ink-300 px-3 py-2 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"
            >
              Reset
            </button>
          </div>

          {applied && (
            <button
              type="button"
              onClick={onSaveAsTemplate}
              className="w-full rounded-md border border-success-300 bg-success-50/60 px-3 py-2 text-[12.5px] font-semibold text-pink-700 transition-colors hover:bg-pink-50"
            >
              Save as new template
            </button>
          )}
        </div>
      )}
    </section>
  )
}
