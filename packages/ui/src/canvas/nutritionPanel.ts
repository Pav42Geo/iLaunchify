'use client'

// Nutrition Facts panel — Fabric Group composer.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #2:
//   - FDA Standard vertical or Tabular layout
//   - Customizable ink + bg color
//   - V1 ships with sample/placeholder values; real product nutrition data
//     binds at print/export time via the existing WeasyPrint pipeline
//     (compliance service + label renderer)
//
// Output is a single fabric.Group so the entire panel moves/scales as one
// object. DS-44 Layers + DS-47 auto-save + DS-42 history all work because
// it's a normal Fabric object.

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'
import type { CanvasCustomType } from './objects'

export type NutritionPanelStyle = 'standard' | 'tabular'

export interface NutritionPanelData {
  servingsPerContainer: number | string
  servingSize: string
  calories: number
  /** rows in DV order — the V1 default catches the most common 14 */
  rows: NutritionRow[]
  /** Sub-bullets under "Total Sugars" — "Includes Xg Added Sugars" */
  addedSugarG?: number
  /** Free-text under the panel — typically "* % Daily Value based on…" */
  footnote: string
}

export interface NutritionRow {
  label: string
  /** "0g", "120mg", "1g" — already-formatted unit string */
  value: string
  /** undefined → row prints no DV column (e.g. Total Sugars) */
  dvPercent?: number | null
  /** Indent under parent (Sat Fat under Total Fat) */
  indent?: 1 | 2
  /** Bold the row (Total Fat, Sodium, etc. — major nutrients) */
  bold?: boolean
}

export interface NutritionPanelOpts {
  style?: NutritionPanelStyle
  ink?: string
  /** null or 'transparent' → no fill; the bg rect renders with stroke only if border is on. */
  bg?: string | null
  /** Whether to render the outer border (the bg rect's stroke). Default true. */
  border?: boolean
  /** Width in canvas units. NFR is naturally narrow (~160-220px on label). */
  widthPx?: number
  centerX?: number
  centerY?: number
}

export const SAMPLE_NUTRITION_DATA: NutritionPanelData = {
  servingsPerContainer: 30,
  servingSize: '1 scoop (32g)',
  calories: 120,
  addedSugarG: 0,
  rows: [
    { label: 'Total Fat', value: '1g', dvPercent: 1, bold: true },
    { label: 'Saturated Fat', value: '0g', dvPercent: 0, indent: 1 },
    { label: 'Trans Fat', value: '0g', dvPercent: null, indent: 1 },
    { label: 'Cholesterol', value: '0mg', dvPercent: 0, bold: true },
    { label: 'Sodium', value: '35mg', dvPercent: 2, bold: true },
    { label: 'Total Carbohydrate', value: '4g', dvPercent: 1, bold: true },
    { label: 'Dietary Fiber', value: '1g', dvPercent: 4, indent: 1 },
    { label: 'Total Sugars', value: '0g', dvPercent: null, indent: 1 },
    { label: 'Protein', value: '24g', dvPercent: 48, bold: true },
    { label: 'Vitamin D', value: '0mcg', dvPercent: 0 },
    { label: 'Calcium', value: '140mg', dvPercent: 10 },
    { label: 'Iron', value: '0.5mg', dvPercent: 3 },
    { label: 'Potassium', value: '210mg', dvPercent: 4 },
  ],
  footnote:
    '* The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.',
}

