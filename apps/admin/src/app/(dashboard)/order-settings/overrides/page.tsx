import { Layers } from 'lucide-react'
import { listOverrides } from '../actions'
import { OverridesManager } from './OverridesManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Scoped Overrides — Admin' }

export default async function OverridesPage() {
  const overrides = await listOverrides()
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500"><Layers className="h-3 w-3" /> Order settings</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">Scoped Overrides</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Override the global order economics for a specific creator tier, market, or region. Blank fields
          inherit the default. On conflict the most specific scope wins (tier &gt; market &gt; region).
        </p>
      </header>
      <OverridesManager initial={overrides} />
    </div>
  )
}
