// -----------------------------------------------------------------------------
// Design Reshape R1 — element re-anchoring (docs/DESIGN_RESHAPE_CROSS_DIELINE.md).
//
// Pure transform over a Fabric canvas JSON: carry a design's role-tagged objects
// onto a DIFFERENT surface. Role-tagged objects (logo, SoI, barcode, panels…)
// re-anchor into the target FrameLayout's matching frame; untagged decorative
// objects re-place proportionally with a UNIFORM object scale (layout stretches,
// objects never distort); the 'ai-concept' background cover-fits the new surface.
//
// V1 simplifications (documented, revisit with real art): rotation is preserved
// but ignored when computing bounding boxes; groups move as one object; only the
// FIRST frame of each kind is targeted.
// -----------------------------------------------------------------------------

// NOTE: no imports from ../canvas — scripts/run-vitest-suites.mjs transpiles this
// dir FLAT; a cross-dir import restructures the emit and silently drops every ui
// suite from the runner. The frame types below are structural subsets of
// canvas/frames' FrameLayout, so callers pass a FrameLayout directly.

/** Structural subset of canvas/frames' Frame this transform reads. */
export interface ReanchorFrame {
  kind: string
  box: { x: number; y: number; w: number; h: number }
  [key: string]: unknown
}

/** Structural subset of FrameLayout (assignable from it). */
export interface ReanchorFrameLayout {
  frames: ReanchorFrame[]
}

/** The subset of a serialized Fabric object this transform reads/writes. */
export interface ReanchorJsonObject {
  type?: string
  left?: number
  top?: number
  width?: number
  height?: number
  scaleX?: number
  scaleY?: number
  originX?: string
  originY?: string
  customType?: string
  customRole?: string
  [key: string]: unknown
}

export interface ReanchorCanvasJson {
  objects?: ReanchorJsonObject[]
  [key: string]: unknown
}

export interface SurfacePx {
  widthPx: number
  heightPx: number
}

/** customType / customRole → target frame kind (first matching frame wins). */
const TYPE_TO_FRAME: Record<string, string> = {
  'brand-logo': 'LOGO',
  barcode: 'BARCODE',
  'qr-code': 'BARCODE',
  'nutrition-panel': 'NUTRITION_FACTS',
  'nutrition-aggregate-panel': 'NUTRITION_FACTS',
  'supplement-panel': 'NUTRITION_FACTS',
  'aafco-panel': 'NUTRITION_FACTS',
  'drug-facts-panel': 'NUTRITION_FACTS',
}
const ROLE_TO_FRAME: Record<string, string> = {
  'statement-of-identity': 'STATEMENT_OF_IDENTITY',
  ingredients: 'INGREDIENTS',
  allergens: 'ALLERGENS',
  'manufacturer-info': 'MANUFACTURER',
}

function effSize(o: ReanchorJsonObject): { w: number; h: number } {
  return { w: (o.width ?? 0) * (o.scaleX ?? 1), h: (o.height ?? 0) * (o.scaleY ?? 1) }
}

/** Center of the object in canvas coords, honoring originX/originY. */
function centerOf(o: ReanchorJsonObject): { cx: number; cy: number } {
  const { w, h } = effSize(o)
  const left = o.left ?? 0
  const top = o.top ?? 0
  const cx = o.originX === 'center' ? left : o.originX === 'right' ? left - w / 2 : left + w / 2
  const cy = o.originY === 'center' ? top : o.originY === 'bottom' ? top - h / 2 : top + h / 2
  return { cx, cy }
}

/** Write a new center back as left/top, honoring the object's stored origin. */
function setCenter(o: ReanchorJsonObject, cx: number, cy: number): void {
  const { w, h } = effSize(o)
  o.left = o.originX === 'center' ? cx : o.originX === 'right' ? cx + w / 2 : cx - w / 2
  o.top = o.originY === 'center' ? cy : o.originY === 'bottom' ? cy + h / 2 : cy - h / 2
}

/**
 * Infer the source surface extent from the design's content bounding box —
 * the fallback when the template didn't record its authoring surface (V1
 * templates don't). Designs usually fill their surface, so the max extent is a
 * serviceable stand-in; callers with real dims should pass them instead.
 */
export function inferCanvasExtent(json: ReanchorCanvasJson): SurfacePx | null {
  const objs = json.objects ?? []
  let maxX = 0
  let maxY = 0
  for (const o of objs) {
    const { w, h } = effSize(o)
    const { cx, cy } = centerOf(o)
    maxX = Math.max(maxX, cx + w / 2)
    maxY = Math.max(maxY, cy + h / 2)
  }
  return maxX > 0 && maxY > 0 ? { widthPx: maxX, heightPx: maxY } : null
}

function frameKindFor(o: ReanchorJsonObject): string | null {
  if (o.customType && TYPE_TO_FRAME[o.customType]) return TYPE_TO_FRAME[o.customType]!
  if (o.customRole && ROLE_TO_FRAME[o.customRole]) return ROLE_TO_FRAME[o.customRole]!
  return null
}

/**
 * Re-anchor a Fabric canvas JSON from `source` onto `target`. Returns a NEW json
 * (deep copy); the input is never mutated. `frames` (target FrameLayout,
 * normalized 0..1 boxes) is optional — without it everything re-places
 * proportionally, which already fixes the raw cross-size load distortion.
 */
export function reanchorCanvasJson(
  json: ReanchorCanvasJson,
  source: SurfacePx,
  target: SurfacePx & { frames?: ReanchorFrameLayout | null },
): ReanchorCanvasJson {
  const out = JSON.parse(JSON.stringify(json)) as ReanchorCanvasJson
  const objs = out.objects ?? []
  const sw = Math.max(1, source.widthPx)
  const sh = Math.max(1, source.heightPx)
  const tw = Math.max(1, target.widthPx)
  const th = Math.max(1, target.heightPx)
  // Uniform object scale — objects keep their shape while the layout stretches.
  const uniform = Math.min(tw / sw, th / sh)
  const frames = target.frames?.frames ?? []

  for (const o of objs) {
    const { cx, cy } = centerOf(o)

    // Background art cover-fits the whole new surface.
    if (o.customType === 'ai-concept') {
      const { w, h } = effSize(o)
      if (w > 0 && h > 0) {
        const cover = Math.max(tw / w, th / h)
        o.scaleX = (o.scaleX ?? 1) * cover
        o.scaleY = (o.scaleY ?? 1) * cover
      }
      setCenter(o, tw / 2, th / 2)
      continue
    }

    // Role-tagged objects re-anchor into the target frame of their kind.
    const kind = frameKindFor(o)
    const frame = kind ? frames.find((f) => f.kind === kind) : undefined
    if (frame) {
      const fx = frame.box.x * tw
      const fy = frame.box.y * th
      const fw = Math.max(1, frame.box.w * tw)
      const fh = Math.max(1, frame.box.h * th)
      const { w, h } = effSize(o)
      if (w > 0 && h > 0) {
        const fit = Math.min(fw / w, fh / h)
        o.scaleX = (o.scaleX ?? 1) * fit
        o.scaleY = (o.scaleY ?? 1) * fit
      }
      setCenter(o, fx + fw / 2, fy + fh / 2)
      continue
    }

    // Everything else: proportional position, uniform scale.
    o.scaleX = (o.scaleX ?? 1) * uniform
    o.scaleY = (o.scaleY ?? 1) * uniform
    setCenter(o, (cx / sw) * tw, (cy / sh) * th)
  }

  return out
}
