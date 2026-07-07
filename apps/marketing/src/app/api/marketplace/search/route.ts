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
import { getMarketplaceTemplates } from '@/lib/templates'
import { templateToCardProps } from '@/lib/sample-templates'
import {
  matchCategories,
  matchNiches,
  querySuggestions,
  didYouMean,
  type SearchProduct,
  type SearchResponse,
} from '@/lib/marketplace-search'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** How many product rows the dropdown shows (mobile-friendly ceiling). */
const PRODUCT_LIMIT = 6

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  // Empty query → the client renders recent + trending locally; return an empty
  // shell so a stray fetch is cheap and consistent.
  if (q.length < 1) {
    const empty: SearchResponse = {
      query: '',
      products: [],
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
    const { templates } = await getMarketplaceTemplates({ q, take: PRODUCT_LIMIT })
    products = templates.map((t) => {
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
    })
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
