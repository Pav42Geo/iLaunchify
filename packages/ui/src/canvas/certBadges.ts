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
  /**
   * C6/C8 render gate — only auto-place a badge the creator has consented to
   * (LabelClaimConsent). `false` blocks the auto-add (the drawer opens a consent
   * modal instead). `undefined` is treated as allowed for backward compatibility
   * with callers that don't supply consent state. Already-placed badges are
   * never stripped for missing consent (grandfathered via the earned-set).
   */
  consented?: boolean
  /** C7 — the chosen artwork variant id, tagged on the canvas object. */
  variantId?: string
  /** C7 — per-variant reproduction bounds; useCertBadgeSizeRules reads these. */
  minWidthMm?: number | null
  maxWidthMm?: number | null
  /** C8 — text that must accompany the mark; auto-paired below the badge. */
  requiredCoText?: string | null
  /** C8 — clear-space = factor × mark height; compliance flags intrusions. */
  clearSpaceFactor?: number | null
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

/**
 * C8 — lock a cert badge's shape at drop time. A certification mark must keep
 * its aspect ratio (no stretching) and never flip, so we hide the mid-edge
 * (non-uniform) scale handles and leave only the corner (uniform) ones. The
 * min/max reproduction-size clamp on those corner handles lives in the
 * useCertBadgeSizeRules hook (it needs the live die-cut px-per-mm).
 */
function applyCertBadgeControls(obj: FabricObject): void {
  const o = obj as unknown as {
    set: (props: object) => void
    setControlsVisibility?: (v: Record<string, boolean>) => void
  }
  o.set({ lockScalingFlip: true })
  o.setControlsVisibility?.({ mt: false, mb: false, ml: false, mr: false })
}

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

// C8 — required co-text caption paired to a cert badge. A normal editable text
// object (customType 'text') tagged with the badge's certInstanceId so it can
// be found + removed when the badge is removed (a required claim must never be
// orphaned from its mark).
const CERT_COTEXT_LINK = 'coTextFor'

function coTextFor(o: FabricObject): string | null {
  const d = (o as { customData?: unknown }).customData
  if (d && typeof d === 'object' && CERT_COTEXT_LINK in d) {
    return String((d as Record<string, unknown>)[CERT_COTEXT_LINK])
  }
  return null
}

/** Remove the required-co-text caption(s) linked to a cert instance, if any. */
export function removeCertCoText(canvas: FabricCanvas, certInstanceId: string): void {
  for (const o of canvas.getObjects()) {
    if (coTextFor(o) === certInstanceId) canvas.remove(o)
  }
}

/** Drop a required-co-text caption just below a placed badge (idempotent). */
function addCertCoText(
  canvas: FabricCanvas,
  certInstanceId: string,
  text: string,
  badge: FabricObject,
  pxPerMm: number,
): void {
  // Already present → don't duplicate.
  for (const o of canvas.getObjects()) {
    if (coTextFor(o) === certInstanceId) return
  }
  const b = badge as unknown as {
    left?: number
    top?: number
    getScaledHeight?: () => number
  }
  const badgeHalfH = (b.getScaledHeight?.() ?? BADGE_SIZE_MM * pxPerMm) / 2
  const t = new fabric.IText(text, {
    left: b.left ?? 0,
    top: (b.top ?? 0) + badgeHalfH + 1 * pxPerMm,
    originX: 'center',
    originY: 'top',
    fontFamily: 'Inter, sans-serif',
    fontSize: Math.max(6, 2.5 * pxPerMm), // ~2.5mm legibility floor
    fill: '#0F1116',
    editable: true,
    textAlign: 'center',
  })
  ;(t as unknown as { set: (k: string, v: unknown) => void }).set('customType', 'text')
  ;(t as { customData?: unknown }).customData = { [CERT_COTEXT_LINK]: certInstanceId }
  canvas.add(t)
}

/** The certInstanceIds of every cert badge currently on the canvas. */
export function certBadgeIdsOnCanvas(canvas: FabricCanvas): Set<string> {
  const s = new Set<string>()
  for (const o of canvas.getObjects()) {
    if (!isCertBadge(o)) continue
    const id = badgeCertId(o)
    if (id) s.add(id)
  }
  return s
}

