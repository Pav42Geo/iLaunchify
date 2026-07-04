// Admin — PackagingType hub (detail). One container, everything the schema hangs off it:
// 3D model & surfaces, die-line files, 2D mockups, default die-cut. The "unify via the tool,
// not one mega-list" recommendation from docs/PACKAGING_ENTITY_MANAGEMENT_AUDIT.md.
// catalog:write-gated.

import { notFound } from 'next/navigation'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { loadPackagingTypeDetail } from './loader'
import { PackagingDetailClient } from './PackagingDetailClient'

export const dynamic = 'force-dynamic'

export default async function PackagingTypeHubPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('catalog:write')
  const { id } = await params
  const data = await loadPackagingTypeDetail(id)
  if (!data) notFound()

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Packaging Studio · Container"
        title={data.displayName}
        description="Everything for this container in one place — 3D model & surfaces, die-line files, 2D mockups, and its default die-cut. Global libraries (die-cut shapes, symbols, materials) stay shared and link in here."
      />
      <PackagingDetailClient data={data} />
    </div>
  )
}
