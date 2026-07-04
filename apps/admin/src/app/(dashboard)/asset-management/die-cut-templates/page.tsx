// Admin — Die-cut Templates (Library). The canonical DieCutTemplate shapes (cut outlines)
// that partner die-lines normalize against, design templates target, and containers default
// to. Reuses the Packaging Studio library UX pattern, repointed at DieCutTemplate.
// See docs/DIE_CUT_TEMPLATES_MODULE.md. catalog:write-gated.

import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { loadDieCutTemplates, loadContainerAssignments } from './loader'
import { DieCutModuleClient } from './DieCutModuleClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Die-cut Templates — Admin' }

export default async function DieCutTemplatesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireCapability('catalog:write')
  const [{ tab }, library, assignments] = await Promise.all([
    searchParams,
    loadDieCutTemplates(),
    loadContainerAssignments(),
  ])

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Packaging Studio"
        title="Die-cut Templates"
        description="The canonical die-cut shapes (cut outlines) products are built on. The Library tab manages the shapes; Container assignments sets each container's default die-cut + domains."
      />
      <DieCutModuleClient
        library={library}
        assignments={assignments}
        initialTab={tab === 'containers' ? 'containers' : 'library'}
      />
    </div>
  )
}
