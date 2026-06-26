// Admin — bulk JSON import for the asset library (C7). Packaging symbols,
// labeling symbols, and certificate variants.

import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ImportPanel } from './ImportPanel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Bulk import — Asset library — Admin' }

export default function AssetImportPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Asset Management · Bulk import"
        title="Bulk import"
        description="Seed or update the asset catalogs from JSON. Idempotent — re-running the same payload updates existing rows and appends only new variants."
      />

      <ImportPanel />
    </div>
  )
}
