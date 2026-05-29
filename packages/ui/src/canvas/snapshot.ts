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
 */
export function snapshotCanvasAsPng(
  canvas: FabricCanvas,
  opts: SnapshotOpts = {},
): string {
  return canvas.toDataURL({
    format: 'png',
    multiplier: opts.multiplier ?? 1,
    quality: opts.quality ?? 1,
  })
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
  const multiplier = args.multiplier ?? 1
  const bleedPx = dieCut.bleedMm * pxPerMm
  const widthPx = dieCut.widthMm * pxPerMm
  const heightPx = dieCut.heightMm * pxPerMm
  return canvas.toDataURL({
    format: 'png',
    multiplier,
    quality: 1,
    left: bleedPx,
    top: bleedPx,
    width: widthPx,
    height: heightPx,
  })
}
