// Admin Packaging Studio — visual model library (ADMIN_PACKAGING_STUDIO.md P1).
// A categorized, visual entry point to packaging models: 3D-source, surface + die-line
// counts. The 3D authoring canvas (define surfaces, import glTF, bind die-lines, click
// a surface → 2D Fabric editor) lands in P2. catalog:write-gated.

import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { loadPackagingModels } from './loader'
import { PackagingLibraryClient } from './PackagingLibraryClient'

export const dynamic = 'force-dynamic'

export default async function PackagingStudioPage() {
  await requireCapability('catalog:write')
  const data = await loadPackagingModels()

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Packaging Studio"
        title="3D Models & Surfaces"
        description="Visual management for packaging models — 3D mockups, clickable label surfaces, and die-lines organized by category. Create a model here; author its 3D surfaces next."
      />
      <PackagingLibraryClient data={data} />
    </div>
  )
}
