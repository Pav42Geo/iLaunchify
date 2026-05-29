'use client'

// useLabelMinSize — clamps Fabric scale handles so a required-label-section
// text or the Nutrition Facts panel can't be shrunk below the FDA-mandated
// type-size minimum (DS-58d).
//
// Why this needs to live at the canvas level (not the toolbar): the
// TextFormatToolbar's font-size input is one path users can take to make
// text smaller. The other path is dragging a scale handle on the object
// itself. Both must enforce the same minimum or the constraint is
// circumventable.
//
// We hook into Fabric's `object:scaling` event, which fires continuously
// while the user drags a handle. We compute the effective font size as
//   effective = baseFontSize * scaleX
// then clamp scaleX so effective ≥ the FDA minimum for the object's role.
//
// For the NFR group we use the group's scale + the baked-in title size
// (22pt, see nutritionPanel.ts) against the title min (13pt).

import * as React from 'react'
import {
  LABEL_SECTION_MIN_FONT_SIZE,
  NUTRITION_FACTS_MIN_SCALE,
  type CanvasCustomType,
  type FabricCanvas,
  type FabricObject,
  type LabelSectionRole,
} from '@ilaunchify/ui'

export function useLabelMinSize(canvas: FabricCanvas | null) {
  React.useEffect(() => {
    if (!canvas) return

    function handleScaling(e: { target?: FabricObject }) {
      const obj = e.target
      if (!obj) return

      const ct = (obj as { customType?: CanvasCustomType }).customType
      const cr = (obj as { customRole?: LabelSectionRole }).customRole

      // Cast for typed access to the scale fields.
      const o = obj as unknown as {
        scaleX?: number
        scaleY?: number
        fontSize?: number
        set: (k: string | object, v?: unknown) => void
      }
      const scaleX = o.scaleX ?? 1
      const scaleY = o.scaleY ?? 1

      // ---- Tagged required-label-section text ----
      if (cr && cr in LABEL_SECTION_MIN_FONT_SIZE) {
        const min = LABEL_SECTION_MIN_FONT_SIZE[cr]
        const base = o.fontSize ?? 12
        const minScale = min / base
        if (scaleX < minScale || scaleY < minScale) {
          const clamped = Math.max(scaleX, scaleY, minScale)
          o.set({ scaleX: clamped, scaleY: clamped })
        }
        return
      }

      // ---- Nutrition Facts group ----
      if (ct === 'nutrition-panel') {
        if (scaleX < NUTRITION_FACTS_MIN_SCALE || scaleY < NUTRITION_FACTS_MIN_SCALE) {
          const clamped = Math.max(scaleX, scaleY, NUTRITION_FACTS_MIN_SCALE)
          o.set({ scaleX: clamped, scaleY: clamped })
        }
        return
      }
    }

    canvas.on('object:scaling', handleScaling)
    return () => {
      canvas.off('object:scaling', handleScaling)
    }
  }, [canvas])
}