/** Find the cert badge object for a given certInstanceId, or null. */
export function findCertBadgeObject(
  canvas: FabricCanvas,
  certInstanceId: string,
): FabricObject | null {
  for (const o of canvas.getObjects()) {
    if (isCertBadge(o) && badgeCertId(o) === certInstanceId) return o
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

/**
 * Position the given badges as a centered row along the bottom safe area.
 *
 * Only ever called on NEWLY-added badges — existing badges keep their saved
 * coords so a creator's manual repositioning survives reopen (the cert zone
 * auto-appears, then it's movable).
 */
function placeBadges(
  canvas: FabricCanvas,
  toPlace: FabricObject[],
  die: CertBadgeDieCut,
  pxPerMm: number,
): void {
  if (toPlace.length === 0) return
  const sizePx = BADGE_SIZE_MM * pxPerMm
  const gapPx = BADGE_GAP_MM * pxPerMm
  const rowWidth = toPlace.length * sizePx + (toPlace.length - 1) * gapPx
  const startX = canvas.getWidth() / 2 - rowWidth / 2 + sizePx / 2
  const y = canvas.getHeight() - (die.bleedMm + die.safeAreaMm) * pxPerMm - sizePx / 2
  toPlace.forEach((b, i) => {
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

  // Remove badges whose cert is no longer earned — and their co-text caption,
  // so a required claim is never left orphaned on the label.
  for (const o of existing) {
    const id = badgeCertId(o)
    if (!id || !wantIds.has(id)) {
      canvas.remove(o)
      if (id) removeCertCoText(canvas, id)
    }
  }

  // Add newly-earned badges, collecting them so only the NEW ones get
  // auto-positioned (existing badges keep their saved/moved coords).
  const sizePx = BADGE_SIZE_MM * pxPerMm
  const added: FabricObject[] = []
  for (const b of want) {
    if (existingIds.has(b.certInstanceId)) continue
    // C6/C8 — never auto-stamp a badge the creator hasn't consented to. They
    // add it via the Label drawer, which fires the consent modal first.
    if (b.consented === false) continue
    const obj = await loadBadge(b.badgeUrl!, sizePx)
    if (!obj) continue
    ;(obj as { customType?: string }).customType = CERT_BADGE_TYPE
    ;(obj as { customData?: unknown }).customData = {
      certInstanceId: b.certInstanceId,
    }
    applyCertBadgeControls(obj)
    canvas.add(obj)
    added.push(obj)
  }

  placeBadges(canvas, added, die, pxPerMm)
  canvas.requestRenderAll()
}

/**
 * Add a single cert badge to the canvas (used by the studio's Certifications
 * control to re-place a badge the creator removed). No-op returning the
 * existing object if it's already present.
 */
export async function addCertBadge(
  canvas: FabricCanvas,
  badge: CertBadgePlacement,
  die: CertBadgeDieCut,
): Promise<FabricObject | null> {
  if (!badge.badgeUrl) return null
  const existing = findCertBadgeObject(canvas, badge.certInstanceId)
  if (existing) {
    canvas.setActiveObject(existing)
    canvas.requestRenderAll()
    return existing
  }
  const pxPerMm = canvas.getWidth() / (die.widthMm + 2 * die.bleedMm)
  const sizePx = BADGE_SIZE_MM * pxPerMm
  const obj = await loadBadge(badge.badgeUrl, sizePx)
  if (!obj) return null
  ;(obj as { customType?: string }).customType = CERT_BADGE_TYPE
  ;(obj as { customData?: unknown }).customData = {
    certInstanceId: badge.certInstanceId,
    ...(badge.variantId ? { variantId: badge.variantId } : {}),
    ...(badge.minWidthMm != null ? { minWidthMm: badge.minWidthMm } : {}),
    ...(badge.maxWidthMm != null ? { maxWidthMm: badge.maxWidthMm } : {}),
    ...(badge.clearSpaceFactor != null ? { clearSpaceFactor: badge.clearSpaceFactor } : {}),
  }
  applyCertBadgeControls(obj)
  canvas.add(obj)
  placeBadges(canvas, [obj], die, pxPerMm)
  // C8 — auto-pair the required co-text caption beneath the badge.
  if (badge.requiredCoText && badge.requiredCoText.trim()) {
    addCertCoText(canvas, badge.certInstanceId, badge.requiredCoText.trim(), obj, pxPerMm)
  }
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  return obj
}
