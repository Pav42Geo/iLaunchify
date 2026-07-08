// Favorites — the creator profile view (docs/FAVORITES_MANAGEMENT.md §11).
// Renders the SAME shared <FavoritesListView> as the in-marketplace favorites
// page, so the two surfaces are identical. Templates link out to the
// marketplace; the creator's own products stay in the dashboard.

import { FavoritesListView } from '@ilaunchify/ui'
import { marketingUrl } from '@/lib/marketing-url'
import { getCreatorFavoriteRows, toggleFavorite, setFavoriteNote } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Favorites — iLaunchify' }

export default async function FavoritesPage() {
  const { templateRows, productRows } = await getCreatorFavoriteRows()

  return (
    <FavoritesListView
      templateRows={templateRows}
      productRows={productRows}
      onRemove={toggleFavorite}
      onSaveNote={setFavoriteNote}
      browseHref={marketingUrl('/marketplace')}
    />
  )
}
