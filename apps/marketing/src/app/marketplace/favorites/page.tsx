// /marketplace/favorites — the creator's favorites, rendered IN the marketplace
// body (docs/FAVORITES_MANAGEMENT.md §11). Full-width, NO product-filter rail.
// Renders the shared <FavoritesListView> — identical to the profile /favorites.

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { FavoritesListView, type FavoritesRowData } from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { getMarketingSession, headerPropsFromSession } from '@/lib/session'
import { loadActiveNiches } from '@/lib/niches-db'
import {
  getMarketplaceFavoriteRows,
  removeFavorite,
  setFavoriteNote,
  createCollection,
  deleteCollection,
  renameCollection,
  moveFavoriteToCollection,
} from '../favorites-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your favorites — iLaunchify' }

export default async function MarketplaceFavoritesPage() {
  const session = await getMarketingSession()
  const { user, brands, activeBrandId } = headerPropsFromSession(session)
  const [niches, data] = await Promise.all([loadActiveNiches(), getMarketplaceFavoriteRows()])

  const templateRows: FavoritesRowData[] = data.templateRows.map((r) => ({
    key: `t:${r.templateId}`,
    kind: 'PRODUCT_TEMPLATE',
    targetId: r.templateId,
    href: r.href,
    title: r.title,
    icon: r.icon,
    metaLine: r.metaLine,
    priceCents: r.priceCents,
    priceSnapshotCents: r.priceSnapshotCents ?? undefined,
    savedLabel: r.savedLabel,
    note: r.note ?? undefined,
    rating: r.rating,
    manufacturerBadge: r.manufacturerBadge,
    certs: r.certs,
    flavorCount: r.flavorCount,
    sampleAvailable: r.sampleAvailable,
    unavailable: r.unavailable,
    kindTag: { label: 'Template', tone: 'template' },
    primaryAction: r.unavailable ? { label: 'View', href: r.href } : { label: 'Customize', href: r.href },
    secondaryLinks: r.sampleAvailable && !r.unavailable ? [{ label: 'Order sample', href: r.href }] : undefined,
    shareUrl: r.href, // relative — the view prepends the origin
    collectionId: r.collectionId,
  }))

  const productRows: FavoritesRowData[] = data.productRows.map((r) => ({
    key: `p:${r.productId}`,
    kind: 'PRODUCT',
    targetId: r.productId,
    href: r.href,
    title: r.title,
    metaLine: r.metaLine,
    savedLabel: r.savedLabel,
    note: r.note ?? undefined,
    secondaryNote: r.secondaryNote,
    kindTag: { label: 'Mine', tone: 'mine' },
    primaryAction: { label: 'Reorder', href: r.reorderHref },
    secondaryLinks: [{ label: 'Open in Studio', href: r.href }],
    collectionId: r.collectionId,
  }))

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

        <FavoritesListView
          templateRows={templateRows}
          productRows={productRows}
          onRemove={removeFavorite}
          onSaveNote={setFavoriteNote}
          browseHref="/marketplace"
          collections={data.collections}
          onCreateFolder={createCollection}
          onDeleteFolder={deleteCollection}
          onRenameFolder={renameCollection}
          onMoveToFolder={moveFavoriteToCollection}
        />
      </div>
    </>
  )
}
