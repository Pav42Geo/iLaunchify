// Shared types for the AI template library (tabs + filters + favorites). Client-safe
// (types only) so both the server loaders and the client Library UI import them.

export type LibraryScope = 'this-product' | 'my-library' | 'starter'

/** One template card in the library grid — a creator generation or a starter (premium) template. */
export interface LibraryItem {
  id: string
  title: string
  /** R2 variation image / premium thumbnail. Placeholder tile when absent. */
  thumbnailUrl?: string
  /** LabelingDomain value (FOOD / DIETARY_SUPPLEMENT / …) for the domain filter. */
  domain: string
  /** Shape family for the "can I drop this on THIS die-line?" gate + shape filter. */
  containerCategory: string | null
  aspectBucket: string | null
  favorited: boolean
  /** Soft-hidden from the default library view (reversible). Generations only. */
  archived?: boolean
  createdAtIso: string
  source: 'GENERATION' | 'STARTER'
  /** Style facets for the style filter (from the stored brief / template tags). */
  styleTags?: string[]
  /** Reusable brief — only generations carry it ("use as inspiration" reload). */
  hasBrief?: boolean
  megapixels?: number
}

export interface ShapeKey {
  containerCategory: string | null
  aspectBucket: string | null
}

/** Can this template drop directly onto one of the given die-line shapes? Same container,
 *  and (if both aspect buckets are known) same bucket. Null container ⇒ inspiration-only. */
export function libraryItemMatchesShapes(item: Pick<LibraryItem, 'containerCategory' | 'aspectBucket'>, shapes: ShapeKey[]): boolean {
  if (!item.containerCategory) return false
  return shapes.some(
    (s) =>
      !!s.containerCategory &&
      s.containerCategory === item.containerCategory &&
      (!item.aspectBucket || !s.aspectBucket || item.aspectBucket === s.aspectBucket),
  )
}
