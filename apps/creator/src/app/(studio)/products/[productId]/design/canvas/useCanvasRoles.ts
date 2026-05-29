'use client'

// useCanvasRoles — exposes which required label-section roles are
// currently on the canvas, plus whether a Nutrition Facts panel is
// already present (DS-58c).
//
// The LabelDrawer uses this to disable "Add" buttons for sections that
// already exist, so creators can't accidentally drop a second Statement
// of identity / second Ingredient list / etc. Required sections must
// appear EXACTLY once per FDA spec; allowing duplicates would mean
// either (a) the second copy gets ignored at print time or (b) the
// canvas has two competing versions of legally-meaningful text.
//
// Re-runs on object:added / removed / modified so the drawer stays
// honest while the user edits.

import * as React from 'react'
import type {
  CanvasCustomType,
  FabricCanvas,
  FabricObject,
  LabelSectionRole,
} from '@ilaunchify/ui'

export interface CanvasRoles {
  /** Set of every customRole currently stamped on the canvas. */
  roles: Set<LabelSectionRole>
  /** True if at least one nutrition-panel customType is present. */
  nutritionPanelPresent: boolean
  /** Look up the first object carrying a given role, or null. */
  findByRole: (role: LabelSectionRole) => FabricObject | null
  /** Look up the first nutrition-panel customType object, or null. */
  findNutritionPanel: () => FabricObject | null
}

export function useCanvasRoles(canvas: FabricCanvas | null): CanvasRoles {
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!canvas) return
    const bump = () => setTick((n) => n + 1)
    canvas.on('object:added', bump)
    canvas.on('object:removed', bump)
    // Modified covers customRole edits (rare) + the autosave hook firing
    // after an in-place mutation by regenerateCodeImage / updateNutritionPanel.
    canvas.on('object:modified', bump)
    return () => {
      canvas.off('object:added', bump)
      canvas.off('object:removed', bump)
      canvas.off('object:modified', bump)
    }
  }, [canvas])

  return React.useMemo(() => {
    const roles = new Set<LabelSectionRole>()
    let nutritionPanelPresent = false
    const objects = canvas?.getObjects() ?? []
    for (const obj of objects) {
      const cr = (obj as { customRole?: LabelSectionRole }).customRole
      const ct = (obj as { customType?: CanvasCustomType }).customType
      if (cr) roles.add(cr)
      if (ct === 'nutrition-panel') nutritionPanelPresent = true
    }
    return {
      roles,
      nutritionPanelPresent,
      findByRole: (role: LabelSectionRole) => {
        for (const obj of canvas?.getObjects() ?? []) {
          const cr = (obj as { customRole?: LabelSectionRole }).customRole
          if (cr === role) return obj
        }
        return null
      },
      findNutritionPanel: () => {
        for (const obj of canvas?.getObjects() ?? []) {
          const ct = (obj as { customType?: CanvasCustomType }).customType
          if (ct === 'nutrition-panel') return obj
        }
        return null
      },
    }
    // We intentionally depend on `tick` so the memo invalidates after every
    // canvas mutation; the canvas instance itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, tick])
}
