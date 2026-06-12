import { Database, ToggleRight, Radio, HardDrive, Workflow } from 'lucide-react'
import { KpiWidget } from '@ilaunchify/ui'
import { getIngredientSourceConfigs } from './actions'
import { IngredientSourcesTable } from './IngredientSourcesTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ingredient data sources — Admin' }

export default async function IngredientSourcesPage() {
  const sources = await getIngredientSourceConfigs()
  const total = sources.length
  const enabled = sources.filter((s) => s.enabled).length
  const liveOrHybrid = sources.filter((s) => s.mode !== 'MIRROR').length
  const mirroredRows = sources.reduce((n, s) => n + s.rowCount, 0)
  const failover = sources.filter((s) => s.mode !== 'MIRROR' && s.failoverToDb).length

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-ink-200 bg-[#F3EFE8] px-6 py-6">
        <div className="flex items-center gap-2 text-pink-700">
          <Database className="h-5 w-5" />
          <span className="text-[11px] font-semibold uppercase tracking-widest">Ingredient data</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">Ingredient Data Sources</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Manage how each ingredient source is consulted — <b>Mirror</b> (DB copy), <b>Live</b> (external API), or
          <b> Hybrid</b> (live + snapshot) — with auto-failover to the mirrored copy if a live API is down. The
          ingredient search adapter reads these per product domain.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiWidget label="Sources" value={total} icon={Database} tone="ink" />
        <KpiWidget label="Enabled" value={enabled} icon={ToggleRight} tone="success" />
        <KpiWidget label="Live / Hybrid" value={liveOrHybrid} icon={Radio} tone="info" />
        <KpiWidget label="With failover" value={failover} icon={Workflow} tone="warning" />
        <KpiWidget label="Mirrored rows" value={mirroredRows} icon={HardDrive} tone="ink" />
      </div>

      <IngredientSourcesTable sources={sources} />
    </div>
  )
}
