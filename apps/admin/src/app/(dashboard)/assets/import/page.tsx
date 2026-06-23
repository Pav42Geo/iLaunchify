// Admin — bulk JSON import for the asset library (C7). Packaging symbols,
// labeling symbols, and certificate variants.

import { ImportPanel } from './ImportPanel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Bulk import — Asset library — Admin' }

export default function AssetImportPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Asset Management · Bulk import
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Bulk import
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Seed or update the asset catalogs from JSON. Idempotent — re-running the same payload
          updates existing rows and appends only new variants.
        </p>
      </div>

      <ImportPanel />
    </div>
  )
}
