'use client'

// Track C / C5 — multi-flavor AGGREGATE Nutrition Facts panel (variety pack).
// 21 CFR 101.9(h)(4): when one package holds multiple varieties, nutrient names
// print once on the left and each variety gets its own value column.
//
// Distinct from nutritionPanel's FDA_TABULAR (which splits ONE flavor's rows
// into two columns to save height). Here every column is a different flavor and
// the nutrient labels are shared. Output is a single fabric.Group; tagged
// customRole children let updateAggregateNutritionPanel() recolor in place.

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'
import type { CanvasCustomType } from './objects'
import type { NutritionRow, PanelSections } from './nutritionPanel'

export interface NutritionFlavor {
  /** Column header, e.g. "Chocolate". */
  name: string
  servingsPerContainer: number | string
  servingSize: string
  calories: number
  /** Same nutrient labels + order across every flavor (column alignment). */
  rows: NutritionRow[]
  addedSugarG?: number
}

export interface AggregateNutritionData {
  flavors: NutritionFlavor[]
  footnote: string
}

export interface AggregateNutritionOpts {
  ink?: string
  bg?: string | null
  border?: boolean
  /** C3.b — section visibility toggles. */
  sections?: PanelSections
  centerX?: number
  centerY?: number
}

const BASE_ROWS: NutritionRow[] = [
  { label: 'Total Fat', value: '1g', dvPercent: 1, bold: true },
  { label: 'Saturated Fat', value: '0g', dvPercent: 0, indent: 1 },
  { label: 'Cholesterol', value: '0mg', dvPercent: 0, bold: true },
  { label: 'Sodium', value: '35mg', dvPercent: 2, bold: true },
  { label: 'Total Carbohydrate', value: '4g', dvPercent: 1, bold: true },
  { label: 'Total Sugars', value: '2g', dvPercent: null, indent: 1 },
  { label: 'Protein', value: '24g', dvPercent: 48, bold: true },
  { label: 'Calcium', value: '140mg', dvPercent: 10 },
  { label: 'Iron', value: '0.5mg', dvPercent: 3 },
]

/** Two-flavor (sliceable to 3) sample, used until real per-flavor data binds. */
export const SAMPLE_AGGREGATE_NUTRITION_DATA: AggregateNutritionData = {
  flavors: [
    {
      name: 'Chocolate',
      servingsPerContainer: 15,
      servingSize: '1 scoop (32g)',
      calories: 120,
      addedSugarG: 1,
      rows: BASE_ROWS,
    },
    {
      name: 'Vanilla',
      servingsPerContainer: 15,
      servingSize: '1 scoop (31g)',
      calories: 110,
      addedSugarG: 0,
      rows: BASE_ROWS.map((r) =>
        r.label === 'Protein'
          ? { ...r, value: '25g', dvPercent: 50 }
          : r.label === 'Total Sugars'
            ? { ...r, value: '1g' }
            : r,
      ),
    },
    {
      name: 'Strawberry',
      servingsPerContainer: 15,
      servingSize: '1 scoop (32g)',
      calories: 115,
      addedSugarG: 2,
      rows: BASE_ROWS.map((r) =>
        r.label === 'Total Sugars'
          ? { ...r, value: '3g' }
          : r.label === 'Sodium'
            ? { ...r, value: '40mg', dvPercent: 2 }
            : r,
      ),
    },
  ],
  footnote:
    '* The % Daily Value (DV) tells you how much a nutrient in a serving contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.',
}

const PAD = 8
const LABEL_COL_W = 96
const FLAVOR_COL_W = 64

