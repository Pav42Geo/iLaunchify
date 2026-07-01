// Admin Packaging Studio — the full Step-4 studio (Design Studio Admin Mode look).
// Reached from the admin top-bar packaging icon via /go/packaging-studio (establishes the
// creator session first). Opens with a model picker in the Library drawer; pick a model
// (or arrive with ?packagingTypeId) to author its 3D surfaces + die-lines in place.

import { requireCapability } from '@ilaunchify/auth'
import { loadPackagingAuthoring, loadPackagingModelList } from './loader'
import { SurfaceAuthoringClient } from './SurfaceAuthoringClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packaging Studio — Admin' }

export default async function PackagingAuthoringPage({
  searchParams,
}: {
  searchParams: Promise<{ packagingTypeId?: string }>
}) {
  await requireCapability('catalog:write')
  const { packagingTypeId } = await searchParams
  const [data, models] = await Promise.all([
    packagingTypeId ? loadPackagingAuthoring(packagingTypeId) : Promise.resolve(null),
    loadPackagingModelList(),
  ])

  // The client renders the full-screen shared studio shell (fixed inset-0). When no model
  // is selected it shows the Library drawer picker; selecting one deep-links ?packagingTypeId.
  return <SurfaceAuthoringClient data={data} models={models} />
}
