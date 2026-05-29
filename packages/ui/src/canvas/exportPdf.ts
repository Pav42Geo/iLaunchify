'use client'

// Print-ready PDF export (DS-64a).
//
// Generates a PDF at the actual physical dimensions of the die-cut
// (in mm). The page size IS the artwork size — no scaling, no margins
// — so the print partner can drop it straight into their imposition
// flow.
//
// V1 limitations to call out:
//
//   - RGB only. jsPDF embeds the PNG as-is; CMYK conversion happens
//     at the printer's RIP. That's the standard print-shop workflow
//     for digital presses; a future export track for offset presses
//     would need an ICC profile + libpng/Sharp conversion path
//     (V1.5+).
//
//   - Raster, not vector text. Fabric.js text rasterizes when we
//     snapshot the canvas. Acceptable for V1 because (a) we control
//     the DPI (300 default = print-quality) and (b) the WeasyPrint
//     side of the compliance label render is the authoritative
//     vector-text path for the nutrition panel specifically.
//
//   - Single page per design. Multi-surface SKUs land later (V2 per
//     docs/DESIGN_STUDIO_REBUILD.md).
//
// What we DO get right in V1:
//   - mm-accurate page size including or excluding bleed per opts
//   - portrait / landscape inferred from die-cut dimensions
//   - 300 DPI default (print-shop minimum) with 150 / 600 alternatives
//   - PDF metadata stamped with brand + product name + die-cut name

import type { DieCutSpec, FabricCanvas } from './types'

// Minimal subset of the jspdf API we use. Defined inline so the module
// type-checks even when `pnpm install` hasn't run jspdf yet. The real
// jspdf types take over at runtime via dynamic import (below).
interface JsPdfInstance {
  setProperty(name: string, value: string): void
  addImage(
    data: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void
  output(type: 'blob'): Blob
}
type JsPdfCtor = new (opts: {
  orientation: 'p' | 'l'
  unit: 'mm'
  format: [number, number]
  compress: boolean
}) => JsPdfInstance

export interface GeneratePdfOpts {
  canvas: FabricCanvas
  dieCut: DieCutSpec
  /** Canvas px per mm (matches the value used when the Stage was sized). */
  pxPerMm: number
  /**
   * Include the bleed margin. Printer wants `true` (the trim line
   * lives inside the bleed); a creator-facing proof PDF can use
   * `false` for a visible-area-only export.
   */
  includeBleed: boolean
  /** Embedded image DPI. Default 300 (print-quality minimum). */
  dpi?: number
  /** Metadata for the PDF info dict. */
  meta?: {
    brandName?: string
    productName?: string
    dieCutName?: string
  }
}

export async function generatePrintReadyPdf(
  opts: GeneratePdfOpts,
): Promise<Blob> {
  const { canvas, dieCut, pxPerMm, includeBleed } = opts
  const dpi = opts.dpi ?? 300

  // Dynamic import — keeps jsPDF (~150 KB) out of the initial canvas
  // bundle and only resolves the module specifier when the user
  // actually triggers an export. The string-via-variable form makes
  // TS not statically resolve it, so the package builds in
  // environments that haven't `pnpm install`ed jspdf yet (the runtime
  // user always has it via @ilaunchify/ui's dependency).
  const moduleSpec = 'jspdf'
  const mod = (await import(/* webpackChunkName: "jspdf" */ moduleSpec)) as {
    jsPDF: JsPdfCtor
  }
  const jsPDF = mod.jsPDF

  // ---- Compute mm dimensions ----
  const widthMm = includeBleed
    ? dieCut.widthMm + 2 * dieCut.bleedMm
    : dieCut.widthMm
  const heightMm = includeBleed
    ? dieCut.heightMm + 2 * dieCut.bleedMm
    : dieCut.heightMm

  // ---- Compute the canvas-snapshot multiplier ----
  // Current canvas resolution: pxPerMm.
  // Target raster resolution: dpi/25.4 px per mm (1 inch = 25.4 mm).
  // multiplier = target / current.
  const targetPxPerMm = dpi / 25.4
  const multiplier = targetPxPerMm / pxPerMm

  // ---- Snapshot the right area ----
  let dataUrl: string
  if (includeBleed) {
    dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier,
      quality: 1,
    })
  } else {
    // Crop out the bleed region — show just the trim.
    const bleedPx = dieCut.bleedMm * pxPerMm
    dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier,
      quality: 1,
      left: bleedPx,
      top: bleedPx,
      width: dieCut.widthMm * pxPerMm,
      height: dieCut.heightMm * pxPerMm,
    })
  }

  // ---- Build the PDF ----
  const orientation: 'p' | 'l' = widthMm > heightMm ? 'l' : 'p'
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: true,
  })

  // Metadata for downstream tooling (Acrobat info dialog, printer
  // imposition software, etc).
  if (opts.meta) {
    if (opts.meta.brandName) pdf.setProperty('author', opts.meta.brandName)
    if (opts.meta.productName) pdf.setProperty('title', opts.meta.productName)
    if (opts.meta.dieCutName) {
      pdf.setProperty(
        'subject',
        `${opts.meta.dieCutName} · ${widthMm.toFixed(1)}×${heightMm.toFixed(1)}mm`,
      )
    }
  }
  pdf.setProperty('creator', 'iLaunchify Design Studio')

  // Add the image at the FULL page size — no margins, no scaling
  // (the PDF page size IS the artwork size).
  pdf.addImage(dataUrl, 'PNG', 0, 0, widthMm, heightMm)

  return pdf.output('blob')
}

/**
 * Suggested filename for the downloaded PDF. Includes brand, product
 * (slugified), and a short timestamp so multiple exports don't collide.
 */
export function suggestedPdfFilename(args: {
  brandName: string
  productName: string
}): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 12) // YYYYMMDDHHmm
  return `${slug(args.brandName)}_${slug(args.productName)}_${stamp}.pdf`
}
