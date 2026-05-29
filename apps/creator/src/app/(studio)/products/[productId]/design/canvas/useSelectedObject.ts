'use client'

import * as React from 'react'
import type {
  CanvasCustomType,
  FabricCanvas,
  FabricObject,
} from '@ilaunchify/ui'

/**
 * useSelectedObject — exposes the currently-active fabric object as React
 * state. Re-runs on selection:created / updated / cleared so floating
 * toolbars (text format, image controls, etc.) can react immediately.
 *
 * Also re-runs on object:modified so toolbars displaying the current value
 * of a property (e.g. font size) refresh after a direct mutation.
 */
export function useSelectedObject(canvas: FabricCanvas | null): FabricObject | null {
  const [selected, setSelected] = React.useState<FabricObject | null>(null)

  React.useEffect(() => {
    if (!canvas) {
      setSelected(null)
      return
    }

    function refresh() {
      if (!canvas) return
      setSelected((canvas.getActiveObject() as FabricObject | null) ?? null)
    }

    refresh()
    canvas.on('selection:created', refresh)
    canvas.on('selection:updated', refresh)
    canvas.on('selection:cleared', refresh)
    canvas.on('object:modified', refresh)
    return () => {
      canvas.off('selection:created', refresh)
      canvas.off('selection:updated', refresh)
      canvas.off('selection:cleared', refresh)
      canvas.off('object:modified', refresh)
    }
  }, [canvas])

  return selected
}

/** True iff the active object is some flavor of editable text. */
export function isTextObject(obj: FabricObject | null): boolean {
  if (!obj) return false
  const type = (obj as { type?: string }).type
  return type === 'i-text' || type === 'text' || type === 'textbox'
}

/** Read the customType tag we stamped on the object at add time (DS-53). */
export function getCustomType(
  obj: FabricObject | null,
): CanvasCustomType | null {
  if (!obj) return null
  const ct = (obj as { customType?: CanvasCustomType }).customType
  return ct ?? null
}

/**
 * True for plain image-shaped objects (uploads, brand logos). Codes
 * (qr-code / barcode / internal-sku) are intentionally EXCLUDED — they get
 * their own CodeToolbar that can also regenerate the encoded data.
 *
 * Use this together with [[isCodeCustomType]] in the shell to route
 * selections to exactly one toolbar.
 */
export function isImageLikeCustomType(ct: CanvasCustomType | null): boolean {
  return ct === 'image' || ct === 'brand-logo'
}

/**
 * True for generated code images (QR / 1D barcode / internal-SKU). These
 * are still fabric.Image objects under the hood but carry a typed
 * customData payload that lets CodeToolbar re-encode in place via
 * regenerateCodeImage (see packages/ui canvas/codes.ts).
 */
export function isCodeCustomType(ct: CanvasCustomType | null): boolean {
  return ct === 'qr-code' || ct === 'barcode' || ct === 'internal-sku'
}
