'use client'

// Canvas helpers for QR codes + 1D barcodes.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tools #9 (QR Code) and #10 (Barcode).
//
// Both produce a PNG data URL that the canvas Images pipeline can drop
// onto the Fabric surface like any other image — once on the canvas the
// creator can resize/move it with the standard Fabric handles.

import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'

/** Supported 1D barcode formats. Names match jsbarcode internals. */
export type BarcodeFormat =
  | 'CODE128'
  | 'CODE39'
  | 'EAN13'
  | 'EAN8'
  | 'UPC'
  | 'ITF14'

export const BARCODE_FORMATS: Array<{
  value: BarcodeFormat
  label: string
  hint: string
}> = [
  { value: 'UPC', label: 'UPC-A', hint: '12 digits · retail product code' },
  { value: 'EAN13', label: 'EAN-13', hint: '13 digits · global retail standard' },
  { value: 'EAN8', label: 'EAN-8', hint: '8 digits · short EAN' },
  { value: 'CODE128', label: 'Code 128', hint: 'Alphanumeric · most flexible' },
  { value: 'CODE39', label: 'Code 39', hint: 'A–Z, 0–9, + symbols' },
  { value: 'ITF14', label: 'ITF-14', hint: '14 digits · shipping cartons' },
]

/**
 * Generate a high-resolution QR code PNG data URL.
 *
 * Uses high error-correction (H, ~30%) so the code stays scannable even
 * after logo overlays or print-quality degradation on packaging.
 */
export async function generateQrCodeDataUrl(
  text: string,
  opts: { size?: number; dark?: string; light?: string } = {},
): Promise<string> {
  const size = opts.size ?? 512
  return QRCode.toDataURL(text, {
    type: 'image/png',
    width: size,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: {
      dark: opts.dark ?? '#000000',
      light: opts.light ?? '#FFFFFF',
    },
  })
}

/**
 * Generate a 1D barcode PNG data URL. Returns null if the input is
 * invalid for the chosen format (e.g. letters in UPC, wrong digit count).
 */
export function generateBarcodeDataUrl(
  text: string,
  format: BarcodeFormat,
  opts: {
    width?: number
    height?: number
    displayValue?: boolean
    background?: string
    lineColor?: string
  } = {},
): string | null {
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, text, {
      format,
      width: opts.width ?? 2,
      height: opts.height ?? 100,
      displayValue: opts.displayValue ?? true,
      background: opts.background ?? '#FFFFFF',
      lineColor: opts.lineColor ?? '#000000',
      margin: 6,
      fontOptions: 'bold',
      font: 'monospace',
      textMargin: 2,
      fontSize: 18,
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/* ============ canvas drop helpers ============ */

/** Generate + drop a QR code on the canvas at viewport center. */
export async function addQrCode(
  canvas: FabricCanvas,
  text: string,
  opts: { dark?: string; light?: string; maxFraction?: number } = {},
): Promise<FabricObject | null> {
  if (!text.trim()) return null
  const dataUrl = await generateQrCodeDataUrl(text, {
    dark: opts.dark,
    light: opts.light,
  })
  return dropDataUrl(canvas, dataUrl, opts.maxFraction ?? 0.25)
}

/** Generate + drop a 1D barcode on the canvas. */
export async function addBarcode(
  canvas: FabricCanvas,
  text: string,
  format: BarcodeFormat,
  opts: { background?: string; lineColor?: string; maxFraction?: number } = {},
): Promise<FabricObject | null> {
  if (!text.trim()) return null
  const dataUrl = generateBarcodeDataUrl(text, format, {
    background: opts.background,
    lineColor: opts.lineColor,
  })
  if (!dataUrl) return null
  return dropDataUrl(canvas, dataUrl, opts.maxFraction ?? 0.5)
}

async function dropDataUrl(
  canvas: FabricCanvas,
  dataUrl: string,
  maxFraction: number,
): Promise<FabricObject | null> {
  try {
    const img = await fabric.FabricImage.fromURL(dataUrl, {
      crossOrigin: 'anonymous',
    })
    const vpt = canvas.viewportTransform
    const w = canvas.getWidth()
    const h = canvas.getHeight()
    let cx = w / 2
    let cy = h / 2
    if (vpt) {
      cx = (w / 2 - vpt[4]) / vpt[0]
      cy = (h / 2 - vpt[5]) / vpt[3]
    }
    const maxEdge = Math.min(w, h) * maxFraction
    const longest = Math.max(img.width ?? 1, img.height ?? 1)
    const scale = longest > maxEdge ? maxEdge / longest : 1
    img.set({
      left: cx,
      top: cy,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
    })
    canvas.add(img)
    canvas.setActiveObject(img)
    canvas.requestRenderAll()
    return img
  } catch {
    return null
  }
}
