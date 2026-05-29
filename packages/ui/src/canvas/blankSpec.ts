'use client'

// Blank spec downloads (DS-67b).
//
// Generates "starter file" downloads from a die-cut spec so creators
// can hand the dimensions to an external designer or import into
// Illustrator before bringing the result back to iLaunchify. Mirrors
// the Vistaprint "Download a blank design file" affordance.
//
// Two flavors:
//   generateBlankPdfSpec — jspdf, true-to-mm page with bleed/trim/safe
//                          guide lines + dimension annotations.
//   generateBlankSvgSpec — vector SVG with the same guide overlay,
//                          easy for Illustrator import.

import type { DieCutSpec } from './types'

interface JsPdfInstance {
  setProperty(name: string, value: string): void
  setLineWidth(w: number): void
  setDrawColor(r: number, g: number, b: number): void
  setTextColor(r: number, g: number, b: number): void
  setFontSize(s: number): void
  setLineDashPattern(pattern: number[], phase: number): void
  rect(x: number, y: number, w: number, h: number): void
  text(s: string, x: number, y: number): void
  output(type: 'blob'): Blob
}
type JsPdfCtor = new (opts: {
  orientation: 'p' | 'l'
  unit: 'mm'
  format: [number, number]
  compress: boolean
}) => JsPdfInstance

const MM_TO_IN = 1 / 25.4

/** Returns a Blob (application/pdf) with the spec page. */
export async function generateBlankPdfSpec(dieCut: DieCutSpec): Promise<Blob> {
  const moduleSpec = 'jspdf'
  const mod = (await import(/* webpackChunkName: "jspdf" */ moduleSpec)) as {
    jsPDF: JsPdfCtor
  }

  const totalW = dieCut.widthMm + 2 * dieCut.bleedMm
  const totalH = dieCut.heightMm + 2 * dieCut.bleedMm
  const orientation: 'p' | 'l' = totalW > totalH ? 'l' : 'p'

  const pdf = new mod.jsPDF({
    orientation,
    unit: 'mm',
    format: [totalW, totalH],
    compress: true,
  })

  pdf.setProperty('title', `${dieCut.name} — blank spec`)
  pdf.setProperty('creator', 'iLaunchify Design Studio')

  // ---- Bleed line (outer rect) ----
  pdf.setLineWidth(0.15)
  pdf.setDrawColor(220, 53, 69) // red
  pdf.setLineDashPattern([2, 1], 0)
  pdf.rect(0, 0, totalW, totalH)

  // ---- Trim line ----
  pdf.setLineDashPattern([], 0)
  pdf.setDrawColor(0, 0, 0)
  pdf.rect(dieCut.bleedMm, dieCut.bleedMm, dieCut.widthMm, dieCut.heightMm)

  // ---- Safe area ----
  pdf.setLineDashPattern([1, 1], 0)
  pdf.setDrawColor(13, 110, 253) // blue
  const safeMargin = dieCut.bleedMm + dieCut.safeAreaMm
  pdf.rect(
    safeMargin,
    safeMargin,
    dieCut.widthMm - 2 * dieCut.safeAreaMm,
    dieCut.heightMm - 2 * dieCut.safeAreaMm,
  )

  // ---- Dimension annotation ----
  pdf.setLineDashPattern([], 0)
  pdf.setTextColor(60, 60, 60)
  pdf.setFontSize(8)
  pdf.text(`${dieCut.name}`, dieCut.bleedMm + 2, dieCut.bleedMm + 4)
  pdf.text(
    `Trim ${dieCut.widthMm.toFixed(1)} × ${dieCut.heightMm.toFixed(1)} mm  •  Bleed ${dieCut.bleedMm} mm  •  Safe ${dieCut.safeAreaMm} mm`,
    dieCut.bleedMm + 2,
    dieCut.bleedMm + 8,
  )

  return pdf.output('blob')
}

/**
 * Returns a Blob (image/svg+xml) with the same overlay as the PDF.
 * Designed for Illustrator / Figma import; the SVG uses px units mapped
 * 1:1 to mm via the viewBox (1mm = 1 user unit).
 */
export function generateBlankSvgSpec(dieCut: DieCutSpec): Blob {
  const totalW = dieCut.widthMm + 2 * dieCut.bleedMm
  const totalH = dieCut.heightMm + 2 * dieCut.bleedMm
  const trimX = dieCut.bleedMm
  const trimY = dieCut.bleedMm
  const trimW = dieCut.widthMm
  const trimH = dieCut.heightMm
  const safeMargin = dieCut.bleedMm + dieCut.safeAreaMm
  const safeW = dieCut.widthMm - 2 * dieCut.safeAreaMm
  const safeH = dieCut.heightMm - 2 * dieCut.safeAreaMm

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${totalW} ${totalH}"
     width="${totalW}mm" height="${totalH}mm">
  <title>${dieCut.name} — blank spec</title>
  <desc>Trim ${dieCut.widthMm.toFixed(1)} x ${dieCut.heightMm.toFixed(1)} mm. Bleed ${dieCut.bleedMm} mm. Safe ${dieCut.safeAreaMm} mm.</desc>
  <!-- Bleed (red dashed) -->
  <rect x="0" y="0" width="${totalW}" height="${totalH}"
        fill="none" stroke="#DC3545" stroke-width="0.15"
        stroke-dasharray="2 1"/>
  <!-- Trim (solid black) -->
  <rect x="${trimX}" y="${trimY}" width="${trimW}" height="${trimH}"
        fill="white" stroke="#000000" stroke-width="0.15"/>
  <!-- Safe area (blue dotted) -->
  <rect x="${safeMargin}" y="${safeMargin}" width="${safeW}" height="${safeH}"
        fill="none" stroke="#0D6EFD" stroke-width="0.15"
        stroke-dasharray="1 1"/>
  <!-- Labels -->
  <g font-family="Helvetica, Arial, sans-serif" font-size="2" fill="#3c3c3c">
    <text x="${trimX + 1}" y="${trimY + 3}">${dieCut.name}</text>
    <text x="${trimX + 1}" y="${trimY + 6}">Trim ${dieCut.widthMm.toFixed(1)} × ${dieCut.heightMm.toFixed(1)} mm</text>
    <text x="${trimX + 1}" y="${trimY + 9}">Bleed ${dieCut.bleedMm} mm · Safe ${dieCut.safeAreaMm} mm</text>
  </g>
</svg>
`
  return new Blob([svg], { type: 'image/svg+xml' })
}

/** Human-readable inches string for a millimeter value. 1.88" / 3.62". */
export function mmToInchesStr(mm: number, decimals = 2): string {
  return `${(mm * MM_TO_IN).toFixed(decimals)}"`
}
