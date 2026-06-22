'use client'

// Phase 2b Step C — the nutrition panel as a MANAGED, recipe-bound, regenerable
// object. addNutritionFactsPanel builds a Fabric Group with data baked in and
// no binding; these wrappers stamp the binding (customType + which flavor + the
// recipeHash) so the panel can be (a) detected, (b) checked for staleness (the
// recipeHash gate already on the canvas), and (c) regenerated IN PLACE with
// fresh data — recipe edit, flavor switch, or "refresh stale panel".

import {
  addNutritionFactsPanel,
  type FabricCanvas,
  type FabricObject,
  type NutritionPanelData,
} from '@ilaunchify/ui'

export interface NutritionBinding {
  /** The flavor whose recipe this panel reflects (null = base/shared). */
  flavorPresetId?: string | null
  /** Hash of the recipe the data was computed from (staleness gate). */
  recipeHash?: string | null
}

/** Render options forwarded verbatim to addNutritionFactsPanel (ink/bg/border/
 *  sections/format) — typed off the real signature so it can't drift. */
type PanelOpts = Parameters<typeof addNutritionFactsPanel>[2]

type Tagged = {
  customType?: string
  customData?: Record<string, unknown>
  recipeHash?: string | null
  frameSnapped?: boolean
  left?: number
  top?: number
  scaleX?: number
  scaleY?: number
  angle?: number
  set?: (props: Record<string, unknown>) => void
  setCoords?: () => void
}

/** The on-canvas nutrition panel (customType 'nutrition-panel'), or null. */
export function findNutritionPanel(canvas: FabricCanvas): FabricObject | null {
  for (const o of canvas.getObjects()) {
    if ((o as unknown as Tagged).customType === 'nutrition-panel') return o
  }
  return null
}

/** Add a recipe-bound Nutrition Facts panel + stamp its binding (customType,
 *  flavorPresetId, recipeHash) so it's a managed, staleness-tracked object. */
export async function addManagedNutritionPanel(
  canvas: FabricCanvas,
  data: NutritionPanelData,
  binding: NutritionBinding = {},
  opts: PanelOpts = {},
): Promise<FabricObject> {
  const obj = await addNutritionFactsPanel(canvas, data, opts)
  const o = obj as unknown as Tagged
  o.customType = 'nutrition-panel'
  o.customData = { ...(o.customData ?? {}), panelSource: 'recipe', flavorPresetId: binding.flavorPresetId ?? null }
  o.recipeHash = binding.recipeHash ?? null
  canvas.requestRenderAll()
  return obj
}

/** Regenerate the existing nutrition panel with fresh data, preserving its
 *  position / scale / angle / frame-snap. Adds one if none exists. */
export async function regenerateNutritionPanel(
  canvas: FabricCanvas,
  data: NutritionPanelData,
  binding: NutritionBinding = {},
  opts: PanelOpts = {},
): Promise<FabricObject> {
  const existing = findNutritionPanel(canvas)
  if (!existing) return addManagedNutritionPanel(canvas, data, binding, opts)

  const e = existing as unknown as Tagged
  const transform = { left: e.left, top: e.top, scaleX: e.scaleX, scaleY: e.scaleY, angle: e.angle }
  const wasSnapped = e.frameSnapped === true
  canvas.remove(existing)

  const obj = await addManagedNutritionPanel(canvas, data, binding, opts)
  const o = obj as unknown as Tagged
  o.set?.({
    left: transform.left,
    top: transform.top,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    angle: transform.angle,
  })
  if (wasSnapped) o.frameSnapped = true
  o.setCoords?.()
  canvas.requestRenderAll()
  return obj
}
