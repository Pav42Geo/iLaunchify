'use client'

// Track C — render a facts panel onto a standalone canvas for previews (e.g.
// the admin label-format detail page). Picks the renderer by labeling type +
// format, fills with sample data, then fits the rendered group to the canvas.
// All Fabric usage stays inside @ilaunchify/ui so consumers (admin) never need
// a direct fabric dependency.

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'
import { addNutritionFactsPanel, SAMPLE_NUTRITION_DATA } from './nutritionPanel'
import { addAggregateNutritionPanel, SAMPLE_AGGREGATE_NUTRITION_DATA } from './aggregateNutritionPanel'
import { addSupplementFactsPanel, SAMPLE_SUPPLEMENT_DATA } from './supplementPanel'
import { addDrugFactsPanel, SAMPLE_DRUG_FACTS_DATA } from './drugFactsPanel'
import { addAafcoPanel, SAMPLE_AAFCO_DATA } from './aafcoPanel'

async function renderFor(
  canvas: FabricCanvas,
  labelingType: string,
  format: string,
): Promise<FabricObject | null> {
  switch (labelingType) {
    case 'DIETARY_SUPPLEMENT':
      return addSupplementFactsPanel(canvas, SAMPLE_SUPPLEMENT_DATA, {})
    case 'OTC':
      return addDrugFactsPanel(canvas, SAMPLE_DRUG_FACTS_DATA, {})
    case 'PET_PRODUCT':
      return addAafcoPanel(canvas, SAMPLE_AAFCO_DATA, { format })
    case 'FOOD':
    default:
      if (format === 'FDA_AGGREGATE') {
        return addAggregateNutritionPanel(canvas, SAMPLE_AGGREGATE_NUTRITION_DATA, {})
      }
      return addNutritionFactsPanel(canvas, SAMPLE_NUTRITION_DATA, { format })
  }
}

export interface FactsPreviewOpts {
  labelingType: string
  format: string
  width?: number
  height?: number
}

/**
 * Render a sample facts panel onto `el` and fit it. Returns a disposer the
 * caller MUST invoke on unmount (frees the Fabric canvas + listeners).
 */
export async function renderFactsPreview(
  el: HTMLCanvasElement,
  opts: FactsPreviewOpts,
): Promise<{ dispose: () => void }> {
  const width = opts.width ?? 360
  const height = opts.height ?? 440
  const canvas = new fabric.Canvas(el, {
    width,
    height,
    backgroundColor: '#ffffff',
    selection: false,
    renderOnAddRemove: false,
  }) as unknown as FabricCanvas

  let obj: FabricObject | null = null
  try {
    obj = await renderFor(canvas, opts.labelingType, opts.format)
  } catch {
    obj = null
  }

  if (obj) {
    // Non-interactive preview — drop the selection the renderer set.
    ;(canvas as unknown as { discardActiveObject?: () => void }).discardActiveObject?.()
    obj.set({ selectable: false, evented: false })
    obj.setCoords()
    const br = obj.getBoundingRect()
    if (br.width > 0 && br.height > 0) {
      const zoom = Math.min(width / br.width, height / br.height) * 0.9
      const cx = br.left + br.width / 2
      const cy = br.top + br.height / 2
      canvas.setViewportTransform([zoom, 0, 0, zoom, width / 2 - cx * zoom, height / 2 - cy * zoom])
    }
  }

  canvas.requestRenderAll()
  return { dispose: () => canvas.dispose() }
}