/** Add a multi-flavor aggregate Nutrition Facts panel as a Fabric Group. */
export async function addAggregateNutritionPanel(
  canvas: FabricCanvas,
  data: AggregateNutritionData = SAMPLE_AGGREGATE_NUTRITION_DATA,
  opts: AggregateNutritionOpts = {},
): Promise<FabricObject> {
  const ink = opts.ink ?? '#000000'
  const bg = opts.bg === undefined ? '#FFFFFF' : opts.bg
  const border = opts.border ?? true
  const flavors = data.flavors.length ? data.flavors : SAMPLE_AGGREGATE_NUTRITION_DATA.flavors
  const n = flavors.length
  const width = PAD * 2 + LABEL_COL_W + n * FLAVOR_COL_W
  const colCenter = (j: number) => PAD + LABEL_COL_W + j * FLAVOR_COL_W + FLAVOR_COL_W / 2

  const children: fabric.FabricObject[] = []
  let y = PAD

  // ===== Title =====
  if (!opts.sections?.hideTitle) {
    children.push(
      text('Nutrition Facts', PAD, y, {
        fontSize: 20,
        fontWeight: 900,
        fill: ink,
        width: width - 2 * PAD,
      }),
    )
    y += 22
  }

  // ===== Flavor header row =====
  flavors.forEach((f, j) => {
    children.push(
      text(f.name, colCenter(j), y, {
        fontSize: 9,
        fontWeight: 700,
        fill: ink,
        textAlign: 'center',
        originX: 'center',
        width: FLAVOR_COL_W,
      }),
    )
  })
  y += 12
  // Serving size per flavor
  children.push(text('Serving size', PAD, y, { fontSize: 8, fontWeight: 700, fill: ink }))
  flavors.forEach((f, j) => {
    children.push(
      text(f.servingSize, colCenter(j), y, {
        fontSize: 7.5,
        fill: ink,
        textAlign: 'center',
        originX: 'center',
        width: FLAVOR_COL_W,
      }),
    )
  })
  y += 12

  children.push(rule(PAD, y, width - PAD, 4, ink))
  y += 6

  // ===== Calories row =====
  children.push(text('Calories', PAD, y, { fontSize: 12, fontWeight: 900, fill: ink }))
  flavors.forEach((f, j) => {
    children.push(
      text(String(f.calories), colCenter(j), y, {
        fontSize: 13,
        fontWeight: 900,
        fill: ink,
        textAlign: 'center',
        originX: 'center',
        width: FLAVOR_COL_W,
      }),
    )
  })
  y += 16

  children.push(rule(PAD, y, width - PAD, 2, ink))
  y += 4
  children.push(
    text('% Daily Value*', width - PAD, y, {
      fontSize: 7,
      fontWeight: 700,
      fill: ink,
      textAlign: 'right',
      originX: 'right',
    }),
  )
  y += 9

  // ===== Nutrient rows (labels shared, value+DV per flavor) =====
  const labelRows = flavors[0]?.rows ?? []
  labelRows.forEach((baseRow, i) => {
    children.push(rule(PAD, y, width - PAD, 0.5, ink))
    y += 2.5
    const indent = (baseRow.indent ?? 0) * 6
    children.push(
      text(baseRow.label, PAD + indent, y, {
        fontSize: 8,
        fontWeight: baseRow.bold ? 700 : 400,
        fill: ink,
        width: LABEL_COL_W - indent,
      }),
    )
    flavors.forEach((f, j) => {
      const cell = f.rows[i]
      if (!cell) return
      const dv =
        cell.dvPercent !== null && cell.dvPercent !== undefined ? ` ${cell.dvPercent}%` : ''
      children.push(
        text(`${cell.value}${dv}`, colCenter(j), y, {
          fontSize: 7.5,
          fontWeight: baseRow.bold ? 700 : 400,
          fill: ink,
          textAlign: 'center',
          originX: 'center',
          width: FLAVOR_COL_W,
        }),
      )
    })
    y += 11
  })

  // Thick bottom rule
  children.push(rule(PAD, y, width - PAD, 5, ink))
  y += 7

  // Footnote
  if (!opts.sections?.hideFootnote) {
    children.push(
      text(data.footnote, PAD, y, {
        fontSize: 6.5,
        fill: ink,
        width: width - 2 * PAD,
        lineHeight: 1.15,
      }),
    )
    y += estimateLines(data.footnote, width - 2 * PAD, 6.5) * 8 + PAD
  }

  // ===== Background rect =====
  const bgRect = new fabric.Rect({
    left: 0,
    top: 0,
    width,
    height: y,
    fill: bg ?? undefined,
    stroke: border ? ink : undefined,
    strokeWidth: border ? 1 : 0,
  })
  bgRect.set('customRole', 'nar-bg')

  for (const c of children) {
    const t = (c as { type?: string }).type
    if (t === 'textbox' || t === 'text' || t === 'i-text') c.set('customRole', 'nar-text')
    else if (t === 'rect') c.set('customRole', 'nar-rule')
  }

  const group = new fabric.Group([bgRect, ...children], {
    originX: 'center',
    originY: 'center',
    subTargetCheck: false,
  })
  group.set('customType', 'nutrition-aggregate-panel' satisfies CanvasCustomType)
  ;(group as { customData?: unknown }).customData = { format: 'FDA_AGGREGATE', flavorCount: n }

  const vpt = canvas.viewportTransform
  const w = canvas.getWidth()
  const h = canvas.getHeight()
  let cx = opts.centerX ?? w / 2
  let cy = opts.centerY ?? h / 2
  if (vpt && opts.centerX === undefined) cx = (w / 2 - vpt[4]) / vpt[0]
  if (vpt && opts.centerY === undefined) cy = (h / 2 - vpt[5]) / vpt[3]
  group.set({ left: cx, top: cy })

  canvas.add(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
  return group
}

export interface AggregateNutritionProps {
  bg: string | null
  ink: string
  border: boolean
}

/** Recolor an existing aggregate panel group in place. */
export function updateAggregateNutritionPanel(
  canvas: FabricCanvas,
  group: FabricObject,
  patch: Partial<AggregateNutritionProps>,
): void {
  const objs = (group as unknown as { _objects?: FabricObject[] })._objects ?? []
  const bgRect = objs.find((o) => (o as { customRole?: string }).customRole === 'nar-bg')
  const inkSrc = objs.find((o) => (o as { customRole?: string }).customRole === 'nar-text')
  const current: AggregateNutritionProps = {
    bg: ((bgRect as { fill?: string } | undefined)?.fill as string) || null,
    ink: ((inkSrc as { fill?: string } | undefined)?.fill as string) ?? '#000000',
    border: ((bgRect as { strokeWidth?: number } | undefined)?.strokeWidth ?? 0) > 0,
  }
  const next = { ...current, ...patch }
  for (const o of objs) {
    const role = (o as { customRole?: string }).customRole
    if (role === 'nar-bg') {
      o.set('fill', next.bg ?? undefined)
      o.set('stroke', next.border ? next.ink : undefined)
      o.set('strokeWidth', next.border ? 1 : 0)
    } else if (role === 'nar-text' || role === 'nar-rule') {
      o.set('fill', next.ink)
    }
  }
  ;(group as unknown as { dirty?: boolean }).dirty = true
  canvas.fire('object:modified', { target: group })
  canvas.requestRenderAll()
}

/* ============ helpers ============ */

interface TextOpts {
  fontSize?: number
  fontWeight?: number | string
  fontStyle?: string
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
    fontFamily: 'Helvetica',
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

function estimateLines(s: string, widthPx: number, fontSizePx: number): number {
  const charsPerLine = Math.max(20, Math.floor(widthPx / (fontSizePx * 0.5)))
  return Math.ceil(s.length / charsPerLine)
}
