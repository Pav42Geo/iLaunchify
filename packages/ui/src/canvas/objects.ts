'use client'

// Canvas object factory — thin wrappers around fabric.* constructors so
// consuming apps (apps/creator) can spawn Text / Image / Rect objects on a
// hoisted FabricCanvas without taking a direct `fabric` dependency.
// Per docs/DESIGN_STUDIO_REBUILD.md §3 (canvas tool inventory).

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'

/**
 * Custom-type discriminator stamped onto every object we add so the
 * canvas shell can route the selected object to the right floating
 * editor toolbar (DS-53). useAutoSave's toJSON propertiesToInclude
 * preserves these across save/load.
 */
export type CanvasCustomType =
  | 'text'
  | 'text-combo'
  | 'image'
  | 'brand-logo'
  | 'qr-code'
  | 'barcode'
  | 'internal-sku'
  | 'nutrition-panel'

/**
 * Required-label-section discriminator (DS-55).
 *
 * Stamped on text objects added via the Label drawer's "Required sections"
 * helpers so the compliance scan can confirm each required FDA section
 * (21 CFR §101) is present on the canvas. Free-typed text remains untagged.
 */
export type LabelSectionRole =
  | 'statement-of-identity'
  | 'ingredients'
  | 'allergens'
  | 'net-weight'
  | 'manufacturer-info'

/** Properties to round-trip through canvas.toJSON. */
export const CANVAS_PROPERTIES_TO_INCLUDE = [
  'customType',
  'customData',
  'customRole',
] as const

/** Add an editable text object at the canvas viewport center + select it. */
export function addText(
  canvas: FabricCanvas,
  text: string,
  opts: {
    fontFamily?: string
    fontSize?: number
    fill?: string
    fontWeight?: number | string
    width?: number
  } = {},
): FabricObject {
  const center = getCanvasCenter(canvas)
  const obj = new fabric.IText(text, {
    left: center.x,
    top: center.y,
    originX: 'center',
    originY: 'center',
    fontFamily: opts.fontFamily ?? 'Inter, sans-serif',
    fontSize: opts.fontSize ?? 28,
    fill: opts.fill ?? '#0F1116',
    fontWeight: opts.fontWeight ?? 400,
    editable: true,
  })
  if (opts.width) {
    obj.set('width', opts.width)
  }
  obj.set('customType', 'text' satisfies CanvasCustomType)
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  return obj
}

/** Add two stacked text objects — heading + subheading — as a quick combo. */
export function addTextCombo(
  canvas: FabricCanvas,
  heading: string,
  subheading: string,
  opts: {
    headingFont?: string
    bodyFont?: string
    fill?: string
  } = {},
): FabricObject[] {
  const center = getCanvasCenter(canvas)
  const headingObj = new fabric.IText(heading, {
    left: center.x,
    top: center.y - 22,
    originX: 'center',
    originY: 'center',
    fontFamily: opts.headingFont ?? 'Bricolage Grotesque, sans-serif',
    fontSize: 36,
    fontWeight: 700,
    fill: opts.fill ?? '#0F1116',
  })
  const subObj = new fabric.IText(subheading, {
    left: center.x,
    top: center.y + 18,
    originX: 'center',
    originY: 'center',
    fontFamily: opts.bodyFont ?? 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 400,
    fill: opts.fill ?? '#0F1116',
  })
  headingObj.set('customType', 'text-combo' satisfies CanvasCustomType)
  subObj.set('customType', 'text-combo' satisfies CanvasCustomType)
  canvas.add(headingObj, subObj)
  // Group selection so they move together when user drags.
  const sel = new fabric.ActiveSelection([headingObj, subObj], { canvas })
  canvas.setActiveObject(sel)
  canvas.requestRenderAll()
  return [headingObj, subObj]
}

/**
 * Drop an image at the canvas viewport center.
 *
 * Auto-scales the image so its longest edge is at most 60% of the canvas's
 * shortest edge — keeps newly-added logos from blanketing the whole label
 * by default. Honors viewport zoom so it lands where the user is looking.
 *
 * Uses crossOrigin: 'anonymous' so the image can be exported on toDataURL
 * later (CORS must be permitted by the asset host).
 */
export async function addImageFromUrl(
  canvas: FabricCanvas,
  url: string,
  opts: {
    maxFraction?: number
    centerX?: number
    centerY?: number
    customType?: CanvasCustomType
  } = {},
): Promise<FabricObject | null> {
  const maxFraction = opts.maxFraction ?? 0.6
  try {
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const center = {
      x: opts.centerX ?? getCanvasCenter(canvas).x,
      y: opts.centerY ?? getCanvasCenter(canvas).y,
    }
    const cw = canvas.getWidth()
    const ch = canvas.getHeight()
    const maxEdge = Math.min(cw, ch) * maxFraction
    const iw = img.width ?? 1
    const ih = img.height ?? 1
    const longest = Math.max(iw, ih)
    const scale = longest > maxEdge ? maxEdge / longest : 1
    img.set({
      left: center.x,
      top: center.y,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
    })
    img.set('customType', (opts.customType ?? 'image') satisfies CanvasCustomType)
    canvas.add(img)
    canvas.setActiveObject(img)
    canvas.requestRenderAll()
    return img
  } catch (err) {
    console.warn('[canvas/objects] addImageFromUrl failed:', err)
    return null
  }
}

