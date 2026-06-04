'use client'

// Supplement Facts panel — Fabric Group composer (21 CFR 101.36).
// Track C / C2.a. Distinct from Nutrition Facts:
//   - "Supplement Facts" header, Serving Size + Servings Per Container
//   - Amount Per Serving + % Daily Value columns
//   - dietary ingredients WITH an established DV show "%"; those WITHOUT show
//     "†" (and the "† Daily Value not established." footnote appears)
//   - "Other ingredients:" line sits BELOW the box (rendered in-group so it
//     moves with the panel)
//
// V1 ships sample/placeholder values; real per-product binding happens at
// print/export via the compliance + label-render pipeline (same as Nutrition).
// Output is a single fabric.Group so it moves/scales as one object; tagged
// customRole children let updateSupplementPanel() recolor in place.

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'
import type { CanvasCustomType } from './objects'

export interface SupplementRow {
  label: string
  /** Amount per serving, already formatted — "500mg", "60mcg", "1000 IU". */
  value: string
  /**
   * % Daily Value. A number renders "N%". `null` renders "†" (DV not
   * established — herbs, botanicals, proprietary blends). `undefined` renders
   * no DV column entry.
   */
  dvPercent?: number | null
  indent?: 1 | 2
  bold?: boolean
}

export interface SupplementPanelData {
  servingSize: string
  servingsPerContainer: number | string
  rows: SupplementRow[]
  /** Non-dietary ingredients (fillers, capsule, flow agents). Below the box. */
  otherIngredients?: string
}

export interface SupplementPanelOpts {
  ink?: string
  bg?: string | null
  border?: boolean
  widthPx?: number
  centerX?: number
  centerY?: number
}

export const SAMPLE_SUPPLEMENT_DATA: SupplementPanelData = {
  servingSize: '2 capsules',
  servingsPerContainer: 30,
  rows: [
    { label: 'Vitamin D (as cholecalciferol)', value: '25mcg', dvPercent: 125 },
    { label: 'Vitamin B6 (as pyridoxine HCl)', value: '1.7mg', dvPercent: 100 },
    { label: 'Folate (as L-5-MTHF)', value: '400mcg DFE', dvPercent: 100 },
    { label: 'Vitamin B12 (as methylcobalamin)', value: '500mcg', dvPercent: 20833 },
    { label: 'Magnesium (as bisglycinate)', value: '100mg', dvPercent: 24 },
    { label: 'Zinc (as bisglycinate)', value: '11mg', dvPercent: 100 },
    { label: 'Ashwagandha Root Extract', value: '300mg', dvPercent: null },
    { label: 'L-Theanine', value: '200mg', dvPercent: null },
  ],
  otherIngredients:
    'Other ingredients: Hypromellose (vegetable capsule), microcrystalline cellulose, rice flour, magnesium stearate.',
}

