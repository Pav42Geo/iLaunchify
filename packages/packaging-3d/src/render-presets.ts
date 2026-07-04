/**
 * @ilaunchify/packaging-3d — camera-angle catalog + default-thumbnail picker.
 *
 * Two pure concerns:
 *  1. CAMERA_PRESETS — the standard angles the intake auto-pipeline renders
 *     (G3.2: "4–6 neutral angles") and the vocabulary for `MockupAsset.cameraPreset`.
 *     Angles are azimuth/elevation in degrees; the app maps them to a three.js
 *     camera position (this package stays three.js-free).
 *  2. pickDefaultThumbnail — the always-on canonical thumbnail (plan §9.7): even
 *     when the creator skips curating, one clean studio render becomes the product
 *     thumbnail across product/order lists + the channel main-image candidate.
 */

import type { MockupAssetKind } from './types'

export interface CameraPreset {
  /** Stable id — also the `MockupAsset.cameraPreset` value. */
  id: string
  label: string
  /** Horizontal orbit angle (deg): 0 = front, 90 = right side, 180 = back. */
  azimuthDeg: number
  /** Vertical angle (deg): 0 = eye level, +up looks down from above. */
  elevationDeg: number
  /** The hero/default 3-quarter angle used for the thumbnail + listing lead. */
  primary: boolean
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'front', label: 'Front', azimuthDeg: 0, elevationDeg: 0, primary: false },
  { id: 'front-3q', label: 'Front 3/4 (hero)', azimuthDeg: 35, elevationDeg: 15, primary: true },
  { id: 'low-3q', label: 'Low 3/4', azimuthDeg: -35, elevationDeg: 8, primary: false },
  { id: 'side', label: 'Side', azimuthDeg: 90, elevationDeg: 0, primary: false },
  { id: 'back', label: 'Back', azimuthDeg: 180, elevationDeg: 0, primary: false },
  { id: 'top', label: 'Top', azimuthDeg: 0, elevationDeg: 80, primary: false },
]

/** The hero angle id — thumbnail default + listing lead. */
export const HERO_CAMERA_ID = 'front-3q'

/** The neutral angle set the intake auto-pipeline renders per package (G3.2). */
export const DEFAULT_INTAKE_ANGLES = ['front', 'front-3q', 'side', 'top'] as const

export function isCameraPreset(id: unknown): id is string {
  return typeof id === 'string' && CAMERA_PRESETS.some((c) => c.id === id)
}

export function getCameraPreset(id: string): CameraPreset | null {
  return CAMERA_PRESETS.find((c) => c.id === id) ?? null
}

// ── Default thumbnail (plan §9.7) ─────────────────────────────────────────────

export interface ThumbnailCandidate {
  id: string
  kind: MockupAssetKind
  cameraPreset?: string | null
}

/**
 * Pick the canonical thumbnail for a product (§9.7). Preference order:
 *   1. a clean STANDARD_RENDER on the hero (`front-3q`) camera,
 *   2. a STANDARD_RENDER on the `front` camera,
 *   3. any STANDARD_RENDER,
 *   4. any candidate (so a thumbnail always exists),
 *   5. null only when there are no candidates.
 * Deterministic; ties break on input order.
 */
export function pickDefaultThumbnail(candidates: ThumbnailCandidate[]): string | null {
  if (candidates.length === 0) return null
  const studio = candidates.filter((c) => c.kind === 'STANDARD_RENDER')
  const hero = studio.find((c) => c.cameraPreset === HERO_CAMERA_ID)
  if (hero) return hero.id
  const front = studio.find((c) => c.cameraPreset === 'front')
  if (front) return front.id
  if (studio[0]) return studio[0].id
  return candidates[0]?.id ?? null
}