/** Set the canvas background color and re-render. */
export function setCanvasBackground(canvas: FabricCanvas, color: string): void {
  canvas.backgroundColor = color
  canvas.requestRenderAll()
}

/** Wrap every object on the canvas in an ActiveSelection so they move/scale together. */
export function selectAllObjects(canvas: FabricCanvas): void {
  const objects = canvas.getObjects()
  if (objects.length === 0) return
  const sel = new fabric.ActiveSelection(objects, { canvas })
  canvas.setActiveObject(sel)
  canvas.requestRenderAll()
}

/** Get the underlying objects of an ActiveSelection (or [obj] for a single selection). */
export function objectsFromSelection(obj: FabricObject): FabricObject[] {
  const sel = obj as unknown as { _objects?: FabricObject[] }
  return sel._objects ?? [obj]
}

/**
 * Drop a pre-tagged "required label section" text block for the FDA scan
 * (DS-55). Each role gets sensible defaults — type size, weight, and a
 * placeholder string — that match what a creator would actually type for
 * that section. The customRole stamp is what the compliance scanner
 * looks for; without it the scanner can't reliably tell which free-typed
 * text is the ingredient statement vs. a tagline.
 *
 * Returns the new IText so callers can chain further customization.
 */
export function addLabelSection(
  canvas: FabricCanvas,
  role: LabelSectionRole,
  opts: {
    /** Initial text. Defaults vary per role. */
    text?: string
    /** Override fill (default ink-900). */
    fill?: string
    /** Override max-width in px so long ingredient lists wrap. */
    width?: number
  } = {},
): FabricObject {
  const presets = LABEL_SECTION_PRESETS[role]
  const center = getCanvasCenter(canvas)
  const obj = new fabric.IText(opts.text ?? presets.placeholder, {
    left: center.x,
    top: center.y,
    originX: 'center',
    originY: 'center',
    fontFamily: presets.fontFamily,
    fontSize: presets.fontSize,
    fontWeight: presets.fontWeight,
    fill: opts.fill ?? '#0F1116',
    editable: true,
    textAlign: presets.textAlign,
  })
  if (opts.width ?? presets.width) {
    obj.set('width', opts.width ?? presets.width)
  }
  obj.set('customType', 'text' satisfies CanvasCustomType)
  obj.set('customRole', role satisfies LabelSectionRole)
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  return obj
}

/**
 * Per-section defaults. Tuned so the dropped object looks plausibly like
 * the section it represents — statement of identity reads big and bold,
 * ingredient list reads small and dense, manufacturer info reads small
 * and fine.
 */
const LABEL_SECTION_PRESETS: Record<
  LabelSectionRole,
  {
    placeholder: string
    fontFamily: string
    fontSize: number
    fontWeight: number | string
    textAlign: 'left' | 'center' | 'right'
    width?: number
  }
> = {
  'statement-of-identity': {
    placeholder: 'Product Name',
    fontFamily: 'Bricolage Grotesque, sans-serif',
    fontSize: 36,
    fontWeight: 700,
    textAlign: 'center',
  },
  ingredients: {
    placeholder:
      'INGREDIENTS: Water, sugar, natural flavor, citric acid.',
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    fontWeight: 400,
    textAlign: 'left',
    width: 320,
  },
  allergens: {
    placeholder: 'CONTAINS: Milk, Soy.',
    fontFamily: 'Inter, sans-serif',
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'left',
  },
  'net-weight': {
    placeholder: 'NET WT 12 OZ (340g)',
    fontFamily: 'Inter, sans-serif',
    fontSize: 16,
    fontWeight: 700,
    textAlign: 'center',
  },
  'manufacturer-info': {
    placeholder: 'Manufactured for Your Brand · 123 Main St · City, ST 00000',
    fontFamily: 'Inter, sans-serif',
    fontSize: 10,
    fontWeight: 400,
    textAlign: 'left',
    width: 280,
  },
}

/** Human label for each section role — used in drawers + the scan panel. */
export const LABEL_SECTION_LABELS: Record<LabelSectionRole, string> = {
  'statement-of-identity': 'Statement of identity',
  ingredients: 'Ingredient statement',
  allergens: 'Allergen statement',
  'net-weight': 'Net quantity',
  'manufacturer-info': 'Manufacturer / Distributor',
}

/**
 * Read the customRole stamp off an object. Returns null for untagged
 * free-typed text or non-text objects.
 */
export function getLabelSectionRole(
  obj: FabricObject | null | undefined,
): LabelSectionRole | null {
  if (!obj) return null
  const role = (obj as { customRole?: LabelSectionRole }).customRole
  if (
    role === 'statement-of-identity' ||
    role === 'ingredients' ||
    role === 'allergens' ||
    role === 'net-weight' ||
    role === 'manufacturer-info'
  ) {
    return role
  }
  return null
}

/**
 * Compute the center of the canvas in its current coordinate space.
 * Respects the active viewport zoom + pan transform so newly-added objects
 * always land in the visible area.
 */
function getCanvasCenter(canvas: FabricCanvas): { x: number; y: number } {
  const vpt = canvas.viewportTransform
  const w = canvas.getWidth()
  const h = canvas.getHeight()
  if (!vpt) {
    return { x: w / 2, y: h / 2 }
  }
  // Invert the viewport transform to get the world-space center of the visible area.
  const cx = (w / 2 - vpt[4]) / vpt[0]
  const cy = (h / 2 - vpt[5]) / vpt[3]
  return { x: cx, y: cy }
}
