/**
 * GET /api/marketplace/search?q=…  — instant-search (typeahead) endpoint.
 *
 * Federated response for the MarketplaceSearchBar dropdown: matching products
 * (from the real published catalog via getMarketplaceTemplates), plus
 * category + niche "jump to" chips and query suggestions matched in-memory.
 *
 * Products reuse the exact same query the /marketplace page uses, so search
 * results and the filtered grid stay consistent (same PUBLISHED scope, same
 * merit ranking). Categories/niches use the pure matchers in
 * lib/marketplace-search.ts so a query like "gummies" surfaces both products
 * and the Snacks & Confectionery category.
 *
 * Public — the marketplace has no auth gate. Kept dynamic + short-lived cache;
 * a real popularity/analytics rank is a follow-up (see PRINT/FEEDBACK specs).
 */

import { NextResponse } from 'next/server'
import { getMarketplaceTemplates, getTrendingTemplates } from '@/lib/templates'
import { templateToCardProps } from '@/lib/sample-templates'
import {
  matchCategories,
  matchNiches,
  querySuggestions,
  didYouMean,
  expandQuery,
  type SearchProduct,
  type SearchResponse,
} from '@/lib/marketplace-search'
import type { SampleTemplate } from '@/lib/sample-templates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** How many product rows the dropdown shows (mobile-friendly ceiling). */
const PRODUCT_LIMIT = 6
/** How many "Popular right now" products to show on empty focus. */
const POPULAR_LIMIT = 4

/** Map a catalog card template to the lightweight typeahead product shape. */
function toSearchProduct(t: SampleTemplate): SearchProduct {
  const card = templateToCardProps(t)
  return {
    slug: t.slug,
    title: t.title,
    niche: t.niche,
    categorySlug: t.categorySlug,
    subcategorySlug: t.subcategorySlug,
    href: card.href,
    icon: t.icon,
    gradient: (t.gradient ?? 'pink') as string,
    imageUrl: t.imageUrl,
    pricePerUnit: t.pricePerUnit,
    minUnits: t.minUnits,
    leadTimeDays: t.leadTimeDays,
    tags: (t.tags ?? []).slice(0, 3).map((tag) => tag.label),
    badge: t.manufacturerBadge ?? null,
  }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  // Empty query → return "Popular right now" products so the panel is useful the
  // instant it opens (recent + trending chips are added client-side). Never
  // throws: an empty products list just falls back to the chip-only panel.
  if (q.length < 1) {
    let popular: SearchProduct[] = []
    try {
      popular = (await getTrendingTemplates(POPULAR_LIMIT)).map(toSearchProduct)
    } catch (err) {
      console.warn('[marketplace/search] popular query failed:', (err as Error).message)
    }
    const empty: SearchResponse = {
      query: '',
      products: popular,
      categories: [],
      niches: [],
      suggestions: [],
    }
    return NextResponse.json(empty, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  let products: SearchProduct[] = []
  try {
    // Direct match first (original query). When that's thin, expand with
    // synonyms ("soda" → sparkling, "pre-workout" → energy) and merge, so intent
    // words the catalog doesn't literally use still surface products. The
    // original query's hits always lead; synonym hits fill in behind, deduped.
    const collected = new Map<string, SampleTemplate>()
    const addRows = (rows: SampleTemplate[]) => {
      for (const t of rows) {
        if (collected.size >= PRODUCT_LIMIT) break
        if (!collected.has(t.slug)) collected.set(t.slug, t)
      }
    }

    const direct = await getMarketplaceTemplates({ q, take: PRODUCT_LIMIT })
    addRows(direct.templates)

    if (collected.size < 3) {
      // Try up to 3 synonym terms (skip the original, which is first).
      for (const term of expandQuery(q).slice(1, 4)) {
        if (collected.size >= PRODUCT_LIMIT) break
        const more = await getMarketplaceTemplates({ q: term, take: PRODUCT_LIMIT })
        addRows(more.templates)
      }
    }

    products = [...collected.values()].map(toSearchProduct)
  } catch (err) {
    // Never fail the typeahead — degrade to category/niche matches only.
    console.warn('[marketplace/search] product query failed:', (err as Error).message)
  }

  const categories = matchCategories(q)
  const niches = matchNiches(q)

  const body: SearchResponse = {
    query: q,
    products,
    categories,
    niches,
    suggestions: querySuggestions(q),
  }

  // Zero results across the board → offer a spelling correction.
  if (!products.length && !categories.length && !niches.length) {
    const suggestion = didYouMean(q)
    if (suggestion) body.didYouMean = suggestion
  }

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
