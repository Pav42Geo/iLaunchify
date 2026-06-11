import { Layers } from 'lucide-react'
import { listOverrides } from '../actions'
import { OverridesManager } from './OverridesManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Scoped Overrides — Admin' }

export default async function OverridesPage() {
  const overrides = await listOverrides()
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-ink-200 bg-[#F3EFE8] px-6 py-6">
        <div className="flex items-center gap-2 text-pink-700">
          <Layers className="h-5 w-5" />
          <span className="text-[11px] font-semibold uppercase tracking-widest">Order settings</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">Scoped Overrides</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Override the global order economics for a specific creator tier, market, or region. Blank fields
          inherit the default. On conflict the most specific scope wins (tier &gt; market &gt; region).
        </p>
      </header>
      <OverridesManager initial={overrides} />
    </div>
  )
}
