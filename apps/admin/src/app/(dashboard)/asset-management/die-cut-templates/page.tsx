// Admin — Die-cut Templates (Library). The canonical DieCutTemplate shapes (cut outlines)
// that partner die-lines normalize against, design templates target, and containers default
// to. Reuses the Packaging Studio library UX pattern, repointed at DieCutTemplate.
// See docs/DIE_CUT_TEMPLATES_MODULE.md. catalog:write-gated.

import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { loadDieCutTemplates } from './loader'
import { DieCutTemplatesClient } from './DieCutTemplatesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Die-cut Templates — Admin' }

export default async function DieCutTemplatesPage() {
  await requireCapability('catalog:write')
  const data = await loadDieCutTemplates()

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Packaging Studio"
        title="Die-cut Templates"
        description="The canonical die-cut shapes (cut outlines) products are built on — grouped by category, with the count of design templates, partner die-lines, and containers that use each. Container defaults are assigned in Container Die-lines."
      />
      <DieCutTemplatesClient data={data} />
    </div>
  )
}
