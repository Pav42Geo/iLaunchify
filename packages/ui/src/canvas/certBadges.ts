// Cert badge auto-placement for the Design Studio (DESIGN_STUDIO.md §Certificate
// badges V1). A managed "certification zone" on the host surface: reconciles the
// canvas to the earned-cert set on open — places each badge as VECTOR SVG in a
// centered row along the bottom safe area, tags it by certInstanceId (stored in
// `customData`, which round-trips through save/load) so re-opens don't
// duplicate, and removes badges whose cert is no longer earned.
//
// Badges are real Fabric objects (so they render + export), but managed: the
// creator can hide individual ones; layout + membership are reconciled here.

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'

export interface CertBadgePlacement {
  certInstanceId: string
  /** Admin-curated badge SVG/PNG URL; entries without a URL are skipped. */
  badgeUrl: string | null
}

export interface CertBadgeDieCut {
  widthMm: number
  heightMm: number
  bleedMm: number
  safeAreaMm: number
}

const CERT_BADGE_TYPE = 'cert-badge'
const BADGE_SIZE_MM = 12 // standardized badge size
const BADGE_GAP_MM = 2

function isCertBadge(o: FabricObject): boolean {
  return (o as { customType?: unknown }).customType === CERT_BADGE_TYPE
}

function badgeCertId(o: FabricObject): string | null {
  const d = (o as { customData?: unknown }).customData
  if (d && typeof d === 'object' && 'certInstanceId' in d) {
    return String((d as { certInstanceId: unknown }).certInstanceId)
  }
  return null
}

/** Load an SVG as a vector group; falls back to a raster image for PNG badges. */
async function loadBadge(url: string, sizePx: number): Promise<FabricObject | null> {
  try {
    const parsed = await fabric.loadSVGFromURL(url)
    const objects = (parsed.objects ?? []).filter(
      (o): o is FabricObject => o != null,
    )
    if (objects.length > 0) {
      const group = fabric.util.groupSVGElements(objects, parsed.options)
      const longest = Math.max(group.width || sizePx, group.height || sizePx)
      group.scale(sizePx / longest)
      return group as unknown as FabricObject
    }
  } catch {
    // not an SVG / parse failed — fall through to raster
  }
  try {
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const longest = Math.max(img.width ?? sizePx, img.height ?? sizePx)
    img.scale(sizePx / longest)
    return img
  } catch {
    return null
  }
}

/** Re-flow visible badges into a centered row along the bottom safe area. */
function layout(canvas: FabricCanvas, die: CertBadgeDieCut, pxPerMm: number): void {
  const badges = canvas.getObjects().filter((o) => isCertBadge(o) && o.visible !== false)
  if (badges.length === 0) return
  const sizePx = BADGE_SIZE_MM * pxPerMm
  const gapPx = BADGE_GAP_MM * pxPerMm
  const rowWidth = badges.length * sizePx + (badges.length - 1) * gapPx
  const startX = canvas.getWidth() / 2 - rowWidth / 2 + sizePx / 2
  const y = canvas.getHeight() - (die.bleedMm + die.safeAreaMm) * pxPerMm - sizePx / 2
  badges.forEach((b, i) => {
    b.set({
      originX: 'center',
      originY: 'center',
      left: startX + i * (sizePx + gapPx),
      top: y,
    })
    b.setCoords()
  })
}

/**
 * Reconcile the canvas's cert badges to `badges`. Idempotent: keeps existing
 * (by certInstanceId), adds newly-earned, removes no-longer-earned, then
 * re-lays-out the row. Call once the canvas + saved design have loaded.
 *
 * px-per-mm is derived from the canvas's own width vs the bleed-inclusive
 * die-cut, so it stays correct independent of viewport zoom.
 */
export async function reconcileCertBadges(
  canvas: FabricCanvas,
  badges: CertBadgePlacement[],
  die: CertBadgeDieCut,
): Promise<void> {
  const pxPerMm = canvas.getWidth() / (die.widthMm + 2 * die.bleedMm)
  const want = badges.filter((b) => b.badgeUrl)
  const wantIds = new Set(want.map((b) => b.certInstanceId))

  const existing = canvas.getObjects().filter(isCertBadge)
  const existingIds = new Set(
    existing.map(badgeCertId).filter((v): v is string => v != null),
  )

  // Remove badges whose cert is no longer earned.
  for (const o of existing) {
    const id = badgeCertId(o)
    if (!id || !wantIds.has(id)) canvas.remove(o)
  }

  // Add newly-earned badges.
  const sizePx = BADGE_SIZE_MM * pxPerMm
  for (const b of want) {
    if (existingIds.has(b.certInstanceId)) continue
    const obj = await loadBadge(b.badgeUrl!, sizePx)
    if (!obj) continue
    ;(obj as { customType?: string }).customType = CERT_BADGE_TYPE
    ;(obj as { customData?: unknown }).customData = {
      certInstanceId: b.certInstanceId,
    }
    canvas.add(obj)
  }

  layout(canvas, die, pxPerMm)
  canvas.requestRenderAll()
}
