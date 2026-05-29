'use client'

// useLabelMinSize — clamps Fabric scale handles + selection state so a
// required-label-section text or the Nutrition Facts panel can't be
// shrunk below the FDA-mandated type-size minimum (DS-58d / DS-71).
//
// Why this needs to live at the canvas level: the TextFormatToolbar's
// font-size input is one path users can take to make text smaller. The
// other path is dragging a scale handle on the object itself. Both must
// enforce the same minimum or the constraint is circumventable.
//
// V1 (DS-58d) clamped scaleX/scaleY during `object:scaling`. That fixed
// the displayed size but NOT the position — when the user drags a corner
// handle, fabric updates `left`/`top` to keep the opposite corner fixed.
// Clamping scale alone leaves those position fields offset, so the
// object visually drifts across the template as the user keeps dragging.
//
// DS-71 fixes that by tracking the LAST VALID TRANSFORM (scale + position
// together) per object during the gesture and restoring all four fields
// when the user crosses the min. Fabric's internal state then matches
// what's actually rendered, so subsequent drag deltas compute correctly.
//
// Defense-in-depth: we also re-validate on selection:created and
// object:added so objects loaded from JSON (after refresh / tab switch /
// undo / paste) get re-clamped immediately if their saved scale is below
// the rule — guards against the case where some non-canvas mutation
// path bypassed the live `object:scaling` enforcement.

import * as React from 'react'
import {
  LABEL_SECTION_MIN_FONT_SIZE,
  NUTRITION_FACTS_MIN_SCALE,
  type CanvasCustomType,
  type FabricCanvas,
  type FabricObject,
  type LabelSectionRole,
} from '@ilaunchify/ui'

interface ValidTransform {
  scaleX: number
  scaleY: number
  left: number
  top: number
}

interface Rule {
  kind: 'text-section' | 'nutrition-panel' | null
  /** Minimum allowed uniform scale for this object. */
  minScale: number
}

export function useLabelMinSize(canvas: FabricCanvas | null) {
  // Captured at the start of a scaling gesture. WeakMap so disposed
  // fabric objects get garbage-collected naturally.
  const lastValidRef = React.useRef<WeakMap<FabricObject, ValidTransform>>(
    new WeakMap(),
  )

  React.useEffect(() => {
    if (!canvas) return

    /**
     * Resolve the rule for a given object — returns null if the object
     * isn't a rule-bearing required-label section or NFR.
     */
    function ruleFor(obj: FabricObject): Rule {
      const ct = (obj as { customType?: CanvasCustomType }).customType
      const cr = (obj as { customRole?: LabelSectionRole }).customRole
      if (cr && cr in LABEL_SECTION_MIN_FONT_SIZE) {
        const min = LABEL_SECTION_MIN_FONT_SIZE[cr]
        const base = (obj as { fontSize?: number }).fontSize ?? 12
        return { kind: 'text-section', minScale: min / base }
      }
      if (ct === 'nutrition-panel') {
        return { kind: 'nutrition-panel', minScale: NUTRITION_FACTS_MIN_SCALE }
      }
      return { kind: null, minScale: 0 }
    }

    function readTransform(obj: FabricObject): ValidTransform {
      const o = obj as unknown as {
        scaleX?: number
        scaleY?: number
        left?: number
        top?: number
      }
      return {
        scaleX: o.scaleX ?? 1,
        scaleY: o.scaleY ?? 1,
        left: o.left ?? 0,
        top: o.top ?? 0,
      }
    }

    /**
     * Capture the starting transform when the user begins a scale
     * gesture. The first `object:scaling` event has already mutated the
     * object, so capturing here means we have a known-good state to
     * revert to.
     */
    function handleMouseDown(e: { target?: FabricObject }) {
      const obj = e.target
      if (!obj) return
      const rule = ruleFor(obj)
      if (rule.kind === null) return
      lastValidRef.current.set(obj, readTransform(obj))
    }

    function handleScaling(e: { target?: FabricObject }) {
      const obj = e.target
      if (!obj) return
      const rule = ruleFor(obj)
      if (rule.kind === null) return

      const o = obj as unknown as {
        scaleX?: number
        scaleY?: number
        set: (props: object) => void
      }
      const scaleX = o.scaleX ?? 1
      const scaleY = o.scaleY ?? 1

      // Below min — restore the LAST VALID transform completely so
      // fabric's internal state matches what we render. Without
      // restoring left/top, fabric keeps drifting the object as the
      // user drags further (because its internal anchor math assumes
      // the scale we just clamped away).
      if (scaleX < rule.minScale || scaleY < rule.minScale) {
        const valid = lastValidRef.current.get(obj)
        if (valid) {
          o.set({
            scaleX: valid.scaleX,
            scaleY: valid.scaleY,
            left: valid.left,
            top: valid.top,
          })
        } else {
          // mouse:down didn't fire for this object (e.g. scaling started
          // via API call). Clamp scale only as fallback.
          const clamped = Math.max(scaleX, scaleY, rule.minScale)
          o.set({ scaleX: clamped, scaleY: clamped })
        }
        return
      }

      // Above min — this is the new valid state. Snapshot so the next
      // below-min step has a clean target to revert to.
      lastValidRef.current.set(obj, readTransform(obj))
    }

    function handleMouseUp() {
      // Start the next gesture fresh.
      lastValidRef.current = new WeakMap()
    }

    /**
     * Enforce min scale on objects newly added to / loaded into the
     * canvas (DS-71). Catches the post-refresh case where a stored
     * scale somehow fell below the rule (e.g. early-bug autosave) —
     * clamps it on load instead of silently letting the bad state
     * persist.
     */
    function enforceOn(obj: FabricObject) {
      if (!obj) return
      const rule = ruleFor(obj)
      if (rule.kind === null) return
      const o = obj as unknown as {
        scaleX?: number
        scaleY?: number
        set: (props: object) => void
      }
      const scaleX = o.scaleX ?? 1
      const scaleY = o.scaleY ?? 1
      if (scaleX < rule.minScale || scaleY < rule.minScale) {
        const clamped = Math.max(scaleX, scaleY, rule.minScale)
        o.set({ scaleX: clamped, scaleY: clamped })
        if (canvas) canvas.requestRenderAll()
      }
    }

    function handleAdded(e: { target?: FabricObject }) {
      if (e.target) enforceOn(e.target)
    }

    function handleSelectionCreated(e: { selected?: FabricObject[] }) {
      for (const obj of e.selected ?? []) enforceOn(obj)
    }

    canvas.on('mouse:down', handleMouseDown)
    canvas.on('object:scaling', handleScaling)
    canvas.on('mouse:up', handleMouseUp)
    canvas.on('object:added', handleAdded)
    canvas.on('selection:created', handleSelectionCreated)

    // Sweep any objects already on the canvas at mount-time — covers
    // the loadFromJSON-then-attach race after refresh.
    for (const obj of canvas.getObjects()) enforceOn(obj)

    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('object:scaling', handleScaling)
      canvas.off('mouse:up', handleMouseUp)
      canvas.off('object:added', handleAdded)
      canvas.off('selection:created', handleSelectionCreated)
    }
  }, [canvas])
}
