// Per-flavor label safety — flavor-mismatch lint (docs/PER_FLAVOR_LABEL_SAFETY_UX.md §Verify).
//
// PURE + unit-testable (no canvas/DB dependency). Given the flavor currently being edited, the
// visible text on its surface, and the product's full flavor pool, it flags any text that mentions
// a DIFFERENT flavor's name or statement-of-identity — the "this is the Strawberry can but the art
// says Chocolate" mislabel. Code calls this from the Studio compliance scan and surfaces the
// warnings; this module makes no UI/side-effect decisions.

export interface FlavorRef {
  name: string
  statementOfIdentity?: string | null
}

export interface FlavorMismatchWarning {
  /** The offending visible text. */
  text: string
  /** The OTHER flavor it mentions (the one that should not appear on the active surface). */
  matchedFlavor: string
  /** Whether the match was on the flavor's name or its statement-of-identity. */
  kind: 'name' | 'soi'
}

// Ignore very short tokens — a 1–2 char "flavor" (or SoI) is too ambiguous to match safely.
const MIN_TOKEN = 3

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function normalize(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}
/** Whole-word / whole-phrase, case-insensitive containment ("chocolatey" does NOT match "Chocolate"). */
function mentions(haystack: string, needle: string): boolean {
  const n = normalize(needle)
  if (n.length < MIN_TOKEN) return false
  return new RegExp(`\\b${escapeRe(n)}\\b`, 'i').test(haystack)
}

/**
 * Detect wrong-flavor mentions on the active flavor's surface.
 *
 * @param activeFlavorName the flavor the creator is currently editing
 * @param visibleTexts     text content of the visible text objects on that surface
 * @param flavorPool       every flavor this product offers (incl. the active one)
 * @returns one warning per (text × other-flavor) match; empty when nothing is crossed.
 */
export function detectFlavorMismatch(
  activeFlavorName: string,
  visibleTexts: readonly string[],
  flavorPool: readonly FlavorRef[],
): FlavorMismatchWarning[] {
  const active = normalize(activeFlavorName).toLowerCase()
  const others = flavorPool.filter((f) => {
    const n = normalize(f.name).toLowerCase()
    return n.length > 0 && n !== active
  })

  const warnings: FlavorMismatchWarning[] = []
  const seen = new Set<string>()

  for (const raw of visibleTexts) {
    const text = normalize(raw)
    if (!text) continue
    for (const f of others) {
      const tokens: { value: string; kind: 'name' | 'soi' }[] = [{ value: f.name, kind: 'name' }]
      if (f.statementOfIdentity) tokens.push({ value: f.statementOfIdentity, kind: 'soi' })
      for (const tok of tokens) {
        // Skip tokens that are part of the ACTIVE flavor's own name, so an active "Mint Chip"
        // surface isn't flagged for the sibling "Mint" flavor when the art legitimately reads
        // "Mint Chip".
        if (mentions(activeFlavorName, tok.value)) continue
        if (mentions(text, tok.value)) {
          const key = `${text}::${f.name}::${tok.kind}`
          if (!seen.has(key)) {
            seen.add(key)
            warnings.push({ text, matchedFlavor: f.name, kind: tok.kind })
          }
          break // one warning per other-flavor per text
        }
      }
    }
  }
  return warnings
}
