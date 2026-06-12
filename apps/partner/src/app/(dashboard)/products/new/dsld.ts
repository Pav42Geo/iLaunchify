// NIH DSLD (Dietary Supplement Label Database) parsing — Phase 1D.
//
// The DSLD v9 search endpoint (`/search-filter?q=…`) returns PRODUCTS (labels),
// each with an `allIngredients[]` array. For the supplement formulator we want
// distinct DIETARY ingredients matching the query: DSLD provides the validated
// identity (name, category, chemical form, plant/alt name); the manufacturer sets
// the amount + %DV. Pure + framework-free so it's unit-testable without network.
// docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 1).

export interface DsldIngredientCandidate {
  id: string // slug of the ingredient group
  name: string // normalized group name, e.g. "Vitamin C"
  category: string // 'vitamin' | 'mineral' | 'botanical' | 'amino acid' | …
  form?: string // chemical form, e.g. "Sodium Ascorbate"
  altName?: string // alternate name, e.g. "Ascorbic Acid"
}

// Categories that are dietary ingredients (belong IN the Supplement Facts box).
// Everything else (sugar, fat, color, flavor, animal part, non-nutrient) is an
// excipient → the "Other ingredients" line, not a dietary-ingredient candidate.
const DIETARY_CATEGORIES = new Set([
  'vitamin', 'mineral', 'botanical', 'amino acid', 'protein', 'probiotic',
  'enzyme', 'fatty acid', 'nucleotide', 'carbohydrate',
])

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function parseNotes(notes: string): { form?: string; altName?: string } {
  const form = /Form:\s*(?:as\s+)?([^)]+)/i.exec(notes)?.[1]?.trim()
  const altName = /Alt\.?\s*Name:\s*([^)]+)/i.exec(notes)?.[1]?.trim()
  return { ...(form ? { form } : {}), ...(altName ? { altName } : {}) }
}

interface RawIngredient { ingredientGroup?: string; name?: string; category?: string; notes?: string }
interface RawHit { _source?: { allIngredients?: RawIngredient[] } }

/** Extract distinct dietary-ingredient candidates from a DSLD search response,
 *  ranked by relevance to the query. Pure — no network. */
export function parseDsldHits(json: unknown, query: string, limit = 15): DsldIngredientCandidate[] {
  const hits = (json as { hits?: RawHit[] } | null)?.hits ?? []
  const q = query.trim().toLowerCase()
  const terms = q.split(/\s+/).filter(Boolean)
  const byId = new Map<string, DsldIngredientCandidate>()

  for (const hit of hits) {
    for (const ing of hit._source?.allIngredients ?? []) {
      const cat = (ing.category ?? '').toLowerCase()
      if (!DIETARY_CATEGORIES.has(cat)) continue
      // DSLD groups botanicals under a generic label ("Rose (unspecified)") with
      // the specific name in `name` ("Rose Hips") — prefer the specific one then.
      const group = (ing.ingredientGroup ?? '').trim()
      const specific = (ing.name ?? '').trim()
      const generic = !group || /unspecified|^other$/i.test(group)
      const name = generic && specific ? specific : group || specific
      if (!name) continue
      const { form, altName } = parseNotes(ing.notes ?? '')
      // Keep only ingredients relevant to the query (the product matched, but its
      // ingredient list includes unrelated items).
      const hay = `${name} ${altName ?? ''} ${ing.name ?? ''}`.toLowerCase()
      if (terms.length && !terms.every((t) => hay.includes(t))) continue
      const id = slug(name)
      if (!id || byId.has(id)) continue
      byId.set(id, { id, name, category: cat, ...(form ? { form } : {}), ...(altName ? { altName } : {}) })
    }
  }

  // Exact/prefix matches first, then the rest.
  const all = [...byId.values()]
  all.sort((a, b) => rank(a.name.toLowerCase(), q) - rank(b.name.toLowerCase(), q))
  return all.slice(0, limit)
}

function rank(name: string, q: string): number {
  if (!q) return 2
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  return 2
}

/** Build the label name a supplement uses: "Vitamin C (as Ascorbic Acid)". */
export function dsldLabelName(c: DsldIngredientCandidate): string {
  const source = c.form || c.altName
  return source ? `${c.name} (as ${source})` : c.name
}
