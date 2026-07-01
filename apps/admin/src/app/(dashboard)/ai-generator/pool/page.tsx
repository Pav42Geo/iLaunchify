// Admin — AI generated-templates pool (AI_PACKAGING_GENERATOR §8).
// Browse EVERY creator generation, shortlist ("feature"), and promote the best into
// the Starter (premium) gallery. Follows the locked admin surface (hero band + KPI
// strip + filter chips + gallery). catalog:write-gated.

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
        description="Every AI concept creators have generated. Shortlist the strongest and promote them into the Starter gallery."
      />
      <PoolClient data={data} creatorUrl={creatorUrl} />
    </div>
  )
}
