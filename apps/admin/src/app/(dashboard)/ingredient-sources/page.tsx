import { Database, ToggleRight, Radio, HardDrive, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
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
      {/* Cream hero band + KPI strip (v2 admin pattern — matches /tiers) */}
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
            <Database className="h-3 w-3" /> Integrations · Ingredient data
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Ingredient Data Sources
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            Manage how each source is consulted — <b>Mirror</b> (DB copy), <b>Live</b> (external API), or{' '}
            <b>Hybrid</b> (live + snapshot) — with auto-failover to the mirrored copy if a live API is down. The
            ingredient search adapter reads these per product domain.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Sources" value={total} icon={Database} />
          <KpiCard label="Enabled" value={enabled} icon={ToggleRight} tone="emerald" />
          <KpiCard label="Live / Hybrid" value={liveOrHybrid} icon={Radio} tone="sky" />
          <KpiCard label="With failover" value={failover} icon={Workflow} tone="amber" />
          <KpiCard label="Mirrored rows" value={mirroredRows} icon={HardDrive} />
        </div>
      </div>

      <IngredientSourcesTable sources={sources} />
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  subline,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose'
  subline?: string
}) {
  const iconTone: Record<'amber' | 'emerald' | 'sky' | 'rose', string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    rose: 'bg-rose-100 text-rose-700',
  }
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', tone ? iconTone[tone] : 'bg-pink-100 text-pink-700')}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">{value.toLocaleString()}</p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </div>
  )
}
