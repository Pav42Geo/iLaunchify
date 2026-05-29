'use client'

// ImageToolbar — floating editor for image-shaped objects (brand-logo,
// library uploads, QR / barcode / internal-SKU). Per the DS-53 pattern.
//
// Controls: opacity slider, flip horizontal, flip vertical, deselect.
// Doesn't replace the Layers drawer for stacking — that's still where
// you reorder, hide, and delete.

import * as React from 'react'
import { X, FlipHorizontal2, FlipVertical2 } from 'lucide-react'
import type { FabricCanvas, FabricObject } from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  active: FabricObject
}

export function ImageToolbar({ canvas, active }: Props) {
  const obj = active as unknown as {
    opacity?: number
    flipX?: boolean
    flipY?: boolean
    set: (k: string | object, v?: unknown) => void
  }

  const opacity = Math.round((obj.opacity ?? 1) * 100)
  const flipX = !!obj.flipX
  const flipY = !!obj.flipY

  function commit(props: Record<string, unknown>) {
    if (!canvas) return
    obj.set(props)
    canvas.fire('object:modified', { target: active })
    canvas.requestRenderAll()
  }

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1.5 shadow-lg">
        {/* Opacity */}
        <div className="flex items-center gap-1.5 px-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Opacity
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={opacity}
            onChange={(e) => commit({ opacity: Number(e.target.value) / 100 })}
            className="w-24 accent-pink-500"
            aria-label="Opacity"
          />
          <span className="text-[11px] font-mono tabular-nums text-ink-700 min-w-[28px] text-right">
            {opacity}%
          </span>
        </div>

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Flips */}
        <button
          type="button"
          aria-pressed={flipX}
          aria-label="Flip horizontal"
          onClick={() => commit({ flipX: !flipX })}
          className={
            'rounded p-1.5 transition-colors ' +
            (flipX
              ? 'bg-ink-900 text-white hover:bg-black'
              : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900')
          }
        >
          <FlipHorizontal2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-pressed={flipY}
          aria-label="Flip vertical"
          onClick={() => commit({ flipY: !flipY })}
          className={
            'rounded p-1.5 transition-colors ' +
            (flipY
              ? 'bg-ink-900 text-white hover:bg-black'
              : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900')
          }
        >
          <FlipVertical2 className="h-3.5 w-3.5" />
        </button>

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Close */}
        <button
          type="button"
          aria-label="Deselect"
          onClick={() => {
            if (!canvas) return
            canvas.discardActiveObject()
            canvas.requestRenderAll()
          }}
          className="rounded p-1.5 text-ink-500 hover:text-ink-900 hover:bg-ink-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
