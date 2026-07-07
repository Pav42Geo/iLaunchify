/**
 * Marketplace instant-search — shared, framework-agnostic helpers.
 *
 * This module is imported by BOTH the server route
 * (app/api/marketplace/search/route.ts) and the client component
 * (components/MarketplaceSearchBar.tsx), so it must stay free of `server-only`
 * and of any Prisma / Node imports. Product matching against the DB happens in
 * the route via getMarketplaceTemplates(); the pure helpers here cover:
 *
 *   - typo-tolerant text matching (Levenshtein) for categories + niches,
 *   - a "did you mean" corrector for zero-result queries,
 *   - the highlight tokenizer the client uses to <mark> matched substrings
 *     (returns data, never HTML — no dangerouslySetInnerHTML),
 *   - the curated trending-query list shown on empty focus.
 *
 * Design note (docs/MARKETPLACE_DESIGN.md §7): the marketplace is URL-driven.
 * These helpers only shape the typeahead panel; selecting a result still routes
 * to the same ?q= / ?niche= / category URLs the filters already use.
 */

import { NICHES } from './niches'
import { CATEGORY_TREE } from './category-tree'

/* ============ response shapes (shared server ⇄ client) ============ */

export interface SearchProduct {
  slug: string
  title: string
  /** Category display name (e.g. "Coffee & Tea"). */
  niche: string
  categorySlug: string
  subcategorySlug?: string
  /** Pre-computed detail href. */
  href: string
  /** Emoji fallback icon. */
  icon: string
  /** Gradient token key for the thumbnail fallback (keyof productGradient). */
  gradient: string
  /** Real hero image URL when available; else undefined → gradient+emoji. */
  imageUrl?: string
  pricePerUnit: number
  minUnits: number
  leadTimeDays: number
  /** Up to 3 chip labels (lifestyle tags). */
  tags: string[]
  /** Earned manufacturer badge — 'TRUSTED' | 'PREMIER' | null. */
  badge: 'TRUSTED' | 'PREMIER' | null
}

export interface SearchCategory {
  slug: string
  name: string
  icon: string
  /** Route target for the chip. */
  href: string
}

export interface SearchNiche {
  slug: string
  name: string
  icon: string
  href: string
}

export interface SearchResponse {
  query: string
  products: SearchProduct[]
  categories: SearchCategory[]
  niches: SearchNiche[]
  /** Query suggestions ("Search for …") — the raw query plus close trending terms. */
  suggestions: string[]
  /** Present only when nothing matched but a close term exists. */
  didYouMean?: string
  /** Section title for the empty-focus product carousel — "Popular right now"
   *  globally, or "Popular in {Niche}" when the user is browsing a niche. */
  popularLabel?: string
}

/* ============ curated trending queries (empty-focus state) ============ */

export const TRENDING_QUERIES: readonly string[] = [
  'protein powder',
  'cold brew',
  'collagen gummies',
  'vegan snacks',
  'matcha',
  'electrolytes',
]

/* ============ text matching primitives ============ */

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Levenshtein edit distance (small strings — typeahead tokens). */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]!
}

/**
 * Score how well a single query token matches a target string. Word-level:
 * prefix hit is strongest, then substring, then typo tolerance (edit distance
 * scaled by token length so short tokens don't over-match). 0 = no match.
 */
export function tokenMatch(qt: string, text: string): number {
  if (!qt) return 0
  const words = normalize(text).split(' ')
  let best = 0
  for (const w of words) {
    if (!w) continue
    if (w.startsWith(qt)) best = Math.max(best, 2)
    else if (w.includes(qt)) best = Math.max(best, 1.4)
    else if (qt.length >= 4 && levenshtein(qt, w) <= 1) best = Math.max(best, 1)
    else if (qt.length >= 6 && levenshtein(qt, w) <= 2) best = Math.max(best, 0.7)
  }
  return best
}

/** Every query token must hit the target (AND across tokens). Returns 0 if any misses. */
export function scoreText(query: string, text: string): number {
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (!tokens.length) return 0
  let total = 0
  for (const t of tokens) {
    const s = tokenMatch(t, text)
    if (s === 0) return 0
    total += s
  }
  return total
}

/* ============ synonym / semantic expansion ============ */

/**
 * Curated CPG synonym groups. Any query token that matches a term in a group
 * pulls in the whole group as additional search terms, so intent words the
 * catalog doesn't literally use ("soda", "pre-workout", "candy") still surface
 * the right products, categories, and niches. Bidirectional by construction —
 * every term in a group expands to every other. Keep groups tight; over-broad
 * synonyms make search feel noisy.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['pre workout', 'preworkout', 'pre-workout', 'energy', 'pump', 'performance'],
  ['soda', 'sparkling', 'carbonated', 'seltzer', 'soft drink', 'fizzy'],
  ['coffee', 'cold brew', 'espresso', 'latte', 'nitro'],
  ['tea', 'matcha', 'herbal tea', 'chai'],
  ['candy', 'gummies', 'gummy', 'sweets', 'confectionery', 'chews'],
  ['protein', 'whey', 'plant protein'],
  ['supplement', 'supplements', 'vitamin', 'vitamins', 'capsule', 'softgel'],
  ['snack', 'snacks', 'bar', 'bars', 'chips', 'popcorn', 'granola'],
  ['immunity', 'immune', 'elderberry', 'vitamin c', 'zinc'],
  ['sleep', 'melatonin', 'relax', 'calm'],
  ['gut health', 'gut', 'prebiotic', 'probiotic', 'digestive'],
  ['keto', 'low carb', 'low-carb', 'ketogenic'],
  ['skincare', 'serum', 'beauty', 'skin', 'collagen'],
  ['beverage', 'drink', 'rtd', 'ready to drink', 'juice', 'smoothie'],
  ['chips', 'crisps'],
  ['pet', 'dog', 'cat', 'pet wellness', 'treats'],
  ['weight loss', 'slim', 'metabolism', 'fat burner'],
]

/**
 * Expand a query into the set of terms to match against: the (normalized)
 * original first, then every synonym pulled in by a matching group. Deduped and
 * capped so an over-connected query can't explode the search. The original
 * always leads, so direct matches keep ranking above synonym matches.
 */