/** Add an FDA-styled Supplement Facts panel as a Fabric Group at canvas center. */
export async function addSupplementFactsPanel(
  canvas: FabricCanvas,
  data: SupplementPanelData = SAMPLE_SUPPLEMENT_DATA,
  opts: SupplementPanelOpts = {},
): Promise<FabricObject> {
  const ink = opts.ink ?? '#000000'
  const bg = opts.bg === undefined ? '#FFFFFF' : opts.bg
  const border = opts.border ?? true
  const width = opts.widthPx ?? 220
  const pad = 8

  const children: fabric.FabricObject[] = []
  let y = pad

  // ===== Header =====
  children.push(
    text('Supplement Facts', pad, y, {
      fontSize: 20,
      fontWeight: 900,
      fontFamily: 'Helvetica',
      fill: ink,
      width: width - 2 * pad,
    }),
  )
  y += 22

  children.push(
    text(`Serving Size ${data.servingSize}`, pad, y, {
      fontSize: 10,
      fontWeight: 700,
      fill: ink,
      width: width - 2 * pad,
    }),
  )
  y += 12
  children.push(
    text(`Servings Per Container ${data.servingsPerContainer}`, pad, y, {
      fontSize: 9,
      fill: ink,
      width: width - 2 * pad,
    }),
  )
  y += 12

  children.push(rule(pad, y, width - pad, 6, ink))
  y += 8

  // ===== Column header =====
  children.push(
    text('Amount Per Serving', pad, y, { fontSize: 8, fontWeight: 700, fill: ink }),
  )
  children.push(
    text('% Daily Value', width - pad, y, {
      fontSize: 8,
      fontWeight: 700,
      fill: ink,
      textAlign: 'right',
      originX: 'right',
    }),
  )
  y += 11

  // ===== Rows =====
  let anyDaggered = false
  for (const row of data.rows) {
    children.push(rule(pad, y, width - pad, 0.5, ink))
    y += 3
    const indent = (row.indent ?? 0) * 8
    children.push(
      text(`${row.label} ${row.value}`, pad + indent, y, {
        fontSize: 9,
        fontWeight: row.bold ? 700 : 400,
        fill: ink,
        width: width - 2 * pad - 30,
      }),
    )
    if (row.dvPercent !== undefined) {
      const dv = row.dvPercent === null ? '†' : `${row.dvPercent}%`
      if (row.dvPercent === null) anyDaggered = true
      children.push(
        text(dv, width - pad, y, {
          fontSize: 9,
          fontWeight: 700,
          fill: ink,
          textAlign: 'right',
          originX: 'right',
        }),
      )
    }
    y += 13
  }

  // Thick bottom rule
  children.push(rule(pad, y, width - pad, 6, ink))
  y += 9

  // ===== Footnotes =====
  children.push(
    text('* Percent Daily Values are based on a 2,000 calorie diet.', pad, y, {
      fontSize: 7,
      fill: ink,
      width: width - 2 * pad,
      lineHeight: 1.15,
    }),
  )
  y += estimateLines('* Percent Daily Values are based on a 2,000 calorie diet.', width - 2 * pad, 7) * 9 + 2
  if (anyDaggered) {
    children.push(
      text('† Daily Value not established.', pad, y, {
        fontSize: 7,
        fill: ink,
        width: width - 2 * pad,
      }),
    )
    y += 10
  }

  const boxHeight = y + pad

  // ===== "Other ingredients" — sits BELOW the box (still in-group). =====
  let otherObj: fabric.FabricObject | null = null
  let totalHeight = boxHeight
  if (data.otherIngredients) {
    otherObj = text(data.otherIngredients, pad, boxHeight + 6, {
      fontSize: 7.5,
      fill: ink,
      width: width - 2 * pad,
      lineHeight: 1.2,
    })
    totalHeight = boxHeight + 6 + estimateLines(data.otherIngredients, width - 2 * pad, 7.5) * 10 + pad
  }

  // ===== Background rect (the boxed panel only) =====
  const bgRect = new fabric.Rect({
    left: 0,
    top: 0,
    width,
    height: boxHeight,
    fill: bg ?? undefined,
    stroke: border ? ink : undefined,
    strokeWidth: border ? 1 : 0,
  })
  bgRect.set('customRole', 'sfr-bg')

  for (const c of children) {
    const t = (c as { type?: string }).type
    if (t === 'textbox' || t === 'text' || t === 'i-text') c.set('customRole', 'sfr-text')
    else if (t === 'rect') c.set('customRole', 'sfr-rule')
  }
  if (otherObj) otherObj.set('customRole', 'sfr-text')

  const groupChildren = [bgRect, ...children, ...(otherObj ? [otherObj] : [])]
  const group = new fabric.Group(groupChildren, {
    originX: 'center',
    originY: 'center',
    subTargetCheck: false,
  })
  group.set('customType', 'supplement-panel' satisfies CanvasCustomType)
  void totalHeight // height is implicit in the group's bounds

  // Position at viewport center (mirror nutritionPanel).
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

export interface SupplementPanelProps {
  bg: string | null
  ink: string
  border: boolean
}

/** Recolor an existing supplement-panel group in place. */
export function updateSupplementPanel(
  canvas: FabricCanvas,
  group: FabricObject,
  patch: Partial<SupplementPanelProps>,
): void {
  const objs = (group as unknown as { _objects?: FabricObject[] })._objects ?? []
  const bgRect = objs.find((o) => (o as { customRole?: string }).customRole === 'sfr-bg')
  const inkSrc = objs.find((o) => (o as { customRole?: string }).customRole === 'sfr-text')
  const current: SupplementPanelProps = {
    bg: ((bgRect as { fill?: string } | undefined)?.fill as string) || null,
    ink: ((inkSrc as { fill?: string } | undefined)?.fill as string) ?? '#000000',
    border: ((bgRect as { strokeWidth?: number } | undefined)?.strokeWidth ?? 0) > 0,
  }
  const next = { ...current, ...patch }
  for (const o of objs) {
    const role = (o as { customRole?: string }).customRole
    if (role === 'sfr-bg') {
      o.set('fill', next.bg ?? undefined)
      o.set('stroke', next.border ? next.ink : undefined)
      o.set('strokeWidth', next.border ? 1 : 0)
    } else if (role === 'sfr-text' || role === 'sfr-rule') {
      o.set('fill', next.ink)
    }
  }
  ;(group as unknown as { dirty?: boolean }).dirty = true
  canvas.fire('object:modified', { target: group })
  canvas.requestRenderAll()
}

/* ============ helpers (mirror nutritionPanel.ts) ============ */

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

function estimateLines(s: string, widthPx: number, fontSizePx: number): number {
  const charsPerLine = Math.max(20, Math.floor(widthPx / (fontSizePx * 0.5)))
  return Math.ceil(s.length / charsPerLine)
}
