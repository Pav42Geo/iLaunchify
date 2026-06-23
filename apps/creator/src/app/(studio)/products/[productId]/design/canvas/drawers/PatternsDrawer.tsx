'use client'

// Track D — Patterns drawer. Applies a seamless background pattern (recolored
// to a brand swatch) to the label canvas. Shares the canvas background slot with
// BackgroundDrawer, so picking a solid color there clears the pattern + vice
// versa (last write wins).

import * as React from 'react'
import { Ban } from 'lucide-react'
import {
  PATTERN_TILES,
  patternTileDataUrl,
  setCanvasPatternBackground,
  clearCanvasPattern,
  type FabricCanvas,
  type BrandCanvasAssets,
} from '@ilaunchify/ui'

const STAPLES = ['#94908A', '#0F1116', '#FF2E63', '#B5FF3D', '#10B981', '#7C3AED', '#F97316', '#38BDF8']

export function PatternsDrawer({
  canvas,
  brandAssets,
}: {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
}) {
  const brandSwatches = Array.from(
    new Set(
      [
        brandAssets.colorPrimary,
        brandAssets.colorSecondary,
        brandAssets.colorAccent,
        ...brandAssets.extraSwatches,
      ].filter((c): c is string => Boolean(c)),
    ),
  )
  const swatches = Array.from(new Set([...brandSwatches, ...STAPLES]))
  const [color, setColor] = React.useState(brandSwatches[0] ?? '#94908A')

  function apply(tileSvg: string) {
    if (canvas) void setCanvasPatternBackground(canvas, tileSvg, color)
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-[1.45] text-ink-500">
        Seamless background patterns, recolored to your brand. Tap a pattern to apply it to the label.
      </p>

      {/* Color row */}
      <section>
        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">
          Pattern color
        </div>
        <div className="flex flex-wrap gap-1.5">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              title={c}
              style={{ backgroundColor: c }}
              className={
                'h-6 w-6 rounded-full border transition-transform ' +
                (color === c
                  ? 'border-ink-900 ring-2 ring-pink-300 scale-110'
                  : 'border-ink-200 hover:scale-105')
              }
            />
          ))}
        </div>
      </section>

      {/* Pattern grid */}
      <section>
        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">
          Patterns
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PATTERN_TILES.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => apply(tile.svg)}
              disabled={!canvas}
              title={tile.label}
              className="h-16 overflow-hidden rounded-md border border-ink-200 hover:border-pink-400 disabled:opacity-50"
              style={{
                backgroundImage: `url("${patternTileDataUrl(tile.svg, color)}")`,
                backgroundRepeat: 'repeat',
              }}
            >
              <span className="sr-only">{tile.label}</span>
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => canvas && clearCanvasPattern(canvas)}
        disabled={!canvas}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] text-ink-600 hover:bg-ink-50 disabled:opacity-50"
      >
        <Ban className="h-3.5 w-3.5" /> Remove pattern
      </button>
    </div>
  )
}
