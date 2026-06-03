'use client'

// useCertBadgeSizeRules — C8 canvas object rule: a certification badge can't be
// shrunk below a legible reproduction size or blown up past a sane maximum.
//
// Cert marks have brand-standard min/max reproduction sizes (C7's
// CertificateAssetVariant.min/maxWidthMm). Until a specific variant is bound to
// the placed badge (the variant-chooser slice), we enforce platform-default
// bounds so a badge stays legible + on-spec. Mirrors useLabelMinSize's
// last-valid-transform restore so the object doesn't drift while clamped.
//
// Size is absolute (mm on the die), so the clamp converts mm → scale using the
// live px-per-mm (canvas width vs the bleed-inclusive die width), independent
// of viewport zoom — same derivation reconcileCertBadges uses.

import * as React from 'react'
import type { FabricCanvas, FabricObject } from '@ilaunchify/ui'

const CERT_BADGE_TYPE = 'cert-badge'
const CERT_BADGE_MIN_MM = 8 // legibility floor
const CERT_BADGE_MAX_MM = 40 // sane reproduction ceiling

interface ValidTransform {
  scaleX: number
  scaleY: number
  left: number
  top: number
}

function isCertBadge(obj: FabricObject): boolean {
  return (obj as { customType?: unknown }).customType === CERT_BADGE_TYPE
}

export function useCertBadgeSizeRules(
  canvas: FabricCanvas | null,
  dieCut: { widthMm: number; bleedMm: number },
) {
  const lastValidRef = React.useRef<WeakMap<FabricObject, ValidTransform>>(new WeakMap())

  React.useEffect(() => {
    if (!canvas) return
    const pxPerMm = canvas.getWidth() / (dieCut.widthMm + 2 * dieCut.bleedMm)

    // Min/max uniform scale for this badge given its intrinsic width.
    function scaleBounds(obj: FabricObject): { min: number; max: number } | null {
      const w = (obj as { width?: number }).width ?? 0
      if (w <= 0) return null
      return {
        min: (CERT_BADGE_MIN_MM * pxPerMm) / w,
        max: (CERT_BADGE_MAX_MM * pxPerMm) / w,
      }
    }

    function readTransform(obj: FabricObject): ValidTransform {
      const o = obj as { scaleX?: number; scaleY?: number; left?: number; top?: number }
      return { scaleX: o.scaleX ?? 1, scaleY: o.scaleY ?? 1, left: o.left ?? 0, top: o.top ?? 0 }
    }

    function handleMouseDown(e: { target?: FabricObject }) {
      const obj = e.target
      if (!obj || !isCertBadge(obj)) return
      lastValidRef.current.set(obj, readTransform(obj))
    }

    function handleScaling(e: { target?: FabricObject }) {
      const obj = e.target
      if (!obj || !isCertBadge(obj)) return
      const bounds = scaleBounds(obj)
      if (!bounds) return

      const o = obj as unknown as {
        scaleX?: number
        scaleY?: number
        set: (props: object) => void
        setCoords: () => void
      }
      const scaleX = o.scaleX ?? 1
      const scaleY = o.scaleY ?? 1

      const out = scaleX < bounds.min || scaleY < bounds.min || scaleX > bounds.max || scaleY > bounds.max
      if (!out) {
        lastValidRef.current.set(obj, readTransform(obj))
        return
      }

      const valid = lastValidRef.current.get(obj)
      if (valid) {
        // Restore the whole transform so fabric's anchor math doesn't drift.
        o.set({ scaleX: valid.scaleX, scaleY: valid.scaleY, left: valid.left, top: valid.top })
      } else {
        const clamped = Math.min(Math.max(scaleX, bounds.min), bounds.max)
        o.set({ scaleX: clamped, scaleY: clamped })
      }
      o.setCoords()
      canvas?.requestRenderAll()
    }

    function handleMouseUp() {
      lastValidRef.current = new WeakMap()
    }

    // Backstop: clamp on add / select / modify (covers JSON-loaded badges whose
    // saved scale somehow fell outside the bounds, and API-driven changes).
    function enforceOn(obj: FabricObject) {
      if (!obj || !isCertBadge(obj)) return
      const bounds = scaleBounds(obj)
      if (!bounds) return
      const o = obj as unknown as { scaleX?: number; scaleY?: number; set: (props: object) => void }
      const scaleX = o.scaleX ?? 1
      const scaleY = o.scaleY ?? 1
      const target = Math.min(Math.max(scaleX, bounds.min), bounds.max)
      if (Math.abs(target - scaleX) > 1e-4 || Math.abs(target - scaleY) > 1e-4) {
        o.set({ scaleX: target, scaleY: target })
        canvas?.requestRenderAll()
      }
    }

    function handleAdded(e: { target?: FabricObject }) {
      if (e.target) enforceOn(e.target)
    }
    function handleSelectionCreated(e: { selected?: FabricObject[] }) {
      for (const obj of e.selected ?? []) enforceOn(obj)
    }
    function handleModified(e: { target?: FabricObject }) {
      if (e.target) enforceOn(e.target)
    }

    canvas.on('mouse:down', handleMouseDown)
    canvas.on('object:scaling', handleScaling)
    canvas.on('mouse:up', handleMouseUp)
    canvas.on('object:added', handleAdded)
    canvas.on('selection:created', handleSelectionCreated)
    canvas.on('object:modified', handleModified)

    for (const obj of canvas.getObjects()) enforceOn(obj)

    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('object:scaling', handleScaling)
      canvas.off('mouse:up', handleMouseUp)
      canvas.off('object:added', handleAdded)
      canvas.off('selection:created', handleSelectionCreated)
      canvas.off('object:modified', handleModified)
    }
  }, [canvas, dieCut.widthMm, dieCut.bleedMm])
}
