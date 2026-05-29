'use client'

// Canvas snapshot helpers (DS-63a).
//
// Two flavors:
//
//   snapshotCanvasAsPng({ multiplier })
//     Full canvas PNG including the bleed area. This is what the print
//     pipeline ultimately consumes.
//
//   snapshotCanvasTrimmed({ canvas, dieCut, pxPerMm, multiplier })
//     The TRIM-cropped PNG — just the visible label without the bleed
//     border. This is what the mockup viewer wants to show creators
//     when previewing the design on a product shape: bleed is print-
//     production overhang the consumer never sees.
//
// Fabric's toDataURL excludes selection handles + active borders by
// default (it temporarily discards the active object during rendering),
// so we get a clean export without needing to call discardActiveObject
// ourselves.

import type { DieCutSpec, FabricCanvas } from './types'

export interface SnapshotOpts {
  /** Pixel multiplier — 1 = canvas-resolution; 2 = retina. */
  multiplier?: number
  /** PNG quality 0-1. */
  quality?: number
}

/**
 * Full-canvas PNG including bleed. Returns a data URL.
 *
 * Returns an empty string when the canvas is in a disposed state —
 * fabric.toDataURL internally calls clear() and would otherwise
 * crash on a contextContainer that's been nulled.
 */
export function snapshotCanvasAsPng(
  canvas: FabricCanvas,
  opts: SnapshotOpts = {},
): string {
  if (isCanvasDisposed(canvas)) return ''
  try {
    return canvas.toDataURL({
      format: 'png',
      multiplier: opts.multiplier ?? 1,
      quality: opts.quality ?? 1,
    })
  } catch (err) {
    console.warn('[snapshot] toDataURL failed:', err)
    return ''
  }
}

/**
 * TRIM-cropped PNG — the visible label only, without the bleed margin.
 * Used by the mockup viewer (DS-63) so the preview matches what the
 * consumer actually sees on the product.
 *
 * The bleed is `dieCut.bleedMm` on every side; we crop to the inner
 * rectangle starting at (bleedMm, bleedMm) in canvas-px coordinates.
 */
export function snapshotCanvasTrimmed(args: {
  canvas: FabricCanvas
  dieCut: DieCutSpec
  pxPerMm: number
  multiplier?: number
}): string {
  const { canvas, dieCut, pxPerMm } = args
  if (isCanvasDisposed(canvas)) return ''
  const multiplier = args.multiplier ?? 1
  const bleedPx = dieCut.bleedMm * pxPerMm
  const widthPx = dieCut.widthMm * pxPerMm
  const heightPx = dieCut.heightMm * pxPerMm
  try {
    return canvas.toDataURL({
      format: 'png',
      multiplier,
      quality: 1,
      left: bleedPx,
      top: bleedPx,
      width: widthPx,
      height: heightPx,
    })
  } catch (err) {
    console.warn('[snapshot] toDataURL failed:', err)
    return ''
  }
}

/**
 * True if the fabric canvas is in a disposed state. Reads the v6
 * `disposed` flag and falls back to checking `contextContainer`, which
 * is what fabric's clear() depends on.
 */
function isCanvasDisposed(canvas: FabricCanvas): boolean {
  const c = canvas as unknown as {
    disposed?: boolean
    contextContainer?: unknown
  }
  return !!c.disposed || c.contextContainer == null
}
