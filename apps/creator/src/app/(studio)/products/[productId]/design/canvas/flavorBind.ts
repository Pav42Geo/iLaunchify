// Per-flavor labels Phase 2 — derive a flavor's design from the shared base
// (docs/HANDOFF-TO-CODE-per-flavor-labels.md §4: "shared base + per-flavor
// overrides"). PURE: operates on a deep copy of the Fabric toObject() JSON so it
// is unit-testable and runs server-side (no canvas). Swaps the statement-of-
// identity text to the flavor name and recolors brand-accent-filled objects to
// the flavor's swatch. The nutrition-panel rebind (per-flavor recipe → real
// Facts) is Phase 2b — it needs panel regeneration, not a JSON token swap.

export interface FlavorBindInput {
  name: string
  statementOfIdentity?: string | null
  swatchHex?: string | null
}

interface FabObj {
  customRole?: string
  text?: unknown
  fill?: unknown
  objects?: FabObj[]
  [k: string]: unknown
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
      }
      if (accentFrom && accentTo && normHex(o.fill) === accentFrom) {
        o.fill = flavor.swatchHex
      }
      walk(o.objects)
    }
  }
  walk(json.objects)
  return json
}
