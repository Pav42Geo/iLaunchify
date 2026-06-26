import { listOverrides } from '../actions'
import { OverridesManager } from './OverridesManager'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Scoped Overrides — Admin' }

export default async function OverridesPage() {
  const overrides = await listOverrides()
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Order settings"
        title="Scoped Overrides"
        description={<>Override the global order economics for a specific creator tier, market, or region. Blank fields inherit the default. On conflict the most specific scope wins (tier &gt; market &gt; region).</>}
      />
      <OverridesManager initial={overrides} />
    </div>
  )
}
