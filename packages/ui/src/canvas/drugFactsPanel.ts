'use client'

// Drug Facts panel — Fabric Group composer (21 CFR 201.66, OTC).
// Track C / C2.b. Structurally very different from the Facts/Analysis panels:
// a fixed ordered set of headings (Active ingredient + Purpose, Uses, Warnings,
// Directions, Other information, Inactive ingredients, Questions) separated by
// heavy black bars, with bullet lists and bold sub-headers in Warnings.
//
// V1 ships sample/placeholder values; real per-product binding happens at
// print/export. Output is a single fabric.Group; tagged customRole children let
// updateDrugFactsPanel() recolor in place.

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'
import type { CanvasCustomType } from './objects'

export interface DrugActiveIngredient {
  /** "Acetaminophen 500 mg (in each tablet)". */
  name: string
  /** "Pain reliever/fever reducer". */
  purpose: string
}

export interface DrugWarningLine {
  text: string
  /** Bold sub-header lines ("Do not use", "Ask a doctor before use if"). */
  bold?: boolean
}

export interface DrugFactsData {
  activeIngredients: DrugActiveIngredient[]
  uses: string[]
  warnings: DrugWarningLine[]
  directions: string
  otherInformation?: string[]
  inactiveIngredients: string
  /** "Questions or comments? 1-800-…". */
  questions?: string
}

export interface DrugFactsPanelOpts {
  ink?: string
  bg?: string | null
  border?: boolean
  widthPx?: number
  centerX?: number
  centerY?: number
}

export const SAMPLE_DRUG_FACTS_DATA: DrugFactsData = {
  activeIngredients: [{ name: 'Acetaminophen 500 mg (in each caplet)', purpose: 'Pain reliever/fever reducer' }],
  uses: ['temporarily relieves minor aches and pains', 'temporarily reduces fever'],
  warnings: [
    { text: 'Liver warning:', bold: true },
    { text: 'This product contains acetaminophen. Severe liver damage may occur if you take more than directed.' },
    { text: 'Do not use', bold: true },
    { text: 'with any other drug containing acetaminophen.' },
    { text: 'Ask a doctor before use if', bold: true },
    { text: 'you have liver disease.' },
    { text: 'Stop use and ask a doctor if', bold: true },
    { text: 'symptoms do not improve or last more than 10 days.' },
    { text: 'Keep out of reach of children.', bold: true },
  ],
  directions:
    'Adults and children 12 years and over: take 2 caplets every 6 hours while symptoms last. Do not take more than 6 caplets in 24 hours. Children under 12 years: ask a doctor.',
  otherInformation: ['store at 20-25°C (68-77°F)', 'do not use if seal is broken'],
  inactiveIngredients: 'corn starch, hypromellose, powdered cellulose, magnesium stearate, sodium starch glycolate, stearic acid, titanium dioxide.',
  questions: 'Questions or comments? 1-800-555-0123',
}