/** Add an FDA-styled Nutrition Facts panel as a Fabric Group at canvas center. */
export async function addNutritionFactsPanel(
  canvas: FabricCanvas,
  data: NutritionPanelData = SAMPLE_NUTRITION_DATA,
  opts: NutritionPanelOpts = {},
): Promise<FabricObject> {
  const ink = opts.ink ?? '#000000'
  const bg = opts.bg === undefined ? '#FFFFFF' : opts.bg // null = transparent
  const border = opts.border ?? true
  const width = opts.widthPx ?? 220

  // Build children. Coordinates are local to the group; positioning happens
  // at the bottom via the group's center.
  const children: fabric.FabricObject[] = []
  const pad = 8
  let y = pad

  // ===== Header =====
  children.push(
    text('Nutrition Facts', 0 + pad, y, {
      fontSize: 22,
      fontWeight: 900,
      fontFamily: 'Helvetica',
      fill: ink,
      width: width - 2 * pad,
    }),
  )
  y += 22 + 3

  children.push(
    text(`${data.servingsPerContainer} servings per container`, pad, y, {
      fontSize: 9,
      fill: ink,
      width: width - 2 * pad,
    }),
  )
  y += 11
  children.push(
    text('Serving size', pad, y, {
      fontSize: 10,
      fontWeight: 700,
      fill: ink,
    }),
  )
  children.push(
    text(data.servingSize, width - pad, y, {
      fontSize: 10,
      fontWeight: 700,
      fill: ink,
      textAlign: 'right',
      originX: 'right',
    }),
  )
  y += 14

  children.push(rule(pad, y, width - pad, 6, ink))
  y += 8

  // ===== Calories =====
  children.push(
    text('Amount Per Serving', pad, y, {
      fontSize: 8,
      fontWeight: 700,
      fill: ink,
    }),
  )
  y += 11
  children.push(
    text('Calories', pad, y, {
      fontSize: 16,
      fontWeight: 900,
      fill: ink,
    }),
  )
  children.push(
    text(String(data.calories), width - pad, y, {
      fontSize: 22,
      fontWeight: 900,
      fill: ink,
      textAlign: 'right',
      originX: 'right',
    }),
  )
  y += 24

  children.push(rule(pad, y, width - pad, 3, ink))
  y += 5

  // ===== DV header =====
  children.push(
    text('% Daily Value*', width - pad, y, {
      fontSize: 8,
      fontWeight: 700,
      fill: ink,
      textAlign: 'right',
      originX: 'right',
    }),
  )
  y += 10

  // ===== Rows =====
  for (const row of data.rows) {
    children.push(rule(pad, y, width - pad, 0.5, ink))
    y += 3
    const indent = (row.indent ?? 0) * 8
    children.push(
      text(`${row.label} ${row.value}`, pad + indent, y, {
        fontSize: 9,
        fontWeight: row.bold ? 700 : 400,
        fill: ink,
      }),
    )
    if (row.dvPercent !== null && row.dvPercent !== undefined) {
      children.push(
        text(`${row.dvPercent}%`, width - pad, y, {
          fontSize: 9,
          fontWeight: 700,
          fill: ink,
          textAlign: 'right',
          originX: 'right',
        }),
      )
    }
    y += 12

    // "Includes Xg Added Sugars" under Total Sugars
    if (row.label === 'Total Sugars' && data.addedSugarG !== undefined) {
      children.push(
        text(
          `   Includes ${data.addedSugarG}g Added Sugars`,
          pad + indent + 8,
          y,
          { fontSize: 9, fontStyle: 'italic', fill: ink },
        ),
      )
      y += 12
    }
  }

  // Thick bottom rule
  children.push(rule(pad, y, width - pad, 6, ink))
  y += 8

  // Footnote
  children.push(
    text(data.footnote, pad, y, {
      fontSize: 7,
      fill: ink,
      width: width - 2 * pad,
      lineHeight: 1.15,
    }),
  )
  y += estimateLines(data.footnote, width - 2 * pad, 7) * 9 + pad

  // ===== Background rect =====
  // bg: null → fully transparent. We still draw the rect so the group has
  // a click target + bounds, but with no fill and optional stroke.
  const bgRect = new fabric.Rect({
    left: 0,
    top: 0,
    width,
    height: y,
    fill: bg ?? undefined,
    stroke: border ? ink : undefined,
    strokeWidth: border ? 1 : 0,
  })
  bgRect.set('customRole', 'nfr-bg')

  // Tag every text child so updateNutritionPanel() can recolor on demand.
  for (const c of children) {
    if ((c as { type?: string }).type === 'textbox' || (c as { type?: string }).type === 'text' || (c as { type?: string }).type === 'i-text') {
      c.set('customRole', 'nfr-text')
    } else if ((c as { type?: string }).type === 'rect') {
      // Inline rules (hairlines, thick separators) — recolor with ink.
      c.set('customRole', 'nfr-rule')
    }
  }

  // ===== Compose group =====
  const group = new fabric.Group([bgRect, ...children], {
    originX: 'center',
    originY: 'center',
    subTargetCheck: false,
  })
  group.set('customType', 'nutrition-panel' satisfies CanvasCustomType)

  // Position at viewport center.
  const vpt = canvas.viewportTransform
  const w = canvas.getWidth()
  const h = canvas.getHeight()
  let cx = opts.centerX ?? w / 2
  let cy = opts.centerY ?? h / 2
  if (vpt && opts.centerX === undefined) {
    cx = (w / 2 - vpt[4]) / vpt[0]
  }
  if (vpt && opts.centerY === undefined) {
    cy = (h / 2 - vpt[5]) / vpt[3]
  }
  group.set({ left: cx, top: cy })

  canvas.add(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
  return group
}

/* ============ helpers ============ */

interface TextOpts {
  fontSize?: number
  fontWeight?: number | string
  fontStyle?: string
  fontFamily?: string
  fill?: string
  width?: number
  textAlign?: string
  originX?: 'left' | 'center' | 'right'
  lineHeight?: number
}

function text(content: string, left: number, top: number, opts: TextOpts) {
  return new fabric.Textbox(content, {
    left,
    top,
    fontFamily: opts.fontFamily ?? 'Helvetica',
    fontSize: opts.fontSize ?? 10,
    fontWeight: opts.fontWeight ?? 400,
    fontStyle: opts.fontStyle ?? 'normal',
    fill: opts.fill ?? '#000',
    width: opts.width ?? 240,
    textAlign: (opts.textAlign as 'left' | 'center' | 'right' | undefined) ?? 'left',
    originX: opts.originX ?? 'left',
    lineHeight: opts.lineHeight ?? 1.1,
    editable: false,
    selectable: false,
    evented: false,
    splitByGrapheme: false,
  })
}

function rule(x1: number, y: number, x2: number, thickness: number, color: string) {
  return new fabric.Rect({
    left: x1,
    top: y,
    width: x2 - x1,
    height: thickness,
    fill: color,
    selectable: false,
    evented: false,
  })
}

/** Rough estimate of how many wrapped lines `text` will take at the given width. */
function estimateLines(s: string, widthPx: number, fontSizePx: number): number {
  const charsPerLine = Math.max(20, Math.floor(widthPx / (fontSizePx * 0.5)))
  return Math.ceil(s.length / charsPerLine)
}

/* ============ Live-edit helpers ============ */

/**
 * Read the current display props off an existing nutrition-panel group,
 * by inspecting the tagged children. Used by NutritionFactsToolbar to
 * hydrate its initial state when a panel is selected.
 */
export interface NutritionPanelProps {
  bg: string | null
  ink: string
  border: boolean
}

export function readNutritionPanelProps(group: FabricObject): NutritionPanelProps {
  const objs = (group as unknown as { _objects?: FabricObject[] })._objects ?? []
  const bgRect = objs.find((o) => (o as { customRole?: string }).customRole === 'nfr-bg')
  const inkSource = objs.find(
    (o) => (o as { customRole?: string }).customRole === 'nfr-text',
  )
  const fill = (bgRect as { fill?: string } | undefined)?.fill ?? null
  const strokeWidth = (bgRect as { strokeWidth?: number } | undefined)?.strokeWidth ?? 0
  return {
    bg: fill || null,
    ink: ((inkSource as { fill?: string } | undefined)?.fill as string) ?? '#000000',
    border: strokeWidth > 0,
  }
}

/**
 * Recolor the panel in place. bg: null → transparent, string → fill.
 * border: false → strokeWidth 0. ink propagates to all tagged text and rule
 * children, and to the bg rect's stroke when border is on.
 */
export function updateNutritionPanel(
  canvas: FabricCanvas,
  group: FabricObject,
  patch: Partial<NutritionPanelProps>,
): void {
  const current = readNutritionPanelProps(group)
  const next: NutritionPanelProps = { ...current, ...patch }
  const objs = (group as unknown as { _objects?: FabricObject[] })._objects ?? []
  for (const o of objs) {
    const role = (o as { customRole?: string }).customRole
    if (role === 'nfr-bg') {
      o.set('fill', next.bg ?? undefined)
      o.set('stroke', next.border ? next.ink : undefined)
      o.set('strokeWidth', next.border ? 1 : 0)
    } else if (role === 'nfr-text' || role === 'nfr-rule') {
      o.set('fill', next.ink)
    }
  }
  // Force the cached group bitmap to refresh.
  ;(group as unknown as { dirty?: boolean }).dirty = true
  canvas.fire('object:modified', { target: group })
  canvas.requestRenderAll()
}
