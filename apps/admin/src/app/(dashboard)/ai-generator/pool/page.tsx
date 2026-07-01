// Admin — AI generated-templates pool (AI_PACKAGING_GENERATOR §8).
// READ-ONLY window on every creator generation. Creator work stays the creator's:
// the admin can browse for reference and pull a design's STYLE into the generator for
// inspiration, but can never feature, promote, publish, or download creators' designs.
// Follows the locked admin surface (hero band + KPI strip). catalog:write-gated.

import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { loadGenerationPool } from './loader'
import { PoolClient } from './PoolClient'

export const dynamic = 'force-dynamic'

export default async function AiPoolPage() {
  await requireCapability('catalog:write')
  const data = await loadGenerationPool()
  const creatorUrl = process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Design Templates · AI"
        title="Generated templates pool"
        description="A read-only window on every AI concept creators have generated — browse for reference and pull a design's style into the generator for inspiration."
      />
      <PoolClient data={data} creatorUrl={creatorUrl} />
    </div>
  )
}