/** Add an OTC Drug Facts panel as a Fabric Group at canvas center. */
export async function addDrugFactsPanel(
  canvas: FabricCanvas,
  data: DrugFactsData = SAMPLE_DRUG_FACTS_DATA,
  opts: DrugFactsPanelOpts = {},
): Promise<FabricObject> {
  const ink = opts.ink ?? '#000000'
  const bg = opts.bg === undefined ? '#FFFFFF' : opts.bg
  const border = opts.border ?? true
  const width = opts.widthPx ?? 240
  const pad = 8
  const inner = width - 2 * pad

  const children: fabric.FabricObject[] = []
  let y = pad

  // ===== Drug Facts title =====
  children.push(
    text('Drug Facts', pad, y, { fontSize: 18, fontWeight: 900, fontFamily: 'Helvetica', fill: ink, width: inner }),
  )
  y += 20
  children.push(rule(pad, y, width - pad, 4, ink))
  y += 6

  // ===== Active ingredient / Purpose =====
  children.push(text('Active ingredient', pad, y, { fontSize: 9, fontWeight: 700, fill: ink }))
  children.push(
    text('Purpose', width - pad, y, { fontSize: 9, fontWeight: 700, fill: ink, textAlign: 'right', originX: 'right' }),
  )
  y += 12
  for (const a of data.activeIngredients) {
    children.push(text(a.name, pad, y, { fontSize: 8.5, fill: ink, width: inner * 0.62 }))
    children.push(
      text(a.purpose, width - pad, y, { fontSize: 8.5, fill: ink, textAlign: 'right', originX: 'right', width: inner * 0.36 }),
    )
    y += estimateLines(a.name, inner * 0.62, 8.5) * 10 + 3
  }
  y += 2

  // ===== Uses =====
  y = sectionRule(children, pad, y, width, ink)
  children.push(text('Uses', pad, y, { fontSize: 9, fontWeight: 700, fill: ink }))
  y += 11
  y = bullets(children, data.uses, pad, y, inner, ink)

  // ===== Warnings =====
  y = sectionRule(children, pad, y, width, ink)
  children.push(text('Warnings', pad, y, { fontSize: 9, fontWeight: 700, fill: ink }))
  y += 11
  for (const w of data.warnings) {
    children.push(
      text(w.text, pad, y, { fontSize: 8, fontWeight: w.bold ? 700 : 400, fill: ink, width: inner, lineHeight: 1.15 }),
    )
    y += estimateLines(w.text, inner, 8) * 9.5 + 2
  }
  y += 2

  // ===== Directions =====
  y = sectionRule(children, pad, y, width, ink)
  children.push(text('Directions', pad, y, { fontSize: 9, fontWeight: 700, fill: ink }))
  y += 11
  children.push(text(data.directions, pad, y, { fontSize: 8, fill: ink, width: inner, lineHeight: 1.2 }))
  y += estimateLines(data.directions, inner, 8) * 10 + 4

  // ===== Other information =====
  if (data.otherInformation && data.otherInformation.length > 0) {
    y = sectionRule(children, pad, y, width, ink)
    children.push(text('Other information', pad, y, { fontSize: 9, fontWeight: 700, fill: ink }))
    y += 11
    y = bullets(children, data.otherInformation, pad, y, inner, ink)
  }

  // ===== Inactive ingredients =====
  y = sectionRule(children, pad, y, width, ink)
  children.push(text('Inactive ingredients', pad, y, { fontSize: 9, fontWeight: 700, fill: ink }))
  y += 11
  children.push(text(data.inactiveIngredients, pad, y, { fontSize: 8, fill: ink, width: inner, lineHeight: 1.2 }))
  y += estimateLines(data.inactiveIngredients, inner, 8) * 10 + 4

  // ===== Questions =====
  if (data.questions) {
    y = sectionRule(children, pad, y, width, ink)
    children.push(text(data.questions, pad, y, { fontSize: 8, fontWeight: 700, fill: ink, width: inner }))
    y += 12
  }

  const boxHeight = y + pad - 6

  const bgRect = new fabric.Rect({
    left: 0,
    top: 0,
    width,
    height: boxHeight,
    fill: bg ?? undefined,
    stroke: border ? ink : undefined,
    strokeWidth: border ? 1 : 0,
  })
  bgRect.set('customRole', 'dfr-bg')

  for (const c of children) {
    const t = (c as { type?: string }).type
    if (t === 'textbox' || t === 'text' || t === 'i-text') c.set('customRole', 'dfr-text')
    else if (t === 'rect') c.set('customRole', 'dfr-rule')
  }

  const group = new fabric.Group([bgRect, ...children], {
    originX: 'center',
    originY: 'center',
    subTargetCheck: false,
  })
  group.set('customType', 'drug-facts-panel' satisfies CanvasCustomType)

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

export interface DrugFactsPanelProps {
  bg: string | null
  ink: string
  border: boolean
}

export function updateDrugFactsPanel(
  canvas: FabricCanvas,
  group: FabricObject,
  patch: Partial<DrugFactsPanelProps>,
): void {
  const objs = (group as unknown as { _objects?: FabricObject[] })._objects ?? []
  const bgRect = objs.find((o) => (o as { customRole?: string }).customRole === 'dfr-bg')
  const inkSrc = objs.find((o) => (o as { customRole?: string }).customRole === 'dfr-text')
  const current: DrugFactsPanelProps = {
    bg: ((bgRect as { fill?: string } | undefined)?.fill as string) || null,
    ink: ((inkSrc as { fill?: string } | undefined)?.fill as string) ?? '#000000',
    border: ((bgRect as { strokeWidth?: number } | undefined)?.strokeWidth ?? 0) > 0,
  }
  const next = { ...current, ...patch }
  for (const o of objs) {
    const role = (o as { customRole?: string }).customRole
    if (role === 'dfr-bg') {
      o.set('fill', next.bg ?? undefined)
      o.set('stroke', next.border ? next.ink : undefined)
      o.set('strokeWidth', next.border ? 1 : 0)
    } else if (role === 'dfr-text' || role === 'dfr-rule') {
      o.set('fill', next.ink)
    }
  }
  ;(group as unknown as { dirty?: boolean }).dirty = true
  canvas.fire('object:modified', { target: group })
  canvas.requestRenderAll()
}

/* ============ helpers ============ */

/** Heavy section divider bar; returns the y just below it. */
function sectionRule(children: fabric.FabricObject[], pad: number, y: number, width: number, ink: string): number {
  children.push(rule(pad, y, width - pad, 2.5, ink))
  return y + 5
}

/** Bulleted list; returns the new y. */
function bullets(
  children: fabric.FabricObject[],
  items: string[],
  pad: number,
  y: number,
  inner: number,
  ink: string,
): number {
  for (const it of items) {
    children.push(text('■', pad, y, { fontSize: 6, fill: ink }))
    children.push(text(it, pad + 9, y, { fontSize: 8, fill: ink, width: inner - 9, lineHeight: 1.15 }))
    y += estimateLines(it, inner - 9, 8) * 10 + 2
  }
  return y + 2
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
  return new fabric.Rect({ left: x1, top: y, width: x2 - x1, height: thickness, fill: color, selectable: false, evented: false })
}

function estimateLines(s: string, widthPx: number, fontSizePx: number): number {
  const charsPerLine = Math.max(20, Math.floor(widthPx / (fontSizePx * 0.5)))
  return Math.ceil(s.length / charsPerLine)
}
