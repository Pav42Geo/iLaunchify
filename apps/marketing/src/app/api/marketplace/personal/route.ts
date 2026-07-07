/**
 * GET /api/marketplace/personal — the logged-in creator's "For you" corpus.
 *
 * Returns the creator's favorited + previously-ordered templates (flagged
 * `saved` / `reorderedAt`) so the search bar can match them client-side as the
 * user types. Guests (or any failure) get an empty list — the search then
 * behaves exactly as the non-personalized version. Never throws into the client.
 */

import { NextResponse } from 'next/server'
import { getMarketingSession } from '@/lib/session'
import { getPersonalProducts } from '@/lib/personal-search'
import type { PersonalResponse } from '@/lib/marketplace-search'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const empty: PersonalResponse = { items: [] }
  try {
    const session = await getMarketingSession()
    if (!session?.user || session.user.role !== 'CREATOR') {
      return NextResponse.json(empty, { headers: { 'Cache-Control': 'no-store' } })
    }
    const items = await getPersonalProducts(session.user.id)
    return NextResponse.json({ items } satisfies PersonalResponse, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json(empty, { headers: { 'Cache-Control': 'no-store' } })
  }
}
