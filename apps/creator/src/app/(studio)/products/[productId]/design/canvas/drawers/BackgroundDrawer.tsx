'use client'

// BackgroundDrawer — left-rail Background tool drawer.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #7:
//   - Brand swatches pinned at top
//   - Curated label backgrounds (cream / off-white / black / pink / mint)
//   - Free-form hex color picker
//   - Reset to plain white

import * as React from 'react'
import { Eraser, PaintBucket } from 'lucide-react'
import {
  setCanvasBackground,
  type BrandCanvasAssets,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
}

const STAPLE_SWATCHES = [
  '#FFFFFF', // pure white
  '#FAF7F0', // cream
  '#F4F1EA', // off-white
  '#0F1116', // ink black
  '#FF2E63', // brand pink
  '#B5FF3D', // neon green
  '#FFE9F0', // pink wash
  '#E8F5E1', // mint wash
]

export function BackgroundDrawer({ canvas, brandAssets }: Props) {
  const [current, setCurrent] = React.useState<string>(
    canvas?.backgroundColor as string | undefined ?? '#FFFFFF',
  )

  // Brand swatches: dedupe primary/secondary/accent + extraSwatches.
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

  function apply(color: string) {
    if (!canvas) return
    setCanvasBackground(canvas, color)
    setCurrent(color)
  }

  return (
    <div className="space-y-6">
      {/* Brand swatches */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Brand swatches
            <span className="ml-1.5 text-pink-700 normal-case font-normal tracking-normal">
              · {brandAssets.brandName}
            </span>
          </div>
        </div>

        {brandSwatches.length === 0 ? (
          <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-4 text-center">
            <PaintBucket className="mx-auto h-4 w-4 text-ink-400" />
            <p className="mt-1.5 text-xs text-ink-700 font-medium">
              No brand colors set
            </p>
            <p className="mt-0.5 text-[11px] text-ink-500">
              Add up to 5 hex values in{' '}
              <a
                href={`/brands/${brandAssets.brandId}/assets`}
                className="text-pink-700 font-semibold hover:text-pink-600"
              >
                Brand assets
              </a>{' '}
              to pin them here.
            </p>
          </div>
        ) : (
          <SwatchGrid swatches={brandSwatches} current={current} onPick={apply} />
        )}
      </section>

      {/* Staples */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Label staples
        </div>
        <SwatchGrid swatches={STAPLE_SWATCHES} current={current} onPick={apply} />
      </section>

      {/* Custom hex */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Custom
        </div>
        <div className="flex items-center gap-2">
          <label
            className="relative w-9 h-9 rounded-md border border-ink-300 overflow-hidden cursor-pointer flex-shrink-0"
            title="Pick a color"
          >
            <input
              type="color"
              value={current}
              onChange={(e) => apply(e.target.value)}
              className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
            />
            <span
              className="absolute inset-1 rounded"
              style={{ backgroundColor: current }}
            />
          </label>
          <input
            type="text"
            value={current}
            onChange={(e) => {
              const v = e.target.value
              setCurrent(v)
              if (/^#[0-9A-Fa-f]{6}$/.test(v)) apply(v)
            }}
            spellCheck={false}
            placeholder="#FFFFFF"
            className="flex-1 h-9 px-3 text-sm font-mono tabular-nums border border-ink-300 rounded-md focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15"
          />
          <button
            type="button"
            onClick={() => apply('#FFFFFF')}
            disabled={!canvas || current.toUpperCase() === '#FFFFFF'}
            aria-label="Reset to white"
            className="h-9 px-3 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-700 hover:text-ink-900 hover:bg-ink-100 rounded-md disabled:opacity-40 transition-colors"
          >
            <Eraser className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-500">
          Sets the label background — what prints if no other shape covers it.
        </p>
      </section>
    </div>
  )
}

function SwatchGrid({
  swatches,
  current,
  onPick,
}: {
  swatches: string[]
  current: string
  onPick: (color: string) => void
}) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {swatches.map((hex) => {
        const isActive = current.toUpperCase() === hex.toUpperCase()
        return (
          <button
            key={hex}
            type="button"
            onClick={() => onPick(hex)}
            aria-label={`Background ${hex}`}
            title={hex}
            className={
              'relative aspect-square rounded-md border transition-all ' +
              (isActive
                ? 'border-pink-500 ring-2 ring-pink-500/20 scale-105'
                : 'border-ink-200 hover:border-ink-400')
            }
            style={{ backgroundColor: hex }}
          >
            {isActive && (
              <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow text-[12px] font-bold">
                ✓
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
