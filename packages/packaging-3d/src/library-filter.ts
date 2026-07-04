/**
 * @ilaunchify/packaging-3d — mockup library browse: filtering + facet counts (G3.5 / §9.2).
 *
 * The browse taxonomy (admin library + creator preview share it): packaging type
 * (structural) → product category → size → style tags. This is the pure predicate
 * + facet-count engine behind URL-driven filter chips (every admin list surface
 * pattern). Facet counts implement the research finding that the strongest browse
 * affordance is inline per-facet counts (Mediamodifier). Pure; no DB/URL parsing.
 */

import type { StructuralPackType, MockupAssetKind, Dimensions } from './types'

// ── Size buckets (by longest edge, mm) ───────────────────────────────────────
export interface SizeBucket {
  id: string
  label: string
  /** inclusive lower bound on the longest edge (mm) */
  minMm: number
  /** exclusive upper bound (mm); Infinity for the top bucket */
  maxMm: number
}

export const SIZE_BUCKETS: SizeBucket[] = [
  { id: 'mini', label: 'Mini (<80mm)', minMm: 0, maxMm: 80 },
  { id: 'small', label: 'Small (80–150mm)', minMm: 80, maxMm: 150 },
  { id: 'medium', label: 'Medium (150–250mm)', minMm: 150, maxMm: 250 },
  { id: 'large', label: 'Large (250–400mm)', minMm: 250, maxMm: 400 },
  { id: 'xl', label: 'XL (400mm+)', minMm: 400, maxMm: Infinity },
]

/** Longest edge in mm → bucket id. Null when no usable dims. */
export function sizeBucketFor(dims?: Partial<Dimensions> | null): string | null {
  if (!dims) return null
  const edges = [dims.widthMm, dims.heightMm, dims.depthMm].filter((n): n is number => typeof n === 'number' && n > 0)
  if (edges.length === 0) return null
  const longest = Math.max(...edges)
  return SIZE_BUCKETS.find((b) => longest >= b.minMm && longest < b.maxMm)?.id ?? null
}

// ── Library item (structural subset of MockupAsset for browse) ────────────────
export interface MockupLibraryItem {
  id: string
  structuralType: StructuralPackType
  categorySlug?: string | null
  styleTags: string[]
  kind: MockupAssetKind
  isPremium: boolean
  designAware: boolean
  /** Precomputed size bucket (from dims) or derivable; null = unsized. */
  sizeBucket?: string | null
  title?: string | null
}

export interface LibraryFilter {
  structuralType?: StructuralPackType
  categorySlug?: string
  sizeBucket?: string
  /** Any-of (OR within the facet): item matches if it has ≥1 of these tags. */
  styleTags?: string[]
  kind?: MockupAssetKind
  premiumOnly?: boolean
  designAwareOnly?: boolean
  /** Free-text: matches title or any style tag (case-insensitive substring). */
  query?: string
}

export function matchesFilter(item: MockupLibraryItem, f: LibraryFilter): boolean {
  if (f.structuralType && item.structuralType !== f.structuralType) return false
  if (f.categorySlug && item.categorySlug !== f.categorySlug) return false
  if (f.sizeBucket && item.sizeBucket !== f.sizeBucket) return false
  if (f.kind && item.kind !== f.kind) return false
  if (f.premiumOnly && !item.isPremium) return false
  if (f.designAwareOnly && !item.designAware) return false
  if (f.styleTags && f.styleTags.length > 0) {
    if (!f.styleTags.some((t) => item.styleTags.includes(t))) return false
  }
  if (f.query && f.query.trim()) {
    const q = f.query.trim().toLowerCase()
    const hay = `${item.title ?? ''} ${item.styleTags.join(' ')}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export function filterLibrary(items: MockupLibraryItem[], f: LibraryFilter): MockupLibraryItem[] {
  return items.filter((i) => matchesFilter(i, f))
}

// ── Facet counts (inline per-value counts — the research browse affordance) ───
export interface FacetCounts {
  structuralType: Record<string, number>
  categorySlug: Record<string, number>
  sizeBucket: Record<string, number>
  styleTags: Record<string, number>
  kind: Record<string, number>
}

const bump = (rec: Record<string, number>, key: string | null | undefined) => {
  if (key == null) return
  rec[key] = (rec[key] ?? 0) + 1
}

/**
 * Count items per facet value. When `base` is given, counts reflect that
 * pre-filter (e.g. counts within the currently selected category) — the standard
 * faceted-search behaviour where each facet narrows the rest.
 */
export function facetCounts(items: MockupLibraryItem[], base?: LibraryFilter): FacetCounts {
  const scope = base ? filterLibrary(items, base) : items
  const out: FacetCounts = { structuralType: {}, categorySlug: {}, sizeBucket: {}, styleTags: {}, kind: {} }
  for (const it of scope) {
    bump(out.structuralType, it.structuralType)
    bump(out.categorySlug, it.categorySlug)
    bump(out.sizeBucket, it.sizeBucket)
    bump(out.kind, it.kind)
    for (const t of it.styleTags) bump(out.styleTags, t)
  }
  return out
}