export function expandQuery(query: string, cap = 8): string[] {
  const q = normalize(query)
  if (!q) return []
  const terms = new Set<string>([q])
  const qTokens = q.split(' ').filter(Boolean)
  for (const group of SYNONYM_GROUPS) {
    const hit = group.some((term) => {
      const t = normalize(term)
      // A group fires if the query contains the term, or (for single-word terms)
      // any query token matches it closely (prefix / typo).
      return q.includes(t) || qTokens.some((tok) => tokenMatch(tok, t) >= 1.4)
    })
    if (hit) for (const term of group) terms.add(normalize(term))
    if (terms.size >= cap) break
  }
  return [...terms].slice(0, cap)
}

/** Best score for `text` across an expanded term list (max, so any term can hit). */
function bestScore(terms: string[], text: string): number {
  let best = 0
  for (const t of terms) best = Math.max(best, scoreText(t, text))
  return best
}

/* ============ category + niche matchers (pure, in-memory) ============ */

export function matchCategories(query: string, limit = 4): SearchCategory[] {
  const terms = expandQuery(query)
  if (!terms.length) return []
  return CATEGORY_TREE.map((c) => {
      // Match against the category name AND its subcategory names, so "gummies"
      // surfaces Snacks & Confectionery via the candy-gummies subcategory.
      const hay = [c.name, ...c.subcategories.map((s) => s.name)].join(' ')
      return { c, score: bestScore(terms, hay) }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ c }) => ({
      slug: c.slug,
      name: c.name,
      icon: c.icon,
      href: `/marketplace/${c.slug}`,
    }))
}

export function matchNiches(query: string, limit = 3): SearchNiche[] {
  const terms = expandQuery(query)
  if (!terms.length) return []
  return NICHES.map((n) => {
      const hay = [n.name, n.shortName, ...n.subcategories].join(' ')
      return { n, score: bestScore(terms, hay) }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ n }) => ({
      slug: n.slug,
      name: n.name,
      icon: n.icon,
      href: `/marketplace?niche=${n.slug}`,
    }))
}

/** Display name for a category slug (empty-focus scope label). */
export function categoryName(slug: string): string | undefined {
  return CATEGORY_TREE.find((c) => c.slug === slug)?.name
}

/** Display name for a niche slug (empty-focus scope label). */
export function nicheName(slug: string): string | undefined {
  return NICHES.find((n) => n.slug === slug)?.name
}

/** Niches to show as "Browse by niche" chips on empty focus. */
export function browseNiches(limit = 6): SearchNiche[] {
  return NICHES.slice(0, limit).map((n) => ({
    slug: n.slug,
    name: n.name,
    icon: n.icon,
    href: `/marketplace?niche=${n.slug}`,
  }))
}

/* ============ "did you mean" corrector ============ */

const CORRECTION_VOCAB: readonly string[] = [
  ...TRENDING_QUERIES,
  'protein',
  'coffee',
  'matcha',
  'gummies',
  'collagen',
  'snacks',
  'chocolate',
  'granola',
  'supplements',
  'beverages',
  'wellness',
  'energy',
  'beauty',
  'gourmet',
]

/** Closest vocab term to the (first token of the) query, within edit distance 3. */
export function didYouMean(query: string): string | undefined {
  const first = normalize(query).split(' ')[0] ?? ''
  if (first.length < 3) return undefined
  let best: string | undefined
  let bestDist = 3
  for (const term of CORRECTION_VOCAB) {
    const cand = normalize(term).split(' ')[0] ?? ''
    const d = levenshtein(first, cand)
    if (d > 0 && d < bestDist) {
      bestDist = d
      best = term
    }
  }
  return best
}

/** Query suggestions for a non-empty query: the query itself + close trending terms. */
export function querySuggestions(query: string, limit = 2): string[] {
  const q = normalize(query)
  const trimmed = query.trim()
  if (!trimmed) return []
  const close = TRENDING_QUERIES.filter(
    (t) => t !== q && (t.includes(q) || scoreText(query, t) > 0),
  ).slice(0, limit)
  return [trimmed, ...close]
}

/* ============ highlight tokenizer (data, not HTML) ============ */

export interface HighlightSegment {
  text: string
  hit: boolean
}

/**
 * Split `text` into segments, marking the spans that prefix-match any query
 * token so the client can wrap them in <mark>. Case-insensitive; preserves the
 * original casing of `text`. Never returns HTML.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (!tokens.length) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const segments: HighlightSegment[] = []
  let i = 0
  let buffer = ''
  const flush = () => {
    if (buffer) {
      segments.push({ text: buffer, hit: false })
      buffer = ''
    }
  }
  while (i < text.length) {
    let matched = 0
    for (const t of tokens) {
      if (lower.startsWith(t, i)) {
        matched = t.length
        break
      }
    }
    if (matched > 0) {
      flush()
      segments.push({ text: text.slice(i, i + matched), hit: true })
      i += matched
    } else {
      buffer += text[i]
      i++
    }
  }
  flush()
  return segments
}
