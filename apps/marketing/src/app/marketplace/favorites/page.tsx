// /marketplace/favorites — the creator's favorites, rendered IN the marketplace
// body (docs/FAVORITES_MANAGEMENT.md §11). Full-width, NO product-filter rail —
// the favorites view replaces the catalog, keeping the creator in the
// marketplace. Shares the FavoriteRow component with the profile /favorites.

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { getMarketingSession, headerPropsFromSession } from '@/lib/session'
import { loadActiveNiches } from '@/lib/niches-db'
import { getMarketplaceFavoriteRows } from '../favorites-actions'
import { FavoritesPageBody } from './FavoritesPageBody'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your favorites — iLaunchify' }

export default async function MarketplaceFavoritesPage() {
  const session = await getMarketingSession()
  const { user, brands, activeBrandId } = headerPropsFromSession(session)
  const [niches, data] = await Promise.all([loadActiveNiches(), getMarketplaceFavoriteRows()])

  return (
    <>
      <MarketplaceHeader
        user={user}
        brands={brands}
        activeBrandId={activeBrandId}
        hasUnreadNotifications={false}
        niches={niches}
      />

      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <nav className="mb-4 flex items-center gap-1 text-[13px] text-ink-500" aria-label="Breadcrumb">
          <Link href="/marketplace" className="hover:text-ink-900">
            Marketplace
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-medium text-ink-900">Favorites</span>
        </nav>

        <FavoritesPageBody templateRows={data.templateRows} productRows={data.productRows} />
      </div>
    </>
  )
}
