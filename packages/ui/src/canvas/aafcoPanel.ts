'use client'

// AAFCO pet-food panel — Fabric Group composer (AAFCO Model Pet Food Regs).
// Track C / C2.c. NOT a "Facts" panel: pet food uses a Guaranteed Analysis
// table + Ingredients (descending) + Feeding Directions + (optional) Calorie
// Content + Nutritional Adequacy statement.
//
// V1 ships sample/placeholder values; real per-product binding happens at
// print/export. Output is a single fabric.Group; tagged customRole children let
// updateAafcoPanel() recolor in place.

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'
import type { CanvasCustomType } from './objects'
import type { PanelSections } from './nutritionPanel'

export interface AafcoAnalysisRow {
  label: string // "Crude Protein"
  qualifier: 'min' | 'max'
  value: string // "10.0%"
}

export interface AafcoPanelData {
  analysis: AafcoAnalysisRow[]
  /** Ingredients in descending order of predominance by weight. */
  ingredients: string
  feedingDirections: string
  /** e.g. "3,500 kcal/kg (350 kcal/cup) ME". */
  calorieContent?: string
  /** The AAFCO nutritional-adequacy statement. */
  nutritionalAdequacy?: string
}

export interface AafcoPanelOpts {
  ink?: string
  bg?: string | null
  border?: boolean
  widthPx?: number
  centerX?: number
  centerY?: number
  /** C3.b — section visibility toggles. */
  sections?: PanelSections
}

export const SAMPLE_AAFCO_DATA: AafcoPanelData = {
  analysis: [
    { label: 'Crude Protein', qualifier: 'min', value: '26.0%' },
    { label: 'Crude Fat', qualifier: 'min', value: '14.0%' },
    { label: 'Crude Fiber', qualifier: 'max', value: '4.0%' },
    { label: 'Moisture', qualifier: 'max', value: '10.0%' },
  ],
  ingredients:
    'Deboned chicken, chicken meal, brown rice, oatmeal, peas, chicken fat (preserved with mixed tocopherols), natural flavor, flaxseed, salt, vitamins, minerals.',
  feedingDirections:
    'Feed 1 cup per 30 lbs of body weight daily, divided into two meals. Adjust to maintain ideal body condition. Provide fresh water at all times.',
  calorieContent: '3,500 kcal/kg (350 kcal/cup) ME',
  nutritionalAdequacy:
    'This product is formulated to meet the nutritional levels established by the AAFCO Dog Food Nutrient Profiles for maintenance.',
}

