// Banned-product-category runtime gate (FDA_REGULATORY_POSTURE §5 item 14 /
// risk #9 second half / §7 #6). Complements the BannedIngredient dictionary:
// that blocks named substances, this blocks whole product TYPES that are
// federally fuzzy regardless of how the ingredient is named (CBD, kratom,
// THC isomers, infant formula).
//
// V1 = a constant hard-block floor (no schema). An admin-editable
// BannedProductCategory model is the V1.1 upgrade. Matched as whole-word terms
// against the template name + subcategory slug + niche slugs + ingredient names
// so it catches the type wherever it surfaces.

export interface BannedProductTerm {
  /** Lowercase whole-word match term. */
  term: string
  /** Human-facing label for the error + audit payload. */
  label: string
  /** Why it's blocked. */
  reason: string
  reference?: string
}

const BANNED_PRODUCT_TERMS: BannedProductTerm[] = [
  // Cannabinoids — FDA position: CBD/THC are not lawful dietary ingredients
  // in foods or supplements (21 USC 331(ll); FDA 2023 statement).
  { term: 'cbd', label: 'CBD', reason: 'FDA prohibits CBD in foods and dietary supplements (not a lawful dietary ingredient).' },
  { term: 'cannabidiol', label: 'Cannabidiol (CBD)', reason: 'FDA prohibits CBD in foods and dietary supplements.' },
  { term: 'thc', label: 'THC', reason: 'Tetrahydrocannabinol is not permitted in foods/supplements; controlled-substance + FDA exposure.' },
  { term: 'thca', label: 'THCA', reason: 'Cannabinoid not permitted in foods/supplements.' },
  { term: 'delta-8', label: 'Delta-8 THC', reason: 'Synthetic/concentrated cannabinoid; FDA warning letters + state bans.' },
  { term: 'delta 8', label: 'Delta-8 THC', reason: 'Synthetic/concentrated cannabinoid; FDA warning letters + state bans.' },
  { term: 'delta-9', label: 'Delta-9 THC', reason: 'Controlled cannabinoid not permitted in foods/supplements.' },
  { term: 'delta-10', label: 'Delta-10 THC', reason: 'Synthetic cannabinoid; FDA exposure.' },
  // Kratom — FDA has not approved any kratom use; import alerts + safety alerts.
  { term: 'kratom', label: 'Kratom', reason: 'FDA has not approved kratom; active import alerts and safety warnings.' },
  { term: 'mitragyna', label: 'Kratom (Mitragyna speciosa)', reason: 'FDA has not approved kratom; active import alerts and safety warnings.' },
  { term: 'mitragynine', label: 'Kratom alkaloid (mitragynine)', reason: 'Primary kratom alkaloid; FDA safety warnings.' },
  // Infant formula — requires FDA pre-market notification (21 CFR 106/107),
  // out of scope for V1 self-serve.
  { term: 'infant formula', label: 'Infant formula', reason: 'Requires FDA pre-market notification (21 CFR 106/107) — out of scope for V1.' },
]

export interface BannedProductTermMatch {
  term: string
  label: string
  reason: string
  reference: string | null
  /** Which haystack field the term hit (for the audit payload). */
  matchedIn: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Returns the first banned product-term that appears as a whole word in any of
 * the supplied signals, or null if the product type is clear.
 */
export function findBannedProductTerm(input: {
  name?: string | null
  subcategorySlug?: string | null
  nicheSlugs?: string[]
  ingredientNames?: Array<string | null | undefined>
}): BannedProductTermMatch | null {
  const fields: Array<{ field: string; value: string }> = []
  if (input.name) fields.push({ field: 'name', value: input.name })
  if (input.subcategorySlug) fields.push({ field: 'subcategory', value: input.subcategorySlug })
  for (const s of input.nicheSlugs ?? []) if (s) fields.push({ field: 'niche', value: s })
  for (const n of input.ingredientNames ?? []) if (n) fields.push({ field: 'ingredient', value: n })

  for (const b of BANNED_PRODUCT_TERMS) {
    // Slugs use hyphens as separators, so treat hyphen as a boundary too.
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(b.term)}([^a-z0-9]|$)`, 'i')
    for (const f of fields) {
      if (re.test(f.value)) {
        return { term: b.term, label: b.label, reason: b.reason, reference: b.reference ?? null, matchedIn: f.field }
      }
    }
  }
  return null
}
