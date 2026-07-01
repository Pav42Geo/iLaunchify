// Admin Packaging Studio — surface authoring route (ADMIN_PACKAGING_STUDIO.md P2).
// Admin-gated; lives in the creator app so it can reuse the studio chrome later. Reached
// from the admin library ("Author 3D surfaces") via the /go/packaging-studio bridge which
// establishes the creator session first.

import { requireCapability } from '@ilaunchify/auth'
import { loadPackagingAuthoring } from './loader'
import { SurfaceAuthoringClient } from './SurfaceAuthoringClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packaging surfaces — Admin' }

export default async function PackagingAuthoringPage({
  searchParams,
}: {
  searchParams: Promise<{ packagingTypeId?: string }>
}) {
  await requireCapability('catalog:write')
  const { packagingTypeId } = await searchParams
  const data = packagingTypeId ? await loadPackagingAuthoring(packagingTypeId) : null

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-600">
          Packaging model not found. Open one from the admin Packaging Studio library.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <SurfaceAuthoringClient data={data} />
    </div>
  )
}