/** Add an AAFCO pet-food panel as a Fabric Group at canvas center. */
export async function addAafcoPanel(
  canvas: FabricCanvas,
  data: AafcoPanelData = SAMPLE_AAFCO_DATA,
  opts: AafcoPanelOpts = {},
): Promise<FabricObject> {
  const ink = opts.ink ?? '#000000'
  const bg = opts.bg === undefined ? '#FFFFFF' : opts.bg
  const border = opts.border ?? true
  const width = opts.widthPx ?? 240
  const pad = 8
  const inner = width - 2 * pad

  const children: fabric.FabricObject[] = []
  let y = pad

  // ===== Guaranteed Analysis =====
  if (!opts.sections?.hideTitle) {
    children.push(
      text('Guaranteed Analysis', pad, y, {
        fontSize: 14,
        fontWeight: 900,
        fontFamily: 'Helvetica',
        fill: ink,
        width: inner,
      }),
    )
    y += 18
  }
  children.push(rule(pad, y, width - pad, 3, ink))
  y += 5

  for (const row of data.analysis) {
    children.push(
      text(`${row.label} (${row.qualifier})`, pad, y, { fontSize: 9.5, fill: ink, width: inner - 40 }),
    )
    children.push(
      text(row.value, width - pad, y, {
        fontSize: 9.5,
        fontWeight: 700,
        fill: ink,
        textAlign: 'right',
        originX: 'right',
      }),
    )
    y += 13
    children.push(rule(pad, y - 1, width - pad, 0.5, ink))
  }
  y += 5

  // ===== Ingredients =====
  y = labeledBlock(children, 'Ingredients:', data.ingredients, pad, y, inner, ink, width)

  // ===== Feeding Directions =====
  y = labeledBlock(children, 'Feeding Directions:', data.feedingDirections, pad, y, inner, ink, width)

  // ===== Calorie Content (optional) =====
  if (data.calorieContent) {
    y = labeledBlock(children, 'Calorie Content:', data.calorieContent, pad, y, inner, ink, width)
  }

  // ===== Nutritional Adequacy statement (optional) =====
  if (data.nutritionalAdequacy && !opts.sections?.hideFootnote) {
    children.push(
      text(data.nutritionalAdequacy, pad, y, {
        fontSize: 7.5,
        fontStyle: 'italic',
        fill: ink,
        width: inner,
        lineHeight: 1.2,
      }),
    )
    y += estimateLines(data.nutritionalAdequacy, inner, 7.5) * 10 + pad
  }

  const boxHeight = y

  // ===== Background rect =====
  const bgRect = new fabric.Rect({
    left: 0,
    top: 0,
    width,
    height: boxHeight,
    fill: bg ?? undefined,
    stroke: border ? ink : undefined,
    strokeWidth: border ? 1 : 0,
  })
  bgRect.set('customRole', 'afr-bg')

  for (const c of children) {
    const t = (c as { type?: string }).type
    if (t === 'textbox' || t === 'text' || t === 'i-text') c.set('customRole', 'afr-text')
    else if (t === 'rect') c.set('customRole', 'afr-rule')
  }

  const group = new fabric.Group([bgRect, ...children], {
    originX: 'center',
    originY: 'center',
    subTargetCheck: false,
  })
  group.set('customType', 'aafco-panel' satisfies CanvasCustomType)

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

export interface AafcoPanelProps {
  bg: string | null
  ink: string
  border: boolean
}

/** Recolor an existing aafco-panel group in place. */
export function updateAafcoPanel(
  canvas: FabricCanvas,
  group: FabricObject,
  patch: Partial<AafcoPanelProps>,
): void {
  const objs = (group as unknown as { _objects?: FabricObject[] })._objects ?? []
  const bgRect = objs.find((o) => (o as { customRole?: string }).customRole === 'afr-bg')
  const inkSrc = objs.find((o) => (o as { customRole?: string }).customRole === 'afr-text')
  const current: AafcoPanelProps = {
    bg: ((bgRect as { fill?: string } | undefined)?.fill as string) || null,
    ink: ((inkSrc as { fill?: string } | undefined)?.fill as string) ?? '#000000',
    border: ((bgRect as { strokeWidth?: number } | undefined)?.strokeWidth ?? 0) > 0,
  }
  const next = { ...current, ...patch }
  for (const o of objs) {
    const role = (o as { customRole?: string }).customRole
    if (role === 'afr-bg') {
      o.set('fill', next.bg ?? undefined)
      o.set('stroke', next.border ? next.ink : undefined)
      o.set('strokeWidth', next.border ? 1 : 0)
    } else if (role === 'afr-text' || role === 'afr-rule') {
      o.set('fill', next.ink)
    }
  }
  ;(group as unknown as { dirty?: boolean }).dirty = true
  canvas.fire('object:modified', { target: group })
  canvas.requestRenderAll()
}

/* ============ helpers ============ */

/** Bold label line + wrapped body text; returns the new y. */
function labeledBlock(
  children: fabric.FabricObject[],
  label: string,
  body: string,
  pad: number,
  y: number,
  inner: number,
  ink: string,
  width: number,
): number {
  children.push(rule(pad, y, width - pad, 1.5, ink))
  y += 4
  children.push(text(label, pad, y, { fontSize: 9, fontWeight: 700, fill: ink, width: inner }))
  y += 11
  children.push(text(body, pad, y, { fontSize: 8, fill: ink, width: inner, lineHeight: 1.2 }))
  y += estimateLines(body, inner, 8) * 10 + 5
  return y
}

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
