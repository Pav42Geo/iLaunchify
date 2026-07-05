// Per-flavor labels Phase 2 — derive a flavor's design from the shared base
// (docs/HANDOFF-TO-CODE-per-flavor-labels.md §4: "shared base + per-flavor
// overrides"). PURE: operates on a deep copy of the Fabric toObject() JSON so it
// is unit-testable and runs server-side (no canvas). Swaps the statement-of-
// identity text to the flavor name and recolors brand-accent-filled objects to
// the flavor's swatch. The nutrition-panel rebind (per-flavor recipe → real
// Facts) is Phase 2b — it needs panel regeneration, not a JSON token swap.
//
// BIND (docs/PER_FLAVOR_LABEL_SAFETY_UX.md §1): the swapped SoI + accent are
// "managed/locked tokens" — this stamps customData.flavorToken on them (which
// round-trips via CANVAS_PROPERTIES_TO_INCLUDE) so the Studio can enforce the
// lock on the live canvas (SoI can't be retyped to another flavor). `editable:
// false` is set in the JSON too (read by loadFromJSON on first load).

export interface FlavorBindInput {
  name: string
  statementOfIdentity?: string | null
  swatchHex?: string | null
}

/** customData marker stamped on the flavor-bound tokens. The live-canvas lock
 *  (CanvasLayoutShell) reads this to make the SoI non-editable. */
export type FlavorToken = 'soi' | 'accent'

interface FabObj {
  customRole?: string
  text?: unknown
  fill?: unknown
  editable?: boolean
  customData?: unknown
  objects?: FabObj[]
  [k: string]: unknown
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
}

/** Read the flavor-token marker off an object's customData (or infer 'soi' from
 *  the statement-of-identity role). Null when the object is not a flavor token. */
export function flavorTokenOf(o: {
  customRole?: string
  customData?: unknown
}): FlavorToken | null {
  const tok = (asObj(o.customData).flavorToken as string | undefined) ?? null
  if (tok === 'soi' || tok === 'accent') return tok
  if (o.customRole === 'statement-of-identity') return 'soi'
  return null
}

/** Normalize a hex string for comparison: lowercase, expand #abc → #aabbcc. */
function normHex(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let h = v.trim().toLowerCase()
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(h)) return null
  if (h.length === 4) h = '#' + h[1]! + h[1]! + h[2]! + h[2]! + h[3]! + h[3]!
  return h
}

/**
 * Clone the base design JSON for a flavor. Returns a NEW object (base untouched):
 * the SoI text becomes the flavor's name, and any object filled with the brand
 * accent becomes the flavor's swatch. Recurses into groups.
 */
export function bindFlavorToDesign(
  baseJson: unknown,
  flavor: FlavorBindInput,
  brandAccent?: string | null,
): unknown {
  if (!baseJson || typeof baseJson !== 'object') return baseJson
  const json = structuredClone(baseJson) as { objects?: FabObj[] }
  const soi = flavor.statementOfIdentity?.trim() || flavor.name
  const accentFrom = normHex(brandAccent)
  const accentTo = normHex(flavor.swatchHex)

  const walk = (objs: FabObj[] | undefined) => {
    if (!Array.isArray(objs)) return
    for (const o of objs) {
      if (o.customRole === 'statement-of-identity' && typeof o.text === 'string') {
        o.text = soi
        // BIND: the flavor NAME is a managed token — mark it + lock text editing so
        // it can't be retyped to another flavor. customData rides serialization;
        // the live-canvas lock (CanvasLayoutShell) re-enforces `editable` on load.
        o.editable = false
        o.customData = { ...asObj(o.customData), flavorToken: 'soi' satisfies FlavorToken }
      }
      if (accentFrom && accentTo && normHex(o.fill) === accentFrom) {
        o.fill = flavor.swatchHex
        // BIND: the accent COLOR is a managed token — tag it so recolor stays bound.
        o.customData = { ...asObj(o.customData), flavorToken: 'accent' satisfies FlavorToken }
      }
      walk(o.objects)
    }
  }
  walk(json.objects)
  return json
}
